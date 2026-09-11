import type { SourceResult } from './market-data';
import { SourceHttpError } from './market-data';
type CacheRow = {
  payload: string | null;
  fetched_at: number;
  retry_after: number;
};
// Cache public observations only, never wallet addresses or personal balances.
export async function cachedMarket<T>(
  db: D1Database,
  key: string,
  ttl: number,
  loader: () => Promise<T>,
  now = Date.now(),
): Promise<SourceResult<T>> {
  const row = await db
    .prepare(
      'SELECT payload,fetched_at,retry_after FROM market_cache WHERE key=?',
    )
    .bind(key)
    .first<CacheRow>();
  let old: T | null = null;
  try {
    old = row?.payload ? JSON.parse(row.payload) : null;
  } catch {
    old = null;
  }
  const previous = (): SourceResult<T> => ({
    data: old,
    fetchedAt: row?.fetched_at || null,
    stale: true,
    error:
      'The source is temporarily unavailable. Showing the last saved observation if available.',
  });
  if (old && row && now - row.fetched_at < ttl)
    return { data: old, fetchedAt: row.fetched_at, stale: false, error: null };
  const lease = await db
    .prepare(
      'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?) ON CONFLICT(key) DO UPDATE SET retry_after=excluded.retry_after WHERE market_cache.retry_after<=? RETURNING key',
    )
    .bind(key, now + 20000, now)
    .first();
  if (!lease) return previous();
  try {
    const data = await loader();
    const fetchedAt = Date.now();
    await db
      .prepare(
        'UPDATE market_cache SET payload=?,fetched_at=?,retry_after=? WHERE key=? AND retry_after=?',
      )
      .bind(JSON.stringify(data), fetchedAt, fetchedAt + ttl, key, now + 20000)
      .run();
    return { data, fetchedAt, stale: false, error: null };
  } catch (error) {
    console.error(
      'Market source refresh failed',
      key,
      error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    );
    await db
      .prepare(
        'UPDATE market_cache SET retry_after=? WHERE key=? AND retry_after=?',
      )
      .bind(
        Date.now() +
          (error instanceof SourceHttpError ? error.retryAfterMs : 30000),
        key,
        now + 20000,
      )
      .run();
    return previous();
  }
}
