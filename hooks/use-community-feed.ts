'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import type { ThreadPage } from '@/lib/community-types';

// Each filter owns its saved page. Late requests cannot overwrite another filter.
export function useCommunityFeed(query: string, active: boolean) {
  const [pages, setPages] = useState<Record<string, ThreadPage>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sequence = useRef({ value: 0 });
  const refresh = useCallback(async () => {
    const request = ++sequence.current.value;
    try {
      const page = await api<ThreadPage>(query);
      if (request !== sequence.current.value) return;
      setPages((previous) => ({ ...previous, [query]: page }));
      setErrors((previous) => ({ ...previous, [query]: '' }));
    } catch (error) {
      if (request === sequence.current.value)
        setErrors((previous) => ({
          ...previous,
          [query]: (error as Error).message,
        }));
      throw error;
    }
  }, [query]);
  useEffect(() => {
    if (!active) return;
    void refresh().catch(() => {
      /* The error belongs to this filter's state. */
    });
    const poll = () => {
      if (document.visibilityState === 'visible')
        void refresh().catch(() => {
          /* Keep the last usable feed when a background poll fails. */
        });
    };
    const timer = window.setInterval(poll, 15000);
    document.addEventListener('visibilitychange', poll);
    const requests = sequence.current;
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
      requests.value++;
    };
  }, [active, refresh]);
  const page = pages[query];
  const loadMore = async () => {
    if (!page?.nextCursor) return;
    const request = sequence.current.value;
    const more = await api<ThreadPage>(
      query + '&cursor=' + encodeURIComponent(page.nextCursor),
    );
    if (request !== sequence.current.value) return;
    setPages((previous) => ({
      ...previous,
      [query]: {
        threads: [...(previous[query]?.threads ?? []), ...more.threads],
        nextCursor: more.nextCursor,
      },
    }));
  };
  return {
    threads: page?.threads ?? [],
    cursor: page?.nextCursor ?? null,
    error: errors[query] ?? '',
    loading: !page && !errors[query],
    hasPage: !!page,
    refresh,
    loadMore,
  };
}
