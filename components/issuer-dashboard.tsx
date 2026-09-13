'use client';
import Link from '@/components/site-link';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react';
import { PUBLIC_BATCH_COUNT } from '@/lib/backpack-dashboard';
import {
  mergeMarketPages,
  type MarketOverview,
  type SourceResult,
  type Pool,
} from '@/lib/market-data';
import { MetricInfo } from './metric-info';
import { issuerDashboard } from '@/lib/issuer-dashboard';
import { useMarketOverview } from '@/hooks/use-market-overview';
import { issuerName, type IssuerId } from '@/lib/tokens';

type Row = ReturnType<typeof issuerDashboard>['rows'][number];
type Sort =
  | 'dexVolume'
  | 'poolLiquidity'
  | 'price'
  | 'change24h'
  | 'issuedValue'
  | 'value';
const dollars = (n: number | null, compact = true) =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: compact && n >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits: 2,
      }).format(n);
const percent = (n: number | null) =>
  n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
export function sortedIssuerRows(
  rows: Row[],
  query: string,
  sort: Sort,
  ascending: boolean,
) {
  const q = query.trim().toLowerCase();
  return rows
    .filter((r) =>
      `${r.token.symbol} ${r.token.name}`.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const av = a[sort],
        bv = b[sort];
      if (av === null && bv === null)
        return a.token.symbol.localeCompare(b.token.symbol);
      if (av === null) return 1;
      if (bv === null) return -1;
      return (
        (ascending ? av - bv : bv - av) ||
        a.token.symbol.localeCompare(b.token.symbol)
      );
    });
}
function TokenDetail({ row }: { row: Row }) {
  const [detail, setDetail] = useState<SourceResult<Pool[]> | null>(null);
  const [poolError, setPoolError] = useState('');
  const [loading, setLoading] = useState(row.token.issuer !== 'backpack');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // Backpack already loads per-token discovery. Other issuer overviews use
    // the shared batch cache, and expand discovery only for an opened stock.
    if (row.token.issuer === 'backpack') return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function load() {
      try {
        const response = await fetch(
          '/api/market-data?pools=' + encodeURIComponent(row.token.symbol),
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error();
        const result = (await response.json()) as {
          pools?: SourceResult<Pool[]>;
        };
        if (
          !result.pools ||
          (result.pools.data !== null && !Array.isArray(result.pools.data))
        )
          throw new Error();
        if (controller.signal.aborted) return;
        setDetail(result.pools);
        if (result.pools.refreshing && attempts++ < 6)
          timer = setTimeout(load, 3000);
        else setLoading(false);
      } catch {
        if (!controller.signal.aborted) {
          setPoolError(
            'Additional pools could not be refreshed. Showing overview coverage.',
          );
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [row.token.symbol, row.token.issuer]);
  const poolData =
    detail?.data &&
    !detail.stale &&
    detail.fetchedAt &&
    now - detail.fetchedAt < 300000 &&
    detail.fetchedAt <= now + 60000
      ? detail.data
      : row.pools;
  const circulation = row.circulation ?? row.lastCirculation;
  const supply =
    row.token.issuer === 'xstocks'
      ? circulation?.circulatingSupply
      : row.supply?.supply;
  return (
    <div className="bp-detail">
      <div className="bp-detail-head">
        <div>
          <h3>{row.token.name}</h3>
          <a
            href={`https://solscan.io/token/${row.token.mint}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Solana mint <ArrowUpRight size={14} />
          </a>
        </div>
        <div>
          <span>
            {row.token.issuer === 'xstocks'
              ? 'Circulating supply'
              : 'Minted supply'}
          </span>
          <strong>
            {supply !== undefined
              ? new Intl.NumberFormat('en-US', {
                  maximumFractionDigits: 5,
                }).format(supply)
              : '—'}
          </strong>
        </div>
        <div>
          <span>{row.valuation.label} · est.</span>
          <strong>{dollars(row.value)}</strong>
          {row.token.issuer !== 'xstocks' && (
            <small className="bp-muted">
              May include issuer inventory · not market cap
            </small>
          )}
        </div>
      </div>
      <div className="bp-pool-head">
        <span>Trading pools</span>
        <span>Liquidity</span>
        <span>Volume · 24h</span>
      </div>
      {poolData.length ? (
        poolData.map((p) => (
          <a
            className="bp-pool"
            key={p.address}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              <b>{p.dex}</b>
              <small>
                {p.address.slice(0, 5)}…{p.address.slice(-4)} · {p.quote}{' '}
                <ArrowUpRight size={12} />
              </small>
            </span>
            <span>{dollars(p.liquidity)}</span>
            <span>{dollars(p.volume24h)}</span>
          </a>
        ))
      ) : (
        <p className="bp-muted">Pool data is currently unavailable.</p>
      )}
      {loading || poolError || detail?.error ? (
        <output className="bp-muted">
          {loading
            ? 'Checking additional pools…'
            : poolError || 'Pool coverage is partial.'}
        </output>
      ) : null}
      <details className="bp-row-source">
        <summary>Price & valuation</summary>
        <p>
          Price: {row.priceSource}
          {row.priceTime
            ? ` · ${new Date(row.priceTime).toLocaleString()}`
            : ''}
          {row.priceDelayed ? ' · delayed' : ''}. 24h change:{' '}
          {row.change24h === null ? 'unavailable' : row.changeSource}.{' '}
          {row.token.issuer === 'xstocks'
            ? 'Value uses official Solana circulation × issuer reference price; pre-minted inventory is excluded.'
            : 'Value uses Solana mint supply × token price; it may include issuer inventory and is not AUM.'}{' '}
          {row.valuation.basis.includes('last verified')
            ? 'Circulation is delayed; showing the last verified observation.'
            : ''}{' '}
          {row.priceConflict && row.token.issuer !== 'xstocks'
            ? 'Conflicting prices: valuation withheld.'
            : ''}
        </p>
      </details>
    </div>
  );
}
export function BackpackDashboardPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [data, setData] = useState<MarketOverview | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const pages = useRef(new Map<number, MarketOverview>());
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let active = false;
    let attempts = 0;
    let batchCount = PUBLIC_BATCH_COUNT;
    async function load() {
      if (active || document.hidden) return;
      active = true;
      setBusy(true);
      let failures = 0,
        pending = false;
      // Page zero advertises the current registry and page count. Fetch it first,
      // then bound concurrent requests as the issuer grows.
      async function loadPage(batch: number) {
        try {
          const response = await fetch(`/api/backpack?batch=${batch}`, {
            signal: controller.signal,
            credentials: 'omit',
          });
          if (!response.ok) throw new Error();
          const next = (await response.json()) as MarketOverview;
          if (
            !next.pools ||
            !next.prices ||
            !next.supplies ||
            !next.catalog ||
            !next.markets
          )
            throw new Error();
          if (
            batch === 0 &&
            Number.isSafeInteger(next.totalBatches) &&
            next.totalBatches! > 0 &&
            next.totalBatches! <= 10000
          )
            batchCount = next.totalBatches!;
          pending ||= !!next.registry?.refreshing;
          pending ||= [
            next.pools,
            next.prices,
            next.supplies,
            next.history,
            next.catalog,
          ].some((s) => s?.refreshing);
          pages.current.set(batch, next);
          if (!controller.signal.aborted)
            setData(mergeMarketPages([...pages.current.values()]));
        } catch {
          failures++;
        }
      }
      await loadPage(0);
      let cursor = 1;
      async function worker() {
        while (!controller.signal.aborted && cursor < batchCount)
          await loadPage(cursor++);
      }
      await Promise.all([worker(), worker()]);
      if (controller.signal.aborted) return;
      active = false;
      setBusy(false);
      setError(failures ? 'Some data could not be refreshed.' : '');
      timer = setTimeout(load, pending && attempts++ < 8 ? 2500 : 60000);
    }
    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void load();
      }
    };
    void load();
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [revision]);
  return (
    <IssuerDashboardContent
      issuer="backpack"
      embedded={embedded}
      data={data}
      busy={busy}
      error={error}
      onRefresh={() => setRevision((n) => n + 1)}
    />
  );
}

function OtherIssuerDashboard({
  issuer,
  embedded,
}: {
  issuer: IssuerId;
  embedded: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const { data, busy, error } = useMarketOverview([], revision, issuer);
  return (
    <IssuerDashboardContent
      issuer={issuer}
      embedded={embedded}
      data={data}
      busy={busy}
      error={error}
      onRefresh={() => setRevision((n) => n + 1)}
    />
  );
}
export function IssuerDashboardPage({
  issuer,
  embedded = true,
}: {
  issuer: IssuerId;
  embedded?: boolean;
}) {
  return issuer === 'backpack' ? (
    <BackpackDashboardPage embedded={embedded} />
  ) : (
    <OtherIssuerDashboard key={issuer} issuer={issuer} embedded={embedded} />
  );
}
export function IssuerDashboardContent({
  issuer,
  embedded,
  data,
  busy,
  error,
  onRefresh,
}: {
  issuer: IssuerId;
  embedded: boolean;
  data: MarketOverview | null;
  busy: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [initialStock] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : new URLSearchParams(window.location.search).get('stock') || '',
  );
  const [query, setQuery] = useState(initialStock),
    [sort, setSort] = useState<Sort>('dexVolume'),
    [ascending, setAscending] = useState(false),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState(initialStock);
  const dashboard = issuerDashboard(data, issuer),
    rows = sortedIssuerRows(dashboard.rows, query, sort, ascending),
    pageCount = Math.max(1, Math.ceil(rows.length / 15));
  const visibleRows = rows.slice(
    Math.min(page, pageCount - 1) * 15,
    (Math.min(page, pageCount - 1) + 1) * 15,
  );
  const leaders = dashboard.rows
    .filter((r) => r.dexVolume !== null && r.dexVolume > 0)
    .sort((a, b) => b.dexVolume! - a.dexVolume!)
    .slice(0, 4);
  const fetched = data?.pools.fetchedAt;
  function select(symbol: string) {
    const next = selected === symbol ? '' : symbol;
    setSelected(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('stock', next);
    else url.searchParams.delete('stock');
    window.history.replaceState(null, '', url);
  }
  const columns: [Sort, string][] = [
    ['price', 'Price'],
    ['change24h', '24h change'],
    ['dexVolume', 'Pool volume · 24h'],
    ['poolLiquidity', 'Liquidity'],
    ...(issuer === 'xstocks'
      ? [['value', 'Circulating value'] as [Sort, string]]
      : []),
  ];
  return (
    <div className={`backpack-dashboard${embedded ? ' bp-embedded' : ''}`}>
      <div className="bp-heading">
        <div>
          {!embedded && <span className="bp-eyebrow">FLOAT / SOLANA</span>}
          <h1>{issuerName(issuer)} onchain</h1>
          <p>Tokenized stocks on Solana</p>
        </div>
        {!embedded && (
          <Link className="bp-primary" href="/?join=1">
            Join the holder community <ArrowUpRight size={17} />
          </Link>
        )}
      </div>
      <div className="bp-stats" aria-label={`${issuerName(issuer)} overview`}>
        <div>
          <span>
            DEX pool volume · 24h{' '}
            <MetricInfo label="Volume source and coverage">
              DEX Screener pool trades only. Excludes RFQ trades, direct issuer
              trades and centralized exchanges. Pool discovery is partial; this
              is not total issuer volume.{' '}
              {issuer === 'xstocks'
                ? 'The xStocks API supplies circulation and reference valuations, not this volume figure.'
                : ''}
            </MetricInfo>
          </span>
          <strong>{dollars(dashboard.volume)}</strong>
          <small>
            {dashboard.volumeCovered} of {dashboard.rows.length} tokens · RFQ
            excluded
          </small>
        </div>
        <div>
          <span>Pool liquidity</span>
          <strong>{dollars(dashboard.liquidity)}</strong>
          <small>{dashboard.pools.length} unique trading pools</small>
        </div>
        <div>
          {issuer === 'xstocks' ? (
            <>
              <span>Circulating value · est.</span>
              <strong>{dollars(dashboard.value)}</strong>
              <small>
                {dashboard.valued} of {dashboard.rows.length} tokens valued
                {dashboard.delayed ? ' · delayed' : ''}
              </small>
            </>
          ) : (
            <>
              <span>Tokenized stocks</span>
              <strong>{dashboard.rows.length.toLocaleString()}</strong>
              <small>Tracked on Solana</small>
            </>
          )}
        </div>
      </div>
      {leaders.length > 0 ? (
        <section className="bp-activity" aria-label="Most active tokens">
          <h2>
            Most active <small>24h pool volume</small>
          </h2>
          <div>
            {leaders.map((r) => (
              <button
                type="button"
                key={r.token.symbol}
                aria-label={`View ${r.token.symbol} details`}
                onClick={() => {
                  setQuery(r.token.symbol);
                  setSelected(r.token.symbol);
                  setPage(0);
                }}
              >
                <span>
                  <b>{r.token.symbol}</b>
                  <strong>{dollars(r.dexVolume)}</strong>
                </span>
                <i
                  style={{
                    width: `${Math.max(2, (r.dexVolume! / leaders[0].dexVolume!) * 100)}%`,
                  }}
                />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <section className="bp-assets" aria-labelledby="bp-stocks">
        <div className="bp-toolbar">
          <h2 id="bp-stocks">
            Stocks <span>{rows.length}</span>
          </h2>
          <label className="bp-search">
            <Search size={17} />
            <input
              aria-label="Search stocks"
              placeholder="Search stocks"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setPage(0);
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </label>
          <button
            className="bp-refresh"
            type="button"
            disabled={busy}
            onClick={onRefresh}
            aria-label="Refresh market data"
          >
            <RefreshCw size={17} className={busy ? 'bp-spinning' : ''} />
          </button>
        </div>
        <output className="bp-status">
          {busy
            ? 'Updating…'
            : error ||
              (fetched
                ? `Pools updated ${new Date(fetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · auto-updates`
                : 'Waiting for market data')}
          {data?.pools.error && !busy ? ' · Partial coverage' : ''}
          {data?.registry?.delayed ? ' · Listing updates delayed' : ''}
        </output>
        <div className="bp-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Stock</th>
                {columns.map(([key, label]) => (
                  <th
                    scope="col"
                    key={key}
                    aria-sort={
                      sort === key
                        ? ascending
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSort(key);
                        setAscending(sort === key ? !ascending : false);
                        setPage(0);
                      }}
                    >
                      {label}
                      {sort === key ? (
                        <span aria-hidden="true">
                          {ascending ? ' ↑' : ' ↓'}
                        </span>
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <Fragment key={row.token.symbol}>
                  <tr
                    className={
                      selected === row.token.symbol ? 'bp-selected' : ''
                    }
                  >
                    <th scope="row">
                      <button
                        type="button"
                        aria-expanded={selected === row.token.symbol}
                        aria-controls={`detail-${row.token.symbol}`}
                        onClick={() => select(row.token.symbol)}
                      >
                        <span className="bp-monogram" aria-hidden="true">
                          {row.token.symbol.slice(0, 2)}
                        </span>
                        <span>
                          <b>{row.token.symbol}</b>
                          <small>{row.token.shortName || row.token.name}</small>
                        </span>
                        <ChevronDown size={14} />
                      </button>
                    </th>
                    <td>
                      {dollars(row.price, false)}
                      {row.priceDelayed ? <small>Delayed</small> : null}
                    </td>
                    <td
                      className={
                        row.change24h === null
                          ? ''
                          : row.change24h >= 0
                            ? 'bp-up'
                            : 'bp-down'
                      }
                    >
                      {percent(row.change24h)}
                    </td>
                    <td>{dollars(row.dexVolume)}</td>
                    <td>{dollars(row.poolLiquidity)}</td>
                    {issuer === 'xstocks' && <td>{dollars(row.value)}</td>}
                  </tr>
                  {selected === row.token.symbol ? (
                    <tr id={`detail-${row.token.symbol}`}>
                      <td colSpan={columns.length + 1}>
                        <TokenDetail key={row.token.mint} row={row} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length ? (
          <div className="bp-empty">
            No stocks match “{query}”.{' '}
            <button onClick={() => setQuery('')}>Clear search</button>
          </div>
        ) : null}
        <div className="bp-table-footer">
          <Link href="/tokens">
            All tokenized stocks on Solana <ArrowUpRight size={14} />
          </Link>
          <div>
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {Math.min(page + 1, pageCount)} / {pageCount}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      {dashboard.recentPools.length ? (
        <section className="bp-recent">
          <div>
            <h2>Recent pools</h2>
            <p>Past 30 days. Pool launches, not stock listing dates.</p>
          </div>
          <div>
            {dashboard.recentPools.map((p) => (
              <a
                key={p.address}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <b>
                  {p.symbol}
                  <small>
                    {p.dex} · {p.quote}
                  </small>
                </b>
                <time dateTime={new Date(p.createdAt!).toISOString()}>
                  {new Date(p.createdAt!).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
                <ArrowUpRight size={15} />
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <details className="bp-method">
        <summary>Sources & coverage</summary>
        <div>
          <p>
            <strong>
              {dashboard.valueLabel} · est.: {dollars(dashboard.value)}
            </strong>{' '}
            · {dashboard.valued} of {dashboard.rows.length} tokens valued
            {dashboard.delayed ? ' · delayed' : ''}
          </p>
          {issuer === 'backpack' && (
            <p>
              Listings are checked every five minutes while Float is in use. New
              entries must match Backpack’s registry and verified Solana mint
              metadata.{' '}
              {data?.registry?.checkedAt
                ? `Last checked ${new Date(data.registry.checkedAt).toLocaleString()}.`
                : 'Checking the latest listings.'}
            </p>
          )}
          <p>
            DEX Screener supplies pool volume and liquidity. Each returned
            Solana pool is counted once in the overview, including pools shared
            by two stocks. Coverage is partial; routed swaps can involve several
            pool trades. RFQ trades, direct issuer trades and centralized
            exchange trades are not included. These figures are not total issuer
            trading volume.{' '}
            {issuer !== 'backpack'
              ? 'The overview uses batch-discovered pools. Open a stock for additional per-token pool discovery; those details may have broader coverage than the overview.'
              : ''}
          </p>
          <p>
            Solana RPC supplies minted quantities. CoinMarketCap, where covered,
            supplies prices and changes. DefiLlama provides reference prices; a
            pool price is used when needed.{' '}
            {issuer === 'xstocks'
              ? 'Value uses the official xStocks API for Solana circulating supply and issuer reference prices. Pre-minted inventory and other chains are excluded. Last verified circulation may be retained for up to 24 hours and is marked delayed.'
              : 'Minted value may include issuer inventory and must not be read as circulating market cap or assets under management.'}{' '}
            Unknown values are shown as —.
          </p>
          <p>
            {issuer === 'backpack'
              ? 'Prices and supply refresh on demand about every 2 minutes; pools about every 4 minutes. The page checks for updates every minute while visible.'
              : 'The page checks every 30 seconds while visible. Prices and supply are cached for 2 minutes; overview pools for 4 minutes; xStocks circulation for 10 minutes.'}{' '}
            The reviewed token registry is dated September 12, 2026; new
            listings require mint verification.
          </p>
          <a
            href="https://docs.dexscreener.com/api/reference"
            target="_blank"
            rel="noopener noreferrer"
          >
            DEX Screener documentation ↗
          </a>{' '}
          · <Link href="/tokens">Token registry ↗</Link>
        </div>
      </details>
      <p className="bp-independence">
        Independent of {issuerName(issuer)}.
        {!embedded ? ' Public market data; no wallet required.' : ''}
      </p>
    </div>
  );
}
