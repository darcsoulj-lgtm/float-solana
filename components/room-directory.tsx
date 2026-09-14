'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, MessageSquare, Search } from 'lucide-react';
import { Button } from './ui/button';
import { api } from '@/lib/client';
import type { CommunityRoom } from '@/lib/community-types';
type ChannelPage = { channels: CommunityRoom[] };

export function RoomDirectory({
  follows,
  onOpen,
  onFollow,
}: {
  follows: string[];
  onOpen: (room: CommunityRoom) => void;
  onFollow: (room: CommunityRoom) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    query: string;
    page: ChannelPage | null;
    error: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        void api<ChannelPage>('community/channels')
          .then((page) => {
            if (active) setResult({ query, page, error: '' });
          })
          .catch((error) => {
            if (active) setResult({ query, page: null, error: error.message });
          });
      },
      query ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, revision]);
  const current = result?.query === query ? result : null;
  const visibleChannels = (current?.page?.channels || []).filter((room) => {
    const term = query.trim().toLowerCase();
    return (
      !term ||
      room.name.toLowerCase().includes(term) ||
      room.description.toLowerCase().includes(term)
    );
  });
  return (
    <>
      <label className="member-search">
        <Search size={18} />
        <input
          value={query}
          maxLength={60}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a channel"
          aria-label="Find a channel"
        />
      </label>
      {!current && <output className="member-empty">Loading channels…</output>}
      {current?.error && (
        <p className="inline-status" role="alert">
          {current.error}{' '}
          <button onClick={() => setRevision((n) => n + 1)}>Retry</button>
        </p>
      )}
      <div className="topic-directory room-directory">
        {visibleChannels.map((room) => (
          <article key={room.id}>
            <span className="ticker-tile">
              <MessageSquare size={22} />
            </span>
            <div>
              <button className="topic-title" onClick={() => onOpen(room)}>
                {room.name} <ArrowUpRight size={14} />
              </button>
              <p>{room.description}</p>
              <span>
                {room.thread_count}{' '}
                {room.thread_count === 1 ? 'discussion' : 'discussions'}
              </span>
            </div>
            <Button
              variant={follows.includes(room.id) ? 'secondary' : 'outline'}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onFollow(room);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {follows.includes(room.id) ? 'Following' : 'Follow'}
            </Button>
          </article>
        ))}
      </div>
      {current?.page && !visibleChannels.length && (
        <div className="member-empty">
          <h2>{query ? 'No matching channels.' : 'No channels yet.'}</h2>
          <p>Float curates channels so every conversation has a useful home.</p>
        </div>
      )}
    </>
  );
}
