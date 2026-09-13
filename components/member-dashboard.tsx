'use client';
import { RoomDirectory } from './room-directory';
import { useCommunityFeed } from '@/hooks/use-community-feed';
import { registryTokens } from '@/lib/token-registry';
import { FloatLogo } from './float-logo';
import { HoldingsUpdateInfo } from './holdings-update-info';
import { HolderTierBadge } from './holder-tier-badge';
import { HOLDER_TIERS, type HolderTierResult } from '@/lib/holder-tier';
import {
  lazy,
  Activity,
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
  ChartNoAxesCombined,
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
import { MemberSectionBoundary } from './member-section-boundary';
import { loadClientModule } from '@/lib/client-module';
const MemberHomePanel = lazy(() =>
  loadClientModule(() => import('./member-home')).then((module) => ({
    default: module.MemberHomePanel,
  })),
);
const MemberMarkets = lazy(() =>
  loadClientModule(() => import('./member-markets')).then((module) => ({
    default: module.MemberMarkets,
  })),
);
import {
  memberLocation,
  type MemberView,
  type MarketView,
} from '@/lib/member-navigation';
import { ThemeToggle } from './theme-toggle';
import { MemberAvatar, prepareAvatar } from './member-avatar';
import { api } from '@/lib/client';
import { readThenRefresh } from '@/lib/client-loading';
import { communityPostErrors, POST_LIMITS } from '@/lib/community-post';
import {
  type CommunityStatus,
  type MemberHome,
  type CommunitySource,
} from '@/lib/community-types';
type View = MemberView;
const destinations = [
  { id: 'overview', label: 'Home', icon: Home },
  { id: 'home', label: 'Discussions', icon: MessageSquare },
  { id: 'markets', label: 'Markets', icon: ChartNoAxesCombined },
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
  const [initialLocation] = useState(() =>
    memberLocation(typeof window === 'undefined' ? '' : window.location.search),
  );
  const [view, setView] = useState<View>(initialLocation.view);
  const [market, setMarket] = useState<MarketView>(initialLocation.market);
  const [feed, setFeed] = useState(initialLocation.feed);
  const [topic, setTopic] = useState(() =>
    typeof window === 'undefined'
      ? 'all'
      : new URLSearchParams(window.location.search).get('topic') || 'all',
  );
  const [coverageSymbol, setCoverageSymbol] = useState('all');
  const [threadId, setThreadId] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : new URLSearchParams(window.location.search).get('thread') || '',
  );
  const [visited, setVisited] = useState<Set<View>>(() => new Set([view]));
  const scrollPositions = useRef<Record<string, number>>({});
  const viewKey = view + ':' + (view === 'markets' ? market : '');
  if (!visited.has(view)) setVisited(new Set([...visited, view]));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') === 'calendar')
      url.searchParams.set('agenda', 'open');
    url.searchParams.set('view', view);
    if (view === 'markets' && market !== 'all')
      url.searchParams.set('issuer', market);
    else url.searchParams.delete('issuer');
    for (const [key, value] of [
      ['feed', feed],
      ['topic', topic],
      ['thread', threadId],
    ]) {
      if (view === 'home' && value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [view, market, feed, topic, threadId]);
  useEffect(() => {
    const restore = () => {
      scrollPositions.current[viewKey] = window.scrollY;
      const next = memberLocation(window.location.search);
      setView(next.view);
      setMarket(next.market);
      setFeed(next.feed);
      const params = new URLSearchParams(window.location.search);
      setTopic(params.get('topic') || 'all');
      setThreadId(params.get('thread') || '');
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [viewKey]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      window.scrollTo({
        top: scrollPositions.current[viewKey] || 0,
        behavior: 'instant',
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [viewKey]);
  const [data, setData] = useState<MemberHome | null>(null);
  const tokens = registryTokens(data?.registry);
  const [error, setError] = useState('');
  const [homeError, setHomeError] = useState('');
  const [communityRevision, setCommunityRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [holdingsChecking, setHoldingsChecking] = useState(false);
  const [holdingsError, setHoldingsError] = useState('');
  const holdingsRequest = useRef<Promise<void> | null>(null);
  const lastHoldingsAttempt = useRef(0);
  const syncHoldings = useCallback(
    (force = false): Promise<void> => {
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
    },
    [setHoldingsError, setHoldingsChecking],
  );
  const [signOut, setSignOut] = useState(false);
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
    ? communityPostErrors(
        {
          title: draftTitle,
          body: draftBody,
          topic: draftTopic,
        },
        tokens,
      )
    : {};
  const [notifications, setNotifications] = useState(false);
  const [alias, setAlias] = useState(member.alias);
  const [bio, setBio] = useState(member.bio || '');
  const [badge, setBadge] = useState(!!member.show_badge);
  const [showValueBadge, setShowValueBadge] = useState(
    !!member.show_value_badge,
  );
  const [tierResult, setHolderTier] = useState<
    HolderTierResult & { holdingsKey?: string }
  >({
    tier: null,
    expiresAt: 0,
  });
  const [badgeSymbol, setBadgeSymbol] = useState(member.qualifying_symbol);
  const [notifyReplies, setNotifyReplies] = useState(!!member.notify_replies);
  const query = `community/threads?topic=${encodeURIComponent(topic)}&feed=${feed}&thread=${encodeURIComponent(threadId)}`;
  const {
    threads,
    cursor,
    error: feedError,
    loading,
    hasPage,
    refresh: refreshFeed,
    loadMore,
  } = useCommunityFeed(query, view === 'home' || view === 'topics');
  const refresh = useCallback(async () => {
    await Promise.all([
      syncHoldings(true)
        .then(() => api<MemberHome>('community/home'))
        .then((home) => {
          setData(home);
          setHomeError('');
        }),
      refreshFeed(),
    ]);
    setCommunityRevision((n) => n + 1);
    setError('');
  }, [syncHoldings, refreshFeed, setHomeError, setCommunityRevision, setError]);
  useEffect(() => {
    let active = true;
    void readThenRefresh({
      read: () => api<MemberHome>('community/home'),
      refresh: () => syncHoldings(),
      publish: (home) => {
        if (active) {
          setData(home);
          setHomeError('');
        }
      },
    }).catch((e) => {
      if (active) setHomeError(e.message);
    });
    return () => {
      active = false;
    };
  }, [syncHoldings]);
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
  function navigate(next: View, nextMarket = market) {
    scrollPositions.current[viewKey] = window.scrollY;
    setView(next);
    setMarket(nextMarket);
    setNotice('');
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    if (next !== view || nextMarket !== market)
      url.searchParams.delete('stock');
    if (next === 'markets' && nextMarket !== 'all')
      url.searchParams.set('issuer', nextMarket);
    else url.searchParams.delete('issuer');
    url.hash = '';
    window.history.pushState(null, '', url.pathname + url.search);
  }
  const holdingsKey = (data?.holdings ?? [])
    .map((h) => `${h.symbol}:${h.raw_amount}:${h.verified_at}`)
    .join('|');
  const holderTier =
    tierResult.holdingsKey === holdingsKey
      ? tierResult
      : { tier: null, expiresAt: 0 };
  useEffect(() => {
    let active = true;
    if (holdingsKey) {
      void api<HolderTierResult>('community/holder-tier', {})
        .then((result) => {
          if (active) setHolderTier({ ...result, holdingsKey });
        })
        .catch(() => {
          /* A price outage must not block community access. */
        });
    }
    return () => {
      active = false;
    };
  }, [holdingsKey]);
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
      selectedTopic === 'general' ||
        tokens.some((t) => t.symbol === selectedTopic) ||
        rooms.some((r) => r.id === selectedTopic)
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
    navigate('home');
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
      className={`member-shell ${view === 'markets' || view === 'overview' ? 'markets-view' : ''} ${view === 'overview' ? 'home-view' : ''}`}
    >
      <aside className="member-sidebar">
        <Link
          className="member-brand"
          href="/?view=overview"
          onClick={(event) => {
            // Keep ordinary Home navigation inside the verified member shell.
            // Modified clicks retain the anchor's native new-tab behavior.
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            if (view !== 'overview') navigate('overview');
            scrollPositions.current['overview:'] = 0;
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
        >
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
              onClick={() => navigate(id, id === 'markets' ? 'all' : market)}
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
            {view !== 'markets' && view !== 'overview' && (
              <div className="member-page-heading">
                <div>
                  <h1>
                    {view === 'home' || view === 'topics'
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
              <fieldset
                className="feed-tabs discussion-views"

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
              </fieldset>
            )}
            {homeError && (
              <p className="inline-status" role="alert">
                {homeError} <button onClick={() => run(refresh)}>Retry</button>
              </p>
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
              <output className="member-notice">
                Your holdings are from an earlier verification.{' '}
                <Button variant="ghost" onClick={renew}>
                  Verify wallet to update holdings
                </Button>
              </output>
            )}
            {holdingsError && view === 'markets' && (
              <output className="member-error">{holdingsError}</output>
            )}
            {notice && <output className="member-notice">{notice}</output>}
            {visited.has('overview') && (
              <Activity mode={view === 'overview' ? 'visible' : 'hidden'}>
                <MemberSectionBoundary section="Home">
                  {data ? (
                    <Suspense
                      fallback={
                        <output className="inline-status">Loading Home…</output>
                      }
                    >
                      <MemberHomePanel
                        revision={communityRevision}
                        positions={holdings}
                        symbol={
                          held.has(coverageSymbol) ? coverageSymbol : 'all'
                        }
                        onSymbolChange={setCoverageSymbol}
                        onDiscuss={(item) => {
                          startDiscussion(
                            item.title.slice(0, 140),
                            item.symbols[0],
                          );
                          setDraftBody(`Source: ${item.url}\n\n`);
                        }}
                        onMarkets={() => navigate('markets', 'all')}
                        onThread={(id) => {
                          setThreadId(id);
                          setFeed('all');
                          setTopic('all');
                          navigate('home');
                        }}
                        onDiscussions={() => {
                          setFeed('all');
                          setTopic('all');
                          setThreadId('');
                          navigate('home');
                        }}
                        onCreate={() => startDiscussion()}
                      />
                    </Suspense>
                  ) : (
                    <output className="inline-status">
                      Loading your holdings…
                    </output>
                  )}
                </MemberSectionBoundary>
              </Activity>
            )}
            {visited.has('markets') && (
              <Activity mode={view === 'markets' ? 'visible' : 'hidden'}>
                <MemberSectionBoundary section="Markets">
                  <Suspense
                    fallback={
                      <output className="inline-status">
                        Loading markets…
                      </output>
                    }
                  >
                    <MemberMarkets
                      positions={holdings}
                      market={market}
                      onMarketChange={(next) => navigate('markets', next)}
                    />
                  </Suspense>
                </MemberSectionBoundary>
              </Activity>
            )}
            {view === 'markets' || view === 'overview' ? null : view ===
              'topics' ? (
              <>
                <Button
                  className="room-create-button"
                  onClick={() => setCreateRoom(true)}
                >
                  <Plus size={17} /> Create a room
                </Button>
                <RoomDirectory
                  follows={data?.follows ?? []}
                  onCreate={() => setCreateRoom(true)}
                  onOpen={(room) => {
                    setData((previous) =>
                      previous && !previous.rooms.some((r) => r.id === room.id)
                        ? { ...previous, rooms: [...previous.rooms, room] }
                        : previous,
                    );
                    openTopic(room.id);
                  }}
                  onFollow={(room) =>
                    run(async () => {
                      await api('community/follow', {
                        symbol: room.id,
                        follow: !data?.follows.includes(room.id),
                      });
                      await refresh();
                    })
                  }
                />
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
                {feedError && (
                  <p className="inline-status" role="alert">
                    {feedError}{' '}
                    <button onClick={() => run(refresh)}>Retry</button>
                  </p>
                )}
                {feedError && !hasPage ? null : loading ? (
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
                        await loadMore();
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
                <output className="context-caption">{holdingsError}</output>
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
              const errors = communityPostErrors(payload, tokens);
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
                navigate('home');
                setCommunityRevision((n) => n + 1);
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
                  ...tokens.map((t) => ({
                    value: t.symbol,
                    label: t.shortName + ' · ' + t.symbol,
                  })),
                  ...rooms
                    .filter(
                      (r) =>
                        r.id !== 'general' &&
                        !tokens.some((t) => t.symbol === r.id),
                    )
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
