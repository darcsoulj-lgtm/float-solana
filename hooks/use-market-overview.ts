'use client';
import { savedMarketPages, saveMarketPage } from '@/lib/market-browser-cache';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/client';
import { retainRefreshingSources } from '@/lib/market-refresh';
import type { IssuerId } from '@/lib/tokens';
import { MARKET_REFRESH_MS, type MarketOverview } from '@/lib/market-data';

// Public market data only. Share one in-flight request across Home/Markets.
// Provider refreshes are owned by the server's schedule, never by this hook.
function createStore(backpack: boolean) {
  let snapshot: MarketOverview | null = null;
  let inflight: Promise<MarketOverview> | undefined;
  const listeners = new Set<() => void>();
  const storageIndex = backpack ? 1000 : 0;
  const publish = (value: MarketOverview) => { snapshot = value; for (const notify of listeners) notify(); };
  return {
    getSnapshot: () => snapshot,
    publish,
    subscribe: (notify: () => void) => {
      listeners.add(notify);
      try {
        if (!snapshot) {
          const restored = savedMarketPages(window.localStorage, 1, storageIndex)[0];
          if (restored) publish(restored);
        }
      } catch { /* Storage is optional. */ }
      return () => { listeners.delete(notify); };
    },
    read: () => {
      if (!inflight) inflight = api<MarketOverview>(backpack ? 'backpack-market' : 'market-data?overview=1')
        .finally(() => { inflight = undefined; });
      return inflight;
    },
    save: (value: MarketOverview) => saveMarketPage(window.localStorage, storageIndex, value),
  };
}
const allStore = createStore(false), backpackStore = createStore(true);
export function useMarketOverview(
  _holdings: string[],
  refresh: number,
  scope: 'all' | 'holdings' | IssuerId = 'all',
) {
  const store = scope === 'backpack' ? backpackStore : allStore;
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true, loading = false, lastStarted = 0;
    async function load() {
      if (!active || loading || document.hidden || Date.now() - lastStarted < 15000) return;
      loading = true;
      lastStarted = Date.now();
      setBusy(true);
      try {
        const next = await store.read();
        if (!active) return;
        retainRefreshingSources(next, store.getSnapshot() ?? undefined);
        store.publish(next);
        setError('');
        try { store.save(next); } catch { /* Storage is optional. */ }
      } catch {
        if (active) setError('Could not refresh. Showing the last available data.');
      } finally {
        loading = false;
        if (active) setBusy(false);
      }
    }
    void load();
    const wake = () => { if (!document.hidden) void load(); };
    const interval = setInterval(wake, MARKET_REFRESH_MS);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [refresh, store]);
  return { data, busy, error };
}
