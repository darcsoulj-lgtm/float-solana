import type { Pool } from './market-data';
import { POOL_PROVIDERS, type PoolProvider } from './pool-provider-adapters';
import type { StockToken } from './tokens';
import {
  comparablePoolVolume,
  qualifiedPoolVolume,
} from './pool-volume-policy';

export const POOL_RETAIN_MS = 24 * 3600000;
export const POOL_HEALTH_MS = 15 * 60000;

// Identity-only discoveries are coverage gaps, not lost previously verified
// activity. Surface deterioration independently of whether publication succeeds.
export function poolCoverageRegressions(previous: readonly Pool[], current: readonly Pool[], now: number) {
  const served = new Map(current.map(pool => [pool.address, pool]));
  return [...new Map(previous.map(pool => [pool.address, pool])).values()]
    .filter(pool => qualifiedPoolVolume(pool) && validTime(pool, now) &&
      (pool.volume24h ?? 0) >= 1000 &&
      (!served.has(pool.address) || !qualifiedPoolVolume(served.get(pool.address)!)))
    .map(pool => pool.address);
}
const evidenceKey = (mint: string, provider: PoolProvider) =>
  `pool-evidence:${provider}:${mint}`;
const belongs = (p: Pool, token: StockToken) =>
  p.baseMint === token.mint || p.quoteMint === token.mint;
const validTime = (p: Pool, now: number) =>
  typeof p.observedAt === 'number' &&
  p.observedAt > 0 &&
  p.observedAt <= now &&
  now - p.observedAt <= POOL_RETAIN_MS;
const validVolume = qualifiedPoolVolume;

// Source evidence is recorded before the canonical resolver. It provides an
// independent address baseline without another token registry or valuation rule.
export async function recordPoolEvidence(
  db: D1Database,
  token: StockToken,
  provider: PoolProvider,
  fresh: Pool[],
  now: number,
) {
  const key = evidenceKey(token.mint, provider);
  const row = await db
    .prepare('SELECT payload FROM market_cache WHERE key=?')
    .bind(key)
    .first<{ payload: string | null }>();
  const previous: Pool[] = row?.payload ? JSON.parse(row.payload) : [];
  const byAddress = new Map<string, Pool>();
  for (const p of [...previous, ...fresh]) {
    if (
      !belongs(p, token) ||
      !validTime(p, now) ||
      (!validVolume(p) && (comparablePoolVolume(p) || p.unavailable))
    )
      continue;
    if (p.volume24h === 0 && p.liquidity === 0 && !byAddress.has(p.address))
      continue;
    const prior = byAddress.get(p.address);
    if (!prior || prior.observedAt! <= p.observedAt!)
      byAddress.set(p.address, p);
  }
  const pools = [...byAddress.values()]
    .sort((a, b) => b.observedAt! - a.observedAt!)
    .slice(0, 500);
  await db
    .prepare(
      'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at',
    )
    .bind(key, JSON.stringify(pools), now)
    .run();
}
export async function readPoolEvidence(
  db: D1Database,
  token: StockToken,
): Promise<Pool[]> {
  const rows = await Promise.all(
    POOL_PROVIDERS.map((provider) =>
      db
        .prepare('SELECT payload FROM market_cache WHERE key=?')
        .bind(evidenceKey(token.mint, provider))
        .first<{ payload: string | null }>(),
    ),
  );
  return rows.flatMap((row) =>
    row?.payload ? (JSON.parse(row.payload) as Pool[]) : [],
  );
}

