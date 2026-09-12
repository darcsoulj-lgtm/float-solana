import { TOKENS } from './tokens';
import { tokenObservation } from './token-observation';
import { fetchTokenPools, type MarketOverview, type Pool } from './market-data';
export const DASHBOARD_TOKENS = TOKENS.filter((t) => t.issuer === 'backpack');
export const PUBLIC_BATCH_SIZE = 10;
export const PUBLIC_BATCH_COUNT = Math.ceil(
  DASHBOARD_TOKENS.length / PUBLIC_BATCH_SIZE,
);
export async function fetchBackpackPools(
  tokens: typeof DASHBOARD_TOKENS,
  fetcher: typeof fetch = fetch,
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
          async (t) => [t.symbol, await fetchTokenPools(t, bounded)] as const,
        ),
    );
    for (const [symbol, pools] of rows) out[symbol] = pools;
  }
  return out;
}
const sumKnown = (values: (number | null)[]) => {
  const known = values.filter(
    (v): v is number => v !== null && Number.isFinite(v) && v >= 0,
  );
  return known.length ? known.reduce((sum, n) => sum + n, 0) : null;
};
export function backpackDashboard(
  data: MarketOverview | null,
  now = Date.now(),
) {
  const rows = DASHBOARD_TOKENS.map((token) => {
    const observation = tokenObservation(data, token.symbol, now);
    const poolTime =
      data?.pools.asOf?.[token.symbol] ?? data?.pools.fetchedAt ?? 0;
    const pools = [
      ...new Map(
        (data?.pools &&
        !data.pools.stale &&
        poolTime > 0 &&
        poolTime <= now + 60000 &&
        now - poolTime < 300000
          ? (data.pools.data?.[token.symbol] ?? [])
          : []
        ).map((p) => [p.address, p]),
      ).values(),
    ];
    return {
      token,
      ...observation,
      pools,
      dexVolume: sumKnown(pools.map((p) => p.volume24h)),
      poolLiquidity: sumKnown(pools.map((p) => p.liquidity)),
      listing: data?.catalog.stale
        ? undefined
        : data?.catalog.data?.find((l) => l.symbol === token.symbol),
    };
  });
  // A stock/stock pool may appear in both token rows. Count its volume and
  // reserves once at issuer level. Routed trades can still have multiple legs.
  const pools = [
    ...new Map(
      rows.flatMap((r) => r.pools.map((p) => [p.address, p] as const)),
    ).values(),
  ];
  return {
    rows,
    pools,
    volume: sumKnown(pools.map((p) => p.volume24h)),
    liquidity: sumKnown(pools.map((p) => p.liquidity)),
    mintedValue: sumKnown(rows.map((r) => r.issuedValue)),
    valued: rows.filter((r) => r.issuedValue !== null).length,
    volumeCovered: rows.filter((r) => r.dexVolume !== null).length,
    recentPools: rows
      .flatMap((r) =>
        r.pools
          .filter(
            (p) =>
              p.createdAt &&
              p.createdAt <= now &&
              now - p.createdAt < 30 * 86400000,
          )
          .map((p) => ({ ...p, symbol: r.token.symbol })),
      )
      .filter((p, i, a) => a.findIndex((v) => v.address === p.address) === i)
      .sort((a, b) => b.createdAt! - a.createdAt!)
      .slice(0, 5),
  };
}
export type BackpackDashboard = ReturnType<typeof backpackDashboard>;
