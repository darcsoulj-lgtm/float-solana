// Collection cadence and acceptable age are separate, shared contracts.
import type { HistoricalExternalReference } from './market-data';
export const CURRENT_PRICE_MAX_AGE_MS = 5 * 60000;
export const SUPPLY_REFRESH_MS = 15 * 60000;
export const SUPPLY_MAX_AGE_MS = 20 * 60000;
export const SUPPLY_WORK_BATCH_SIZE = 10;
export const DISPLAY_OBSERVATION_MAX_AGE_MS = 24 * 3600000;
export const VALUATION_PAIR_MAX_SKEW_MS = 15 * 60000;
export const BACKPACK_REFERENCE_RETAIN_MS = 96 * 60 * 60000;

// A historical return belongs to its own close and 24-hour baseline. Readers
// must render this pair together rather than splice it onto a newer quote.
export function validatedHistoricalReferencePair(value:HistoricalExternalReference | undefined,now:number):HistoricalExternalReference | null {
  if(!value || !Number.isFinite(value.price) || value.price<=0 || !Number.isFinite(value.change24h) ||
    !Number.isSafeInteger(value.observedAt) || value.observedAt<=0 || value.observedAt>now || now-value.observedAt>BACKPACK_REFERENCE_RETAIN_MS ||
    typeof value.firstPrice!=='number' || !Number.isFinite(value.firstPrice) || value.firstPrice<=0 ||
    Math.abs(value.change24h-(value.price/value.firstPrice-1)*100)>0.00011)return null;
  return{price:value.price,change24h:value.change24h,observedAt:value.observedAt,firstPrice:value.firstPrice};
}
