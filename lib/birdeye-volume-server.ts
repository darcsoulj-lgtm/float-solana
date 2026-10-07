import { backpackRegistry, registryTokens } from './backpack-registry';
import { marketCacheRows } from './market-cache';
import type { MarketEnvironment } from './market-overview-server';
import { BIRDEYE_VOLUME_CU, BIRDEYE_VOLUME_MAX_BUDGET, birdeyeVolumeInterval, birdeyeVolumeKey, parseBirdeyeVolume, BIRDEYE_VOLUME_SNAPSHOT_KEY, BIRDEYE_VOLUME_ROUND_KEY, BIRDEYE_VOLUME_ROUND_MAX_MS, birdeyeVolumeMints, readBirdeyeVolumeSnapshot, type BirdeyeVolumeSnapshot } from './birdeye-volume';

const DAY = 86400000;
const LOCK = 'birdeye-schedule:v1';
class TokenVolumeUnavailable extends Error {}
export function birdeyeVolumeEnabled(env: MarketEnvironment) {
  const budget = Number(env.BIRDEYE_VOLUME_BUDGET_CU);
  return env.BIRDEYE_VOLUME_ENABLED === '1' && !!env.BIRDEYE_API_KEY && Number.isSafeInteger(budget) && budget >= BIRDEYE_VOLUME_CU && budget <= BIRDEYE_VOLUME_MAX_BUDGET;
}
// Atomic reservation BEFORE the request. Failed/time-out requests also count.
// A rolling 32-day cap avoids calendar-vs-provider billing-cycle resets.
export async function reserveBirdeyeUnits(db: D1Database, now: number, budget: number, units = BIRDEYE_VOLUME_CU) {
  if (!Number.isSafeInteger(budget) || budget < BIRDEYE_VOLUME_CU || budget > BIRDEYE_VOLUME_MAX_BUDGET || !Number.isSafeInteger(units) || units < BIRDEYE_VOLUME_CU) return false;
  const day = Math.floor(now / DAY) * DAY, key = 'birdeye-usage:v2:' + day;
  await db.prepare('INSERT OR IGNORE INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,\'0\',?,0)').bind(key, day).run();
  // Older counters reserved five CU per call. Reweight them conservatively to
  // seven; never reset usage when migrating the collector or the billing month.
  const reserved = await db.prepare(`UPDATE market_cache SET payload=CAST(CAST(payload AS INTEGER)+? AS TEXT)
    WHERE key=? AND (SELECT COALESCE(SUM(CASE WHEN key LIKE 'birdeye-usage:v1:%'
      THEN CAST((CAST(payload AS INTEGER)*7+4)/5 AS INTEGER) ELSE CAST(payload AS INTEGER) END),0) FROM market_cache
    WHERE (key LIKE 'birdeye-usage:v1:%' OR key LIKE 'birdeye-usage:v2:%') AND fetched_at>=?) + ? <= ? RETURNING key`)
    .bind(units, key, day - 31 * DAY, units, budget).first();
  return !!reserved;
}
export async function fetchBirdeyeVolume(key: string, mint: string, fetcher: typeof fetch, now: number) {
  const response = await fetcher('https://public-api.birdeye.so/defi/price_volume/single?address=' + encodeURIComponent(mint) + '&type=24h&ui_amount_mode=scaled', {
    headers: { 'X-API-KEY': key, 'x-chain': 'solana', Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    if ([400, 404, 422].includes(response.status)) throw new TokenVolumeUnavailable('Token unavailable');
    throw Error('Birdeye status ' + response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('Empty Birdeye response');
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 16000) throw Error('Oversized Birdeye response'); parts.push(chunk.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try { return parseBirdeyeVolume(JSON.parse(await new Blob(parts as BlobPart[]).text()), mint, now); }
  catch { throw new TokenVolumeUnavailable('Invalid token observation'); }
}
type VolumeRound = Omit<BirdeyeVolumeSnapshot, 'completedAt'> & { next: number };
const CHUNK = 12;
// Private scheduled service only. Progress is durable and invisible to readers.
// Reserve the whole pass before starting; a crash/failure cannot exceed its
// reservation because the cursor is fenced and advanced BEFORE each request.
export async function refreshBirdeyeVolumes(env: MarketEnvironment, now = Date.now(), fetcher: typeof fetch = fetch, pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  if (!birdeyeVolumeEnabled(env)) return;
  const owner = crypto.randomUUID(), budget = Number(env.BIRDEYE_VOLUME_BUDGET_CU);
  const lock = await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after
    WHERE market_cache.retry_after<=? RETURNING key`).bind(LOCK, owner, now, now + 120000, now).first();
  if (!lock) return;
  let status = 'ok', unavailable = 0, collected = 0, total = 0;
  const started = Date.now(), clock = () => now + Date.now() - started;
  const save = async (round: VolumeRound) => !!await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after)
    SELECT ?,?,?,0 WHERE EXISTS(SELECT 1 FROM market_cache WHERE key=? AND payload=?)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at RETURNING key`)
    .bind(BIRDEYE_VOLUME_ROUND_KEY, JSON.stringify(round), clock(), LOCK, owner).first();
  try {
    const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetcher, now, true);
    const tokens = [...new Map(registryTokens(registry).filter(t => t.issuer === 'backpack').map(t => [t.mint, t])).values()];
    const mints = birdeyeVolumeMints(tokens), interval = birdeyeVolumeInterval(mints.length, budget);
    total = mints.length;
    const rows = await marketCacheRows(env.DB, [BIRDEYE_VOLUME_ROUND_KEY, BIRDEYE_VOLUME_SNAPSHOT_KEY]);
    const published = rows.get(BIRDEYE_VOLUME_SNAPSHOT_KEY);
    let round: VolumeRound | null = null;
    try { round = JSON.parse(rows.get(BIRDEYE_VOLUME_ROUND_KEY)?.payload ?? 'null'); } catch { /* Start a new pass. */ }
    if (!round || round.version !== 1 || typeof round.id !== 'string' || !round.data ||
        JSON.stringify(round.mints) !== JSON.stringify(mints) || !Number.isSafeInteger(round.startedAt) ||
        round.startedAt > now || now - round.startedAt > BIRDEYE_VOLUME_ROUND_MAX_MS ||
        !Number.isSafeInteger(round.next) || round.next < 0 || round.next > mints.length) {
      const last = readBirdeyeVolumeSnapshot(tokens, published, interval, now);
      if (last.round && (published?.retry_after ?? 0) > now) return;
      if (!await reserveBirdeyeUnits(env.DB, now, budget, mints.length * BIRDEYE_VOLUME_CU)) { status = 'budget_exhausted'; return; }
      round = { version: 1, id: crypto.randomUUID(), mints, startedAt: now, next: 0, data: {} };
      if (!await save(round)) return;
    }
    for (let i = 0; i < CHUNK && round.next < mints.length; i++) {
      if (i) await pause(1100);
      if (Date.now() - started > 60000) break;
      const mint = mints[round.next++];
      if (!await save(round)) return;
      try {
        const value = await fetchBirdeyeVolume(env.BIRDEYE_API_KEY!, mint, fetcher, clock());
        round.data[mint] = value;
      } catch (error) {
        unavailable++;
        if (!(error instanceof TokenVolumeUnavailable)) status = 'source_unavailable';
      }
      if (!await save(round)) return;
      if (status !== 'ok') break;
    }
    collected = Object.keys(round.data).length;
    if (round.next === mints.length) {
      const completedAt = clock();
      const snapshot: BirdeyeVolumeSnapshot = { version: 1, id: round.id, mints, startedAt: round.startedAt, completedAt, data: round.data };
      const validated = readBirdeyeVolumeSnapshot(tokens, { payload: JSON.stringify(snapshot), fetched_at: completedAt, retry_after: 0 }, interval, completedAt);
      if (!validated.round || collected !== mints.length) { status = 'round_incomplete'; return; }
      // One transaction replaces both the aggregate source and compatibility
      // rows. All consumers switch together, never one token at a time.
      const fence = 'EXISTS(SELECT 1 FROM market_cache WHERE key=? AND payload=?)';
      const statements = [env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after)
        SELECT ?,?,?,? WHERE ${fence} ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after`)
        .bind(BIRDEYE_VOLUME_SNAPSHOT_KEY, JSON.stringify(snapshot), completedAt, completedAt + interval, LOCK, owner),
        ...mints.map(mint => env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after)
          SELECT ?,?,?,? WHERE ${fence} ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after`)
          .bind(birdeyeVolumeKey(mint), JSON.stringify(round!.data[mint]), round!.data[mint].collectedAt, completedAt + interval, LOCK, owner)),
        env.DB.prepare(`DELETE FROM market_cache WHERE key=? AND ${fence}`).bind(BIRDEYE_VOLUME_ROUND_KEY, LOCK, owner)];
      await env.DB.batch(statements);
    }
  } catch {
    status = 'internal_error';
  } finally {
    await env.DB.prepare('UPDATE market_cache SET payload=?,retry_after=? WHERE key=? AND payload=?')
      .bind(JSON.stringify({ status, unavailable, collected, total, checkedAt: clock() }), status === 'ok' ? Math.floor(now / 60000) * 60000 + 60000 : clock() + 12 * 3600000, LOCK, owner).run();
  }
}
