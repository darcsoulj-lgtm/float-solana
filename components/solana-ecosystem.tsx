import { MetricInfo } from './metric-info';
import { ArrowUpRight } from 'lucide-react';
import { TOKENS, ISSUERS, type IssuerId } from '@/lib/tokens';
import { trackedValuation } from '@/lib/token-observation';
import type { MarketOverview } from '@/lib/market-data';
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
  const coverage = trackedValuation(data, now);
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
        <a href="/tokens" className="market-chain">
          Coverage ↗
        </a>
      </div>
      <div className="ecosystem-stats">
        <div>
          <span className="metric-label">
            Tracked value · est.
            <MetricInfo label="About the tracked Solana total">
              Sum of the issuer estimates below, on Solana only. xStocks uses
              circulation excluding pre-minted inventory; the other issuers use
              minted supply and may include inventory. This mixed-basis estimate
              is not circulating market cap or all-chain AUM. Missing values are
              excluded. Details and dates are in Coverage &amp; methodology.
            </MetricInfo>
          </span>
          <strong>{usd(coverage.total)}</strong>
          {coverage.delayed && <small>Includes delayed data</small>}
          {coverage.total === null && (
            <small>
              {data?.circulation?.refreshing
                ? 'Updating issuer data…'
                : 'Issuer data temporarily unavailable'}
            </small>
          )}
          <small>
            {coverage.issuerCount} / {ISSUERS.length} issuers
            {coverage.partial && ' · Partial coverage'}
            {coverage.mixedBases && ' · Mixed supply bases'}
          </small>
        </div>
        <div>
          <span>Tokens</span>
          <strong>{TOKENS.length.toLocaleString()}</strong>
          <small>{ISSUERS.length} issuers tracked</small>
        </div>
        <div>
          <span>Underlying assets</span>
          <strong>
            {new Set(
              TOKENS.map((t) => t.underlyingSymbol),
            ).size.toLocaleString()}
          </strong>
          <small>Stocks, ETFs & private-company exposure</small>
        </div>
      </div>
      <details className="market-methodology coverage-diagnostics">
        <summary>Coverage &amp; methodology</summary>
        <p>
          This estimate adds the available issuer values shown below. All
          quantities are on Solana. Supply bases differ: it is not a uniform
          measure of circulating value. Missing values are excluded, never
          counted as zero.
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
          for up to 24 hours. No multiplier is applied twice. Other issuers use
          price × Solana mint supply, subject to price freshness, unit and
          conflict checks. Their minted estimates can include issuer inventory.
          Adding them gives an estimated tracked value, not circulating AUM.
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
