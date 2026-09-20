import type { Metadata } from 'next';
import { MarketOverviewPanel } from '@/components/market-overview';

export const metadata: Metadata = {
  title: 'Tokenized stock markets on Solana',
  description:
    'Explore tokenized stocks on Solana across issuers, with market prices, onchain value, volume and liquidity.',
};

export default function Page() {
  return (
    <div className="public-markets">
      <MarketOverviewPanel holdings={[]} hidePortfolio />
    </div>
  );
}
