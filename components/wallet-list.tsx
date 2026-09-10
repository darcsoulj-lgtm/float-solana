'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, ChevronRight, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import { walletAvailability, subscribeWallets } from '@/lib/wallet-provider';
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
  useEffect(() => {
    const update = () => setAvailable(walletAvailability());
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
  return (
    <div className="wallet-list" aria-label="Choose a Solana wallet">
      {(['phantom', 'backpack', 'solflare'] as const).map((id) => {
        const state = available?.find((w) => w.id === id)?.state;
        return (
          <Button
            key={id}
            variant="ghost"
            className="wallet-option"
            disabled={disabled}
            onClick={() => {
              const latest = walletAvailability().find((w) => w.id === id);
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
      {help && (
        <div className="wallet-browser-help" role="alert">
          <strong>
            {labels[help as keyof typeof labels]} isn’t ready in this browser.
          </strong>
          <p>
            Open this site in Chrome with the{' '}
            {labels[help as keyof typeof labels]} extension enabled, or in that
            wallet’s mobile browser. An app’s built-in browser may not have
            access to your extensions.
          </p>
          <a href={websites[help]} target="_blank" rel="noopener noreferrer">
            Get {labels[help as keyof typeof labels]} <ArrowUpRight size={15} />
          </a>
        </div>
      )}
    </div>
  );
}
