import { ArrowUpRight } from 'lucide-react';
import { TOKENS, ISSUERS, type IssuerId } from '@/lib/tokens';
import { circulatingCoverage } from '@/lib/token-observation';
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
  const coverage = circulatingCoverage(data, now);
  const leaders = [...coverage.valued]
    .sort((a, b) => b.circulatingValue! - a.circulatingValue!)
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
          <span>Tracked circulating value</span>
          <strong>{usd(coverage.total)}</strong>
          <small>
            {coverage.issuerCount} / {ISSUERS.length} issuers · partial coverage
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
      <p className="market-footnote">
        Solana circulation × issuer reference price. Pre-minted inventory
        excluded. Unverified issuers are omitted; this is not the total market
        or all-chain AUM.
      </p>
      <details className="market-methodology coverage-diagnostics">
        <summary>Coverage &amp; methodology</summary>
        <p>
          Only issuer-reported Solana circulation with a matched USD reference
          is counted. Missing values are excluded, never counted as zero.
        </p>
        <div className="market-table-scroll">
          <table className="market-table">
            <caption className="sr-only">Valuation coverage by issuer</caption>
            <thead>
              <tr>
                <th>Issuer</th>
                <th>Valued</th>
                <th>Supply unavailable</th>
                <th>Price unavailable</th>
              </tr>
            </thead>
            <tbody>
              {ISSUERS.map((i) => {
                const c = circulatingCoverage(data, now, i.id);
                return (
                  <tr key={i.id}>
                    <th scope="row">{i.name}</th>
                    <td>
                      {c.valued.length} / {c.rows.length}
                    </td>
                    <td>{c.missing.supply}</td>
                    <td>{c.missing.price}</td>
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
          minutes; reference prices may be up to 72 hours old. No multiplier is
          applied twice. Other issuers remain unverified on this basis. Gross
          mint values stay in each asset’s source details and are never added to
          this total.
        </p>
        <h3>Largest circulating values</h3>
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
            <strong>{usd(r.circulatingValue)}</strong>
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
