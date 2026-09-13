import { TOKENS, type StockToken } from './tokens';

export type RegistryStatus = {
  additions: StockToken[];
  checkedAt: number | null;
  refreshing: boolean;
  delayed: boolean;
};

// Append only: existing market page boundaries and mint identities remain stable.
// This accepts DTOs from our verified registry, never wallet-provided metadata.
export function registryTokens(
  registry?: Pick<RegistryStatus, 'additions'> | null,
): readonly StockToken[] {
  if (!Array.isArray(registry?.additions) || !registry.additions.length)
    return TOKENS;
  const symbols = new Set(TOKENS.map((t) => t.symbol));
  const mints = new Set(TOKENS.map((t) => t.mint));
  const extra: StockToken[] = [];
  for (const t of registry.additions) {
    if (
      !t ||
      t.issuer !== 'backpack' ||
      typeof t.symbol !== 'string' ||
      !/^[A-Z][A-Z0-9.-]{0,15}$/.test(t.symbol) ||
      typeof t.mint !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t.mint) ||
      typeof t.name !== 'string' ||
      typeof t.shortName !== 'string' ||
      t.underlyingSymbol !== t.symbol ||
      t.source !== 'https://api.backpack.exchange/api/v1/assets' ||
      symbols.has(t.symbol) ||
      mints.has(t.mint)
    )
      continue;
    symbols.add(t.symbol);
    mints.add(t.mint);
    extra.push(t);
  }
  return [...TOKENS, ...extra];
}
