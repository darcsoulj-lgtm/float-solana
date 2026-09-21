export const WALLET_HANDOFF_KEY = 'float-wallet-handoff';
export const WALLET_HANDOFF_PARAM = 'float_handoff';
export const WALLET_HANDOFF_MS = 10 * 60 * 1000;

export type WalletHandoff = {
  id: string;
  secret: string;
  expiresAt: number;
};

export function walletHandoffId(currentUrl: string) {
  try {
    const id = new URL(currentUrl).searchParams.get(WALLET_HANDOFF_PARAM);
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
