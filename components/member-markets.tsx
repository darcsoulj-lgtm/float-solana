'use client';
import { lazy, Suspense } from 'react';
import type { Holding } from '@/lib/community-types';
import type { MarketView } from '@/lib/member-navigation';
import { MARKET_ISSUER_SCOPE } from '@/lib/market-scope';
import { loadClientModule } from '@/lib/client-module';
const MarketOverviewPanel = lazy(() =>
  loadClientModule(() => import('./market-overview')).then((m) => ({ default: m.MarketOverviewPanel })),
);
// Old issuer links land on the current Markets scope; membership is unchanged.
export function MemberMarkets({ positions }: {
  positions: Holding[];
  market: MarketView;
  onMarketChange: (market: MarketView) => void;
}) {
  return <div className="member-markets">
    <header className="mobile-market-heading"><span>Backpack tokenized stocks</span><h1>Markets</h1></header>
    <Suspense fallback={<output className="inline-status">Loading markets…</output>}>
      <MarketOverviewPanel holdings={positions.map(p => p.symbol)} positions={positions} hidePortfolio issuerScope={MARKET_ISSUER_SCOPE} />
    </Suspense>
  </div>;
}
