'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, ChevronRight, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import { walletAvailability, subscribeWallets } from '@/lib/wallet-provider';
import { api } from '@/lib/client';
import { readWalletHandoff, walletHandoffId, WALLET_HANDOFF_KEY, type WalletHandoff } from '@/lib/wallet-handoff';
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
  const [installedApp, setInstalledApp] = useState(false);
  const [needsHandoff, setNeedsHandoff] = useState(false);
  const [handoff, setHandoff] = useState<WalletHandoff | null>(null);
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
    let active = true;
    const timeout = setTimeout(() => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setInstalledApp(standalone);
      // Any mobile browser has a separate cookie jar from the wallet browser.
      // Receiver pages reuse their incoming handoff instead of starting another.
      const needsTransfer = standalone || (isMobileBrowser(navigator.userAgent, navigator.platform, navigator.maxTouchPoints) &&
        !walletLaunchIntent(window.location.href) && !walletHandoffId(window.location.href));
      setNeedsHandoff(needsTransfer);
      if (!needsTransfer) return;
      const existing = readWalletHandoff(localStorage);
      if (existing) {
        setHandoff(existing);
        return;
      }
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, '0')).join('');
      void api<{ id: string; expiresAt: number }>('community/handoff/start', { secret })
        .then(({ id, expiresAt }) => {
          if (!active) return;
          const flow = { id, secret, expiresAt };
          localStorage.setItem(WALLET_HANDOFF_KEY, JSON.stringify(flow));
          setHandoff(flow);
        })
        .catch(() => {
          if (active) setHandoffError('Could not prepare wallet connection. Close and reopen this panel.');
        });
    }, 0);
    return () => { active = false; clearTimeout(timeout); };
  }, []);
  return (
    <div className="wallet-list" aria-label="Choose a Solana wallet">
      {(['phantom', 'backpack', 'solflare'] as const).map((id) => {
        const state = available?.find((w) => w.id === id)?.state;
        return (
          <Button
            key={id}
            variant="ghost"
            className="wallet-option"
            disabled={disabled || (needsHandoff && !handoff)}
            onClick={() => {
              const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                (navigator as Navigator & { standalone?: boolean }).standalone === true;
              if (needsHandoff && (!handoff || handoff.expiresAt <= Date.now())) {
                setHandoffError('Wallet connection expired. Close and reopen this panel.');
                return;
              }
              const latest = walletAvailability().find((w) => w.id === id);
              // Mobile wallet browsers can expose another wallet's provider.
              // First move through the selected wallet's own deep link, then
              // require its named provider before requesting a signature.
              if (mobile && (standalone || launchIntent !== id)) {
                const walletUrl = walletBrowserLink(id, window.location.href, needsHandoff ? handoff?.id : walletHandoffId(window.location.href) || undefined);
                if (walletUrl) {
                  window.location.assign(walletUrl);
                  return;
                }
              }
              if (latest?.state !== 'detected') {
                setHelp(id);
                return;
              }
              setHelp('');
              onConnect(id);
            }}
          >
            <Image src={icons[id]} alt="" width={44} height={44} unoptimized />
            <span className="wallet-option-name">{labels[id]}</span>
            <span className="wallet-detected">
              {disabled && selected === id ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : needsHandoff && !handoff ? (
                'Preparing…'
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
      {needsHandoff && handoff && <p className="wallet-handoff-note">{installedApp ? "After signing, reopen Float from your Home Screen." : "After signing, return to this page to finish connecting."}</p>}
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
