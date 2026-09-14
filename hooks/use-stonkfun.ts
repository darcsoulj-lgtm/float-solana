'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { SourceResult } from '@/lib/market-data';
import type { StonkfunOverview } from '@/lib/stonkfun-data';

export function useStonkfun() {
  const [source, setSource] = useState<SourceResult<StonkfunOverview> | null>(
    null,
  );
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let loading = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (!active || loading || document.hidden) return;
      loading = true;
      try {
        const result = await api<{
          stonkfun: SourceResult<StonkfunOverview>;
        }>('stonkfun');
        if (active) {
          setSource(result.stonkfun);
          setError('');
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : '');
      } finally {
        loading = false;
        if (active) setBusy(false);
      }
      if (active) timer = setTimeout(load, 300000);
    };
    const visible = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        void load();
      }
    };
    void load();
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  return { source, busy, error };
}
