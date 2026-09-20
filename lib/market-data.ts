import { parseStonkfunPoolRegistry, stockPoolPolicy, type StonkfunPoolIdentity } from './stock-pools';
import { registryTokens, type RegistryStatus } from './token-registry';
import type { TokenMarket } from './cmc-data';
import type { IssuerCirculation } from './xstocks-circulation';
import type { MintSupply } from './token-supply';
import type { OndoValueSnapshot } from './ondo-valuation';
import {
  TOKENS,
  BACKPACK_TOKENS,
  TOKEN_REVIEW_DATE,
  type StockToken,
} from './tokens';
export const MARKET_REFRESH_MS = 60000;
// Pool snapshots are secondary price observations; four minutes lowers shared
// public-provider traffic while remaining inside the five-minute validity limit.
export const POOL_REFRESH_MS = 240000;
export const MARKET_MAX_AGE_MS = 300000;
export type SourceResult<T> = {
  data: T | null;
  fetchedAt: number | null;
  stale: boolean;
  error: string | null;
  asOf?: Record<string, number>;
  refreshing?: boolean;
};
export type Listing = {
  symbol: string;
  asset: string;
  deposit: boolean;
  withdraw: boolean;
  spot: string | null;
  bookState: string | null;
};
export const BACKPACK_TICKER_REFRESH_MS = 60000;
export type BackpackMarket = {
  market: string;
  externalPrice: number | null;
  externalChange24h: number | null;
  externalVolume24h: number | null;
  externalQuoteVolume24h: number | null;
  externalTrades: number | null;
  venueVolume24h: number | null;
  venueQuoteVolume24h: number | null;
  venueTrades: number | null;
};
export type Pool = {
  createdAt?: number | null;
  address: string;
  dex: string;
  quote: string;
  price: number | null;
  change24h: number | null;
  liquidity: number | null;
  volume24h: number | null;
  url: string;
  side?: 'base' | 'quote';
  baseMint?: string;
  quoteMint?: string;
  origin?: 'stonkfun';
};
export type TokenPrice = {
  price: number;
  timestamp: number;
  confidence: number | null;
};
export type TokenVolume = { usd24h: number; mint: string };
export type MarketOverview = {
  valuations?: SourceResult<OndoValueSnapshot>;
  registry?: RegistryStatus;
  totalBatches?: number;
  circulation?: SourceResult<Record<string, IssuerCirculation>>;
  history?: SourceResult<Record<string, TokenPrice>>;
  volumes?: SourceResult<Record<string, TokenVolume>>;
  supplies: SourceResult<Record<string, MintSupply>>;
  markets: SourceResult<Record<string, TokenMarket>>;
  backpack?: SourceResult<Record<string, BackpackMarket>>;
  catalog: SourceResult<Listing[]>;
  pools: SourceResult<Record<string, Pool[]>>;
  prices: SourceResult<Record<string, TokenPrice>>;
};
export type Book = {
  market: string;
  bid: number;
  ask: number;
  spreadBps: number;
  bidDepth1pct: number;
  askDepth1pct: number;
  timestamp: number;
};
const record = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
export function numeric(x: unknown): number | null {
  if (
    typeof x !== 'number' &&
    (typeof x !== 'string' || !/^[-+]?\d+(\.\d+)?$/.test(x))
  )
    return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
const positive = (x: unknown) => {
  const n = numeric(x);
  return n !== null && n > 0 ? n : null;
};
const nonnegative = (x: unknown) => {
  const n = numeric(x);
  return n !== null && n >= 0 ? n : null;
};
export function parseListings(
  assets: unknown,
  markets: unknown,
  tokens: readonly { symbol: string; mint: string }[] = BACKPACK_TOKENS,
): Listing[] {
  if (!Array.isArray(assets) || !Array.isArray(markets))
    throw new Error('Invalid registry response');
  return tokens.flatMap((token) => {
    const matches = assets.filter((a) =>
      list(record(a).tokens).some(
        (t) =>
          record(t).blockchain === 'Solana' &&
          record(t).contractAddress === token.mint,
      ),
    );
    if (matches.length !== 1) return [];
    const asset = record(matches[0]),
      match = list(asset.tokens)
        .map(record)
        .find(
          (t) => t.blockchain === 'Solana' && t.contractAddress === token.mint,
        )!;
    if (typeof asset.symbol !== 'string') return [];
    const books = markets
      .map(record)
      .filter(
        (m) =>
          m.baseSymbol === asset.symbol &&
          m.quoteSymbol === 'USDC' &&
          m.marketType === 'SPOT' &&
          m.rwaMarketType === 'STOCK' &&
          m.visible === true &&
          typeof m.symbol === 'string',
      );
    const book = books.length === 1 ? books[0] : null;
    return [
      {
        symbol: token.symbol,
        asset: asset.symbol,
        deposit: match.depositEnabled === true,
        withdraw: match.withdrawEnabled === true,
        spot: (book?.symbol as string) || null,
        bookState:
          typeof book?.orderBookState === 'string' ? book.orderBookState : null,
      },
    ];
  });
}

function tickerRows(raw: unknown) {
  if (!Array.isArray(raw)) throw new Error('Invalid Backpack ticker response');
  return raw.map(record).filter((row) => typeof row.symbol === 'string');
}

function tickerMap(
  raw: unknown,
  tokens: readonly StockToken[],
): Record<
  string,
  {
    market: string;
    price: number | null;
    change24h: number | null;
    volume24h: number | null;
    quoteVolume24h: number | null;
    trades: number | null;
  }
> {
  const result: Record<
    string,
    {
      market: string;
      price: number | null;
      change24h: number | null;
      volume24h: number | null;
      quoteVolume24h: number | null;
      trades: number | null;
    }
  > = {};
  for (const row of tickerRows(raw)) {
    const market = String(row.symbol);
    if (!/_USDC(?:_RFQ)?$/.test(market)) continue;
    const base = market.split('_')[0]?.replace(/\.US$/, ''),
      token = tokens.find((candidate) => candidate.symbol === base);
    if (!token || result[token.symbol]) continue;
    result[token.symbol] = {
      market,
      price: positive(row.lastPrice),
      change24h: numeric(row.priceChangePercent),
      volume24h: nonnegative(row.volume),
      quoteVolume24h: nonnegative(row.quoteVolume),
      trades: nonnegative(row.trades),
    };
  }
  return result;
}

export async function fetchBackpackMarkets(
  fetcher: typeof fetch = fetch,
  tokens: readonly StockToken[] = TOKENS.filter(
    (token) => token.issuer === 'backpack',
  ),
): Promise<Record<string, BackpackMarket>> {
  const load = (url: string) =>
    publicJson(url, fetcher).then((raw) => tickerMap(raw, tokens));
  const [external, venue] = await Promise.allSettled([
    load(
      'https://api.backpack.exchange/api/v1/tickers?interval=1d&source=External',
    ),
    load('https://api.backpack.exchange/api/v1/tickers?interval=1d'),
  ]);
  if (external.status === 'rejected' && venue.status === 'rejected') {
    throw external.reason instanceof Error
      ? external.reason
      : new Error('Backpack ticker unavailable');
  }
  const externalRows = external.status === 'fulfilled' ? external.value : {},
    venueRows = venue.status === 'fulfilled' ? venue.value : {},
    out: Record<string, BackpackMarket> = {};
  for (const token of tokens) {
    const e = externalRows[token.symbol],
      v = venueRows[token.symbol];
    if (!e && !v) continue;
    out[token.symbol] = {
      market: e?.market || v?.market || `${token.symbol}.US_USDC`,
      externalPrice: e?.price ?? null,
      externalChange24h: e?.change24h ?? null,
      externalVolume24h: e?.volume24h ?? null,
      externalQuoteVolume24h: e?.quoteVolume24h ?? null,
      externalTrades: e?.trades ?? null,
      venueVolume24h: v?.volume24h ?? null,
      venueQuoteVolume24h: v?.quoteVolume24h ?? null,
      venueTrades: v?.trades ?? null,
    };
  }
  return out;
}
export function parsePools(
  raw: unknown,
  tokens: readonly StockToken[] = TOKENS,
  verifiedStocks: readonly StockToken[] = TOKENS,
  stonkfunPools: readonly StonkfunPoolIdentity[] = [],
): Record<string, Pool[]> {
  if (!Array.isArray(raw)) throw new Error('Invalid pool response');
  const result: Record<string, Pool[]> = Object.fromEntries(
    tokens.map((t) => [t.symbol, []]),
  );
  const policy = stockPoolPolicy(verifiedStocks, stonkfunPools);
  const seen = new Set<string>();
  for (const value of raw) {
    const p = record(value),
      base = record(p.baseToken),
      quote = record(p.quoteToken);
    const matched = tokens.filter(
      (t) => t.mint === base.address || t.mint === quote.address,
    );
    if (
      !matched.length ||
      p.chainId !== 'solana' ||
      typeof base.address !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(base.address) ||
      typeof quote.address !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(quote.address) ||
      typeof p.pairAddress !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.pairAddress) ||
      seen.has(p.pairAddress) ||
      !policy.accepts(base.address, quote.address)
    )
      continue;
    if (typeof p.dexId !== 'string' || p.dexId.length > 40) continue;
    // Price is the base token price. Never attribute a quote token's price to the held stock.
    seen.add(p.pairAddress);
    for (const token of matched) {
      const isBase = token.mint === base.address;
      const counterpart = isBase ? quote : base;
      result[token.symbol].push({
        createdAt:
          typeof p.pairCreatedAt === 'number' &&
          Number.isSafeInteger(p.pairCreatedAt) &&
          p.pairCreatedAt > 0 &&
          p.pairCreatedAt <= Date.now()
            ? p.pairCreatedAt
            : null,
        address: p.pairAddress,
        dex: p.dexId,
        quote: policy.symbol(counterpart.address as string),
        baseMint: base.address,
        quoteMint: quote.address,
        side: isBase ? 'base' : 'quote',
        origin: policy.isStonkfun(base.address, quote.address)
          ? 'stonkfun'
          : undefined,
        price: isBase ? positive(p.priceUsd) : null,
        change24h: isBase ? numeric(record(p.priceChange).h24) : null,
        liquidity: nonnegative(record(p.liquidity).usd),
        volume24h: nonnegative(record(p.volume).h24),
        url: 'https://dexscreener.com/solana/' + p.pairAddress,
      });
    }
  }
  for (const pools of Object.values(result))
    pools.sort((a, b) => (b.liquidity ?? -1) - (a.liquidity ?? -1));
  return result;
}
export function parsePrices(
  raw: unknown,
  now = Date.now(),
  tokens: readonly StockToken[] = TOKENS,
): Record<string, TokenPrice> {
  const root = record(raw);
  if (!root.coins || typeof root.coins !== 'object')
    throw new Error('Invalid price response');
  const coins = record(root.coins),
    out: Record<string, TokenPrice> = {};
  for (const token of tokens) {
    const p = record(coins['solana:' + token.mint]),
      price = positive(p.price),
      seconds = positive(p.timestamp);
    if (price === null || seconds === null || seconds * 1000 > now + 60000)
      continue;
    out[token.symbol] = {
      price,
      timestamp: seconds * 1000,
      confidence: numeric(p.confidence),
    };
  }
  return out;
}
export function parseBook(
  raw: unknown,
  market: string,
  now = Date.now(),
): Book {
  const data = record(raw),
    timestamp = positive(data.timestamp);
  if (
    !timestamp ||
    now - timestamp / 1000 > 120000 ||
    timestamp / 1000 > now + 10000
  )
    throw new Error('Order book is out of date');
  function levels(value: unknown) {
    if (!Array.isArray(value) || !value.length)
      throw new Error('Order book has no two-sided liquidity');
    return value.map((l) => {
      if (!Array.isArray(l)) throw new Error('Invalid level');
      const price = positive(l[0]),
        amount = positive(l[1]);
      if (price === null || amount === null) throw new Error('Invalid level');
      return { price, amount };
    });
  }
  const bids = levels(data.bids),
    asks = levels(data.asks),
    bid = Math.max(...bids.map((x) => x.price)),
    ask = Math.min(...asks.map((x) => x.price));
  if (bid >= ask) throw new Error('Order book is crossed');
  return {
    market,
    bid,
    ask,
    spreadBps: ((ask - bid) / ((ask + bid) / 2)) * 10000,
    bidDepth1pct: bids
      .filter((x) => x.price >= bid * 0.99)
      .reduce((s, x) => s + x.price * x.amount, 0),
    askDepth1pct: asks
      .filter((x) => x.price <= ask * 1.01)
      .reduce((s, x) => s + x.price * x.amount, 0),
    timestamp: timestamp / 1000,
  };
}
export class SourceHttpError extends Error {
  retryAfterMs: number;
  status: number;
  constructor(host: string, response: Response) {
    super(`Source unavailable: ${host} HTTP ${response.status}`);
    this.status = response.status;
    const value = response.headers.get('retry-after');
    const delay =
      value && /^\d+$/.test(value)
        ? Number(value) * 1000
        : value
          ? Date.parse(value) - Date.now()
          : 0;
    this.retryAfterMs = Math.max(
      response.status === 429 ? 300000 : 30000,
      Number.isFinite(delay) ? delay : 0,
    );
  }
}
export async function publicJson(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const u = new URL(url);
  if (
    u.protocol !== 'https:' ||
    ![
      'api.backpack.exchange',
      'api.dexscreener.com',
      'api.geckoterminal.com',
      'coins.llama.fi',
      'www.stonkfun.xyz',
      'rest-api.tessera.pe',
    ].includes(u.hostname) ||
    u.username ||
    u.password
  )
    throw new Error('Unsupported data source');
  const r = await fetcher(u, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
    redirect: 'manual',
  });
  // Keep status and host for production diagnosis; never log URLs, keys or bodies.
  if (!r.ok) throw new SourceHttpError(u.hostname, r);
  return r.json();
}

