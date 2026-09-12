import type { TokenMarket } from './cmc-data';
import type { MintSupply } from './token-supply';
import {
  TOKENS,
  BACKPACK_TOKENS,
  TOKEN_REVIEW_DATE,
  type StockToken,
} from './tokens';
export const MARKET_REFRESH_MS = 120000;
export type SourceResult<T> = {
  data: T | null;
  fetchedAt: number | null;
  stale: boolean;
  error: string | null;
  asOf?: Record<string, number>;
};
export type Listing = {
  symbol: string;
  asset: string;
  deposit: boolean;
  withdraw: boolean;
  spot: string | null;
  bookState: string | null;
};
export type Pool = {
  address: string;
  dex: string;
  quote: string;
  price: number | null;
  change24h: number | null;
  liquidity: number | null;
  volume24h: number | null;
  url: string;
  side?: 'base' | 'quote';
};
export type TokenPrice = {
  price: number;
  timestamp: number;
  confidence: number | null;
};
export type TokenVolume = { usd24h: number; mint: string };
export type MarketOverview = {
  history?: SourceResult<Record<string, TokenPrice>>;
  volumes?: SourceResult<Record<string, TokenVolume>>;
  supplies: SourceResult<Record<string, MintSupply>>;
  markets: SourceResult<Record<string, TokenMarket>>;
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
export function parseListings(assets: unknown, markets: unknown): Listing[] {
  if (!Array.isArray(assets) || !Array.isArray(markets))
    throw new Error('Invalid registry response');
  return BACKPACK_TOKENS.flatMap((token) => {
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
export function parsePools(
  raw: unknown,
  tokens: readonly StockToken[] = TOKENS,
): Record<string, Pool[]> {
  if (!Array.isArray(raw)) throw new Error('Invalid pool response');
  const result: Record<string, Pool[]> = Object.fromEntries(
    tokens.map((t) => [t.symbol, []]),
  );
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
      seen.has(p.pairAddress)
    )
      continue;
    if (typeof p.dexId !== 'string' || p.dexId.length > 40) continue;
    // Price is the base token price. Never attribute a quote token's price to the held stock.
    seen.add(p.pairAddress);
    for (const token of matched) {
      const isBase = token.mint === base.address;
      const counterpart = isBase ? quote : base;
      result[token.symbol].push({
        address: p.pairAddress,
        dex: p.dexId,
        quote:
          typeof counterpart.symbol === 'string'
            ? counterpart.symbol.slice(0, 16)
            : 'Other',
        side: isBase ? 'base' : 'quote',
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
): Record<string, TokenPrice> {
  const root = record(raw);
  if (!root.coins || typeof root.coins !== 'object')
    throw new Error('Invalid price response');
  const coins = record(root.coins),
    out: Record<string, TokenPrice> = {};
  for (const token of TOKENS) {
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
  constructor(host: string, response: Response) {
    super(`Source unavailable: ${host} HTTP ${response.status}`);
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
export async function fetchCatalog(fetcher: typeof fetch = fetch) {
  const [a, m] = await Promise.all([
    publicJson('https://api.backpack.exchange/api/v1/assets', fetcher),
    publicJson('https://api.backpack.exchange/api/v1/markets', fetcher),
  ]);
  return parseListings(a, m);
}
export async function fetchPools(
  fetcher: typeof fetch = fetch,
  tokens: readonly StockToken[] = TOKENS,
) {
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
  return parsePools(data.flat(), tokens);
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
  );
}

// The batch endpoint is only a discovery snapshot. Detail uses the token-pairs
// endpoint, whose returned subset must not be described as every Solana pool.
export async function fetchTokenPools(
  token: StockToken,
  fetcher: typeof fetch = fetch,
) {
  const raw = await publicJson(
    'https://api.dexscreener.com/token-pairs/v1/solana/' + token.mint,
    fetcher,
  );
  return parsePools(raw, [token])[token.symbol];
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
  );
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([, row]) => Math.abs(row.timestamp - target * 1000) <= 900000,
    ),
  );
}

// Token-level DEX volume from a single provider; never sum it with pool or CEX figures.
export function parseTokenVolumes(raw: unknown): Record<string, TokenVolume> {
  const data = record(raw).data;
  if (!Array.isArray(data)) throw new Error('Invalid token-volume response');
  const out: Record<string, TokenVolume> = {};
  const seen = new Set<string>();
  for (const item of data) {
    const row = record(item),
      attr = record(row.attributes);
    const token = TOKENS.find((t) => t.mint === attr.address);
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
    Object.assign(result, parseTokenVolumes(data));
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
      error: sources.some((s) => s.stale)
        ? 'Some market coverage is temporarily unavailable.'
        : null,
    };
  }
  return {
    catalog: pages.find((p) => p.catalog.fetchedAt)?.catalog || {
      data: null,
      fetchedAt: null,
      stale: true,
      error: null,
    },
    markets: combine(pages.map((p) => p.markets)),
    prices: combine(pages.map((p) => p.prices)),
    pools: combine(pages.map((p) => p.pools)),
    supplies: combine(pages.map((p) => p.supplies)),
    history: combine(pages.flatMap((p) => (p.history ? [p.history] : []))),
  };
}
