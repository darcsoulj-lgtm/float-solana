import Link from '@/components/site-link';
import { StockTrade } from './stock-trade';
import type { BackpackChart } from '@/lib/backpack-charts';

const date = (time: number) => new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const priceLabel = (price: number) => price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function BackpackChartCard({ chart, period, error }: { chart?: BackpackChart; period: number; error?: string }) {
  if (!chart) return <section className="sp-attachment"><output>{error || 'Loading Backpack chart…'}</output></section>;
  const start = chart.windowEnd - period * 86400000;
  const points = chart.points.filter(p => p[0] >= start);
  if (points.length < 2) return <section className="sp-attachment"><p>Not enough trading hours for this range. Try 7D.</p></section>;
  const prices = points.map(p => p[1]), low = Math.min(...prices), high = Math.max(...prices);
  const padding = Math.max((high - low) * .08, high * .001, .01);
  const bottom = Math.max(0, low - padding), top = high + padding;
  const x = (time: number) => 4 + (time - start) / (chart.windowEnd - start) * 592;
  const y = (price: number) => 190 - (price - bottom) / (top - bottom) * 180;
  const path = points.map(([time, price], i) => `${i && time - points[i - 1][0] <= 3600000 ? 'L' : 'M'}${x(time)},${y(price)}`).join(' ');
  const last = points[points.length - 1];
  return <section className="sp-attachment stock-chart-card" aria-label={`${chart.symbol} Backpack stock reference chart`}>
    <div className="stock-chart-heading"><div><strong>{chart.name}</strong><span className="stock-chart-symbol">{chart.symbol} · Stock price · {period}D</span></div><strong className="stock-chart-price">{priceLabel(last[1])}</strong></div>
    <div className="stock-chart-plot">
      <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-label={`${period}-day ${chart.symbol} hourly stock reference prices from Backpack. Range ${priceLabel(low)} to ${priceLabel(high)}. Gaps have no completed trading bars.`}>
        {[10, 100, 190].map(v => <line key={v} x1="0" x2="600" y1={v} y2={v} stroke="currentColor" opacity=".1" vectorEffect="non-scaling-stroke" />)}
        <path d={path} fill="none" stroke="#cc354b" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map(([time, price]) => <circle key={time} cx={x(time)} cy={y(price)} r="1.3" fill="#cc354b"><title>{`${date(time)} ${new Date(time).toISOString().slice(11, 16)} UTC: ${priceLabel(price)}`}</title></circle>)}
      </svg>
      <div className="stock-chart-prices" aria-hidden="true">{[top, (top + bottom) / 2, bottom].map((value, i) => <span key={i}>{priceLabel(value)}</span>)}</div>
    </div>
    <div className="stock-chart-dates"><span>{date(start)}</span><span>{date(chart.windowEnd)} · UTC</span></div>
    <div className="attachment-meta"><time dateTime={new Date(chart.fetchedAt).toISOString()}>Saved {date(chart.fetchedAt)} · {new Date(chart.fetchedAt).toISOString().slice(11, 16)} UTC</time><Link href="/data-methodology#attachments" aria-label={`About chart data. Market ${chart.market}. Last close ${new Date(last[0]).toISOString()}.`}>About this data</Link></div>
    <StockTrade symbol={chart.symbol} />
  </section>;
}
