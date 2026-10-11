import { fetchBackpackChart, type BackpackChart } from './backpack-charts';
import type { BackpackMarket, HistoricalExternalReference, SourceResult } from './market-data';
import type { CacheRow } from './market-cache';
import type { StockToken } from './tokens';
import { BACKPACK_REFERENCE_RETAIN_MS, CURRENT_PRICE_MAX_AGE_MS, validatedHistoricalReferencePair } from './market-freshness';
export { BACKPACK_REFERENCE_RETAIN_MS, validatedHistoricalReferencePair } from './market-freshness';

export const BACKPACK_HISTORY_REFRESH_MS = 60 * 60000;
export const backpackHistoryKey = (mint: string) => 'backpack-reference-history-v1:' + mint;
export class BackpackReferenceRegression extends Error {}
const validPrice = (row: BackpackMarket | undefined) => row?.externalPrice != null && Number.isFinite(row.externalPrice) && row.externalPrice > 0;

export function historicalReferencePair(row:BackpackMarket | undefined,now:number):HistoricalExternalReference | null {
  return row?.externalBasis==='hourly-history' && typeof row.externalPrice==='number' && typeof row.externalChange24h==='number' && typeof row.externalObservedAt==='number'
    ? validatedHistoricalReferencePair({price:row.externalPrice,change24h:row.externalChange24h,observedAt:row.externalObservedAt,firstPrice:row.externalFirstPrice??null},now) : null;
}

// Only completed, traded hours reach this adapter. Compare the last observed
// close with an actual close 24 hours earlier; never interpolate a weekend.
export function referenceFromChart(chart: BackpackChart): BackpackMarket {
  const latest = chart.points.at(-1);
  if (!latest) throw Error('No completed stock reference');
  const first = chart.points.find(point => point[0] === latest[0] - 86400000);
  return {
    market: chart.market, externalPrice: latest[1], externalFirstPrice: first?.[1] ?? null,
    externalChange24h: first ? (latest[1] / first[1] - 1) * 100 : null,
    externalChangeUnit: 'percent', externalObservedAt: latest[0], externalBasis: 'hourly-history',
    externalVolume24h: null, externalQuoteVolume24h: null, externalTrades: null,
    venueVolume24h: null, venueQuoteVolume24h: null, venueTrades: null,
  };
}
export function reconcileBackpackReference(chart: BackpackChart, previous: BackpackMarket | null): BackpackMarket {
  const value = referenceFromChart(chart);
  if (previous?.externalObservedAt && value.externalObservedAt! < previous.externalObservedAt) {
    // A truncated/out-of-order response cannot roll a reference backwards.
    // An explicit completed zero-volume, zero-trade hour is a provider revision.
    if (previous.market !== chart.market || previous.externalBasis !== 'hourly-history' ||
        !chart.completedEmptyHours?.includes(previous.externalObservedAt)) throw new BackpackReferenceRegression('Invalid reference regression');
    value.externalRevisedFromAt = previous.externalObservedAt;
  } else if (previous?.externalRevisedFromAt && value.externalObservedAt! < previous.externalRevisedFromAt) {
    value.externalRevisedFromAt = previous.externalRevisedFromAt;
  }
  return value;
}
export async function fetchBackpackReference(token: StockToken, fetcher: typeof fetch = fetch, now = Date.now(), previous: BackpackMarket | null = null) {
  return reconcileBackpackReference(await fetchBackpackChart(token, fetcher, now), previous);
}

// Partial ticker responses preserve each omitted symbol's original timestamp.
// This does not extend that observation's validity or copy venue-only nulls.
export function retainBackpackReferences(current: Record<string, BackpackMarket>, previous: SourceResult<Record<string, BackpackMarket>>, now: number) {
  const out: Record<string, BackpackMarket> = {};
  for (const [symbol, row] of Object.entries(previous.data ?? {})) {
    const observedAt = row.externalObservedAt ?? previous.asOf?.[symbol] ?? previous.fetchedAt;
    if (validPrice(row) && observedAt && observedAt <= now && now - observedAt <= BACKPACK_REFERENCE_RETAIN_MS) out[symbol] = {...row, externalObservedAt: observedAt};
  }
  for (const [symbol, row] of Object.entries(current)) if (validPrice(row)) out[symbol] = {...row, externalObservedAt: now};
  return out;
}

// Public readers use a bulk cache read only. History remains separate from
// the ticker snapshot, so an older collector cannot overwrite the recovery.
export function overlayBackpackHistory(source: SourceResult<Record<string, BackpackMarket>>, tokens: readonly StockToken[], saved: Map<string, CacheRow>, now = Date.now()): SourceResult<Record<string, BackpackMarket>> {
  const data = {...source.data}, asOf: Record<string, number> = {};
  for (const token of tokens.filter(t => t.issuer === 'backpack')) {
    const current = data[token.symbol];
    const currentTime = current?.externalObservedAt ?? source.asOf?.[token.symbol] ?? source.fetchedAt;
    if (validPrice(current) && currentTime) asOf[token.symbol] = currentTime;
    const cached = saved.get(backpackHistoryKey(token.mint));
    if (!cached?.payload) continue;
    let history: BackpackMarket;
    try { history = JSON.parse(cached.payload) as BackpackMarket; } catch { continue; }
    const observedAt = history.externalObservedAt;
    if (!validPrice(history) || history.market !== token.symbol + '.US_USDC' || history.externalBasis !== 'hourly-history' || !observedAt || observedAt > now || now - observedAt > BACKPACK_REFERENCE_RETAIN_MS) continue;
    const revisedRetainedHour = history.externalRevisedFromAt === currentTime;
    // A newer ticker ceases to be a live quote after the shared freshness
    // window. Prefer the actual traded hourly close during a feed outage.
    const currentIsFresh = currentTime && currentTime <= now && now - currentTime <= CURRENT_PRICE_MAX_AGE_MS;
    if (validPrice(current) && currentTime && currentTime >= observedAt && currentIsFresh && !revisedRetainedHour) {
      const pair=historicalReferencePair(history,now);
      const {historicalExternalReference:_previousPair,...quote}=current!;
      data[token.symbol]=typeof current!.externalChange24h!=='number' || !Number.isFinite(current!.externalChange24h)
        ? {...quote,...(pair?{historicalExternalReference:pair}:{})} : quote;
      continue;
    }
    data[token.symbol] = history;
    asOf[token.symbol] = observedAt;
  }
  return {...source, data, asOf};
}
