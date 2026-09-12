'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  backpackDashboard,
  PUBLIC_BATCH_COUNT,
  type BackpackDashboard,
} from '@/lib/backpack-dashboard';
import { mergeMarketPages, type MarketOverview } from '@/lib/market-data';

type Row = BackpackDashboard['rows'][number];
type Sort =
  | 'dexVolume'
  | 'poolLiquidity'
  | 'price'
  | 'change24h'
  | 'issuedValue';
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
export function sortedBackpackRows(
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
          <span>Minted supply</span>
          <strong>
            {row.supply
              ? new Intl.NumberFormat('en-US', {
                  maximumFractionDigits: 5,
                }).format(row.supply.supply)
              : '—'}
          </strong>
        </div>
        <div>
          <span>Minted value · est.</span>
          <strong>{dollars(row.issuedValue)}</strong>
        </div>
      </div>
      <div className="bp-pool-head">
        <span>Trading pools</span>
        <span>Liquidity</span>
        <span>Volume · 24h</span>
      </div>
      {row.pools.length ? (
        row.pools.map((p) => (
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
      <details className="bp-row-source">
        <summary>Price & valuation</summary>
        <p>
          Price: {row.priceSource}
          {row.priceTime
            ? ` · ${new Date(row.priceTime).toLocaleString()}`
            : ''}
          {row.priceDelayed ? ' · delayed' : ''}. 24h change:{' '}
          {row.change24h === null ? 'unavailable' : row.changeSource}. Minted
          value uses Solana mint supply × token price; it may include issuer
          inventory and is not AUM.{' '}
          {row.priceConflict ? 'Conflicting prices: valuation withheld.' : ''}
        </p>
      </details>
    </div>
  );
}
export function BackpackDashboardPage() {
  const [data, setData] = useState<MarketOverview | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState<Sort>('dexVolume'),
    [ascending, setAscending] = useState(false),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState(''),
    [revision, setRevision] = useState(0);
  const pages = useRef(new Map<number, MarketOverview>());
  useEffect(() => {
    const symbol = new URLSearchParams(window.location.search).get('stock');
    if (symbol) {
      setQuery(symbol);
      setSelected(symbol);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let active = false;
    let attempts = 0;
    async function load() {
      if (active || document.hidden) return;
      active = true;
      setBusy(true);
      let failures = 0,
        pending = false;
      await Promise.all(
        Array.from({ length: PUBLIC_BATCH_COUNT }, async (_, batch) => {
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
        }),
      );
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
  const dashboard = backpackDashboard(data),
    rows = sortedBackpackRows(dashboard.rows, query, sort, ascending),
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
    ['dexVolume', 'DEX volume · 24h'],
    ['poolLiquidity', 'Liquidity'],
    ['issuedValue', 'Minted value'],
  ];
  return (
    <div className="backpack-dashboard">
      <div className="bp-heading">
        <div>
          <span className="bp-eyebrow">HOLDERPULSE / SOLANA</span>
          <h1>
            Backpack onchain<span>.</span>
          </h1>
          <p>Tokenized stocks, in one place.</p>
        </div>
        <a className="bp-primary" href="/?join=1">
          Join the holder community <ArrowUpRight size={17} />
        </a>
      </div>
      <div className="bp-stats" aria-label="Backpack overview">
        <div>
          <span>Minted value · est.</span>
          <strong>{dollars(dashboard.mintedValue)}</strong>
          <small>
            {dashboard.valued} of {dashboard.rows.length} tokens valued · not
            AUM
          </small>
        </div>
        <div>
          <span>Tracked DEX volume · 24h</span>
          <strong>{dollars(dashboard.volume)}</strong>
          <small>{dashboard.volumeCovered} tokens with volume data</small>
        </div>
        <div>
          <span>Tracked liquidity</span>
          <strong>{dollars(dashboard.liquidity)}</strong>
          <small>{dashboard.pools.length} unique trading pools</small>
        </div>
      </div>
      {leaders.length > 0 ? (
        <section className="bp-activity" aria-label="Most active tokens">
          <h2>
            Most active <small>24h DEX volume</small>
          </h2>
          <div>
            {leaders.map((r) => (
              <button
                type="button"
                key={r.token.symbol}
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
            onClick={() => setRevision((n) => n + 1)}
            aria-label="Refresh market data"
          >
            <RefreshCw size={17} className={busy ? 'bp-spinning' : ''} />
          </button>
        </div>
        <div className="bp-status" role="status">
          {busy
            ? 'Updating…'
            : error ||
              (fetched
                ? `Pools updated ${new Date(fetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · auto-updates`
                : 'Waiting for market data')}
          {data?.pools.error && !busy ? ' · Partial coverage' : ''}
        </div>
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
                    <td>{dollars(row.issuedValue)}</td>
                  </tr>
                  {selected === row.token.symbol ? (
                    <tr id={`detail-${row.token.symbol}`}>
                      <td colSpan={6}>
                        <TokenDetail row={row} />
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
          <a href="/tokens">
            All tokenized stocks on Solana <ArrowUpRight size={14} />
          </a>
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
            DEX Screener supplies pool volume and liquidity. Each returned
            Solana pool is counted once in the overview, including pools shared
            by two stocks. Coverage is partial; routed swaps can involve several
            pool trades. These figures do not include every venue or Backpack
            exchange volume.
          </p>
          <p>
            Solana RPC supplies minted quantities. DefiLlama provides reference
            prices; a pool price is used when needed. Minted value may include
            issuer inventory and must not be read as circulating market cap or
            assets under management. Unknown values are shown as —.
          </p>
          <p>
            Prices and supply refresh on demand about every 2 minutes; pools
            about every 4 minutes. The page checks for updates every minute
            while visible. The reviewed token registry is dated September 12,
            2026; new listings require mint verification.
          </p>
          <a
            href="https://docs.dexscreener.com/api/reference"
            target="_blank"
            rel="noopener noreferrer"
          >
            DEX Screener documentation ↗
          </a>{' '}
          · <a href="/tokens">Token registry ↗</a>
        </div>
      </details>
      <p className="bp-independence">
        Independent of Backpack. Public market data; no wallet required.
      </p>
    </div>
  );
}
