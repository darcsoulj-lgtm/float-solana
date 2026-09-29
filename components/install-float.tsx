'use client';
import { useState } from 'react';
import { Share, PlusSquare, MoreHorizontal, Check } from 'lucide-react';
import { useInstall } from './install-experience';
import { Button } from './ui/button';

export function InstallFloat() {
  const { ready, installed, device, embedded, available, install } = useInstall();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ready) return <output>Loading instructions…</output>;
  if (installed) return <output className="install-success"><Check size={20} aria-hidden="true" /> Float is installed. Open it from your home screen or app launcher.</output>;
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.origin); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); }
  }
  return <section className="install-guide" aria-label="Installation instructions">
    {embedded ? <>
      <h2>Open in {device === 'ios' ? 'Safari' : 'your browser'} first</h2>
      <p>This in-app browser may not support installation.</p>
      <ol>
        <li>Open this app’s <strong>⋯ menu</strong> and choose <strong>Open in browser</strong>, if available.</li>
        <li>Or copy the link and paste it into {device === 'ios' ? 'Safari' : 'Chrome'}.</li>
        <li>Choose <strong>Add to Home Screen</strong> on Float to continue.</li>
      </ol>
      <Button type="button" onClick={() => void copyLink()}>{copied ? 'Link copied' : 'Copy Float link'}</Button>
      <output>{copyFailed ? 'Copy this address: ' : ''}{copyFailed && <a href="https://joinfloat.xyz">joinfloat.xyz</a>}{copied && 'Paste the link into your browser.'}</output>
    </> : device === 'ios' ? <>
      <h2>Add Float on iPhone or iPad</h2>
      <p>In Safari, follow these three steps:</p>
      <ol className="install-steps">
        <li><Share aria-hidden="true" /><span>Open the <strong>Share</strong> menu.</span></li>
        <li><PlusSquare aria-hidden="true" /><span>Choose <strong>Add to Home Screen</strong>.</span></li>
        <li><Check aria-hidden="true" /><span>Tap <strong>Add</strong>. Keep <strong>Open as Web App</strong> on if shown.</span></li>
      </ol>
    </> : <>
      <h2>{device === 'android' ? 'Add Float on Android' : 'Install Float on your computer'}</h2>
      {available ? <Button type="button" disabled={busy} onClick={async () => { setBusy(true); await install(); setBusy(false); }}>{busy ? 'Opening…' : 'Install Float'}</Button> : <>
        <p>{device === 'android' ? 'In Chrome:' : 'In Chrome or Edge:'}</p>
        <ol className="install-steps">
          <li><MoreHorizontal aria-hidden="true" /><span>Open the browser menu.</span></li>
          <li><PlusSquare aria-hidden="true" /><span>{device === 'android' ? <>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</> : <>Choose <strong>Install page as app</strong> in Chrome’s <strong>Cast, save, and share</strong> menu, or <strong>Apps → Install this site as an app</strong> in Edge.</>}</span></li>
        </ol>
        <p className="install-note">If the option is missing, open Float in a regular Chrome window.</p>
      </>}
    </>}
  </section>;
}
