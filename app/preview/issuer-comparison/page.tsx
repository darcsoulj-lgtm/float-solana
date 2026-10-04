import { notFound } from 'next/navigation';
import { IssuerComparisonCard } from '@/components/issuer-comparison';
import type { IssuerComparison } from '@/lib/issuer-comparison';

// Development-only design review. Never inject fixtures into public readers.
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const now = Date.parse('2026-10-03T12:00:00Z');
  const comparison: IssuerComparison = {
    version: 1, chain: 'solana', source: 'birdeye', window: '24h', total: 150000000,
    oldestAt: now - 2 * 3600000, newestAt: now - 2 * 3600000,
    collectedFrom: now - 3600000, collectedTo: now - 3600000,
    rows: [{ issuer: 'backpack', usd24h: 78000000, tokens: 71 },
      { issuer: 'xstocks', usd24h: 62000000, tokens: 832 },
      { issuer: 'ondo', usd24h: 10000000, tokens: 438 }],
  };
  return <div className="public-markets">
    <p style={{ margin: '12px 0', color: 'var(--muted-foreground)', fontSize: 12 }}>Design preview · Sample data</p>
    <h1 style={{ fontSize: 30, letterSpacing: '-.03em', marginBottom: 8 }}>Markets</h1>
    <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>Solana tokenized stocks</p>
    <IssuerComparisonCard comparison={comparison} now={now} />
    <div className="market-search-row"><label htmlFor="comparison-preview-search">Search markets<input id="comparison-preview-search" type="search" placeholder="Search company, symbol or token" /></label></div>
  </div>;
}
