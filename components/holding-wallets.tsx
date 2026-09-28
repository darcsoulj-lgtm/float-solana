'use client';
import { useEffect, useState } from 'react';
import initial from '@/public/data/issuer-holders.json';
import { parseHolderSnapshot, retainHolderSnapshot } from '@/lib/issuer-holders';
import { issuerName, type IssuerId } from '@/lib/tokens';
import { MetricInfo } from './metric-info';

export function HoldingWallets({ issuer }: { issuer?: IssuerId }) {
  const [rows, setRows] = useState(() => parseHolderSnapshot(initial));
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (document.hidden) return;
      try {
        const response = await fetch('/api/issuer-holders', { cache: 'no-cache', signal: controller.signal });
        if (!response.ok) return;
        const value: unknown = await response.json();
        if (!controller.signal.aborted) setRows(previous => retainHolderSnapshot(previous, value));
      } catch { /* Keep the last verified snapshot and its original date. */ }
    }
    void load();
    const timer = setInterval(() => void load(), 300000);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, []);
  const visible = rows?.filter(row => !issuer || row.issuer === issuer) ?? [];
  if (!visible.length) return null;
  return <section className="market-activity-panel holding-wallets-panel" aria-label="Holding wallets on Solana">
    <header><h3>Holding wallets · Solana</h3><MetricInfo label="How holding wallets are counted">
      Each address with a positive token balance counts once per issuer, even if it holds several tokens. The same address can count for different issuers. Wallets are not people: one person may use several, and pools, exchanges and issuer wallets are included. Counts combine observations taken at different times. Daily checks replace these saved counts only when verification succeeds.
    </MetricInfo></header>
    <div className="holding-wallets-grid">
      {visible.map(row => <div key={row.issuer}>
        <span>{issuerName(row.issuer as IssuerId)}</span>
        <strong>{row.wallets.toLocaleString('en-US')}</strong>
        <small>{row.tokens.toLocaleString('en-US')} tracked tokens</small>
        <small>Last checked <time dateTime={new Date(row.checkedAt).toISOString()}>{new Date(row.checkedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC</time></small>
      </div>)}
    </div>
  </section>;
}
