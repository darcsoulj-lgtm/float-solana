import type { TradingActivity } from './trading-activity';

const dayMs = 86400000;

// The latest market snapshot replaces an earlier saved observation for its
// source day, including after midnight. Never stamp retained data as today.
export function activitySnapshots(points: TradingActivity[], current: TradingActivity | null, basis: TradingActivity['basis']) {
  const byDay = new Map(points.filter(point => point.basis === basis).map(point => [point.day, point]));
  if (current) byDay.set(current.day, current);
  return byDay;
}

export function volumeObservationTime(time: number) {
  return new Date(time).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23', timeZone:'UTC' }) + ' UTC';
}

// Trim only uncollected edges. Days missing between real observations remain
// explicit gaps, so reducing the display range never invents a daily history.
export function activityWindow(points: Iterable<TradingActivity>, today: string, days: number) {
  const end = Date.parse(today + 'T00:00:00Z');
  const start = end - (days - 1) * dayMs;
  const eligible = [...points].filter(point => {
    const at = Date.parse(point.day + 'T00:00:00Z');
    return at >= start && at <= end;
  }).sort((a, b) => a.day.localeCompare(b.day));
  if (!eligible.length) return [];
  const byDay = new Map(eligible.map(point => [point.day, point]));
  const first = Date.parse(eligible[0].day + 'T00:00:00Z');
  const last = Date.parse(eligible.at(-1)!.day + 'T00:00:00Z');
  return Array.from({ length: (last - first) / dayMs + 1 }, (_, index) => {
    const day = new Date(first + index * dayMs).toISOString().slice(0, 10);
    return { day, point: byDay.get(day) };
  });
}

export function referenceDateRange(times: (number | null | undefined)[]) {
  const dates = times.filter((time): time is number => typeof time === 'number' && Number.isFinite(time) && time > 0 && time <= 8640000000000000)
    .map(time => new Date(time).toISOString().slice(0, 10)).sort();
  if (!dates.length) return null;
  const label = (day: string) => new Date(day + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const first = dates[0];
  const last = dates.at(-1)!;
  return `${label(first)}${last === first ? '' : ` – ${label(last)}`} · UTC`;
}


type DisplayObservation = {
  price: number | null;
  lastPrice?: number | null;
  priceTime?: number | null;
  lastPriceTime?: number | null;
  priceSource?: string | null;
  lastPriceSource?: string | null;
  change24h: number | null;
  changeTime?: number | null;
  changeSource?: string | null;
  changeDelayed?: boolean;
  historicalReference?: boolean;
  historicalDisplayReference?: {
    price: number;
    change24h: number;
    observedAt: number;
  } | null;
};

// A historical return describes its historical close, never a newer quote.
// This presentation companion does not alter the current observation used by
// portfolio or holder eligibility checks.
export function displayedMarketReference(observation: DisplayObservation) {
  const reference = observation.historicalDisplayReference;
  return reference ? {
    price: reference.price,
    change: reference.change24h,
    priceTime: reference.observedAt,
    changeTime: reference.observedAt,
    priceSource: 'Backpack · external',
    changeSource: 'Backpack · external',
    saved: true,
    historical: true,
    changeDelayed: true,
  } : {
    price: observation.price ?? observation.lastPrice ?? null,
    change: observation.change24h,
    priceTime: (observation.price == null ? observation.lastPriceTime : observation.priceTime) ?? null,
    changeTime: observation.changeTime ?? null,
    priceSource: (observation.price == null ? observation.lastPriceSource : observation.priceSource) ?? null,
    changeSource: observation.changeSource ?? null,
    saved: observation.price == null && observation.lastPrice != null,
    historical: observation.historicalReference === true,
    changeDelayed: observation.changeDelayed === true,
  };
}
