import type { BackpackChart } from './backpack-charts';
import type { Holding } from './community-types';
import type { MarketOverview } from './market-data';
import { marketTokens } from './market-data';
import { AppError } from './validation';

export type PortfolioAttachment = {
  kind: 'portfolio'; version: 1; checkedAt: number; pricesAt: number;
  rows: { symbol: string; name: string; percent: number }[];
};
export type DiscussionAttachment = PortfolioAttachment | {
  kind: 'chart'; version: 1; period: 1 | 7; chart: BackpackChart;
};
export type PreparedAttachment = { id: string; expiresAt: number; attachment: DiscussionAttachment };

// Only percentages cross the public boundary. Never return quantities, addresses or totals.
export function portfolioAttachment(holdings: Holding[], data: MarketOverview, now = Date.now()): PortfolioAttachment {
  const tokens = marketTokens(data).filter(t => t.issuer === 'backpack');
  const selected = holdings.filter(h => tokens.some(t => t.symbol === h.symbol));
  if (!selected.length || selected.length > 100 || new Set(selected.map(h => h.symbol)).size !== selected.length)
    throw new AppError('No Backpack holdings available to share.', 422);
  let pricesAt = now;
  const values = selected.map(h => {
    const t = tokens.find(t => t.symbol === h.symbol)!;
    const supply = data.supplies.data?.[h.symbol];
    const supplyAt = data.supplies.asOf?.[h.symbol] ?? data.supplies.fetchedAt ?? 0;
    const reference = data.backpack?.data?.[h.symbol];
    const priceAt = data.backpack?.asOf?.[h.symbol] ?? data.backpack?.fetchedAt ?? 0;
    // External stock prices are per share/display unit. Pair them with the
    // adjusted balance computed from the freshly verified mint, never raw units
    // or a DEX quote whose price-unit basis may differ.
    const ui = typeof h.ui_amount === 'string' && /^\d+(\.\d+)?$/.test(h.ui_amount) ? Number(h.ui_amount) : NaN;
    const raw = Number(h.raw_amount) / 10 ** h.decimals!;
    const adjusted = supply?.multiplier ? Math.floor(Number(h.raw_amount) * supply.multiplier) / 10 ** h.decimals! : NaN;
    if (!h.verified_at || now - h.verified_at > 180000 || h.verified_at > now + 1000 ||
      !/^\d{1,22}$/.test(h.raw_amount ?? '') || !Number.isInteger(h.decimals) || h.decimals! < 0 || h.decimals! > 18 ||
      !Number.isFinite(raw) || !Number.isFinite(ui) || ui <= 0 || !Number.isFinite(adjusted) ||
      Math.abs(ui-adjusted) > 10 ** -h.decimals! * 1.01 ||
      supply?.valuationSafe !== true || supply.decimals !== h.decimals ||
      now - supplyAt > 300000 || supplyAt > now + 1000 ||
      !reference || reference.market !== `${t.symbol}.US_USDC` || !Number.isFinite(reference.externalPrice) || reference.externalPrice! <= 0 ||
      !priceAt || now - priceAt > 300000 || priceAt > now + 1000 ||
      (data.backpack?.stale && !data.backpack.asOf?.[h.symbol]))
      throw new AppError(`Cannot prepare ${h.symbol}'s allocation right now. Try again shortly; nothing has been shared.`, 422);
    pricesAt = Math.min(pricesAt, priceAt);
    const value = ui * reference.externalPrice!;
    if (!Number.isFinite(value) || value <= 0) throw new AppError('A holding could not be valued.', 422);
    return { symbol: t.symbol, name: t.shortName, value };
  }).sort((a,b) => b.value-a.value || a.symbol.localeCompare(b.symbol));
  const total = values.reduce((sum,v) => sum + v.value, 0);
  if (!Number.isFinite(total) || total <= 0) throw new AppError('Portfolio value unavailable.', 422);
  // Largest-remainder rounding: percentages sum to exactly 100.0 without hiding dust.
  const parts = values.map(v => v.value / total * 1000);
  const units = parts.map(Math.floor);
  const order = parts.map((n,i) => ({i, remainder:n-units[i]})).sort((a,b) => b.remainder-a.remainder);
  for (let n = 1000-units.reduce((a,b)=>a+b,0), i=0; i<n; i++) units[order[i].i]++;
  return { kind:'portfolio', version:1, checkedAt:Math.min(...selected.map(h=>h.verified_at)), pricesAt,
    rows:values.map((v,i)=>({symbol:v.symbol,name:v.name,percent:units[i]/10})) };
}

export function parseDiscussionAttachment(raw: unknown): DiscussionAttachment | null {
  if (typeof raw !== 'string' || raw.length > 50000) return null;
  try {
    const a = JSON.parse(raw);
    if (a.version !== 1) return null;
    if (a.kind === 'portfolio' && Number.isSafeInteger(a.checkedAt) && Number.isSafeInteger(a.pricesAt) &&
      Array.isArray(a.rows) && a.rows.length > 0 && a.rows.length <= 100 &&
      a.rows.every((r: {symbol:unknown;name:unknown;percent:unknown}) => typeof r.symbol === 'string' && r.symbol.length <= 40 && typeof r.name === 'string' && r.name.length <= 200 && typeof r.percent === 'number' && Number.isFinite(r.percent) && r.percent >= 0 && r.percent <= 100) &&
      Math.abs(a.rows.reduce((n:number,r:{percent:number})=>n+r.percent,0)-100)<0.01)
      return {kind:'portfolio',version:1,checkedAt:a.checkedAt,pricesAt:a.pricesAt,rows:a.rows.map((r:{symbol:string;name:string;percent:number})=>({symbol:r.symbol,name:r.name,percent:r.percent}))};
    const c = a.chart;
    if (a.kind === 'chart' && [1,7].includes(a.period) && c?.source === 'Backpack External' && c.basis === 'stock-reference' &&
      typeof c.symbol === 'string' && c.symbol.length <= 40 && typeof c.name === 'string' && c.name.length <= 200 && typeof c.market === 'string' && c.market === `${c.symbol}.US_USDC` &&
      Number.isSafeInteger(c.fetchedAt) && Number.isSafeInteger(c.windowEnd) && Number.isSafeInteger(c.omittedHours) &&
      Array.isArray(c.points) && c.points.length >= 2 && c.points.length <= 200 &&
      c.points.every((p:unknown,i:number)=>Array.isArray(p) && p.length===2 && Number.isSafeInteger(p[0]) && p[0]<=c.windowEnd && p[0]>=c.windowEnd-8*86400000 && (i===0 || p[0]>c.points[i-1][0]) && Number.isFinite(p[1]) && p[1]>0))
      return {kind:'chart',version:1,period:a.period,chart:{symbol:c.symbol,name:c.name,market:c.market,source:c.source,basis:c.basis,fetchedAt:c.fetchedAt,windowEnd:c.windowEnd,points:c.points,omittedHours:c.omittedHours}};
  } catch { /* Invalid stored payload never becomes public content. */ }
  return null;
}
