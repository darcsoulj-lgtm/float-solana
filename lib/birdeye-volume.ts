import type { StockToken } from './tokens';
import type { MarketOverview } from './market-data';
import type { CacheRow } from './market-cache';

export const BIRDEYE_VOLUME_CU = 5;
export const BIRDEYE_VOLUME_MAX_BUDGET = 24000;
export const BIRDEYE_VOLUME_MAX_AGE = 72 * 3600000;
export const birdeyeVolumeKey = (mint: string) => 'birdeye-volume:v1:' + mint;
export type BirdeyeVolume = {
  mint: string; usd24h: number; observedAt: number; collectedAt: number;
};
export type BirdeyeVolumes = { source: 'birdeye'; intervalMs: number; data: Record<string, BirdeyeVolume> };
// Reserve 20% of the free allowance. Increase the interval as listings grow.
export function birdeyeVolumeInterval(count: number, budget = BIRDEYE_VOLUME_MAX_BUDGET) {
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(budget) || budget < 5 || budget > BIRDEYE_VOLUME_MAX_BUDGET) throw Error('Invalid volume budget');
  return Math.max(12, Math.ceil(count * BIRDEYE_VOLUME_CU * 32 * 24 / budget)) * 3600000;
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
    delayed: known.some(v => now - v.observedAt > (market?.tokenVolumes?.intervalMs ?? 0) + 1800000) };
}

