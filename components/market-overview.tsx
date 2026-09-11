'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '@/lib/client';
import { TOKENS } from '@/lib/tokens';
import type { MarketOverview, Book, SourceResult } from '@/lib/market-data';
import { Button } from './ui/button';
const money = (n: number | null | undefined, compact = false) =>
  n === null || n === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: compact ? 'compact' : 'standard',
        maximumFractionDigits: compact ? 2 : 2,
      }).format(n);
const time = (n: number | null | undefined) =>
  n
    ? new Date(n).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not available';
const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
export function MarketOverviewPanel({ holdings }: { holdings: string[] }) {
  const [scope, setScope] = useState<'holdings' | 'all'>('holdings'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0);
  const [selected, setSelected] = useState(holdings[0] || 'MU'),
    [data, setData] = useState<MarketOverview | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [copied, setCopied] = useState(false);
  const [bookData, setBook] = useState<SourceResult<Book> | null>(null),
    [bookMessage, setBookReason] = useState('Loading order book…'),
    [bookSymbol, setBookSymbol] = useState(''),
    [now, setNow] = useState(() => Date.now());
  const book = bookSymbol === selected ? bookData : null;
  const bookReason =
    bookSymbol === selected ? bookMessage : 'Loading order book…';
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const sequence = useRef(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const n = ++sequence.current;
      setBusy(true);
      try {
        const next = await api<MarketOverview>('market-data');
        if (active && n === sequence.current) {
          setData(next);
          setError('');
        }
      } catch (e) {
        if (active && n === sequence.current) setError((e as Error).message);
      } finally {
        if (active && n === sequence.current) setBusy(false);
      }
    }
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 120000);
    const visible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!data?.catalog.fetchedAt) return;
    let active = true;
    async function load() {
      try {
        const next = await api<{
          book: SourceResult<Book> | null;
          reason: string | null;
        }>('market-data?symbol=' + encodeURIComponent(selected));
        if (active) {
          setBookSymbol(selected);
          setBook(next.book);
          setBookReason(next.reason || '');
        }
      } catch (e) {
        if (active) {
          setBookSymbol(selected);
          setBook(null);
          setBookReason((e as Error).message);
        }
      }
    }
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [selected, refresh, data?.catalog.fetchedAt]);
  const matches = TOKENS.filter(
    (t) =>
      (scope === 'all' || holdings.includes(t.symbol)) &&
      (t.symbol + ' ' + t.name).toLowerCase().includes(query.toLowerCase()),
  );
  const maxPage = Math.max(0, Math.ceil(matches.length / 10) - 1),
    currentPage = Math.min(page, maxPage),
    rows = matches.slice(currentPage * 10, currentPage * 10 + 10);
  const token = TOKENS.find((t) => t.symbol === selected)!,
    listing = data?.catalog.data?.find((t) => t.symbol === selected),
    pools = data?.pools.data?.[selected] || [],
    top = pools[0],
    reference = data?.prices.data?.[selected];
  const quote =
    book?.data && !book.stale && now - book.data.timestamp <= 120000
      ? book.data
      : null;
  const sourceErrors = data
    ? [
        { name: 'Backpack', source: data.catalog },
        { name: 'DEX Screener', source: data.pools },
        { name: 'DefiLlama', source: data.prices },
      ]
        .filter((r) => r.source.stale)
        .map((r) => r.name)
        .join(', ')
    : '';
  return (
    <div className="market-overview">
      <div className="market-toolbar">
        <fieldset className="market-switch" aria-label="Stock coverage">
          <button
            aria-pressed={scope === 'holdings'}
            onClick={() => {
              setScope('holdings');
              setPage(0);
              if (!holdings.includes(selected))
                setSelected(holdings[0] || 'MU');
            }}
          >
            Your holdings
          </button>
          <button
            aria-pressed={scope === 'all'}
            onClick={() => {
              setScope('all');
              setPage(0);
            }}
          >
            All supported stocks
          </button>
        </fieldset>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setRefresh((x) => x + 1)}
        >
          <RefreshCw size={16} />
          {busy ? 'Updating…' : 'Refresh'}
        </Button>
      </div>
      <p className="market-refresh-note">
        Market observations refresh every 2 minutes while this page is open.
        Source update times vary.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}{' '}
          {data ? 'Previously loaded observations may be out of date.' : ''}
        </div>
      )}
      {sourceErrors && (
        <output className="market-warning">
          Delayed sources: {sourceErrors}. Last saved observations are marked
          below.
        </output>
      )}
      <div className="market-search-row">
        <label htmlFor="market-search">
          Find a stock
          <input
            id="market-search"
            type="search"
            placeholder="Search name or ticker"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <span>
          {matches.length} stocks · {TOKENS.length} supported tokens
        </span>
      </div>
      <div className="market-table-scroll">
        <table className="market-table">
          <caption>
            Backpack-issued tokens · observed DEX pools, not company valuations
          </caption>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Pool price</th>
              <th>24h change</th>
              <th>Top pool liquidity</th>
              <th>Top pool volume · 24h</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const p = data?.pools.data?.[t.symbol]?.[0];
              return (
                <tr
                  key={t.symbol}
                  className={selected === t.symbol ? 'is-selected' : ''}
                >
                  <td>
                    <button
                      aria-pressed={selected === t.symbol}
                      onClick={() => {
                        setSelected(t.symbol);
                        setCopied(false);
                      }}
                    >
                      <strong>{t.symbol}</strong>
                      <span>{t.shortName}</span>
                      {holdings.includes(t.symbol) && (
                        <small>Your holding</small>
                      )}
                    </button>
                  </td>
                  <td>{money(p?.price)}</td>
                  <td
                    className={
                      (p?.change24h || 0) < 0
                        ? 'market-negative'
                        : 'market-positive'
                    }
                  >
                    {pct(p?.change24h)}
                  </td>
                  <td>{money(p?.liquidity, true)}</td>
                  <td>{money(p?.volume24h, true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!matches.length && (
        <p className="market-empty">No stocks match this selection.</p>
      )}
      {!data && !error && (
        <output className="market-empty">Loading market observations…</output>
      )}
      <div className="market-pagination">
        <span>
          DEX Screener · retrieved {time(data?.pools.fetchedAt)}
          {data?.pools.stale ? ' · Delayed' : ''}
        </span>
        <div>
          <Button
            variant="ghost"
            aria-label="Previous stocks"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            {currentPage + 1} / {maxPage + 1}
          </span>
          <Button
            variant="ghost"
            aria-label="Next stocks"
            disabled={currentPage === maxPage}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      <section
        className="market-detail"
        aria-label={`${token.symbol} market details`}
      >
        <header>
          <div>
            <span className="market-kicker">SELECTED STOCK</span>
            <h2>
              {token.symbol} <span>{token.shortName}</span>
            </h2>
          </div>
          <span className="market-chain">Solana</span>
        </header>
        <div className="market-metrics">
          <div>
            <span>Most liquid observed pool</span>
            <strong>{money(top?.price)}</strong>
            <small>
              {top ? top.dex + ' · ' + top.quote : 'No indexed base-token pool'}
              {data?.pools.stale ? ' · Delayed' : ''}
            </small>
          </div>
          <div>
            <span>DefiLlama token price</span>
            <strong>{money(reference?.price)}</strong>
            <small>
              Source time: {time(reference?.timestamp)}
              {reference &&
              (now - reference.timestamp > 3600000 || data?.prices.stale)
                ? ' · Older observation'
                : ''}
            </small>
          </div>
          <div>
            <span>Observed pools</span>
            <strong>{data?.pools.data ? pools.length : '—'}</strong>
            <small>Coverage may be incomplete</small>
          </div>
        </div>
        <div className="market-detail-grid">
          <section>
            <h3>Backpack availability</h3>
            <dl className="market-facts">
              <div>
                <dt>Deposits</dt>
                <dd>
                  {data?.catalog.stale
                    ? 'Unconfirmed'
                    : listing
                      ? listing.deposit
                        ? 'Enabled'
                        : 'Unavailable'
                      : 'Not reported'}
                </dd>
              </div>
              <div>
                <dt>Withdrawals</dt>
                <dd>
                  {data?.catalog.stale
                    ? 'Unconfirmed'
                    : listing
                      ? listing.withdraw
                        ? 'Enabled'
                        : 'Unavailable'
                      : 'Not reported'}
                </dd>
              </div>
              <div>
                <dt>Spot order book</dt>
                <dd>{listing?.spot ? listing.bookState : 'Not listed'}</dd>
              </div>
            </dl>
            <p className="market-footnote">
              Registry retrieved {time(data?.catalog.fetchedAt)}. Account and
              regional eligibility still apply. An open book is not a promise of
              execution.
            </p>
            <a
              href="https://docs.backpack.exchange/#tag/Markets"
              target="_blank"
              rel="noopener noreferrer"
            >
              Backpack market documentation <ArrowUpRight size={14} />
            </a>
          </section>
          <section>
            <h3>Spot order book</h3>
            {quote ? (
              <>
                <dl className="market-facts">
                  <div>
                    <dt>Best bid / ask</dt>
                    <dd>
                      {money(quote.bid)} / {money(quote.ask)}
                    </dd>
                  </div>
                  <div>
                    <dt>Spread</dt>
                    <dd>{quote.spreadBps.toFixed(1)} bps</dd>
                  </div>
                  <div>
                    <dt>Bid depth within 1%</dt>
                    <dd>{money(quote.bidDepth1pct, true)}</dd>
                  </div>
                  <div>
                    <dt>Ask depth within 1%</dt>
                    <dd>{money(quote.askDepth1pct, true)}</dd>
                  </div>
                </dl>
                <p className="market-footnote">
                  Book time: {time(quote.timestamp)}. Refreshes every 30
                  seconds. 100 bps = 1%. Spot depth excludes RFQ quotes;
                  available liquidity can change.
                </p>
              </>
            ) : (
              <p className="market-empty">
                {book?.stale
                  ? 'No fresh order-book observation is available.'
                  : bookReason || 'No order-book data available.'}
              </p>
            )}
          </section>
        </div>
        <section className="market-pools">
          <h3>Observed pools</h3>
          <p className="market-footnote">
            Ranked by reported pool liquidity. Each row is one pool; it is not
            the stock’s total trading volume. Prices are observations, not
            executable quotes.
          </p>
          {pools.slice(0, 5).map((p) => (
            <a
              key={p.address}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <b>{p.dex}</b> {token.symbol} / {p.quote}
              </span>
              <span>{money(p.liquidity, true)} liquidity</span>
              <ArrowUpRight size={15} />
            </a>
          ))}
          {!pools.length && (
            <p className="market-empty">
              No base-token pools returned by DEX Screener. This does not
              establish that no liquidity exists.
            </p>
          )}
          {pools.length > 5 && (
            <p className="market-footnote">
              Showing the five most liquid of {pools.length} observed pools.
            </p>
          )}
        </section>
        <div className="market-contract">
          <span>Verified registry mint</span>
          <a
            href={'https://explorer.solana.com/address/' + token.mint}
            target="_blank"
            rel="noopener noreferrer"
          >
            {token.mint}
          </a>
          <Button
            variant="ghost"
            aria-label="Copy token mint"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(token.mint);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </Button>
        </div>
      </section>
      <details className="market-methodology">
        <summary>Sources, coverage and token rights</summary>
        <p>
          Backpack’s registry is matched by exact Solana mint, not ticker name.
          DEX Screener prices and liquidity come from indexed pools where the
          stock token is the base asset. The table selects the pool with the
          highest reported liquidity. DefiLlama is a separate token-price
          observation, not the underlying share price. Neither source proves
          backing or solvency.
        </p>
        <p>
          Fetched timestamps show when we retrieved data. DEX Screener does not
          supply a quote timestamp in this response. Missing values stay blank;
          an unavailable source is never treated as zero. Your exact wallet
          balances are not sent to these providers.
        </p>
        <p>
          Token rights, conversion and eligibility depend on the issuer’s terms.
          Review{' '}
          <a
            href="https://learn.backpack.exchange/blog/introducing-backpack-securities"
            target="_blank"
            rel="noopener noreferrer"
          >
            Backpack’s securities explanation
          </a>
          . We do not infer voting, redemption or dividend rights from an
          onchain balance.
        </p>
        <nav>
          <a
            href="https://defillama.com/rwa/category/stocks-equities"
            target="_blank"
            rel="noopener noreferrer"
          >
            DefiLlama · industry overview ↗
          </a>
          <a
            href="https://tokenterminal.com/explorer/tokenized-assets/stocks?chains=solana&tab=stocks"
            target="_blank"
            rel="noopener noreferrer"
          >
            Token Terminal · Solana stocks ↗
          </a>
        </nav>
        <p>
          Those industry dashboards are external resources. Token Terminal data
          and DefiLlama’s paid RWA dataset are not imported here. Backpack
          exchange TVL is not tokenized-stock backing.
        </p>
      </details>
    </div>
  );
}
