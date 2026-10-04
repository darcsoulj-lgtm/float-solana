'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { validIssuerComparison, type IssuerComparison } from '@/lib/issuer-comparison';
import Link from '@/components/site-link';
import { MetricInfo } from './metric-info';

const names = { backpack: 'Backpack', xstocks: 'xStocks', ondo: 'Ondo' };
const money = (value: number, compact = true) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: compact ? 'compact' : 'standard', maximumFractionDigits: 2,
}).format(value);
const timestamp = (value: number) => new Date(value).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
}) + ' UTC';

export function IssuerComparisonPanel({ now }: { now: number }) {
  const [comparison, setComparison] = useState<IssuerComparison | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await api<{ comparison: unknown }>('issuer-comparison');
        if (active) setComparison(validIssuerComparison(response.comparison, Date.now()) ? response.comparison : null);
      } catch { /* Existing observation is retained only until its freshness cutoff. */ }
    };
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 3600000);
    const wake = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', wake);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', wake); };
  }, []);
  return <IssuerComparisonCard comparison={comparison} now={now} />;
}

export function IssuerComparisonCard({ comparison, now, id = 'float-issuer-comparison' }: { comparison: IssuerComparison | null; now: number; id?: string }) {
  // One stable namespace per card also avoids route-tree-dependent SSR IDs.
  const titleId = id + '-title', tooltipId = id + '-tooltip';
  const root = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (selected === null) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setSelected(null); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selected]);
  if (!validIssuerComparison(comparison, now)) return null;
  const maximum = Math.max(1, ...comparison.rows.map(row => row.usd24h));
  const share = (value: number) => comparison.total > 0 ? (100 * value / comparison.total).toFixed(1) + '%' : '—';
  return <section ref={root} className="issuer-comparison" aria-labelledby={titleId}>
    <header className="issuer-comparison-heading">
      <div className="issuer-comparison-title"><h3 id={titleId}>Issuer comparison</h3><MetricInfo id={id + '-info'} label="About issuer comparison" learnMore="/data-methodology#issuer-comparison">
        Birdeye’s rolling 24-hour token turnover on Solana. Shares are among tracked tokens, not the entire market. Trades between tracked tokens may count twice.
        <br />{comparison.rows.map(row => names[row.issuer] + ': ' + row.tokens + ' tokens').join(' · ')}
        <br />Source times: {timestamp(comparison.oldestAt)} – {timestamp(comparison.newestAt)}.
      </MetricInfo></div>
      <span>24h turnover</span>
    </header>
    <div className="issuer-comparison-total"><strong>{money(comparison.total)}</strong><span>Across 3 tracked issuers</span></div>
    <ol className="issuer-comparison-rows" aria-label="24-hour turnover by issuer">
      {comparison.rows.map((row, index) => <li key={row.issuer} className={`issuer-comparison-row issuer-comparison-row--${row.issuer}`}>
        <button type="button" className="issuer-comparison-target" aria-label={`${names[row.issuer]}: ${money(row.usd24h, false)}; ${comparison.total > 0 ? share(row.usd24h) + ' of tracked turnover' : 'share unavailable because total is zero'}`} aria-describedby={selected === index ? tooltipId : undefined}
          onPointerEnter={() => setSelected(index)} onPointerLeave={() => setSelected(null)} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)} onClick={() => setSelected(index)} onKeyDown={event => { if (event.key === 'Escape') setSelected(null); }}>
          <span className="issuer-comparison-name">{names[row.issuer]}</span>
          <span className="issuer-comparison-bar" aria-hidden="true"><i style={{ width: `${row.usd24h / maximum * 100}%` }} /></span>
          <strong className="issuer-comparison-amount">{money(row.usd24h)}</strong>
          <span className="issuer-comparison-share">{share(row.usd24h)}</span>
        </button>
        {selected === index && <div id={tooltipId} role="tooltip" className="issuer-comparison-tooltip"><strong>{names[row.issuer]} · {money(row.usd24h, false)}</strong><span>{row.tokens} tracked tokens · {comparison.total > 0 ? share(row.usd24h) + ' of compared turnover' : 'No percentage for a zero total'}</span></div>}
      </li>)}
    </ol>
    <footer><time dateTime={new Date(comparison.oldestAt).toISOString()}>As of {timestamp(comparison.oldestAt)}</time><Link href="/data-methodology#issuer-comparison">Data &amp; methodology ↗</Link></footer>
  </section>;
}
