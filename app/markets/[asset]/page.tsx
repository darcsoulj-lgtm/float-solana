import { MARKET_ISSUER_SCOPE } from '@/lib/market-scope';
import type { Metadata } from 'next';
import { MarketOverviewPanel } from '@/components/market-overview';

type PageProps = {
  params: Promise<{ asset: string }>;
  searchParams: Promise<{ token?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { asset } = await params;
  const symbol = asset.toUpperCase();
  return {
    title: `${symbol} · Backpack tokenized stock`,
    description: `Explore Backpack-issued ${symbol}, with price, pool volume, liquidity and supply.`,
  };
}

export default async function Page({ params, searchParams }: PageProps) {
  const { asset } = await params;
  const { token } = await searchParams;
  return (
    <div className="public-markets">
      <MarketOverviewPanel issuerScope={MARKET_ISSUER_SCOPE}
        holdings={[]}
        hidePortfolio
        assetSymbol={asset}
        initialToken={token}
      />
    </div>
  );
}
