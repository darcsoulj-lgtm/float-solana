'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronDown } from 'lucide-react';
import initial from '@/public/data/issuer-holders.json';
import { parseHolderSnapshot, retainHolderSnapshot } from '@/lib/issuer-holders';
import { issuerName, type IssuerId } from '@/lib/tokens';
import { parseHolderHistory, holderTrend, type HolderPoint } from '@/lib/holder-history';
import { HolderTrend } from './holder-trend';
import { MetricInfo } from './metric-info';

const subscribeClock = (notify: () => void) => {
  const timer = setInterval(notify, 60000);
  window.addEventListener('focus', notify);
  return () => { clearInterval(timer); window.removeEventListener('focus', notify); };
};
const readClock = () => Math.floor(Date.now() / 60000) * 60000;
const serverClock = () => null;

export function HoldingWallets({ issuer, compact = false }: { issuer?: IssuerId; compact?: boolean }) {
  const now = useSyncExternalStore(subscribeClock, readClock, serverClock);
  const [history, setHistory] = useState<HolderPoint[]>([]);
  const [rows, setRows] = useState(() => parseHolderSnapshot(initial));
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (document.hidden) return;
      try {
        const response = await fetch('/api/issuer-holders', { cache: 'no-cache', signal: controller.signal });
        if (!response.ok) return;
        const value: unknown = await response.json();
        if (!controller.signal.aborted) {
          setRows(previous => retainHolderSnapshot(previous, value));
          if (value && typeof value === 'object' && 'history' in value) setHistory(parseHolderHistory(value.history));
        }
      } catch { /* Keep the last verified snapshot and its original date. */ }
    }
    void load();
    const timer = setInterval(() => void load(), 300000);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, []);
  const visible = rows?.filter(row => !issuer || row.issuer === issuer) ?? [];
  if (!visible.length && !compact) return null;
  const oldest = Math.min(...visible.map(row => row.checkedAt));
  const age = now === null ? null : Math.max(0, now - oldest);
  const relative = age === null ? 'Update details' : age < 3600000 ? 'Updated within the hour' : age < 86400000 ? `Updated ${Math.floor(age / 3600000)}h ago` : `Updated ${Math.floor(age / 86400000)}d ago`;
  const exactTime = (timestamp: number) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(timestamp);
  if (compact) {
    const row = visible[0];
    return <div className="holding-wallets-metric">
      <span className="metric-label"><span>Holding wallets</span><MetricInfo label="How holding wallets are counted" learnMore="/data-methodology#wallets">
        Each wallet holding a tracked Backpack token counts once. Includes exchange, pool and issuer wallets. Wallets are not people.
      </MetricInfo></span>
      <strong>{row ? row.wallets.toLocaleString('en-US') : '—'}</strong>
      {row ? <details className="wallet-metric-details">
        <summary>{now !== null && now - row.checkedAt > 48 * 3600000 ? 'Update overdue' : relative}<ChevronDown size={14} aria-hidden="true" /></summary>
        <div className="wallet-metric-expanded">
          <p><time dateTime={new Date(row.checkedAt).toISOString()}>{exactTime(row.checkedAt)}</time></p>
          <p>{row.tokens.toLocaleString('en-US')} tokens counted. Checked daily; the last successful count stays visible if a refresh fails.</p>
          {holderTrend(history, row) ? <HolderTrend history={history} row={row} /> : <p>A trend appears after seven comparable daily observations.</p>}
        </div>
      </details> : <small>No count available</small>}
    </div>;
  }
  return <section className="market-activity-panel holding-wallets-panel" aria-label="Holding wallets">
    <header><h3>Holding wallets</h3><MetricInfo label="How holding wallets are counted" learnMore="/data-methodology#wallets">
      {issuer ? 'Each wallet holding a tracked Backpack token counts once. Wallets are not people; exchange and pool wallets are included.' : 'Wallets with tracked tokens, counted once per issuer. Includes exchange, pool and issuer wallets.'}
    </MetricInfo></header>
    <div className="holding-wallets-grid">
      {visible.map(row => <div key={row.issuer}>
        <span>{issuerName(row.issuer as IssuerId)}</span>
        <strong>{row.wallets.toLocaleString('en-US')}</strong>
        <small>{row.tokens.toLocaleString('en-US')} tracked tokens</small>
        <HolderTrend history={history} row={row} />
        {now !== null && now - row.checkedAt > 48 * 3600000 && <small className="holding-wallets-stale">Update overdue</small>}
      </div>)}
    </div>
    <details className="holding-wallets-updates">
      <summary>{relative}<ChevronDown className="holding-wallets-chevron" size={14} aria-hidden="true" /></summary>
      <div className="holding-wallets-update-details">
        <p>Checked daily. If a check fails, the last successful count stays visible.</p>
        <dl>{visible.map(row => <div key={row.issuer}><dt>{issuerName(row.issuer as IssuerId)}</dt><dd><time dateTime={new Date(row.checkedAt).toISOString()}>{exactTime(row.checkedAt)}</time></dd></div>)}</dl>
        {visible.length > 1 && <p>Issuers are checked at different times. The summary shows the oldest update.</p>}
      </div>
    </details>
  </section>;
}
