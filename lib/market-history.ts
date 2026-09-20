import { marketCacheRows } from './market-cache';
import type { Pool } from './market-data';
import { tokenBatchKey } from './backpack-registry';
import { poolMetrics, POOL_POLICY_VERSION } from './stock-pools';
import { MARKET_BATCH_SIZE, TOKEN_REVIEW_DATE, type StockToken } from './tokens';

export type MarketDailyPoint = {
  day: string;
  observed_at: number;
  volume_24h: number | null;
  liquidity: number | null;
  pool_count: number;
  batch_count: number;
  policy_version: string;
};

type PoolCacheRow = {
  payload: string | null;
  fetched_at: number;
};

const poolAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const measurement = (value: unknown) =>
  value === null ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0);

// The same canonical batch identity as readMarketBatch. A changed registry
// cannot borrow old cache rows from an earlier set of verified tokens.
export async function marketPoolBatches(tokens: readonly StockToken[]) {
  const batches: { key: string; symbols: string[] }[] = [];
  for (let i = 0; i < tokens.length; i += MARKET_BATCH_SIZE) {
    const batch = tokens.slice(i, i + MARKET_BATCH_SIZE);
    batches.push({
      key: `dex-pools-${POOL_POLICY_VERSION}:${TOKEN_REVIEW_DATE}:${await tokenBatchKey(batch)}`,
      symbols: batch.map((token) => token.symbol),
    });
  }
  return batches;
}

// Exported pure boundary for deterministic outage, duplication and timestamp
// tests. An incomplete set never becomes a zero-volume historical point.
export function completeMarketActivity(
  batches: readonly { key: string; symbols: string[] }[],
  rows: ReadonlyMap<string, PoolCacheRow>,
  now: number,
): Omit<MarketDailyPoint, 'day' | 'policy_version'> | null {
  if (!batches.length) return null;
  const pools: Pool[] = [];
  const observed: number[] = [];
  for (const batch of batches) {
    const row = rows.get(batch.key);
    if (
      !row?.payload ||
      !Number.isSafeInteger(row.fetched_at) ||
      row.fetched_at > now ||
      now - row.fetched_at >= 300000
    ) return null;
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(row.payload);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return null;
      payload = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
    for (const symbol of batch.symbols) {
      const found = payload[symbol];
      if (!Array.isArray(found)) return null;
      for (const entry of found) {
        if (
          !entry ||
          typeof entry !== 'object' ||
          !poolAddress.test(entry.address) ||
          typeof entry.dex !== 'string' ||
          !measurement(entry.volume24h) ||
          !measurement(entry.liquidity)
        ) return null;
        pools.push(entry as Pool);
      }
    }
    observed.push(row.fetched_at);
  }
  // A market-wide observation is one coherent window, not old and new
  // batches stitched together after a partial provider outage.
  if (Math.max(...observed) - Math.min(...observed) > 180000) return null;
  const metrics = poolMetrics(pools);
  return {
    observed_at: Math.max(...observed),
    volume_24h: metrics.volume24h,
    liquidity: metrics.liquidity,
    pool_count: metrics.pools.length,
    batch_count: batches.length,
  };
}

export async function readMarketDailyActivity(
  database: D1Database,
  tokens: readonly StockToken[],
  now = Date.now(),
): Promise<MarketDailyPoint[]> {
  const day = new Date(now).toISOString().slice(0, 10);
  const existing = await database
    .prepare('SELECT policy_version FROM market_daily_activity WHERE day=?')
    .bind(day)
    .first<{ policy_version: string }>();
  if (existing?.policy_version !== POOL_POLICY_VERSION) {
    const batches = await marketPoolBatches(tokens);
    const rows = await marketCacheRows(database, batches.map((batch) => batch.key));
    const point = completeMarketActivity(batches, rows, now);
    if (
      point &&
      new Date(point.observed_at).toISOString().slice(0, 10) === day &&
      (point.volume_24h !== null || point.liquidity !== null)
    )
      await database
        .prepare(
          'INSERT INTO market_daily_activity (day,observed_at,volume_24h,liquidity,pool_count,batch_count,policy_version) VALUES (?,?,?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET observed_at=excluded.observed_at,volume_24h=excluded.volume_24h,liquidity=excluded.liquidity,pool_count=excluded.pool_count,batch_count=excluded.batch_count,policy_version=excluded.policy_version',
        )
        .bind(
          day,
          point.observed_at,
          point.volume_24h,
          point.liquidity,
          point.pool_count,
          point.batch_count,
          POOL_POLICY_VERSION,
        )
        .run();
  }
  const cutoff = new Date(now - 29 * 86400000).toISOString().slice(0, 10);
  return (
    await database
      .prepare(
        'SELECT day,observed_at,volume_24h,liquidity,pool_count,batch_count,policy_version FROM market_daily_activity WHERE day>=? AND policy_version=? ORDER BY day',
      )
      .bind(cutoff, POOL_POLICY_VERSION)
      .all<MarketDailyPoint>()
  ).results;
}
