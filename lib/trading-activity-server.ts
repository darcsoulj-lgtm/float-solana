import { backpackRegistry, registryTokens } from './backpack-registry';
import { readMarketOverview, type MarketEnvironment } from './market-overview-server';
import { tradingActivity, validTradingActivity, type TradingActivity } from './trading-activity';
import { POOL_POLICY_VERSION } from './stock-pools';
import { birdeyeVolumeEnabled } from './birdeye-volume-server';

const prefix = `trading-activity:v1:${POOL_POLICY_VERSION}:`;
export async function readTradingActivity(database: D1Database, now = Date.now()) {
  const cutoff = new Date(now - 89 * 86400000).toISOString().slice(0,10);
  const rows = await database.prepare('SELECT payload FROM market_cache WHERE key>=? AND key<? ORDER BY key LIMIT 180')
    .bind(prefix + cutoff, prefix + '\uffff').all<{payload:string|null}>();
  return rows.results.flatMap(row => {
    try { const p: unknown = JSON.parse(row.payload ?? 'null'); return validTradingActivity(p) && p.capturedAt <= now + 60000 ? [p] : []; }
    catch { return []; }
  });
}

// Private scheduled job. Keep the newest observed snapshot for each source
// day; neither visits nor midnight can manufacture a new observation.
export async function recordTradingActivity(env: MarketEnvironment, now = Date.now()) {
  const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, now, true);
  const data = await readMarketOverview(env, registryTokens(registry), registry, 'backpack');
  const point: TradingActivity | null = tradingActivity(data, now);
  // A last-good display is useful now, but must not become a new historical day.
  const maxAge = point?.basis === 'turnover' ? data.tokenVolumes!.intervalMs + 1800000 : 24 * 3600000;
  if (!point || now - point.oldestAt > maxAge || !validTradingActivity(point)) return;
  const marker = prefix + point.day + (birdeyeVolumeEnabled(env) ? ':turnover' : '');
  const saved = await env.DB.prepare('SELECT payload FROM market_cache WHERE key=?').bind(marker).first<{payload:string|null}>();
  try {
    const previous: unknown = JSON.parse(saved?.payload ?? 'null');
    if (validTradingActivity(previous) && previous.newestAt >= point.newestAt) return;
  } catch { /* A valid observation may repair a corrupt historical row. */ }
  // Fence concurrent hourly runs: an older source cannot overwrite newer data.
  await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,0)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at
    WHERE json_extract(excluded.payload,'$.newestAt') >
      CASE WHEN json_valid(market_cache.payload) THEN COALESCE(json_extract(market_cache.payload,'$.newestAt'),0) ELSE 0 END`)
    .bind(marker, JSON.stringify(point), now).run();
  await env.DB.prepare('DELETE FROM market_cache WHERE key>=? AND key<?')
    .bind(prefix, prefix + new Date(now-90*86400000).toISOString().slice(0,10)).run();
}
