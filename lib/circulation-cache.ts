import { marketSnapshot } from './market-cache';
import {
  parseCirculationPages,
  fetchXstocksCirculationPage,
  parseReferenceFx,
  CIRCULATION_REFRESH_MS,
  CIRCULATION_MAX_AGE_MS,
  type IssuerCirculation,
} from './xstocks-circulation';
import type { SourceResult } from './market-data';
type Row = {
  key: string;
  payload: string | null;
  fetched_at: number;
  retry_after: number;
};
const COMPLETE = 'xstocks-circulation:v1';
const read = (row: Row | undefined | null) => {
  try {
    return row?.payload ? JSON.parse(row.payload) : null;
  } catch {
    return null;
  }
};
// Refresh at most three pages per invocation. Each page has its own lease and
// cache, so timeout/retry never discards the other completed pages. A generation
// is published atomically only after pagination and mint validation pass.
export async function circulationSnapshot(
  database: D1Database,
  defer: (p: Promise<unknown>) => void,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<SourceResult<Record<string, IssuerCirculation>>> {
  const saved = await database
    .prepare(
      'SELECT key,payload,fetched_at,retry_after FROM market_cache WHERE key=?',
    )
    .bind(COMPLETE)
    .first<Row>();
  const old = read(saved);
  const age =
    saved && saved.fetched_at <= now ? now - saved.fetched_at : Infinity;
  if (old && age < CIRCULATION_REFRESH_MS)
    return {
      data: old,
      fetchedAt: saved!.fetched_at,
      stale: false,
      refreshing: false,
      error: null,
    };
  const generation = Math.floor(now / CIRCULATION_REFRESH_MS);
  const prefix = `xstocks-page:v2:${generation}:`;
  const result = await database
    .prepare(
      'SELECT key,payload,fetched_at,retry_after FROM market_cache WHERE key LIKE ?',
    )
    .bind(prefix + '%')
    .all<Row>();
  const cache = new Map(
    result.results.map((row) => [Number(row.key.slice(prefix.length)), row]),
  );
  const first = read(cache.get(0));
  const count = first?.data?.tokens?.page?.totalPages;
  const expected =
    Number.isInteger(count) && count > 0 && count <= 50 ? count : 1;
  const fx = await marketSnapshot(
    database,
    'xstocks-reference-fx:v2',
    86400000,
    async () => {
      const response = await fetcher(
        'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
        { redirect: 'manual', signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) throw Error('ECB reference unavailable');
      const xml = await response.text();
      parseReferenceFx(xml);
      return xml;
    },
    defer,
    now,
    96 * 3600000,
  );
  const pages = Array.from({ length: expected }, (_, page) =>
    read(cache.get(page)),
  );
  if (count === expected && pages.every(Boolean)) {
    let rates = null;
    try {
      if (typeof fx.data === 'string') rates = parseReferenceFx(fx.data, now);
    } catch {
      /* USD assets remain usable without HKD FX. */
    }
    try {
      const data = parseCirculationPages(pages, rates);
      const observedAt = Math.min(
        ...Array.from(
          { length: expected },
          (_, page) => cache.get(page)!.fetched_at,
        ),
      );
      await database
        .prepare(
          'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after WHERE market_cache.fetched_at<excluded.fetched_at',
        )
        .bind(
          COMPLETE,
          JSON.stringify(data),
          observedAt,
          observedAt + CIRCULATION_REFRESH_MS,
        )
        .run();
      defer(
        database
          .prepare(
            'DELETE FROM market_cache WHERE key LIKE ? AND fetched_at<? AND retry_after<?',
          )
          .bind(
            'xstocks-page:v2:%',
            now - 2 * CIRCULATION_REFRESH_MS,
            now - 2 * CIRCULATION_REFRESH_MS,
          )
          .run(),
      );
      return {
        data,
        fetchedAt: observedAt,
        stale: now - observedAt >= CIRCULATION_MAX_AGE_MS,
        refreshing: false,
        error: null,
      };
    } catch {
      console.error(
        'Issuer circulation generation failed validation',
        generation,
      );
      // A registry change during pagination cannot be patched with mixed data.
      // Clear only this incomplete generation; retain the last complete snapshot.
      await database
        .prepare('DELETE FROM market_cache WHERE key LIKE ?')
        .bind(prefix + '%')
        .run();
      return {
        data: old,
        fetchedAt: saved?.fetched_at || null,
        stale: age >= CIRCULATION_MAX_AGE_MS,
        refreshing: true,
        error: 'Issuer update changed during refresh. Retrying.',
      };
    }
  }
  let scheduled = 0;
  for (let page = 0; page < expected && scheduled < 3; page++) {
    const row = cache.get(page);
    if (read(row) || (row && row.retry_after > now)) continue;
    scheduled++;
    await marketSnapshot(
      database,
      prefix + page,
      CIRCULATION_REFRESH_MS,
      async () => {
        const result = (await fetchXstocksCirculationPage(page, fetcher)) as {
          errors?: unknown[];
          data?: {
            tokens?: { nodes?: unknown[]; page?: { totalPages?: number } };
          };
        };
        if (
          result.errors?.length ||
          !Array.isArray(result.data?.tokens?.nodes) ||
          !Number.isInteger(result.data?.tokens?.page?.totalPages) ||
          (result.data?.tokens?.page?.totalPages ?? 0) < 1 ||
          (result.data?.tokens?.page?.totalPages ?? 51) > 50
        )
          throw Error('Invalid issuer page');
        return result;
      },
      defer,
      now,
      CIRCULATION_REFRESH_MS,
    );
  }
  return {
    data: old,
    fetchedAt: saved?.fetched_at || null,
    stale: age >= CIRCULATION_MAX_AGE_MS,
    refreshing: true,
    error:
      age >= CIRCULATION_MAX_AGE_MS
        ? 'Issuer refresh delayed. Last verified observation retained.'
        : null,
  };
}