// A missing response cannot erase a valid observation. Conflicting responses,
// confirmed zeros, expired values and other mints never use this fallback.
export function retainPoolValues(
  current: Pool[],
  previous: Pool[],
  token: StockToken,
  now: number,
): Pool[] {
  const prior = new Map<string, Pool>();
  for (const p of previous)
    if (belongs(p, token) && validTime(p, now) && validVolume(p)) {
      const old = prior.get(p.address);
      if (!old || old.observedAt! < p.observedAt!) prior.set(p.address, p);
    }
  return current.map((p) => {
    const old = prior.get(p.address);
    return (p.unavailable || p.volume24h == null) && !p.volumeDisputed && old
      ? { ...old, delayed: true }
      : p;
  });
}
export function poolObservationTime(pools: readonly Pool[], fallback: number) {
  const times = pools
    .filter(
      (p) =>
        !p.unavailable &&
        typeof p.observedAt === 'number' &&
        p.observedAt > 0 &&
        p.observedAt <= fallback,
    )
    .map((p) => p.observedAt!);
  return times.length ? Math.min(fallback, ...times) : fallback;
}
export type PoolHealth = {
  symbol: string;
  mint: string;
  status: 'healthy' | 'delayed' | 'unavailable' | 'pending';
  poolCount: number;
  observedAt: number | null;
  missing: string[];
  stale: string[];
  disputed: string[];
  retained: string[];
  duplicates: string[];
  repairPriority: number;
};
export function reconcilePoolCoverage(
  token: StockToken,
  canonical: Pool[],
  evidence: Pool[],
  now: number,
): PoolHealth {
  const baseline = new Map<string, Pool>();
  for (const p of evidence)
    if (belongs(p, token) && validTime(p, now) && validVolume(p)) {
      const old = baseline.get(p.address);
      if (!old || old.observedAt! < p.observedAt!) baseline.set(p.address, p);
    }
  const byAddress = new Map(canonical.map((p) => [p.address, p]));
  const missing = [...baseline.keys()].filter(
    (address) =>
      !byAddress.has(address) || !validVolume(byAddress.get(address)!),
  );
  for (const p of canonical)
    if (!validVolume(p) && !missing.includes(p.address))
      missing.push(p.address);
  const stale = canonical
    .filter(
      (p) =>
        validVolume(p) &&
        (!validTime(p, now) || now - p.observedAt! > POOL_HEALTH_MS),
    )
    .map((p) => p.address);
  const disputed = canonical
    .filter((p) => p.volumeDisputed)
    .map((p) => p.address);
  const retained = canonical.filter((p) => p.delayed).map((p) => p.address);
  const duplicates = [
    ...new Set(
      canonical
        .filter(
          (p, i) => canonical.findIndex((x) => x.address === p.address) !== i,
        )
        .map((p) => p.address),
    ),
  ];
  const observed = canonical.filter((p) => validVolume(p) && validTime(p, now));
  const observedAt = observed.length
    ? poolObservationTime(observed, now)
    : null;
  const status = !canonical.length
    ? 'pending'
    : !observed.length
      ? 'unavailable'
      : missing.length ||
          stale.length ||
          disputed.length ||
          retained.length ||
          duplicates.length
        ? 'delayed'
        : 'healthy';
  const impact = [
    ...new Set([...missing, ...stale, ...disputed, ...retained]),
  ].reduce(
    (sum, address) =>
      sum +
      (baseline.get(address)?.volume24h ??
        byAddress.get(address)?.volume24h ??
        0),
    0,
  );
  return {
    symbol: token.symbol,
    mint: token.mint,
    status,
    poolCount: byAddress.size,
    observedAt,
    missing,
    stale,
    disputed,
    retained,
    duplicates,
    repairPriority:
      duplicates.length * 1e12 +
      missing.length * 1e9 +
      disputed.length * 1e8 +
      stale.length * 1e7 +
      retained.length * 1e6 +
      impact,
  };
}

// Reserve half the discovery budget for fair rotation. A persistently broken
// source cannot monopolize the queue or prevent new listings being discovered.
export function recoveryDiscoveryQueue(
  fair: readonly string[],
  health: readonly PoolHealth[],
  attempted: ReadonlyMap<string, number>,
  now: number,
  limit = 8,
) {
  const repairs = health
    .filter(
      (h) =>
        h.repairPriority > 0 &&
        now - (attempted.get(h.mint) ?? 0) >= 10 * 60000,
    )
    .sort((a, b) => b.repairPriority - a.repairPriority)
    .slice(0, Math.floor(limit / 2))
    .map((h) => h.mint);
  return [...repairs, ...fair.filter((m) => !repairs.includes(m))].slice(
    0,
    limit,
  );
}
