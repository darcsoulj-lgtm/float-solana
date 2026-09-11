import { ArrowUpRight } from 'lucide-react';
import { TOKENS } from '@/lib/tokens';
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
export function BackpackEcosystem({
  data,
  now,
  select,
}: {
  data: MarketOverview | null;
  now: number;
  select: (symbol: string) => void;
}) {
  const coverage = issuedCoverage(data, now);
  const leaders = [...coverage.valued]
    .sort((a, b) => b.issuedValue! - a.issuedValue!)
    .slice(0, 5);
  return (
    <section
      className="ecosystem-overview"
      aria-label="Backpack ecosystem overview"
    >
      <div className="ecosystem-heading">
        <div>
          <span className="market-kicker">BACKPACK · SOLANA</span>
          <h2>Backpack, at a glance.</h2>
        </div>
        <span className="market-chain">
          {coverage.pricedCount} / {TOKENS.length} with recent prices
        </span>
      </div>
      <div className="ecosystem-stats">
        <div>
          <span>Issued token value · estimate</span>
          <strong>{usd(coverage.total)}</strong>
          <small>
            {coverage.valued.length} / {TOKENS.length} tokens · supply ×
            observed price
          </small>
        </div>
        <div>
          <span>Supply coverage</span>
          <strong>
            {coverage.supplyCount} / {TOKENS.length}
          </strong>
          <small>Validated directly on Solana</small>
        </div>
        <div>
          <span>Supported stock tokens</span>
          <strong>{TOKENS.length}</strong>
          <small>Our reviewed membership registry</small>
        </div>
      </div>
      <p className="market-footnote">
        Total minted supply × recent token price, including tokens held in
        reserves. This estimate is not circulating market cap, company value or
        proof of backing. Coverage is shown explicitly; tokens missing supply or
        a recent price are excluded.
      </p>
      <div className="ecosystem-columns">
        <section className="ecosystem-panel">
          <h3>Largest issued token values</h3>
          <p>Top five estimates · all supported tokens in the table below</p>
          {leaders.map((row) => (
            <button
              key={row.symbol}
              onClick={() => select(row.symbol)}
              className="ecosystem-rank"
            >
              <span>
                <b>{row.symbol}</b>
                <small>
                  {TOKENS.find((t) => t.symbol === row.symbol)?.shortName}
                </small>
              </span>
              <span className="ecosystem-bar" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.max(1, (row.issuedValue! / (leaders[0]?.issuedValue || 1)) * 100)}%`,
                  }}
                />
              </span>
              <strong>{usd(row.issuedValue)}</strong>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {!leaders.length && (
            <p className="market-empty">
              {data
                ? 'No recent supply-and-price pairs available. The token table below still shows available pool data.'
                : 'Loading market coverage…'}
            </p>
          )}
        </section>
      </div>
      <details className="market-methodology ecosystem-rights">
        <summary>Why Backpack—and what a token actually proves</summary>
        <p>
          We focus on people holding Backpack-supported stock tokens, with
          membership verified by the exact Solana mint. That check establishes a
          token balance; it does not establish registered shareholder status or
          independently verify custody.
        </p>
        <p>
          Backpack describes brokerage ownership and tokenization as separate
          layers. Its stocks page identifies Trek Brokerage Services Limited,
          licensed by the Anjouan Offshore Finance Authority, as an intermediary
          broker for the region shown. Applicable entities, rights and
          restrictions depend on the product and account.
        </p>
        <p>
          We do not claim that Backpack is the only U.S.-regulated
          tokenized-equity platform, that the SEC approved these tokens, or that
          every token holder receives the protections of a U.S. brokerage
          customer. HolderPulse is independent of Backpack.
        </p>
        <nav>
          <a
            href="https://backpack.exchange/stocks/about"
            target="_blank"
            rel="noopener noreferrer"
          >
            Backpack’s product disclosure ↗
          </a>
          <a
            href="https://support.backpack.exchange/legal/general-legal/user-agreement"
            target="_blank"
            rel="noopener noreferrer"
          >
            Brokerage, tokenization and issuer terms ↗
          </a>
        </nav>
      </details>
    </section>
  );
}
