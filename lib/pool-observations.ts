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
    error: current.length < times.length ? 'Some pool observations could not be refreshed.' : source.error };
}
