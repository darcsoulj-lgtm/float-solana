import { marketTokens } from './market-data';
import { type IssuerId } from './tokens';
import { tokenObservation, tokenValuation } from './token-observation';
import type { MarketOverview } from './market-data';

const sumKnown = (values: (number | null)[]) => {
  const known = values.filter(
    (v): v is number => v !== null && Number.isFinite(v) && v >= 0,
  );
  return known.length ? known.reduce((sum, n) => sum + n, 0) : null;
};
export function issuerDashboard(
  data: MarketOverview | null,
  issuer: IssuerId,
  now = Date.now(),
) {
  const rows = marketTokens(data)
    .filter((token) => token.issuer === issuer)
    .map((token) => {
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
        valuation: tokenValuation(observation, issuer),
        value: tokenValuation(observation, issuer).value,
        pools,
        // One neutral token-level definition for every issuer. Pool metrics
        // remain available for the expanded trading-pool inspection only.
        dexVolume: observation.onchainVolume24h,
        poolLiquidity: observation.onchainLiquidity,
        listing: data?.catalog.stale
          ? undefined
          : data?.catalog.data?.find((l) => l.symbol === token.symbol),
      };
    });
  return {
    rows,
    pools: rows.flatMap((r) => r.pools),
    // These are token sums, not a unique-trader or economic-order total.
    // A direct stock/stock pair can be represented in both token rows.
    volume: sumKnown(rows.map((r) => r.dexVolume)),
    liquidity: sumKnown(rows.map((r) => r.poolLiquidity)),
    mintedValue:
      issuer === 'xstocks' ? null : sumKnown(rows.map((r) => r.issuedValue)),
    value: sumKnown(rows.map((r) => r.value)),
    backpackVenueVolume: sumKnown(rows.map((r) => r.backpackVenueVolume24h)),
    backpackVenueVolumeCovered: rows.filter(
      (r) => r.backpackVenueVolume24h !== null,
    ).length,
    valueLabel: issuer === 'xstocks' ? 'Circulating value' : 'Minted value',
    delayed: rows.some(
      (r) =>
        r.value !== null &&
        (issuer === 'xstocks'
          ? !r.circulation
          : r.valuationTime
            ? now - r.valuationTime > 3600000
            : r.priceDelayed),
    ),
    valued: rows.filter((r) => r.value !== null).length,
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
