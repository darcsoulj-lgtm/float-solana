import type { Holding } from './community-types';
import type { MarketOverview } from './market-data';
import { tokenObservation } from './token-observation';
import { marketTokens } from './market-data';

export const HOLDER_TIERS = [
  { id: 'bronze', label: 'Bronze', minimum: 0, range: 'Under $100' },
  { id: 'silver', label: 'Silver', minimum: 100, range: '$100–$999' },
  { id: 'gold', label: 'Gold', minimum: 1000, range: '$1k–$9,999' },
  { id: 'platinum', label: 'Platinum', minimum: 10000, range: '$10k–$99,999' },
  { id: 'diamond', label: 'Diamond', minimum: 100000, range: '$100k+' },
] as const;
export type HolderTier = (typeof HOLDER_TIERS)[number]['id'];
export type HolderTierResult = { tier: HolderTier | null; expiresAt: number };
export function tierForValue(value: number): HolderTier | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return [...HOLDER_TIERS].reverse().find((t) => value >= t.minimum)!.id;
}

// Complete, fresh valuation only. No client totals, UI-scaled amounts, or pool-only prices.
export function calculateHolderTier(
  holdings: Holding[],
  data: MarketOverview,
  now = Date.now(),
): HolderTierResult {
  const unavailable: HolderTierResult = { tier: null, expiresAt: 0 };
  if (
    !holdings.length ||
    new Set(holdings.map((h) => h.symbol)).size !== holdings.length
  )
    return unavailable;
  let value = 0;
  let expiresAt = now + 120000;
  for (const h of holdings) {
    if (
      !marketTokens(data).some((t) => t.symbol === h.symbol) ||
      !/^\d+$/.test(h.raw_amount || '') ||
      !Number.isInteger(h.decimals) ||
      h.decimals! < 0 ||
      h.decimals! > 18 ||
      !h.verified_at ||
      h.verified_at > now + 1000 ||
      now - h.verified_at >= 180000
    )
      return unavailable;
    const o = tokenObservation(data, h.symbol, now);
    if (
      !o.price ||
      o.priceDelayed ||
      o.valuationUnavailableReason === 'units' ||
      o.priceConflict ||
      o.supply?.valuationSafe !== true ||
      o.priceSource === 'DEX pool' ||
      o.priceSource === 'Unavailable'
    )
      return unavailable;
    const amount = Number(h.raw_amount) / 10 ** h.decimals!;
    if (!Number.isFinite(amount) || amount <= 0) return unavailable;
    value += amount * o.price;
    const supplyTime =
      data.supplies.asOf?.[h.symbol] ?? data.supplies.fetchedAt ?? 0;
    const priceCache =
      o.priceSource === 'CoinMarketCap' ? data.markets : data.prices;
    const priceTime = priceCache.asOf?.[h.symbol] ?? priceCache.fetchedAt ?? 0;
    expiresAt = Math.min(
      expiresAt,
      h.verified_at + 180000,
      supplyTime + 300000,
      priceTime + 300000,
      (o.priceTime || 0) + 900000,
    );
  }
  return expiresAt > now
    ? { tier: tierForValue(value), expiresAt }
    : unavailable;
}
