'use client';
import { useState } from 'react';
import { selectedWallet, walletLabel } from '@/lib/wallet-provider';
export default function ConnectionCheck() {
  const [result, setResult] = useState('');
  return (
    <main style={{ padding: 32 }}>
      <h1>Local wallet connection check</h1>
      <p>
        This check connects only. It never requests a signature or transaction.
      </p>
      {['phantom', 'backpack'].map((name) => (
        <button
          key={name}
          onClick={async () => {
            try {
              setResult('Connecting ' + walletLabel(name));
              const connection = selectedWallet(name);
              const result = await connection.connect();
              const address = result.publicKey.toString();
              setResult(
                walletLabel(name) +
                  ' connected: ' +
                  address.slice(0, 4) +
                  '…' +
                  address.slice(-4),
              );
            } catch (e) {
              setResult(String(e));
            }
          }}
        >
          {'Check ' + walletLabel(name) + ' connection only'}
        </button>
      ))}
      <output>{result}</output>
    </main>
  );
}
