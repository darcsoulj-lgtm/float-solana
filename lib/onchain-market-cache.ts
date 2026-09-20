import { marketCacheRows, cachedMarket } from './market-cache';
import { fetchTokenVolumes, type SourceResult, type TokenVolume } from './market-data';
import { tokenBatchKey } from './backpack-registry';
import { type StockToken } from './tokens';

export const ONCHAIN_MARKET_BATCH_SIZE = 30;
export const ONCHAIN_MARKET_BATCHES_PER_RUN = 3;
export const ONCHAIN_MARKET_REFRESH_MS = 60 * 60000;
export const ONCHAIN_MARKET_MAX_AGE_MS = 3 * 60 * 60000;
const ONCHAIN_MARKET_PREFIX = 'gecko-onchain-market-v2:';

const batches = (tokens: readonly StockToken[]) => {
  const result: StockToken[][] = [];
  for (let start = 0; start < tokens.length; start += ONCHAIN_MARKET_BATCH_SIZE)
    result.push(tokens.slice(start, start + ONCHAIN_MARKET_BATCH_SIZE) as StockToken[]);
  return result;
};

export async function onchainMarketKey(tokens: readonly StockToken[]) {
  return ONCHAIN_MARKET_PREFIX + (await tokenBatchKey(tokens));
}

type StoredRow = {
  payload: string | null;
  fetched_at: number;
  retry_after: number;
};

function decoded(row: StoredRow | undefined) {
  if (!row?.payload) return null;
  try {
    const value = JSON.parse(row.payload);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, TokenVolume>)
      : null;
  } catch {
    return null;
  }
}

// Reads are cache-only. Visitor traffic must never fan out to the public
// provider, otherwise its free quota is exhausted before a complete pass.
export async function readOnchainMarket(
  database: D1Database,
  tokens: readonly StockToken[],
  now = Date.now(),
): Promise<SourceResult<Record<string, TokenVolume>>> {
  const groups = batches(tokens);
  const keys = await Promise.all(groups.map(onchainMarketKey));
  const stored = await marketCacheRows(database, keys);
  const data: Record<string, TokenVolume> = {};
  const asOf: Record<string, number> = {};
  const timestamps: number[] = [];
  let missing = false;
  for (let index = 0; index < groups.length; index++) {
    const row = stored.get(keys[index]);
    const payload = decoded(row);
    const current =
      !!row &&
      !!payload &&
      row.fetched_at > 0 &&
      row.fetched_at <= now + 60000 &&
      now - row.fetched_at <= ONCHAIN_MARKET_MAX_AGE_MS;
    if (!current) {
      missing = true;
      continue;
    }
    timestamps.push(row.fetched_at);
    for (const token of groups[index]) {
      const metric = payload[token.symbol];
      if (!metric || metric.mint !== token.mint) continue;
      data[token.symbol] = metric;
      asOf[token.symbol] = row.fetched_at;
    }
  }
  return {
    data: Object.keys(data).length ? data : null,
    fetchedAt: timestamps.length ? Math.min(...timestamps) : null,
    stale: !timestamps.length,
    error: missing
      ? 'Some onchain market coverage is still updating.'
      : null,
    asOf,
  };
}

export async function refreshOnchainMarketBatch(
  database: D1Database,
  tokens: readonly StockToken[],
  now = Date.now(),
  fetcher: typeof fetch = fetch,
) {
  if (!tokens.length || tokens.length > ONCHAIN_MARKET_BATCH_SIZE)
    throw new Error('Invalid onchain market refresh batch');
  const key = await onchainMarketKey(tokens);
  return cachedMarket(
    database,
    key,
    ONCHAIN_MARKET_REFRESH_MS,
    () => fetchTokenVolumes(fetcher, undefined, tokens),
    now,
  );
}

export function onchainMarketBatches(tokens: readonly StockToken[]) {
  return batches(tokens);
}
