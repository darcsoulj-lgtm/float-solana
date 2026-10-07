import type { StockToken } from './tokens';
import type { MarketOverview } from './market-data';
import type { CacheRow } from './market-cache';

export const BIRDEYE_VOLUME_CU = 7;
export const BIRDEYE_VOLUME_MAX_BUDGET = 24000;
export const BIRDEYE_VOLUME_MAX_AGE = 72 * 3600000;
export const birdeyeVolumeKey = (mint: string) => 'birdeye-volume:v1:' + mint;
export const BIRDEYE_VOLUME_SNAPSHOT_KEY = 'birdeye-volume-snapshot:v1';
export const BIRDEYE_VOLUME_ROUND_KEY = 'birdeye-volume-round:v1';
export const BIRDEYE_VOLUME_ROUND_MAX_MS = 20 * 60000;
export type BirdeyeVolume = {
  mint: string; usd24h: number; observedAt: number; collectedAt: number;
};
export type BirdeyeVolumes = { source: 'birdeye'; intervalMs: number; round?: { id: string; startedAt: number; completedAt: number }; data: Record<string, BirdeyeVolume> };
export type BirdeyeVolumeSnapshot = { version: 1; id: string; mints: string[]; startedAt: number; completedAt: number; data: Record<string, BirdeyeVolume> };
export const birdeyeVolumeMints = (tokens: readonly StockToken[]) => [...new Set(tokens.filter(t => t.issuer === 'backpack').map(t => t.mint))].sort();

