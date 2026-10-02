import { fetchPools, stonkfunPoolRegistry, type Pool } from './market-data';
import {
  parseProviderPools,
  resolvePoolSources,
  needsZeroConfirmation,
  type PoolProvider,
} from './pool-provider-adapters';
import type { PoolRequest } from './pool-provider-fetch';
import type { StockToken } from './tokens';
import type { StonkfunPoolIdentity } from './stock-pools';

const chunks = <T>(rows: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );
function rotate<T>(rows: T[], take: number, cycle: number): T[] {
  if (!rows.length) return [];
  return Array.from(
    { length: Math.min(take, rows.length) },
    (_, i) => rows[(cycle * take + i) % rows.length],
  );
}
export async function collectPoolFallbacks(options: {
  tokens: readonly StockToken[];
  verified: readonly StockToken[];
  known: readonly Pool[];
  detailMints: string[];
  primary: typeof fetch;
  request: PoolRequest;
  dexAvailable: boolean;
  now?: number;
  primaryFailure?: (error: unknown) => Promise<void>;
  mode?: 'refresh' | 'discovery';
  discoveryObserved?: (mint: string, now: number) => Promise<void>;
  recent?: readonly Pool[];
}) {
  const { tokens, verified, known, detailMints, request } = options;
  if (known.some(p => !p.baseMint || !p.quoteMint)) throw Error('Unverified legacy pool identity');
  const now = options.now ?? Date.now(),
    cycle = Math.floor(now / 240000);
  // Prior server-verified Stonkfun identities remain eligible during registry downtime.
  const oldOfficial: StonkfunPoolIdentity[] = known
    .filter((p) => p.origin === 'stonkfun' && p.baseMint && p.quoteMint)
    .flatMap((p) => {
      const baseStock = verified.some((t) => t.mint === p.baseMint),
        quoteStock = verified.some((t) => t.mint === p.quoteMint);
      return baseStock === quoteStock
        ? []
        : [
            {
              address: p.address,
              stockMint: (baseStock ? p.baseMint : p.quoteMint)!,
              launchMint: (baseStock ? p.quoteMint : p.baseMint)!,
              symbol: p.quote,
            },
          ];
    });
  const official = stonkfunPoolRegistry(options.primary, verified).then(rows => [...oldOfficial, ...rows]);
  const candidates: Record<string, Pool[]> = {};
  const observed = new Set<string>();
  // Discovery already obtained a real observation. A later throttled refresh
  // must not discard it. Only original, still-current observations qualify.
  for (const token of tokens) {
    const recent = (options.recent ?? []).filter(p =>
      (p.baseMint === token.mint || p.quoteMint === token.mint) && !p.unavailable && !p.volumeDisputed &&
      p.observedAt != null && p.observedAt <= now && now - p.observedAt < 300000);
    if (recent.length) { candidates[token.symbol] = [...recent]; observed.add(token.symbol); }
  }
  const failures: Partial<Record<PoolProvider, number>> = {};
  async function primaryFailure(error: unknown) {
    failures.dexscreener = (failures.dexscreener ?? 0) + 1;
    await options.primaryFailure?.(error);
  }
  const primary = (async () => {
    if (!options.dexAvailable) return;
    try {
      const data = await fetchPools(options.primary, tokens, verified, {
        knownPools: options.mode === 'discovery' ? [] : [...known],
        detailMints,
        isolateMissing: true,
        onFailure: primaryFailure,
      });
      for (const [symbol, pools] of Object.entries(data)) {
        const valid = pools.filter(p => !p.unavailable);
        candidates[symbol] = [...(candidates[symbol] ?? []),
          ...valid.map(p => ({ ...p, source: 'dexscreener' as const, observedAt: now }))];
        if (valid.length) observed.add(symbol);
      }
    } catch (error) { await primaryFailure(error); }
  })();
  async function collect(
    provider: Exclude<PoolProvider, 'dexscreener'>,
    url: string,
    scope: readonly StockToken[] = tokens,
    single = false,
  ) {
    try {
      let raw = await request(provider, url);
      if (single && raw && typeof raw === 'object' && 'data' in raw)
        raw = { ...raw, data: [(raw as { data: unknown }).data] };
      const parsed = parseProviderPools(
        provider,
        raw,
        scope,
        verified,
        await official,
        Date.now(),
      );
      for (const [symbol, pools] of Object.entries(parsed)) {
        candidates[symbol] = [...(candidates[symbol] ?? []), ...pools];
        if (pools.length) observed.add(symbol);
      }
      if (provider === 'geckoterminal' && url.includes('/tokens/') && scope.length === 1)
        await options.discoveryObserved?.(scope[0].mint, Date.now());
      // An empty search for a new token may be real, but never certifies all-pool completeness.
    } catch {
      failures[provider] = (failures[provider] ?? 0) + 1;
    }
  }
  const uniqueKnown = [...new Map(known.map((p) => [p.address, p])).values()];
  const knownByAddress = new Map(uniqueKnown.map(p => [p.address, p]));
  const available = () =>
    new Set(
      Object.values(candidates)
        .flat()
        .filter((p) => p.volume24h != null && p.liquidity != null &&
          !needsZeroConfirmation(p, knownByAddress.get(p.address)))
        .map((p) => p.address),
    );
  const selected = tokens.filter(t => detailMints.includes(t.mint));
  // Venue requests start immediately with their own provider budgets. A slow
  // indexer must not consume the deadline before backups have even started.
  const venues = Promise.all([
    (async () => {
      const addresses = uniqueKnown.filter(p => p.dex === 'orca').map(p => p.address).slice(0, 100);
      if (addresses.length && options.mode !== 'discovery') await collect('orca',
        'https://api.orca.so/v2/solana/pools?addresses=' + addresses.join(',') + '&stats=24h&size=100');
      for (const t of selected) await collect('orca',
        `https://api.orca.so/v2/solana/pools?token=${t.mint}&stats=24h&size=100`, [t]);
    })(),
    (async () => {
      const addresses = uniqueKnown.filter(p => p.dex === 'raydium').map(p => p.address).slice(0, 100);
      if (addresses.length && options.mode !== 'discovery') await collect('raydium',
        'https://api-v3.raydium.io/pools/info/ids?ids=' + addresses.join(','));
      for (const t of selected) await collect('raydium',
        `https://api-v3.raydium.io/pools/info/mint?mint1=${t.mint}&poolType=all&poolSortField=volume24h&sortType=desc&pageSize=100&page=1`, [t]);
    })(),
    (async () => {
      // A mint search refreshes all its DLMM pools in one call instead of
      // retrying just four addresses from a growing inventory.
      const wanted = selected.length ? selected : rotate(tokens.filter(t =>
        uniqueKnown.some(p => p.dex === 'meteora' && (p.baseMint === t.mint || p.quoteMint === t.mint))), 6, cycle);
      for (const t of wanted) {
        const pools = uniqueKnown.filter(p => p.dex === 'meteora' && (p.baseMint === t.mint || p.quoteMint === t.mint));
        if (!selected.length && pools.length === 1) await collect('meteora',
          'https://dlmm.datapi.meteora.ag/pools/' + pools[0].address, [t], true);
        else await collect('meteora',
          'https://dlmm.datapi.meteora.ag/pools?query=' + t.mint + '&page_size=100', [t]);
      }
    })(),
  ]);
  const gecko = (async () => {
    if (selected.length) {
      for (const token of selected) await collect('geckoterminal',
        `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${token.mint}/pools?page=1`, [token]);
      // One deeper page per discovery chunk, rotating both token and page.
      const deeper = selected[cycle % selected.length];
      await collect('geckoterminal',
        `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${deeper.mint}/pools?page=${2 + (cycle % 4)}`, [deeper]);
    } else {
      await primary;
      const absent = uniqueKnown.filter(p => !available().has(p.address));
      for (const batch of rotate(chunks(absent, 30), 4, cycle)) await collect('geckoterminal',
        'https://api.geckoterminal.com/api/v2/networks/solana/pools/multi/' + batch.map(p => p.address).join(','));
    }
  })();
  await Promise.all([primary, gecko, venues]);
  const result: Record<string, Pool[]> = {};
  for (const token of tokens) {
    if (!observed.has(token.symbol)) continue; // Every source failed: retain original token timestamp.
    result[token.symbol] = resolvePoolSources(
      candidates[token.symbol] ?? [],
      known,
      token,
    );
  }
  console.log('Pool provider coverage', {
    mode: options.mode ?? 'refresh',
    tokens: tokens.length,
    refreshed: Object.keys(result).length,
    unresolved: Object.values(result)
      .flat()
      .filter((p) => p.unavailable).length,
    disputed: Object.values(result)
      .flat()
      .filter((p) => p.volumeDisputed).length,
    failures,
  });
  if (!Object.keys(result).length)
    throw Error('No pool provider returned verified observations');
  return result;
}
