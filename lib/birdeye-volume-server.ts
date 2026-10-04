import { backpackRegistry, registryTokens } from './backpack-registry';
import { marketCacheRows } from './market-cache';
import type { MarketEnvironment } from './market-overview-server';
import { BIRDEYE_VOLUME_CU, BIRDEYE_VOLUME_MAX_BUDGET, birdeyeVolumeInterval, birdeyeVolumeKey, parseBirdeyeVolume } from './birdeye-volume';

const DAY = 86400000;
const LOCK = 'birdeye-schedule:v1';
class TokenVolumeUnavailable extends Error {}
export function birdeyeVolumeEnabled(env: MarketEnvironment) {
  const budget = Number(env.BIRDEYE_VOLUME_BUDGET_CU);
  return env.BIRDEYE_VOLUME_ENABLED === '1' && !!env.BIRDEYE_API_KEY && Number.isSafeInteger(budget) && budget >= 5 && budget <= BIRDEYE_VOLUME_MAX_BUDGET;
}
// Atomic reservation BEFORE the request. Failed/time-out requests also count.
// A rolling 32-day cap avoids calendar-vs-provider billing-cycle resets.
export async function reserveBirdeyeUnits(db: D1Database, now: number, budget: number) {
  if (!Number.isSafeInteger(budget) || budget < 5 || budget > BIRDEYE_VOLUME_MAX_BUDGET) return false;
  const day = Math.floor(now / DAY) * DAY, key = 'birdeye-usage:v1:' + day;
  await db.prepare('INSERT OR IGNORE INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,\'0\',?,0)').bind(key, day).run();
  const reserved = await db.prepare(`UPDATE market_cache SET payload=CAST(CAST(payload AS INTEGER)+? AS TEXT)
    WHERE key=? AND (SELECT COALESCE(SUM(CAST(payload AS INTEGER)),0) FROM market_cache
    WHERE key LIKE 'birdeye-usage:v1:%' AND fetched_at>=?) + ? <= ? RETURNING key`)
    .bind(BIRDEYE_VOLUME_CU, key, day - 31 * DAY, BIRDEYE_VOLUME_CU, budget).first();
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
// Private scheduled service only. Public readers never invoke this function.
export async function refreshBirdeyeVolumes(env: MarketEnvironment, now = Date.now(), fetcher: typeof fetch = fetch) {
  if (!birdeyeVolumeEnabled(env)) return;
  const owner = crypto.randomUUID(), budget = Number(env.BIRDEYE_VOLUME_BUDGET_CU);
  const lock = await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after
    WHERE market_cache.retry_after<=? RETURNING key`).bind(LOCK, owner, now, now + 120000, now).first();
  if (!lock) return;
  let status = 'ok', unavailable = 0;
  const started = Date.now();
  try {
    const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetcher, now, true);
    const tokens = [...new Map(registryTokens(registry).filter(t => t.issuer === 'backpack').map(t => [t.mint, t])).values()];
    const interval = birdeyeVolumeInterval(tokens.length, budget);
    const rows = await marketCacheRows(env.DB, tokens.map(t => birdeyeVolumeKey(t.mint)));
    const due = tokens.filter(t => (rows.get(birdeyeVolumeKey(t.mint))?.retry_after ?? 0) <= now)
      .sort((a, b) => (rows.get(birdeyeVolumeKey(a.mint))?.fetched_at ?? 0) - (rows.get(birdeyeVolumeKey(b.mint))?.fetched_at ?? 0)).slice(0, 4);
    for (let i = 0; i < due.length; i++) {
      if (i) await new Promise(resolve => setTimeout(resolve, 1100));
      if (Date.now() - started > 90000) break;
      if (!await reserveBirdeyeUnits(env.DB, now, budget)) { status = 'budget_exhausted'; break; }
      const token = due[i], key = birdeyeVolumeKey(token.mint);
      try {
        const value = await fetchBirdeyeVolume(env.BIRDEYE_API_KEY!, token.mint, fetcher, now);
        await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after
          WHERE market_cache.fetched_at<=excluded.fetched_at`).bind(key, JSON.stringify(value), now, now + interval).run();
      } catch (error) {
        // A missing/invalid token must not block unrelated tokens. Only provider
        // outages, auth and rate limits pause the whole collector.
        unavailable++;
        if (!(error instanceof TokenVolumeUnavailable)) status = 'source_unavailable';
        await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?)
          ON CONFLICT(key) DO UPDATE SET retry_after=excluded.retry_after`).bind(key, now + interval).run();
        if (status === 'source_unavailable') break;
      }
    }
  } catch {
    status = 'internal_error';
  } finally {
    await env.DB.prepare('UPDATE market_cache SET payload=?,retry_after=? WHERE key=? AND payload=?')
      .bind(JSON.stringify({ status, unavailable, checkedAt: now }), now + (status === 'ok' ? 60000 : 12 * 3600000), LOCK, owner).run();
  }
}