const stonkfunRegistryCache = new WeakMap<typeof fetch, {
  expiresAt: number;
  value: Promise<unknown>;
}>();

async function stonkfunPoolRegistry(
  fetcher: typeof fetch,
  verifiedStocks: readonly StockToken[],
): Promise<StonkfunPoolIdentity[]> {
  // Reuse the public issuer feed across market pages in the same Worker isolate.
  // Its top-volume page is a partial discovery feed, never an aggregate to add.
  const cached = stonkfunRegistryCache.get(fetcher);
  if (cached && cached.expiresAt > Date.now()) {
    try {
      return parseStonkfunPoolRegistry(await cached.value, verifiedStocks);
    } catch {
      return [];
    }
  }
  const value = publicJson(
    'https://www.stonkfun.xyz/api/public/v1/tokens?sort=volume&page=1&pageSize=100',
    fetcher,
  );
  stonkfunRegistryCache.set(fetcher, { expiresAt: Date.now() + 300000, value });
  try {
    return parseStonkfunPoolRegistry(await value, verifiedStocks);
  } catch {
    // Short cooldown avoids hammering the issuer during an outage while the
    // previously reviewed settlement/stock pools continue to work.
    stonkfunRegistryCache.set(fetcher, {
      expiresAt: Date.now() + 30000,
      value,
    });
    return [];
  }
}

