'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from './site-link';
import {
  Home,
  ChartNoAxesCombined,
  Newspaper,
  CalendarDays,
  Compass,
  Bookmark,
  UserRound,
  Bell,
  ArrowUpRight,
  Plus,
  Check,
  ShieldCheck,
  LockKeyhole,
  LogOut,
  Search,
  RefreshCw,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { SearchPicker } from './search-picker';
import { Thread } from './community-thread';
import { RoomCreator } from './room-creator';
import { MarketOverviewPanel } from './market-overview';
import { MemberBrief } from './member-brief';
import { api } from '@/lib/client';
import { communityPostErrors, POST_LIMITS } from '@/lib/community-post';
import {
  type CommunityStatus,
  type MemberHome,
  type CommunityThread,
  type ThreadPage,
  type CommunitySource,
} from '@/lib/community-types';
type View =
  | 'markets'
  | 'brief'
  | 'calendar'
  | 'home'
  | 'topics'
  | 'saved'
  | 'profile';
const destinations = [
  { id: 'brief', label: 'Your brief', icon: Newspaper },
  { id: 'markets', label: 'Markets', icon: ChartNoAxesCombined },
  { id: 'home', label: 'Discussions', icon: Home },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'topics', label: 'Rooms', icon: Compass },
  { id: 'saved', label: 'Saved', icon: Bookmark },
  { id: 'profile', label: 'Profile', icon: UserRound },
] as const;
export function MemberDashboard({
  status,
  refreshStatus,
  renew,
}: {
  status: CommunityStatus;
  refreshStatus: () => Promise<void>;
  renew: () => void;
}) {
  const member = status.member!;
  const [view, setView] = useState<View>(() => {
    const value =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('view')
        : null;
    return destinations.some((d) => d.id === value) ? (value as View) : 'brief';
  });
  const [feed, setFeed] = useState('personal');
  const [topic, setTopic] = useState('all');
  const [coverageSymbol, setCoverageSymbol] = useState('all');
  const [threadId, setThreadId] = useState('');
  const [data, setData] = useState<MemberHome | null>(null);
  const [threads, setThreads] = useState<CommunityThread[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [holdingsChecking, setHoldingsChecking] = useState(false);
  const [holdingsError, setHoldingsError] = useState('');
  const holdingsRequest = useRef<Promise<void> | null>(null);
  const lastHoldingsAttempt = useRef(0);
  const syncHoldings = useCallback((force = false): Promise<void> => {
    if (holdingsRequest.current) return holdingsRequest.current;
    if (!force && Date.now() - lastHoldingsAttempt.current < 60000)
      return Promise.resolve();
    const first = lastHoldingsAttempt.current === 0;
    lastHoldingsAttempt.current = Date.now();
    setHoldingsChecking(true);
    const request = api<{ checked: boolean }>('community/holdings-refresh', {
      force: force || first,
    })
      .then((result) => {
        if (result.checked) setHoldingsError('');
      })
      .catch((e) => {
        setHoldingsError(
          e.message + ' The last successful holdings check is shown below.',
        );
      })
      .finally(() => {
        holdingsRequest.current = null;
        setHoldingsChecking(false);
      });
    holdingsRequest.current = request;
    return request;
  }, []);
  const [loadedQuery, setLoadedQuery] = useState('');
  const requestSequence = useRef(0);
  const [signOut, setSignOut] = useState(false);
  const [search, setSearch] = useState('');
  const [createRoom, setCreateRoom] = useState(false);
  const [compose, setCompose] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTopic, setDraftTopic] = useState('general');
  const [draftBody, setDraftBody] = useState('');
  const [draftAttempted, setDraftAttempted] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [draftPosting, setDraftPosting] = useState(false);
  const posting = useRef(false);
  const draftId = useId();
  const draftErrors = draftAttempted
    ? communityPostErrors({
        title: draftTitle,
        body: draftBody,
        topic: draftTopic,
      })
    : {};
  const [notifications, setNotifications] = useState(false);
  const [alias, setAlias] = useState(member.alias);
  const [badge, setBadge] = useState(!!member.show_badge);
  const [badgeSymbol, setBadgeSymbol] = useState(member.qualifying_symbol);
  const [notifyReplies, setNotifyReplies] = useState(!!member.notify_replies);
  const query = `community/threads?topic=${encodeURIComponent(topic)}&feed=${view === 'saved' ? 'saved' : feed}&thread=${encodeURIComponent(threadId)}`;
  const loading = loadedQuery !== query;
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    await syncHoldings(true);
    const [home, page] = await Promise.all([
      api<MemberHome>('community/home'),
      api<ThreadPage>(query),
    ]);
    if (sequence !== requestSequence.current) return;
    setLoadedQuery(query);
    setData(home);
    setThreads(page.threads);
    setCursor(page.nextCursor);
    setError('');
  }, [query, syncHoldings]);
  useEffect(() => {
    let active = true;
    const sequence = ++requestSequence.current;
    syncHoldings()
      .then(() =>
        Promise.all([
          api<MemberHome>('community/home'),
          api<ThreadPage>(query),
        ]),
      )
      .then(([home, page]) => {
        if (active && sequence === requestSequence.current) {
          setError('');
          setData(home);
          setThreads(page.threads);
          setCursor(page.nextCursor);
        }
      })
      .catch((e) => {
        if (active && sequence === requestSequence.current) setError(e.message);
      })
      .finally(() => {
        if (active && sequence === requestSequence.current)
          setLoadedQuery(query);
      });
    return () => {
      active = false;
    };
  }, [query, syncHoldings]);
  const refreshWalletHoldings = useCallback(
    async (force = false) => {
      await syncHoldings(force);
      setData(await api<MemberHome>('community/home'));
    },
    [syncHoldings],
  );
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'visible')
        void refreshWalletHoldings().catch((e) => setHoldingsError(e.message));
    };
    const timer = setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refreshWalletHoldings]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: View) {
    setView(next);
    setThreadId('');
    setTopic('all');
    setNotice('');
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    url.hash = '';
    window.history.replaceState(null, '', url.pathname + url.search);
  }
  const rooms = data?.rooms || [];
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name || id;
  const holdings = data?.holdings || [];
  const held = new Set(holdings.map((h) => h.symbol));
  const relevant = new Set([...held, ...(data?.follows || [])]);
  const unread = data?.notifications.filter((n) => !n.read).length || 0;
  function startDiscussion(
    title = '',
    selectedTopic = topic === 'all' ? 'general' : topic,
  ) {
    setDraftTitle(title);
    setDraftTopic(
      selectedTopic === 'general' || rooms.some((r) => r.id === selectedTopic)
        ? selectedTopic
        : 'general',
    );
    setDraftBody('');
    setDraftAttempted(false);
    setDraftError('');
    setCompose(true);
    setError('');
  }
  function openTopic(symbol: string) {
    setView('home');
    setFeed('all');
    setTopic(symbol);
    setThreadId('');
  }
  async function saveSource(source: CommunitySource) {
    await api('community/save', {
      type: 'source',
      id: source.id,
      save: !source.saved,
    });
    await refresh();
  }
  const sourceItems = (data?.sources || []).filter((s) =>
    view === 'saved'
      ? s.saved
      : (topic === 'all' || s.symbol === topic) &&
        (feed === 'all' || relevant.has(s.symbol)),
  );
  return (
    <div
      className={`member-shell ${view === 'markets' ? 'markets-view' : ''} ${view === 'brief' || view === 'calendar' ? 'reading-view' : ''}`}
    >
      <aside className="member-sidebar">
        <Link className="member-brand" href="/">
          h<span>p</span>
          <strong>
            HolderPulse<small>FOR BACKPACK HOLDERS</small>
          </strong>
        </Link>
        <div className="member-identity">
          <span className="member-avatar">
            {member.alias.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{member.alias}</strong>
            <span>
              <span className="small-dot" /> Verified member
            </span>
          </div>
        </div>
        <nav className="member-nav" aria-label="Member navigation">
          {destinations.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {view === id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Link href="/rules">
            Our shared guidelines <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          {status.admin && (
            <Link href="/admin/community">
              Admin <ArrowUpRight size={15} />
            </Link>
          )}
          <Link href="/trust">
            Trust & privacy <ArrowUpRight size={15} />
          </Link>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api('community/logout', {});
                await refreshStatus();
              })
            }
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="member-workspace">
        <div className="member-topbar">
          <span>
            The common room{' '}
            <span className="breadcrumb">
              / {destinations.find((d) => d.id === view)?.label}
            </span>
          </span>
          <div>
            <span className="private-label">
              <LockKeyhole size={13} /> Members only
            </span>
            <Button
              variant="ghost"
              aria-label={`Reply notifications${unread ? `, ${unread} unread` : ''}`}
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
              {unread > 0 && <span className="notification-dot">{unread}</span>}
            </Button>
          </div>
        </div>
        <div className="member-columns">
          <section className="member-main">
            <div className="member-page-heading">
              <div>
                <p className="eyebrow">
                  {view === 'brief'
                    ? 'THE HOLDER EDITION'
                    : view === 'calendar'
                      ? 'ON THE HORIZON'
                      : view === 'home'
                        ? 'A PLACE FOR YOUR PERSPECTIVE'
                        : view === 'topics'
                          ? 'FOLLOW YOUR CURIOSITY'
                          : view === 'saved'
                            ? 'KEEP THE GOOD STUFF CLOSE'
                            : 'MAKE YOURSELF AT HOME'}
                </p>
                <h1>
                  {view === 'markets'
                    ? 'Backpack stocks'
                    : view === 'brief'
                      ? 'Your news'
                      : view === 'calendar'
                        ? 'Calendar'
                        : view === 'home'
                          ? 'Discussions'
                          : view === 'topics'
                            ? 'Rooms'
                            : view === 'saved'
                              ? 'Saved'
                              : 'Your profile'}
                </h1>
                <p>
                  {view === 'markets'
                    ? 'The tokens you hold. The market around them.'
                    : view === 'brief'
                      ? 'The stories that connect to what you hold.'
                      : view === 'calendar'
                        ? 'Earnings, company events, and dates worth keeping in view.'
                        : view === 'home'
                          ? 'Start with what you hold. Stay for a different point of view.'
                          : view === 'topics'
                            ? 'Rooms are started by members. Anyone verified can join the conversation.'
                            : view === 'saved'
                              ? 'Your private collection of discussions and sources.'
                              : 'Choose how you appear to other members.'}
                </p>
              </div>
              {view === 'home' && (
                <Button onClick={() => startDiscussion()}>
                  <Plus size={17} /> New discussion
                </Button>
              )}
            </div>
            {error && (
              <div className="member-error" role="alert">
                {error}{' '}
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(refresh)}
                >
                  Retry
                </Button>
              </div>
            )}
            {data && !data.holdingsRefreshAvailable && (
              <div className="member-notice" role="status">
                Your holdings are from an earlier verification.{' '}
                <Button variant="ghost" onClick={renew}>
                  Verify wallet to update holdings
                </Button>
              </div>
            )}
            {holdingsError && view === 'markets' && (
              <p className="member-error" role="status">
                {holdingsError}
              </p>
            )}
            {notice && <output className="member-notice">{notice}</output>}
            {view === 'markets' ? (
              <>
                {data ? (
                  <MarketOverviewPanel
                    holdings={holdings.map((h) => h.symbol)}
                  />
                ) : (
                  <p>Loading your holdings…</p>
                )}
              </>
            ) : view === 'brief' || view === 'calendar' ? (
              <MemberBrief
                key={view}
                kind={view === 'brief' ? 'news' : 'event'}
                holdings={holdings.map((h) => h.symbol)}
                symbol={held.has(coverageSymbol) ? coverageSymbol : 'all'}
                onSymbolChange={setCoverageSymbol}
                onCalendar={() => navigate('calendar')}
                onDiscuss={(item) => {
                  startDiscussion(item.title.slice(0, 140), item.symbols[0]);
                  setDraftBody(`Source: ${item.url}\n\nMy perspective: `);
                }}
              />
            ) : view === 'topics' ? (
              <>
                <Button
                  className="room-create-button"
                  onClick={() => setCreateRoom(true)}
                >
                  <Plus size={17} /> Create a room
                </Button>
                <label className="member-search">
                  <Search size={18} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a room"
                    aria-label="Find a room"
                  />
                </label>
                <div className="topic-directory room-directory">
                  {rooms
                    .filter((r) =>
                      (r.name + ' ' + r.description)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((r) => (
                      <article key={r.id}>
                        <span className="ticker-tile">
                          <MessageSquare size={22} />
                        </span>
                        <div>
                          <button
                            className="topic-title"
                            onClick={() => openTopic(r.id)}
                          >
                            {r.name} <ArrowUpRight size={14} />
                          </button>
                          <p>{r.description}</p>
                          <span>
                            {r.thread_count}{' '}
                            {r.thread_count === 1
                              ? 'discussion'
                              : 'discussions'}
                          </span>
                        </div>
                        <Button
                          variant={
                            data?.follows.includes(r.id)
                              ? 'secondary'
                              : 'outline'
                          }
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api('community/follow', {
                                symbol: r.id,
                                follow: !data?.follows.includes(r.id),
                              });
                              await refresh();
                            })
                          }
                        >
                          {data?.follows.includes(r.id)
                            ? 'Following'
                            : 'Follow'}
                        </Button>
                      </article>
                    ))}
                </div>
                {!data && <p className="member-empty">Loading rooms…</p>}
                {data &&
                  !rooms.some((r) =>
                    (r.name + ' ' + r.description)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ) && (
                    <div className="member-empty">
                      <h2>
                        {search
                          ? 'No matching rooms.'
                          : 'Be the first to start a room.'}
                      </h2>
                      <p>Choose a name and give people a reason to join.</p>
                      <Button
                        variant="outline"
                        onClick={() => setCreateRoom(true)}
                      >
                        Create a room
                      </Button>
                    </div>
                  )}
              </>
            ) : view === 'profile' ? (
              <form
                className="member-profile"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api('community/profile', {
                      alias,
                      showBadge: badge,
                      badgeSymbol,
                      notifyReplies,
                    });
                    await refreshStatus();
                    setNotice('Your profile has been saved.');
                  });
                }}
              >
                <div className="profile-preview">
                  <span className="member-avatar">
                    {alias.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{alias || 'Your display name'}</strong>
                    <span>
                      {badge ? `${badgeSymbol} holder` : 'Verified member'}
                    </span>
                  </div>
                  <span className="eyebrow">PROFILE PREVIEW</span>
                </div>
                <label className="profile-field">
                  Display name
                  <input
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    minLength={3}
                    maxLength={24}
                    required
                  />
                  <small>
                    Use a personal alias. Your wallet address is never your
                    display name.
                  </small>
                </label>
                <div className="profile-setting">
                  <div>
                    <h3>Show a holder badge</h3>
                    <p>
                      Optional. Let members see one stock token you hold. Your
                      other holdings and balances stay off your profile.
                    </p>
                  </div>
                  <Checkbox
                    aria-label="Show a holder badge"
                    checked={badge}
                    onCheckedChange={(v) => setBadge(v === true)}
                  />
                </div>
                {badge && (
                  <SearchPicker
                    label="Public holder badge"
                    value={badgeSymbol}
                    onChange={setBadgeSymbol}
                    items={(holdings.length
                      ? holdings.map((h) => h.symbol)
                      : [member.qualifying_symbol]
                    ).map((symbol) => ({
                      value: symbol,
                      label: symbol + ' holder',
                    }))}
                  />
                )}
                <div className="profile-setting">
                  <div>
                    <h3>Replies to your discussions</h3>
                    <p>
                      Show new replies in your in-app notifications. No emails
                      or wallet messages.
                    </p>
                  </div>
                  <Checkbox
                    aria-label="Notify me about replies"
                    checked={notifyReplies}
                    onCheckedChange={(v) => setNotifyReplies(v === true)}
                  />
                </div>
                <div className="profile-actions">
                  <Button type="submit" disabled={busy}>
                    Save profile <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setSignOut(true)}
                  >
                    Sign out <LogOut size={15} />
                  </Button>
                </div>
              </form>
            ) : (
              <>
                {view === 'home' && !threadId && (
                  <article className="conversation-prompt">
                    <span className="eyebrow">A QUESTION TO OPEN WITH</span>
                    <h2>
                      What would change your mind
                      <br className="desktop-break" /> about a stock you hold?
                    </h2>
                    <div>
                      <p>
                        A useful conversation starts with a falsifiable idea.
                      </p>
                      <button
                        onClick={() =>
                          startDiscussion(
                            'What would change your mind about a stock you hold?',
                          )
                        }
                      >
                        Bring a perspective <ArrowRight size={17} />
                      </button>
                    </div>
                  </article>
                )}
                <div className="member-feed-toolbar">
                  <div className="feed-tabs" aria-label="Feed filter">
                    {view === 'home' ? (
                      <>
                        <button
                          aria-pressed={feed === 'personal' && !threadId}
                          onClick={() => {
                            setFeed('personal');
                            setTopic('all');
                            setThreadId('');
                          }}
                        >
                          For you
                        </button>
                        <button
                          aria-pressed={feed === 'all' && !threadId}
                          onClick={() => {
                            setFeed('all');
                            setTopic('all');
                            setThreadId('');
                          }}
                        >
                          All discussions
                        </button>
                      </>
                    ) : (
                      <strong>Saved discussions</strong>
                    )}
                    {topic !== 'all' && (
                      <span className="filter-chip">
                        {roomName(topic)}
                        <button
                          aria-label="Clear topic filter"
                          onClick={() => setTopic('all')}
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {threadId && (
                      <button onClick={() => setThreadId('')}>
                        ← Back to feed
                      </button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    disabled={busy || loading}
                    aria-label="Refresh feed"
                    onClick={() => run(refresh)}
                  >
                    <RefreshCw size={16} />
                  </Button>
                </div>
                {loading ? (
                  <output className="member-loading">Opening your feed…</output>
                ) : threads.length ? (
                  threads.map((t) => (
                    <Thread
                      key={t.id}
                      thread={t}
                      memberId={member.id}
                      refresh={refresh}
                    />
                  ))
                ) : (
                  <div className="member-empty">
                    <MessageSquare size={26} />
                    <h3>
                      {threadId
                        ? 'This discussion is unavailable.'
                        : view === 'saved'
                          ? 'A place for your next good find.'
                          : 'There’s room for your first question.'}
                    </h3>
                    <p>
                      {view === 'saved'
                        ? 'Tap Save on a discussion or source to find it here.'
                        : threadId
                          ? 'It may have been removed by its author or a moderator.'
                          : feed === 'personal'
                            ? 'No discussions match your holdings and followed topics yet. Explore the shared feed, or start one.'
                            : 'This community is just beginning. A thoughtful question is a good place to start.'}
                    </p>
                    {view === 'home' && !threadId && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          feed === 'personal'
                            ? setFeed('all')
                            : startDiscussion()
                        }
                      >
                        {feed === 'personal'
                          ? 'Explore all discussions'
                          : 'Start a discussion'}{' '}
                        <ArrowUpRight size={15} />
                      </Button>
                    )}
                  </div>
                )}
                {cursor && (
                  <Button
                    className="load-more"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const page = await api<ThreadPage>(
                          query + '&cursor=' + encodeURIComponent(cursor),
                        );
                        setThreads((t) => [...t, ...page.threads]);
                        setCursor(page.nextCursor);
                      })
                    }
                  >
                    More discussions
                  </Button>
                )}
                {!loading && (
                  <section className="member-sources">
                    <div className="source-heading">
                      <div>
                        <span className="eyebrow">
                          {view === 'saved'
                            ? 'SAVED SOURCES'
                            : 'FROM THE SOURCE'}
                        </span>
                        <h2>
                          {view === 'saved'
                            ? 'Your reading shelf.'
                            : 'A little more context.'}
                        </h2>
                      </div>
                      <span>Curated source links</span>
                    </div>
                    {sourceItems.length ? (
                      sourceItems.map((s) => (
                        <article className="source-item" key={s.id}>
                          <span className="source-symbol">{s.symbol}</span>
                          <div>
                            <span>{s.publisher}</span>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {s.title} <ArrowUpRight size={16} />
                            </a>
                          </div>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            aria-label={`${s.saved ? 'Unsave' : 'Save'} ${s.publisher} source`}
                            aria-pressed={!!s.saved}
                            onClick={() => run(() => saveSource(s))}
                          >
                            <Bookmark
                              size={18}
                              fill={s.saved ? 'currentColor' : 'none'}
                            />
                          </Button>
                        </article>
                      ))
                    ) : (
                      <p className="source-empty">
                        {view === 'saved'
                          ? 'Sources you save will appear here.'
                          : 'No curated source links for this selection yet. Explore all discussions to browse the library.'}
                      </p>
                    )}
                  </section>
                )}
              </>
            )}
          </section>
          <aside className="member-context">
            <section className="holdings-card">
              <div className="context-heading">
                <ShieldCheck size={18} />
                <span>YOUR WAY IN</span>
                <LockKeyhole size={14} />
              </div>
              <h2>Your holdings</h2>
              <p className="context-caption">
                {holdingsChecking
                  ? 'Checking Solana…'
                  : 'Stock tokens in your verified wallet'}
              </p>
              {holdingsError && (
                <p role="status" className="context-caption">
                  {holdingsError}
                </p>
              )}
              {!holdingsChecking && holdings.length > 0 && (
                <p className="context-caption">
                  Last checked{' '}
                  {new Date(
                    Math.max(...holdings.map((h) => h.verified_at)),
                  ).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              )}
              {data && !data.holdingsRefreshAvailable && (
                <p className="context-caption">
                  Verify your wallet once more to enable automatic holdings
                  updates for this session.
                </p>
              )}
              <div className="holding-tags">
                {holdings.map((h) => (
                  <button key={h.symbol} onClick={() => openTopic(h.symbol)}>
                    {h.symbol}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
              {!loading && !holdings.length && (
                <p>Refresh verification to detect all your holdings.</p>
              )}
              <p className="private-footnote">
                <LockKeyhole size={12} /> Only you see this list.
              </p>
              <div className="verification-note">
                <span className="small-dot" />
                <div>
                  Verified until
                  <br />
                  <strong>
                    {new Date(member.verified_until).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </strong>
                </div>
              </div>
              <button
                className="text-action"
                disabled={holdingsChecking}
                onClick={() =>
                  data?.holdingsRefreshAvailable
                    ? void refreshWalletHoldings(true).catch((e) =>
                        setHoldingsError(e.message),
                      )
                    : renew()
                }
              >
                {holdingsChecking ? 'Checking holdings…' : 'Refresh holdings'}{' '}
                <RefreshCw size={13} />
              </button>
              <button className="text-action" onClick={renew}>
                Switch or verify wallet
              </button>
            </section>
            <section className="context-following">
              <div className="context-heading">
                <Compass size={17} />
                <span>ON YOUR RADAR</span>
              </div>
              {data?.follows.some((id) => rooms.some((r) => r.id === id)) ? (
                <div className="following-tags">
                  {data.follows
                    .filter((id) => rooms.some((r) => r.id === id))
                    .map((symbol) => (
                      <button key={symbol} onClick={() => openTopic(symbol)}>
                        {roomName(symbol)} <ArrowUpRight size={12} />
                      </button>
                    ))}
                </div>
              ) : (
                <p>Curiosity doesn’t have to follow your portfolio.</p>
              )}
              <button
                className="text-action"
                onClick={() => navigate('topics')}
              >
                Explore rooms <ArrowRight size={14} />
              </button>
            </section>
            <div className="context-principle">
              <small>
                Independent of Backpack and underlying issuers. Discussions are
                not investment advice.
              </small>
            </div>
          </aside>
        </div>
        <div className="member-footer">
          <span>Good sources. Better questions.</span>
          <Link href="/methodology">How verification works ↗</Link>
        </div>
      </div>
      <Dialog open={signOut} onOpenChange={setSignOut}>
        <DialogContent>
          <DialogTitle>Leave the common room?</DialogTitle>
          <DialogDescription>
            Your saved items and profile will be here when you verify again.
          </DialogDescription>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api('community/logout', {});
                await refreshStatus();
              })
            }
          >
            Sign out
          </Button>
        </DialogContent>
      </Dialog>
      {createRoom && (
        <RoomCreator
          onClose={() => setCreateRoom(false)}
          onCreated={async (id) => {
            setCreateRoom(false);
            openTopic(id);
            setNotice('Room created. Start the first discussion.');
          }}
        />
      )}
      <Dialog
        open={compose}
        onOpenChange={(v) => {
          if (!posting.current) setCompose(v);
        }}
      >
        <DialogContent className="compose-dialog">
          <DialogTitle>Bring a perspective.</DialogTitle>
          <DialogDescription>
            Share a question, a source, or a thesis worth discussing.
          </DialogDescription>
          <form
            className="discussion-form"
            noValidate
            aria-busy={draftPosting}
            onSubmit={async (e) => {
              e.preventDefault();
              if (posting.current) return;
              setDraftAttempted(true);
              setDraftError('');
              const payload = {
                title: draftTitle,
                body: draftBody,
                topic: draftTopic,
              };
              const errors = communityPostErrors(payload);
              const invalidField = errors.topic
                ? 'topic'
                : errors.title
                  ? 'title'
                  : errors.body
                    ? 'body'
                    : null;
              if (invalidField) {
                document.getElementById(`${draftId}-${invalidField}`)?.focus();
                return;
              }
              posting.current = true;
              setDraftPosting(true);
              try {
                const result = await api<{ id: string }>(
                  'community/threads',
                  payload,
                );
                setView('home');
                setFeed('all');
                setTopic(draftTopic);
                setThreadId(result.id);
                setNotice('Discussion posted.');
                setCompose(false);
              } catch (e) {
                setDraftError(
                  e instanceof Error
                    ? e.message
                    : 'Could not post. Your draft is still here; please try again.',
                );
              } finally {
                posting.current = false;
                setDraftPosting(false);
              }
            }}
          >
            <div className="discussion-field">
              <label htmlFor={`${draftId}-topic`}>Room</label>
              <SearchPicker
                inputId={`${draftId}-topic`}
                label="Discussion room"
                disabled={draftPosting}
                value={draftTopic}
                onChange={setDraftTopic}
                items={[
                  { value: 'general', label: 'General' },
                  ...rooms
                    .filter((r) => r.id !== 'general')
                    .map((r) => ({ value: r.id, label: r.name })),
                ]}
              />
              {draftErrors.topic && (
                <p className="field-error" role="alert">
                  {draftErrors.topic}
                </p>
              )}
            </div>
            <div className="discussion-field">
              <label htmlFor={`${draftId}-title`}>Title</label>
              <input
                id={`${draftId}-title`}
                aria-label="Discussion title"
                aria-invalid={!!draftErrors.title}
                aria-describedby={`${draftId}-title-help`}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                disabled={draftPosting}
                name="title"
                placeholder="What would you like to discuss?"
                minLength={POST_LIMITS.title.min}
                maxLength={POST_LIMITS.title.max}
                required
              />
              <p
                id={`${draftId}-title-help`}
                className={draftErrors.title ? 'field-error' : 'field-help'}
                role={draftErrors.title ? 'alert' : undefined}
              >
                {draftErrors.title || '5–140 characters'}
              </p>
            </div>
            <div className="discussion-field">
              <label htmlFor={`${draftId}-body`}>Your perspective</label>
              <textarea
                id={`${draftId}-body`}
                aria-label="Your perspective"
                aria-invalid={!!draftErrors.body}
                aria-describedby={`${draftId}-body-help`}
                name="body"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                disabled={draftPosting}
                placeholder="What’s the evidence? What would change your mind?"
                minLength={POST_LIMITS.body.min}
                maxLength={POST_LIMITS.body.max}
                required
              />
              <p
                id={`${draftId}-body-help`}
                className={draftErrors.body ? 'field-error' : 'field-help'}
                role={draftErrors.body ? 'alert' : undefined}
              >
                {draftErrors.body || '10–4,000 characters'}
              </p>
            </div>
            {draftError && (
              <p className="error" role="alert">
                {draftError}
              </p>
            )}
            <Button type="submit" disabled={draftPosting}>
              {draftPosting ? 'Posting…' : 'Post discussion'}{' '}
              <ArrowUpRight size={16} />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={notifications} onOpenChange={setNotifications}>
        <DialogContent>
          <DialogTitle>A reply worth coming back to.</DialogTitle>
          <DialogDescription>
            Replies to your discussions appear here.
          </DialogDescription>
          {data?.notifications.length ? (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api('community/notifications', {});
                    await refresh();
                  })
                }
              >
                Mark all as read
              </Button>
              <div className="notification-list">
                {data.notifications.map((n) => (
                  <button
                    key={n.id}
                    className={n.read ? '' : 'unread'}
                    onClick={() => {
                      setNotifications(false);
                      setView('home');
                      setTopic('all');
                      setFeed('all');
                      setThreadId(n.thread_id);
                    }}
                  >
                    <span>{n.alias} replied</span>
                    <strong>{n.title}</strong>
                    <small>{new Date(n.created_at).toLocaleDateString()}</small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="member-empty">
              No replies yet. You’re all caught up.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
