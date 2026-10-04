import type { StockToken } from './tokens';
import type { CacheRow } from './market-cache';
import { birdeyeVolumeKey, type BirdeyeVolume } from './birdeye-volume';

export const COMPARISON_ISSUERS = ['backpack', 'xstocks', 'ondo'] as const;
export type ComparisonIssuer = typeof COMPARISON_ISSUERS[number];
export const COMPARISON_MAX_AGE_MS = 24 * 3600000;
export const COMPARISON_COLLECTION_SPREAD_MS = 3600000;
export const COMPARISON_SOURCE_SPREAD_MS = 6 * 3600000;
export type IssuerComparison = {
  version: 1;
  source: 'birdeye';
  chain: 'solana';
  window: '24h';
  total: number;
  oldestAt: number;
  newestAt: number;
  collectedFrom: number;
  collectedTo: number;
  rows: { issuer: ComparisonIssuer; usd24h: number; tokens: number }[];
};

// A comparison is a sum of exact-mint token turnover, never a mixture of pool
// totals or issuer issuance/redemption flow. Complete TRACKED coverage is
// required; it does not establish coverage of every listing on Solana.
export function buildIssuerComparison(tokens: readonly StockToken[], saved: Map<string, CacheRow>, now: number): IssuerComparison | null {
  const identities = new Map<string, StockToken>();
  for (const token of tokens) {
    if (!COMPARISON_ISSUERS.includes(token.issuer as ComparisonIssuer)) continue;
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.mint)) return null;
    const previous = identities.get(token.mint);
    if (previous && previous.issuer !== token.issuer) return null;
    identities.set(token.mint, token);
  }
  const observations: BirdeyeVolume[] = [];
  const rows = COMPARISON_ISSUERS.map(issuer => {
    const cohort = [...identities.values()].filter(t => t.issuer === issuer);
    let usd24h = 0;
    for (const token of cohort) {
      const row = saved.get(birdeyeVolumeKey(token.mint));
      let value: BirdeyeVolume | null = null;
      try { value = JSON.parse(row?.payload ?? 'null') as BirdeyeVolume | null; } catch { /* Unavailable. */ }
      if (!value || value.mint !== token.mint || row?.fetched_at !== value.collectedAt ||
        !Number.isFinite(value.usd24h) || value.usd24h < 0 ||
        !Number.isSafeInteger(value.observedAt) || value.observedAt <= 0 ||
        !Number.isSafeInteger(value.collectedAt) || value.collectedAt <= 0 ||
        value.observedAt > value.collectedAt + 60000 || value.collectedAt > now + 60000 ||
        now - value.observedAt > COMPARISON_MAX_AGE_MS || now - value.collectedAt > COMPARISON_MAX_AGE_MS) return null;
      observations.push(value);
      usd24h += value.usd24h;
    }
    return cohort.length && Number.isFinite(usd24h) ? { issuer, usd24h, tokens: cohort.length } : null;
  });
  if (rows.some(row => !row)) return null;
  const valid = rows as IssuerComparison['rows'];
  const result: IssuerComparison = {
    version: 1, source: 'birdeye', chain: 'solana', window: '24h',
    total: valid.reduce((sum, row) => sum + row.usd24h, 0), rows: valid,
    oldestAt: Math.min(...observations.map(v => v.observedAt)),
    newestAt: Math.max(...observations.map(v => v.observedAt)),
    collectedFrom: Math.min(...observations.map(v => v.collectedAt)),
    collectedTo: Math.max(...observations.map(v => v.collectedAt)),
  };
  return validIssuerComparison(result, now) ? result : null;
}

// Validate public cached DTOs again in the browser, including as time passes.
export function validIssuerComparison(raw: unknown, now: number): raw is IssuerComparison {
  const value = raw as IssuerComparison | null;
  if (!value || value.version !== 1 || value.source !== 'birdeye' || value.chain !== 'solana' || value.window !== '24h' ||
    !Number.isFinite(value.total) || value.total < 0 || !Array.isArray(value.rows) || value.rows.length !== COMPARISON_ISSUERS.length) return false;
  if (![value.oldestAt, value.newestAt, value.collectedFrom, value.collectedTo].every(at => Number.isSafeInteger(at) && at > 0 && at <= now + 60000) ||
    value.oldestAt > value.newestAt || value.collectedFrom > value.collectedTo ||
    value.newestAt > value.collectedTo + 60000 || value.oldestAt > value.collectedFrom + 60000 ||
    now - value.oldestAt > COMPARISON_MAX_AGE_MS || now - value.collectedFrom > COMPARISON_MAX_AGE_MS ||
    value.newestAt - value.oldestAt > COMPARISON_SOURCE_SPREAD_MS ||
    value.collectedTo - value.collectedFrom > COMPARISON_COLLECTION_SPREAD_MS) return false;
  if (!value.rows.every((row, i) => row && row.issuer === COMPARISON_ISSUERS[i] &&
    Number.isFinite(row.usd24h) && row.usd24h >= 0 && Number.isSafeInteger(row.tokens) && row.tokens > 0 && row.tokens <= 5000)) return false;
  const sum = value.rows.reduce((total, row) => total + row.usd24h, 0);
  return Number.isFinite(sum) && Math.abs(value.total - sum) <= Math.max(1e-8, sum * Number.EPSILON * 4);
}
