'use client';
import Link from '@/components/site-link';
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
import { Picker } from './workspace';
import { MemberDashboard } from './member-dashboard';
import { TOKENS } from '@/lib/tokens';
import { api } from '@/lib/client';
import type { CommunityStatus } from '@/lib/community-types';
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
  async function verify() {
    setBusy(true);
    setJoinError('');
    try {
      const p = selectedWallet(provider);
      setStage(`Connecting to ${walletLabel(provider)}…`);
      const connected = await p.connect();
      setStage('Finding your supported stock tokens…');
      const challenge = await api<{
        id: string;
        message: string;
        holdingCount: number;
      }>('community/challenge', { wallet: connected.publicKey.toString() });
      setStage(
        `${challenge.holdingCount} supported holding${challenge.holdingCount === 1 ? '' : 's'} found. Sign the membership message in ${walletLabel(provider)}…`,
      );
      const signature = Array.from(
        await p.signMessage(new TextEncoder().encode(challenge.message)),
      );
      setStage('Confirming your holdings and opening your home…');
      await api('community/verify', {
        challengeId: challenge.id,
        signature,
        consent,
      });
      if (!p.accountUnchanged()) {
        await api('community/logout', {});
        throw new Error(
          'Your wallet account changed. Connect and verify again.',
        );
      }
      walletUnsubscribe.current?.();
      walletUnsubscribe.current = p.onAccountChange(() => {
        setStatus((s) => (s ? { ...s, member: null } : s));
        setError(
          'Your connected account changed. Verify the new account to return.',
        );
        void api('community/logout', {}).catch(() => {});
      });
      await refresh();
      setJoin(false);
      setStage('');
      window.scrollTo({ top: 0 });
    } catch (e) {
      setStage('');
      setJoinError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const openJoin = () => {
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
              <span className="small-dot" /> A COMMON ROOM FOR STOCK TOKEN
              HOLDERS
            </div>
            <h1>
              A position. A perspective.
              <br />
              <em>A better conversation.</em>
            </h1>
            <p>
              Meet the people behind the positions. A private place to compare
              ideas,
              <br className="desktop-break" /> find a different angle, and stay
              curious about what you hold.
            </p>
            <div className="hero-actions">
              <Button onClick={openJoin}>
                Find your people <ArrowUpRight size={18} />
              </Button>
              <a href="#inside">Take a look inside ↓</a>
            </div>
            <div className="hero-proof">
              <ShieldCheck size={17} /> One verified stock token. Every
              conversation.
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
              <span>INSIDE THE COMMON ROOM</span>
              <span>
                <LockKeyhole size={13} /> Illustrative preview · no member data
              </span>
            </div>
            <div className="preview-layout">
              <div className="preview-nav">
                <span className="preview-monogram">hp</span>
                <strong>
                  Your corner
                  <br />
                  of the market.
                </strong>
                <span className="selected">⌂ &nbsp; Home</span>
                <span>◎ &nbsp; Topics</span>
                <span>♧ &nbsp; Saved</span>
              </div>
              <div className="preview-main">
                <span className="eyebrow">
                  A FEED WITH A LITTLE SKIN IN THE GAME
                </span>
                <h2>
                  Different holdings.
                  <br />
                  <em>Shared curiosity.</em>
                </h2>
                <p>
                  Discussions around what you own, room to explore what you
                  don’t, and useful sources to bring to the table.
                </p>
                <div className="preview-tags">
                  <span>MU</span>
                  <span>SKHY</span>
                  <span>NVDA</span>
                  <span>+ every supported topic</span>
                </div>
              </div>
              <div className="preview-note">
                <ShieldCheck size={25} />
                <h3>
                  Your holdings,
                  <br />
                  your business.
                </h3>
                <p>
                  We detect eligible stock tokens automatically. Balances never
                  appear on your profile.
                </p>
              </div>
            </div>
          </section>
          <section className="join-steps" id="join">
            <div>
              <ScanLine size={24} />
              <span>01 / CONNECT</span>
              <h3>Bring your wallet.</h3>
              <p>
                Choose Backpack, Phantom, or Solflare. We find supported
                holdings for you.
              </p>
            </div>
            <div>
              <ShieldCheck size={24} />
              <span>02 / VERIFY</span>
              <h3>A signature opens the door.</h3>
              <p>
                Sign a membership message. No transaction, token approval, or
                transfer.
              </p>
            </div>
            <div>
              <MessagesSquare size={24} />
              <span>03 / JOIN IN</span>
              <h3>Follow your curiosity.</h3>
              <p>
                Join every topic. Save a good discussion. Ask a better question.
              </p>
            </div>
          </section>
          <section className="public-closing">
            <span className="eyebrow">FOUNDING COMMUNITY</span>
            <h2>
              Small to start.
              <br />
              <em>Worth coming back to.</em>
            </h2>
            <p>
              Holding a token doesn’t make someone right.
              <br />
              It gives us a place to start the conversation.
            </p>
            <Button onClick={openJoin}>
              Connect wallet & join <ArrowUpRight size={18} />
            </Button>
            <Link href="/tokens">
              Explore {TOKENS.length} supported stock & ETF tokens →
            </Link>
          </section>
        </div>
      )}
      <Dialog
        open={join}
        onOpenChange={(value) => {
          if (!busy) setJoin(value);
        }}
      >
        <DialogContent className="community-dialog">
          <div className="join-heading">
            <div className="join-symbol">
              <ShieldCheck size={22} />
            </div>
            <DialogTitle>Your wallet. Your way in.</DialogTitle>
            <DialogDescription>
              We’ll find your supported stock tokens automatically. One holding
              unlocks the whole community.
            </DialogDescription>
          </div>
          <fieldset disabled={busy} className="join-field border-0 p-0 m-0">
            <span id="wallet-label">Choose your wallet</span>
            <Picker
              label="Wallet provider"
              value={provider}
              onChange={(value) => {
                setProvider(value);
                setJoinError('');
                setStage('');
              }}
              items={[
                { value: 'backpack', label: 'Backpack' },
                { value: 'phantom', label: 'Phantom' },
                { value: 'solflare', label: 'Solflare' },
              ]}
            />
          </fieldset>
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
          <Button disabled={busy || !consent} onClick={verify}>
            {busy
              ? 'Verification in progress…'
              : `Connect ${walletLabel(provider)} & verify`}
          </Button>
          <p className="join-note">
            Message signature only. No transaction or transfer.
            <br />
            Membership lasts 24 hours, then needs a fresh check.
          </p>
          <output aria-live="polite">{stage}</output>
          {joinError && (
            <p role="alert" className="error">
              {joinError}
            </p>
          )}
          <Link className="join-help" href="/tokens">
            Check supported stocks →
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
