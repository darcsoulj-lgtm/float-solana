'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, MessageSquare } from 'lucide-react';
import Link from './site-link';
import { api } from '@/lib/client';
import { COMMUNITY_CHANNELS, type ThreadPage } from '@/lib/community-types';

export function LandingDiscussions() {
  const [page, setPage] = useState<ThreadPage | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void api<ThreadPage>('community/threads?feed=all&topic=all').then(value => {
      if (active) setPage(value);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  const threads = page?.threads.filter(thread => !thread.hidden).slice(0, 3) ?? [];
  return <section className="landing-discussions" aria-labelledby="landing-discussions-title">
    <header><div><h2 id="landing-discussions-title">From the community</h2><p>Real questions. Different perspectives.</p></div><Link href="/?view=home">View all <ArrowUpRight size={16} aria-hidden="true" /></Link></header>
    {threads.length ? <div className="landing-thread-grid">{threads.map(thread => <Link key={thread.id} className="landing-thread" href={`/?view=home&thread=${encodeURIComponent(thread.id)}`}>
      <span className="landing-thread-topic">{COMMUNITY_CHANNELS.find(channel => channel.id === thread.topic)?.name ?? thread.room_name ?? 'Discussion'}</span>
      <h3>{thread.title}</h3><p>{thread.body}</p>
      <span className="landing-thread-replies"><MessageSquare size={16} aria-hidden="true" />{thread.reply_count} {thread.reply_count === 1 ? 'reply' : 'replies'}</span>
    </Link>)}</div> : <p className="landing-feed-state">{failed ? 'Discussion previews are unavailable. You can still open discussions above.' : page ? 'Start the conversation. What are you watching?' : 'Loading discussions…'}</p>}
  </section>;
}
