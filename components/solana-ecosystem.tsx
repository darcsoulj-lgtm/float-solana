'use client';

import Link from '@/components/site-link';
import { HoldingWallets } from './holding-wallets';
import { MetricInfo } from './metric-info';
import { OndoPrimaryVolume } from './ondo-primary-volume';
import { marketTokens } from '@/lib/market-data';
import { ChevronDown } from 'lucide-react';
import { ISSUERS, issuerName, type IssuerId } from '@/lib/tokens';
import { birdeyeTurnover } from '@/lib/birdeye-volume';
import { displayPoolActivity, trackedValuation } from '@/lib/token-observation';
import type { MarketOverview } from '@/lib/market-data';
import { useId, useState, useSyncExternalStore } from 'react';

type ActivityMetric = 'volume' | 'value';
const metricKey = 'float-issuer-overview-metric';
const metricEvent = 'float-issuer-overview-metric-change';
let unsavedMetric: ActivityMetric | null = null;
function defaultMetric(): ActivityMetric { return 'value'; }
function readMetric(): ActivityMetric {
  if (unsavedMetric !== null) return unsavedMetric ?? 'value';
  try {
    const saved = localStorage.getItem(metricKey);
    return saved === 'volume' || saved === 'value'
      ? saved : 'value';
  } catch {
    return unsavedMetric ?? 'value';
  }
}
function subscribeMetric(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener(metricEvent, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(metricEvent, notify);
  };
}
function setActivityMetric(metric: ActivityMetric) {
  unsavedMetric = metric;
  try { localStorage.setItem(metricKey, metric); unsavedMetric = null; } catch { /* Keep selection in memory when storage is unavailable. */ }
  window.dispatchEvent(new Event(metricEvent));
}

