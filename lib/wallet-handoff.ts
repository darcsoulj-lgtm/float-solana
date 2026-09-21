export const WALLET_HANDOFF_KEY = 'float-wallet-handoff';
export const WALLET_HANDOFF_PARAM = 'float_handoff';
export const WALLET_HANDOFF_MS = 10 * 60 * 1000;
export const WALLET_RETURN_KEY = 'float-wallet-return';
export type WalletReturn = { id: string | null; completed: boolean; expiresAt: number };

// This is navigation state only. The claim secret stays exclusively in the
// installed app; a completed flag never grants a session.
export function walletReturnContext(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, url: string, now = Date.now()): WalletReturn | null {
  let saved: WalletReturn | null = null;
  try {
    const value = JSON.parse(storage.getItem(WALLET_RETURN_KEY) || 'null') as WalletReturn | null;
    if (value && (value.id === null || /^[a-f0-9-]{36}$/.test(value.id)) &&
        typeof value.completed === 'boolean' && Number.isFinite(value.expiresAt) && value.expiresAt > now) saved = value;
  } catch { /* Storage may be unavailable in a wallet browser. */ }
  const id = walletHandoffId(url);
  const launched = ['phantom', 'backpack', 'solflare'].includes(new URL(url).searchParams.get('float_wallet') || '');
  const result = id ? saved?.id === id ? saved : { id, completed: false, expiresAt: now + WALLET_HANDOFF_MS }
    : saved || (launched ? { id: null, completed: false, expiresAt: now + WALLET_HANDOFF_MS } : null);
  try {
    if (result) storage.setItem(WALLET_RETURN_KEY, JSON.stringify(result));
    else storage.removeItem(WALLET_RETURN_KEY);
  } catch { /* The current page can still finish with its in-memory context. */ }
  return result;
}

export type WalletHandoff = {
  id: string;
  secret: string;
  expiresAt: number;
};

export function walletHandoffId(currentUrl: string) {
  try {
    const url = new URL(currentUrl);
    const id = /^\/wallet\/connect\/([a-f0-9-]{36})\/?$/.exec(url.pathname)?.[1] || url.searchParams.get(WALLET_HANDOFF_PARAM);
    return id && /^[a-f0-9-]{36}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function readWalletHandoff(storage: Pick<Storage, 'getItem' | 'removeItem'>, now = Date.now()): WalletHandoff | null {
  try {
    const value = storage.getItem(WALLET_HANDOFF_KEY);
    if (!value) return null;
    const flow = JSON.parse(value) as WalletHandoff;
    if (
      /^[a-f0-9-]{36}$/.test(flow.id) &&
      /^[a-f0-9]{64}$/.test(flow.secret) &&
      Number.isFinite(flow.expiresAt) &&
      flow.expiresAt > now
    ) return flow;
  } catch {
    // Discard damaged local state.
  }
  storage.removeItem(WALLET_HANDOFF_KEY);
  return null;
}
