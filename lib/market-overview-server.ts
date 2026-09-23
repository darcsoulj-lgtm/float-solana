import { marketCacheRows, marketSnapshot, cachedMarket, type CacheRow } from './market-cache';
import { readMarketBatch, emptySource } from './market-service';
import { tokenBatchKey } from './backpack-registry';
import { MARKET_BATCH_SIZE, TOKEN_REVIEW_DATE, type StockToken } from './tokens';
import { POOL_POLICY_VERSION } from './stock-pools';
import { CMC_REFRESH_MS, fetchTokenMarkets } from './cmc-data';
import { fetchOndoValues, ONDO_VALUE_MAX_AGE_MS } from './ondo-valuation';
import { circulationSnapshot } from './circulation-cache';
import type { RegistryStatus } from './token-registry';
import {
  MARKET_MAX_AGE_MS, BACKPACK_TICKER_REFRESH_MS,
  fetchCatalog, fetchBackpackMarkets, mergeMarketPages,
} from './market-data';

export type MarketEnvironment = { DB: D1Database; SOLANA_RPC_URL?: string; CMC_API_KEY?: string };
export const marketPartitions = (tokens: readonly StockToken[]) =>
  Array.from({ length: Math.ceil(tokens.length / MARKET_BATCH_SIZE) }, (_, index) =>
    tokens.slice(index * MARKET_BATCH_SIZE, (index + 1) * MARKET_BATCH_SIZE));

export async function marketGlobalKeys(tokens: readonly StockToken[]) {
  const suffix = await tokenBatchKey(tokens.filter((t) => t.issuer === 'backpack'));
  return {
    catalog: 'backpack-catalog-v2:' + TOKEN_REVIEW_DATE + ':' + suffix,
    markets: 'cmc-tokens-v2',
    backpack: 'backpack-tickers-v1:' + suffix,
    valuations: 'ondo-solana-value:v1:' + await tokenBatchKey(tokens.filter((t) => t.issuer === 'ondo')),
  };
}

// HTTP readers and scheduled refreshes share the same keys, adapters and TTLs.
export async function readMarketGlobals(
  env: MarketEnvironment,
  tokens: readonly StockToken[],
  cacheOnly = true,
  saved?: Map<string, CacheRow>,
) {
  const keys = await marketGlobalKeys(tokens);
  const rows = saved ?? await marketCacheRows(env.DB, Object.values(keys));
  const read = <T>(key: string, ttl: number, loader: () => Promise<T>, maxAge = Math.max(ttl, MARKET_MAX_AGE_MS)) =>
    cacheOnly
      ? marketSnapshot(env.DB, key, ttl, loader, () => {}, Date.now(), maxAge, rows.get(key) ?? null, false)
      : cachedMarket(env.DB, key, ttl, loader, Date.now(), rows.get(key) ?? null);
  const backpackTokens = tokens.filter((t) => t.issuer === 'backpack');
  // Sequential provider jobs avoid a burst of unrelated requests on every visit.
  const catalog = await read(keys.catalog, 300000, () => fetchCatalog(fetch, backpackTokens));
  const markets = await read(keys.markets, CMC_REFRESH_MS, () => fetchTokenMarkets(env.CMC_API_KEY));
  const backpack = await read(keys.backpack, BACKPACK_TICKER_REFRESH_MS, () => fetchBackpackMarkets(fetch, backpackTokens));
  const valuations = await read(keys.valuations, 600000, fetchOndoValues, ONDO_VALUE_MAX_AGE_MS);
  return { catalog, markets, backpack, valuations };
}

// One bulk D1 read replaces the browser's 15-page waterfall. No provider calls,
// wallet addresses, balances, or member records are involved in this response.
export async function readMarketOverview(
  env: MarketEnvironment,
  tokens: readonly StockToken[],
  registry: RegistryStatus,
) {
  const partitions = marketPartitions(tokens);
  const keys = (await Promise.all(partitions.map(async (batch) => {
    const suffix = TOKEN_REVIEW_DATE + ':' + await tokenBatchKey(batch);
    return ['llama-prices-v3:', 'solana-supplies-v4:', 'llama-history-v1:', `dex-pools-${POOL_POLICY_VERSION}:`]
      .map((prefix) => prefix + suffix);
  }))).flat();
  keys.push(...Object.values(await marketGlobalKeys(tokens)));
  const saved = await marketCacheRows(env.DB, keys);
  const [pages, globals, circulation] = await Promise.all([
    Promise.all(partitions.map(async (batch) => ({
      ...await readMarketBatch(env.DB, batch, { cacheOnly: true, saved }),
      catalog: emptySource([]), markets: emptySource({}),
    }))),
    readMarketGlobals(env, tokens, true, saved),
    circulationSnapshot(env.DB, () => {}, Date.now(), fetch, true),
  ]);
  return { ...mergeMarketPages(pages, true), ...globals, circulation, registry, totalBatches: partitions.length };
}
