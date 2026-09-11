'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Clock3,
} from 'lucide-react';
import { Button } from './ui/button';
import { SearchPicker } from './search-picker';
import { api } from '@/lib/client';
import { TOKENS } from '@/lib/tokens';
import {
  eventLabel,
  type BriefData,
  type EditorialItem,
} from '@/lib/editorial';

export function SourceCard({
  item,
  onDiscuss,
}: {
  item: EditorialItem;
  onDiscuss?: (item: EditorialItem) => void;
}) {
  return (
    <article
      className={`brief-story news-row ${item.featured ? 'is-featured' : ''}`}
    >
      <div className="news-row-content">
        <div className="brief-meta">
          <span>{item.publisher}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(item.published_at).toISOString()}>
            {new Date(item.published_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </time>
          <span className="brief-inline-tags">
            {item.symbols.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </span>
          {!!item.featured && <span className="brief-featured">Featured</span>}
        </div>
        {item.coverage === 'context' && (
          <p className="coverage-context">
            Industry context · not a detected holding
          </p>
        )}
        <h2>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {item.title}
            <ArrowUpRight size={16} />
          </a>
        </h2>
        <p className="brief-summary">{item.summary}</p>
      </div>
      <div className="brief-story-footer">
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          Read original <ArrowUpRight size={15} />
        </a>
        {onDiscuss && (
          <button onClick={() => onDiscuss(item)}>
            <MessageSquare size={16} /> Discuss this
          </button>
        )}
      </div>
    </article>
  );
}
export function EventCard({ item }: { item: EditorialItem }) {
  const date = new Date(item.event_at ?? Date.parse(item.event_date!));
  const zone = item.event_at === null ? { timeZone: 'UTC' } : {};
  return (
    <article className="brief-event">
      <div className="event-date">
        <span>
          {date.toLocaleDateString(undefined, { month: 'short', ...zone })}
        </span>
        <strong>
          {date.toLocaleDateString(undefined, { day: 'numeric', ...zone })}
        </strong>
      </div>
      <div className="event-detail">
        <div className="brief-story-tags">
          {item.symbols.map((s) => (
            <span key={s}>{s}</span>
          ))}
          <span className={`certainty ${item.certainty}`}>
            {item.certainty === 'confirmed' ? 'Confirmed' : 'Estimated date'}
          </span>
        </div>
        <h3>{item.title}</h3>
        <p className="event-time">
          <Clock3 size={15} />
          {eventLabel(item)}
        </p>
        <p>{item.summary}</p>
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          View announcement <ArrowUpRight size={14} />
        </a>
        <small className="event-source-name">Source: {item.publisher}</small>
      </div>
    </article>
  );
}
export function MemberBrief({
  kind,
  onDiscuss,
  onCalendar,
  holdings,
  symbol,
  onSymbolChange,
}: {
  kind: 'news' | 'event';
  holdings: string[];
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onDiscuss: (item: EditorialItem) => void;
  onCalendar: () => void;
}) {
  const [data, setData] = useState<BriefData | null>(null),
    [events, setEvents] = useState<EditorialItem[]>([]);
  const [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const currentKey = useRef('');
  const [today] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  });
  const query = `editorial/brief?kind=${kind}&scope=personal&symbol=${encodeURIComponent(symbol)}&today=${today}`;
  const requestKey = query + '&retry=' + retry;
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    let active = true;
    currentKey.current = requestKey;
    (async () => {
      await api('editorial/initialize', {});
      const [feed, calendar] = await Promise.all([
        api<BriefData>(query),
        kind === 'news'
          ? api<BriefData>(
              `editorial/brief?kind=event&scope=personal&symbol=${encodeURIComponent(symbol)}&today=${today}`,
            )
          : Promise.resolve(null),
      ]);
      if (active) {
        setError('');
        setMoreError('');
        setLoadedKey(requestKey);
        setData(feed);
        setEvents(calendar?.items.slice(0, 2) || []);
      }
    })().catch((e) => {
      if (active) {
        setError(e.message);
        setData(null);
        setLoadedKey(requestKey);
      }
    });
    return () => {
      active = false;
    };
  }, [query, kind, symbol, requestKey, today]);
  return (
    <div className="holder-brief">
      <div className="brief-toolbar">
        <div className="brief-filter">
          <SearchPicker
            label="Filter coverage by stock"
            value={symbol}
            onChange={onSymbolChange}
            items={[
              { value: 'all', label: 'All my holdings' },
              ...TOKENS.filter((t) => holdings.includes(t.symbol)).map((t) => ({
                value: t.symbol,
                label: `${t.symbol} · ${t.shortName}`,
              })),
            ]}
          />
        </div>
        <Button
          variant="ghost"
          aria-label="Refresh coverage"
          onClick={() => setRetry((v) => v + 1)}
        >
          <RefreshCw size={17} />
        </Button>
      </div>
      <p className="brief-scope-note">
        {kind === 'news'
          ? 'News about the stocks you hold.'
          : 'Company events for the stocks you hold.'}{' '}
        <span>
          {kind === 'event'
            ? 'Times are shown in your timezone.'
            : 'Company sources · Manually updated when an editor publishes.'}
        </span>
      </p>
      {!loading && error ? (
        <div className="brief-empty" role="alert">
          <p>{error}</p>
          <Button onClick={() => setRetry((v) => v + 1)}>Try again</Button>
        </div>
      ) : loading || !data ? (
        <output className="brief-loading" aria-label="Loading coverage">
          <span />
          <span />
          <span />
        </output>
      ) : (
        <>
          {kind === 'news' && events.length > 0 && (
            <section className="up-next-strip" aria-label="Upcoming events">
              <div>
                <CalendarDays size={19} />
                <strong>
                  Next {events.length}{' '}
                  {events.length === 1 ? 'event' : 'events'}
                </strong>
                <button onClick={onCalendar}>
                  Calendar <ArrowUpRight size={14} />
                </button>
              </div>
              {events.map((e) => (
                <a
                  key={e.id}
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{e.title}</span>
                  <small>
                    {eventLabel(e)} · {e.certainty}
                  </small>
                </a>
              ))}
            </section>
          )}
          {data.items.length ? (
            <div className={kind === 'news' ? 'brief-stories' : 'brief-events'}>
              {data.items.map((item) =>
                kind === 'news' ? (
                  <SourceCard key={item.id} item={item} onDiscuss={onDiscuss} />
                ) : (
                  <EventCard key={item.id} item={item} />
                ),
              )}
            </div>
          ) : (
            <div className="brief-empty">
              {kind === 'news' ? (
                <Newspaper size={28} />
              ) : (
                <CalendarDays size={28} />
              )}
              <h2>
                {kind === 'news'
                  ? 'No stories for this selection yet.'
                  : 'No upcoming dates in this selection.'}
              </h2>
              <p>
                {kind === 'news'
                  ? 'No company news has been published for these holdings yet.'
                  : 'Only sourced dates appear here. We’ll label estimates clearly when they are added.'}
              </p>
              {symbol !== 'all' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onSymbolChange('all');
                  }}
                >
                  Show all my holdings
                </Button>
              )}
            </div>
          )}
          {data.hasMore && (
            <Button
              className="brief-load-more"
              variant="outline"
              disabled={moreBusy}
              onClick={async () => {
                setMoreBusy(true);
                setMoreError('');
                try {
                  const next = await api<BriefData>(
                    query + '&offset=' + data.items.length,
                  );
                  if (currentKey.current !== requestKey) return;
                  setData((d) =>
                    d ? { ...next, items: [...d.items, ...next.items] } : next,
                  );
                } catch (e) {
                  if (currentKey.current === requestKey)
                    setMoreError((e as Error).message);
                } finally {
                  setMoreBusy(false);
                }
              }}
            >
              {moreBusy ? 'Loading…' : 'Load more'}
            </Button>
          )}
          {moreError && (
            <p role="alert" className="error">
              {moreError}
            </p>
          )}
          <p className="brief-disclosure">
            Curated coverage, not a real-time newswire.{' '}
            {data.lastReviewed
              ? `Latest editorial update: ${new Date(data.lastReviewed).toLocaleDateString()}.`
              : ''}{' '}
            Research and discussion, not investment advice.
          </p>
        </>
      )}
    </div>
  );
}
