import type { BackpackChart } from '@/lib/backpack-charts';

const date = (time: number) => new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export function BackpackChartCard({ chart, period, error }: { chart?: BackpackChart; period: number; error?: string }) {
  if (!chart) return <section className="sp-attachment"><output>{error || 'Loading Backpack chart…'}</output></section>;
  const start = chart.windowEnd - period * 86400000;
  const points = chart.points.filter(p => p[0] >= start);
  if (points.length < 2) return <section className="sp-attachment"><p>Not enough trading hours for this range. Try 7D.</p></section>;
  const prices = points.map(p => p[1]), low = Math.min(...prices), high = Math.max(...prices);
  const x = (time: number) => 12 + (time - start) / (chart.windowEnd - start) * 576;
  const y = (price: number) => 150 - (price - low) / (high - low || 1) * 125;
  const path = points.map(([time, price], i) => `${i && time - points[i - 1][0] <= 3600000 ? 'L' : 'M'}${x(time)},${y(price)}`).join(' ');
  const last = points[points.length - 1];
  return <section className="sp-attachment" aria-label={`${chart.symbol} Backpack stock reference chart`}>
    <div className="sp-card-heading"><div><strong>{chart.symbol} <span>· Backpack</span></strong><p>{chart.name} · stock reference</p></div><span className="sp-tag">Stock reference</span></div>
    <div className="sp-price">${last[1].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span>USD · {period}D</span></div>
    <p className="sp-footnote">Hourly close · {date(last[0])}, {new Date(last[0]).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</p>
    <svg className="sp-chart" viewBox="0 0 600 175" aria-label={`${period}-day ${chart.symbol} stock reference prices from Backpack. Gaps have no completed trading bars.`}>
      {[35, 95, 155].map(v => <line key={v} x1="0" x2="600" y1={v} y2={v} stroke="currentColor" opacity=".1" />)}
      <path d={path} fill="none" stroke="#cc354b" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map(([time, price]) => <circle key={time} cx={x(time)} cy={y(price)} r="1.5" fill="#cc354b"><title>{date(time)} {new Date(time).toISOString().slice(11, 16)} UTC: ${price.toFixed(2)}</title></circle>)}
    </svg>
    <div className="sp-axis"><span>{date(start)}</span><span>{date(chart.windowEnd)} · UTC</span></div>
    <details><summary>Source & limits</summary><p>Backpack external-market hourly prices for {chart.market}. This is a stock reference, not a token DEX price or a sell quote. Empty and unfinished hours are omitted; gaps are not filled. Retrieved {new Date(chart.fetchedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC. No independent-provider accuracy check yet.</p></details>
  </section>;
}
