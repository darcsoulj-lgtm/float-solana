import { poolObservationKey, overlayTokenPools } from './pool-inventory';
import { poolObservations, mergePoolObservations, poolSource, type SavedPools } from './pool-observations';
import { POOL_POLICY_VERSION } from './stock-pools';
import { cachedMarket, marketSnapshot, marketCacheRows, type CacheRow } from './market-cache';
import { tokenBatchKey } from './backpack-registry';
import {
  MARKET_BATCH_SIZE,
  TOKEN_REVIEW_DATE,
  type StockToken,
} from './tokens';
import { fetchSupplies } from './token-supply';
import { supplyObservationKey, overlaySupplyObservations } from './market-source-observations';
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
    poolRefreshMs?: number;
    poolLoader?: () => ReturnType<typeof fetchPools>;
    poolLeaseMs?: number;
    history?: boolean;
    cacheOnly?: boolean;
    fetcher?: typeof fetch;
    saved?: Map<string, CacheRow>;
  } = {},
) {
  // Preserve canonical cache identities while retiring non-Backpack collection.
  const active = tokens.filter(token => token.issuer === 'backpack');
  if (!active.length) options = { ...options, cacheOnly: true };
  const key = TOKEN_REVIEW_DATE + ':' + (await tokenBatchKey(tokens));
  const poolPrefix = `dex-pools-${POOL_POLICY_VERSION}:`;
  const prefixes = [
    'llama-prices-v3:',
    'solana-supplies-v4:',
    ...(options.history === false ? [] : ['llama-history-v1:']),
    ...(options.pools === false ? [] : [poolPrefix]),
  ];
  const saved = options.saved ?? await marketCacheRows(
    database,
    [...prefixes.map((prefix) => prefix + key), ...active.map(supplyObservationKey), ...(options.pools === false ? [] : active.map(poolObservationKey))],
  );
  const read = <T>(prefix: string, ttl: number, loader: () => Promise<T>) =>
    options.defer || options.cacheOnly
      ? marketSnapshot(
          database,
          prefix + key,
          ttl,
          loader,
          options.defer ?? (() => {}),
          Date.now(),
          MARKET_MAX_AGE_MS,
          saved.get(prefix + key) ?? null,
          !options.cacheOnly,
        )
      : cachedMarket(
          database,
          prefix + key,
          ttl,
          loader,
          Date.now(),
          saved.get(prefix + key) ?? null,
          prefix === poolPrefix ? options.poolLeaseMs : undefined,
          prefix === poolPrefix && !!options.poolLoader,
        );
  const [prices, supplies, history, pools] = await Promise.all([
    read('llama-prices-v3:', MARKET_REFRESH_MS, () =>
      fetchPrices(options.fetcher ?? fetch, active),
    ),
    read('solana-supplies-v4:', MARKET_REFRESH_MS, () =>
      fetchSupplies(options.rpcUrl, options.fetcher ?? fetch, active),
    ),
    options.history === false
      ? emptySource({})
      : read('llama-history-v1:', MARKET_REFRESH_MS, () =>
          fetchHistoricalPrices(options.fetcher ?? fetch, active),
        ),
    options.pools === false
      ? emptySource({})
      : read<SavedPools>(poolPrefix, options.poolRefreshMs ?? POOL_REFRESH_MS, async () => {
          const row = saved.get(poolPrefix + key);
          const previous = poolObservations(row?.payload ? JSON.parse(row.payload) as SavedPools : null, row?.fetched_at ?? null);
          const fresh = await (options.poolLoader?.() ?? fetchPools(options.fetcher ?? fetch, active, options.verifiedStocks?.filter(token => token.issuer === 'backpack')));
          return mergePoolObservations(previous, fresh, Date.now());
        }),
  ]);
  const observations = overlayTokenPools(poolObservations(pools.data, pools.fetchedAt), active, saved, Date.now());
  return { prices, supplies: overlaySupplyObservations(supplies, active, saved, Date.now()), history, pools: poolSource({...pools,
    data: Object.keys(observations.data).length ? observations : pools.data,
    // Per-token timestamps remain authoritative even when the legacy batch is stale.
    stale: Object.values(observations.asOf).some(time => Date.now() - time >= POOL_REFRESH_MS),
  }) };
}
