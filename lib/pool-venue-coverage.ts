import type { Pool } from './market-data';
import { isDirectPoolSource } from './pool-provider-adapters';

// This is a capability map, not a venue allowlist. Unknown venues discovered by
// indexers remain eligible under the existing exact-mint/pool identity policy.
const directVenues = new Set([
  'orca',
  'raydium',
  'meteora',
  'byreal',
  'pancakeswap-v3-solana',
]);
export function poolVenueCoverage(pools: readonly Pool[], now = Date.now()) {
  const unique = new Map<string, Pool>();
  for (const pool of pools) {
    const prior = unique.get(pool.address);
    if (!prior || (pool.observedAt ?? 0) > (prior.observedAt ?? 0))
      unique.set(pool.address, pool);
  }
  const venues = new Map<
    string,
    {
      venue: string;
      directSupported: boolean;
      pools: number;
      direct: number;
      indexed: number;
      delayed: number;
      unresolved: number;
    }
  >();
  for (const pool of unique.values()) {
    const row = venues.get(pool.dex) ?? {
      venue: pool.dex,
      directSupported: directVenues.has(pool.dex),
      pools: 0,
      direct: 0,
      indexed: 0,
      delayed: 0,
      unresolved: 0,
    };
    row.pools++;
    if (pool.unavailable || pool.volumeDisputed || pool.volume24h == null)
      row.unresolved++;
    else {
      if (isDirectPoolSource(pool)) row.direct++;
      else row.indexed++;
      if (
        !pool.observedAt ||
        pool.observedAt > now ||
        now - pool.observedAt > 15 * 60000 ||
        pool.delayed
      )
        row.delayed++;
    }
    venues.set(pool.dex, row);
  }
  const rows = [...venues.values()].sort((a, b) =>
    a.venue.localeCompare(b.venue),
  );
  return {
    uniquePools: unique.size,
    venues: rows,
    indexerOnlyVenues: rows
      .filter((r) => !r.directSupported)
      .map((r) => r.venue),
  };
}
