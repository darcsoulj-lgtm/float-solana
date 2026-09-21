'use client';
import { FloatLogo } from './float-logo';
import Link from '@/components/site-link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  MessageSquare,
  ShieldCheck,
  UsersRound,
  ChartNoAxesColumn,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { WalletList } from './wallet-list';
import { WalletReturn } from './wallet-return';
import { MemberDashboard } from './member-dashboard';
import { api, ApiError } from '@/lib/client';
import type { CommunityStatus } from '@/lib/community-types';
import type { CommunitySignInInput } from '@/lib/community-sign-in';
import { selectedWallet, walletLabel } from '@/lib/wallet-provider';
import { readWalletHandoff, walletReturnContext, WALLET_RETURN_KEY, type WalletReturn as WalletReturnState, WALLET_HANDOFF_KEY } from '@/lib/wallet-handoff';
import { isMobileBrowser } from '@/lib/wallet-browser-link';

export function Community({ appHandoffId }: { appHandoffId?: string } = {}) {
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [error, setError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showSupportedHelp, setShowSupportedHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [join, setJoin] = useState(
    () =>
      !!appHandoffId || (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('join') === '1'),
  );
  const [provider, setProvider] = useState('backpack');
  const [stage, setStage] = useState('');
  const [pending, setPending] = useState<{
    id: string;
    message: string;
    holdingCount: number;
    expiresAt: number;
    signInInput?: CommunitySignInInput;
    provider: string;
    connection: ReturnType<typeof selectedWallet>;
    flowId: string;
    returnContext: WalletReturnState | null;
  } | null>(null);
  const [handoffDone, setHandoffDone] = useState(false);
  const [handoffWaiting, setHandoffWaiting] = useState(false);
  const [returnLinked, setReturnLinked] = useState(false);
  const inFlight = useRef(false);
  const returnContext = useRef<WalletReturnState | null>(null);
  useEffect(() => {
    returnContext.current = walletReturnContext(sessionStorage, window.location.href);
    if (appHandoffId && returnContext.current?.id !== appHandoffId) {
      returnContext.current = { id: appHandoffId, completed: false, expiresAt: Date.now() + 600000 };
    }
    const context = returnContext.current;
    const timer = setTimeout(() => {
      setReturnLinked(!!context?.id);
      if (context?.completed) setHandoffDone(true);
      else if (context?.id) setJoin(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [appHandoffId]);

  const walletUnsubscribe = useRef<(() => void) | null>(null);
  useEffect(() => () => walletUnsubscribe.current?.(), []);
  // Foreground reads may start before a handoff claim sets the session cookie.
  // Only the newest request may publish membership state.
  const statusRequest = useRef(0);
  const invalidateStatus = useCallback(() => { ++statusRequest.current; }, []);
  const refresh = useCallback(async () => {
    const request = ++statusRequest.current;
    try {
      const s = await api<CommunityStatus>('community/status');
      if (request === statusRequest.current) { setStatus(s); setError(''); }
    } catch (e) {
      if (request === statusRequest.current) setError((e as Error).message);
      throw e;
    }
  }, []);
  useEffect(() => {
    const update = () => { void refresh().catch(() => {}); };
    update();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') update();
    }, 60000);
    const visible = () => {
      if (document.visibilityState === 'visible') update();
    };
    const expired = () => {
      invalidateStatus();
      setStatus((s) => (s ? { ...s, member: null } : s));
      setError('Your membership session ended. Verify your wallet to return.');
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('hp-session-expired', expired);
    return () => {
      invalidateStatus();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('hp-session-expired', expired);
    };
  }, [refresh, invalidateStatus]);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    let active = true;
    let checking = false;
    const claim = async () => {
      if (!active || checking || document.visibilityState !== 'visible') return;
      const flow = readWalletHandoff(localStorage);
      if (!flow) {
        setHandoffWaiting(false);
        return;
      }
      setHandoffWaiting(true);
      checking = true;
      try {
        const result = await api<{ ready: boolean }>('community/handoff/claim', flow);
        if (active && result.ready) {
          localStorage.removeItem(WALLET_HANDOFF_KEY);
          setHandoffWaiting(false);
          setJoin(false);
          await refresh();
        }
      } catch {
        // Keep the pending flow for the next foreground check.
      } finally {
        checking = false;
      }
    };
    void claim();
    const interval = setInterval(() => { void claim(); }, 4000);
    document.addEventListener('visibilitychange', claim);
    window.addEventListener('focus', claim);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', claim);
      window.removeEventListener('focus', claim);
    };
  }, [refresh]);
  useEffect(() => {
    if (!status?.member) return;
    const timer = setTimeout(
      () => {
        setStatus((s) => (s ? { ...s, member: null } : s));
      },
      Math.max(0, status.member.verified_until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [status?.member]);
  function diagnostic(
    providerName: string,
    phase: string,
    code: string,
    flowId: string,
  ) {
    // Allowlisted operational details only: no wallet, balance, signature, or free-form error.
    void api('community/wallet-diagnostic', {
      provider: providerName,
      phase,
      code,
      flowId,
      clientVersion: 13,
      method: providerName === 'phantom' ? 'signIn' : 'signMessage',
    }).catch(() => {});
  }
  async function walletRequest<T>(
    request: Promise<T>,
    name: string,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  `No response from ${name} yet. Open the wallet and approve or reject its pending request, then try again.`,
                ),
              ),
            90000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  async function beginVerification(providerName: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setProvider(providerName);
    setBusy(true);
    setJoinError('');
    setShowSupportedHelp(false);
    setPending(null);
    const flowId = crypto.randomUUID();
    let phase = 'connect';
    try {
      const context = appHandoffId
        ? { id: appHandoffId, completed: false, expiresAt: Date.now() + 600000 }
        : walletReturnContext(sessionStorage, window.location.href) || returnContext.current;
      const p = selectedWallet(providerName);
      if (providerName === 'phantom' && 'requireSignIn' in p) p.requireSignIn();
      setStage(`Connecting to ${walletLabel(providerName)}…`);
      const connected = await walletRequest(
        p.connect(),
        walletLabel(providerName),
      );
      diagnostic(providerName, 'connect', 'ok', flowId);
      phase = 'holdings';
      setStage('Finding your supported tokenized stocks…');
      const challenge = await api<{
        id: string;
        message: string;
        holdingCount: number;
        expiresAt: number;
        signInInput?: CommunitySignInInput;
      }>('community/challenge', {
        wallet: connected.publicKey.toString(),
        ...(context?.id ? { handoffId: context.id } : {}),
        ...(providerName === 'phantom' ? { authMethod: 'signIn' } : {}),
      });
      if (!p.accountUnchanged())
        throw new Error(
          'Your wallet account changed. Connect and verify again.',
        );
      setPending({
        ...challenge,
        provider: providerName,
        connection: p,
        flowId,
        returnContext: context,
      });
      diagnostic(providerName, phase, 'ok', flowId);
      setStage('');
    } catch (e) {
      diagnostic(providerName, phase, 'failed', flowId);
      setStage('');
      setJoinError((e as Error).message);
      setShowSupportedHelp(
        e instanceof ApiError && e.code === 'NO_SUPPORTED_HOLDINGS',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function signPrepared() {
    if (inFlight.current || !pending) return;
    if (Date.now() >= pending.expiresAt) {
      setPending(null);
      setJoinError('This check expired. Choose your wallet to check again.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setJoinError('');
    let phase = 'sign';
    try {
      setStage(
        `Open ${walletLabel(pending.provider)} and review the membership message…`,
      );
      // This request starts directly inside the click, without an intervening RPC await.
      const message = new TextEncoder().encode(pending.message);
      const signing = (() => {
        if (pending.provider !== 'phantom')
          return pending.connection.signMessage(message);
        if (!pending.signInInput || !('signIn' in pending.connection))
          throw new Error(
            'This sign-in check is outdated. Reload and connect again.',
          );
        return pending.connection.signIn(pending.signInInput, message);
      })();
      diagnostic(pending.provider, phase, 'requested', pending.flowId);
      const signature = Array.from(
        await walletRequest(signing, walletLabel(pending.provider)),
      );
      diagnostic(pending.provider, phase, 'ok', pending.flowId);
      phase = 'verify';
      setStage('Confirming your holdings and opening your home…');
      const verified = await api<{ ok: boolean; handoffReady?: boolean }>('community/verify', {
        challengeId: pending.id,
        signature,
        ...(pending.returnContext?.id ? { handoffId: pending.returnContext.id } : {}),
      });
      if (pending.returnContext?.id && !verified.handoffReady) {
        throw new Error('Your app sign-in was not linked. Reopen Float from your Home Screen and connect again.');
      }
      if (!pending.connection.accountUnchanged()) {
        await api('community/logout', {});
        throw new Error(
          'Your wallet account changed. Connect and verify again.',
        );
      }
      diagnostic(pending.provider, phase, 'ok', pending.flowId);
      walletUnsubscribe.current?.();
      walletUnsubscribe.current = pending.connection.onAccountChange(() => {
        setStatus((s) => (s ? { ...s, member: null } : s));
        setError(
          'Your connected account changed. Verify the new account to return.',
        );
        void api('community/logout', {}).catch(() => {});
      });
      // Show the choice before refreshing membership can mount the dashboard.
      // Capture the flow before signing; don't rediscover it from a changed URL.
      if (pending.returnContext || isMobileBrowser(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
        const context: WalletReturnState = { id: pending.returnContext?.id || null, completed: true, expiresAt: pending.expiresAt };
        returnContext.current = context;
        setReturnLinked(!!context.id);
        try { sessionStorage.setItem(WALLET_RETURN_KEY, JSON.stringify(context)); } catch { /* Keep the in-memory choice. */ }
        setHandoffDone(true);
      }
      await refresh();
      setJoin(false);
      setStage('');
      setPending(null);
      window.scrollTo({ top: 0 });
    } catch (e) {
      const message = (e as Error).message || 'Wallet request failed.';
      const code =
        /different account or message|invalid signature|invalid signed message|invalid signing response/.test(
          message,
        )
          ? 'invalid-response'
          : /account(?: or connection)? changed|connection changed/.test(
                message,
              )
            ? 'account-changed'
            : /reject|cancel|denied/i.test(message)
              ? 'cancelled'
              : /No response/.test(message)
                ? 'timeout'
                : 'failed';
      diagnostic(pending.provider, phase, code, pending.flowId);
      setStage('');
      setJoinError(message);
      if (
        phase === 'verify' ||
        code === 'account-changed' ||
        code === 'invalid-response'
      )
        setPending(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const openJoin = () => {
    setPending(null);
    setJoinError('');
    setShowSupportedHelp(false);
    setStage('');
    setJoin(true);
  };
  // Unknown membership is not a signed-out session. Never show the visitor
  // landing page while the first server check is pending or has failed.
  if (status === null) {
    return (
      <section
        className="community-entry"
        aria-label="Opening Float"
        aria-busy={!error}
      >
        <FloatLogo />
        {error ? (
          <>
            <p role="alert">
              We couldn’t check your session. Please try again.
            </p>
            <Button onClick={() => refresh().catch((e) => setError(e.message))}>
              Retry
            </Button>
          </>
        ) : (
          <output>Opening Float…</output>
        )}
      </section>
    );
  }
  if (handoffDone && status.member) {
    return <WalletReturn linked={returnLinked} onContinue={() => {
      try { sessionStorage.removeItem(WALLET_RETURN_KEY); } catch { /* Continue in this page. */ }
      const url = new URL(window.location.href);
      url.searchParams.delete('float_handoff');
      url.searchParams.delete('join');
      if (appHandoffId) {
        window.location.replace('/' + url.search + url.hash);
        return;
      }
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      returnContext.current = null;
      setHandoffDone(false);
    }} />;
  }
  return (
    <>
      {handoffWaiting && !status.member && <output className="wallet-handoff-status">After signing, reopen Float from your Home Screen. We’ll finish here.</output>}
      {status?.member ? (
        <MemberDashboard
          key={status.member.id}
          status={status}
          refreshStatus={refresh}
          renew={openJoin}
        />
      ) : (
        <div className="club public-club">
          <section className="public-hero">
            <div className="eyebrow">
              <span className="small-dot" /> FOR TOKENIZED STOCK HOLDERS ON SOLANA
            </div>
            <h1>The community for people who hold tokenized stocks.</h1>
            <p>
              Verify your holdings privately. Follow the market and hear from
              people who actually own the asset.
            </p>
            <div className="hero-actions">
              <Button onClick={openJoin}>
                Join the community <ArrowUpRight size={18} />
              </Button>
              <Link className="hero-market-link" href="/markets">
                Explore markets
              </Link>
            </div>
            {error && (
              <div className="club-error" role="alert">
                {error}{' '}
                <Button
                  variant="ghost"
                  onClick={() => refresh().catch((e) => setError(e.message))}
                >
                  Retry
                </Button>
              </div>
            )}
          </section>
          <section className="join-steps public-benefits" id="inside" aria-label="What Float offers">
            <div>
              <UsersRound aria-hidden="true" />
              <h3>Verified holders</h3>
              <p>Know you’re hearing from people who actually hold the asset.</p>
            </div>
            <div>
              <MessageSquare aria-hidden="true" />
              <h3>Share your view</h3>
              <p>Post ideas, questions, polls, and market takes.</p>
            </div>
            <div>
              <ChartNoAxesColumn aria-hidden="true" />
              <h3>Holder insights</h3>
              <p>See sentiment, conviction, and what holders are doing.</p>
            </div>
          </section>
        </div>
      )}
      <Dialog
        open={join}
        onOpenChange={(value) => {
          if (!busy) setJoin(value);
        }}
      >
        <DialogContent className="community-dialog wallet-connect-dialog">
          <div className="join-heading">
            <div className="join-symbol">
              <ShieldCheck size={22} />
            </div>
            <DialogTitle>
              {pending ? 'Verify membership' : 'Connect your wallet'}
            </DialogTitle>
            <DialogDescription>
              We detect your holdings. Any supported token gives access to all
              channels.
            </DialogDescription>
          </div>
          {pending ? (
            <div className="wallet-sign-step">
              <div className="verified-wallet-summary">
                <Image
                  src={
                    '/wallets/' +
                    pending.provider +
                    (pending.provider === 'backpack' ? '.png' : '.svg')
                  }
                  alt=""
                  width={44}
                  height={44}
                  unoptimized
                />
                <div>
                  <strong>{walletLabel(pending.provider)} connected</strong>
                  <span>
                    {pending.holdingCount} supported tokenized stock
                    {pending.holdingCount === 1 ? '' : 's'} found
                  </span>
                </div>
                <ShieldCheck size={22} />
              </div>
              <Button
                className="wallet-sign-button"
                disabled={busy}
                onClick={signPrepared}
              >
                {busy
                  ? 'Waiting for verification…'
                  : `Sign in ${walletLabel(pending.provider)}`}
                <ArrowUpRight size={18} />
              </Button>
              <Button
                className="wallet-back-button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setPending(null);
                  setStage('');
                  setJoinError('');
                }}
              >
                Choose another wallet
              </Button>
            </div>
          ) : (
            <WalletList
              disabled={busy}
              selected={busy ? provider : undefined}
              onConnect={beginVerification}
            />
          )}
          <p className="join-note">
            Message signature only. No transaction or transfer.
            <br />
            Your wallet address is stored during the 24-hour session for
            automatic holdings checks.
          </p>
          <output aria-live="polite">{stage}</output>
          {joinError && (
            <p role="alert" className="error">
              {showSupportedHelp ? (
                <>
                  <strong>
                    No supported tokenized stocks found in this wallet.
                  </strong>
                  <br />
                  Try another Solana wallet or view eligible stocks.
                </>
              ) : (
                joinError
              )}
            </p>
          )}
          {showSupportedHelp && !pending && (
            <Link
              className="join-help"
              href="/tokens"
              target="_blank"
              rel="noopener noreferrer"
            >
              View eligible stocks →
            </Link>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
