import Link from '@/components/site-link';
import { MARKET_ISSUER_SCOPE } from '@/lib/market-scope';
import type { Metadata } from 'next';
import { MarketOverviewPanel } from '@/components/market-overview';

export const metadata: Metadata = {
  title: 'Backpack tokenized stocks',
  description:
    'Explore Backpack tokenized stocks, tokenized value, prices and DEX volume.',
};

export default function Page() {
  return (
    <div className="public-markets">
      {process.env.NODE_ENV === 'development' && <p style={{ padding: '12px 0', fontSize: 14 }}><Link href="/preview/social">Preview chart posts & portfolio snapshots ↗</Link></p>}
      <MarketOverviewPanel issuerScope={MARKET_ISSUER_SCOPE} holdings={[]} hidePortfolio />
    </div>
  );
}
