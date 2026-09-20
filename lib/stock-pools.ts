import type { StockToken } from './tokens';
import type { Pool } from './market-data';

// Bump whenever eligibility changes: old broad snapshots must never be reused.
export const POOL_POLICY_VERSION = 'stonkfun-v2';
export const POOL_SCOPE =
  'Verified stock pools with reviewed settlement assets or other verified stocks, plus pools pairing an official Stonkfun launch mint with its verified stock quote mint. Stonkfun-linked volume is launch-token trading against a stock token, not stock purchases. Each pool address is counted once; coverage is partial.';

export type StonkfunPoolIdentity = {
  address: string;
  launchMint: string;
  stockMint: string;
  symbol: string;
};

const solanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Exact launch and stock mints qualify, including migrated pools whose address
// differs from the original launch pool. A ticker is never sufficient evidence.
export function parseStonkfunPoolRegistry(
  raw: unknown,
  stocks: readonly StockToken[],
): StonkfunPoolIdentity[] {
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {};
  if (!Array.isArray(data.tokens)) throw new Error('Invalid Stonkfun pool registry');
  if (data.network !== undefined && data.network !== 'mainnet-beta')
    throw new Error('Unexpected Stonkfun network');
  const verified = new Set(stocks.map((stock) => stock.mint));
  const byAddress = new Map<string, StonkfunPoolIdentity>();
  for (const item of data.tokens) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const quote = row.quote && typeof row.quote === 'object' ? row.quote as Record<string, unknown> : {};
    if (
      typeof row.pool !== 'string' || !solanaAddress.test(row.pool) ||
      typeof row.mint !== 'string' || !solanaAddress.test(row.mint) ||
      typeof quote.mint !== 'string' || !verified.has(quote.mint) ||
      row.mint === quote.mint
    ) continue;
    byAddress.set(row.pool, {
      address: row.pool,
      launchMint: row.mint,
      stockMint: quote.mint,
      symbol: typeof row.symbol === 'string' && row.symbol.length <= 24 ? row.symbol : 'Stonkfun',
    });
  }
  return [...byAddress.values()];
}

// Mainnet mints checked against issuer documentation; symbols are display only.
// Sources and review procedure: docs/stock-pool-policy-2026-09-13.md.
export const POOL_SETTLEMENT_ASSETS = [
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
  { symbol: 'USDG', mint: '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH' },
  { symbol: 'PYUSD', mint: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo' },
] as const;

// Build once per provider response using the full verified registry, not its
// current request batch. A stock in another issuer/batch is still eligible.
export function stockPoolPolicy(
  stocks: readonly StockToken[],
  stonkfunPools: readonly StonkfunPoolIdentity[] = [],
) {
  const verified = new Map(stocks.map((t) => [t.mint, t.symbol]));
  const stonkfun = new Map(stonkfunPools.map((pool) => [
    `${pool.launchMint}:${pool.stockMint}`, pool,
  ]));
  const standard = new Map<string, string>([
    ...POOL_SETTLEMENT_ASSETS.map((t) => [t.mint, t.symbol] as const),
    ...verified,
  ]);
  const allowed = new Map<string, string>([
    ...standard,
    ...stonkfunPools.map((pool) => [pool.launchMint, pool.symbol] as const),
  ]);
  const isStonkfun = (base: string, quote: string) =>
    stonkfun.has(`${base}:${quote}`) || stonkfun.has(`${quote}:${base}`);
  return {
    isStonkfun,
    accepts: (base: string, quote: string) => {
      if (base === quote) return false;
      if (isStonkfun(base, quote)) return true;
      return standard.has(base) && standard.has(quote) &&
        (verified.has(base) || verified.has(quote));
    },
    symbol: (mint: string) => allowed.get(mint)!,
  };
}

export function poolMetrics(input: readonly Pool[]) {
  const pools = [...new Map(input.map((p) => [p.address, p])).values()];
  const sum = (key: 'volume24h' | 'liquidity') => {
    const values = pools
      .map((p) => p[key])
      .filter(
        (n): n is number =>
          typeof n === 'number' && Number.isFinite(n) && n >= 0,
      );
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  return { pools, volume24h: sum('volume24h'), liquidity: sum('liquidity') };
}
