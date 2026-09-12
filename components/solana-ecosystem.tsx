import { ArrowUpRight } from 'lucide-react';
import { TOKENS, ISSUERS, type IssuerId } from '@/lib/tokens';
import { issuedCoverage } from '@/lib/token-observation';
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
  const coverage = issuedCoverage(data, now);
  const leaders = [...coverage.valued]
    .sort((a, b) => b.issuedValue! - a.issuedValue!)
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
          <span>
            {coverage.valued.length === TOKENS.length
              ? 'Issued value'
              : 'Partial issued value'}
          </span>
          <strong>{usd(coverage.total)}</strong>
          <small>
            {coverage.valued.length} / {TOKENS.length} tokens valued
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
        Solana minted supply × observed token price. Includes reserves. Partial
        coverage; not company market cap.
        {coverage.datedCount > 0 &&
          ` ${coverage.datedCount} values use dated quotes.`}
      </p>
      <details className="market-methodology coverage-diagnostics">
        <summary>Coverage &amp; methodology</summary>
        <p>
          Each listing needs a price, recent Solana supply and matching units.
          Missing values are excluded, never counted as zero.
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
                <th>Units unverified</th>
                <th>Price conflict</th>
              </tr>
            </thead>
            <tbody>
              {ISSUERS.map((i) => {
                const c = issuedCoverage(data, now, i.id);
                return (
                  <tr key={i.id}>
                    <th scope="row">{i.name}</th>
                    <td>
                      {c.valued.length} / {c.rows.length}
                    </td>
                    <td>{c.missing.supply}</td>
                    <td>{c.missing.price}</td>
                    <td>{c.missing.units}</td>
                    <td>{c.missing.conflict}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p>
          Quotes over 15 minutes old are labeled Last quote and can inform
          estimates for up to 96 hours. They never supply a current 24h change
          or holder rank. Unavailable includes expired data. Each excluded
          listing appears once, under its first missing requirement. Units
          unverified means a dividend or split adjustment needs a confirmed
          quote basis.
        </p>
        <h3>Largest issued values</h3>
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
            <strong>{usd(r.issuedValue)}</strong>
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
