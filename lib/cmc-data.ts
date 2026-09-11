import { TOKENS } from './tokens';
import { numeric } from './market-data';

// Reviewed 2026-09-11 against CMC /v1/cryptocurrency/map by exact Solana mint.
// Symbols alone are NOT identities. Every quote must also pass the mint check.
export const CMC_MAPPING: Record<string, number> = {
  MU: 40817,
  SKHY: 40833,
  SPCX: 40238,
  AMC: 42024,
  BOT: 40816,
  SNDK: 40815,
};
export const CMC_IDS = Object.values(CMC_MAPPING);
export const CMC_REFRESH_MS = 300000;
export type TokenMarket = {
  symbol: string;
  id: number;
  url: string;
  price: number | null;
  marketCap: number | null;
  supply: number | null;
  volume24h: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  timestamp: number;
};
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const nonnegative = (v: unknown) => {
  const n = numeric(v);
  return n !== null && n >= 0 ? n : null;
};
const positive = (v: unknown) => {
  const n = nonnegative(v);
  return n !== null && n > 0 ? n : null;
};
export function parseTokenMarkets(
  raw: unknown,
  now = Date.now(),
): Record<string, TokenMarket> {
  const root = record(raw);
  if (
    String(record(root.status).error_code) !== '0' ||
    !Array.isArray(root.data)
  )
    throw new Error('Invalid CoinMarketCap response');
  const out: Record<string, TokenMarket> = {},
    seen = new Set<string>();
  for (const value of root.data) {
    const row = record(value),
      platform = record(row.platform);
    const token = TOKENS.find((t) => t.mint === platform.token_address);
    if (
      !token ||
      String(platform.id) !== '5426' ||
      CMC_MAPPING[token.symbol] !== Number(row.id)
    )
      continue;
    // Ambiguous duplicate responses fail closed rather than silently choosing one.
    if (seen.has(token.symbol)) {
      delete out[token.symbol];
      continue;
    }
    seen.add(token.symbol);
    const quote = (Array.isArray(row.quote) ? row.quote : [])
      .map(record)
      .find((q) => q.symbol === 'USD');
    if (
      !quote ||
      typeof row.slug !== 'string' ||
      !/^[a-z0-9-]+$/.test(row.slug)
    )
      continue;
    const timestamp = Math.min(
      Date.parse(String(row.last_updated)),
      Date.parse(String(quote.last_updated)),
    );
    if (
      !Number.isFinite(timestamp) ||
      timestamp <= 0 ||
      timestamp > now + 60000
    )
      continue;
    out[token.symbol] = {
      symbol: token.symbol,
      id: Number(row.id),
      url: 'https://coinmarketcap.com/currencies/' + row.slug + '/',
      price: positive(quote.price),
      marketCap: positive(quote.market_cap),
      supply: positive(row.circulating_supply),
      volume24h: nonnegative(quote.volume_24h),
      change24h: numeric(quote.percent_change_24h),
      change7d: numeric(quote.percent_change_7d),
      change30d: numeric(quote.percent_change_30d),
      timestamp,
    };
  }
  if (!Object.keys(out).length)
    throw new Error('No verified CoinMarketCap observations');
  return out;
}
export function freshTokenMarket(
  row: TokenMarket | undefined,
  now = Date.now(),
) {
  return row && now - row.timestamp <= 900000 && row.timestamp <= now + 60000
    ? row
    : undefined;
}
export function marketCoverage(
  rows: Record<string, TokenMarket> | null | undefined,
  now = Date.now(),
) {
  const fresh = Object.values(rows || {}).filter((row) =>
    freshTokenMarket(row, now),
  );
  const caps = fresh.filter((row) => row.marketCap !== null);
  const volumes = fresh.filter((row) => row.volume24h !== null);
  return {
    fresh,
    marketCap: caps.length
      ? caps.reduce((sum, row) => sum + row.marketCap!, 0)
      : null,
    volume24h: volumes.length
      ? volumes.reduce((sum, row) => sum + row.volume24h!, 0)
      : null,
    capCount: caps.length,
    volumeCount: volumes.length,
  };
}
export async function fetchTokenMarkets(
  key?: string,
  fetcher: typeof fetch = fetch,
) {
  const root = 'https://pro-api.coinmarketcap.com' + (key ? '' : '/public-api');
  const response = await fetcher(
    root +
      '/v3/cryptocurrency/quotes/latest?id=' +
      CMC_IDS.join(',') +
      '&convert=USD',
    {
      headers: {
        Accept: 'application/json',
        ...(key ? { 'X-CMC_PRO_API_KEY': key } : {}),
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error('CoinMarketCap is temporarily unavailable');
  return parseTokenMarkets(await response.json());
}
