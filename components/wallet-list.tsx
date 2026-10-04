'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, ChevronRight, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import { walletAvailability, subscribeWallets } from '@/lib/wallet-provider';
import { api } from '@/lib/client';
import { activeWalletReturnContext, walletHandoffId, WALLET_HANDOFF_KEY } from '@/lib/wallet-handoff';
import {
  isMobileBrowser,
  walletBrowserLink,
  walletLaunchIntent,
} from '@/lib/wallet-browser-link';
const labels = {
  phantom: 'Phantom',
  backpack: 'Backpack',
  solflare: 'Solflare',
};
const icons: Record<string, string> = {
  phantom: '/wallets/phantom.svg',
  backpack: '/wallets/backpack.png',
  solflare: '/wallets/solflare.svg',
};
const websites: Record<string, string> = {
  phantom: 'https://phantom.com/download',
  backpack: 'https://backpack.app/download',
  solflare: 'https://www.solflare.com/download/',
};
export function WalletList({
  disabled,
  selected,
  onConnect,
}: {
  disabled: boolean;
  selected?: string;
  onConnect: (wallet: string) => void;
}) {
  const [available, setAvailable] = useState<ReturnType<
    typeof walletAvailability
  > | null>(null);
  const [help, setHelp] = useState('');
  const [mobile, setMobile] = useState(false);
  const [launchIntent, setLaunchIntent] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const launchLock = useRef(false);
  const mounted = useRef(true);
  const [handoffError, setHandoffError] = useState('');
  useEffect(() => {
    const update = () => {
      setMobile(
        isMobileBrowser(
          navigator.userAgent,
          navigator.platform,
          navigator.maxTouchPoints,
        ),
      );
      setLaunchIntent(walletLaunchIntent(window.location.href));
      setAvailable(walletAvailability());
    };
    const timeout = setTimeout(update, 0);
    const unsubscribe = subscribeWallets(update);
    // Also refresh after the browser returns from enabling an extension.
    window.addEventListener('focus', update);
    return () => {
      clearTimeout(timeout);
      unsubscribe();
      window.removeEventListener('focus', update);
    };
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function chooseWallet(id: string) {
    if (disabled || launchLock.current) return;
    launchLock.current = true;
    setHandoffError('');
    try {
      // Read the current environment at the click. A Home Screen app may have
      // suspended this same picker while a different wallet finished signing.
      const standalone = window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const mobileNow = isMobileBrowser(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
      const intent = walletLaunchIntent(window.location.href);
      if (mobileNow && (standalone || intent !== id)) {
        setLaunching(id);
        const needsTransfer = standalone || (!intent && !walletHandoffId(window.location.href));
        let handoffId: string | undefined;
        if (needsTransfer) {
          // Every launch gets a new one-use ID and secret. Never reuse a flow
          // cached by a mounted picker, local storage, or a previous wallet.
          const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
            byte.toString(16).padStart(2, '0')).join('');
          const flow = await api<{ id: string; expiresAt: number }>('community/handoff/start', { secret });
          if (!mounted.current) return;
          localStorage.setItem(WALLET_HANDOFF_KEY, JSON.stringify({ ...flow, secret }));
          handoffId = flow.id;
        } else {
          handoffId = activeWalletReturnContext(sessionStorage, window.location.href)?.id || undefined;
        }
        const walletUrl = walletBrowserLink(id, window.location.href, handoffId);
        if (walletUrl) {
          window.location.assign(walletUrl);
          return;
        }
      }
      const latest = walletAvailability().find(w => w.id === id);
      if (latest?.state !== 'detected') { setHelp(id); return; }
      setHelp('');
      onConnect(id);
    } catch {
      if (mounted.current) setHandoffError('Could not open your wallet. Please try again.');
    } finally {
      launchLock.current = false;
      if (mounted.current) setLaunching(null);
    }
  }
  return (
    <div className="wallet-list" aria-label="Choose a Solana wallet">
      {(['phantom', 'backpack', 'solflare'] as const).map((id) => {
        const state = available?.find((w) => w.id === id)?.state;
        return (
          <Button
            key={id}
            variant="ghost"
            className="wallet-option"
            disabled={disabled || launching !== null}
            onClick={() => chooseWallet(id)}
          >
            <Image src={icons[id]} alt="" width={44} height={44} unoptimized />
            <span className="wallet-option-name">{labels[id]}</span>
            <span className="wallet-detected">
              {(disabled && selected === id) || launching === id ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : mobile && launchIntent !== id ? (
                'Open app'
              ) : state === 'detected' ? (
                'Detected'
              ) : state === 'ambiguous' ? (
                'Check extensions'
              ) : state ? (
                'Not detected'
              ) : (
                'Checking…'
              )}
            </span>
            <ChevronRight size={19} />
          </Button>
        );
      })}
      {handoffError && <p role="alert" className="error">{handoffError}</p>}
      {help && (
        <div className="wallet-browser-help" role="alert">
          <strong>
            {labels[help as keyof typeof labels]} isn’t ready in this browser.
          </strong>
          <p>
            On desktop, open this site in a browser with the{' '}
            {labels[help as keyof typeof labels]} extension enabled, or in that
            wallet’s mobile browser.
          </p>
          <a href={websites[help]} target="_blank" rel="noopener noreferrer">
            Get {labels[help as keyof typeof labels]} <ArrowUpRight size={15} />
          </a>
        </div>
      )}
    </div>
  );
}
