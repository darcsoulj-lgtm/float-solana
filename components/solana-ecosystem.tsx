'use client';

import Link from '@/components/site-link';
import { marketTokens } from '@/lib/market-data';
import { ArrowUpRight } from 'lucide-react';
import { ISSUERS, type IssuerId } from '@/lib/tokens';
import { tokenObservation, trackedValuation } from '@/lib/token-observation';
import type { MarketOverview } from '@/lib/market-data';
import { poolMetrics, POOL_SCOPE } from '@/lib/stock-pools';
import { useState } from 'react';
const usd = (n: number | null) =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(n);
export function SolanaEcosystem({
  data,
  now,
  onIssuer,
  select,
}: {
  data: MarketOverview | null;
  now: number;
  onIssuer: (id: IssuerId | 'all') => void;
  select: (symbol: string) => void;
}) {
  const [activityMetric, setActivityMetric] = useState<
    'volume' | 'liquidity' | 'value'
  >('volume');
  const tokens = marketTokens(data);
  const coverage = trackedValuation(data, now);
  const issuerActivity = ISSUERS.map((issuer) => {
    const issuerTokens = tokens.filter((token) => token.issuer === issuer.id);
    const pools = issuerTokens.flatMap((token) => {
      const poolTime =
        data?.pools.asOf?.[token.symbol] ?? data?.pools.fetchedAt ?? 0;
      if (
        !data?.pools ||
        data.pools.stale ||
        !poolTime ||
        poolTime > now + 60000 ||
        now - poolTime >= 300000
      )
        return [];
      return data.pools.data?.[token.symbol] ?? [];
    });
    const dashboard = poolMetrics(pools);
    const values = issuerTokens.map((token) =>
      tokenObservation(data, token.symbol, now),
    );
    return {
      ...issuer,
      volume: dashboard.volume24h,
      liquidity: dashboard.liquidity,
      value:
        values
          .map((observation) =>
            issuer.id === 'xstocks'
              ? (observation.circulatingValue ??
                observation.lastCirculation?.valueUsd ??
                null)
              : observation.issuedValue,
          )
          .filter((value): value is number => value !== null)
          .reduce((sum, value) => sum + value, 0) || null,
      pools: dashboard.pools,
      basis: issuer.id === 'xstocks' ? 'Circulating value' : 'Minted value',
    };
  });
  const marketPools = issuerActivity.flatMap((issuer) => issuer.pools);
  const marketActivity = poolMetrics(marketPools);
  const activityRows = issuerActivity
    .filter((issuer) => issuer[activityMetric] !== null)
    .sort((a, b) => (b[activityMetric] ?? 0) - (a[activityMetric] ?? 0));
  const activityMax = Math.max(
    1,
    ...activityRows.map((issuer) => issuer[activityMetric] ?? 0),
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
        <h2>Tokenized Stocks on Solana</h2>
        <Link href="/tokens" className="market-chain">
          Coverage ↗
        </Link>
      </div>
      <div className="ecosystem-stats">
        <div>
          <span>Tracked onchain value · est.</span>
          <strong>{usd(coverage.total)}</strong>
          <small>
            {coverage.issuerCount} / {ISSUERS.length} issuers
            {coverage.partial ? ' · Partial coverage' : ''}
            {coverage.delayed ? ' · Includes dated values' : ''}
          </small>
        </div>
        <div>
          <span>Eligible DEX volume · 24h</span>
          <strong>{usd(marketActivity.volume24h)}</strong>
          <small>Verified pools · each pool counted once</small>
        </div>
        <div>
          <span>Pool liquidity</span>
          <strong>{usd(marketActivity.liquidity)}</strong>
          <small>Observed eligible Solana pools</small>
        </div>
        <div>
          <span>Tokens · tokenized stocks</span>
          <strong>{tokens.length.toLocaleString()}</strong>
          <small>
            {new Set(
              tokens.map((t) => t.underlyingSymbol),
            ).size.toLocaleString()}{' '}
            Underlying assets
          </small>
        </div>
      </div>

      <section
        className="market-activity-panel"
        aria-labelledby="market-activity-title"
      >
        <header>
          <div>
            <h3 id="market-activity-title">Issuer activity</h3>
            <p>
              Current verified snapshot · select an issuer to filter the stock
              list
            </p>
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
                    width: `${Math.max(2, ((item[activityMetric] ?? 0) / activityMax) * 100)}%`,
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
          {activityMetric === 'value'
            ? 'Issuer values use different, explicitly labelled supply bases. They are estimates, not a uniform market-cap measure.'
            : POOL_SCOPE}
        </p>
      </section>
      <details className="market-methodology coverage-diagnostics">
        <summary>Coverage &amp; methodology</summary>
        <p>
          <strong>Tracked value · est.: {usd(coverage.total)}</strong> ·{' '}
          {coverage.issuerCount} / {ISSUERS.length} issuers
          {coverage.partial && ' · Partial coverage'}
          {coverage.delayed && ' · Includes delayed data'}
          {coverage.mixedBases && ' · Mixed supply bases'}
        </p>
        <p>
          This is the sum for Float’s tracked issuers, not the total Solana
          market or a circulating market-cap measure. All quantities are on
          Solana. Supply bases differ: it is not a uniform measure of
          circulating value. Missing values are excluded, never counted as zero.
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
                          ? `Last verified ${new Date(c.observedAt!).toLocaleString()}`
                          : c.valued.some((r) => r.priceDelayed)
                            ? 'Includes dated reference prices'
                            : 'Within freshness limits'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p>
          xStocks: issuer-adjusted circulating quantities and collateral
          reference prices, using the same units as its dashboard. HKD quotes
          are converted with dated ECB reference rates. Updated every 10
          minutes; reference prices may be up to 72 hours old. During an outage,
          the last verified circulation snapshot is shown with its original date
          for up to 24 hours. No multiplier is applied twice. Ondo uses
          DefiLlama’s paired Solana token supplies and USD valuations, with the
          original snapshot timestamp (at most 36 hours old). This avoids mixing
          raw token units with adjusted share prices. It includes supported
          stocks and ETFs; cash tokens are excluded. Other issuers use price ×
          Solana mint supply, subject to price freshness, unit and conflict
          checks. Their minted estimates can include issuer inventory. Adding
          them gives an estimated tracked value, not circulating AUM.
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
        <h3>Methodology &amp; rights</h3>
        <p>
          Each mint is counted once. Different issuers’ tokens remain separate
          products, even when they reference the same company. No cross-chain
          balances or underlying-company market caps are included. Missing or
          unit-ambiguous valuations are excluded.
        </p>
        <p>
          Membership verifies a token balance, not registered shareholder
          status. Custody, redemption, eligibility and economic rights differ by
          issuer. Private-company products can provide indirect exposure.
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
