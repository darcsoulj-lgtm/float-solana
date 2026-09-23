import type { MarketOverview } from './market-data';
import { TOKEN_REVIEW_DATE } from './tokens';

// Only public market observations cross a reload. Never persist holdings or sessions.
const prefix = `float-public-market:v2:${TOKEN_REVIEW_DATE}:`;
const maxSnapshotAge = 24 * 60 * 60 * 1000;

export function savedMarketPages(storage: Pick<Storage, 'getItem' | 'removeItem'>, count: number) {
  const pages: MarketOverview[] = [];
  for (let batch = 0; batch < count; batch++) {
    const key = prefix + batch;
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const saved = JSON.parse(raw) as { savedAt?: number; page?: MarketOverview };
      if (
        !saved.savedAt || saved.savedAt > Date.now() + 60000 ||
        Date.now() - saved.savedAt > maxSnapshotAge ||
        !saved.page?.prices || !saved.page?.supplies || !saved.page?.pools
      ) {
        storage.removeItem(key);
        continue;
      }
      pages[batch] = saved.page;
    } catch {
      storage.removeItem(key);
    }
  }
  return pages;
}

export function saveMarketPage(
  storage: Pick<Storage, 'setItem'>,
  batch: number,
  page: MarketOverview,
) {
  if (!Number.isSafeInteger(batch) || batch < 0) return;
  // Explicit allowlist prevents future private response fields from entering storage.
  const publicPage = {
    registry: page.registry,
    totalBatches: page.totalBatches,
    catalog: page.catalog,
    markets: page.markets,
    backpack: page.backpack,
    prices: page.prices,
    pools: page.pools,
    supplies: page.supplies,
    circulation: page.circulation,
    valuations: page.valuations,
    history: page.history,
  };
  try {
    storage.setItem(prefix + batch, JSON.stringify({ savedAt: Date.now(), page: publicPage }));
  } catch {
    // Storage can be disabled or full. In-memory snapshots still work.
  }
}
