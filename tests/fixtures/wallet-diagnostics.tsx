'use client';
import { useState } from 'react';
import { getWallets } from '@wallet-standard/app';
import { selectedWallet } from '@/lib/wallet-provider';
type Provider = Record<string, unknown>;
export default function Diagnostics() {
  const [result, setResult] = useState('');
  return (
    <main>
      <h1>Local wallet diagnostics</h1>
      <button
        onClick={() => {
          const w = window as unknown as {
            phantom?: { solana?: Provider };
            backpack?: Provider;
            solflare?: Provider;
            solana?: Provider;
          };
          const providers = {
            phantom: w.phantom?.solana,
            backpack: w.backpack,
            solflare: w.solflare,
            shared: w.solana,
          };
          setResult(
            JSON.stringify(
              Object.fromEntries(
                Object.entries(providers).map(
                  ([name, p]: [string, Provider | undefined]) => [
                    name,
                    {
                      present: !!p,
                      isPhantom: p?.isPhantom,
                      isBackpack: p?.isBackpack,
                      isSolflare: p?.isSolflare,
                      connect: typeof p?.connect,
                      signMessage: typeof p?.signMessage,
                      sameAsBackpack: p === w.backpack,
                      signSameAsBackpack:
                        p?.signMessage === w.backpack?.signMessage,
                      connectSameAsBackpack: p?.connect === w.backpack?.connect,
                      signSource: String(p?.signMessage).slice(0, 1800),
                      connectSource: String(p?.connect).slice(0, 1200),
                    },
                  ],
                ),
              ),
              null,
              2,
            ),
          );
        }}
      >
        Inspect installed providers
      </button>
      <button
        onClick={async () => {
          try {
            const p = selectedWallet('phantom');
            setResult('Connecting Phantom');
            await p.connect();
            setResult('Requesting Phantom test message');
            await p.signMessage(
              new TextEncoder().encode(
                'HolderPulse local QA. This test message grants no access or permissions. Nonce: ' +
                  crypto.randomUUID(),
              ),
            );
            setResult('Signature received');
          } catch (e) {
            setResult(String(e));
          }
        }}
      >
        Request Phantom test message
      </button>
      <button
        onClick={() =>
          setResult(
            JSON.stringify(
              getWallets()
                .get()
                .map((w) => ({
                  name: w.name,
                  chains: w.chains,
                  features: Object.keys(w.features),
                  connect: String(
                    (w.features['standard:connect'] as Record<string, unknown>)
                      ?.connect,
                  ).slice(0, 2500),
                  signMessage: String(
                    (
                      w.features['solana:signMessage'] as Record<
                        string,
                        unknown
                      >
                    )?.signMessage,
                  ).slice(0, 2500),
                })),
              null,
              2,
            ),
          )
        }
      >
        Inspect registered wallet identities
      </button>
      <pre>{result}</pre>
    </main>
  );
}
