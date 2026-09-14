import type { MarketOverview } from './market-data';

// Give background providers time to finish before returning to normal polling.
// Six reads per pending batch at most; completed batches leave the queue.
export const MARKET_RECHECK_DELAYS = [2000, 4000, 6000, 8000, 10000] as const;

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
  ] as const) {
    // A refreshing result can already contain newer usable observations.
    // Only an absent payload needs a fallback; preserve its original age.
    if (
      next[key]?.refreshing &&
      next[key]?.data == null &&
      previous[key]?.data != null
    ) {
      Object.assign(next, { [key]: { ...previous[key], refreshing: true } });
    }
  }
}
