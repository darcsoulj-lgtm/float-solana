'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallFloat() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', complete);
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);
  if (installed) return <output>Float is installed.</output>;
  if (!prompt) return null;
  return <Button onClick={async () => {
    const event = prompt;
    setPrompt(null);
    try {
      await event.prompt();
      if ((await event.userChoice).outcome === 'accepted') setInstalled(true);
    } catch { /* The browser instructions below remain available. */ }
  }}>Install Float</Button>;
}
