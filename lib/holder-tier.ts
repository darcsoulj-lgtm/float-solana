import type { Holding } from './community-types';
import type { MarketOverview } from './market-data';
import { tokenObservation } from './token-observation';
import { marketTokens } from './market-data';

export const HOLDER_TIERS = [
  { id: 'bronze', label: 'Bronze', minimum: 100, range: '$100–$999' },
  { id: 'silver', label: 'Silver', minimum: 1000, range: '$1k–$9,999' },
  { id: 'gold', label: 'Gold', minimum: 10000, range: '$10k–$99,999' },
  { id: 'platinum', label: 'Platinum', minimum: 100000, range: '$100k–$999,999' },
  { id: 'diamond', label: 'Diamond', minimum: 1000000, range: '$1M+' },
] as const;
export type HolderTier = (typeof HOLDER_TIERS)[number]['id'];
export type HolderTierResult = { tier: HolderTier | null; expiresAt: number };
const DATED_TIER_PRICE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const DATED_TIER_PRICE_BUFFER = 0.25;
export function tierForValue(value: number): HolderTier | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return [...HOLDER_TIERS].reverse().find((t) => value >= t.minimum)?.id ?? null;
}

// Use fresh quotes directly. A dated, high-confidence issuer reference can
// qualify only when a 25% price range leaves the full wallet in one tier.
// Never use client totals, UI-scaled amounts, or pool-only prices.
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
  let lowerValue = 0;
  let upperValue = 0;
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
    const datedReference =
      o.priceDelayed &&
      o.priceSource === 'DefiLlama' &&
      !!o.priceTime &&
      o.priceTime <= now &&
      now - o.priceTime <= DATED_TIER_PRICE_MAX_AGE_MS;
    if (
      !o.price ||
      (o.priceDelayed && !datedReference) ||
      o.valuationUnavailableReason === 'units' ||
      o.priceConflict ||
      o.supply?.valuationSafe !== true ||
      o.priceSource === 'DEX pool' ||
      o.priceSource === 'Unavailable'
    )
      return unavailable;
    const amount = Number(h.raw_amount) / 10 ** h.decimals!;
    if (!Number.isFinite(amount) || amount <= 0) return unavailable;
    const estimatedValue = amount * o.price;
    lowerValue += estimatedValue *
      (datedReference ? 1 - DATED_TIER_PRICE_BUFFER : 1);
    upperValue += estimatedValue *
      (datedReference ? 1 + DATED_TIER_PRICE_BUFFER : 1);
    const supplyTime =
      data.supplies.asOf?.[h.symbol] ?? data.supplies.fetchedAt ?? 0;
    const priceCache =
      o.priceSource === 'Backpack · external'
        ? data.backpack
        : o.priceSource === 'CoinMarketCap'
          ? data.markets
          : data.prices;
    const priceTime = priceCache?.asOf?.[h.symbol] ?? priceCache?.fetchedAt ?? 0;
    expiresAt = Math.min(
      expiresAt,
      h.verified_at + 180000,
      supplyTime + 300000,
      priceTime + 300000,
      (o.priceTime || 0) +
        (datedReference ? DATED_TIER_PRICE_MAX_AGE_MS : 900000),
    );
  }
  const lowerTier = tierForValue(lowerValue);
  return expiresAt > now && lowerTier === tierForValue(upperValue)
    ? { tier: lowerTier, expiresAt }
    : unavailable;
}
