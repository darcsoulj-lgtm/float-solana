'use client';
import { FloatLogo } from './float-logo';
import { HoldingsUpdateInfo } from './holdings-update-info';
import { HolderTierBadge } from './holder-tier-badge';
import { HOLDER_TIERS, type HolderTierResult } from '@/lib/holder-tier';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import Link from './site-link';
import {
  Home,
  Backpack,
  ChartNoAxesCombined,
  Newspaper,
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
const MarketOverviewPanel = lazy(() =>
  import('./market-overview').then((module) => ({
    default: module.MarketOverviewPanel,
  })),
);
const BackpackDashboardPage = lazy(() =>
  import('./backpack-dashboard').then((module) => ({
    default: module.BackpackDashboardPage,
  })),
);
import { ThemeToggle } from './theme-toggle';
import { MemberAvatar, prepareAvatar } from './member-avatar';
import { MemberBrief } from './member-brief';
import { api } from '@/lib/client';
import { readThenRefresh } from '@/lib/client-loading';
import { communityPostErrors, POST_LIMITS } from '@/lib/community-post';
import {
  type CommunityStatus,
  type MemberHome,
  type CommunityThread,
  type ThreadPage,
  type CommunitySource,
} from '@/lib/community-types';
type View = 'backpack' | 'markets' | 'brief' | 'home' | 'topics' | 'profile';
const destinations = [
  { id: 'brief', label: 'News', icon: Newspaper },
  { id: 'markets', label: 'Markets', icon: ChartNoAxesCombined },
  { id: 'backpack', label: 'Backpack', icon: Backpack },
  { id: 'home', label: 'Discussions', icon: Home },
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
    if (value === 'saved') return 'home';
    if (value === 'calendar') return 'brief';
    return value === 'topics' || destinations.some((d) => d.id === value)
      ? (value as View)
      : 'brief';
  });
  const [feed, setFeed] = useState(() => {
    if (typeof window === 'undefined') return 'personal';
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'saved') return 'saved';
    const value = params.get('feed');
    return value === 'saved' || value === 'all' ? value : 'personal';
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') === 'calendar')
      url.searchParams.set('agenda', 'open');
    url.searchParams.set('view', view);
    if (view === 'home') url.searchParams.set('feed', feed);
    else url.searchParams.delete('feed');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [view, feed]);
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
  const [bio, setBio] = useState(member.bio || '');
  const [badge, setBadge] = useState(!!member.show_badge);
  const [showValueBadge, setShowValueBadge] = useState(
    !!member.show_value_badge,
  );
  const [holderTier, setHolderTier] = useState<HolderTierResult>({
    tier: null,
    expiresAt: 0,
  });
  const [badgeSymbol, setBadgeSymbol] = useState(member.qualifying_symbol);
  const [notifyReplies, setNotifyReplies] = useState(!!member.notify_replies);
  const query = `community/threads?topic=${encodeURIComponent(topic)}&feed=${feed}&thread=${encodeURIComponent(threadId)}`;
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
    void readThenRefresh({
      read: () =>
        Promise.all([
          api<MemberHome>('community/home'),
          api<ThreadPage>(query),
        ]),
      refresh: () => syncHoldings(),
      publish: ([home, page]) => {
        if (active && sequence === requestSequence.current) {
          setError('');
          setData(home);
          setThreads(page.threads);
          setCursor(page.nextCursor);
          setLoadedQuery(query);
        }
      },
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
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
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
  useEffect(() => {
    let active = true;
    setHolderTier({ tier: null, expiresAt: 0 });
    if (data?.holdings.length) {
      void api<HolderTierResult>('community/holder-tier', {})
        .then((result) => {
          if (active) setHolderTier(result);
        })
        .catch(() => {
          /* A price outage must not block community access. */
        });
    }
    return () => {
      active = false;
    };
  }, [data?.holdings]);
  useEffect(() => {
    if (!holderTier.expiresAt) return;
    const timer = setTimeout(
      () => setHolderTier({ tier: null, expiresAt: 0 }),
      Math.max(0, holderTier.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [holderTier.expiresAt]);
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
    feed === 'saved'
      ? s.saved
      : (topic === 'all' || s.symbol === topic) &&
        (feed === 'all' || relevant.has(s.symbol)),
  );
  return (
    <div
      className={`member-shell ${view === 'markets' || view === 'backpack' ? 'markets-view' : ''} ${view === 'brief' ? 'reading-view' : ''}`}
    >
      <aside className="member-sidebar">
        <Link className="member-brand" href="/">
          <FloatLogo />
        </Link>
        <div className="member-identity">
          <MemberAvatar
            alias={member.alias}
            memberId={member.id}
            version={member.avatar_key}
          />
          <div>
            <strong>{member.alias}</strong>
            <span>
              <span className="small-dot" /> Verified holder
            </span>
          </div>
        </div>
        <nav className="member-nav" aria-label="Member navigation">
          {destinations.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={
                (view === 'topics' ? 'home' : view) === id ? 'page' : undefined
              }
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {(view === 'topics' ? 'home' : view) === id && (
                <span className="nav-indicator" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-appearance">
          <ThemeToggle />
        </div>
        <div className="sidebar-note">
          <Link href="/rules">
            Guidelines <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          {status.admin && (
            <Link href="/admin/community">
              Admin <ArrowUpRight size={15} />
            </Link>
          )}
          <Link href="/trust">
            Privacy <ArrowUpRight size={15} />
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
            Float{' '}
            <span className="breadcrumb">
              /{' '}
              {
                destinations.find(
                  (d) => d.id === (view === 'topics' ? 'home' : view),
                )?.label
              }
            </span>
          </span>
          <div>
            <ThemeToggle />
            <span className="private-label">
              <LockKeyhole size={13} /> Holders only
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
            {view !== 'markets' && view !== 'backpack' && (
              <div className="member-page-heading">
                <div>
                  <h1>
                    {view === 'brief'
                      ? 'Your news'
                      : view === 'home' || view === 'topics'
                        ? 'Discussions'
                        : 'Profile'}
                  </h1>
                </div>
                {view === 'home' && (
                  <Button onClick={() => startDiscussion()}>
                    <Plus size={17} /> New discussion
                  </Button>
                )}
              </div>
            )}
            {(view === 'home' || view === 'topics') && (
              <div
                className="feed-tabs discussion-views"
                role="group"
                aria-label="Discussions view"
              >
                <button
                  aria-pressed={view === 'home'}
                  onClick={() => navigate('home')}
                >
                  Threads
                </button>
                <button
                  aria-pressed={view === 'topics'}
                  onClick={() => navigate('topics')}
                >
                  Rooms
                </button>
              </div>
            )}
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
                  <Suspense fallback={<p role="status">Loading markets…</p>}>
                    <MarketOverviewPanel
                      holdings={holdings.map((h) => h.symbol)}
                      positions={holdings}
                    />
                  </Suspense>
                ) : (
                  <p>Loading your holdings…</p>
                )}
              </>
            ) : view === 'backpack' ? (
              <Suspense fallback={<p role="status">Loading Backpack…</p>}>
                <BackpackDashboardPage embedded />
              </Suspense>
            ) : view === 'brief' ? (
              <MemberBrief
                key={view}
                kind="news"
                holdings={holdings.map((h) => h.symbol)}
                symbol={held.has(coverageSymbol) ? coverageSymbol : 'all'}
                onSymbolChange={setCoverageSymbol}
                onDiscuss={(item) => {
                  startDiscussion(item.title.slice(0, 140), item.symbols[0]);
                  setDraftBody(`Source: ${item.url}\n\nComment: `);
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
                      <h2>{search ? 'No matching rooms.' : 'No rooms yet.'}</h2>
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
                      bio,
                      showBadge: badge,
                      showValueBadge,
                      badgeSymbol,
                      notifyReplies,
                    });
                    await refreshStatus();
                    setNotice('Profile has been saved.');
                  });
                }}
              >
                <div className="profile-preview">
                  <MemberAvatar
                    alias={alias}
                    memberId={member.id}
                    version={member.avatar_key}
                  />
                  <div>
                    <strong>{alias || 'Your display name'}</strong>
                    <span>
                      {badge ? `${badgeSymbol} holder` : 'Verified holder'}
                    </span>
                  </div>
                  <span className="eyebrow">PROFILE PREVIEW</span>
                </div>
                <div className="profile-photo-actions">
                  <label className="photo-upload">
                    Change photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        void run(async () => {
                          const blob = await prepareAvatar(file);
                          const response = await fetch('/api/avatar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'image/jpeg' },
                            body: blob,
                          });
                          const result = (await response.json()) as {
                            error?: string;
                          };
                          if (!response.ok) throw Error(result.error);
                          await refreshStatus();
                          setNotice('Photo updated.');
                        });
                      }}
                    />
                  </label>
                  {member.avatar_key && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const r = await fetch('/api/avatar', {
                            method: 'DELETE',
                          });
                          if (!r.ok) throw Error('Could not remove photo.');
                          await refreshStatus();
                        })
                      }
                    >
                      Remove photo
                    </Button>
                  )}
                </div>
                <label className="profile-field">
                  <span>Nickname</span>
                  <input
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    minLength={3}
                    maxLength={24}
                    required
                  />
                  <small>
                    3–24 characters. Letters, numbers, spaces, periods,
                    underscores or hyphens.
                  </small>
                </label>
                <label className="profile-field">
                  <span>Bio</span>
                  <textarea
                    value={bio}
                    maxLength={160}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="A little about you"
                  />
                </label>
                <div className="profile-setting">
                  <div>
                    <h3>Show stock badge</h3>
                    <p>Show one verified stock beside your name.</p>
                  </div>
                  <Checkbox
                    aria-label="Show stock badge"
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
                <section className="profile-tier" aria-label="Holder tier">
                  <div className="profile-tier-heading">
                    <h3>Your holder tier</h3>
                    <HolderTierBadge
                      tier={holderTier.tier}
                      expiresAt={holderTier.expiresAt}
                    />
                  </div>
                  <p>
                    Based on verified tokenized stock value in this wallet. A
                    tier appears when every holding has a reliable price.
                  </p>
                  <div className="holder-tier-scale">
                    {HOLDER_TIERS.map((t) => (
                      <div
                        key={t.id}
                        className={holderTier.tier === t.id ? 'is-current' : ''}
                      >
                        <HolderTierBadge tier={t.id} />
                        <small>{t.range}</small>
                      </div>
                    ))}
                  </div>
                  <div className="profile-setting">
                    <div>
                      <h3>Show value badge</h3>
                      <p>
                        Others can see your tier and its value range. Exact
                        balances stay private.
                      </p>
                    </div>
                    <Checkbox
                      aria-label="Show value badge"
                      checked={showValueBadge}
                      onCheckedChange={(v) => setShowValueBadge(v === true)}
                    />
                  </div>
                </section>
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
                <div className="profile-appearance">
                  <h3>Appearance</h3>
                  <ThemeToggle />
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
                        New discussion <ArrowRight size={17} />
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
                        <button
                          aria-pressed={feed === 'saved' && !threadId}
                          onClick={() => {
                            setFeed('saved');
                            setTopic('all');
                            setThreadId('');
                          }}
                        >
                          <Bookmark size={15} aria-hidden="true" /> Saved
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
                      thread={
                        t.member_id === member.id
                          ? {
                              ...t,
                              value_tier: member.show_value_badge
                                ? holderTier.tier
                                : null,
                              value_tier_expires_at: holderTier.expiresAt,
                            }
                          : t
                      }
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
                        : feed === 'saved'
                          ? 'No saved discussions.'
                          : 'No discussions yet.'}
                    </h3>
                    <p>
                      {feed === 'saved'
                        ? 'Saved discussions appear here.'
                        : threadId
                          ? 'It may have been removed by its author or a moderator.'
                          : feed === 'personal'
                            ? 'No matching discussions. Try All or start one.'
                            : 'Start a discussion.'}
                    </p>
                    {view === 'home' && !threadId && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          feed !== 'all' ? setFeed('all') : startDiscussion()
                        }
                      >
                        {feed !== 'all'
                          ? 'Browse discussions'
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
                    Load more
                  </Button>
                )}
                {!loading && feed === 'saved' && sourceItems.length > 0 && (
                  <section className="member-sources">
                    <div className="source-heading">
                      <div>
                        <h2>
                          {feed === 'saved' ? 'Saved sources' : 'Sources'}
                        </h2>
                      </div>
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
                        {feed === 'saved'
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
                <span>HOLDINGS</span>
                <HoldingsUpdateInfo
                  checking={holdingsChecking}
                  available={Boolean(data?.holdingsRefreshAvailable)}
                  checkedAt={
                    holdings.length
                      ? Math.max(...holdings.map((h) => h.verified_at))
                      : null
                  }
                />
                <LockKeyhole size={14} aria-label="Private holdings" />
              </div>
              {holdingsError && (
                <p role="status" className="context-caption">
                  {holdingsError}
                </p>
              )}
              {data && !data.holdingsRefreshAvailable && (
                <p className="context-caption">
                  Verify wallet to enable updates.
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
                Manage wallet
              </button>
            </section>
            <section className="context-following">
              <div className="context-heading">
                <Compass size={17} />
                <span>FOLLOWING</span>
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
                <p>No followed rooms.</p>
              )}
              <button
                className="text-action"
                onClick={() => navigate('topics')}
              >
                Browse rooms <ArrowRight size={14} />
              </button>
            </section>
            <div className="context-principle">
              <small>
                Independent of token issuers. Discussions are not investment
                advice.
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
          <DialogTitle>Sign out?</DialogTitle>
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
          <DialogTitle>New discussion</DialogTitle>
          <DialogDescription>
            Visible to all verified members.
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
                placeholder="Discussion title"
                maxLength={POST_LIMITS.title.max}
                required
              />
              <p
                id={`${draftId}-title-help`}
                className={draftErrors.title ? 'field-error' : 'field-help'}
                role={draftErrors.title ? 'alert' : undefined}
              >
                {draftErrors.title || ''}
              </p>
            </div>
            <div className="discussion-field">
              <label htmlFor={`${draftId}-body`}>Message</label>
              <textarea
                id={`${draftId}-body`}
                aria-label="Message"
                aria-invalid={!!draftErrors.body}
                aria-describedby={`${draftId}-body-help`}
                name="body"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                disabled={draftPosting}
                placeholder="Write your message…"
                maxLength={POST_LIMITS.body.max}
              />
              <p
                id={`${draftId}-body-help`}
                className={draftErrors.body ? 'field-error' : 'field-help'}
                role={draftErrors.body ? 'alert' : undefined}
              >
                {draftErrors.body || ''}
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
          <DialogTitle>Notifications</DialogTitle>
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
