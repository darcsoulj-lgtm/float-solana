import { numeric, publicJson } from './market-data';
import type { StockToken } from './tokens';

export const STONKFUN_REFRESH_MS = 300000;
const BASE_URL = 'https://www.stonkfun.xyz/api/public/v1';

export type StonkfunLaunch = {
  mint: string;
  symbol: string;
  name: string;
  stockSymbol: string;
  stockMint: string;
  stockSide: 'base' | 'quote';
  quoteSymbol: string | null;
  category: string | null;
  status: string | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  launchedAt: number | null;
};

export type StonkfunOverview = {
  rows: StonkfunLaunch[];
  linkedLaunches: number;
  activePairs: number;
  volume24hUsd: number | null;
  coverage: 'top-volume-and-newest';
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stringValue = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const numberValue = (...values: unknown[]) => {
  for (const value of values) {
    const direct = numeric(value);
    if (direct !== null && direct >= 0) return direct;
    const nested = object(value);
    const usd = numeric(nested.usd ?? nested.usdValue ?? nested.value);
    if (usd !== null && usd >= 0) return usd;
  }
  return null;
};

function rowsFromResponse(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const root = object(raw);
  if (Array.isArray(root.data)) return root.data;
  const data = object(root.data);
  for (const value of [
    root.tokens,
    data.tokens,
    root.results,
    data.results,
    root.items,
    data.items,
  ]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function timestamp(value: unknown) {
  const number = numeric(value);
  if (number !== null && number > 0)
    return number < 100000000000 ? number * 1000 : number;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseStonkfunTokens(
  raw: unknown,
  tokens: readonly StockToken[],
): StonkfunLaunch[] {
  const byMint = new Map(tokens.map((token) => [token.mint, token]));
  const parsed: StonkfunLaunch[] = [];
  for (const value of rowsFromResponse(raw)) {
    const row = object(value);
    const token = object(row.token);
    const launch = object(row.launch);
    const pair = object(row.pair);
    const base = object(row.baseToken ?? pair.baseToken);
    const quote = object(row.quoteToken ?? pair.quoteToken);
    const mint = stringValue(
      row.mint,
      row.tokenMint,
      row.address,
      token.mint,
      token.address,
      launch.mint,
      launch.address,
    );
    const quoteMint = stringValue(
      row.quoteMint,
      pair.quoteMint,
      quote.mint,
      quote.address,
      object(pair.quote).mint,
      object(pair.quote).address,
    );
    const baseMint = stringValue(
      row.baseMint,
      pair.baseMint,
      base.mint,
      base.address,
      object(pair.base).mint,
      object(pair.base).address,
    );
    const linked =
      (quoteMint ? byMint.get(quoteMint) : undefined) ||
      (baseMint ? byMint.get(baseMint) : undefined) ||
      (mint ? byMint.get(mint) : undefined);
    if (!mint || !linked) continue;
    const side: 'base' | 'quote' = linked.mint === quoteMint ? 'quote' : 'base';
    const symbol =
      stringValue(row.symbol, row.tokenSymbol, token.symbol, row.name) || mint;
    const name =
      stringValue(row.name, row.tokenName, token.name, launch.name, symbol) ||
      symbol;
    const market = object(row.market);
    const metrics = object(row.metrics ?? row.stats);
    parsed.push({
      mint,
      symbol,
      name,
      stockSymbol: linked.symbol,
      stockMint: linked.mint,
      stockSide: side,
      quoteSymbol: stringValue(
        row.quoteSymbol,
        quote.symbol,
        quote.name,
        pair.quoteSymbol,
        object(pair.quote).symbol,
      ),
      category: stringValue(row.category, pair.category),
      status: stringValue(row.status, row.graduationStatus),
      marketCapUsd: numberValue(
        row.marketCapUsd,
        row.marketCap,
        market.marketCapUsd,
        metrics.marketCapUsd,
      ),
      volume24hUsd: numberValue(
        row.volume24hUsd,
        row.volume24h,
        row.volume,
        market.volume24hUsd,
        metrics.volume24hUsd,
        metrics.volume24h,
      ),
      liquidityUsd: numberValue(
        row.liquidityUsd,
        row.liquidity,
        market.liquidityUsd,
        metrics.liquidityUsd,
      ),
      launchedAt: timestamp(
        row.launchedAt ??
          row.createdAt ??
          row.created_at ??
          launch.launchedAt ??
          launch.createdAt ??
          launch.created_at,
      ),
    });
  }
  return parsed;
}

function mergeRows(rows: StonkfunLaunch[]) {
  const unique = new Map<string, StonkfunLaunch>();
  for (const row of rows) {
    const key = `${row.mint}:${row.stockMint}`;
    const current = unique.get(key);
    if (!current || (row.volume24hUsd ?? -1) > (current.volume24hUsd ?? -1))
      unique.set(key, row);
  }
  return [...unique.values()].sort(
    (a, b) => (b.volume24hUsd ?? -1) - (a.volume24hUsd ?? -1),
  );
}

export async function fetchStonkfunOverview(
  fetcher: typeof fetch = fetch,
  tokens: readonly StockToken[],
): Promise<StonkfunOverview> {
  const query = (sort: 'volume' | 'newest') =>
    publicJson(
      `${BASE_URL}/tokens?sort=${sort}&page=1&pageSize=100`,
      fetcher,
    );
  const results = await Promise.allSettled([query('volume'), query('newest')]);
  const rawRows = results.flatMap((result) =>
    result.status === 'fulfilled' ? rowsFromResponse(result.value) : [],
  );
  if (!rawRows.length && results.every((result) => result.status === 'rejected'))
    throw results[0].status === 'rejected'
      ? results[0].reason
      : new Error('Stonkfun data unavailable');
  const allRows = mergeRows(parseStonkfunTokens(rawRows, tokens));
  const rows = allRows.slice(0, 12);
  const launches = new Set(allRows.map((row) => row.mint));
  const volumeValues = allRows
    .map((row) => row.volume24hUsd)
    .filter((value): value is number => value !== null);
  return {
    rows,
    linkedLaunches: launches.size,
    activePairs: allRows.length,
    volume24hUsd: volumeValues.length
      ? volumeValues.reduce((sum, value) => sum + value, 0)
      : null,
    coverage: 'top-volume-and-newest',
  };
}