// Public readers accept one complete collection round for the current registry.
// A missing/new listing or damaged observation invalidates the entire round.
export function readBirdeyeVolumeSnapshot(tokens: readonly StockToken[], row: CacheRow | undefined, intervalMs: number, now: number): BirdeyeVolumes {
  const empty: BirdeyeVolumes = { source: 'birdeye', intervalMs, data: {} };
  try {
    const snapshot = JSON.parse(row?.payload ?? 'null') as BirdeyeVolumeSnapshot | null;
    const mints = birdeyeVolumeMints(tokens);
    if (!snapshot || snapshot.version !== 1 || typeof snapshot.id !== 'string' || !snapshot.id ||
        JSON.stringify(snapshot.mints) !== JSON.stringify(mints) || !mints.length ||
        !Number.isSafeInteger(snapshot.startedAt) || snapshot.startedAt <= 0 ||
        !Number.isSafeInteger(snapshot.completedAt) || snapshot.completedAt < snapshot.startedAt ||
        snapshot.completedAt > now + 60000 || row?.fetched_at !== snapshot.completedAt ||
        snapshot.completedAt - snapshot.startedAt > BIRDEYE_VOLUME_ROUND_MAX_MS ||
        !snapshot.data || Object.keys(snapshot.data).length !== mints.length) return empty;
    const data: Record<string, BirdeyeVolume> = {};
    for (const token of tokens.filter(t => t.issuer === 'backpack')) {
      const value = snapshot.data[token.mint];
      if (!value || value.mint !== token.mint || !Number.isFinite(value.usd24h) || value.usd24h < 0 ||
          !Number.isSafeInteger(value.collectedAt) || value.collectedAt < snapshot.startedAt || value.collectedAt > snapshot.completedAt ||
          !Number.isSafeInteger(value.observedAt) || value.observedAt <= 0 ||
          value.observedAt > value.collectedAt + 60000 ||
          now - value.observedAt > BIRDEYE_VOLUME_MAX_AGE) return empty;
      data[token.symbol] = value;
    }
    if (!Number.isFinite(Object.values(data).reduce((sum, value) => sum + value.usd24h, 0))) return empty;
    return { source: 'birdeye', intervalMs, round: { id: snapshot.id, startedAt: snapshot.startedAt, completedAt: snapshot.completedAt }, data };
  } catch { return empty; }
}
// Reserve 20% of the free allowance. Increase the interval as listings grow.
export function birdeyeVolumeInterval(count: number, budget = BIRDEYE_VOLUME_MAX_BUDGET) {
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(budget) || budget < BIRDEYE_VOLUME_CU || budget > BIRDEYE_VOLUME_MAX_BUDGET) throw Error('Invalid volume budget');
  const rounds = Math.floor(budget / (count * BIRDEYE_VOLUME_CU));
  if (rounds < 1) throw Error('Whole catalog exceeds volume budget');
  // Budget whole passes, not fractional passes; a 32-day window can include
  // the partial first/last day. Leave enough capacity for that final pass.
  return Math.max(12, Math.ceil(32 * 24 / rounds)) * 3600000;
}
export function parseBirdeyeVolume(raw: unknown, mint: string, now: number): BirdeyeVolume {
  const response = raw as { success?: unknown; data?: Record<string, unknown> } | null;
  const data = response?.data;
  const time = typeof data?.updateUnixTime === 'number' ? data.updateUnixTime * 1000 : NaN;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) || response?.success !== true || !data ||
      typeof data.volumeUSD !== 'number' || !Number.isFinite(data.volumeUSD) || data.volumeUSD < 0 ||
      !Number.isSafeInteger(time) || time <= 0 || time > now + 60000 || now - time > BIRDEYE_VOLUME_MAX_AGE ||
      (data.address !== undefined && data.address !== mint)) throw Error('Invalid Birdeye volume observation');
  return { mint, usd24h: data.volumeUSD, observedAt: time, collectedAt: now };
}
export function readBirdeyeVolumes(tokens: readonly StockToken[], rows: Map<string, CacheRow>, intervalMs: number, now: number): BirdeyeVolumes {
  const data: Record<string, BirdeyeVolume> = {};
  for (const token of tokens.filter(t => t.issuer === 'backpack')) {
    const row = rows.get(birdeyeVolumeKey(token.mint));
    try {
      const value = JSON.parse(row?.payload ?? 'null') as BirdeyeVolume | null;
      if (value?.mint === token.mint && row?.fetched_at === value.collectedAt &&
          Number.isFinite(value.usd24h) && value.usd24h >= 0 &&
          Number.isSafeInteger(value.observedAt) && value.observedAt > 0 &&
          value.observedAt <= value.collectedAt + 60000 && value.collectedAt <= now + 60000 &&
          now - value.observedAt <= BIRDEYE_VOLUME_MAX_AGE) data[token.symbol] = value;
    } catch { /* A corrupt cache entry is unavailable, never a zero. */ }
  }
  return { source: 'birdeye', intervalMs, data };
}
export function birdeyeTokenVolume(market: MarketOverview | null, token: StockToken | undefined, now: number) {
  const value = token && market?.tokenVolumes?.data[token.symbol];
  return value && value.mint === token?.mint && Number.isFinite(value.usd24h) && value.usd24h >= 0 &&
    value.observedAt > 0 && value.observedAt <= now + 60000 && now - value.observedAt <= BIRDEYE_VOLUME_MAX_AGE ? value : null;
}
// This is token turnover, NOT a deduplicated market-wide trading total.
export function birdeyeTurnover(market: MarketOverview | null, tokens: readonly StockToken[], now: number) {
  const rows = [...new Map(tokens.map(t => [t.mint, t])).values()].map(t => birdeyeTokenVolume(market, t, now));
  const known = rows.filter((v): v is BirdeyeVolume => v !== null);
  return { total: known.length ? known.reduce((n, v) => n + v.usd24h, 0) : null,
    covered: known.length, count: rows.length,
    oldestAt: known.length ? Math.min(...known.map(v => v.observedAt)) : null,
    newestAt: known.length ? Math.max(...known.map(v => v.observedAt)) : null,
    collectedFrom: known.length ? Math.min(...known.map(v => v.collectedAt)) : null,
    collectedTo: known.length ? Math.max(...known.map(v => v.collectedAt)) : null,
    delayed: known.some(v => now - v.observedAt > (market?.tokenVolumes?.intervalMs ?? 0) + 1800000) };
}