async function exactStonkfunPairs(
  fetcher: typeof fetch,
  tokens: readonly StockToken[],
  official: readonly StonkfunPoolIdentity[],
): Promise<unknown[]> {
  const wanted = new Set(tokens.map((token) => token.mint));
  const addresses = [...new Set(official.filter((pool) => wanted.has(pool.stockMint)).map((pool) => pool.address))];
  const requests: Promise<unknown>[] = [];
  for (let i = 0; i < addresses.length; i += 30)
    requests.push(publicJson(
      'https://api.dexscreener.com/latest/dex/pairs/solana/' + addresses.slice(i, i + 30).join(','),
      fetcher,
    ));
  const responses = await Promise.allSettled(requests);
  return responses.flatMap((response) => response.status === 'fulfilled'
    ? list(record(response.value).pairs)
    : []);
}
export async function fetchCatalog(
  fetcher: typeof fetch = fetch,
  tokens: readonly { symbol: string; mint: string }[] = BACKPACK_TOKENS,
) {
  const [a, m] = await Promise.all([
    publicJson('https://api.backpack.exchange/api/v1/assets', fetcher),
    publicJson('https://api.backpack.exchange/api/v1/markets', fetcher),
  ]);
  return parseListings(a, m, tokens);
}
export async function fetchPools(
  fetcher: typeof fetch = fetch,
  tokens: readonly StockToken[] = TOKENS,
  verifiedStocks: readonly StockToken[] = TOKENS,
) {
  const official = await stonkfunPoolRegistry(fetcher, verifiedStocks);
  const batches = [];
  for (let i = 0; i < tokens.length; i += 30)
    batches.push(tokens.slice(i, i + 30));
  const data = await Promise.all(
    batches
      .filter((b) => b.length)
      .map((b) =>
        publicJson(
          'https://api.dexscreener.com/tokens/v1/solana/' +
            b.map((t) => t.mint).join(','),
          fetcher,
        ),
      ),
  );
  if (data.some((x) => !Array.isArray(x)))
    throw new Error('Invalid pool response');
  const exact = await exactStonkfunPairs(fetcher, tokens, official);
  const discovered = parsePools([...data.flat(), ...exact], tokens, verifiedStocks, official);
  // The multi-token endpoint is a discovery snapshot, not a complete pool
  // list. Spend a bounded number of additional free requests on the most
  // active verified tokens in each 30-mint group. Other tokens retain their
  // eligible discovery pools, and a failed detail request cannot blank a page.
  const discoveredVolume = (token: StockToken) =>
    (discovered[token.symbol] ?? []).reduce(
      (sum, pool) => sum + (pool.volume24h ?? 0),
      0,
    );
  const selected = batches.flatMap((batch) =>
    [...batch]
      .filter((token) => discoveredVolume(token) > 0)
      .sort((a, b) => discoveredVolume(b) - discoveredVolume(a))
      .slice(0, 2),
  );
  const detail = await Promise.allSettled(
    selected.map((token) => fetchTokenPools(token, fetcher, verifiedStocks, official, false)),
  );
  for (const [index, result] of detail.entries()) {
    if (result.status !== 'fulfilled') continue;
    const symbol = selected[index].symbol;
    const byAddress = new Map(
      (discovered[symbol] ?? []).map((pool) => [pool.address, pool]),
    );
    for (const pool of result.value) byAddress.set(pool.address, pool);
    discovered[symbol] = [...byAddress.values()].sort(
      (a, b) => (b.liquidity ?? -1) - (a.liquidity ?? -1),
    );
  }
  return discovered;
}
export async function fetchPrices(
  fetcher: typeof fetch = fetch,
  tokens: readonly StockToken[] = TOKENS,
) {
  return parsePrices(
    await publicJson(
      'https://coins.llama.fi/prices/current/' +
        tokens.map((t) => 'solana:' + t.mint).join(','),
      fetcher,
    ),
    Date.now(),
    tokens,
  );
}

