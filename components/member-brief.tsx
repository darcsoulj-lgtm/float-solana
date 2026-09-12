'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Clock3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from './ui/button';
import { SearchPicker } from './search-picker';
import { UpcomingAgenda } from './upcoming-agenda';
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
      </div>
      <div className="brief-story-footer">
        {onDiscuss && (
          <button onClick={() => onDiscuss(item)}>
            <MessageSquare size={16} /> Discuss
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
      </div>
    </article>
  );
}
export function MemberBrief({
  kind,
  onDiscuss,
  holdings,
  symbol,
  onSymbolChange,
}: {
  kind: 'news' | 'event';
  holdings: string[];
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onDiscuss: (item: EditorialItem) => void;
}) {
  const [data, setData] = useState<BriefData | null>(null);
  const [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const holdingsKey = holdings.join(',');
  const selectionKey = kind + ':' + symbol + ':' + holdingsKey;
  const [pagination, setPagination] = useState({ key: selectionKey, page: 0 });
  const page = pagination.key === selectionKey ? pagination.page : 0;
  const setPage = (update: (previous: number) => number) =>
    setPagination((previous) => ({
      key: selectionKey,
      page: update(previous.key === selectionKey ? previous.page : 0),
    }));
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setRetry((v) => v + 1);
    }, 900000);
    const focus = () => setRetry((v) => v + 1);
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, []);
  const currentKey = useRef('');
  useEffect(() => {
    if (!data?.pending) return;
    const timer = setTimeout(() => setRetry((v) => v + 1), 10000);
    return () => clearTimeout(timer);
  }, [data]);
  const [today] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  });
  const query =
    kind === 'news'
      ? `holder-news?symbol=${encodeURIComponent(symbol)}&offset=${page * 20}`
      : `editorial/brief?kind=${kind}&scope=personal&symbol=${encodeURIComponent(symbol)}&today=${today}&offset=${page * 20}`;
  const requestKey = query + '&retry=' + retry + '&holdings=' + holdingsKey;
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    let active = true;
    currentKey.current = requestKey;
    (async () => {
      if (kind === 'event') await api('editorial/initialize', {});
      let refreshFailed = false;
      if (kind === 'news')
        await api('holder-news', { symbol }).catch(() => {
          refreshFailed = true;
        });
      const feed = await api<BriefData>(query);
      if (active) {
        setError('');
        setLoadedKey(requestKey);
        setData(
          refreshFailed
            ? {
                ...feed,
                unavailable: feed.unavailable || 1,
                notice:
                  'News could not refresh. Showing saved headlines where available.',
              }
            : feed,
        );
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
        {holdings.length <= 6 ? (
          <fieldset
            className="holding-filter-chips"
            aria-label="Filter by holding"
          >
            {['all', ...holdings].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={symbol === s}
                onClick={() => onSymbolChange(s)}
              >
                {s === 'all' ? 'All holdings' : s}
              </button>
            ))}
          </fieldset>
        ) : (
          <div className="brief-filter">
            <SearchPicker
              label="Filter by holding"
              value={symbol}
              onChange={onSymbolChange}
              items={[
                { value: 'all', label: 'All holdings' },
                ...TOKENS.filter((t) => holdings.includes(t.symbol)).map(
                  (t) => ({
                    value: t.symbol,
                    label: t.symbol + ' · ' + t.shortName,
                  }),
                ),
              ]}
            />
          </div>
        )}
        {kind === 'news' && (
          <small className="brief-disclosure">Last 7 days</small>
        )}
        <Button
          variant="ghost"
          aria-label="Refresh coverage"
          onClick={() => setRetry((v) => v + 1)}
        >
          <RefreshCw size={17} />
        </Button>
      </div>
      {kind === 'event' && (
        <p className="brief-scope-note">Times shown in your timezone.</p>
      )}

      {kind === 'news' && (
        <UpcomingAgenda
          symbol={symbol}
          holdingsKey={holdingsKey}
          refresh={retry}
        />
      )}
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
                  ? data.pending
                    ? 'Loading news…'
                    : data.unavailable
                      ? 'News unavailable'
                      : 'No recent headlines'
                  : 'No upcoming events.'}
              </h2>
              <p>
                {kind === 'news'
                  ? data.pending
                    ? 'Fetching headlines for your holdings.'
                    : data.unavailable
                      ? 'The news feed could not update. Try again shortly.'
                      : 'No matching headlines in this feed from the last seven days.'
                  : 'Events appear once a source is confirmed.'}
              </p>
              {kind === 'news' && !!data.unavailable && !data.pending && (
                <Button
                  variant="outline"
                  onClick={() => setRetry((v) => v + 1)}
                >
                  Try again
                </Button>
              )}
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
          {(data.hasMore || page > 0) && (
            <div className="brief-pager">
              <Button
                variant="ghost"
                disabled={page === 0}
                aria-label="Newer news"
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <span>{page + 1}</span>
              <Button
                variant="ghost"
                disabled={!data.hasMore}
                aria-label="Older news"
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
          <p className="brief-disclosure">
            {kind === 'news'
              ? 'Checks every 15 min while open. '
              : 'Source-confirmed events. '}
            {data.lastReviewed
              ? `Checked ${new Date(data.lastReviewed).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`
              : ''}
            {data.notice && <output> {data.notice}</output>}
          </p>
        </>
      )}
    </div>
  );
}
