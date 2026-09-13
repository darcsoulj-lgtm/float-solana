'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, MessageSquare, Search } from 'lucide-react';
import { Button } from './ui/button';
import { api } from '@/lib/client';
import type { CommunityRoom } from '@/lib/community-types';
import type { RoomPage } from '@/lib/community-rooms';

export function RoomDirectory({
  follows,
  onOpen,
  onFollow,
  onCreate,
}: {
  follows: string[];
  onOpen: (room: CommunityRoom) => void;
  onFollow: (room: CommunityRoom) => Promise<void>;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    query: string;
    page: RoomPage | null;
    error: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        void api<RoomPage>('community/rooms?q=' + encodeURIComponent(query))
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
  async function more() {
    if (!current?.page?.nextCursor || busy) return;
    setBusy(true);
    try {
      const page = await api<RoomPage>(
        'community/rooms?q=' +
          encodeURIComponent(query) +
          '&cursor=' +
          encodeURIComponent(current.page.nextCursor),
      );
      setResult((previous) =>
        previous?.query === query && previous.page
          ? {
              ...previous,
              error: '',
              page: {
                rooms: [...previous.page.rooms, ...page.rooms],
                nextCursor: page.nextCursor,
              },
            }
          : previous,
      );
    } catch (error) {
      setResult((previous) =>
        previous?.query === query
          ? { ...previous, error: (error as Error).message }
          : previous,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <label className="member-search">
        <Search size={18} />
        <input
          value={query}
          maxLength={60}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a room"
          aria-label="Find a room"
        />
      </label>
      {!current && <output className="member-empty">Loading rooms…</output>}
      {current?.error && (
        <p className="inline-status" role="alert">
          {current.error}{' '}
          <button onClick={() => setRevision((n) => n + 1)}>Retry</button>
        </p>
      )}
      <div className="topic-directory room-directory">
        {current?.page?.rooms.map((room) => (
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
      {current?.page?.nextCursor && (
        <Button
          variant="outline"
          className="load-more"
          disabled={busy}
          onClick={more}
        >
          More rooms
        </Button>
      )}
      {current?.page && !current.page.rooms.length && (
        <div className="member-empty">
          <h2>{query ? 'No matching rooms.' : 'No rooms yet.'}</h2>
          <p>Choose a name and give people a reason to join.</p>
          <Button variant="outline" onClick={onCreate}>
            Create a room
          </Button>
        </div>
      )}
    </>
  );
}
