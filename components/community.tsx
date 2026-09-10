'use client';
import Link from '@/components/site-link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, MessageSquare, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Picker } from './workspace';
import { SearchPicker } from './search-picker';
import { TOKENS } from '@/lib/tokens';
import { api } from '@/lib/client';
import {
  TOPICS,
  type CommunityStatus,
  type CommunityThread,
  type ReplyPage,
  type ThreadPage,
} from '@/lib/community-types';
import { selectedWallet, walletLabel } from '@/lib/wallet-provider';
export function Community() {
  const [status, setStatus] = useState<CommunityStatus | null>(null),
    [threads, setThreads] = useState<CommunityThread[]>([]),
    [topic, setTopic] = useState('all'),
    [topicSearch, setTopicSearch] = useState(''),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [join, setJoin] = useState(false),
    [profile, setProfile] = useState(false),
    [provider, setProvider] = useState('backpack'),
    [symbol, setSymbol] = useState('MU'),
    [consent, setConsent] = useState(false),
    [stage, setStage] = useState(''),
    [alias, setAlias] = useState(''),
    [badge, setBadge] = useState(false);
  const member = status?.member;
  const refresh = useCallback(async () => {
    const s = await api<CommunityStatus>('community/status');
    setStatus(s);
    if (s.member) {
      const p = await api<ThreadPage>('community/threads?topic=' + topic);
      setThreads(p.threads);
      setCursor(p.nextCursor);
    } else {
      setThreads([]);
      setCursor(null);
    }
  }, [topic]);
  useEffect(() => {
    let active = true;
    api<CommunityStatus>('community/status')
      .then(async (s) => {
        const p = s.member
          ? await api<ThreadPage>('community/threads?topic=' + topic)
          : { threads: [], nextCursor: null };
        if (active) {
          setStatus(s);
          setThreads(p.threads);
          setCursor(p.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [topic]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setStage('');
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    await run(async () => {
      const p = selectedWallet(provider);
      setStage(`Connecting to ${walletLabel(provider)}…`);
      const c = await p.connect(),
        wallet = c.publicKey.toString();
      if (!wallet) throw new Error('Wallet address unavailable.');
      const challenge = await api<{ id: string; message: string }>(
        'community/challenge',
        { wallet, symbol },
      );
      setStage(`Check ${walletLabel(provider)} for the membership message…`);
      const signed = await p.signMessage(
          new TextEncoder().encode(challenge.message),
        ),
        signature = Array.from(signed);
      setStage('Checking your holding on Solana…');
      await api('community/verify', {
        challengeId: challenge.id,
        signature,
        consent,
      });
      await refresh();
      setJoin(false);
      setStage('');
    });
  }
  return (
    <div className="club">
      <section className="club-intro">
        <div>
          <p className="club-kicker">THE HOLDER COMMUNITY</p>
          <h1>
            A position. A perspective.
            <br />
            <span>A better conversation.</span>
          </h1>
          <p>
            One shared space for holders of Backpack-issued stock tokens.
            <br />
            Bring your thesis. Be open to changing it.
          </p>
        </div>
        <Button
          onClick={() =>
            member
              ? document
                  .getElementById('compose')
                  ?.scrollIntoView({ behavior: 'smooth' })
              : setJoin(true)
          }
        >
          {member ? 'Start a discussion' : 'Verify & join'}
          <ArrowUpRight size={18} />
        </Button>
      </section>
      <div className="club-grid">
        <aside className="club-aside">
          <span className="club-kicker">DISCUSSIONS</span>
          <input
            className="topic-search"
            aria-label="Search discussion topics"
            placeholder="Find a ticker…"
            value={topicSearch}
            onChange={(e) => setTopicSearch(e.target.value)}
          />
          <div className="topic-list">
            {TOPICS.filter((t) =>
              t.label.toLowerCase().includes(topicSearch.toLowerCase()),
            ).map((t) => (
              <Button
                key={t.id}
                variant={topic === t.id ? 'secondary' : 'ghost'}
                onClick={() => setTopic(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <div className="club-aside-note">
            <ShieldCheck size={20} />
            <p>
              One verified holding.
              <br />
              Every conversation.
            </p>
            <Link href="/methodology">How membership works →</Link>
          </div>
        </aside>
        <section>
          <div className="board-heading">
            <h2>The common room</h2>
            <span className="pill">FOUNDING COMMUNITY</span>
          </div>
          <article className="welcome-post">
            <p className="club-kicker">PINNED · START HERE</p>
            <h2>Good discussions start with a little disagreement.</h2>
            <p>
              What changed? What matters next? What would change your mind?
              Compare ideas with other holders, across every ticker.
            </p>
            <Link href="/rules">Read the community guidelines →</Link>
          </article>
          {error && (
            <p role="alert" className="club-error">
              {error}
            </p>
          )}
          {!status ? (
            error ? (
              <Button disabled={busy} onClick={() => run(refresh)}>
                {busy ? 'Retrying…' : 'Retry loading community'}
              </Button>
            ) : (
              <output>Opening the community…</output>
            )
          ) : !member ? (
            <div className="join-gate" id="join">
              <MessageSquare size={30} />
              <h2>Meet the people behind the positions.</h2>
              <p>
                Verify any of our {TOKENS.length} supported stock and ETF tokens
                to read discussions, start a thread, and reply in every topic.
              </p>
              <Button onClick={() => setJoin(true)}>
                Connect wallet & join
              </Button>
              <p className="muted">
                A message signature. No transaction. Membership renews every 24
                hours.
              </p>
            </div>
          ) : (
            <>
              <div className="club-member">
                <span>
                  Welcome, <strong>{member.alias}</strong>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAlias(member.alias);
                    setBadge(!!member.show_badge);
                    setProfile(true);
                  }}
                >
                  Edit profile
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api('community/logout', {});
                      await refresh();
                    })
                  }
                >
                  Sign out
                </Button>
              </div>
              <div className="community-topics">
                <SearchPicker
                  label="Discussion topic"
                  value={topic}
                  onChange={setTopic}
                  items={TOPICS.map((t) => ({ value: t.id, label: t.label }))}
                />
              </div>
              <form
                id="compose"
                className="compose form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    data = new FormData(form);
                  void run(async () => {
                    await api('community/threads', {
                      title: data.get('title'),
                      body: data.get('body'),
                      topic: topic === 'all' ? 'general' : topic,
                    });
                    form.reset();
                    await refresh();
                  });
                }}
              >
                <p className="club-kicker">
                  START A DISCUSSION · {topic === 'all' ? 'GENERAL' : topic}
                </p>
                <input
                  aria-label="Discussion title"
                  name="title"
                  placeholder="What’s on your mind?"
                  required
                  minLength={5}
                  maxLength={140}
                />
                <textarea
                  aria-label="Your perspective"
                  name="body"
                  placeholder="Share your thesis, a useful source, or a question worth debating."
                  required
                  minLength={10}
                  maxLength={4000}
                />
                <Button type="submit" disabled={busy}>
                  Post discussion
                </Button>
              </form>
              <div className="board-heading">
                <span>{TOPICS.find((t) => t.id === topic)?.label}</span>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(refresh)}
                >
                  Refresh
                </Button>
              </div>
              {threads.length === 0 ? (
                <div className="empty-community">
                  <h3>The conversation starts here.</h3>
                  <p>
                    No discussions in this topic yet. Share the first question.
                  </p>
                </div>
              ) : (
                threads.map((t) => (
                  <Thread
                    key={t.id}
                    thread={t}
                    memberId={member.id}
                    refresh={refresh}
                  />
                ))
              )}
              {cursor && (
                <Button
                  className="club-more"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const p = await api<ThreadPage>(
                        'community/threads?topic=' +
                          topic +
                          '&cursor=' +
                          encodeURIComponent(cursor),
                      );
                      setThreads((a) => [...a, ...p.threads]);
                      setCursor(p.nextCursor);
                    })
                  }
                >
                  More discussions
                </Button>
              )}
            </>
          )}
          {status?.admin && (
            <p>
              <Link href="/admin/community">Community moderation →</Link>
            </p>
          )}
        </section>
        <aside className="club-right">
          <p className="club-kicker">OUR STARTING POINT</p>
          <h3>Curiosity over conviction.</h3>
          <p>
            Share sources. Make room for counterarguments. Help another holder
            understand something new.
          </p>
          <hr />
          {status && (
            <p>
              {status.memberCount} registered members
              <br />
              {status.threadCount} discussions
            </p>
          )}
          <p className="club-kicker">MEMBERSHIP, SIMPLIFIED</p>
          <p>
            Hold one supported token.
            <br />
            Sign a message.
            <br />
            Join every topic.
          </p>
          <p className="muted">
            No balance on your profile. No airdrop promises. Holding a token
            does not establish expertise.
          </p>
        </aside>
      </div>
      <Dialog open={join} onOpenChange={setJoin}>
        <DialogContent className="community-dialog">
          <div className="join-heading">
            <div className="join-symbol">
              <ShieldCheck size={22} aria-hidden="true" />
            </div>
            <DialogTitle>Join the common room</DialogTitle>
            <DialogDescription>
              Verify one supported holding to access every discussion.
            </DialogDescription>
          </div>
          <fieldset disabled={busy} className="join-field border-0 p-0 m-0">
            <span id="wallet-label">Your wallet</span>
            <Picker
              label="Your wallet"
              value={provider}
              onChange={(v) => {
                setProvider(v);
                setError('');
                setStage('');
              }}
              items={['backpack', 'phantom', 'solflare'].map((x) => ({
                value: x,
                label: x[0].toUpperCase() + x.slice(1),
              }))}
            />
          </fieldset>
          <fieldset disabled={busy} className="join-field border-0 p-0 m-0">
            <span>Token you hold · {TOKENS.length} supported</span>
            <SearchPicker
              label="Token you hold"
              value={symbol}
              onChange={setSymbol}
              items={TOKENS.map((t) => ({
                value: t.symbol,
                label: t.symbol + ' · ' + t.shortName,
              }))}
            />
          </fieldset>
          <label className="choice">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
            />
            <span>
              I accept the <Link href="/rules">guidelines</Link> and{' '}
              <Link href="/trust">privacy notice</Link>.
            </span>
          </label>
          <Button disabled={busy || !consent} onClick={verify}>
            {busy
              ? `Waiting for ${walletLabel(provider)}…`
              : `Connect ${walletLabel(provider)} & verify`}
          </Button>
          <p className="join-note">
            Message signature only. No transaction or transfer.
            <br />
            Verification renews every 24 hours.
          </p>
          <output>{stage}</output>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={profile} onOpenChange={setProfile}>
        <DialogContent>
          <DialogTitle>Your community profile</DialogTitle>
          <DialogDescription>
            Your wallet address and exact balance are not displayed.
          </DialogDescription>
          <label>
            Display name
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              maxLength={24}
            />
          </label>
          <label className="choice">
            <Checkbox
              checked={badge}
              onCheckedChange={(v) => setBadge(v === true)}
            />
            <span>
              Show my verified {member?.qualifying_symbol} token badge to
              members
            </span>
          </label>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api('community/profile', { alias, showBadge: badge });
                await refresh();
                setProfile(false);
              })
            }
          >
            Save profile
          </Button>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Thread({
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
    <article className="thread-post">
      <div className="thread-meta">
        <span className="avatar-letter">{t.alias.slice(0, 1)}</span>
        <strong>{t.alias}</strong>
        {t.badge && <span className="pill">{t.badge} holder</span>}
        <span>
          {t.topic} · {new Date(t.created_at).toLocaleDateString()}
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
              <strong>{r.alias}</strong>{' '}
              {r.badge && <span className="pill">{r.badge} holder</span>}
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
              placeholder="Add a thoughtful reply…"
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
          <DialogTitle>Remove your contribution?</DialogTitle>
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
