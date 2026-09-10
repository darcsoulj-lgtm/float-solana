'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TOKENS } from '@/lib/tokens';
import { api } from '@/lib/client';
import type { ModerationData } from '@/lib/community-types';
export function CommunityAdmin({
  section = 'moderation',
}: {
  section?: 'sources' | 'moderation' | 'members';
}) {
  const [data, setData] = useState<ModerationData | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    setData(await api<ModerationData>('community/moderation'));
  }
  useEffect(() => {
    api<ModerationData>('community/moderation')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function act(body: unknown) {
    setBusy(true);
    setError('');
    try {
      await api('community/moderation', body);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data ? (
        <p>Administrator authorization required. {error ? '' : 'Loading…'}</p>
      ) : (
        <>
          {section === 'sources' && (
            <section className="operations-panel">
              <h2>Curated source library</h2>
              <p>
                Real source links shown in member homes. Use accurate publisher
                names and descriptive titles.
              </p>
              <form
                className="form panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    f = new FormData(form);
                  void act({
                    action: 'source',
                    title: f.get('title'),
                    publisher: f.get('publisher'),
                    url: f.get('url'),
                    symbol: f.get('symbol'),
                    active: true,
                  });
                }}
              >
                <label>
                  Title
                  <input name="title" required minLength={5} maxLength={160} />
                </label>
                <label>
                  Publisher
                  <input
                    name="publisher"
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
                <label>
                  HTTPS URL
                  <input name="url" type="url" required />
                </label>
                <label>
                  Stock
                  <select name="symbol">
                    {TOKENS.map((t) => (
                      <option key={t.symbol}>{t.symbol}</option>
                    ))}
                  </select>
                </label>
                <Button type="submit" disabled={busy}>
                  Add source
                </Button>
              </form>
              {data.sources.map((s) => (
                <div className="panel" key={s.id}>
                  <strong>
                    {s.publisher} · {s.symbol}
                  </strong>
                  <p>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title} ↗
                    </a>
                  </p>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      act({ ...s, action: 'source', active: !s.active })
                    }
                  >
                    {s.active ? 'Hide source' : 'Restore source'}
                  </Button>
                </div>
              ))}
            </section>
          )}
          {section === 'moderation' && (
            <section className="operations-panel">
              <h2>Open reports ({data.reports.length})</h2>
              {!data.reports.length && <p>No open reports.</p>}
              {data.reports.map((r) => (
                <article className="panel" key={r.id}>
                  <p>
                    <strong>{r.reporter}</strong> · {r.target_type}
                  </p>
                  <p>{r.reason}</p>
                  <blockquote style={{ whiteSpace: 'pre-wrap' }}>
                    {r.content}
                  </blockquote>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act({
                        action: 'hide',
                        type: r.target_type,
                        id: r.target_id,
                      })
                    }
                  >
                    Hide content
                  </Button>{' '}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => act({ action: 'resolve', id: r.id })}
                  >
                    Resolve report
                  </Button>
                </article>
              ))}
            </section>
          )}
          {section === 'members' && (
            <section className="operations-panel">
              <h2>Recent members</h2>
              <p>
                Up to 100 recent members. Suspension immediately ends active
                sessions.
              </p>
              {data.members.map((m) => (
                <div className="panel" key={m.id}>
                  <strong>{m.alias}</strong> ·{' '}
                  {m.suspended ? 'Suspended' : 'Registered'}{' '}
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      act({
                        action: m.suspended ? 'restore-member' : 'suspend',
                        id: m.id,
                      })
                    }
                  >
                    {m.suspended ? 'Restore membership' : 'Suspend'}
                  </Button>
                </div>
              ))}
            </section>
          )}
          {section === 'moderation' && (
            <section className="operations-panel">
              <h2>Hidden content</h2>
              {[
                ...data.hiddenThreads.map((t) => ({ ...t, type: 'thread' })),
                ...data.hiddenReplies.map((t) => ({ ...t, type: 'reply' })),
              ].map((t) => (
                <article className="panel" key={t.id}>
                  <strong>{t.alias}</strong>
                  <p>{t.body}</p>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      act({ action: 'restore', type: t.type, id: t.id })
                    }
                  >
                    Restore content
                  </Button>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
