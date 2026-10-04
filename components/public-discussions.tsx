'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { normalizeCommunityTopic } from '@/lib/community-types';
import { useCommunityFeed } from '@/hooks/use-community-feed';
import { CommunityFeedFilters } from './community-feed-filters';
import { Thread } from './community-thread';
import { Button } from './ui/button';

function location() {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  return { topic: normalizeCommunityTopic(params.get('topic') || 'all'), thread: params.get('thread') || '', search: params.get('q') || '' };
}
export function PublicDiscussions({ verify }: { verify: () => void }) {
  const [current, setCurrent] = useState(location);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState('');
  const query = `community/threads?feed=all&topic=${encodeURIComponent(current.thread ? 'all' : current.topic)}&q=${encodeURIComponent(current.search)}&thread=${encodeURIComponent(current.thread)}`;
  const feed = useCommunityFeed(query, true);
  useEffect(() => {
    const back = () => setCurrent(location());
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  function navigate(topic: string, thread = '', search = current.search) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'home');
    url.searchParams.set('topic', topic);
    if (search) url.searchParams.set('q',search); else url.searchParams.delete('q');
    url.searchParams.delete('join');
    url.searchParams.delete('feed');
    if (thread) url.searchParams.set('thread', thread);
    else url.searchParams.delete('thread');
    window.history.pushState(null, '', url.pathname + url.search);
    setCurrent({ topic, thread, search });
    setMoreError('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return (
    <section className="public-discussions" aria-label="Community posts">
      <header className="public-discussions-heading">
        <div className="discussion-title-row">
          {current.thread && <Button variant="ghost" size="icon" aria-label="Back to community" onClick={() => navigate(current.topic)}><ArrowLeft /></Button>}
          <h1>{current.thread ? 'Post' : 'Community'}</h1>
        </div>
        {!current.thread && <Button onClick={verify}><Plus size={18} /> Create post</Button>}
      </header>
      <p className="public-reading-note">Anyone can read. Verify your holdings to post or reply.</p>
      {!current.thread && <CommunityFeedFilters feed="all" topic={current.topic} search={current.search}
        onFeed={value => value === 'all' ? navigate(current.topic,'',current.search) : verify()}
        onTopic={value => navigate(value)} onSearch={value => navigate(current.topic,'',value)} />}
      {(feed.error || moreError) && <p role="alert">{feed.error || moreError} <button onClick={() => { void feed.refresh().catch(() => {}); }}>Retry</button></p>}
      {feed.loading ? <output>Loading posts…</output> : feed.threads.length ? feed.threads.map(thread => (
        <Thread key={thread.id} thread={thread} memberId="" refresh={feed.refresh} detail={!!current.thread} showChannel={current.topic === 'all' || !!current.thread} onOpen={() => navigate(current.topic, thread.id)} onRequireVerification={verify} />
      )) : !feed.error && <p>{current.thread ? 'This post is unavailable.' : current.search ? 'No matching posts.' : 'No posts here yet.'}</p>}
      {feed.cursor && !current.thread && <Button variant="outline" disabled={moreBusy} onClick={async () => {
        setMoreBusy(true); setMoreError('');
        try { await feed.loadMore(); } catch (e) { setMoreError((e as Error).message); }
        finally { setMoreBusy(false); }
      }}>Load more</Button>}
    </section>
  );
}
