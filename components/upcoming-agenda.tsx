'use client';
import { useEffect, useId, useState } from 'react';
import {
  CalendarDays,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '@/lib/client';
import { readThenRefresh } from '@/lib/client-loading';
import {
  eventLabel,
  type BriefData,
  type EditorialItem,
} from '@/lib/editorial';

export function groupAgendaEvents(items: EditorialItem[]) {
  const groups = new Map<string, { label: string; items: EditorialItem[] }>();
  for (const item of items) {
    const date = new Date(item.event_at ?? item.event_date!);
    const options = item.event_at === null ? { timeZone: 'UTC' } : {};
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...options,
    }).formatToParts(date);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    const key = `${part('year')}-${part('month')}-${part('day')}`;
    const group = groups.get(key) || {
      label: date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...options,
      }),
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({ key, ...group }));
}

export function UpcomingAgenda({
  symbol,
  holdingsKey,
  refresh,
}: {
  symbol: string;
  holdingsKey: string;
  refresh: number;
}) {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'calendar' || params.get('agenda') === 'open';
  });
  const filterKey = symbol + ':' + holdingsKey;
  const [pagination, setPagination] = useState({ key: filterKey, page: 0 });
  const page = expanded && pagination.key === filterKey ? pagination.page : 0;
  const [result, setResult] = useState<{
    key: string;
    data: BriefData | null;
    error: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const id = useId();
  const date = new Date();
  const today = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  const key = `${filterKey}:${page}:${refresh}:${retry}:${today}`;
  const displayKey = `${filterKey}:${page}:${today}`;
  const current = result?.key === displayKey ? result : null;
  useEffect(() => {
    let active = true;
    void readThenRefresh({
      refresh: () => api('editorial/initialize', {}),
      read: () =>
        api<BriefData>(
          `editorial/brief?kind=event&scope=personal&symbol=${encodeURIComponent(symbol)}&today=${today}&offset=${page * 20}`,
        ),
      publish: (data) => {
        if (active) setResult({ key: displayKey, data, error: '' });
      },
    }).catch(() => {
      if (active)
        setResult((previous) => ({
          key: displayKey,
          data: previous?.key === displayKey ? previous.data : null,
          error: 'Events could not update.',
        }));
    });
    return () => {
      active = false;
    };
  }, [key, displayKey, symbol, today, page]);
  function toggle() {
    const next = !expanded;
    setExpanded(next);
    setPagination({ key: filterKey, page: 0 });
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('agenda', 'open');
    else url.searchParams.delete('agenda');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  const items = current?.data?.items || [];
  function eventRow(item: EditorialItem) {
    return (
      <a
        className="agenda-event"
        key={item.id}
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="agenda-event-title">
          {item.title}
          <ArrowUpRight size={14} aria-hidden="true" />
        </span>
        <span className="agenda-event-meta">
          <span>{item.symbols.join(' · ')}</span>
          <time>{eventLabel(item)}</time>
          {item.certainty === 'estimated' && <span>Estimated</span>}
        </span>
      </a>
    );
  }
  return (
    <section className="upcoming-agenda" aria-label="Upcoming events">
      <header>
        <h2>
          <CalendarDays size={17} aria-hidden="true" />
          Upcoming
        </h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={toggle}
        >
          {expanded ? 'Show less' : 'View all'}
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </header>
      {current?.error && items.length > 0 && (
        <p className="agenda-status" role="status">
          {current.error} Showing saved events.{' '}
          <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </p>
      )}
      <div id={id} aria-busy={!current}>
        {!current ? (
          <p className="agenda-status" role="status">
            Loading events…
          </p>
        ) : current.error && !items.length ? (
          <p className="agenda-status" role="status">
            {current.error}{' '}
            <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
          </p>
        ) : !items.length ? (
          <p className="agenda-status">
            No upcoming events for these holdings.
          </p>
        ) : expanded ? (
          <>
            {current.error && (
              <p role="status" className="agenda-status">
                {current.error} Showing saved events.
              </p>
            )}
            <p className="agenda-timezone">Times in your timezone</p>
            {groupAgendaEvents(items).map((group) => (
              <section className="agenda-day" key={group.key}>
                <h3>{group.label}</h3>
                {group.items.map(eventRow)}
              </section>
            ))}
            {(page > 0 || current.data?.hasMore) && (
              <nav className="agenda-pagination" aria-label="Event pages">
                <button
                  disabled={page === 0}
                  onClick={() =>
                    setPagination({ key: filterKey, page: page - 1 })
                  }
                >
                  Previous
                </button>
                <span>{page + 1}</span>
                <button
                  disabled={!current.data?.hasMore}
                  onClick={() =>
                    setPagination({ key: filterKey, page: page + 1 })
                  }
                >
                  Next
                </button>
              </nav>
            )}
          </>
        ) : (
          items.slice(0, 2).map(eventRow)
        )}
      </div>
    </section>
  );
}
