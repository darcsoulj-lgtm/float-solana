'use client';
import { Activity, lazy, Suspense, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Holding } from '@/lib/community-types';
import { ISSUERS } from '@/lib/tokens';
import type { MarketView } from '@/lib/member-navigation';
import { loadClientModule } from '@/lib/client-module';
const MarketOverviewPanel = lazy(() =>
  loadClientModule(() => import('./market-overview')).then((m) => ({
    default: m.MarketOverviewPanel,
  })),
);
const IssuerDashboardPage = lazy(() =>
  loadClientModule(() => import('./issuer-dashboard')).then((m) => ({
    default: m.IssuerDashboardPage,
  })),
);
export function MemberMarkets({
  positions,
  market,
  onMarketChange,
}: {
  positions: Holding[];
  market: MarketView;
  onMarketChange: (market: MarketView) => void;
}) {
  const [visited, setVisited] = useState<Set<MarketView>>(
    () => new Set([market]),
  );
  if (!visited.has(market)) setVisited(new Set([...visited, market]));
  return (
    <div className="member-markets">
      {market === 'all' && <h1 className="sr-only">Markets</h1>}
      {market !== 'all' && (
        <button className="market-back" onClick={() => onMarketChange('all')}>
          <ArrowLeft size={16} />
          All markets
        </button>
      )}
      {visited.has('all') && (
        <Activity mode={market === 'all' ? 'visible' : 'hidden'}>
          <Suspense
            fallback={
              <p className="inline-status" role="status">
                Loading markets…
              </p>
            }
          >
            <MarketOverviewPanel
              holdings={positions.map((p) => p.symbol)}
              positions={positions}
              hidePortfolio
              onIssuer={onMarketChange}
            />
          </Suspense>
        </Activity>
      )}
      {ISSUERS.filter((issuer) => visited.has(issuer.id)).map((issuer) => (
        <Activity
          key={issuer.id}
          mode={market === issuer.id ? 'visible' : 'hidden'}
        >
          <Suspense
            fallback={
              <p className="inline-status" role="status">
                Loading {issuer.name}…
              </p>
            }
          >
            <IssuerDashboardPage issuer={issuer.id} embedded />
          </Suspense>
        </Activity>
      ))}
    </div>
  );
}
