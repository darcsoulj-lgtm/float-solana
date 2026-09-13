'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, MessageSquare, Plus } from 'lucide-react';
import { PortfolioSummary } from './portfolio-summary';
import { MemberBrief } from './member-brief';
import { useMarketOverview } from '@/hooks/use-market-overview';
import { api } from '@/lib/client';
import type { Holding, ThreadPage } from '@/lib/community-types';
import type { EditorialItem } from '@/lib/editorial';

export function MemberHomePanel({
  revision,
  positions,
  symbol,
  onSymbolChange,
  onDiscuss,
  onMarkets,
  onThread,
  onDiscussions,
  onCreate,
}: {
  revision: number;
  positions: Holding[];
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onDiscuss: (item: EditorialItem) => void;
  onMarkets: () => void;
  onThread: (id: string) => void;
  onDiscussions: () => void;
  onCreate: () => void;
}) {
  const holdings = positions.map((p) => p.symbol);
  const { data, error } = useMarketOverview(holdings, 0, 'holdings');
  const [now, setNow] = useState(Date.now);
  const [threads, setThreads] = useState<ThreadPage | null>(null);
  const [threadError, setThreadError] = useState('');
  const [retry, setRetry] = useState(0);
  const holdingsKey = holdings.join('|');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    const load = () =>
      void api<ThreadPage>('community/threads?topic=all&feed=personal')
        .then((page) => {
          if (active) {
            setThreads(page);
            setThreadError('');
          }
        })
        .catch(() => {
          if (active) setThreadError('Discussions could not update.');
        });
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [holdingsKey, retry, revision]);
  return (
    <div className="home-overview">
      <h1 className="sr-only">Home</h1>
      <div className="home-portfolio">
        <PortfolioSummary
          positions={positions}
          data={data}
          now={now}
          compact
          onSelect={(s) => {
            onSymbolChange(s);
            document
              .getElementById('home-news')
              ?.scrollIntoView({ block: 'nearest' });
          }}
        />
        <div className="home-portfolio-footer">
          {error ? (
            <output>Prices could not update. Saved quotes may be dated.</output>
          ) : (
            <span />
          )}
          <button onClick={onMarkets}>
            Explore markets <ArrowRight size={15} />
          </button>
        </div>
      </div>
      <section
        id="home-news"
        className="home-news"
        aria-labelledby="home-news-title"
      >
        <div className="section-heading">
          <h2 id="home-news-title">Latest news</h2>
          <span>Your holdings · 7 days</span>
        </div>
        <MemberBrief
          kind="news"
          holdings={holdings}
          symbol={symbol}
          onSymbolChange={onSymbolChange}
          onDiscuss={onDiscuss}
          compact
        />
      </section>
      <section
        className="home-discussions"
        aria-labelledby="home-discussions-title"
      >
        <div className="section-heading">
          <h2 id="home-discussions-title">Holder discussions</h2>
          <button onClick={onDiscussions}>
            View all <ArrowRight size={15} />
          </button>
        </div>
        {threadError && (
          <output className="inline-status">
            {threadError}{' '}
            <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
          </output>
        )}
        {!threads && !threadError ? (
          <output className="inline-status">Loading discussions…</output>
        ) : threads?.threads.length ? (
          <div className="home-thread-list">
            {threads.threads.slice(0, 3).map((t) => (
              <button
                key={t.id}
                onClick={() => onThread(t.id)}
                className="home-thread"
              >
                <span>
                  <small>
                    {t.room_name || t.topic} · {t.alias}
                  </small>
                  <strong>{t.title}</strong>
                </span>
                <span className="home-thread-replies">
                  <MessageSquare size={15} />
                  {t.reply_count}
                  <span className="sr-only"> replies</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          !threadError && (
            <div className="home-discussion-empty">
              <p>No discussions for your holdings yet.</p>
              <button className="home-create" onClick={onCreate}>
                <Plus size={16} />
                Start a discussion
              </button>
            </div>
          )
        )}
      </section>
    </div>
  );
}
