import { POOL_POLICY_VERSION } from './stock-pools';
import { cachedMarket, marketSnapshot, marketCacheRows } from './market-cache';
import { tokenBatchKey } from './backpack-registry';
import {
  MARKET_BATCH_SIZE,
  TOKEN_REVIEW_DATE,
  type StockToken,
} from './tokens';
import { fetchSupplies } from './token-supply';
import {
  fetchPrices,
  fetchHistoricalPrices,
  fetchPools,
  MARKET_REFRESH_MS,
  POOL_REFRESH_MS,
  MARKET_MAX_AGE_MS,
  type SourceResult,
} from './market-data';

export const emptySource = <T>(data: T): SourceResult<T> => ({
  data,
  fetchedAt: null,
  stale: false,
  error: null,
});

// Canonical partitions are independent of which screen/consumer asks for a token.
export function marketBatches(
  all: readonly StockToken[],
  requested: readonly StockToken[],
) {
  const wanted = new Set(requested.map((t) => t.mint));
  const batches: StockToken[][] = [];
  for (let i = 0; i < all.length; i += MARKET_BATCH_SIZE) {
    const batch = all.slice(i, i + MARKET_BATCH_SIZE);
    if (batch.some((t) => wanted.has(t.mint))) batches.push(batch);
  }
  return batches;
}

export async function readMarketBatch(
  database: D1Database,
  tokens: readonly StockToken[],
  options: {
    rpcUrl?: string;
    verifiedStocks?: readonly StockToken[];
    defer?: (work: Promise<unknown>) => void;
    pools?: boolean;
    history?: boolean;
  } = {},
) {
  const key = TOKEN_REVIEW_DATE + ':' + (await tokenBatchKey(tokens));
  const poolPrefix = `dex-pools-${POOL_POLICY_VERSION}:`;
  const prefixes = [
    'llama-prices-v3:',
    'solana-supplies-v4:',
    ...(options.history === false ? [] : ['llama-history-v1:']),
    ...(options.pools === false ? [] : [poolPrefix]),
  ];
  const saved = await marketCacheRows(
    database,
    prefixes.map((prefix) => prefix + key),
  );
  const read = <T>(prefix: string, ttl: number, loader: () => Promise<T>) =>
    options.defer
      ? marketSnapshot(
          database,
          prefix + key,
          ttl,
          loader,
          options.defer,
          Date.now(),
          MARKET_MAX_AGE_MS,
          saved.get(prefix + key) ?? null,
        )
      : cachedMarket(
          database,
          prefix + key,
          ttl,
          loader,
          Date.now(),
          saved.get(prefix + key) ?? null,
        );
  const [prices, supplies, history, pools] = await Promise.all([
    read('llama-prices-v3:', MARKET_REFRESH_MS, () =>
      fetchPrices(fetch, tokens),
    ),
    read('solana-supplies-v4:', MARKET_REFRESH_MS, () =>
      fetchSupplies(options.rpcUrl, fetch, tokens),
    ),
    options.history === false
      ? emptySource({})
      : read('llama-history-v1:', MARKET_REFRESH_MS, () =>
          fetchHistoricalPrices(fetch, tokens),
        ),
    options.pools === false
      ? emptySource({})
      : read(poolPrefix, POOL_REFRESH_MS, () =>
          fetchPools(fetch, tokens, options.verifiedStocks),
        ),
  ]);
  return { prices, supplies, history, pools };
}
