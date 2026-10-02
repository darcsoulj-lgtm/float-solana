import type { MarketOverview, Pool } from './market-data';

// Browser readers need observations, not collection/discovery identities.
// Keep every pool and its address so cross-token deduplication is unchanged.
// Full mint identities stay in canonical caches and the token-detail endpoint.
export function publicMarketPayload(data: MarketOverview): MarketOverview {
  const pool = (value: Pool): Pool => ({
    address: value.address, dex: value.dex, quote: value.quote,
    price: value.price, change24h: value.change24h,
    liquidity: value.liquidity, volume24h: value.volume24h, url: value.url,
    ...(value.source ? { source: value.source } : {}),
    ...(value.observedAt !== undefined ? { observedAt: value.observedAt } : {}),
    ...(value.origin ? { origin: value.origin } : {}),
    ...(value.unavailable ? { unavailable: value.unavailable } : {}),
    ...(value.delayed ? { delayed: value.delayed } : {}),
    ...(value.volumeDisputed ? { volumeDisputed: value.volumeDisputed } : {}),
  });
  return {
    ...data,
    pools: {
      ...data.pools,
      data: data.pools.data === null ? null : Object.fromEntries(
        Object.entries(data.pools.data).map(([symbol, pools]) => [symbol, pools.map(pool)]),
      ),
    },
  };
}
