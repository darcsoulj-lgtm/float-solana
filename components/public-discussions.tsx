'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { COMMUNITY_CHANNELS } from '@/lib/community-types';
import { useCommunityFeed } from '@/hooks/use-community-feed';
import { Thread } from './community-thread';
import { Button } from './ui/button';

function location() {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  return { topic: params.get('topic') || 'all', thread: params.get('thread') || '' };
}
export function PublicDiscussions({ verify }: { verify: () => void }) {
  const [current, setCurrent] = useState(location);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState('');
  const query = `community/threads?feed=all&topic=${encodeURIComponent(current.topic)}&thread=${encodeURIComponent(current.thread)}`;
  const feed = useCommunityFeed(query, true);
  useEffect(() => {
    const back = () => setCurrent(location());
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  function navigate(topic: string, thread = '') {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'home');
    url.searchParams.set('topic', topic);
    url.searchParams.delete('join');
    url.searchParams.delete('feed');
    if (thread) url.searchParams.set('thread', thread);
    else url.searchParams.delete('thread');
    window.history.pushState(null, '', url.pathname + url.search);
    setCurrent({ topic, thread });
    setMoreError('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return (
    <section className="public-discussions" aria-label="Public discussions">
      <header className="public-discussions-heading">
        <div className="discussion-title-row">
          {current.thread && <Button variant="ghost" size="icon" aria-label="Back to discussions" onClick={() => navigate(current.topic)}><ArrowLeft /></Button>}
          <h1>{current.thread ? 'Discussion' : 'Discussions'}</h1>
        </div>
        {!current.thread && <Button onClick={verify}><Plus size={18} /> New discussion</Button>}
      </header>
      <p className="public-reading-note">Anyone can read. Verify your holdings to post or reply.</p>
      {!current.thread && <div className="channel-filters" aria-label="Discussion channels">
        <div className="channel-filter-scroll">
          <button aria-pressed={current.topic === 'all'} onClick={() => navigate('all')}>All</button>
          {COMMUNITY_CHANNELS.map(channel => <button key={channel.id} aria-pressed={current.topic === channel.id} onClick={() => navigate(channel.id)}>{channel.name}</button>)}
        </div>
      </div>}
      {(feed.error || moreError) && <p role="alert">{feed.error || moreError} <button onClick={() => { void feed.refresh().catch(() => {}); }}>Retry</button></p>}
      {feed.loading ? <output>Loading discussions…</output> : feed.threads.length ? feed.threads.map(thread => (
        <Thread key={thread.id} thread={thread} memberId="" refresh={feed.refresh} detail={!!current.thread} showChannel={current.topic === 'all' || !!current.thread} onOpen={() => navigate(current.topic, thread.id)} onRequireVerification={verify} />
      )) : !feed.error && <p>{current.thread ? 'This discussion is unavailable.' : 'No discussions here yet.'}</p>}
      {feed.cursor && !current.thread && <Button variant="outline" disabled={moreBusy} onClick={async () => {
        setMoreBusy(true); setMoreError('');
        try { await feed.loadMore(); } catch (e) { setMoreError((e as Error).message); }
        finally { setMoreBusy(false); }
      }}>Load more</Button>}
    </section>
  );
}
