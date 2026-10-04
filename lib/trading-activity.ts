import { marketTokens, type MarketOverview } from './market-data';
import { displayPoolActivity } from './token-observation';
import { qualifiedPoolVolume } from './pool-volume-policy';
import { birdeyeTokenVolume, birdeyeTurnover } from './birdeye-volume';

export type TradingActivity = {
  day: string;
  capturedAt: number;
  oldestAt: number;
  newestAt: number;
  basis: 'pools' | 'turnover';
  total: number;
  partial: boolean;
  covered: number;
  known: number;
  tokens: { symbol: string; value: number }[];
};

// One display policy owns the dashboard and this panel. Pool contributions are
// split equally across tracked sides, so a shared pool never inflates the chart.
export function tradingActivity(data: MarketOverview | null, now: number): TradingActivity | null {
  if (!data) return null;
  const tokens = marketTokens(data).filter(t => t.issuer === 'backpack');
  if (!tokens.length) return null;
  if (data.tokenVolumes) {
    const summary = birdeyeTurnover(data, tokens, now);
    const rows = tokens.flatMap(t => {
      const value = birdeyeTokenVolume(data, t, now);
      return value ? [{ symbol: t.symbol, value: value.usd24h, at: value.observedAt }] : [];
    });
    if (summary.total === null || !summary.oldestAt) return null;
    return { day: new Date(now).toISOString().slice(0, 10), capturedAt: now,
      oldestAt: summary.oldestAt, newestAt: Math.max(...rows.map(r => r.at)),
      basis: 'turnover', total: summary.total, partial: summary.covered < summary.count,
      covered: summary.covered, known: summary.count,
      tokens: rows.map(({symbol,value}) => ({symbol,value})).sort((a,b) => b.value-a.value || a.symbol.localeCompare(b.symbol)) };
  }
  const summary = displayPoolActivity(data, tokens.map(t => t.symbol), now);
  if (summary.observedVolume24h === null) return null;
  const members = new Map<string, Set<string>>();
  for (const token of tokens) {
    for (const pool of data.pools.data?.[token.symbol] ?? []) {
      const set = members.get(pool.address) ?? new Set<string>();
      set.add(token.symbol); members.set(pool.address, set);
    }
  }
  const amounts = new Map<string, number>();
  const times: number[] = [];
  for (const pool of summary.pools.filter(qualifiedPoolVolume)) {
    const symbols = members.get(pool.address);
    if (!symbols?.size) continue;
    times.push(pool.observedAt!);
    for (const symbol of symbols) amounts.set(symbol, (amounts.get(symbol) ?? 0) + pool.volume24h! / symbols.size);
  }
  if (!times.length) return null;
  return { day: new Date(now).toISOString().slice(0, 10), capturedAt: now,
    oldestAt: Math.min(...times), newestAt: Math.max(...times), basis: 'pools',
    total: summary.observedVolume24h, partial: summary.partial,
    covered: summary.observedCount, known: summary.knownCount,
    tokens: [...amounts].map(([symbol,value]) => ({symbol,value})).sort((a,b) => b.value-a.value || a.symbol.localeCompare(b.symbol)) };
}

export function activityBreakdown(point: TradingActivity) {
  const top = point.tokens.slice(0, 5);
  const other = Math.max(0, point.total - top.reduce((sum, row) => sum + row.value, 0));
  return other > 0 ? [...top, {symbol: 'Other', value: other}] : top;
}

export function validTradingActivity(value: unknown): value is TradingActivity {
  const p = value as TradingActivity | null;
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.day) ||
      !Number.isSafeInteger(p.capturedAt) || p.capturedAt <= 0 || p.capturedAt > 8640000000000000 || new Date(p.capturedAt).toISOString().slice(0,10) !== p.day ||
      !Number.isSafeInteger(p.oldestAt) || p.oldestAt <= 0 || !Number.isSafeInteger(p.newestAt) ||
      p.oldestAt > p.newestAt || p.newestAt > p.capturedAt + 60000 ||
      !['pools','turnover'].includes(p.basis) || !Number.isFinite(p.total) || p.total < 0 ||
      typeof p.partial !== 'boolean' || !Number.isSafeInteger(p.covered) || p.covered < 1 ||
      !Number.isSafeInteger(p.known) || p.known < p.covered || !Array.isArray(p.tokens) || !p.tokens.length || p.tokens.length > 2000 ||
      p.tokens.some(r => !r || typeof r.symbol !== 'string' || !/^[A-Za-z0-9._-]{1,24}$/.test(r.symbol) || !Number.isFinite(r.value) || r.value < 0) ||
      new Set(p.tokens.map(r => r.symbol)).size !== p.tokens.length) return false;
  return Math.abs(p.tokens.reduce((n,r) => n+r.value,0)-p.total) <= Math.max(.01,p.total*1e-10);
}
