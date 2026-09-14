'use client';

import Link from '@/components/site-link';
import { marketTokens } from '@/lib/market-data';
import { ArrowUpRight } from 'lucide-react';
import { ISSUERS, type IssuerId } from '@/lib/tokens';
import { trackedValuation } from '@/lib/token-observation';
import type { MarketOverview } from '@/lib/market-data';
import { useStonkfun } from '@/hooks/use-stonkfun';
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
  const tokens = marketTokens(data);
  const coverage = trackedValuation(data, now);
  const stonkfun = useStonkfun();
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
          <span>Tokens</span>
          <strong>{tokens.length.toLocaleString()}</strong>
          <small>{ISSUERS.length} issuers tracked</small>
        </div>
        <div>
          <span>Underlying assets</span>
          <strong>
            {new Set(
              tokens.map((t) => t.underlyingSymbol),
            ).size.toLocaleString()}
          </strong>
          <small>Stocks, ETFs & private-company exposure</small>
        </div>
      </div>
      <section className="ecosystem-linked" aria-labelledby="linked-activity-title">
        <div className="ecosystem-linked-heading">
          <div>
            <div className="ecosystem-linked-title">
              <h3 id="linked-activity-title">Stock-linked ecosystem</h3>
              <span className="ecosystem-source-pill">Stonkfun data</span>
            </div>
            <p>
              Launchpad activity linked to a listed stock. Kept separate from
              stock prices, market cap and DEX volume.
            </p>
          </div>
          <a
            href="https://www.stonkfun.xyz/developers"
            target="_blank"
            rel="noopener noreferrer"
            className="ecosystem-linked-source"
          >
            API docs <ArrowUpRight size={14} />
          </a>
        </div>
        {stonkfun.busy && !stonkfun.source?.data && (
          <output className="ecosystem-linked-loading">
            Loading linked activity…
          </output>
        )}
        {stonkfun.error && !stonkfun.source?.data && (
          <p className="ecosystem-linked-empty">
            Linked activity is temporarily unavailable. Stock metrics are not
            affected.
          </p>
        )}
        {!stonkfun.busy && !stonkfun.error && !stonkfun.source?.data && (
          <p className="ecosystem-linked-empty">
            No linked activity is available yet. Stock metrics are not
            affected.
          </p>
        )}
        {stonkfun.source?.data && (
          <>
            <div className="ecosystem-linked-stats">
              <div>
                <span>Linked launches</span>
                <strong>{stonkfun.source.data.linkedLaunches}</strong>
              </div>
              <div>
                <span>Active pairs</span>
                <strong>{stonkfun.source.data.activePairs}</strong>
              </div>
              <div>
                <span>24h launch volume</span>
                <strong>{usd(stonkfun.source.data.volume24hUsd)}</strong>
              </div>
            </div>
            {stonkfun.source.data.rows.length > 0 ? (
              <div className="ecosystem-linked-list">
                {stonkfun.source.data.rows.slice(0, 5).map((row) => (
                  <div
                    className="ecosystem-linked-row"
                    key={`${row.mint}:${row.stockMint}`}
                  >
                    <div className="ecosystem-linked-asset">
                      <b>{row.symbol}</b>
                      <small>
                        linked to {row.stockSymbol}
                        {row.quoteSymbol ? ` · ${row.quoteSymbol}` : ''}
                      </small>
                    </div>
                    <div className="ecosystem-linked-value">
                      <span>{usd(row.volume24hUsd)} 24h</span>
                      <small>{usd(row.marketCapUsd)} market cap</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ecosystem-linked-empty">
                No linked launches were found in the current Stonkfun feed.
              </p>
            )}
            <p className="ecosystem-linked-footnote">
              Coverage: Stonkfun’s top-volume and newest public feeds (up to
              200 records). This is an activity sample, not a complete launch
              count.{' '}
              {stonkfun.source.fetchedAt
                ? `Last checked ${new Date(stonkfun.source.fetchedAt).toLocaleString()}. `
                : ''}
              {stonkfun.source.stale ? 'Last saved data is shown.' : ''}
            </p>
          </>
        )}
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
        <p>
          Stonkfun activity is a separate launchpad overlay. We include only
          records where one side of the pair matches a verified Float Solana
          stock mint. It never enters stock valuation, DEX volume or issuer
          totals.
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
