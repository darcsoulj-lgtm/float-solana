export type HoldingWallets = { issuer: string; wallets: number; tokens: number; startedAt: number; checkedAt: number; registryHash: string };
export function parseHolderSnapshot(value: unknown, now = Date.now()): HoldingWallets[] | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || data.chain !== 'solana' || data.method !== 'positive-owner-union-v1' || !Array.isArray(data.issuers) || data.issuers.length !== 3) return null;
  const seen = new Set<string>();
  for (const row of data.issuers) {
    if (!row || typeof row.registryHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.registryHash) || !['backpack', 'xstocks', 'ondo'].includes(row.issuer) || seen.has(row.issuer) ||
      !Number.isSafeInteger(row.wallets) || row.wallets < 0 || !Number.isSafeInteger(row.tokens) || row.tokens < 1 ||
      !Number.isSafeInteger(row.startedAt) || !Number.isSafeInteger(row.checkedAt) || row.startedAt <= 0 ||
      row.checkedAt < row.startedAt || row.checkedAt - row.startedAt > 86400000 || row.checkedAt > now + 60000) return null;
    seen.add(row.issuer);
  }
  return data.issuers.map(({issuer, wallets, tokens, startedAt, checkedAt, registryHash}: HoldingWallets) => ({issuer, wallets, tokens, startedAt, checkedAt, registryHash}));
}
export function retainHolderSnapshot(previous: HoldingWallets[] | null, incoming: unknown, now = Date.now()) {
  const next = parseHolderSnapshot(incoming, now);
  if (!next) return previous;
  if (previous && next.some(row => row.checkedAt < (previous.find(old => old.issuer === row.issuer)?.checkedAt ?? 0))) return previous;
  return next;
}
