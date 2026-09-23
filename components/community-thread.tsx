'use client';
import { HolderTierBadge } from './holder-tier-badge';
import { MemberProfile } from './member-profile';
import { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Trash2,
  UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/client';
import type { CommunityThread, ReplyPage } from '@/lib/community-types';

function discussionTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function shortDiscussionTime(timestamp: number, now: number) {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 60_000) return 'now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}d`;
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

function DiscussionTimestamp({ timestamp, now }: { timestamp: number; now: number }) {
  const [showExact, setShowExact] = useState(false);
  const exact = discussionTime(timestamp);
  return (
    <time dateTime={new Date(timestamp).toISOString()}>
      <button
        type="button"
        className="discussion-time"
        title={exact}
        aria-label={`${exact}. ${showExact ? 'Show short time' : 'Show exact time'}`}
        aria-pressed={showExact}
        suppressHydrationWarning
        onClick={() => setShowExact((current) => !current)}
      >
        {showExact ? exact : shortDiscussionTime(timestamp, now)}
      </button>
    </time>
  );
}

export function Thread({
  thread: t,
  memberId,
  refresh,
  showChannel = true,
  detail = false,
  onOpen,
  onThreadBlocked,
  onRequireVerification,
}: {
  thread: CommunityThread;
  memberId: string;
  refresh: () => Promise<void>;
  showChannel?: boolean;
  detail?: boolean;
  onOpen?: () => void;
  onThreadBlocked?: () => void;
  onRequireVerification?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now()),
    [page, setPage] = useState<ReplyPage>({ replies: [], nextCursor: null }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState<{ type: string; id: string } | null>(null),
    [remove, setRemove] = useState<{ type: string; id: string } | null>(null),
    [block, setBlock] = useState<{
      memberId: string;
      alias: string;
      source: 'thread' | 'reply';
    } | null>(null),
    [reason, setReason] = useState('');
  function memberAction(action: () => void) {
    if (!memberId) { onRequireVerification?.(); return; }
    action();
  }
  async function run(fn: () => Promise<void>, readOnly = false) {
    if (!memberId && !readOnly) { onRequireVerification?.(); return; }
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
  const replies = useCallback(async () => {
    setPage(await api<ReplyPage>('community/threads/' + t.id + '/replies'));
  }, [t.id]);
  const poll = t.poll;
  const pollClosed = !!poll?.closed;
  const hasVoted = !!poll?.options.some((option) => option.selected);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    update();
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    if (!detail) return;
    const poll = () => {
      if (document.visibilityState === 'visible')
        void replies().catch((e) => setError((e as Error).message));
    };
    poll();
    const timer = window.setInterval(poll, 10000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [detail, replies]);
  return (
    <article
      className={`thread-post ${detail ? 'is-detail' : 'is-feed'}`}
      id={'thread-' + t.id}
    >
      <div className="thread-topline">
        <div className="thread-meta">
          <MemberProfile author={t} />
          {t.value_tier && (
            <HolderTierBadge tier={t.value_tier} expiresAt={t.value_tier_expires_at} />
          )}
          {showChannel && <span>{t.room_name || t.topic}</span>}
          {showChannel && <span aria-hidden="true">·</span>}
          <DiscussionTimestamp timestamp={t.created_at} now={now} />
        </div>
        {(detail || t.member_id === memberId) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" size="icon-sm" variant="ghost" className="thread-overflow" aria-label="Discussion options" />}
            >
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="thread-options-menu">
              {t.member_id === memberId ? (
                <DropdownMenuItem variant="destructive" onClick={() => setRemove({ type: 'threads', id: t.id })}>
                  <Trash2 /> Delete post
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => memberAction(() => setReport({ type: 'thread', id: t.id }))}>
                    <Flag /> Report post
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => memberAction(() => setBlock({ memberId: t.member_id, alias: t.alias, source: 'thread' }))}>
                    <UserX /> Block user
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <h3>
        {detail || !onOpen ? (
          t.title
        ) : (
          <button type="button" className="thread-open" onClick={onOpen}>
            {t.title}
          </button>
        )}
      </h3>
      {detail || !onOpen ? (
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {t.body}
        </p>
      ) : (
        <button type="button" className="thread-body-preview" onClick={onOpen}>
          <span>{t.body}</span>
        </button>
      )}
      {poll && !detail && <span className="thread-poll-preview">Member poll</span>}
      {poll && detail && (
        <section className="thread-poll" aria-label={`Poll: ${t.title}`}>
          <div className="thread-poll-heading">
            <strong>Member poll</strong>
            <span>
              {pollClosed
                ? 'Closed'
                : poll.closes_at
                  ? `Closes ${new Date(poll.closes_at).toLocaleDateString()}`
                  : 'Open'}
            </span>
          </div>
          <fieldset className="thread-poll-options">
            <legend>Poll choices</legend>
            {poll.options.map((option) => {
              const percent =
                poll.results_visible && poll.total_votes
                  ? Math.round(((option.vote_count || 0) / poll.total_votes) * 100)
                  : null;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={option.selected ? 'selected' : ''}
                  disabled={busy || hasVoted || !!pollClosed}
                  aria-pressed={option.selected}
                  onClick={() =>
                    void run(async () => {
                      await api('community/threads/' + t.id + '/poll/vote', {
                        optionId: option.id,
                      });
                      await refresh();
                    })
                  }
                >
                  <span>{option.label}</span>
                  {percent !== null && <strong>{percent}%</strong>}
                </button>
              );
            })}
          </fieldset>
          <p className="thread-poll-note">
            {poll.results_visible
              ? `${poll.total_votes} verified member${poll.total_votes === 1 ? '' : 's'} voted.`
              : memberId ? 'Vote to reveal results.' : 'Verify your holdings to vote.'}
          </p>
        </section>
      )}
      <div className="thread-bottom">
        <Button
          type="button"
          className="thread-icon-action"
          variant="ghost"
          disabled={busy}
          aria-label={`${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'}`}
          title={`${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'}`}
          onClick={() => {
            if (!detail) onOpen?.();
            else if (!memberId) onRequireVerification?.();
            else document.getElementById(`reply-${t.id}`)?.focus();
          }}
        >
          <MessageCircle aria-hidden="true" />
          <span>{t.reply_count}</span>
        </Button>
        <Button
          type="button"
          className="thread-icon-action thread-save-action"
          variant="ghost"
          disabled={busy}
          aria-pressed={!!t.saved}
          aria-label={t.saved ? 'Remove bookmark' : 'Save discussion'}
          title={t.saved ? 'Remove bookmark' : 'Save discussion'}
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
        </Button>
      </div>
      {detail && (
        <>
          {page.replies.map((r) => (
            <div className="reply" key={r.id}>
              <MemberProfile author={r} avatarOnly />
              <div className="reply-content">
                <div className="reply-header">
                  <div className="reply-author">
                    <MemberProfile author={r} nameOnly />
                    {r.value_tier && <HolderTierBadge tier={r.value_tier} expiresAt={r.value_tier_expires_at} />}
                    <DiscussionTimestamp timestamp={r.created_at} now={now} />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button type="button" size="icon-xs" variant="ghost" className="reply-overflow" aria-label={`Options for ${r.alias}'s reply`} />}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="thread-options-menu">
                      {r.member_id === memberId ? (
                        <DropdownMenuItem variant="destructive" onClick={() => setRemove({ type: 'replies', id: r.id })}>
                          <Trash2 /> Delete reply
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem onClick={() => memberAction(() => setReport({ type: 'reply', id: r.id }))}>
                            <Flag /> Report reply
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => memberAction(() => setBlock({ memberId: r.member_id, alias: r.alias, source: 'reply' }))}>
                            <UserX /> Block user
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p>{r.body}</p>
              </div>
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
                }, true)
              }
            >
              More replies
            </Button>
          )}
          {!memberId ? <Button variant="outline" onClick={onRequireVerification}>Verify wallet to reply</Button> : <form
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
              id={`reply-${t.id}`}
              name="body"
              aria-label="Your reply"
              placeholder="Write a reply…"
              required
              maxLength={2000}
            />
            <Button disabled={busy} type="submit">
              Reply
            </Button>
          </form>}
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
        open={!!block}
        onOpenChange={(v) => {
          if (!v) setBlock(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Block {block?.alias}?</DialogTitle>
          <DialogDescription>
            Their discussions and replies will be hidden from you. You can unblock them later in Profile.
          </DialogDescription>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void run(async () => {
              if (!block) return;
              const blocked = block;
              await api('community/blocks', { memberId: blocked.memberId, block: true });
              setBlock(null);
              if (blocked.source === 'reply') await replies();
              await refresh();
              if (blocked.source === 'thread') onThreadBlocked?.();
            })}
          >
            Block user
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
                if (detail && remove?.type !== 'threads') await replies();
                await refresh();
                if (detail && remove?.type === 'threads') onThreadBlocked?.();
              })
            }
          >
            Delete
          </Button>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
      </Dialog>
    </article>
  );
}
