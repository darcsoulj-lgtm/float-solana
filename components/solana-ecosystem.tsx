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
  issuer,
  onIssuer,
  select,
}: {
  data: MarketOverview | null;
  now: number;
  issuer: IssuerId | 'all';
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
      aria-label="Solana stock token overview"
    >
      <div className="ecosystem-heading">
        <div>
          <span className="market-kicker">SOLANA</span>
          <h2>Stock tokens</h2>
        </div>
        <a href="/tokens" className="market-chain">
          Coverage ↗
        </a>
      </div>
      <div className="ecosystem-stats">
        <div>
          <span>Tracked issued value</span>
          <strong>{usd(coverage.total)}</strong>
          <small>
            {coverage.valued.length} / {TOKENS.length} tokens valued
          </small>
        </div>
        <div>
          <span>Stock tokens</span>
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
      </p>
      <div className="issuer-comparison" aria-label="Issuer comparison">
        {ISSUERS.map((i) => {
          const c = issuedCoverage(data, now, i.id);
          const count = TOKENS.filter((t) => t.issuer === i.id).length;
          return (
            <button
              key={i.id}
              type="button"
              className="issuer-card"
              aria-pressed={issuer === i.id}
              onClick={() => onIssuer(issuer === i.id ? 'all' : i.id)}
            >
              <span>
                {i.name}
                <ArrowUpRight size={15} />
              </span>
              <strong>{usd(c.total)}</strong>
              <small>
                {c.valued.length} / {count} tokens valued
              </small>
            </button>
          );
        })}
      </div>
      <details className="market-methodology">
        <summary>Largest issued values</summary>
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
      </details>
      <details className="market-methodology">
        <summary>Methodology & rights</summary>
        <p>
          Each mint is counted once. Different issuers’ tokens remain separate
          products, even when they reference the same company. No cross-chain
          balances or underlying-company market caps are included. Missing,
          stale or unit-ambiguous valuations are excluded.
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
