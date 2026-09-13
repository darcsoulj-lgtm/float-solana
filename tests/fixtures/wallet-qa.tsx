'use client';
import { useEffect, useState } from 'react';
import { getWallets } from '@wallet-standard/app';
import { ed25519 } from '@noble/curves/ed25519.js';
import { Community } from '@/components/community';
export default function WalletQa() {
  const [ready, setReady] = useState(false),
    [events, setEvents] = useState<string[]>([]);
  useEffect(() => {
    const fixtures = ['Phantom', 'Backpack'].map((name) => {
      const key = ed25519.utils.randomSecretKey(),
        publicKey = ed25519.getPublicKey(key);
      let n = BigInt(
          '0x' +
            Array.from(publicKey)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(''),
        ),
        address = '';
      const alphabet =
        '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      while (n) {
        address = alphabet[Number(n % 58n)] + address;
        n /= 58n;
      }
      for (const b of publicKey) {
        if (b !== 0) break;
        address = '1' + address;
      }
      const account = {
        address,
        publicKey,
        chains: ['solana:mainnet'] as const,
        features: ['solana:signMessage'] as const,
      };
      return {
        version: '1.0.0' as const,
        name,
        icon: 'data:image/svg+xml;base64,PHN2Zy8+' as const,
        chains: ['solana:mainnet'] as const,
        accounts: [account],
        features: {
          'standard:connect': {
            version: '1.0.0',
            connect: async () => {
              setEvents((e) => [...e, name + ' connected (SIMULATED)']);
              return { accounts: [account] };
            },
          },
          'solana:signMessage': {
            version: '1.0.0',
            signMessage: async () => {
              setEvents((e) => [
                ...e,
                name + ' sign requested (SIMULATED, cancelled)',
              ]);
              throw new Error('Simulated ' + name + ' user cancellation');
            },
          },
        },
      };
    });
    const wallets = getWallets();
    const unsubscribe = wallets.on('register', () => setReady(true));
    const cleanup = wallets.register(...fixtures);
    return () => {
      unsubscribe();
      cleanup();
    };
  }, []);
  return (
    <>
      <section style={{ padding: 24, background: '#fff3cd' }}>
        <h1>LOCAL QA — simulated wallets only</h1>
        <p>No extensions, signatures, or funds are used.</p>
        <output aria-label="Wallet test events">{events.join(' | ')}</output>
      </section>
      {ready && <Community />}
    </>
  );
}
