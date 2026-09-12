'use client';
import Link from '@/components/site-link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ShieldCheck,
  LockKeyhole,
  ScanLine,
  MessagesSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { WalletList } from './wallet-list';
import { MemberDashboard } from './member-dashboard';
import { TOKENS } from '@/lib/tokens';
import { api } from '@/lib/client';
import type { CommunityStatus } from '@/lib/community-types';
import type { CommunitySignInInput } from '@/lib/community-sign-in';
import { selectedWallet, walletLabel } from '@/lib/wallet-provider';
export function Community() {
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [error, setError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [busy, setBusy] = useState(false);
  const [join, setJoin] = useState(false);
  const [provider, setProvider] = useState('backpack');
  const [consent, setConsent] = useState(false);
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
  } | null>(null);
  const inFlight = useRef(false);

  const walletUnsubscribe = useRef<(() => void) | null>(null);
  useEffect(() => () => walletUnsubscribe.current?.(), []);
  const refresh = useCallback(async () => {
    const s = await api<CommunityStatus>('community/status');
    setStatus(s);
    setError('');
  }, []);
  useEffect(() => {
    let active = true;
    const update = () =>
      api<CommunityStatus>('community/status')
        .then((s) => {
          if (active) {
            setStatus(s);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void update();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void update();
    }, 60000);
    const visible = () => {
      if (document.visibilityState === 'visible') void update();
    };
    const expired = () => {
      setStatus((s) => (s ? { ...s, member: null } : s));
      setError('Your membership session ended. Verify your wallet to return.');
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('hp-session-expired', expired);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('hp-session-expired', expired);
    };
  }, []);
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
    setPending(null);
    const flowId = crypto.randomUUID();
    let phase = 'connect';
    try {
      const p = selectedWallet(providerName);
      if (providerName === 'phantom' && 'requireSignIn' in p) p.requireSignIn();
      setStage(`Connecting to ${walletLabel(providerName)}…`);
      const connected = await walletRequest(
        p.connect(),
        walletLabel(providerName),
      );
      diagnostic(providerName, 'connect', 'ok', flowId);
      phase = 'holdings';
      setStage('Finding your supported stock tokens…');
      const challenge = await api<{
        id: string;
        message: string;
        holdingCount: number;
        expiresAt: number;
        signInInput?: CommunitySignInInput;
      }>('community/challenge', {
        wallet: connected.publicKey.toString(),
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
      });
      diagnostic(providerName, phase, 'ok', flowId);
      setStage('');
    } catch (e) {
      diagnostic(providerName, phase, 'failed', flowId);
      setStage('');
      setJoinError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function signPrepared() {
    if (inFlight.current || !pending || !consent) return;
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
      await api('community/verify', {
        challengeId: pending.id,
        signature,
        consent,
      });
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
    setStage('');
    setJoin(true);
  };
  return (
    <>
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
              <span className="small-dot" /> FOR BACKPACK STOCK-TOKEN HOLDERS
            </div>
            <h1>
              A community for
              <br />
              Solana stock holders.
            </h1>
            <p>
              News, market data and discussions. Connect a wallet holding a
              supported stock token to join.
            </p>
            <div className="hero-actions">
              <Button onClick={openJoin}>
                Connect wallet <ArrowUpRight size={18} />
              </Button>
              <a href="#inside">Preview ↓</a>
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
          <section
            className="public-preview"
            id="inside"
            aria-label="Illustrative member home preview"
          >
            <div className="preview-label">
              <span>MEMBER PREVIEW</span>
              <span>
                <LockKeyhole size={13} /> Illustrative preview
              </span>
            </div>
            <div className="preview-layout">
              <div className="preview-nav">
                <span className="preview-monogram">hp</span>
                <strong>Your dashboard</strong>
                <span className="selected">⌂ &nbsp; Home</span>
                <span>◎ &nbsp; Topics</span>
                <span>♧ &nbsp; Profile</span>
              </div>
              <div className="preview-main">
                <span className="eyebrow">VERIFIED MEMBERS</span>
                <h2>News. Markets. Discussions.</h2>
                <p>
                  News for your holdings. Market data for each token. Rooms
                  created by members.
                </p>
                <div className="preview-tags">
                  <span>MU</span>
                  <span>SKHY</span>
                  <span>SPCX</span>
                  <span>+ member-created rooms</span>
                </div>
              </div>
              <div className="preview-note">
                <ShieldCheck size={25} />
                <h3>Private holdings</h3>
                <p>
                  Holdings are detected automatically. Balances stay private.
                </p>
              </div>
            </div>
          </section>
          <section className="join-steps" id="join">
            <div>
              <ScanLine size={24} />
              <span>01 / CONNECT</span>
              <h3>Connect</h3>
              <p>Choose your Solana wallet.</p>
            </div>
            <div>
              <ShieldCheck size={24} />
              <span>02 / VERIFY</span>
              <h3>Verify</h3>
              <p>Sign a message. No transaction or transfer.</p>
            </div>
            <div>
              <MessagesSquare size={24} />
              <span>03 / JOIN IN</span>
              <h3>Join</h3>
              <p>One supported holding gives access to every room.</p>
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
              rooms.
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
                    {pending.holdingCount} supported stock token
                    {pending.holdingCount === 1 ? '' : 's'} found
                  </span>
                </div>
                <ShieldCheck size={22} />
              </div>
              <label className="choice">
                <Checkbox
                  disabled={busy}
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                />
                <span>
                  I accept the <Link href="/rules">guidelines</Link> and{' '}
                  <Link href="/trust">privacy notice</Link>.
                </span>
              </label>
              <Button
                className="wallet-sign-button"
                disabled={busy || !consent}
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
              {joinError}
            </p>
          )}
          <Link className="join-help" href="/tokens">
            Supported stocks →
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