// The batch endpoint is only a discovery snapshot. Detail uses the token-pairs
// endpoint, whose returned subset must not be described as every Solana pool.
export async function fetchTokenPools(
  token: StockToken,
  fetcher: typeof fetch = fetch,
  verifiedStocks: readonly StockToken[] = TOKENS,
  officialPools?: readonly StonkfunPoolIdentity[],
  includeExact = true,
) {
  const official = officialPools ?? await stonkfunPoolRegistry(fetcher, verifiedStocks);
  const raw = await publicJson(
    'https://api.dexscreener.com/token-pairs/v1/solana/' + token.mint,
    fetcher,
  );
  if (!Array.isArray(raw)) throw new Error('Invalid pool response');
  const exact = includeExact ? await exactStonkfunPairs(fetcher, [token], official) : [];
  return parsePools([...raw, ...exact], [token], verifiedStocks, official)[token.symbol];
}

export async function fetchHistoricalPrices(
  fetcher: typeof fetch = fetch,
  tokens: readonly StockToken[] = TOKENS,
  now = Date.now(),
) {
  const target = Math.floor(now / 1000) - 86400;
  const parsed = parsePrices(
    await publicJson(
      'https://coins.llama.fi/prices/historical/' +
        target +
        '/' +
        tokens.map((t) => 'solana:' + t.mint).join(',') +
        '?searchWidth=15m',
      fetcher,
    ),
    now,
    tokens,
  );
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([, row]) => Math.abs(row.timestamp - target * 1000) <= 900000,
    ),
  );
}

