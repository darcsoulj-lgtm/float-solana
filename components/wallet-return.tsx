'use client';
import { useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { FloatLogo } from './float-logo';
import { Button } from './ui/button';

export function WalletReturn({ linked, onContinue }: { linked: boolean; onContinue: () => void }) {
  const [instructions, setInstructions] = useState(false);
  return <section className="community-entry wallet-return" aria-label="Wallet verified">
    <FloatLogo />
    <span className="wallet-return-verified"><ShieldCheck size={18} aria-hidden="true" /> Wallet verified</span>
    <h1>Continue in Float</h1>
    <p>Choose where you’d like to continue.</p>
    <div className="wallet-return-actions">
      <Button onClick={() => setInstructions((value) => !value)} aria-expanded={instructions} aria-controls="wallet-return-instructions">
        <ArrowLeft size={18} aria-hidden="true" /> How to return to Float
      </Button>
      <Button variant="outline" onClick={onContinue}>Continue in wallet</Button>
    </div>
    <span className="wallet-return-hint">Return to the app or browser where you started connecting.</span>
    {instructions && <div id="wallet-return-instructions" className="wallet-return-instructions" aria-live="polite">
      <strong>Switch back to the app or browser you came from.</strong>
      <p>If you started from your Home Screen, reopen the Float app.</p>
      <p>{linked ? 'Your sign-in will finish on the original page when you return.' : 'To connect in another app or browser, start the connection there.'}</p>
    </div>}
  </section>;
}
