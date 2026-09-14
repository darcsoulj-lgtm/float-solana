const MOBILE_WALLET_BROWSE_BASE: Record<string, string> = {
  backpack: 'https://backpack.app/ul/v1/browse/',
  phantom: 'https://phantom.app/ul/browse/',
  solflare: 'https://solflare.com/ul/v1/browse/',
};

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

export function walletBrowserLink(wallet: string, currentUrl: string) {
  const base = MOBILE_WALLET_BROWSE_BASE[wallet];
  if (!base) return null;
  let page: URL;
  try {
    page = new URL(currentUrl);
  } catch {
    return null;
  }
  if (page.protocol !== 'https:' && page.hostname !== 'localhost') return null;
  page.hash = '';
  return `${base}${encodeURIComponent(page.href)}?ref=${encodeURIComponent(page.origin)}`;
}
