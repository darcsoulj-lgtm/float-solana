import type { Pool } from './market-data';

// Raydium's day.volume materially disagrees with rolling-24h indexer data on
// captured RWA pools. Until its window/filter/valuation semantics are reconciled,
// it may discover/verify pools but must not select, dispute or confirm volume.
// This also quarantines numerical evidence saved before the adapter repair.
export function comparablePoolVolume(pool: Pick<Pool, 'source'>) {
  return pool.source !== 'raydium';
}

export function qualifiedPoolVolume(pool: Pool) {
  return (
    comparablePoolVolume(pool) &&
    !pool.unavailable &&
    !pool.volumeDisputed &&
    typeof pool.volume24h === 'number' &&
    Number.isFinite(pool.volume24h) &&
    pool.volume24h >= 0
  );
}
