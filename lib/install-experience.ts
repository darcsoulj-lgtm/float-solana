export type InstallDevice = 'ios' | 'android' | 'desktop';
export function installEnvironment(userAgent: string, platform: string, touchPoints: number) {
  const device: InstallDevice = /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1)
    ? 'ios' : /Android/i.test(userAgent) ? 'android' : 'desktop';
  const embedded = /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|; wv\)|Phantom|Solflare|Backpack/i.test(userAgent);
  return { device, embedded };
}
export const INSTALL_VISIT_KEY = 'float-install-visit-v1';
export const INSTALL_DISMISS_KEY = 'float-install-dismissed-v1';
export const INSTALL_SHOWN_KEY = 'float-install-shown-v1';
export function canSuggestInstall(lastVisit: number, lastShown: number, now: number, dismissed: boolean) {
  return !dismissed && lastVisit > 0 && now - lastVisit >= 30 * 60_000 &&
    (lastShown === 0 || now - lastShown >= 7 * 86_400_000);
}
export function installReminderRoute(path: string, query: string) {
  const params = new URLSearchParams(query);
  return !/^\/(install|wallet|admin)(\/|$)/.test(path) && !params.has('join') && !params.has('float_handoff') && !params.has('float_wallet');
}
