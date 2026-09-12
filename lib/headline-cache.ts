import { cachedMarket } from './market-cache';
import {
  HEADLINE_REFRESH_MS,
  NEWS_WINDOW_MS,
  fetchGoogleHeadlines,
  fetchHeadlines,
  type Headline,
} from './holder-news';
import { TOKENS } from './tokens';

export type HeadlineCacheRow = {
  key: string;
  payload: string | null;
  fetched_at: number;
  retry_after: number;
};
export function headlineKeys(symbol: string) {
  const token = TOKENS.find((t) => t.symbol === symbol);
  if (!token) throw Error('Unsupported stock');
  return [
    'headlines-google-v1:' + token.underlyingSymbol,
    'headlines-v2:' + token.underlyingSymbol,
    ...(symbol !== token.underlyingSymbol ? ['headlines-v2:' + symbol] : []),
  ];
}
export function cachedHeadlines(
  row: HeadlineCacheRow | undefined,
): Headline[] | null {
  if (!row?.payload) return null;
  try {
    const rows = JSON.parse(row.payload);
    if (
      !Array.isArray(rows) ||
      rows.some(
        (n) =>
          !n ||
          typeof n.title !== 'string' ||
          typeof n.url !== 'string' ||
          typeof n.publisher !== 'string' ||
          !Number.isFinite(n.published_at),
      )
    )
      return null;
    return rows;
  } catch {
    return null;
  }
}
export function headlineStatus(
  rows: (HeadlineCacheRow | undefined)[],
  now = Date.now(),
) {
  const fresh = rows.some(
    (row) =>
      cachedHeadlines(row) !== null &&
      row!.fetched_at <= now &&
      now - row!.fetched_at < HEADLINE_REFRESH_MS,
  );
  return { unavailable: !fresh, pending: rows.every((row) => !row) };
}
export function headlinesDue(
  rows: (HeadlineCacheRow | undefined)[],
  now = Date.now(),
) {
  const due = (row: HeadlineCacheRow | undefined) =>
    !row ||
    (now - row.fetched_at >= HEADLINE_REFRESH_MS && row.retry_after <= now);
  const primary = cachedHeadlines(rows[0]);
  if (
    rows[0] &&
    primary?.length &&
    now - rows[0].fetched_at < HEADLINE_REFRESH_MS
  )
    return false;
  return due(rows[0]) || due(rows[1]);
}

export async function refreshHeadlineSources(
  database: D1Database,
  symbol: string,
  fetcher: typeof fetch = fetch,
) {
  const [google, yahoo] = headlineKeys(symbol);
  const load = async (key: string, provider: () => Promise<Headline[]>) => {
    const previous = await database
      .prepare(
        'SELECT key,payload,fetched_at,retry_after FROM market_cache WHERE key=?',
      )
      .bind(key)
      .first<HeadlineCacheRow>();
    return cachedMarket(database, key, HEADLINE_REFRESH_MS, async () => {
      const incoming = await provider();
      // A shorter successful response must not erase still-current cached stories.
      const merged = new Map<string, Headline>();
      for (const n of [
        ...(cachedHeadlines(previous || undefined) || []),
        ...incoming,
      ]) {
        if (
          n.published_at >= Date.now() - NEWS_WINDOW_MS &&
          n.published_at <= Date.now()
        )
          merged.set(n.url, n);
      }
      return [...merged.values()]
        .sort((a, b) => b.published_at - a.published_at)
        .slice(0, 100);
    });
  };
  const primary = await load(google, () =>
    fetchGoogleHeadlines(symbol, fetcher),
  );
  if (!primary.stale && primary.data?.length) return;
  await load(yahoo, () => fetchHeadlines(symbol, fetcher));
}

export function headlineIdentity(item: Pick<Headline, 'publisher' | 'title'>) {
  return (
    item.publisher.toLowerCase().normalize('NFKC') +
    ':' +
    item.title
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}]/gu, '')
  );
}
