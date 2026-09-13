import type { StockToken } from './tokens';
import type { Pool } from './market-data';

// Bump whenever eligibility changes: old broad snapshots must never be reused.
export const POOL_POLICY_VERSION = 'eligible-v1';
export const POOL_SCOPE =
  'Only verified tokenized stocks paired with SOL, USDC, USDT, USDG, PYUSD or another verified tokenized stock. Memecoin and unverified pairs are excluded.';

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
export function stockPoolPolicy(stocks: readonly StockToken[]) {
  const verified = new Map(stocks.map((t) => [t.mint, t.symbol]));
  const allowed = new Map<string, string>([
    ...POOL_SETTLEMENT_ASSETS.map((t) => [t.mint, t.symbol] as const),
    ...verified,
  ]);
  return {
    accepts: (base: string, quote: string) =>
      base !== quote &&
      allowed.has(base) &&
      allowed.has(quote) &&
      (verified.has(base) || verified.has(quote)),
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