// Token-level DEX volume from a single provider; never sum it with pool or CEX figures.
export function parseTokenVolumes(
  raw: unknown,
  tokens: readonly StockToken[] = TOKENS,
): Record<string, TokenVolume> {
  const data = record(raw).data;
  if (!Array.isArray(data)) throw new Error('Invalid token-volume response');
  const out: Record<string, TokenVolume> = {};
  const seen = new Set<string>();
  for (const item of data) {
    const row = record(item),
      attr = record(row.attributes);
    const token = tokens.find((t) => t.mint === attr.address);
    if (!token || row.type !== 'token' || row.id !== 'solana_' + token.mint)
      continue;
    if (seen.has(token.symbol))
      throw new Error('Duplicate token-volume record');
    seen.add(token.symbol);
    const volume = nonnegative(record(attr.volume_usd).h24);
    if (volume !== null)
      out[token.symbol] = { usd24h: volume, mint: token.mint };
  }
  return out;
}
export function volumeCacheKey(apiKey?: string) {
  return (
    (apiKey?.trim() ? 'cg-volume-v1:' : 'gecko-volume-v1:') + TOKEN_REVIEW_DATE
  );
}
export async function fetchTokenVolumes(
  fetcher: typeof fetch = fetch,
  apiKey?: string,
  tokens: readonly StockToken[] = TOKENS,
) {
  const batches = [];
  for (let i = 0; i < tokens.length; i += 30)
    batches.push(tokens.slice(i, i + 30));
  const result: Record<string, TokenVolume> = {};
  // Bounded sequential batches respect the public provider's request allowance.
  for (const batch of batches) {
    const addresses = batch.map((t) => t.mint).join(',');
    let data: unknown;
    if (apiKey?.trim()) {
      const response = await fetcher(
        'https://pro-api.coingecko.com/api/v3/onchain/networks/solana/tokens/multi/' +
          addresses,
        {
          headers: {
            Accept: 'application/json',
            'x-cg-pro-api-key': apiKey.trim(),
          },
          signal: AbortSignal.timeout(10000),
          redirect: 'manual',
        },
      );
      if (!response.ok)
        throw new SourceHttpError('pro-api.coingecko.com', response);
      data = await response.json();
    } else {
      data = await publicJson(
        'https://api.geckoterminal.com/api/v2/networks/solana/tokens/multi/' +
          addresses,
        fetcher,
      );
    }
    Object.assign(result, parseTokenVolumes(data, tokens));
  }
  if (!Object.keys(result).length)
    throw new Error('No verified token volumes returned');
  return result;
}

