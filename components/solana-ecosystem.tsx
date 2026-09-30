'use client';

import Link from '@/components/site-link';
import { HoldingWallets } from './holding-wallets';
import { MetricInfo } from './metric-info';
import { OndoPrimaryVolume } from './ondo-primary-volume';
import { marketTokens } from '@/lib/market-data';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { ISSUERS, issuerName, type IssuerId } from '@/lib/tokens';
import { displayPoolActivity, trackedValuation } from '@/lib/token-observation';
import type { MarketOverview } from '@/lib/market-data';
import { useId, useState, useSyncExternalStore } from 'react';

type ActivityMetric = 'volume' | 'liquidity' | 'value';
const metricKey = 'float-issuer-overview-metric';
const metricEvent = 'float-issuer-overview-metric-change';
let unsavedMetric: ActivityMetric | null = null;
function defaultMetric(): ActivityMetric { return 'value'; }
function readMetric(): ActivityMetric {
  if (unsavedMetric !== null) return unsavedMetric ?? 'value';
  try {
    const saved = localStorage.getItem(metricKey);
    return saved === 'volume' || saved === 'liquidity' || saved === 'value'
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
  return `Observed ${format(oldest)}${newest !== oldest ? ` – ${format(newest)}` : ''}. Each volume covers the prior 24 hours. Update times differ; this is not a live total.`;
}
export function SolanaEcosystem({
  data,
  now,
  onIssuer,
  select,
  hasSavedFigures = false,
  issuerScope,
}: {
  data: MarketOverview | null;
  now: number;
  onIssuer: (id: IssuerId | 'all') => void;
  select: (symbol: string) => void;
  hasSavedFigures?: boolean;
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
      volume: dashboard.volume24h,
      liquidity: dashboard.liquidity,
      value:
        coverage.issuers.find((item) => item.id === issuer.id)?.total ?? null,
      pools: dashboard.pools,
      basis: issuer.id === 'xstocks' ? 'Circulating value' : 'Minted value',
    };
  });
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
          liquidity: 0,
        };
        if (pool.volume24h != null) current.volume += pool.volume24h;
        if (pool.liquidity != null) current.liquidity += pool.liquidity;
        groups[key] = current;
        return groups;
      },
      {} as Record<string, { name: string; volume: number; liquidity: number }>,
    ),
  ).sort((a, b) =>
    activityMetric === 'liquidity'
      ? b.liquidity - a.liquidity
      : b.volume - a.volume,
  );
  const dexMax = Math.max(
    1,
    ...dexActivity.map((dex) =>
      activityMetric === 'liquidity' ? dex.liquidity : dex.volume,
    ),
  );
  const leaders = [...coverage.valued]
    .sort((a, b) => b.value! - a.value!)
    .slice(0, 5);
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
            <span>Tracked value</span>
            <MetricInfo label="About tracked value" learnMore="/data-methodology#value">
              {issuerScope ? 'Estimated price × minted Backpack tokens, including issuer holdings. Not the companies’ market cap.' : 'Estimated value of the Solana tokens we track. Supply rules vary by issuer. This is not the stock companies’ market cap.'}
            </MetricInfo>
          </span>
          <strong>{usd(coverage.total)}</strong>
          <small>
            {coverage.partial ? 'Partial coverage' : issuerScope ? 'Minted token value' : `${coverage.issuerCount}/${ISSUERS.length} issuers`}
          </small>
        </div>
        {issuerScope && <HoldingWallets issuer={issuerScope} compact />}
        <div>
          <span className="metric-label">
            <span>Tracked pool volume · 24h</span>
            <MetricInfo label="About market volume" learnMore="/data-methodology#pools">
              Trading in the pools we track over 24 hours. Coverage is partial; update times differ.
            </MetricInfo>
          </span>
          <strong>{usd(marketActivity.volume24h)}</strong>
        </div>
        <div>
          <span className="metric-label">
            <span>Pool liquidity</span>
            <MetricInfo label="About market liquidity" learnMore="/data-methodology#pools">
              Value of tokens in tracked trading pools. Coverage is partial; this is not a guaranteed sell amount.
            </MetricInfo>
          </span>
          <strong>{usd(marketActivity.liquidity)}</strong>
        </div>
        {!issuerScope && <div>
          <span>Tracked tokens</span>
          <strong>{tokens.length.toLocaleString()}</strong>
          <small>
            {new Set(
              tokens.map((t) => t.underlyingSymbol),
            ).size.toLocaleString()}{' '}
            assets
          </small>
        </div>}
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
                  event.target.value as 'volume' | 'liquidity' | 'value',
                )
              }
            >
              <option value="value">Tracked value</option>
              <option value="volume">Tracked pool volume · 24h</option>
              <option value="liquidity">Pool liquidity</option>
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
                Supply rules vary by issuer, so these estimates are not directly comparable.
              </MetricInfo>
            </>
          ) : (
            <>
              Observed DEX pool coverage · partial{' '}
              <MetricInfo label="About issuer activity" learnMore="/data-methodology#pools">
                Tracked pools only. Shared pools can appear under two issuers—do not add these totals together.
              </MetricInfo>
            </>
          )}
        </p>
        {activityMetric !== 'value' && (
          <details className="market-dex-breakdown">
            <summary>View DEX breakdown</summary>
            <h4>DEX activity</h4>
            {dexActivity.slice(0, 5).map((dex) => {
              const value =
                activityMetric === 'liquidity' ? dex.liquidity : dex.volume;
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
      <details className="market-methodology coverage-diagnostics">
        <summary>Current coverage</summary>
        <p>{poolTiming(marketActivity.oldestAt, marketActivity.newestAt)}</p>
        {(hasSavedFigures || marketActivity.saved || coverage.delayed) && <p>Some figures use saved data. <Link href="/data-methodology#updates">Update rules →</Link></p>}
        <p>
          <strong>Tracked value: {usd(coverage.total)}</strong> ·{' '}
          {issuerScope ? `${coverage.valued.length} / ${tokens.length} tokens valued` : `${coverage.issuerCount} / ${visibleIssuers.length} issuers`}
          {coverage.partial && ' · Partial coverage'}
          {coverage.delayed && ' · Includes delayed data'}
          {coverage.mixedBases && ' · Mixed supply bases'}
        </p>
        <div className="market-table-scroll">
          <table className="market-table">
            <caption className="sr-only">Valuation coverage by issuer</caption>
            <thead>
              <tr>
                <th>Issuer</th>
                <th>Value</th>
                <th>Basis</th>
                <th>Valued</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {coverage.issuers.map((c) => {
                return (
                  <tr key={c.id}>
                    <th scope="row">{c.name}</th>
                    <td>{usd(c.total)}</td>
                    <td>{c.label}</td>
                    <td>
                      {c.valued.length} / {c.rows.length}
                    </td>
                    <td>
                      {c.total === null
                        ? 'Unavailable'
                        : c.delayed
                        ? `Checked ${new Date(c.observedAt!).toLocaleString()}`
                          : c.valued.some((r) => r.priceDelayed)
                          ? 'Includes older prices'
                            : 'Recently checked'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3>Largest tracked values</h3>
        {leaders.map((r) => (
          <button
            key={r.symbol}
            type="button"
            className="ecosystem-rank"
            onClick={() => {
              onIssuer('all');
              select(r.symbol);
            }}
          >
            <b>{r.symbol}</b>
            <strong>{usd(r.value)}</strong>
            <ArrowUpRight size={15} />
          </button>
        ))}
        {!leaders.length && <p>Waiting for current prices and supply.</p>}
        <Link href="/data-methodology#value">How tracked value is calculated →</Link>
      </details>
    </section>
  );
}
