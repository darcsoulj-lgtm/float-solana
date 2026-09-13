'use client';
import { Activity, lazy, Suspense, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Holding } from '@/lib/community-types';
import type { MarketView } from '@/lib/member-navigation';
const MarketOverviewPanel = lazy(() =>
  import('./market-overview').then((m) => ({ default: m.MarketOverviewPanel })),
);
const BackpackDashboardPage = lazy(() =>
  import('./backpack-dashboard').then((m) => ({
    default: m.BackpackDashboardPage,
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
      {market === 'backpack' && (
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
              onBackpack={() => onMarketChange('backpack')}
            />
          </Suspense>
        </Activity>
      )}
      {visited.has('backpack') && (
        <Activity mode={market === 'backpack' ? 'visible' : 'hidden'}>
          <Suspense
            fallback={
              <p className="inline-status" role="status">
                Loading Backpack…
              </p>
            }
          >
            <BackpackDashboardPage embedded />
          </Suspense>
        </Activity>
      )}
    </div>
  );
}
