import type { TradingActivity } from './trading-activity';

const dayMs = 86400000;

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
