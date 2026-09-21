'use client';
import { TesseraContext } from './tessera-context';
import { MarketBrowseFilters } from './market-browse-filters';
import {
  groupMarketTokens,
  fundUnderlyings,
  marketAssetPath,
  matchesAssetFilter,
  type AssetFilter,
} from '@/lib/market-browse';
import { poolMetrics, POOL_SCOPE } from '@/lib/stock-pools';
import { marketTokens } from '@/lib/market-data';
import { MetricInfo } from './metric-info';
import { Fragment, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  X,
  Check,
} from 'lucide-react';
import { api } from '@/lib/client';
import { useMarketOverview } from '@/hooks/use-market-overview';
import { issuerName, type IssuerId, type StockToken } from '@/lib/tokens';
import { type Book, type Pool, type SourceResult } from '@/lib/market-data';
import { Button } from './ui/button';
import { PortfolioSummary } from './portfolio-summary';
import type { Holding } from '@/lib/community-types';
import { MarketStockRow } from './market-stock-row';
import { SolanaEcosystem } from './solana-ecosystem';
import { tokenObservation, tokenValuation } from '@/lib/token-observation';
import Link from '@/components/site-link';
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
  assetSymbol,
  initialToken,
}: {
  holdings: string[];
  positions?: Holding[];
  hidePortfolio?: boolean;
  onIssuer?: (issuer: IssuerId) => void;
  assetSymbol?: string;
  initialToken?: string;
}) {
  const [onlyHoldings, setOnlyHoldings] = useState(false),
    [query, setQuery] = useState(''),
    [issuers, setIssuers] = useState<IssuerId[]>([]),
    [asset, setAsset] = useState<AssetFilter>('all'),
    [listingView, setListingView] = useState<'tokens' | 'companies'>('tokens'),
    [page, setPage] = useState(0),
    [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({
      key: 'volume',
      direction: 'desc',
    });
  const [selection, setSelected] = useState(initialToken || holdings[0] || 'MU'),
    [copied, setCopied] = useState(false);
  const { data, error, busy } = useMarketOverview(holdings, 0);
  const tokens = marketTokens(data);
  const knownFunds = fundUnderlyings(tokens);
  const [bookData, setBook] = useState<SourceResult<Book> | null>(null),
    [bookMessage, setBookReason] = useState('Loading order book…'),
    [bookSymbol, setBookSymbol] = useState(''),
    [now, setNow] = useState(() => Date.now());
  const [poolDetail, setPoolDetail] = useState<{
    symbol: string;
    source: SourceResult<Pool[]>;
  } | null>(null);
  const [detailOpen, setDetailOpen] = useState(Boolean(assetSymbol));
  const chooseIssuer = (id: IssuerId | 'all') => {
    setDetailOpen(false);
    setIssuers(id === 'all' ? [] : [id]);
    setPage(0);
    setQuery('');
  };
  const sortHeader = (key: string, label: string) => (
    <button
      className="market-sort-button"
      type="button"
      onClick={() => {
        setSort((current) => ({
          key,
          direction:
            current.key === key
              ? current.direction === 'asc' ? 'desc' : 'asc'
              : key === 'symbol' ? 'asc' : 'desc',
        }));
        setPage(0);
      }}
    >
      {label} {sort.key === key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
    </button>
  );
  const sortAria = (key: string): 'ascending' | 'descending' | 'none' => sort.key === key
    ? sort.direction === 'asc' ? 'ascending' : 'descending'
    : 'none';
  const matches = tokens.filter(
    (t) =>
      (!assetSymbol || t.underlyingSymbol.toLowerCase() === assetSymbol.toLowerCase()) &&
      (!onlyHoldings || holdings.includes(t.symbol)) &&
      (!issuers.length || issuers.includes(t.issuer)) &&
      matchesAssetFilter(t, asset, knownFunds) &&
      (t.symbol + ' ' + t.underlyingSymbol + ' ' + t.name)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const observations = new Map(
    tokens.map((token) => [
      token.symbol,
      tokenObservation(data, token.symbol, now),
    ]),
  );
  const sortedMatches = [...matches].sort((a, b) => {
    if (sort.key === 'symbol')
      return (sort.direction === 'asc' ? a.symbol : b.symbol).localeCompare(
        sort.direction === 'asc' ? b.symbol : a.symbol,
      );
    const value = (token: StockToken) => {
      const item = observations.get(token.symbol)!;
      return sort.key === 'price'
        ? item.price
        : sort.key === 'change'
          ? item.change24h
          : sort.key === 'volume'
            ? item.poolVolume24h
            : sort.key === 'liquidity'
              ? item.liquidity
              : token.issuer === 'xstocks'
                ? item.circulation?.circulatingSupply
                : (item.valuationSupply ?? item.supply?.supply);
    };
    const left = value(a),
      right = value(b);
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return sort.direction === 'asc' ? left - right : right - left;
  });
  const selected =
    matches.find((t) => t.symbol === selection)?.symbol ||
    matches[0]?.symbol ||
    selection;
  const selectedIssuer = tokens.find((t) => t.symbol === selected)?.issuer;
  const book = bookSymbol === selected ? bookData : null;
  const bookReason =
    bookSymbol === selected ? bookMessage : 'Loading order book…';
  useEffect(() => {
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
  }, [selected, detailOpen]);
  useEffect(() => {
    if (
      !detailOpen ||
      selectedIssuer !== 'backpack' ||
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
  }, [selected, selectedIssuer, detailOpen, data?.catalog.fetchedAt]);
  const groups = groupMarketTokens(matches).sort((a, b) =>
    a.versions[0].shortName.localeCompare(b.versions[0].shortName, undefined, { numeric: true }) ||
    a.key.localeCompare(b.key),
  );
  const pageSize = listingView === 'tokens' ? 20 : 10;
  const resultCount = listingView === 'tokens' ? sortedMatches.length : groups.length;
  const maxPage = Math.max(0, Math.ceil(resultCount / pageSize) - 1),
    currentPage = Math.min(page, maxPage),
    pageTokens = sortedMatches.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    pageGroups = groups.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const token = tokens.find((t) => t.symbol === selected)!,
    listing = data?.catalog.data?.find((t) => t.symbol === selected),
    detailedPools = poolDetail?.symbol === selected ? poolDetail.source : null,
    pools = detailedPools?.data || [],
    top = pools.find((p) => p.price !== null),
    reference = data?.prices.data?.[selected];
  const freshDetails =
    detailedPools &&
    !detailedPools.stale &&
    detailedPools.fetchedAt &&
    now - detailedPools.fetchedAt <= 300000 &&
    detailedPools.fetchedAt <= now + 60000;
  const detailMetrics = poolMetrics(freshDetails ? pools : []);
  const poolLiquidity = detailMetrics.liquidity;
  const observation = tokenObservation(data, selected, now);
  const detailVolume = detailedPools
    ? detailMetrics.volume24h
    : observation.poolVolume24h;
  const volumeTime =
    detailedPools?.fetchedAt ??
    data?.pools.asOf?.[selected] ??
    data?.pools.fetchedAt;
  const observed = observation.cmc;
  const quote =
    book?.data && !book.stale && now - book.data.timestamp <= 120000
      ? book.data
      : null;
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
            {!assetSymbol && <Button
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
            </Button>}
          </div>
        </header>
        <div
          className={`market-metrics token-metrics ${detailVolume === null ? 'two-metrics' : ''}`}
        >
          <div>
            <span>Token price</span>
            <strong>{money(observation.price)}</strong>
            {observation.priceDelayed && (
              <span className="quote-delay">Delayed <MetricInfo label="Quote timestamp">Last quote: {time(observation.priceTime)}. It may not be current.</MetricInfo></span>
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
          {detailVolume !== null && (
            <div>
              <span title={POOL_SCOPE}>DEX volume · 24h</span>
              <strong>{money(detailVolume, true)}</strong>
            </div>
          )}
        </div>
        {token.issuer === 'tessera' && <TesseraContext mint={token.mint} />}
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
                  <dt>Tokens in circulation · Solana</dt>
                  <dd>
                    {observation.circulation.circulatingSupply.toLocaleString(
                      'en-US',
                      { maximumFractionDigits: 5 },
                    )}{' '}
                    tokens
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
                    . Checked {time(observation.circulationTime)}. This reference price can be up to 72 hours old.
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
            {observation.valuationSource && (
              <div>
                <dt>Valuation snapshot</dt>
                <dd>
                  <a
                    href="https://api.llama.fi/protocol/ondo-global-markets"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {observation.valuationSource} ↗
                  </a>{' '}
                  · {time(observation.valuationTime)}. Paired Solana supply and
                  USD value; separate from the current price.
                </dd>
              </div>
            )}
            <div>
              <dt>Total minted value · est.</dt>
              <dd>
                {money(observation.issuedValue, true)} · includes issuer-held tokens. This is not AUM.
              </dd>
            </div>
            {detailVolume !== null && (
              <div>
                <dt>DEX volume · 24h</dt>
                <dd>
                  <a
                    href={'https://dexscreener.com/solana/' + token.mint}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    DEX Screener ↗
                  </a>{' '}
                  · {time(volumeTime)}
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
          {detailVolume !== null && (
            <p>
              {POOL_SCOPE} It excludes RFQ and centralized exchanges.
            </p>
          )}
        </details>
        <div className="market-metrics token-metrics market-secondary-metrics">
          <div>
            <span title="All tokens minted on Solana, after burns. It does not include other chains.">
              Solana supply
            </span>
            <strong>
              {observation.supply
                ? new Intl.NumberFormat('en-US', {
                    maximumFractionDigits: 4,
                  }).format(observation.supply.supply)
                : 'Not available'}
            </strong>
            <small>All minted tokens on Solana</small>
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
                ? 'Issuer inventory excluded'
                : 'Includes issuer-held tokens · not AUM'}
            </small>
          </div>
          <div>
            <span>Pool liquidity found</span>
            <strong>{money(poolLiquidity, true)}</strong>
            <small>{pools.length} reviewed pools · not the full market</small>
          </div>
        </div>
        <p className="market-footnote market-source-line">
          {token.issuer !== 'xstocks' &&
            !observation.valuationSource &&
            observation.priceConflict &&
            'Price sources differ by more than 5%, so this value is hidden for now. '}
          {token.issuer === 'xstocks'
            ? 'This value excludes issuer inventory. '
            : 'This value includes all minted tokens, including issuer inventory. '}
          Solana only. Not AUM and not a guaranteed trade price.
          {observation.priceSource === 'DEX pool' &&
            ' Thin pools can move sharply.'}
          {observation.valuationUnavailableReason === 'units' &&
            ' We need to confirm the token units before estimating its value.'}
          {observation.price === null &&
            ' No recent price is available from the connected sources.'}
        </p>
        {observed && (
          <details className="market-methodology market-cmc-detail">
            <summary>
              CoinMarketCap details
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
              <dt>Token market cap in circulation</dt>
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
                Checked {time(data?.catalog.fetchedAt)}. Your account and region may still affect access. An open book does not guarantee a trade.
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
                    Checked {time(quote.timestamp)}. Updates every 30 seconds. 100 bps = 1%. RFQ quotes are not included, and liquidity can change.
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
            {pools.length} reviewed pools · {time(detailedPools?.fetchedAt)}
            {detailedPools?.stale ? ' · Delayed' : ''}. DEX Screener may not return every pool. {POOL_SCOPE} Liquidity includes both tokens in each pool and excludes RFQ.
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
                {p.origin === 'stonkfun' ? ' · Stonkfun' : ''}
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
                  ? 'No reviewed pools were returned. Other pools may exist.'
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
  const renderTokenRow = (t: StockToken) => {
    const row = observations.get(t.symbol)!;
    const change = row.change24h;
    const isSelected = detailOpen && selected === t.symbol;
    const supply = t.issuer === 'xstocks'
      ? row.circulation?.circulatingSupply
      : (row.valuationSupply ?? row.supply?.supply);
    return (
      <Fragment key={t.symbol}>
        <MarketStockRow
          symbol={t.symbol}
          name={`${t.shortName} · ${issuerName(t.issuer)}`}
          selected={isSelected}
          held={holdings.includes(t.symbol)}
          mobileMarket={
            <>
              <strong>{money(row.price)}</strong>
              <span
                className={
                  change === null
                    ? undefined
                    : change < 0
                      ? 'market-negative'
                      : 'market-positive'
                }
              >
                {pct(change)}
              </span>
            </>
          }
          href={assetSymbol ? undefined : marketAssetPath(t.underlyingSymbol, t.symbol)}
          onSelect={assetSymbol ? (symbol) => {
            setSelected(symbol);
            setCopied(false);
            setDetailOpen(true);
            window.history.replaceState(null, '', marketAssetPath(t.underlyingSymbol, symbol));
            requestAnimationFrame(() =>
              document.getElementById('selected-stock-detail')?.scrollIntoView({ block: 'start' }),
            );
          } : undefined}
        >
          <td className="market-supply-cell">
            <span className="market-mobile-label">Supply</span>
            <span className="market-supply-value">
              {supply == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 5 }).format(supply)}
            </span>
          </td>
          <td className="market-price-cell">
            <span className="market-mobile-label">Token price</span>
            {money(row.price)}
            <span className={`market-mobile-change${change === null ? '' : change < 0 ? ' market-negative' : ' market-positive'}`}>
              {pct(change)}
            </span>
            {row.priceDelayed && <span className="quote-delay">Delayed <MetricInfo label={`Quote timestamp for ${t.symbol}`}>Last available quote: {time(row.priceTime)}. This is not a live price.</MetricInfo></span>}
          </td>
          <td className={change === null ? undefined : change < 0 ? 'market-negative' : 'market-positive'}>
            <span className="market-mobile-label">24h change</span>
            {pct(change)}
          </td>
          <td><span className="market-mobile-label">DEX volume · 24h</span>{money(row.poolVolume24h, true)}</td>
          <td><span className="market-mobile-label">Pool liquidity</span>{money(row.liquidity, true)}</td>
        </MarketStockRow>
      </Fragment>
    );
  };
  const renderTokenTable = (rows: StockToken[], sortable: boolean) => (
    <div className="market-table-scroll market-token-table-wrap">
      <table className={`market-table market-discovery-table market-token-table${sortable && sort.key === 'supply' ? ' market-supply-sorted' : ''}`}>
        <caption className="sr-only">{sortable ? 'Sortable issuer tokens' : 'Issuer tokens for this company'}</caption>
        <thead><tr>
          <th aria-sort={sortable ? sortAria('symbol') : undefined}>{sortable ? sortHeader('symbol', 'Token / issuer') : 'Token / issuer'}</th>
          <th aria-sort={sortable ? sortAria('supply') : undefined}><span className="metric-label">
            {sortable ? sortHeader('supply', 'Supply') : 'Supply'}
            <MetricInfo label="About token supply">xStocks shows tokens in circulation. Other issuers show all tokens minted on Solana, which can include issuer-held tokens.</MetricInfo>
          </span></th>
          <th aria-sort={sortable ? sortAria('price') : undefined}>{sortable ? sortHeader('price', 'Token price') : 'Token price'}</th>
          <th aria-sort={sortable ? sortAria('change') : undefined}>{sortable ? sortHeader('change', '24h change') : '24h change'}</th>
          <th aria-sort={sortable ? sortAria('volume') : undefined}><span className="metric-label">
            {sortable ? sortHeader('volume', 'DEX volume · 24h') : 'DEX volume · 24h'}
            <MetricInfo label="About DEX volume">{POOL_SCOPE} A blank value means we do not have data; it does not mean zero.</MetricInfo>
          </span></th>
          <th aria-sort={sortable ? sortAria('liquidity') : undefined}><span className="metric-label">
            {sortable ? sortHeader('liquidity', 'Pool liquidity') : 'Pool liquidity'}
            <MetricInfo label="About pool liquidity">Money in the Solana pools we found. A shared pool can show under two tokens, so do not add token rows together.</MetricInfo>
          </span></th>
        </tr></thead>
        <tbody>{rows.map(renderTokenRow)}</tbody>
      </table>
    </div>
  );
  if (assetSymbol) {
    const company = matches[0];
    return (
      <div className="market-overview market-asset-page">
        <Link className="market-asset-back" href="/markets">← Back to Markets</Link>
        {company ? (
          <>
            <header className="market-asset-page-heading">
              <div>
                <span className="market-kicker">Solana markets</span>
                <h1>{company.shortName}</h1>
                <p>{company.underlyingSymbol} · {matches.length} {matches.length === 1 ? 'issuer token' : 'issuer tokens'}</p>
              </div>
            </header>
            {error && <div className="error" role="alert">{error}</div>}
            <section className="market-asset-versions" aria-label="Issuer tokens">
              <h2>Issuer tokens</h2>
              {renderTokenTable(matches, false)}
            </section>
            {stockDetail}
          </>
        ) : !data || busy ? (
          <section className="market-asset-missing" aria-live="polite">
            <h1>Loading market</h1>
            <p>Finding verified issuer tokens…</p>
          </section>
        ) : (
          <section className="market-asset-missing">
            <h1>Asset not found</h1>
            <p>This asset is not in Float’s tracked Solana markets.</p>
          </section>
        )}
      </div>
    );
  }
  return (
    <div className="market-overview">
      {!hidePortfolio && (
        <PortfolioSummary positions={positions} data={data} now={now} />
      )}
      {error && (
        <div className="error" role="alert">
          {error}{' '}
          {data ? 'Previously loaded observations may be out of date.' : ''}
        </div>
      )}
      <SolanaEcosystem
        data={data}
        now={now}
        historyReady={!!data && !busy}
        onIssuer={chooseIssuer}
        select={(symbol) => {
          const selectedToken = tokens.find((t) => t.symbol === symbol);
          if (selectedToken) window.location.assign(marketAssetPath(selectedToken.underlyingSymbol, symbol));
        }}
      />
      <div className="market-search-row">
        <label htmlFor="market-search">
          Search markets
          <input
            id="market-search"
            type="search"
            placeholder="Search company, symbol or token"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <div className="market-table-filters">
          {holdings.length > 0 && (
            <label className="holdings-toggle">
              <input
                type="checkbox"
                role="switch"
                aria-checked={onlyHoldings}
                checked={onlyHoldings}
                onChange={(e) => {
                  setOnlyHoldings(e.target.checked);
                  setPage(0);
                }}
              />
              My holdings
            </label>
          )}
          {listingView === 'tokens' && <label className="market-sort-select">
            Sort by
            <select
              value={sort.key + ':' + sort.direction}
              onChange={(event) => {
                const [key, direction] = event.target.value.split(':');
                setSort({ key, direction: direction as 'asc' | 'desc' });
                setPage(0);
              }}
            >
              <option value="volume:desc">DEX volume · high to low</option>
              <option value="volume:asc">DEX volume · low to high</option>
              <option value="liquidity:desc">Liquidity · high to low</option>
              <option value="liquidity:asc">Liquidity · low to high</option>
              <option value="change:desc">24h change · high to low</option>
              <option value="change:asc">24h change · low to high</option>
              <option value="price:desc">Token price · high to low</option>
              <option value="price:asc">Token price · low to high</option>
              <option value="supply:desc">Supply · high to low</option>
              <option value="supply:asc">Supply · low to high</option>
              <option value="symbol:asc">Token symbol · A–Z</option>
              <option value="symbol:desc">Token symbol · Z–A</option>
            </select>
          </label>}
          <span>
            {groups.length.toLocaleString()} assets ·{' '}
            {matches.length.toLocaleString()} tokens
          </span>
        </div>
      </div>
      <MarketBrowseFilters
        issuers={issuers}
        onIssuers={(ids) => {
          setIssuers(ids);
          setPage(0);
          setDetailOpen(false);
        }}
        asset={asset}
        onAsset={(value) => {
          setAsset(value);
          setPage(0);
          setDetailOpen(false);
        }}
      />
      <div className="market-results-heading">
        <fieldset className="market-view-switch">
          <legend className="sr-only">Browse markets by</legend>
          <button type="button" aria-pressed={listingView === 'tokens'} onClick={() => { setListingView('tokens'); setPage(0); setDetailOpen(false); }}>Tokens</button>
          <button type="button" aria-pressed={listingView === 'companies'} onClick={() => { setListingView('companies'); setPage(0); setDetailOpen(false); }}>By company</button>
        </fieldset>
        <span>{issuers.length ? issuers.map(issuerName).join(', ') : 'All issuers'}</span>
      </div>
      {listingView === 'tokens' ? renderTokenTable(pageTokens, true) : (
        <div className="market-company-list" aria-label="Companies and their issuer tokens">
          {pageGroups.map((group) => {
            const name = tokens.find((t) => t.underlyingSymbol === group.key)?.shortName ?? group.versions[0].shortName;
            const labels = [...new Set(group.versions.map((t) => issuerName(t.issuer)))];
            return (
              <section className="market-company" key={group.key}>
                <Link
                  href={marketAssetPath(group.key)}
                  className="market-asset-trigger"
                  aria-label={`View ${name} and ${group.versions.length} ${group.versions.length === 1 ? 'token' : 'tokens'}`}
                >
                  <span className="market-asset-identity"><strong>{name}</strong><small>{group.key}</small></span>
                  <span className="market-asset-issuers">{labels.join(' · ')}</span>
                  <span className="market-asset-action">{group.versions.length} {group.versions.length === 1 ? 'token' : 'tokens'} <span aria-hidden="true">→</span></span>
                </Link>
              </section>
            );
          })}
        </div>
      )}
      {!matches.length && (
        <p className="market-empty">No stocks match this selection.</p>
      )}
      {!data && !error && (
        <output className="market-empty">Loading market observations…</output>
      )}
      <div className="market-pagination">
        <details className="market-methodology">
          <summary>How table numbers are sourced</summary>
          <p>
            Backpack prices come from Backpack. Other prices come from CoinMarketCap, then recent DefiLlama data, then a DEX pool. DEX volume and liquidity come from DEX Screener. {POOL_SCOPE} A dash means no data was available.
          </p>
        </details>
        <div>
          <Button
            variant="ghost"
            aria-label={`Previous ${listingView === 'tokens' ? 'tokens' : 'companies'}`}
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
            aria-label={`Next ${listingView === 'tokens' ? 'tokens' : 'companies'}`}
            disabled={currentPage === maxPage}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      <details className="market-methodology">
        <summary>Sources and important limits</summary>
        <p className="market-attribution">
          Sources:{' '}
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
        <p>
          We match tokens by their exact Solana address, not only by ticker. Backpack prices and 24-hour changes come from Backpack. For other tokens, we use CoinMarketCap first, then recent DefiLlama data, then a DEX pool. Prices are observations, not guaranteed trade prices or proof that an issuer is backed.
        </p>
        <p>
          A 24-hour change always compares the same token from the same source. {POOL_SCOPE} These numbers are not the whole Solana market.
        </p>
        <p>
          Times show when Float checked the source. A dash means data was unavailable, not zero. We do not send your exact wallet balance to these sources.
        </p>
        <p>
          “Tracked value” only covers tokens Float tracks on Solana. Issuers use different supply methods, so it is an estimate, not a company market cap or a single market-cap number.
        </p>
        <p>
          Your token’s rights, redemption and eligibility come from its issuer, not from Float. Review{' '}
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
          These are outside resources. Float does not import Token Terminal data or treat Backpack exchange TVL as token backing.
        </p>
      </details>
    </div>
  );
}
