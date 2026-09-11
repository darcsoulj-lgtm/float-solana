import type { TokenMarket } from './cmc-data';
import type { MintSupply } from './token-supply';
import { TOKENS } from './tokens';
export const MARKET_REFRESH_MS = 120000;
export type SourceResult<T> = {
  data: T | null;
  fetchedAt: number | null;
  stale: boolean;
  error: string | null;
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
};
export type TokenPrice = {
  price: number;
  timestamp: number;
  confidence: number | null;
};
export type MarketOverview = {
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
  return TOKENS.flatMap((token) => {
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
export function parsePools(raw: unknown): Record<string, Pool[]> {
  if (!Array.isArray(raw)) throw new Error('Invalid pool response');
  const result: Record<string, Pool[]> = Object.fromEntries(
    TOKENS.map((t) => [t.symbol, []]),
  );
  const seen = new Set<string>();
  for (const value of raw) {
    const p = record(value),
      base = record(p.baseToken),
      quote = record(p.quoteToken);
    const token = TOKENS.find((t) => t.mint === base.address);
    if (
      !token ||
      p.chainId !== 'solana' ||
      typeof p.pairAddress !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.pairAddress) ||
      seen.has(p.pairAddress)
    )
      continue;
    if (typeof p.dexId !== 'string' || p.dexId.length > 40) continue;
    // Price is the base token price. Never attribute a quote token's price to the held stock.
    seen.add(p.pairAddress);
    result[token.symbol].push({
      address: p.pairAddress,
      dex: p.dexId,
      quote:
        typeof quote.symbol === 'string' ? quote.symbol.slice(0, 16) : 'Other',
      price: positive(p.priceUsd),
      change24h: numeric(record(p.priceChange).h24),
      liquidity: nonnegative(record(p.liquidity).usd),
      volume24h: nonnegative(record(p.volume).h24),
      url: 'https://dexscreener.com/solana/' + p.pairAddress,
    });
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
  if (!r.ok) throw new Error('Source unavailable');
  return r.json();
}
export async function fetchCatalog(fetcher: typeof fetch = fetch) {
  const [a, m] = await Promise.all([
    publicJson('https://api.backpack.exchange/api/v1/assets', fetcher),
    publicJson('https://api.backpack.exchange/api/v1/markets', fetcher),
  ]);
  return parseListings(a, m);
}
export async function fetchPools(fetcher: typeof fetch = fetch) {
  const batches = [TOKENS.slice(0, 30), TOKENS.slice(30)];
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
  return parsePools(data.flat());
}
export async function fetchPrices(fetcher: typeof fetch = fetch) {
  return parsePrices(
    await publicJson(
      'https://coins.llama.fi/prices/current/' +
        TOKENS.map((t) => 'solana:' + t.mint).join(','),
      fetcher,
    ),
  );
}
