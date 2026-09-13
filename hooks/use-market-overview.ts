'use client';
import { registryTokens, type RegistryStatus } from '@/lib/token-registry';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { MARKET_BATCH_SIZE, type IssuerId } from '@/lib/tokens';
import { mergeMarketPages, type MarketOverview } from '@/lib/market-data';

// Public observations only: reuse snapshots between Home and Markets without
// storing wallet balances, membership, or personal selections. Source timestamps
// remain intact, and tokenObservation still enforces age/valuation limits.
const snapshots = new Map<number, MarketOverview>();
function savedPages() {
  const pages: MarketOverview[] = [];
  for (const [batch, page] of snapshots) pages[batch] = page;
  return pages;
}

// One owner for overview polling. No personal data is persisted or shared.
// Public source snapshots are shared by the server, across all visitors.
export function useMarketOverview(
  holdings: string[],
  refresh: number,
  scope: 'all' | 'holdings' | IssuerId = 'all',
) {
  const [data, setData] = useState<MarketOverview | null>(() =>
    snapshots.size ? mergeMarketPages(savedPages().filter(Boolean)) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pages = useRef<MarketOverview[]>(savedPages());
  const [circulation, setCirculation] =
    useState<MarketOverview['circulation']>();
  useEffect(() => {
    if (scope !== 'all' && scope !== 'xstocks') return;
    let active = true,
      attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let loading = false;
    async function load() {
      if (!active || loading || document.hidden) return;
      loading = true;
      let pending = false;
      try {
        const result = await api<{
          circulation: NonNullable<MarketOverview['circulation']>;
        }>('circulation');
        if (!active) return;
        setCirculation(result.circulation);
        pending = !!result.circulation.refreshing;
      } catch {
        /* Retain dated observations on transient transport failures. */
      } finally {
        loading = false;
      }
      if (active)
        timer = setTimeout(load, pending && attempts++ < 20 ? 3000 : 30000);
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
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh, scope]);
  const holdingsKey = holdings.join('|');
  useEffect(() => {
    let active = true,
      loading = false,
      lastStarted = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wake: (() => void) | undefined;
    const pause = () =>
      new Promise<void>((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, 2000);
      });
    async function load() {
      if (!active || loading || Date.now() - lastStarted < 15000) return;
      loading = true;
      lastStarted = Date.now();
      setBusy(true);
      let registry: RegistryStatus | undefined = pages.current
        .filter(Boolean)
        .map((p) => p.registry)
        .filter((r): r is RegistryStatus => !!r)
        .sort((a, b) => b.additions.length - a.additions.length)[0];
      try {
        registry = await api<RegistryStatus>('token-registry');
      } catch {
        /* Keep last verified registry on transport failure. */
      }
      if (!active) return;
      const tokens = registryTokens(registry);
      const owned = new Set(
        holdingsKey
          .split('|')
          .map((s) =>
            Math.floor(
              tokens.findIndex((t) => t.symbol === s) / MARKET_BATCH_SIZE,
            ),
          ),
      );
      const batches = Array.from(
        { length: Math.ceil(tokens.length / MARKET_BATCH_SIZE) },
        (_, i) => i,
      )
        .filter(
          (batch) =>
            scope === 'all' ||
            (scope === 'holdings'
              ? owned.has(batch)
              : tokens
                  .slice(
                    batch * MARKET_BATCH_SIZE,
                    (batch + 1) * MARKET_BATCH_SIZE,
                  )
                  .some((token) => token.issuer === scope)),
        )
        .sort((a, b) => Number(owned.has(b)) - Number(owned.has(a)) || a - b);
      let pending = batches,
        failures = 0;

      try {
        // Subsequent reads check only sources still refreshing, not all tokens.
        for (let pass = 0; active && pending.length && pass < 3; pass++) {
          if (pass) await pause();
          if (!active || document.visibilityState !== 'visible') break;
          const queue = pending;
          pending = [];
          let cursor = 0;
          async function worker() {
            while (active && cursor < queue.length) {
              const batch = queue[cursor++];
              try {
                const next = await api<MarketOverview>(
                  'market-data?batch=' + batch,
                );
                if (!active) return;
                if (
                  Object.values(next).some(
                    (s) =>
                      s &&
                      typeof s === 'object' &&
                      'refreshing' in s &&
                      s.refreshing,
                  )
                )
                  pending.push(batch);
                // Keep an already-rendered observation during refresh. Original
                // timestamps remain; valuation code still enforces its age limit.
                const previous = pages.current[batch];
                if (previous) {
                  for (const key of [
                    'catalog',
                    'prices',
                    'markets',
                    'supplies',
                    'pools',
                    'history',
                    'circulation',
                  ] as const) {
                    if (next[key]?.refreshing && previous[key]?.data) {
                      Object.assign(next, {
                        [key]: { ...previous[key], refreshing: true },
                      });
                    }
                  }
                }
                if (registry && !next.registry) next.registry = registry;
                pages.current[batch] = next;
                snapshots.set(batch, next);
                setData(mergeMarketPages(pages.current.filter(Boolean)));
              } catch {
                failures++;
              }
            }
          }
          await Promise.all([worker(), worker()]);
        }
        if (active)
          setError(
            failures
              ? 'Some market data is unavailable. Coverage will update automatically.'
              : '',
          );
      } finally {
        loading = false;
        if (active) setBusy(false);
      }
    }
    void load();
    const visible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const interval = setInterval(visible, 30000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    window.addEventListener('online', visible);
    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(timer);
      wake?.();
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
      window.removeEventListener('online', visible);
    };
  }, [refresh, holdingsKey, scope]);
  const latestCirculation =
    circulation &&
    (circulation.fetchedAt ?? 0) >= (data?.circulation?.fetchedAt ?? 0)
      ? circulation
      : data?.circulation;
  return {
    data: data ? { ...data, circulation: latestCirculation } : data,
    busy,
    error,
  };
}
