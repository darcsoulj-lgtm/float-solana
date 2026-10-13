import { backpackRegistry, registryTokens } from './backpack-registry';
import { marketCacheRows } from './market-cache';
import type { MarketEnvironment } from './market-overview-server';
import { BIRDEYE_VOLUME_CU, BIRDEYE_VOLUME_MAX_BUDGET, birdeyeVolumeInterval, birdeyeVolumeKey, parseBirdeyeVolume, BIRDEYE_VOLUME_SNAPSHOT_KEY, BIRDEYE_VOLUME_ROUND_KEY, BIRDEYE_VOLUME_ROUND_MAX_MS, birdeyeVolumeMints, readBirdeyeVolumeSnapshot, type BirdeyeVolumeSnapshot } from './birdeye-volume';

const DAY = 86400000;
const LOCK = 'birdeye-schedule:v1';
class TokenVolumeUnavailable extends Error {
  constructor(readonly reason: 'not_reported' | 'not_indexed') { super(reason); }
}
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
    if (response.status === 404) throw new TokenVolumeUnavailable('not_indexed');
    throw Error('Birdeye status ' + response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('Empty Birdeye response');
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 16000) throw Error('Oversized Birdeye response'); parts.push(chunk.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const raw = JSON.parse(await new Blob(parts as BlobPart[]).text());
  // An explicit absent metric is provider coverage, not a fabricated zero.
  // Wrong identities, malformed replies and expired numeric observations fail.
  if (raw?.success === true && raw.data?.volumeUSD === null &&
      (raw.data.address === undefined || raw.data.address === mint) &&
      Number.isSafeInteger(raw.data.updateUnixTime) && raw.data.updateUnixTime > 0 && raw.data.updateUnixTime * 1000 <= now + 60000) {
    throw new TokenVolumeUnavailable('not_reported');
  }
  return parseBirdeyeVolume(raw, mint, now);
}
type VolumeRound = Omit<BirdeyeVolumeSnapshot, 'completedAt'> & { next: number; retries?: Record<string,number> };
const CHUNK = 6;
const MAX_RETRIES = 2;
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
  let status = 'ok', unavailable = 0, collected = 0, total = 0, retryAfter = 12 * 3600000;
  const started = Date.now(), clock = () => now + Date.now() - started;
  const save = async (round: VolumeRound) => !!await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after)
    SELECT ?,?,?,0 WHERE EXISTS(SELECT 1 FROM market_cache WHERE key=? AND payload=? AND retry_after>?)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at RETURNING key`)
    .bind(BIRDEYE_VOLUME_ROUND_KEY, JSON.stringify(round), clock(), LOCK, owner, clock()).first();
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
        !Number.isSafeInteger(round.next) || round.next < 0 || round.next > mints.length ||
        (round.retries !== undefined && (typeof round.retries !== 'object' || round.retries === null || Object.entries(round.retries).some(([mint,count]) => !mints.includes(mint) || !Number.isSafeInteger(count) || count < 1 || count > MAX_RETRIES)))) {
      const last = readBirdeyeVolumeSnapshot(tokens, published, interval, now);
      if (last.round && !last.pending?.length && (published?.retry_after ?? 0) > now) return;
      if (!await reserveBirdeyeUnits(env.DB, now, budget, mints.length * BIRDEYE_VOLUME_CU)) { status = 'budget_exhausted'; return; }
      round = { version: 1, id: crypto.randomUUID(), mints, startedAt: now, next: 0, data: {}, unavailable: {} };
      if (!await save(round)) return;
    }
    for (let i = 0; i < CHUNK; i++) {
      if (i) await pause(1100);
      if (Date.now() - started > 60000) break;
      // A cursor is advanced before the first request to prevent unreserved
      // retries after a crash. Repair holes explicitly, reserving each attempt.
      const missing = mints.slice(0,round.next).find(mint => !round!.data[mint] && !round!.unavailable?.[mint]);
      let mint: string;
      if (missing) {
        const retries = round.retries?.[missing] ?? 0;
        if (retries >= MAX_RETRIES) { status = 'round_incomplete'; break; }
        if (!await reserveBirdeyeUnits(env.DB,clock(),budget)) { status = 'budget_exhausted'; break; }
        (round.retries ??= {})[missing] = retries + 1;
        mint = missing;
      } else if (round.next < mints.length) mint = mints[round.next++];
      else break;
      if (!await save(round)) return;
      try {
        const value = await fetchBirdeyeVolume(env.BIRDEYE_API_KEY!, mint, fetcher, clock());
        round.data[mint] = value;
      } catch (error) {
        unavailable++;
        if (error instanceof TokenVolumeUnavailable) {
          (round.unavailable ??= {})[mint] = {mint, collectedAt: clock(), reason: error.reason};
        } else {
          status = 'source_unavailable';
          // Authentication failures retain their long cooldown. Transient
          // failures get at most two budgeted retries within this same pass.
          if (!(error instanceof Error && /^Birdeye status (401|403)$/.test(error.message)) &&
              (round.retries?.[mint] ?? 0) < MAX_RETRIES) retryAfter = 60000;
          console.error('Birdeye volume attempt failed',{mint,retries:round.retries?.[mint] ?? 0,
            code:error instanceof Error && /^Birdeye status \d+$/.test(error.message) ? error.message : 'invalid_or_failed_observation'});
        }
      }
      if (!await save(round)) return;
      if (status !== 'ok') break;
    }
    collected = Object.keys(round.data).length;
    if (status === 'ok' && round.next === mints.length) {
      const completedAt = clock();
      const snapshot: BirdeyeVolumeSnapshot = { version: 1, id: round.id, mints, startedAt: round.startedAt, completedAt, data: round.data, unavailable: round.unavailable };
      const validated = readBirdeyeVolumeSnapshot(tokens, { payload: JSON.stringify(snapshot), fetched_at: completedAt, retry_after: 0 }, interval, completedAt);
      if (!validated.round) { status = 'round_incomplete'; return; }
      // One transaction replaces both the aggregate source and compatibility
      // rows. All consumers switch together, never one token at a time.
      const fence = 'EXISTS(SELECT 1 FROM market_cache WHERE key=? AND payload=? AND retry_after>?)';
      const statements = [env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after)
        SELECT ?,?,?,? WHERE ${fence} ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after`)
        .bind(BIRDEYE_VOLUME_SNAPSHOT_KEY, JSON.stringify(snapshot), completedAt, completedAt + interval, LOCK, owner, completedAt),
        ...mints.filter(mint => round!.data[mint]).map(mint => env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after)
          SELECT ?,?,?,? WHERE ${fence} ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after`)
          .bind(birdeyeVolumeKey(mint), JSON.stringify(round!.data[mint]), round!.data[mint].collectedAt, completedAt + interval, LOCK, owner, completedAt)),
        ...mints.filter(mint => round!.unavailable?.[mint]).map(mint => env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after)
          SELECT ?,?,?,? WHERE ${fence} ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after`)
          .bind(birdeyeVolumeKey(mint), JSON.stringify(round!.unavailable![mint]), round!.unavailable![mint].collectedAt, completedAt + interval, LOCK, owner, completedAt)),
        env.DB.prepare(`DELETE FROM market_cache WHERE key=? AND ${fence}`).bind(BIRDEYE_VOLUME_ROUND_KEY, LOCK, owner, completedAt)];
      const results = await env.DB.batch(statements);
      if (results[0]?.meta?.changes !== 1) return;
      return true;
    }
  } catch {
    status = 'internal_error';
  } finally {
    await env.DB.prepare('UPDATE market_cache SET payload=?,retry_after=? WHERE key=? AND payload=? AND retry_after>?')
      .bind(JSON.stringify({ status, unavailable, collected, total, checkedAt: clock() }), status === 'ok' ? Math.floor(now / 60000) * 60000 + 60000 : clock() + retryAfter, LOCK, owner, clock()).run();
  }
}
