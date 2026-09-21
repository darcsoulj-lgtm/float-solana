import type { StockToken } from './tokens';

export type EarningsEvent = {
  id: string;
  date: string;
  name: string;
  underlying: string;
  symbols: string[];
  url: string;
};

const NASDAQ_CALENDAR = 'https://api.nasdaq.com/api/calendar/earnings';
const SOURCE_PAGE = 'https://www.nasdaq.com/market-activity/earnings';

function companyKey(value: string) {
  return value
    .toLowerCase()
    .replace(
      /\b(the|incorporated|inc|corporation|corp|company|co|limited|ltd|plc|holdings|holding|group|class|common|stock)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function sameCompany(listed: string, tracked: string) {
  const a = companyKey(listed);
  const b = companyKey(tracked);
  const first = b.find((word) => word.length >= 4);
  return Boolean(first && a.includes(first));
}

export function calendarDates(start: Date, days = 14) {
  const base = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  return Array.from({ length: days }, (_, offset) =>
    new Date(base + offset * 86_400_000).toISOString().slice(0, 10),
  );
}

export function parseNasdaqEarnings(
  body: unknown,
  date: string,
  tokens: readonly StockToken[],
): EarningsEvent[] {
  if (!body || typeof body !== 'object')
    throw new Error('Invalid Nasdaq response');
  const response = body as {
    status?: { rCode?: number };
    data?: { asOf?: string; rows?: unknown };
  };
  const asOf = response.data?.asOf;
  const rows = response.data?.rows;
  const asOfDate =
    typeof asOf === 'string' && asOf.trim()
      ? new Date(/T|\b(?:GMT|UTC)\b/.test(asOf) ? asOf : `${asOf} UTC`)
      : null;
  if (
    response.status?.rCode !== 200 ||
    !asOfDate ||
    !Number.isFinite(asOfDate.getTime()) ||
    asOfDate.toISOString().slice(0, 10) !== date ||
    (rows !== null && !Array.isArray(rows))
  )
    throw new Error('Invalid Nasdaq calendar data');

  const byUnderlying = new Map<string, StockToken[]>();
  for (const token of tokens) {
    const key = token.underlyingSymbol.toUpperCase();
    byUnderlying.set(key, [...(byUnderlying.get(key) || []), token]);
  }
  const events = new Map<string, EarningsEvent>();
  for (const raw of rows || []) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as { symbol?: unknown; name?: unknown };
    if (typeof row.symbol !== 'string' || typeof row.name !== 'string')
      continue;
    const underlying = row.symbol.toUpperCase().trim();
    if (!/^[A-Z0-9.-]{1,12}$/.test(underlying)) continue;
    const matches = (byUnderlying.get(underlying) || []).filter((token) =>
      sameCompany(row.name as string, token.name),
    );
    if (!matches.length) continue;
    const id = `nasdaq-earnings-${underlying.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${date}`;
    events.set(id, {
      id,
      date,
      name: matches[0].name,
      underlying,
      symbols: [...new Set(matches.map((token) => token.symbol))],
      url: `${SOURCE_PAGE}?date=${date}&symbol=${encodeURIComponent(underlying)}`,
    });
  }
  return [...events.values()];
}

export async function fetchNasdaqEarnings(
  date: string,
  tokens: readonly StockToken[],
): Promise<EarningsEvent[]> {
  const response = await fetch(`${NASDAQ_CALENDAR}?date=${date}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FloatCalendar/1.0)',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Nasdaq calendar HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 1_000_000)
    throw new Error('Nasdaq calendar response too large');
  return parseNasdaqEarnings(JSON.parse(text), date, tokens);
}
