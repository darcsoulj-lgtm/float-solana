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
import {
  TOKENS,
  ISSUERS,
  issuerName,
  MARKET_BATCH_SIZE,
  type IssuerId,
} from '@/lib/tokens';
import {
  mergeMarketPages,
  type MarketOverview,
  type Book,
  type SourceResult,
} from '@/lib/market-data';
import { Button } from './ui/button';
import { PortfolioSummary } from './portfolio-summary';
import type { Holding } from '@/lib/community-types';
import { MarketStockRow } from './market-stock-row';
import { SolanaEcosystem } from './solana-ecosystem';
import { tokenObservation } from '@/lib/token-observation';
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
export function MarketOverviewPanel({
  holdings,
  positions = [],
}: {
  holdings: string[];
  positions?: Holding[];
}) {
  const [scope, setScope] = useState<'holdings' | 'all'>('holdings'),
    [query, setQuery] = useState(''),
    [issuer, setIssuer] = useState<IssuerId | 'all'>('all'),
    [page, setPage] = useState(0);
  const [selection, setSelected] = useState(holdings[0] || 'MU'),
    [data, setData] = useState<MarketOverview | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [copied, setCopied] = useState(false);
  const [bookData, setBook] = useState<SourceResult<Book> | null>(null),
    [bookMessage, setBookReason] = useState('Loading order book…'),
    [bookSymbol, setBookSymbol] = useState(''),
    [now, setNow] = useState(() => Date.now());
  const matches = TOKENS.filter(
    (t) =>
      (scope === 'all' || holdings.includes(t.symbol)) &&
      (issuer === 'all' || t.issuer === issuer) &&
      (t.symbol + ' ' + t.underlyingSymbol + ' ' + t.name)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selected =
    matches.find((t) => t.symbol === selection)?.symbol ||
    matches[0]?.symbol ||
    selection;
  const book = bookSymbol === selected ? bookData : null;
  const bookReason =
    bookSymbol === selected ? bookMessage : 'Loading order book…';
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const sequence = useRef(0);
  const holdingsKey = holdings.join('|');
  useEffect(() => {
    let active = true;
    let loading = false;
    async function load() {
      if (loading) return;
      const n = ++sequence.current;
      loading = true;
      setBusy(true);
      try {
        const pages: MarketOverview[] = [];
        const batches =
          scope === 'all'
            ? Array.from(
                { length: Math.ceil(TOKENS.length / MARKET_BATCH_SIZE) },
                (_, i) => i,
              )
            : [
                ...new Set([
                  0,
                  ...holdingsKey
                    .split('|')
                    .map((symbol) =>
                      Math.floor(
                        TOKENS.findIndex((t) => t.symbol === symbol) /
                          MARKET_BATCH_SIZE,
                      ),
                    )
                    .filter((i) => i >= 0),
                ]),
              ];
        const count = batches.length;
        let cursor = 0,
          failures = 0;
        async function worker() {
          while (active && cursor < count) {
            const batch = batches[cursor++];
            try {
              const next = await api<MarketOverview>(
                'market-data?batch=' + batch,
              );
              pages[batch] = next;
              if (active && n === sequence.current)
                setData(mergeMarketPages(pages.filter(Boolean)));
            } catch {
              failures++;
            }
          }
        }
        await Promise.all([worker(), worker()]);
        if (active && n === sequence.current)
          setError(
            failures
              ? 'Some market data is unavailable. Coverage will update automatically.'
              : '',
          );
      } catch (e) {
        if (active && n === sequence.current) setError((e as Error).message);
      } finally {
        loading = false;
        if (active && n === sequence.current) setBusy(false);
      }
    }
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30000);
    const visible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    window.addEventListener('online', visible);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
      window.removeEventListener('online', visible);
    };
  }, [refresh, scope, holdingsKey]);
  useEffect(() => {
    if (
      TOKENS.find((t) => t.symbol === selected)?.issuer !== 'backpack' ||
      !data?.catalog.fetchedAt
    )
      return;
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
  const maxPage = Math.max(0, Math.ceil(matches.length / 10) - 1),
    currentPage = Math.min(page, maxPage),
    rows = matches.slice(currentPage * 10, currentPage * 10 + 10);
  const token = TOKENS.find((t) => t.symbol === selected)!,
    listing = data?.catalog.data?.find((t) => t.symbol === selected),
    pools = data?.pools.data?.[selected] || [],
    top = pools[0],
    reference = data?.prices.data?.[selected];
  const observation = tokenObservation(data, selected, now);
  const observed = observation.cmc;
  const quote =
    book?.data && !book.stale && now - book.data.timestamp <= 120000
      ? book.data
      : null;
  const sourceErrors = data
    ? [
        { name: 'CoinMarketCap', source: data.markets },
        { name: 'Backpack', source: data.catalog },
        { name: 'DEX Screener', source: data.pools },
        { name: 'DefiLlama', source: data.prices },
        { name: 'Solana supply', source: data.supplies },
      ]
        .filter((r) => r.source?.stale)
        .map((r) => r.name)
        .join(', ')
    : '';
  return (
    <div className="market-overview">
      <PortfolioSummary positions={positions} data={data} now={now} />
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
            Solana overview
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
      <details className="market-refresh-note">
        <summary>Auto-updating</summary>
        Prices and supply: 2 min · CoinMarketCap: 5 min · Order books: 30 sec.
      </details>

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
      {scope === 'all' && (
        <SolanaEcosystem
          data={data}
          now={now}
          issuer={issuer}
          onIssuer={(id) => {
            setIssuer(id);
            setPage(0);
            setQuery('');
          }}
          select={(symbol) => {
            setSelected(symbol);
            setCopied(false);
            document
              .getElementById('selected-stock-detail')
              ?.scrollIntoView({ block: 'start' });
          }}
        />
      )}
      <fieldset className="issuer-filters" aria-label="Issuer">
        <button
          type="button"
          aria-pressed={issuer === 'all'}
          onClick={() => {
            setIssuer('all');
            setPage(0);
          }}
        >
          All issuers
        </button>
        {ISSUERS.map((i) => (
          <button
            key={i.id}
            type="button"
            aria-pressed={issuer === i.id}
            onClick={() => {
              setIssuer(i.id);
              setPage(0);
            }}
          >
            {i.name}
          </button>
        ))}
      </fieldset>
      <div className="market-search-row">
        <label htmlFor="market-search">
          Stock
          <input
            id="market-search"
            type="search"
            placeholder="Search stocks"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <span>{matches.length} stocks</span>
      </div>
      <div className="market-table-scroll">
        <table className="market-table">
          <caption>
            Solana stock tokens ·{' '}
            {issuer === 'all' ? 'All issuers' : issuerName(issuer)}
          </caption>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Token price</th>
              <th>24h change</th>
              <th>Issued value · est.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const row = tokenObservation(data, t.symbol, now);
              const change = row.change24h;
              return (
                <MarketStockRow
                  key={t.symbol}
                  symbol={t.symbol}
                  name={t.shortName + ' · ' + issuerName(t.issuer)}
                  selected={selected === t.symbol}
                  held={holdings.includes(t.symbol)}
                  onSelect={(symbol) => {
                    setSelected(symbol);
                    setCopied(false);
                    document
                      .getElementById('selected-stock-detail')
                      ?.scrollIntoView({ block: 'start' });
                  }}
                >
                  <td>{money(row.price)}</td>
                  <td
                    className={
                      (change || 0) < 0 ? 'market-negative' : 'market-positive'
                    }
                  >
                    {pct(change)}
                  </td>
                  <td>{money(row.issuedValue, true)}</td>
                </MarketStockRow>
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
        <details className="market-methodology">
          <summary>Table sources</summary>
          <p>
            Prices: CoinMarketCap, then DEX pool or DefiLlama. Issued value:
            Solana mint supply × token price.
          </p>
        </details>
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
      {matches.length > 0 && (
        <section
          className="market-detail"
          id="selected-stock-detail"
          aria-label={`${token.symbol} market details`}
        >
          <header>
            <div>
              <h2>
                {token.symbol} <span>{token.shortName}</span>
              </h2>
            </div>
            <span className="market-chain">
              {issuerName(token.issuer)} · Solana
            </span>
          </header>
          <div
            className={`market-metrics token-metrics ${observation.cmcDexVolume24h === null ? 'two-metrics' : ''}`}
          >
            <div>
              <span>Token price</span>
              <strong>{money(observation.price)}</strong>
            </div>
            <div>
              <span>24h change</span>
              <strong
                className={
                  (observation.change24h || 0) < 0
                    ? 'market-negative'
                    : 'market-positive'
                }
              >
                {pct(observation.change24h)}
              </strong>
            </div>
            {observation.cmcDexVolume24h !== null && (
              <div>
                <span title="CoinMarketCap-covered DEX trading. Coverage may differ from other platforms.">
                  DEX volume · 24h
                </span>
                <strong>{money(observation.cmcDexVolume24h, true)}</strong>
              </div>
            )}
          </div>
          <details className="market-methodology compact-sources">
            <summary>Sources &amp; timestamps</summary>
            <dl className="market-facts">
              <div>
                <dt>Token identity</dt>
                <dd>
                  <a
                    href={token.source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {issuerName(token.issuer)} · Registry record ↗
                  </a>
                </dd>
              </div>
              <div>
                <dt>Price / change</dt>
                <dd>
                  {observation.priceSource} · {time(observation.priceTime)}
                </dd>
              </div>
              {observation.cmcDexVolume24h !== null && observed && (
                <div>
                  <dt>DEX volume · 24h</dt>
                  <dd>
                    <a
                      href={observed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      CoinMarketCap ↗
                    </a>{' '}
                    · {time(observed.timestamp)}
                  </dd>
                </div>
              )}
              <div>
                <dt>Supply</dt>
                <dd>Solana · {time(observation.supply?.timestamp)}</dd>
              </div>
            </dl>
            {observation.cmcDexVolume24h !== null && (
              <p>
                Rolling 24-hour volume across CMC-covered DEX markets. Updated
                with the existing five-minute feed; coverage can differ from
                other platforms.
              </p>
            )}
          </details>
          <div className="market-metrics token-metrics market-secondary-metrics">
            <div>
              <span>Total minted supply</span>
              <strong>
                {observation.supply
                  ? new Intl.NumberFormat('en-US', {
                      maximumFractionDigits: 4,
                    }).format(observation.supply.supply)
                  : 'Not available'}
              </strong>
              <small>Solana · {time(observation.supply?.timestamp)}</small>
            </div>
            <div>
              <span>Issued token value · estimate</span>
              <strong>{money(observation.issuedValue, true)}</strong>
              <small>Total minted supply × token price</small>
            </div>
            <div>
              <span>Indexed DEX liquidity</span>
              <strong>{money(observation.liquidity, true)}</strong>
              <small>Across observed pools · excludes RFQ</small>
            </div>
          </div>
          <p className="market-footnote market-source-line">
            Issued value includes reserves. It is not circulating market cap or
            company value.
            {observation.priceSource === 'DEX pool' &&
              ' Pool prices may move sharply when liquidity is thin.'}
            {observation.supply?.valuationSafe === false &&
              ' Issued value is unavailable while adjusted quote units are unconfirmed.'}
            {observation.price === null &&
              ' No recent price is available from the connected sources.'}
          </p>
          {observed && (
            <details className="market-methodology market-cmc-detail">
              <summary>
                CoinMarketCap · circulating supply, market cap and longer-term
                performance
              </summary>
              <dl className="market-facts">
                <div>
                  <dt>Circulating token supply</dt>
                  <dd>
                    {observed.supply == null
                      ? 'Not reported'
                      : observed.supply.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Circulating token market cap</dt>
                  <dd>{money(observed.marketCap, true)}</dd>
                </div>
                <div>
                  <dt>7-day / 30-day change</dt>
                  <dd>
                    {pct(observed.change7d)} / {pct(observed.change30d)}
                  </dd>
                </div>
              </dl>
              <a href={observed.url} target="_blank" rel="noopener noreferrer">
                CoinMarketCap · {time(observed.timestamp)} ↗
              </a>
            </details>
          )}
          {token.issuer === 'backpack' && (
            <div className="market-detail-grid">
              <section>
                <h3>Trading availability</h3>
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
                  Registry retrieved {time(data?.catalog.fetchedAt)}. Account
                  and regional eligibility still apply. An open book is not a
                  promise of execution.
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
          )}
          <section className="market-pools">
            <h3>DEX pools</h3>
            <div className="market-checks">
              <span>
                Top pool: <b>{money(top?.price)}</b> ·{' '}
                {top?.dex || 'Not indexed'}
              </span>
              <span>
                DefiLlama: <b>{money(reference?.price)}</b> ·{' '}
                {time(reference?.timestamp)}
                {reference &&
                (now - reference.timestamp > 3600000 || data?.prices.stale)
                  ? ' · Older observation'
                  : ''}
              </span>
            </div>
            <p className="market-footnote">
              {pools.length} observed pools · DEX Screener retrieved{' '}
              {time(data?.pools.fetchedAt)}
              {data?.pools.stale ? ' · Delayed' : ''}. Ranked by reported pool
              liquidity. Each row is one pool; it is not the stock’s total
              trading volume. Prices are observations, not executable quotes.
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
      )}
      <p className="market-attribution">
        Data provided by{' '}
        <a
          href="https://coinmarketcap.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          CoinMarketCap
        </a>
        ,{' '}
        <a
          href="https://dexscreener.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          DEX Screener
        </a>
        ,{' '}
        <a
          href="https://defillama.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          DefiLlama
        </a>{' '}
        and{' '}
        <a
          href="https://docs.backpack.exchange/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Backpack
        </a>
        .
      </p>
      <details className="market-methodology">
        <summary>Data sources & methodology</summary>
        <p>
          Price listings and reviewed registries are matched by exact Solana
          mint, not ticker name. CoinMarketCap supplies aggregate token prices,
          circulating supply, token market cap, volume and price changes. We
          display observations no older than 15 minutes; missing listings use
          separately labeled pool or onchain data where available. CMC market
          cap measures circulating tokens at the provider’s price, not the
          underlying company’s market cap. DEX Screener prices and liquidity
          come from indexed pools where the stock token is the base asset. When
          a CMC price is unavailable, the table uses a fallback from the pool
          with the highest reported liquidity. DefiLlama is a separate
          token-price observation, not the underlying share price. Neither
          source proves backing or solvency.
        </p>
        <p>
          Fetched timestamps show when we retrieved data. DEX Screener does not
          supply a quote timestamp in this response. Missing values stay blank;
          an unavailable source is never treated as zero. Your exact wallet
          balances are not sent to these providers.
        </p>
        <p>
          Solana supply comes from validated mint accounts at finalized
          commitment. Issued value multiplies that total supply by a recent
          observed token price; it includes reserves and does not estimate
          circulating supply. We omit stale inputs and show the number of
          supported tokens included in the total.
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
