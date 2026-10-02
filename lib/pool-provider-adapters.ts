import { parsePools, type Pool } from './market-data';
import type { StockToken } from './tokens';
import type { StonkfunPoolIdentity } from './stock-pools';

export type PoolProvider =
  | 'dexscreener'
  | 'geckoterminal'
  | 'orca'
  | 'raydium'
  | 'meteora'
  | 'meteora-damm-v1'
  | 'meteora-damm-v2'
  | 'byreal'
  | 'pancakeswap';
export const POOL_PROVIDERS: readonly PoolProvider[] = [
  'dexscreener',
  'geckoterminal',
  'orca',
  'raydium',
  'meteora',
  'meteora-damm-v1',
  'meteora-damm-v2',
  'byreal',
  'pancakeswap',
];
export function isDirectPoolSource(pool: Pick<Pool, 'dex' | 'source'>) {
  return (
    pool.source != null &&
    (pool.source === pool.dex ||
      (pool.dex === 'meteora' && pool.source.startsWith('meteora-damm-')) ||
      (pool.dex === 'pancakeswap-v3-solana' && pool.source === 'pancakeswap'))
  );
}
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
  const byreal = obj(root.result);
  const rows =
    provider === 'meteora-damm-v1' && Array.isArray(raw)
      ? raw
      : provider === 'byreal'
        ? Array.isArray(obj(byreal.data).records)
          ? obj(byreal.data).records
          : [byreal.data]
        : provider === 'raydium'
          ? Array.isArray(root.data)
            ? root.data
            : obj(root.data).data
          : root.data;
  if (
    !Array.isArray(rows) ||
    ((provider === 'raydium' || provider === 'pancakeswap') &&
      root.success !== true) ||
    (provider === 'byreal' &&
      (root.retCode !== 0 || byreal.success !== true || byreal.ret_code !== 0))
  )
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
    if (provider === 'raydium' || provider === 'pancakeswap')
      return {
        chainId:
          obj(p.mintA).chainId === 101 && obj(p.mintB).chainId === 101
            ? 'solana'
            : '',
        pairAddress: p.id,
        dexId: provider === 'raydium' ? 'raydium' : 'pancakeswap-v3-solana',
        baseToken: { address: obj(p.mintA).address },
        quoteToken: { address: obj(p.mintB).address },
        liquidity: { usd: number(p.tvl) },
        volume: { h24: number(obj(p.day).volume) },
      };
    if (provider === 'byreal')
      return {
        chainId: 'solana',
        pairAddress: p.poolAddress,
        dexId: 'byreal',
        baseToken: { address: obj(obj(p.mintA).mintInfo).address },
        quoteToken: { address: obj(obj(p.mintB).mintInfo).address },
        liquidity: { usd: number(p.tvl) },
        volume: { h24: number(p.volumeUsd24h) },
      };
    if (provider === 'meteora-damm-v1')
      return {
        chainId: 'solana',
        pairAddress: p.pool_address,
        dexId: 'meteora',
        baseToken: {
          address:
            Array.isArray(p.pool_token_mints) && p.pool_token_mints.length === 2
              ? p.pool_token_mints[0]
              : null,
        },
        quoteToken: {
          address:
            Array.isArray(p.pool_token_mints) && p.pool_token_mints.length === 2
              ? p.pool_token_mints[1]
              : null,
        },
        liquidity: { usd: number(p.pool_tvl) },
        volume: { h24: number(p.trading_volume) },
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
  return (
    pool.volume24h === 0 &&
    !!previous &&
    ((previous.volume24h ?? 0) > 0 || previous.volumeDisputed === true) &&
    !isDirectPoolSource(pool)
  );
}

export function resolvePoolSources(
  candidates: readonly Pool[],
  known: readonly Pool[],
  token: StockToken,
  now = Date.now(),
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
    const sameSource = group.findIndex((prior) => prior.source === p.source);
    if (sameSource < 0) group.push(p);
    else if ((p.observedAt ?? 0) >= (group[sameSource].observedAt ?? 0))
      group[sameSource] = p;
    groups.set(p.address, group);
  }
  const priority = ['dexscreener', 'geckoterminal'];
  const current = (p: Pool) =>
    p.observedAt != null && p.observedAt <= now && now - p.observedAt <= 300000;
  const out: Pool[] = [];
  for (const pools of groups.values()) {
    pools.sort(
      (a, b) =>
        Number(a.volume24h == null) - Number(b.volume24h == null) ||
        Number(current(b)) - Number(current(a)) ||
        Number(isDirectPoolSource(b)) - Number(isDirectPoolSource(a)) ||
        priority.indexOf(a.source ?? 'dexscreener') -
          priority.indexOf(b.source ?? 'dexscreener'),
    );
    const chosen = { ...pools[0] };
    const comparable = pools.some(current) ? pools.filter(current) : pools;
    const amounts = comparable
      .filter((p) => p.volume24h != null)
      .map((p) => p.volume24h!);
    const low = Math.min(...amounts),
      high = Math.max(...amounts);
    // Material disagreement is not resolved by picking the largest number.
    const conflicting =
      amounts.length > 1 &&
      ((low === 0 && high >= 1) ||
        (high - low > 1000 && high - low > high * 0.25));
    const unconfirmedZero =
      needsZeroConfirmation(chosen, knownByAddress.get(chosen.address)) &&
      !pools.some(
        (p) => p.volume24h === 0 && isDirectPoolSource(p) && current(p),
      );
    if (conflicting || unconfirmedZero) {
      chosen.volume24h = null;
      chosen.volumeDisputed = true;
    }
    // Direct venue volume APIs need not expose USD prices. Preserve a separate,
    // current indexer price for the same verified pool without changing volume.
    const priced = pools.find((p) => current(p) && p.price != null);
    if (chosen.price == null && priced) {
      chosen.price = priced.price;
      chosen.change24h = priced.change24h;
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
