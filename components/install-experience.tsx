'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { X, PlusSquare } from 'lucide-react';
import Link from './site-link';
import { canSuggestInstall, installEnvironment, installReminderRoute, INSTALL_DISMISS_KEY, INSTALL_SHOWN_KEY, INSTALL_VISIT_KEY, type InstallDevice } from '@/lib/install-experience';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type InstallState = { ready: boolean; installed: boolean; device: InstallDevice; embedded: boolean; available: boolean; install: () => Promise<void> };
const InstallContext = createContext<InstallState>({ ready: false, installed: false, device: 'desktop', embedded: false, available: false, install: async () => {} });
export const useInstall = () => useContext(InstallContext);

export function InstallProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState({ device: 'desktop' as InstallDevice, embedded: false });
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [reminder, setReminder] = useState(false);
  useEffect(() => {
    const env = installEnvironment(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    const display = window.matchMedia('(display-mode: standalone)');
    const standalone = () => display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); setReminder(false); try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch { /* Session-only installed state. */ } };
    const displayChanged = () => { setInstalled(standalone()); if (standalone()) setReminder(false); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', complete);
    display.addEventListener('change', displayChanged);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const initialize = setTimeout(() => {
      setEnvironment(env);
      setInstalled(standalone());
      setReady(true);
    try {
      const now = Date.now();
      const eligible = canSuggestInstall(Number(localStorage.getItem(INSTALL_VISIT_KEY)), Number(localStorage.getItem(INSTALL_SHOWN_KEY)), now, localStorage.getItem(INSTALL_DISMISS_KEY) === '1');
      localStorage.setItem(INSTALL_VISIT_KEY, String(now));
      if (eligible && !standalone() && env.device !== 'desktop' && installReminderRoute(location.pathname, location.search)) {
        timer = setTimeout(() => {
          if (standalone() || !installReminderRoute(location.pathname, location.search)) return;
          try { localStorage.setItem(INSTALL_SHOWN_KEY, String(Date.now())); } catch { /* Session-only reminder if storage changes. */ }
          setReminder(true);
        }, 12_000);
      }
    } catch { /* Never nag when preferences cannot be saved. The menu still works. */ }
    }, 0);
    return () => {
      clearTimeout(initialize);
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', complete);
      display.removeEventListener('change', displayChanged);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    const event = prompt;
    setPrompt(null);
    try { await event.prompt(); if ((await event.userChoice).outcome === 'accepted') { setInstalled(true); dismiss(); } }
    catch { /* Instructions remain available if the browser declines. */ }
  }
  function dismiss() {
    setReminder(false);
    try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch { /* Hidden for this session. */ }
  }
  return <InstallContext.Provider value={{ ready, installed, ...environment, available: !!prompt, install }}>
    {children}
    {reminder && !installed && <aside className="install-reminder" aria-label="Add Float to your home screen">
      <PlusSquare size={20} aria-hidden="true" />
      <div><strong>Keep Float handy</strong><Link href="/install" onClick={event => { setReminder(false); if (prompt && !environment.embedded) { event.preventDefault(); void install(); } }}>Add to Home Screen</Link></div>
      <button type="button" onClick={dismiss} aria-label="Dismiss install reminder"><X size={18} /></button>
    </aside>}
  </InstallContext.Provider>;
}

export function InstallEntry() {
  const { installed, available, embedded, install } = useInstall();
  return installed ? null : <Link href="/install" onClick={event => { if (available && !embedded) { event.preventDefault(); void install(); } }}>Add to Home Screen</Link>;
}
