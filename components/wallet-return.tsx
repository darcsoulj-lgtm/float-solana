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
        <ArrowLeft size={18} aria-hidden="true" /> Return to Float app
      </Button>
      <Button variant="outline" onClick={onContinue}>Continue in wallet</Button>
    </div>
    <span className="wallet-return-hint">Returning to the app requires a manual switch.</span>
    {instructions && <div id="wallet-return-instructions" className="wallet-return-instructions" aria-live="polite">
      <strong>Tap ‹ Float at the top-left of your screen.</strong>
      <p>Or open Float from your Home Screen.</p>
      <p>{linked ? 'Your app will finish signing in when you return.' : 'Start wallet connection from the Float app to sign in there.'}</p>
    </div>}
  </section>;
}
