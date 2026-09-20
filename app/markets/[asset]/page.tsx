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
    title: `${symbol} tokenized markets on Solana`,
    description: `Compare verified tokenized versions of ${symbol} on Solana by issuer, price, volume, liquidity and supply.`,
  };
}

export default async function Page({ params, searchParams }: PageProps) {
  const { asset } = await params;
  const { token } = await searchParams;
  return (
    <div className="public-markets">
      <MarketOverviewPanel
        holdings={[]}
        hidePortfolio
        assetSymbol={asset}
        initialToken={token}
      />
    </div>
  );
}
