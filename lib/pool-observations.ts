import { poolMetrics } from './stock-pools';
import type { Pool, SourceResult } from './market-data';

export type PoolObservations = {
  kind: 'pool-observations-v1';
  data: Record<string, Pool[]>;
  asOf: Record<string, number>;
};
export type SavedPools = Record<string, Pool[]> | PoolObservations;

export function poolObservations(saved: SavedPools | null, observedAt: number | null): PoolObservations {
  if (saved?.kind === 'pool-observations-v1') return saved as PoolObservations;
  const data = (saved ?? {}) as Record<string, Pool[]>;
  return { kind: 'pool-observations-v1', data, asOf: Object.fromEntries(
    Object.keys(data).map(symbol => [symbol, observedAt ?? 0]),
  ) };
}

// An omitted token failed verification; only successful tokens get a new time.
export function mergePoolObservations(previous: PoolObservations, fresh: Record<string, Pool[]>, now: number): PoolObservations {
  if (!Object.keys(fresh).length) throw Error('No complete pool observations returned');
  return { kind: 'pool-observations-v1', data: { ...previous.data, ...fresh },
    asOf: { ...previous.asOf, ...Object.fromEntries(Object.keys(fresh).map(symbol => [symbol, now])) } };
}

export function poolSource(source: SourceResult<SavedPools>, now = Date.now()): SourceResult<Record<string, Pool[]>> {
  if (!source.data) return { ...source, data: null };
  const saved = poolObservations(source.data, source.fetchedAt);
  const times = Object.values(saved.asOf);
  const current = times.filter(t => t > 0 && t <= now && now - t < 300000);
  return { ...source, data: saved.data, asOf: saved.asOf,
    fetchedAt: times.length ? Math.min(...times) : source.fetchedAt,
    stale: source.stale || !current.length,
    error: current.length < times.length || Object.values(saved.data).some(pools => pools.some(pool => pool.unavailable || pool.delayed || pool.volumeDisputed))
      ? 'Some pool observations could not be refreshed.' : source.error };
}

// Detail pages use the same scheduled observation as the market list. Another
// token's missing data must not age or invalidate this token's fresh subset.
export function tokenPoolSource(source: SourceResult<Record<string, Pool[]>>, symbol: string, now = Date.now()): SourceResult<Pool[]> {
  const data = source.data?.[symbol] ?? null;
  const fetchedAt = source.asOf?.[symbol] ?? source.fetchedAt;
  const stale = !data || !fetchedAt || fetchedAt > now + 60000 || now - fetchedAt >= 300000;
  const partial = data && poolMetrics(data).partial;
  return { data, fetchedAt, stale, error: stale ? 'Pool data is temporarily unavailable.' : partial ? 'Some pools could not be refreshed.' : null };
}

// Independent HTTP reads can arrive out of order. Choose by observation time,
// never by response arrival or amount; keep unknown pools in the calculation.
export function latestTokenPoolSource(
  overview: SourceResult<Record<string, Pool[]>> | undefined,
  detail: SourceResult<Pool[]> | null,
  symbol: string,
  now = Date.now(),
): SourceResult<Pool[]> {
  const list = overview ? tokenPoolSource(overview, symbol, now) : null;
  const candidates = [list, detail].filter((source): source is SourceResult<Pool[]> =>
    !!source?.data && !!source.fetchedAt && source.fetchedAt <= now + 60000 &&
    now - source.fetchedAt <= 24 * 60 * 60 * 1000,
  );
  candidates.sort((a, b) => b.fetchedAt! - a.fetchedAt!);
  const latest = candidates[0];
  if (!latest) return {data:null,fetchedAt:null,stale:true,error:'Pool data is temporarily unavailable.'};
  return {...latest, stale:latest.stale || now - latest.fetchedAt! >= 300000};
}
