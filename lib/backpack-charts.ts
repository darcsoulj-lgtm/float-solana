import type { StockToken } from './tokens';

export type BackpackChart = {
  symbol: string;
  name: string;
  market: string;
  source: 'Backpack External';
  basis: 'stock-reference';
  fetchedAt: number;
  windowEnd: number;
  points: [number, number][];
  omittedHours: number;
};

function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw Error('Invalid candle time');
  const time = Date.parse(value.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(time)) throw Error('Invalid candle time');
  return time;
}

export function parseBackpackChart(raw: unknown, token: StockToken, now: number): BackpackChart {
  if (token.issuer !== 'backpack' || !Array.isArray(raw) || raw.length > 200) throw Error('Invalid chart response');
  const points: [number, number][] = [];
  let previous = -Infinity, omittedHours = 0;
  for (const row of raw) {
    if (!row || typeof row !== 'object') throw Error('Invalid candle');
    const start = timestamp(row.start), end = timestamp(row.end);
    const values = [row.open, row.high, row.low, row.close];
    if (values.some(v => typeof v !== 'string' || !v.trim())) throw Error('Invalid price');
    const [open, high, low, close] = values.map(Number);
    const volume = Number(row.volume), trades = Number(row.trades);
    if (start <= previous || end - start !== 3600000 || start > now || start < now - 8 * 86400000 ||
      ![open, high, low, close].every(n => Number.isFinite(n) && n > 0) || high < Math.max(open, close, low) || low > Math.min(open, close) ||
      typeof row.volume !== 'string' || !row.volume.trim() || typeof row.trades !== 'string' || !row.trades.trim() || !Number.isFinite(volume) || volume < 0 || !Number.isSafeInteger(trades) || trades < 0) throw Error('Invalid candle');
    previous = start;
    // No interpolated zero-trade candles or unfinished hours presented as trades.
    if (end > now || volume === 0 || trades === 0) { omittedHours++; continue; }
    points.push([end, close]);
  }
  if (points.length < 2) throw Error('Not enough completed trading hours');
  return { symbol: token.symbol, name: token.shortName, market: `${token.symbol}.US_USDC`, source: 'Backpack External', basis: 'stock-reference', fetchedAt: now, windowEnd: now, points, omittedHours };
}

export async function fetchBackpackChart(token: StockToken, fetcher: typeof fetch = fetch, now = Date.now()): Promise<BackpackChart> {
  if (token.issuer !== 'backpack') throw Error('Unsupported issuer');
  const query = new URLSearchParams({ symbol: `${token.symbol}.US_USDC`, interval: '1h', source: 'External', startTime: String(Math.floor(now / 1000) - 7 * 86400), endTime: String(Math.floor(now / 1000)) });
  const response = await fetcher(`https://api.backpack.exchange/api/v1/klines?${query}`, { signal: AbortSignal.timeout(12000), redirect: 'manual' });
  if (!response.ok) throw Error(`Backpack chart unavailable (${response.status})`);
  const text = await response.text();
  if (text.length > 250000) throw Error('Chart response too large');
  return parseBackpackChart(JSON.parse(text), token, now);
}