const usd = (n: number | null) =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(n);
function poolTiming(oldest: number | null, newest: number | null) {
  if (!oldest || !newest) return 'No observations available.';
  const format = (value: number) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `Observed ${format(oldest)}${newest !== oldest ? ` – ${format(newest)}` : ''}. Rolling 24h; update times vary.`;
}
export function SolanaEcosystem({
  data,
  now,
  onIssuer,
  issuerScope,
}: {
  data: MarketOverview | null;
  now: number;
  onIssuer: (id: IssuerId | 'all') => void;
  issuerScope?: IssuerId;
}) {
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const comparisonId = useId();
  const activityMetric = useSyncExternalStore(subscribeMetric, readMetric, defaultMetric);
  const tokens = marketTokens(data).filter((token) => !issuerScope || token.issuer === issuerScope);
  const visibleIssuers = ISSUERS.filter((issuer) => !issuerScope || issuer.id === issuerScope);
  const coverage = trackedValuation(data, now, issuerScope);
  const issuerActivity = visibleIssuers.map((issuer) => {
    const issuerTokens = tokens.filter((token) => token.issuer === issuer.id);
    const dashboard = displayPoolActivity(data, issuerTokens.map((token) => token.symbol), now);
    return {
      ...issuer,
      volume: dashboard.observedVolume24h,
      value:
        coverage.issuers.find((item) => item.id === issuer.id)?.total ?? null,
      pools: dashboard.pools,
      basis: issuer.id === 'xstocks' ? 'Circulating supply' : 'Total supply',
    };
  });
  const turnover = data?.tokenVolumes && issuerScope === 'backpack' ? birdeyeTurnover(data, tokens, now) : null;
  const marketActivity = displayPoolActivity(data, tokens.map((token) => token.symbol), now);
  const activityRows = issuerActivity.sort(
    (a, b) => (b[activityMetric] ?? 0) - (a[activityMetric] ?? 0),
  );
  const activityMax = Math.max(
    1,
    ...activityRows.map((issuer) => issuer[activityMetric] ?? 0),
  );
  const dexActivity = Object.values(
    marketActivity.pools.reduce(
      (groups, pool) => {
        const key = pool.dex.toLowerCase();
        const current = groups[key] ?? {
          name: pool.dex,
          volume: 0,
        };
        if (pool.volume24h != null) current.volume += pool.volume24h;
        groups[key] = current;
        return groups;
      },
      {} as Record<string, { name: string; volume: number }>,
    ),
  ).sort((a, b) => b.volume - a.volume);
  const dexMax = Math.max(
    1,
    ...dexActivity.map((dex) => dex.volume),
  );
  const valuationTimes = coverage.issuers
    .filter(issuer => issuer.total !== null && issuer.observedAt != null && issuer.observedAt > 0)
    .map(issuer => issuer.observedAt!);
  const oldestValuation = valuationTimes.length ? Math.min(...valuationTimes) : null;
  const historicalEstimateCount = coverage.valued.filter(row => row.lastIssuedValueHistoricalReference).length;
  const delayedObservedValues = historicalEstimateCount === 0 ? coverage.delayed : coverage.issuers.some(issuer =>
    issuer.total !== null && ((issuer.basis === 'circulating' && issuer.delayed) || issuer.valued.some(row =>
      !row.lastIssuedValueHistoricalReference && (row.valuationTime ? now - row.valuationTime > 3600000 : row.priceDelayed))));
  return (
    <section
      className="ecosystem-overview"
      aria-label={issuerScope ? `${issuerName(issuerScope)} tokenized stocks` : 'Tokenized stocks on Solana'}
      >
      <div className="ecosystem-heading">
        <h2>{issuerScope ? `${issuerName(issuerScope)} tokenized stocks` : 'Tokenized assets on Solana'}</h2>
      </div>
      <div className="ecosystem-stats">
        <div>
          <span className="metric-label">
            <span>Tokenized value</span>
            <MetricInfo label="About tokenized value" learnMore="/data-methodology#value">
              {issuerScope ? 'Estimated value of issued tokens, including issuer holdings.' : 'Estimated tokenized value on Solana. Supply basis varies by issuer.'}
              <br />{data ? `${coverage.valued.length} / ${coverage.rows.length} tokens included.` : 'Loading coverage.'}
              {oldestValuation && <><br />Oldest update: {new Date(oldestValuation).toLocaleString()}.</>}
              {historicalEstimateCount > 0 && <><br />Includes last stock prices × fresh minted supply.</>}
              {delayedObservedValues && <><br />Includes delayed data.</>}
              {coverage.mixedBases && <><br />Supply basis varies by issuer.</>}
            </MetricInfo>
          </span>
          <strong>{usd(coverage.total)}</strong>
          <small>
            {historicalEstimateCount > 0 ? historicalEstimateCount === coverage.valued.length ? 'Stock reference estimate' : 'Includes stock references' : coverage.delayed ? (coverage.partial ? 'Partial · delayed update' : 'Delayed update') : coverage.partial ? 'Partial coverage' : issuerScope ? '' : `${coverage.issuerCount}/${ISSUERS.length} issuers`}
          </small>
        </div>
        {issuerScope && <HoldingWallets issuer={issuerScope} compact expectedTokens={data ? tokens.length : undefined} />}
        <div>
          <span className="metric-label">
            <span>24h volume</span>
            <MetricInfo label="About market volume" learnMore="/data-methodology#pools">
              {turnover ? <>Birdeye DEX token volume. Trades between tracked tokens may count twice.<br />{turnover.covered} / {turnover.count} tokens included. Refreshed approximately every {data!.tokenVolumes!.intervalMs / 3600000} hours.<br />Oldest observation: {turnover.oldestAt ? new Date(turnover.oldestAt).toLocaleString() : 'Unavailable'}.</> : <>24-hour volume from verified DEX pools, counted once. Coverage may be incomplete.
              <br />{poolTiming(marketActivity.oldestAt, marketActivity.newestAt)}
              {data && <><br />{marketActivity.observedCount} / {marketActivity.knownCount} known pools included; {marketActivity.missingTokenCount} markets without observations.</>}
              {marketActivity.saved && <><br />Includes saved observations.</>}</>}
            </MetricInfo>
          </span>
          <strong>{usd(turnover ? turnover.total : marketActivity.observedVolume24h)}</strong>
          {turnover && <small>{turnover.covered < turnover.count ? `${turnover.covered} / ${turnover.count} tokens · ` : ''}{turnover.delayed ? 'Delayed update' : 'Periodic snapshot'}</small>}
          {!turnover && data && marketActivity.partial && <small><Link href="/data-methodology#pools">Incomplete coverage</Link></small>}
        </div>
        <div>
          <span className="metric-label">
            <span>Tracked tokens</span>
            <MetricInfo label="About tracked tokens" learnMore="/data-methodology#prices">Verified listings. New supported tokens are added automatically.</MetricInfo>
          </span>
          <strong>{data ? tokens.length.toLocaleString() : '—'}</strong>
          {!issuerScope && <small>{new Set(tokens.map((t) => t.underlyingSymbol)).size.toLocaleString()} assets</small>}
        </div>
      </div>


      {!issuerScope && <>
      <button className="mobile-issuer-toggle" type="button" aria-expanded={comparisonOpen} aria-controls={comparisonId} onClick={() => setComparisonOpen(open => !open)}>
        Compare issuers <ChevronDown size={16} aria-hidden="true" />
      </button>
      <section
        id={comparisonId}
        data-mobile-open={comparisonOpen}
        className="market-activity-panel issuer-overview-panel"
        aria-labelledby="market-activity-title"
      >
        <header>
          <div>
            <h3 id="market-activity-title">Issuer overview</h3>
          </div>
          <label>
            <span className="sr-only">Issuer overview metric</span>
            <select
              value={activityMetric}
              onChange={(event) =>
                setActivityMetric(
                  event.target.value as ActivityMetric,
                )
              }
            >
              <option value="value">Tokenized value</option>
              <option value="volume">Tracked pool volume · 24h</option>
            </select>
          </label>
        </header>
        <div className="issuer-activity-chart">
          {activityRows.map((item) => (
            <button
              key={item.id}
              type="button"
              className="issuer-activity-row"
              onClick={() => onIssuer(item.id)}
              aria-label={`Filter stocks by ${item.name}`}
            >
              <span className="issuer-activity-name">{item.name}</span>
              <span className="issuer-activity-track" aria-hidden="true">
                <span
                  style={{
                    width: `${((item[activityMetric] ?? 0) / activityMax) * 100}%`,
                  }}
                />
              </span>
              <strong>{usd(item[activityMetric])}</strong>
              {activityMetric === 'value' && <small>{item.basis}</small>}
            </button>
          ))}
          {!activityRows.length && (
            <p className="issuer-activity-empty">
              Waiting for current market observations.
            </p>
          )}
        </div>
        {activityMetric === 'volume' && <OndoPrimaryVolume data={data} now={now} />}
        <p className="market-activity-scope">
          {activityMetric === 'value' ? (
            <>
              Mixed supply bases{' '}
              <MetricInfo label="About issuer values" learnMore="/data-methodology#value">
                Supply basis varies by issuer.
              </MetricInfo>
            </>
          ) : (
            <>
              Observed DEX pool coverage · partial{' '}
              <MetricInfo label="About issuer activity" learnMore="/data-methodology#pools">
                Tracked pools only. Shared pools can appear in both issuer totals.
              </MetricInfo>
            </>
          )}
        </p>
        {activityMetric !== 'value' && (
          <details className="market-dex-breakdown">
            <summary>View DEX breakdown</summary>
            <h4>DEX activity</h4>
            {dexActivity.slice(0, 5).map((dex) => {
              const value = dex.volume;
              return (
                <div className="market-dex-row" key={dex.name}>
                  <span>{dex.name}</span>
                  <span className="market-dex-track" aria-hidden="true">
                    <span style={{ width: `${(value / dexMax) * 100}%` }} />
                  </span>
                  <strong>{usd(value)}</strong>
                </div>
              );
            })}
            {!dexActivity.length && (
              <p className="issuer-activity-empty">
                No saved pool data available.
              </p>
            )}
          </details>
        )}
      </section>
      </>}
    </section>
  );
}
