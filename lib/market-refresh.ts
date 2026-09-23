import type { MarketOverview } from './market-data';

export function retainRefreshingSources(
  next: MarketOverview,
  previous?: MarketOverview,
) {
  if (!previous) return;
  for (const key of [
    'catalog',
    'prices',
    'markets',
    'supplies',
    'pools',
    'history',
    'circulation',
    'backpack',
    'valuations',
  ] as const) {
    // A refreshing or failed result can already contain newer observations.
    // Only an absent payload needs a fallback; preserve its original age.
    if (
      next[key]?.data == null &&
      previous[key]?.data != null
    ) {
      Object.assign(next, {
        [key]: { ...previous[key], stale: true, refreshing: next[key]?.refreshing },
      });
    }
  }
}