// Merge only current chunks. A failed page never makes another issuer's data disappear.
export function mergeMarketPages(pages: MarketOverview[]): MarketOverview {
  function combine<T>(
    sources: SourceResult<Record<string, T>>[],
  ): SourceResult<Record<string, T>> {
    const current = sources.filter((s) => s.data && !s.stale && s.fetchedAt);
    return {
      data: current.length
        ? Object.assign({}, ...current.map((s) => s.data))
        : null,
      fetchedAt: current.length
        ? Math.min(...current.map((s) => s.fetchedAt!))
        : null,
      stale: current.length === 0,
      asOf: Object.assign(
        {},
        ...current.map((s) =>
          Object.fromEntries(
            Object.keys(s.data!).map((key) => [
              key,
              s.asOf?.[key] ?? s.fetchedAt!,
            ]),
          ),
        ),
      ),
      error: sources.some((s) => s.stale || s.error)
        ? 'Some market coverage is temporarily unavailable.'
        : null,
    };
  }
  // Circulation keeps its dated last-good payload for an explicitly labeled
  // fallback. Other sources continue to exclude stale data from current values.
  const lastCirculation = pages
    .flatMap((p) =>
      p.circulation?.data && p.circulation.fetchedAt ? [p.circulation] : [],
    )
    .sort((a, b) => b.fetchedAt! - a.fetchedAt!)[0];
  return {
    registry: pages
      .map((p) => p.registry)
      .filter((r): r is RegistryStatus => !!r)
      .sort(
        (a, b) =>
          b.additions.length - a.additions.length ||
          (b.checkedAt ?? 0) - (a.checkedAt ?? 0),
      )[0],
    catalog: pages.find((p) => p.catalog.fetchedAt)?.catalog || {
      data: null,
      fetchedAt: null,
      stale: true,
      error: null,
    },
    markets: combine(pages.map((p) => p.markets)),
    backpack: pages.find((p) => p.backpack)?.backpack,
    prices: combine(pages.map((p) => p.prices)),
    pools: combine(pages.map((p) => p.pools)),
    supplies: combine(pages.map((p) => p.supplies)),
    circulation: lastCirculation
      ? {
          ...lastCirculation,
          asOf: Object.fromEntries(
            Object.keys(lastCirculation.data!).map((key) => [
              key,
              lastCirculation.asOf?.[key] ?? lastCirculation.fetchedAt!,
            ]),
          ),
        }
      : pages.find((p) => p.circulation)?.circulation,
    history: combine(pages.flatMap((p) => (p.history ? [p.history] : []))),
  };
}

export const marketTokens = (data: MarketOverview | null) =>
  registryTokens(data?.registry);
