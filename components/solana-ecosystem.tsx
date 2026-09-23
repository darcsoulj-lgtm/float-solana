'use client';

import { MetricInfo } from './metric-info';
import { marketTokens } from '@/lib/market-data';
import { ArrowUpRight } from 'lucide-react';
import { ISSUERS, type IssuerId } from '@/lib/tokens';
import { displayPoolActivity, trackedValuation } from '@/lib/token-observation';
import type { MarketOverview } from '@/lib/market-data';
import { POOL_SCOPE } from '@/lib/stock-pools';
import { useState } from 'react';
import { MarketActivityHistory } from './market-activity-history';
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
  return `Observed ${format(oldest)}${newest !== oldest ? ` – ${format(newest)}` : ''}. Volume combines 24-hour windows ending at those times; it is not a synchronized live total.`;
}
export function SolanaEcosystem({
  data,
  now,
  onIssuer,
  select,
  historyReady,
  hasSavedFigures = false,
}: {
  data: MarketOverview | null;
  now: number;
  onIssuer: (id: IssuerId | 'all') => void;
  select: (symbol: string) => void;
  historyReady: boolean;
  hasSavedFigures?: boolean;
}) {
  const [activityMetric, setActivityMetric] = useState<
    'volume' | 'liquidity' | 'value'
  >('volume');
  const tokens = marketTokens(data);
  const coverage = trackedValuation(data, now);
  const issuerActivity = ISSUERS.map((issuer) => {
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
      aria-label="Tokenized stocks on Solana"
      >
      <div className="ecosystem-heading">
        <h2>Tokenized assets on Solana</h2>
      </div>
      {(hasSavedFigures || marketActivity.saved || coverage.delayed) && (
        <p className="market-data-note">
          Some figures use saved data
          <MetricInfo label="About saved market data">
            Updates run automatically. Saved prices and pool figures are kept for up to 24 hours. Use the info icons for observation times. Saved volume covers the 24 hours before each observation, not necessarily the latest 24 hours.
          </MetricInfo>
        </p>
      )}
      <div className="ecosystem-stats">
        <div>
          <span className="metric-label">
            <span>Tracked value · est.</span>
            <MetricInfo label="About tracked value">
              An estimate for tracked tokens on Solana. Issuers count supply differently, so this is not a company market cap.
            </MetricInfo>
          </span>
          <strong>{usd(coverage.total)}</strong>
          <small>
            {coverage.partial ? 'Partial coverage' : `${coverage.issuerCount}/${ISSUERS.length} issuers`}
          </small>
        </div>
        <div>
          <span className="metric-label">
            <span>DEX volume · 24h</span>
            <MetricInfo label="About market volume">
              {POOL_SCOPE} {poolTiming(marketActivity.oldestAt, marketActivity.newestAt)}
            </MetricInfo>
          </span>
          <strong>{usd(marketActivity.volume24h)}</strong>
        </div>
        <div>
          <span className="metric-label">
            <span>Pool liquidity</span>
            <MetricInfo label="About market liquidity">
              Money in the reviewed Solana pools we found. Each pool is counted once. {poolTiming(marketActivity.oldestAt, marketActivity.newestAt)}
            </MetricInfo>
          </span>
          <strong>{usd(marketActivity.liquidity)}</strong>
        </div>
        <div>
          <span>Tracked tokens</span>
          <strong>{tokens.length.toLocaleString()}</strong>
          <small>
            {new Set(
              tokens.map((t) => t.underlyingSymbol),
            ).size.toLocaleString()}{' '}
            assets
          </small>
        </div>
      </div>

      <MarketActivityHistory ready={historyReady} now={now} />

      <section
        className="market-activity-panel"
        aria-labelledby="market-activity-title"
      >
        <header>
          <div>
            <h3 id="market-activity-title">Issuer activity</h3>
          </div>
          <label>
            <span className="sr-only">Activity metric</span>
            <select
              value={activityMetric}
              onChange={(event) =>
                setActivityMetric(
                  event.target.value as 'volume' | 'liquidity' | 'value',
                )
              }
            >
              <option value="volume">DEX volume · 24h</option>
              <option value="liquidity">Pool liquidity</option>
              <option value="value">Tracked value · est.</option>
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
        <p className="market-activity-scope">
          {activityMetric === 'value' ? (
            <>
              Mixed supply bases{' '}
              <MetricInfo label="About issuer values">
                Issuers count supply differently. These are estimates, not comparable market caps.
              </MetricInfo>
            </>
          ) : (
            <>
              Observed DEX pool coverage · partial{' '}
              <MetricInfo label="About issuer activity">
                {POOL_SCOPE} A shared pool can appear for two issuers, so do not add issuer totals together. {poolTiming(marketActivity.oldestAt, marketActivity.newestAt)}
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
      <details className="market-methodology coverage-diagnostics">
        <summary>What this market total means</summary>
        <p>
          <strong>Tracked value · est.: {usd(coverage.total)}</strong> ·{' '}
          {coverage.issuerCount} / {ISSUERS.length} issuers
          {coverage.partial && ' · Partial coverage'}
          {coverage.delayed && ' · Includes delayed data'}
          {coverage.mixedBases && ' · Mixed supply bases'}
        </p>
        <p>
          This is the combined estimate for issuers Float tracks. It is not the whole Solana market or a standard market-cap number. Missing values are left out, not counted as zero.
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
        <p>
          xStocks uses its reported circulating tokens and reference prices. Ondo uses its reported Solana supply and USD value. Other issuers use price × tokens minted on Solana. Those estimates can include issuer-held tokens, so the total is not circulating AUM.
        </p>
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
        <h3>Important limits</h3>
        <p>
          Each token is counted once. Tokens from different issuers are different products, even when they track the same company. Other chains and unclear values are left out.
        </p>
        <p>
          Membership checks a token balance. It does not prove shareholder status. Rights and eligibility depend on the issuer.
        </p>
        <nav>
          <a
            href="https://api.llama.fi/protocol/ondo-global-markets"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ondo valuation data ↗
          </a>
          {ISSUERS.map((i) => (
            <a
              key={i.id}
              href={i.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {i.name} ↗
            </a>
          ))}
        </nav>
      </details>
    </section>
  );
}
