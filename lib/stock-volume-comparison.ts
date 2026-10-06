// Calendar-window comparisons are separate from rolling 24h market observations.
export type StockVolumePeriod = 1 | 7 | 30;
export type StockVolumeRow = {
  symbol: string; name: string; mint: string; listingExchange: string;
  tokenUsd: number; stockUsd: number; reconciled: true;
  stockMarketClosed?: true;
};
export type StockVolumeComparison = {
  period: StockVolumePeriod; startUtc: string; endUtc: string;
  timeZone: 'America/New_York'; tokenSource: 'birdeye'; stockSource: 'alpaca-sip';
  coverage: { available: number; total: number; unavailable: string[] };
  rows: StockVolumeRow[];
  comparisonCoverage?: { selected: string[]; unavailable: { symbol: string; reason: 'token-history-unavailable' }[] };
  selectionBasis?: 'latest-market-volume';
  selectedAt?: number;
  generatedAt?: number;
};

const et = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function midnight(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time % 1000) return null;
  const parts = Object.fromEntries(et.formatToParts(time).map(p => [p.type, p.value]));
  return parts.hour === '00' && parts.minute === '00' && parts.second === '00'
    ? Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) : null;
}
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const symbol = (value: unknown): value is string => typeof value === 'string' && /^[A-Z0-9.-]{1,20}$/.test(value);

export function validStockVolumeComparison(value: unknown): value is StockVolumeComparison {
  if (!value || typeof value !== 'object') return false;
  const v = value as StockVolumeComparison;
  if (![1, 7, 30].includes(v.period) || v.timeZone !== 'America/New_York' || v.tokenSource !== 'birdeye' || v.stockSource !== 'alpaca-sip') return false;
  if (typeof v.startUtc !== 'string' || typeof v.endUtc !== 'string') return false;
  const start = midnight(v.startUtc), end = midnight(v.endUtc);
  // Count local calendar dates, not 24h multiples: DST can make a day 23/25h.
  if (start === null || end === null || (end - start) / 86400000 !== v.period) return false;
  if (v.selectionBasis !== undefined && (v.selectionBasis !== 'latest-market-volume' || !Number.isSafeInteger(v.selectedAt) || v.selectedAt! <= 0 || !Number.isSafeInteger(v.generatedAt) || v.generatedAt! < v.selectedAt! || v.generatedAt! < Date.parse(v.endUtc))) return false;
  const c = v.coverage;
  if (!c || !Number.isInteger(c.available) || !Number.isInteger(c.total) || c.available < 5 || c.total < c.available || !Array.isArray(c.unavailable) || c.unavailable.length !== c.total - c.available || !c.unavailable.every(symbol) || new Set(c.unavailable).size !== c.unavailable.length) return false;
  if (!Array.isArray(v.rows)) return false;
  const scope=v.comparisonCoverage;
  if(scope===undefined){if(v.rows.length!==5)return false;}
  else {
    if(v.selectionBasis!=='latest-market-volume'||!Array.isArray(scope.selected)||scope.selected.length!==5||!scope.selected.every(symbol)||new Set(scope.selected).size!==5||!Array.isArray(scope.unavailable)||v.rows.length<3||v.rows.length>5||scope.unavailable.length!==5-v.rows.length)return false;
    const absent=scope.unavailable.map(r=>r?.symbol);
    if(!scope.unavailable.every(r=>r&&symbol(r.symbol)&&r.reason==='token-history-unavailable')||new Set(absent).size!==absent.length)return false;
    const shown=v.rows.map(r=>r?.symbol);
    if(shown.some(s=>!scope.selected.includes(s)||absent.includes(s))||absent.some(s=>!scope.selected.includes(s)))return false;
  }
  const mints = new Set<string>(), symbols = new Set<string>();
  for (const r of v.rows) {
    if (!r || !symbol(r.symbol) || c.unavailable.includes(r.symbol) || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 160 || typeof r.mint !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.mint) || !['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'OTC'].includes(r.listingExchange) || !amount(r.tokenUsd) || !amount(r.stockUsd) || r.reconciled !== true || mints.has(r.mint) || symbols.has(r.symbol)) return false;
    mints.add(r.mint); symbols.add(r.symbol);
    if (r.stockMarketClosed !== undefined && (r.stockMarketClosed !== true || r.stockUsd !== 0)) return false;
  }
  return true;
}
export function rankedStockVolumeRows(comparison: StockVolumeComparison): StockVolumeRow[] {
  return [...comparison.rows].sort((a, b) => b.tokenUsd - a.tokenUsd || a.symbol.localeCompare(b.symbol));
}
export function stockVolumeRatio(row: Pick<StockVolumeRow, 'tokenUsd' | 'stockUsd'>): string {
  if (!amount(row.tokenUsd) || !amount(row.stockUsd) || row.stockUsd === 0) return '—';
  const ratio = row.tokenUsd / row.stockUsd;
  if (!Number.isFinite(ratio)) return '—';
  if (ratio >= 1) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(ratio) + '×';
  const percent = ratio * 100;
  if (percent > 0 && percent < .001) return '<0.001%';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: percent < .1 ? 3 : percent < 1 ? 2 : 1 }).format(percent) + '%';
}
export function stockVolumeDateLabel(comparison: StockVolumeComparison): string {
  const date = new Intl.DateTimeFormat('en-US', { timeZone: comparison.timeZone, month: 'short', day: 'numeric', year: 'numeric' });
  const first = date.format(Date.parse(comparison.startUtc)), last = date.format(Date.parse(comparison.endUtc) - 1);
  return (first === last ? first : first + ' – ' + last) + ' · ET';
}

// The next matched day is collected at 06:30 UTC on the following UTC date.
// Derive this from the published day, so a missed run cannot silently move
// its due date forward. Do not use the visitor's local calendar or a 24h DST offset.
export function nextStockVolumeCollection(comparison: StockVolumeComparison): number {
  const end = new Date(comparison.endUtc);
  return Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1, 6, 30);
}
