import { holderDay, holderTrend, type HolderPoint } from '@/lib/holder-history';
import type { HoldingWallets } from '@/lib/issuer-holders';
export function HolderTrend({history, row}: {history:HolderPoint[]; row:HoldingWallets}) {
  const trend = holderTrend(history, row);
  if (!trend) return null;
  const points = trend.points;
  const first = holderDay(points[0].checkedAt), last = holderDay(row.checkedAt);
  const low = Math.min(...points.map(p => p.wallets)), high = Math.max(...points.map(p => p.wallets));
  const path = points.map((p,i) => `${i && holderDay(p.checkedAt)-holderDay(points[i-1].checkedAt)===1 ? 'L' : 'M'}${4+(holderDay(p.checkedAt)-first)/Math.max(1,last-first)*272},${high===low ? 24 : 42-(p.wallets-low)/(high-low)*36}`).join(' ');
  return <div className="holder-trend">
    <div className="holder-trend-caption"><span>Wallet trend</span>{trend.change !== null && <span>{trend.change > 0 ? '+' : ''}{trend.change.toFixed(1)}% · 30d</span>}</div>
    <svg viewBox="0 0 280 48" aria-label={`Wallet counts from ${points[0].wallets.toLocaleString('en-US')} to ${row.wallets.toLocaleString('en-US')}. Missing days are gaps. Vertical scale starts at ${low.toLocaleString('en-US')}.`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map(p => <circle key={p.checkedAt} cx={4+(holderDay(p.checkedAt)-first)/Math.max(1,last-first)*272} cy={high===low ? 24 : 42-(p.wallets-low)/(high-low)*36} r="2" fill="currentColor"></circle>)}
    </svg>
    <details><summary>Daily counts</summary><p>UTC dates. Missing days are not estimated. A change in tracked tokens starts a new trend.</p><dl>{points.map(p => <div key={p.checkedAt}><dt>{new Date(p.checkedAt).toISOString().slice(0,10)}</dt><dd>{p.wallets.toLocaleString('en-US')}</dd></div>)}</dl></details>
  </div>;
}
