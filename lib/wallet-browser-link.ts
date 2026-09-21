const MOBILE_WALLET_BROWSE_BASE: Record<string, string> = {
  backpack: 'https://backpack.app/ul/v1/browse/',
  phantom: 'https://phantom.app/ul/browse/',
  solflare: 'https://solflare.com/ul/v1/browse/',
};
const WALLET_LAUNCH_PARAM = 'float_wallet';

export function walletLaunchIntent(currentUrl: string) {
  try {
    const intent = new URL(currentUrl).searchParams.get(WALLET_LAUNCH_PARAM);
    return intent && Object.hasOwn(MOBILE_WALLET_BROWSE_BASE, intent)
      ? intent
      : null;
  } catch {
    return null;
  }
}

export function isMobileBrowser(
  userAgent: string,
  platform = '',
  maxTouchPoints = 0,
) {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  );
}

export function walletBrowserLink(wallet: string, currentUrl: string, handoffId?: string) {
  const base = Object.hasOwn(MOBILE_WALLET_BROWSE_BASE, wallet)
    ? MOBILE_WALLET_BROWSE_BASE[wallet]
    : null;
  if (!base) return null;
  let page: URL;
  try {
    page = new URL(currentUrl);
  } catch {
    return null;
  }
  if (page.protocol !== 'https:' && page.hostname !== 'localhost') return null;
  page.hash = '';
  page.searchParams.set(WALLET_LAUNCH_PARAM, wallet);
  if (handoffId) {
    // Always land on the authentication owner, including launches from /markets.
    page.pathname = `/wallet/connect/${handoffId}`;
    page.searchParams.set('float_handoff', handoffId);
    page.searchParams.set('join', '1');
  }
  return `${base}${encodeURIComponent(page.href)}?ref=${encodeURIComponent(page.origin)}`;
}
