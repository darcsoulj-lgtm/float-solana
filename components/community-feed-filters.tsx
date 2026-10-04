'use client';
import { useEffect, useState, useId } from 'react';
import { Search, X } from 'lucide-react';
import { COMMUNITY_CHANNELS } from '@/lib/community-types';

export function CommunityFeedFilters({ feed, topic, search, onFeed, onTopic, onSearch }: {
  feed: string; topic: string; search: string;
  onFeed: (feed: string) => void; onTopic: (topic: string) => void; onSearch: (search: string) => void;
}) {
  const id = useId();
  const [input, setInput] = useState(search);
  const [lastSearch, setLastSearch] = useState(search);
  if (lastSearch !== search) {setLastSearch(search);setInput(search);}
  useEffect(() => {
    if (input.trim() === search) return;
    const timer = setTimeout(() => onSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input, search, onSearch]);
  return <div className="community-feed-controls">
    <div className="community-feed-navigation">
      <div className="community-feed-tabs" aria-label="Community feeds">
        {[['all','Feed'],['saved','Saved']].map(([value,label]) =>
          <button key={value} type="button" aria-pressed={feed === value} onClick={() => onFeed(value)}>{label}</button>)}
      </div>
      <div className="community-topic-filter" data-active={topic !== 'all'}>
        <select id={`${id}-topic`} aria-label="Filter posts by topic" value={topic} onChange={e => onTopic(e.target.value)}>
          <option value="all">All topics</option>
          {topic !== 'all' && !COMMUNITY_CHANNELS.some(c => c.id === topic) && <option value={topic}>{topic === 'general' ? 'General' : topic}</option>}
          {COMMUNITY_CHANNELS.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
        </select>
        {topic !== 'all' && <button type="button" aria-label="Clear topic filter" onClick={() => onTopic('all')}><X size={16} aria-hidden="true" /></button>}
      </div>
    </div>
    <div className="community-post-search">
      <Search size={17} aria-hidden="true" />
      <input aria-label="Search community posts" placeholder="Search company, ticker or posts" type="search" value={input} maxLength={80} onChange={e => setInput(e.target.value)} />
      {input && <button type="button" aria-label="Clear post search" onClick={() => {setInput('');onSearch('');}}><X size={16} /></button>}
    </div>
  </div>;
}
