'use client';
import { HolderTierBadge } from './holder-tier-badge';
import { MemberAvatar } from './member-avatar';
import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/client';
import type { CommunityThread, ReplyPage } from '@/lib/community-types';
export function Thread({
  thread: t,
  memberId,
  refresh,
}: {
  thread: CommunityThread;
  memberId: string;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState<ReplyPage>({ replies: [], nextCursor: null }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState<{ type: string; id: string } | null>(null),
    [remove, setRemove] = useState<{ type: string; id: string } | null>(null),
    [reason, setReason] = useState('');
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function replies() {
    setPage(await api<ReplyPage>('community/threads/' + t.id + '/replies'));
  }
  return (
    <article className="thread-post" id={'thread-' + t.id}>
      <div className="thread-meta">
        <MemberAvatar
          alias={t.alias}
          memberId={t.member_id}
          version={t.avatar_key}
        />
        <strong>{t.alias}</strong>
        {t.badge && <span className="pill">{t.badge} holder</span>}
        {t.value_tier && (
          <HolderTierBadge
            tier={t.value_tier}
            expiresAt={t.value_tier_expires_at}
          />
        )}
        <span>
          {t.room_name || t.topic} ·{' '}
          {new Date(t.created_at).toLocaleDateString()}
        </span>
      </div>
      <h3>{t.title}</h3>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {t.body}
      </p>
      <div className="thread-bottom">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (!open) await replies();
              setOpen(!open);
            })
          }
        >
          {t.reply_count} replies {open ? '↑' : '↓'}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          aria-pressed={!!t.saved}
          onClick={() =>
            run(async () => {
              await api('community/save', {
                type: 'thread',
                id: t.id,
                save: !t.saved,
              });
              await refresh();
            })
          }
        >
          <Bookmark size={16} fill={t.saved ? 'currentColor' : 'none'} />
          {t.saved ? 'Saved' : 'Save'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setReport({ type: 'thread', id: t.id })}
        >
          Report
        </Button>
        {t.member_id === memberId && (
          <Button
            variant="ghost"
            onClick={() => setRemove({ type: 'threads', id: t.id })}
          >
            Remove
          </Button>
        )}
      </div>
      {open && (
        <>
          {page.replies.map((r) => (
            <div className="reply" key={r.id}>
              <div className="reply-author">
                <MemberAvatar
                  alias={r.alias}
                  memberId={r.member_id}
                  version={r.avatar_key}
                />
                <strong>{r.alias}</strong>
                {r.badge && <span className="pill">{r.badge} holder</span>}
                {r.value_tier && (
                  <HolderTierBadge
                    tier={r.value_tier}
                    expiresAt={r.value_tier_expires_at}
                  />
                )}
              </div>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {r.body}
              </p>
              <Button
                variant="ghost"
                onClick={() => setReport({ type: 'reply', id: r.id })}
              >
                Report
              </Button>
              {r.member_id === memberId && (
                <Button
                  variant="ghost"
                  onClick={() => setRemove({ type: 'replies', id: r.id })}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {page.nextCursor && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const p = await api<ReplyPage>(
                    'community/threads/' +
                      t.id +
                      '/replies?cursor=' +
                      encodeURIComponent(page.nextCursor!),
                  );
                  setPage((a) => ({
                    replies: [...a.replies, ...p.replies],
                    nextCursor: p.nextCursor,
                  }));
                })
              }
            >
              More replies
            </Button>
          )}
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget,
                body = new FormData(f).get('body');
              void run(async () => {
                await api('community/threads/' + t.id + '/replies', { body });
                f.reset();
                await replies();
                await refresh();
              });
            }}
          >
            <textarea
              name="body"
              aria-label="Your reply"
              placeholder="Write a reply…"
              required
              maxLength={2000}
            />
            <Button disabled={busy} type="submit">
              Reply
            </Button>
          </form>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={!!report}
        onOpenChange={(v) => {
          if (!v) setReport(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Report to moderators</DialogTitle>
          <DialogDescription>
            Tell us which guideline this content breaks.
          </DialogDescription>
          <textarea
            aria-label="Report reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          <Button
            disabled={busy || reason.trim().length < 5}
            onClick={() =>
              void run(async () => {
                await api('community/reports', { ...report, reason });
                setReport(null);
                setReason('');
              })
            }
          >
            Submit report
          </Button>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={(v) => {
          if (!v) setRemove(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Delete?</DialogTitle>
          <DialogDescription>
            It will be hidden from members. Moderators retain access for review.
          </DialogDescription>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(
                  'community/' + remove?.type + '/' + remove?.id + '/remove',
                  {},
                );
                setRemove(null);
                if (open && remove?.type !== 'threads') await replies();
                await refresh();
              })
            }
          >
            Remove contribution
          </Button>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
      </Dialog>
    </article>
  );
}
