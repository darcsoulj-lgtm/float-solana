import { TOKENS } from './tokens';
import { issuerDashboard } from './issuer-dashboard';
import { fetchTokenPools, type MarketOverview, type Pool } from './market-data';
export const DASHBOARD_TOKENS = TOKENS.filter((t) => t.issuer === 'backpack');
export const PUBLIC_BATCH_SIZE = 10;
export const PUBLIC_BATCH_COUNT = Math.ceil(
  DASHBOARD_TOKENS.length / PUBLIC_BATCH_SIZE,
);
export async function fetchBackpackPools(
  tokens: typeof DASHBOARD_TOKENS,
  fetcher: typeof fetch = fetch,
  verifiedStocks: readonly (typeof TOKENS)[number][] = TOKENS,
) {
  const out: Record<string, Pool[]> = {};
  // Full per-token discovery, not the batch endpoint's best-pool subset.
  // Bound each shared cache job below its 20s refresh lease.
  const bounded: typeof fetch = (url, init) =>
    fetcher(url, { ...init, signal: AbortSignal.timeout(4000) });
  for (let i = 0; i < tokens.length; i += 3) {
    const rows = await Promise.all(
      tokens
        .slice(i, i + 3)
        .map(
          async (t) =>
            [
              t.symbol,
              await fetchTokenPools(t, bounded, verifiedStocks),
            ] as const,
        ),
    );
    for (const [symbol, pools] of rows) out[symbol] = pools;
  }
  return out;
}
export function backpackDashboard(
  data: MarketOverview | null,
  now = Date.now(),
) {
  return issuerDashboard(data, 'backpack', now);
}
export type BackpackDashboard = ReturnType<typeof backpackDashboard>;
