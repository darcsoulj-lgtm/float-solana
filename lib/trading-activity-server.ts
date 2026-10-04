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

// Private scheduled job, once per UTC day. Never collect providers or write
// history on a visitor request. A dated, unexpired observation is immutable.
export async function recordTradingActivity(env: MarketEnvironment, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0,10);
  // Switching providers must not let today's immutable pool snapshot block the
  // first token-turnover snapshot. Keep legacy pool history intact and separate.
  const marker = prefix + day + (birdeyeVolumeEnabled(env) ? ':turnover' : '');
  if (await env.DB.prepare('SELECT key FROM market_cache WHERE key=?').bind(marker).first()) return;
  const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, now, true);
  const data = await readMarketOverview(env, registryTokens(registry), registry, 'backpack');
  const point: TradingActivity | null = tradingActivity(data, now);
  // A last-good display is useful now, but must not become a new historical day.
  const maxAge = point?.basis === 'turnover' ? data.tokenVolumes!.intervalMs + 1800000 : 24 * 3600000;
  if (!point || now - point.oldestAt > maxAge ||
      new Date(point.newestAt).toISOString().slice(0,10) !== day || !validTradingActivity(point)) return;
  await env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO NOTHING')
    .bind(marker, JSON.stringify(point), now).run();
  await env.DB.prepare('DELETE FROM market_cache WHERE key>=? AND key<?')
    .bind(prefix, prefix + new Date(now-90*86400000).toISOString().slice(0,10)).run();
}
