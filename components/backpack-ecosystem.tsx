import { ArrowUpRight } from 'lucide-react';
import { TOKENS } from '@/lib/tokens';
import { marketCoverage } from '@/lib/cmc-data';
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
  const coverage = marketCoverage(
    data?.markets.stale ? null : data?.markets.data,
    now,
  );
  const leaders = [...coverage.fresh]
    .filter((t) => t.marketCap !== null)
    .sort((a, b) => b.marketCap! - a.marketCap!);
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
          {coverage.fresh.length} / {TOKENS.length} priced by CMC
        </span>
      </div>
      <div className="ecosystem-stats">
        <div>
          <span>Tracked token market cap</span>
          <strong>{usd(coverage.marketCap)}</strong>
          <small>{coverage.capCount} tokens with recent market-cap data</small>
        </div>
        <div>
          <span>Tracked volume · 24h</span>
          <strong>{usd(coverage.volume24h)}</strong>
          <small>{coverage.volumeCount} tokens · CMC-covered venues</small>
        </div>
        <div>
          <span>Supported stock tokens</span>
          <strong>{TOKENS.length}</strong>
          <small>Our reviewed membership registry</small>
        </div>
      </div>
      <p className="market-footnote">
        Partial coverage, not the value of all Backpack stock tokens. Token
        market cap is not the underlying company’s valuation, assets in custody,
        or proof of backing.
      </p>
      <div className="ecosystem-columns">
        <section className="ecosystem-panel">
          <h3>Largest tracked tokens</h3>
          <p>By token market cap · select to inspect</p>
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
                    width: `${Math.max(1, (row.marketCap! / (leaders[0]?.marketCap || 1)) * 100)}%`,
                  }}
                />
              </span>
              <strong>{usd(row.marketCap)}</strong>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {!leaders.length && (
            <p className="market-empty">
              {data
                ? 'No recent market-cap observations available. The token table below still shows available pool data.'
                : 'Loading market coverage…'}
            </p>
          )}
        </section>
        <section className="ecosystem-panel">
          <h3>Explore the wider market</h3>
          <p>External research · opens on the source website</p>
          <a
            className="ecosystem-resource"
            href="https://www.coingecko.com/en/categories/backpack-securities-ecosystem"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              <b>Backpack on CoinGecko</b>
              <small>Category value, volume and token listings</small>
            </span>
            <ArrowUpRight size={18} />
          </a>
          <a
            className="ecosystem-resource"
            href="https://www.coingecko.com/en/categories/xstocks-ecosystem"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              <b>xStocks on CoinGecko</b>
              <small>Explore another tokenized-equity ecosystem</small>
            </span>
            <ArrowUpRight size={18} />
          </a>
          <a
            className="ecosystem-resource"
            href="https://www.coingecko.com/en/categories/robinhood-chain-stocks-ecosystem"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              <b>Robinhood stock tokens</b>
              <small>CoinGecko’s Robinhood stock-token category</small>
            </span>
            <ArrowUpRight size={18} />
          </a>
          <a
            className="ecosystem-resource"
            href="https://tokenterminal.com/explorer/tokenized-assets/stocks?chains=solana&tab=stocks"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              <b>Token Terminal</b>
              <small>Explore tokenized stocks on Solana</small>
            </span>
            <ArrowUpRight size={18} />
          </a>
          <p className="market-footnote">
            These are research links, not imported feeds. Coverage and legal
            structures differ; category totals are not an apples-to-apples
            market-share ranking.
          </p>
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
