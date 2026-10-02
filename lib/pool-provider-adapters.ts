import { parsePools, type Pool } from './market-data';
import type { StockToken } from './tokens';
import type { StonkfunPoolIdentity } from './stock-pools';

export type PoolProvider =
  | 'dexscreener'
  | 'geckoterminal'
  | 'orca'
  | 'raydium'
  | 'meteora';
type Row = Record<string, unknown>;
const obj = (v: unknown): Row =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
const number = (v: unknown) =>
  (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) &&
  Number.isFinite(Number(v)) &&
  Number(v) >= 0
    ? Number(v)
    : null;
const venue = (v: unknown) => {
  const name = id(v);
  return name.startsWith('raydium')
    ? 'raydium'
    : name.startsWith('meteora')
      ? 'meteora'
      : name;
};
const id = (v: unknown) =>
  typeof v === 'string' ? v.replace(/^solana_/, '') : '';

// Normalize provider data into the existing exact-mint/pool eligibility policy.
// Never use token-level aggregate volume or add two providers for one pool.
export function parseProviderPools(
  provider: Exclude<PoolProvider, 'dexscreener'>,
  raw: unknown,
  tokens: readonly StockToken[],
  verified: readonly StockToken[],
  official: readonly StonkfunPoolIdentity[],
  now: number,
): Record<string, Pool[]> {
  const root = obj(raw);
  const rows =
    provider === 'raydium'
      ? Array.isArray(root.data)
        ? root.data
        : obj(root.data).data
      : root.data;
  if (!Array.isArray(rows) || (provider === 'raydium' && root.success !== true))
    throw Error(`Invalid ${provider} pool response`);
  const normalized = rows.map((value) => {
    const p = obj(value);
    if (provider === 'geckoterminal') {
      const a = obj(p.attributes),
        rel = obj(p.relationships);
      if (typeof p.id !== 'string' || !p.id.startsWith('solana_')) return {};
      return {
        chainId: 'solana',
        pairAddress: a.address,
        dexId: venue(obj(obj(rel.dex).data).id),
        baseToken: { address: id(obj(obj(rel.base_token).data).id) },
        quoteToken: { address: id(obj(obj(rel.quote_token).data).id) },
        priceUsd: a.base_token_price_usd,
        liquidity: { usd: number(a.reserve_in_usd) },
        volume: { h24: number(obj(a.volume_usd).h24) },
      };
    }
    if (provider === 'orca')
      return {
        chainId: 'solana',
        pairAddress: p.address,
        dexId: 'orca',
        baseToken: { address: p.tokenMintA },
        quoteToken: { address: p.tokenMintB },
        // Orca's price is a token ratio, not USD. Do not use it as a stock price.
        liquidity: { usd: number(p.tvlUsdc) },
        volume: { h24: number(obj(obj(p.stats)['24h']).volume) },
      };
    if (provider === 'raydium')
      return {
        chainId:
          obj(p.mintA).chainId === 101 && obj(p.mintB).chainId === 101
            ? 'solana'
            : '',
        pairAddress: p.id,
        dexId: 'raydium',
        baseToken: { address: obj(p.mintA).address },
        quoteToken: { address: obj(p.mintB).address },
        liquidity: { usd: number(p.tvl) },
        volume: { h24: number(obj(p.day).volume) },
      };
    return {
      chainId: 'solana',
      pairAddress: p.address,
      dexId: 'meteora',
      baseToken: { address: obj(p.token_x).address },
      quoteToken: { address: obj(p.token_y).address },
      liquidity: { usd: number(p.tvl) },
      volume: { h24: number(obj(p.volume)['24h']) },
    };
  });
  const parsed = parsePools(normalized, tokens, verified, official);
  for (const pools of Object.values(parsed))
    for (const pool of pools) {
      pool.source = provider;
      pool.observedAt = now;
    }
  return parsed;
}

// Indexer zero after observed activity needs a venue check. Keep the disputed
// marker across failed cycles so the next refresh still retries that address.
export function needsZeroConfirmation(pool: Pool, previous: Pool | undefined) {
  return pool.volume24h === 0 && !!previous &&
    ((previous.volume24h ?? 0) > 0 || previous.volumeDisputed === true) &&
    pool.source !== pool.dex;
}

export function resolvePoolSources(
  candidates: readonly Pool[],
  known: readonly Pool[],
  token: StockToken,
): Pool[] {
  const knownByAddress = new Map(known.map((p) => [p.address, p]));
  const knownAddresses = new Set(knownByAddress.keys());
  const groups = new Map<string, Pool[]>();
  for (const p of candidates) {
    if (p.unavailable || (p.volume24h == null && p.liquidity == null)) continue;
    if (
      p.volume24h === 0 &&
      p.liquidity === 0 &&
      !knownAddresses.has(p.address)
    )
      continue;
    const group = groups.get(p.address) ?? [];
    group.push(p);
    groups.set(p.address, group);
  }
  const priority: PoolProvider[] = [
    'dexscreener',
    'geckoterminal',
    'orca',
    'raydium',
    'meteora',
  ];
  const out: Pool[] = [];
  for (const pools of groups.values()) {
    pools.sort(
      (a, b) =>
        Number(a.volume24h == null) - Number(b.volume24h == null) ||
        priority.indexOf(a.source ?? 'dexscreener') -
          priority.indexOf(b.source ?? 'dexscreener'),
    );
    const chosen = { ...pools[0] };
    const amounts = pools
      .filter((p) => p.volume24h != null)
      .map((p) => p.volume24h!);
    const low = Math.min(...amounts),
      high = Math.max(...amounts);
    // Material disagreement is not resolved by picking the largest number.
    const conflicting = amounts.length > 1 && ((low === 0 && high >= 1) ||
      (high - low > 1000 && high - low > high * 0.25));
    const unconfirmedZero = needsZeroConfirmation(chosen, knownByAddress.get(chosen.address)) &&
      !pools.some(p => p.volume24h === 0 && p.source === p.dex);
    if (conflicting || unconfirmedZero) {
      chosen.volume24h = null;
      chosen.volumeDisputed = true;
    }
    out.push(chosen);
  }
  for (const p of new Map(known.map((p) => [p.address, p])).values()) {
    if (
      (p.baseMint === token.mint || p.quoteMint === token.mint) &&
      !groups.has(p.address)
    )
      out.push({
        ...p,
        unavailable: true,
        price: null,
        change24h: null,
        liquidity: null,
        volume24h: null,
      });
  }
  return out.sort((a, b) => (b.liquidity ?? -1) - (a.liquidity ?? -1));
}
