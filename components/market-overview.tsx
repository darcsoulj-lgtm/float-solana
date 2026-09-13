'use client';
import { MetricInfo } from './metric-info';
import { Fragment, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Copy,
  X,
  Check,
} from 'lucide-react';
import { api } from '@/lib/client';
import { useMarketOverview } from '@/hooks/use-market-overview';
import { TOKENS, ISSUERS, issuerName, type IssuerId } from '@/lib/tokens';
import { type Book, type Pool, type SourceResult } from '@/lib/market-data';
import { Button } from './ui/button';
import { PortfolioSummary } from './portfolio-summary';
import type { Holding } from '@/lib/community-types';
import { MarketStockRow } from './market-stock-row';
import { SolanaEcosystem } from './solana-ecosystem';
import {
  tokenObservation,
  issuerValuation,
  tokenValuation,
} from '@/lib/token-observation';
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
  hidePortfolio = false,
  onIssuer,
}: {
  holdings: string[];
  positions?: Holding[];
  hidePortfolio?: boolean;
  onIssuer?: (issuer: IssuerId) => void;
}) {
  const [onlyHoldings, setOnlyHoldings] = useState(false),
    [query, setQuery] = useState(''),
    [issuer, setIssuer] = useState<IssuerId | 'all'>('all'),
    [page, setPage] = useState(0);
  const [selection, setSelected] = useState(holdings[0] || 'MU'),
    [refresh, setRefresh] = useState(0),
    [copied, setCopied] = useState(false);
  const { data, error, busy } = useMarketOverview(holdings, refresh);
  const [bookData, setBook] = useState<SourceResult<Book> | null>(null),
    [bookMessage, setBookReason] = useState('Loading order book…'),
    [bookSymbol, setBookSymbol] = useState(''),
    [now, setNow] = useState(() => Date.now());
  const [poolDetail, setPoolDetail] = useState<{
    symbol: string;
    source: SourceResult<Pool[]>;
  } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const chooseIssuer = (id: IssuerId | 'all') => {
    if (id !== 'all' && onIssuer) {
      onIssuer(id);
      return;
    }
    setDetailOpen(false);
    setIssuer(id);
    setPage(0);
    setQuery('');
  };
  const matches = TOKENS.filter(
    (t) =>
      (!onlyHoldings || holdings.includes(t.symbol)) &&
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
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!detailOpen) return;
    let active = true;
    const load = async () => {
      try {
        const result = await api<{ pools: SourceResult<Pool[]> }>(
          'market-data?pools=' + encodeURIComponent(selected),
        );
        if (active) setPoolDetail({ symbol: selected, source: result.pools });
      } catch {
        if (active)
          setPoolDetail({
            symbol: selected,
            source: {
              data: null,
              fetchedAt: null,
              stale: true,
              error: 'Pool data unavailable.',
            },
          });
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selected, refresh, detailOpen]);
  useEffect(() => {
    if (
      !detailOpen ||
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
  }, [selected, refresh, detailOpen, data?.catalog.fetchedAt]);
  const maxPage = Math.max(0, Math.ceil(matches.length / 10) - 1),
    currentPage = Math.min(page, maxPage),
    rows = matches.slice(currentPage * 10, currentPage * 10 + 10);
  const token = TOKENS.find((t) => t.symbol === selected)!,
    listing = data?.catalog.data?.find((t) => t.symbol === selected),
    detailedPools = poolDetail?.symbol === selected ? poolDetail.source : null,
    pools = detailedPools?.data || [],
    top = pools.find((p) => p.price !== null),
    reference = data?.prices.data?.[selected];
  const poolLiquidity =
    detailedPools &&
    !detailedPools.stale &&
    detailedPools.fetchedAt &&
    now - detailedPools.fetchedAt <= 300000 &&
    pools.some((p) => p.liquidity !== null)
      ? pools.reduce((sum, p) => sum + (p.liquidity ?? 0), 0)
      : null;
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
        { name: 'xStocks circulation', source: data.circulation },
      ]
        .filter((r) => r.source?.stale || r.source?.error)
        .map((r) => r.name)
        .join(', ')
    : '';
  const stockDetail =
    detailOpen && matches.length > 0 ? (
      <section
        className="market-detail"
        id="selected-stock-detail"
        aria-label={`${token.symbol} market details`}
      >
        <header>
          <div className="market-detail-heading">
            <h2>{token.symbol}</h2>
            <p>{token.shortName}</p>
          </div>
          <div className="market-detail-actions">
            <span className="market-chain">
              {issuerName(token.issuer)} · Solana
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Close ${token.symbol} details`}
              onClick={() => {
                document
                  .getElementById(`stock-trigger-${token.symbol}`)
                  ?.focus();
                setDetailOpen(false);
              }}
            >
              <X size={17} />
            </Button>
          </div>
        </header>
        <div
          className={`market-metrics token-metrics ${observation.cmcDexVolume24h === null ? 'two-metrics' : ''}`}
        >
          <div>
            <span>Token price</span>
            <strong>{money(observation.price)}</strong>
            {observation.priceDelayed && (
              <small className="quote-age">
                Last quote · {time(observation.priceTime)}
              </small>
            )}
          </div>
          <div>
            <span
              title={
                observation.change24h === null
                  ? observation.changeUnavailableReason
                  : observation.changeSource
              }
            >
              24h change
            </span>
            <strong
              className={
                observation.change24h === null
                  ? undefined
                  : observation.change24h < 0
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
              <dt>Price</dt>
              <dd>
                {observation.priceSource} · {time(observation.priceTime)}
              </dd>
            </div>
            <div>
              <dt>24h change</dt>
              <dd>
                {observation.change24h === null
                  ? observation.changeUnavailableReason
                  : observation.changeSource}
                {observation.historyTime && (
                  <>
                    {' '}
                    · {time(observation.historyTime)} to{' '}
                    {time(observation.priceTime)}
                  </>
                )}
              </dd>
            </div>
            {observation.circulation && (
              <>
                <div>
                  <dt>Circulating supply · Solana</dt>
                  <dd>
                    {observation.circulation.circulatingSupply.toLocaleString(
                      'en-US',
                      { maximumFractionDigits: 5 },
                    )}{' '}
                    adjusted units
                  </dd>
                </div>
                <div>
                  <dt>Valuation reference</dt>
                  <dd>
                    {money(observation.circulation.referencePriceUsd)} ·{' '}
                    <a
                      href="https://defi.xstocks.fi"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      xStocks issuer data ↗
                    </a>
                    . Retrieved {time(observation.circulationTime)}; reference
                    prices may be up to 72 hours old.
                  </dd>
                </div>
                {observation.circulation.fxDate && (
                  <div>
                    <dt>FX conversion</dt>
                    <dd>
                      HKD to USD ·{' '}
                      <a
                        href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ECB ↗
                      </a>{' '}
                      · {observation.circulation.fxDate}
                    </dd>
                  </div>
                )}
              </>
            )}
            <div>
              <dt>Gross minted value · not AUM</dt>
              <dd>
                {money(observation.issuedValue, true)} · includes inventory;
                token-price estimate
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
              <dt>Solana supply</dt>
              <dd>
                <a
                  href={'https://explorer.solana.com/address/' + token.mint}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Mint account ↗
                </a>{' '}
                · {time(observation.supply?.timestamp)}. Unadjusted tokens;
                excludes other chains.
              </dd>
            </div>
            {observation.supply?.multiplier != null &&
              observation.supply.multiplier !== 1 && (
                <div>
                  <dt>Adjusted display supply</dt>
                  <dd>
                    {observation.supply.uiSupply?.toLocaleString('en-US', {
                      maximumFractionDigits: 6,
                    })}{' '}
                    · onchain multiplier ×{observation.supply.multiplier}.
                    Display units differ from unadjusted tokens.
                  </dd>
                </div>
              )}
          </dl>
          {observation.cmcDexVolume24h !== null && (
            <p>
              Rolling 24-hour volume across CMC-covered DEX markets. Updated
              with the existing five-minute feed; coverage can differ from other
              platforms.
            </p>
          )}
        </details>
        <div className="market-metrics token-metrics market-secondary-metrics">
          <div>
            <span title="Minted tokens on Solana, net of burns. Unadjusted for display multipliers; excludes other chains.">
              Solana supply
            </span>
            <strong>
              {observation.supply
                ? new Intl.NumberFormat('en-US', {
                    maximumFractionDigits: 4,
                  }).format(observation.supply.supply)
                : 'Not available'}
            </strong>
            <small>Unadjusted tokens · excludes other chains</small>
          </div>
          <div>
            <span>
              {tokenValuation(observation, token.issuer).label} · est.
            </span>
            <strong>
              {money(tokenValuation(observation, token.issuer).value, true)}
            </strong>
            <small>
              {token.issuer === 'xstocks'
                ? 'Pre-minted inventory excluded'
                : 'Includes minted inventory · not AUM'}
            </small>
          </div>
          <div>
            <span>Observed pool liquidity</span>
            <strong>{money(poolLiquidity, true)}</strong>
            <small>{pools.length} returned pools · partial coverage</small>
          </div>
        </div>
        <p className="market-footnote market-source-line">
          {token.issuer !== 'xstocks' &&
            observation.priceConflict &&
            'Price sources differ by more than 5%. Valuation is withheld pending reconciliation. '}
          {token.issuer === 'xstocks'
            ? 'Circulating value excludes pre-minted inventory. '
            : 'Minted value includes all outstanding mint supply; circulating value is not yet verified. '}
          Solana only. Not AUM or an executable quote.
          {observation.priceSource === 'DEX pool' &&
            ' Pool prices may move sharply when liquidity is thin.'}
          {observation.valuationUnavailableReason === 'units' &&
            ' Gross mint valuation is unavailable while token quote units are unconfirmed.'}
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
                Registry retrieved {time(data?.catalog.fetchedAt)}. Account and
                regional eligibility still apply. An open book is not a promise
                of execution.
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
              Top pool: <b>{money(top?.price)}</b> · {top?.dex || 'Not indexed'}
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
            {pools.length} returned pools · {time(detailedPools?.fetchedAt)}
            {detailedPools?.stale ? ' · Delayed' : ''}. DEX Screener may limit
            results. Pool addresses are counted once, including pairs where this
            token is on either side. Liquidity includes both assets in each
            pool; excludes unreturned pools and RFQ.
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
              {detailedPools?.stale
                ? 'Pool data is temporarily unavailable.'
                : detailedPools
                  ? 'No pools returned by DEX Screener. Other liquidity may exist.'
                  : 'Loading pools…'}
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
    ) : null;
  return (
    <div className="market-overview">
      {!hidePortfolio && (
        <PortfolioSummary positions={positions} data={data} now={now} />
      )}
      <div className="market-toolbar">
        <details className="market-refresh-note">
          <summary>Auto-updating</summary>
          Prices and supply: 2 min · Pools: 4 min · CoinMarketCap: 5 min · Order
          books: 30 sec · Issuer circulation: 10 min.
        </details>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setRefresh((x) => x + 1)}
        >
          <RefreshCw size={16} />
          {busy ? 'Updating…' : 'Refresh'}
        </Button>
      </div>

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
      <SolanaEcosystem
        data={data}
        now={now}
        onIssuer={chooseIssuer}
        select={(symbol) => {
          setOnlyHoldings(false);
          setQuery(symbol);
          setPage(0);
          setSelected(symbol);
          setDetailOpen(true);
          setCopied(false);
        }}
      />
      <div className="issuer-value-heading">
        <span>Estimated Solana value</span>
        <MetricInfo label="How issuer values are calculated">
          Value is supply on Solana multiplied by the token price. xStocks uses
          circulating supply, excluding pre-minted inventory. Other issuers use
          minted supply, which can include issuer inventory. These estimates
          have different bases and are not directly comparable or all-chain AUM.
          Partial means some tokens could not be valued. Delayed means the last
          verified value is shown.
          {ISSUERS.map((item) => {
            const c = issuerValuation(data, now, item.id);
            return c.delayed && c.total !== null ? (
              <span key={item.id}>
                <br />
                {item.name}: last verified {time(c.observedAt)}.
              </span>
            ) : null;
          })}
        </MetricInfo>
      </div>
      <fieldset className="issuer-filters" aria-label="Filter by issuer">
        <button
          type="button"
          aria-label="All issuers"
          aria-pressed={issuer === 'all'}
          onClick={() => chooseIssuer('all')}
        >
          <span className="issuer-filter-name">
            All issuers
            <Check size={14} aria-hidden="true" />
          </span>
          <strong>{TOKENS.length.toLocaleString()} tokens</strong>
        </button>
        {ISSUERS.map((item) => {
          const c = issuerValuation(data, now, item.id);
          const partial = c.valued.length < c.rows.length;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.name}
              aria-describedby={`issuer-value-${item.id} issuer-basis-${item.id}`}
              aria-pressed={issuer === item.id}
              title={`${c.label} on Solana: ${c.valued.length} / ${c.rows.length} tokens valued. ${c.basis === 'minted' ? 'Includes minted inventory; not AUM.' : 'Pre-minted inventory excluded.'}${c.delayed ? ` Last verified ${time(c.observedAt)}.` : ''}`}
              onClick={() => chooseIssuer(item.id)}
            >
              <span className="issuer-filter-name">
                {item.name}
                <Check size={14} aria-hidden="true" />
              </span>
              <strong id={`issuer-value-${item.id}`}>
                {money(c.total, true)}
                {c.total === null ? (
                  <small>
                    {item.id === 'xstocks' && data?.circulation?.refreshing
                      ? ' Updating…'
                      : ' Unavailable'}
                  </small>
                ) : (
                  partial && <small> partial</small>
                )}
                {c.delayed && c.total !== null && <small> · Delayed</small>}
              </strong>
              <span className="sr-only" id={`issuer-basis-${item.id}`}>
                {c.delayed
                  ? `${c.label} · last verified ${time(c.observedAt)}`
                  : `${c.label} · est.`}
              </span>
            </button>
          );
        })}
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
        <div className="market-table-filters">
          <label className="holdings-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={onlyHoldings}
              onChange={(e) => {
                setOnlyHoldings(e.target.checked);
                setPage(0);
              }}
            />
            Only my holdings
          </label>
          <span>{matches.length} stocks</span>
        </div>
      </div>
      <div className="market-table-scroll">
        <table className="market-table">
          <caption>
            Tokenized stocks ·{' '}
            {issuer === 'all' ? 'All issuers' : issuerName(issuer)}
          </caption>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Token price</th>
              <th>24h change</th>
              <th>
                <span className="metric-label">
                  {issuer === 'xstocks'
                    ? 'Circulating value'
                    : issuer === 'all'
                      ? 'Token value · est.'
                      : 'Minted value · est.'}
                  <MetricInfo label="About token values">
                    xStocks: circulating supply on Solana × issuer reference
                    price. Other issuers: minted supply on Solana × token price;
                    may include inventory. These values use different supply
                    measures and are not an all-issuer AUM total.
                  </MetricInfo>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const row = tokenObservation(data, t.symbol, now);
              const change = row.change24h;
              const valuation = tokenValuation(row, t.issuer);
              return (
                <Fragment key={t.symbol}>
                  <MarketStockRow
                    symbol={t.symbol}
                    name={t.shortName + ' · ' + issuerName(t.issuer)}
                    selected={detailOpen && selection === t.symbol}
                    held={holdings.includes(t.symbol)}
                    onSelect={(symbol) => {
                      setSelected(symbol);
                      setCopied(false);
                      setDetailOpen(!detailOpen || selection !== symbol);
                    }}
                  >
                    <td>
                      {money(row.price)}
                      {row.priceDelayed && (
                        <small
                          className="quote-age"
                          title={time(row.priceTime)}
                        >
                          Last quote · {time(row.priceTime)}
                        </small>
                      )}
                    </td>
                    <td
                      className={
                        change === null
                          ? undefined
                          : change < 0
                            ? 'market-negative'
                            : 'market-positive'
                      }
                    >
                      {pct(change)}
                    </td>
                    <td>
                      {money(valuation.value, true)}
                      {t.issuer === 'xstocks' &&
                        !row.circulation &&
                        row.lastCirculation && (
                          <small className="quote-age">
                            Last verified · {time(row.lastCirculationTime)}
                          </small>
                        )}
                    </td>
                  </MarketStockRow>
                  {detailOpen && selection === t.symbol && (
                    <tr className="stock-detail-row">
                      <td colSpan={4}>{stockDetail}</td>
                    </tr>
                  )}
                </Fragment>
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
            Prices: CoinMarketCap, fresh DefiLlama, then DEX pool. Older
            DefiLlama references are labeled Last quote (up to 96 hours).
            xStocks uses issuer-reported Solana circulation and reference
            prices. Other issuers show Solana minted supply × token price.
            Minted value can include inventory and is not AUM. These measures
            are not combined in the circulating headline. Missing or conflicting
            data is excluded from each estimate.
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
          underlying company’s market cap. Without a CMC price, we prefer a
          recent DefiLlama reference with confidence of at least 0.8; a single
          DEX pool is the final fallback. Reference prices are not executable
          quotes. Neither source proves backing or solvency. A difference above
          5% between available price sources triggers a review flag and excludes
          the token from valuation totals. This is our review threshold, not an
          accuracy guarantee.
        </p>
        <p>
          DefiLlama 24h changes compare prices for the same mint from the same
          source, with timestamps within 15 minutes of a 24-hour interval. We
          never combine a pool price with another provider’s historical price.
          DEX liquidity sums unique returned pool addresses, including either
          side of a pair. The provider may limit the returned set; this is not
          total Solana liquidity or volume.
        </p>
        <p>
          Fetched timestamps show when we retrieved data. DEX Screener does not
          supply a quote timestamp in this response. Missing values stay blank;
          an unavailable source is never treated as zero. Your exact wallet
          balances are not sent to these providers.
        </p>
        <p>
          Gross unadjusted supply comes from validated Solana mint accounts. Its
          value includes inventory and appears only in source details. The
          headline and table use issuer-adjusted circulating quantities,
          excluding pre-minted inventory, multiplied by issuer reference prices.
          No other chains, unverified issuers or gross mint values enter this
          aggregate.
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
