'use client';
import { MarketActivityHistory } from './market-activity-history';
import { IssuerComparisonPanel } from './issuer-comparison';
import { stockLogo } from '@/lib/stock-logo';
import { HoldingWallets } from './holding-wallets';
import { TesseraContext } from './tessera-context';
import { MarketBrowseFilters } from './market-browse-filters';
import {
  groupMarketTokens,
  fundUnderlyings,
  marketAssetPath,
  matchesAssetFilter,
  type AssetFilter,
} from '@/lib/market-browse';
import { poolDisplayMetrics } from '@/lib/stock-pools';
import { latestTokenPoolSource } from '@/lib/pool-observations';
import { marketTokens, poolLink } from '@/lib/market-data';
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
import { displayedMarketReference, referenceDateRange } from '@/lib/market-presentation';
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
  issuerScope,
}: {
  holdings: string[];
  positions?: Holding[];
  hidePortfolio?: boolean;
  onIssuer?: (issuer: IssuerId) => void;
  assetSymbol?: string;
  initialToken?: string;
  issuerScope?: IssuerId;
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
  const { data, error, busy } = useMarketOverview(holdings, 0, issuerScope ?? 'all');
  const tokens = marketTokens(data).filter((token) => !issuerScope || token.issuer === issuerScope);
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
      (issuerScope || !issuers.length || issuers.includes(t.issuer)) &&
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
      const display = displayedMarketReference(item);
      return sort.key === 'price'
        ? display.price
        : sort.key === 'change'
          ? display.change
          : sort.key === 'volume'
            ? item.dexVolume24h
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
  const showTokens = Boolean(issuerScope) || listingView === 'tokens';
  const pageSize = showTokens ? 20 : 10;
  const resultCount = showTokens ? sortedMatches.length : groups.length;
  const maxPage = Math.max(0, Math.ceil(resultCount / pageSize) - 1),
    currentPage = Math.min(page, maxPage),
    pageTokens = sortedMatches.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    pageGroups = groups.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const datedReferences = referenceDateRange(pageTokens.flatMap(token => {
    const row = observations.get(token.symbol);
    if (!row) return [];
    const display = displayedMarketReference(row);
    return display.historical ? [display.priceTime, display.changeTime] : [];
  }));
  const token = tokens.find((t) => t.symbol === selected)!,
    listing = data?.catalog.data?.find((t) => t.symbol === selected),
    detailedPools = latestTokenPoolSource(data?.pools, poolDetail?.symbol === selected ? poolDetail.source : null, selected, now),
    pools = (detailedPools.data || []).filter(pool => !pool.unavailable);
  const detailMetrics = poolDisplayMetrics(detailedPools.data || [], now, detailedPools.fetchedAt);
  const observation = tokenObservation(data, selected, now);
  const detailReference = displayedMarketReference(observation);
  const providerVolumeMode = !!data?.tokenVolumes && token.issuer === 'backpack';
  const detailVolume = providerVolumeMode ? observation.dexVolume24h : detailMetrics.observedVolume24h;
  const volumeTime = providerVolumeMode ? observation.dexVolumeTime : detailedPools.fetchedAt;
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
        {!assetSymbol && <header>
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
        </header>}
        <div
          className={`market-metrics token-metrics ${detailVolume === null ? 'two-metrics' : ''}`}
        >
          <div>
            <span>Token price {detailReference.saved && <MetricInfo label="Last observed price" learnMore="/data-methodology#updates">{time(detailReference.priceTime)} · {detailReference.priceSource}. Not a live price.</MetricInfo>}</span>
            <strong>{money(detailReference.price)}</strong>
            {observation.priceDelayed && !detailReference.saved && (
              <span className="quote-delay"><MetricInfo label="Quote timestamp" learnMore="/data-methodology#updates">Last quote: {time(observation.priceTime)}. It may not be current.</MetricInfo></span>
            )}
            {detailReference.saved && (
              <small>As of {time(detailReference.priceTime)}</small>
            )}
          </div>
          <div>
            <span
              title={
                detailReference.change === null
                  ? observation.changeUnavailableReason
                  : detailReference.changeSource ?? undefined
              }
            >
              24h change
            </span>
            <strong
              className={
                detailReference.change === null
                  ? undefined
                  : detailReference.change! < 0
                    ? 'market-negative'
                    : 'market-positive'
              }
            >
              {pct(detailReference.change)}
            </strong>
            {detailReference.changeDelayed && <small>As of {time(detailReference.changeTime)}</small>}
          </div>
          {(
            <div>
              <span>24h volume <MetricInfo label="About stock DEX volume" learnMore="/data-methodology#pools">{providerVolumeMode ? 'Birdeye’s rolling 24-hour DEX token volume. Updated periodically.' : '24-hour volume from verified DEX pools, counted once. Coverage may be incomplete.'}</MetricInfo></span>
              <strong className="market-volume-value">{money(detailVolume, true)}</strong>
              {!providerVolumeMode && detailMetrics.unresolvedCount > 0 && <small>{detailMetrics.observedCount} of {detailMetrics.knownCount} pools included</small>}
              {providerVolumeMode && volumeTime && <small>Updated {time(volumeTime)}</small>}
              {!providerVolumeMode && detailedPools.stale && detailVolume != null && (
                <span className="quote-delay"><MetricInfo label="Volume observation time" learnMore="/data-methodology#pools">24-hour window ending {time(volumeTime)}.</MetricInfo></span>
              )}
            </div>
          )}
        </div>
        {token.issuer === 'tessera' && <TesseraContext mint={token.mint} />}
        <div className="market-metrics token-metrics market-secondary-metrics two-metrics">
          <div>
            <span>Supply <MetricInfo label="About detail token supply" learnMore="/data-methodology#prices">Minted supply on Solana, after burns. Includes issuer-held tokens.</MetricInfo></span>
            <strong>
              {observation.supply
                ? new Intl.NumberFormat('en-US', {
                    maximumFractionDigits: 4,
                  }).format(observation.supply.supply)
                : 'Not available'}
            </strong>
          </div>
          <div>
            <span>
              {tokenValuation(observation, token.issuer).label} <MetricInfo label="About tokenized value" learnMore="/data-methodology#value">{token.issuer === 'xstocks' ? 'Estimated value of circulating tokens, excluding issuer inventory.' : observation.lastIssuedValueHistoricalReference ? 'Last stock price × fresh minted supply, including issuer holdings. Not a current quote.' : 'Estimated value of issued tokens, including issuer holdings.'}</MetricInfo>
            </span>
            <strong>
              {money(tokenValuation(observation, token.issuer).value, true)}
            </strong>
            {token.issuer === 'backpack' && observation.issuedValue === null && observation.lastIssuedValue !== null && <small>{observation.lastIssuedValueHistoricalReference ? 'Stock reference' : 'Last observed'} · {time(observation.lastIssuedValueTime)}</small>}
          </div>
        </div>
        {((token.issuer !== 'xstocks' && !observation.valuationSource && observation.priceConflict) || observation.valuationUnavailableReason === 'units' || (detailReference.price === null)) && (
          <p className="market-footnote market-source-line">
            {token.issuer !== 'xstocks' && !observation.valuationSource && observation.priceConflict && 'Value unavailable: price sources differ by more than 5%. '}
            {observation.valuationUnavailableReason === 'units' && 'Value unavailable: token units are not yet confirmed. '}
            {detailReference.price === null && 'Price unavailable.'}
          </p>
        )}
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
              <dt>Tokenized value in circulation</dt>
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
          <details className="market-methodology market-exchange-details">
            <summary>Backpack exchange status</summary>
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
          </details>
        )}
        <details className="market-pools">
          <summary>Pools{pools.length > 0 && <span>{pools.length}</span>}</summary>
          <p className="market-footnote">Pool observations are separate from the headline volume.</p>
          {detailedPools?.data && <p className="market-footnote">
            {pools.length} pools · Updated {time(detailedPools.fetchedAt)}
            {detailedPools.stale ? ' · Delayed' : ''}
          </p>}
          {pools.slice(0, 5).map((p) => (
            <a
              key={p.address}
              href={poolLink(p)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <b>{p.dex}</b> {token.symbol} / {p.quote}
                {p.origin === 'stonkfun' ? ' · Stonkfun' : ''}
              </span>
              <span>{money(p.volume24h, true)} · 24h volume</span>
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
              Showing 5 of {pools.length} observed pools.
            </p>
          )}
        </details>
        <div className="market-contract">
          <span>Token address</span>
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
        <details className="market-methodology compact-sources">
          <summary>Sources &amp; timestamps</summary>
          <p>Observation times for the figures above.</p>
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
                {detailReference.priceSource || 'Unavailable'} · {time(detailReference.priceTime)}
              </dd>
            </div>
            <div>
              <dt>24h change</dt>
              <dd>
                {detailReference.change === null
                  ? observation.changeUnavailableReason
                  : detailReference.changeSource}
                {detailReference.changeDelayed && <> · Updated {time(detailReference.changeTime)}</>}
                {!detailReference.historical && observation.historyTime && (
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
                    href={observation.valuationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {observation.valuationSource} ↗
                  </a>{' '}
                  · Price basis: {time(observation.valuationTime)}. Supply checked: {time(observation.valuationSupplyTime)}. Estimate; separate from the current price.
                </dd>
              </div>
            )}
            <div>
              <dt>Tokenized value · total supply</dt>
              <dd>
                {money(tokenValuation(observation, token.issuer).value, true)} · includes issuer-held tokens.
                {token.issuer === 'backpack' && observation.issuedValue === null && observation.lastIssuedValue !== null && <><br />{observation.lastIssuedValueHistoricalReference ? 'Stock reference estimate' : 'Last observed estimate'} · {observation.lastIssuedValuePriceSource}. Price: {time(observation.lastIssuedValuePriceTime)}. Supply: {time(observation.lastIssuedValueSupplyTime)}.</>}
              </dd>
            </div>
            {detailVolume !== null && <div>
              <dt>24h volume</dt>
              <dd>{providerVolumeMode ? 'Birdeye · token turnover' : 'Connected pool sources'} · 24-hour window ending {time(volumeTime)}.{!providerVolumeMode && detailMetrics.partial && ' Unresolved pools are excluded from this observed sum. We retry automatically.'}</dd>
            </div>}
            {token.issuer === 'xstocks' && observation.lastCirculation && !observation.circulation && <div>
              <dt>Saved circulating supply</dt>
              <dd>xStocks · {time(observation.lastCirculationTime)}. Latest available circulation observation.</dd>
            </div>}
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
                · {time(observation.supply?.timestamp ?? observation.lastSupplyTime)}. Unadjusted tokens;
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
          <Link href="/data-methodology">Data &amp; methodology →</Link>
        </details>
      </section>
    ) : null;
  const renderTokenRow = (t: StockToken) => {
    const row = observations.get(t.symbol)!;
    const display = displayedMarketReference(row);
    const change = display.change;
    const changeTitle = display.changeDelayed ? `Last observed 24h change · ${time(display.changeTime)}` : display.changeSource ?? undefined;
    const isSelected = detailOpen && selected === t.symbol;
    const supply = t.issuer === 'xstocks'
      ? (row.circulation?.circulatingSupply ?? row.lastCirculation?.circulatingSupply)
      : (row.valuationSupply ?? row.supply?.supply);
    const displayedSupply = t.issuer === 'xstocks' ? supply : (supply ?? row.lastSupply);
    const displayedPrice = display.price;
    const displayedVolume = row.dexVolume24h;
    return (
      <Fragment key={t.symbol}>
        <MarketStockRow
          symbol={t.symbol}
          logoSrc={stockLogo(t)}
          name={issuerScope ? t.shortName : `${t.shortName} · ${issuerName(t.issuer)}`}
          selected={isSelected}
          held={holdings.includes(t.symbol)}
          mobileMarket={
            <>
              <span className="stock-row-price-line"><strong>{money(displayedPrice)}</strong>
              {display.saved && <small><MetricInfo label={`Last price for ${t.symbol}`}>{time(display.priceTime)} · {display.priceSource}. Not a live price.</MetricInfo></small>}
              </span>
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
                {display.changeDelayed && !display.historical && <small> · delayed</small>}
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
            <span className="market-supply-value market-metric-value">
              {displayedSupply == null ? '—' : displayedSupply > 0 && displayedSupply < 0.01 ? '<0.01' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(displayedSupply)}
            </span>
          </td>
          <td className="market-price-cell" title={display.saved ? `Last observed · ${time(display.priceTime)} · ${display.priceSource}` : undefined}>
            <span className="market-mobile-label">Token price</span>
            <span className="market-metric-value">
              {money(displayedPrice)}
            </span>
            <span className={`market-mobile-change${change === null ? '' : change < 0 ? ' market-negative' : ' market-positive'}`}>
              {pct(change)}
            </span>
          </td>
          <td title={changeTitle} className={change === null ? undefined : change < 0 ? 'market-negative' : 'market-positive'}>
            <span className="market-mobile-label">24h change</span>
            {pct(change)}
            {display.changeDelayed && !display.historical && <small> · delayed</small>}
          </td>
          <td><span className="market-mobile-label">24h volume</span><span className="market-metric-value market-volume-value">{money(displayedVolume, true)}</span></td>
        </MarketStockRow>
      </Fragment>
    );
  };
  const renderTokenTable = (rows: StockToken[], sortable: boolean) => (
    <div className="market-table-scroll market-token-table-wrap">
      <table className={`market-table market-discovery-table market-token-table${sortable && sort.key === 'supply' ? ' market-supply-sorted' : ''}`}>
        <caption className="sr-only">{issuerScope ? 'Stock tokens' : sortable ? 'Sortable issuer tokens' : 'Issuer tokens for this company'}</caption>
        <thead><tr>
          <th aria-sort={sortable ? sortAria('symbol') : undefined}>{sortable ? sortHeader('symbol', issuerScope ? 'Token' : 'Token / issuer') : issuerScope ? 'Token' : 'Token / issuer'}</th>
          <th aria-sort={sortable ? sortAria('supply') : undefined}><span className="metric-label">
            {sortable ? sortHeader('supply', 'Supply') : 'Supply'}
            <MetricInfo label="About token supply" learnMore="/data-methodology#prices">{issuerScope ? 'Minted supply, including issuer-held tokens.' : 'xStocks: circulating supply. Others: minted supply, including issuer holdings.'}</MetricInfo>
          </span></th>
          <th aria-sort={sortable ? sortAria('price') : undefined}><span className="metric-label">{sortable ? sortHeader('price', 'Token price') : 'Token price'}<MetricInfo label="About displayed price" learnMore="/data-methodology#prices">Stock reference or token-price source. Trade prices may differ.</MetricInfo></span></th>
          <th aria-sort={sortable ? sortAria('change') : undefined}>{sortable ? sortHeader('change', '24h change') : '24h change'}</th>
          <th aria-sort={sortable ? sortAria('volume') : undefined}><span className="metric-label">
            {sortable ? sortHeader('volume', '24h volume') : '24h volume'}
            <MetricInfo label="About DEX volume" learnMore="/data-methodology#pools">{data?.tokenVolumes ? `Birdeye DEX token volume, updated about every ${data.tokenVolumes.intervalMs / 3600000} hours. Trades between tracked tokens may count twice.` : '24-hour volume from verified DEX pools, counted once. Coverage may be incomplete.'} — means unavailable, not zero.</MetricInfo>
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
                <span className="market-kicker">{issuerScope ? `${issuerName(issuerScope)} markets` : 'Solana markets'}</span>
                <h1>{company.shortName}</h1>
                <p>{company.underlyingSymbol}{!issuerScope && <> · {matches.length} {matches.length === 1 ? 'issuer token' : 'issuer tokens'}</>}</p>
              </div>
            </header>
            {error && <div className="error" role="alert">{error}</div>}
            {!issuerScope && <section className="market-asset-versions" aria-label={issuerScope ? "Stock details" : "Issuer tokens"}>
              {!issuerScope && <h2>Issuer tokens</h2>}
              {renderTokenTable(matches, false)}
            </section>}
            {stockDetail}
          </>
        ) : !data || busy ? (
          <section className="market-asset-missing" aria-live="polite">
            <h1>Loading market</h1>
            <p>Loading stock details…</p>
          </section>
        ) : (
          <section className="market-asset-missing">
            <h1>Asset not found</h1>
            <p>This asset is not in the current Markets coverage.</p>
          </section>
        )}
      </div>
    );
  }
  return (
    <div className="market-overview">
      {!hidePortfolio && (
        <PortfolioSummary positions={positions.filter((position) => tokens.some((token) => token.symbol === position.symbol))} data={data} now={now} />
      )}
      {error && (
        <div className="error" role="alert">
          {error}{' '}
          {data ? 'Previously loaded observations may be out of date.' : ''}
        </div>
      )}
      <SolanaEcosystem
        issuerScope={issuerScope}
        data={data}
        now={now}
        onIssuer={chooseIssuer}
      />
      {!issuerScope && <HoldingWallets />}
      {issuerScope === 'backpack' && <MarketActivityHistory data={data} now={now} />}
      {issuerScope === 'backpack' && data?.issuerComparisonEnabled && <IssuerComparisonPanel now={now} />}
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
          {showTokens && <label className="market-sort-select">
            Sort by
            <select
              value={sort.key + ':' + sort.direction}
              onChange={(event) => {
                const [key, direction] = event.target.value.split(':');
                setSort({ key, direction: direction as 'asc' | 'desc' });
                setPage(0);
              }}
            >
              <option value="volume:desc">24h volume · high to low</option>
              <option value="volume:asc">24h volume · low to high</option>
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
        hideIssuerFilter={!!issuerScope}
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
      {!issuerScope && <div className="market-results-heading">
        <fieldset className="market-view-switch">
          <legend className="sr-only">Browse markets by</legend>
          <button type="button" aria-pressed={listingView === 'tokens'} onClick={() => { setListingView('tokens'); setPage(0); setDetailOpen(false); }}>Tokens</button>
          <button type="button" aria-pressed={listingView === 'companies'} onClick={() => { setListingView('companies'); setPage(0); setDetailOpen(false); }}>By company</button>
        </fieldset>
        {!issuerScope && <span>{issuers.length ? issuers.map(issuerName).join(', ') : 'All issuers'}</span>}
      </div>}
      {showTokens && datedReferences && (
        <p className="market-reference-note">Older prices &amp; changes · {datedReferences}. <Link href="/data-methodology#prices">Details ↗</Link></p>
      )}
      {showTokens ? renderTokenTable(pageTokens, true) : (
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
                  <span className="market-asset-issuers">{!issuerScope && labels.join(' · ')}</span>
                  <span className="market-asset-action">{`${group.versions.length} ${group.versions.length === 1 ? 'token' : 'tokens'}`} <span aria-hidden="true">→</span></span>
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
        <Link href="/data-methodology">Data &amp; methodology →</Link>
        <div>
          <Button
            variant="ghost"
            aria-label={`Previous ${showTokens ? 'tokens' : 'companies'}`}
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
            aria-label={`Next ${showTokens ? 'tokens' : 'companies'}`}
            disabled={currentPage === maxPage}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

    </div>
  );
}
