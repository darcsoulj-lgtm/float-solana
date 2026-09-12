import type { SourceResult } from './market-data';
import { SourceHttpError } from './market-data';
type CacheRow = {
  payload: string | null;
  fetched_at: number;
  retry_after: number;
};
// HTTP reads must not wait for external providers. Keep the existing leased
// refresh path for jobs and verification that actually require a fresh result.
export async function marketSnapshot<T>(
  db: D1Database,
  key: string,
  ttl: number,
  loader: () => Promise<T>,
  defer: (work: Promise<unknown>) => void,
  now = Date.now(),
): Promise<SourceResult<T>> {
  const row = await db
    .prepare(
      'SELECT payload,fetched_at,retry_after FROM market_cache WHERE key=?',
    )
    .bind(key)
    .first<CacheRow>();
  let data: T | null = null;
  try {
    data = row?.payload ? JSON.parse(row.payload) : null;
  } catch {
    /* Invalid cached JSON is unavailable. */
  }
  const fresh =
    data !== null &&
    !!row &&
    row.fetched_at <= now &&
    now - row.fetched_at < ttl;
  const due = !fresh && (!row || row.retry_after <= now);
  const refreshing =
    due ||
    (!fresh &&
      !!row &&
      row.retry_after > now &&
      row.retry_after <= now + 20000);
  if (due)
    defer(
      cachedMarket(db, key, ttl, loader, now).catch(() => {
        console.error('Market cache refresh unavailable', key);
      }),
    );
  return {
    data,
    fetchedAt: row?.fetched_at || null,
    stale: !fresh,
    refreshing,
    error:
      fresh || refreshing
        ? null
        : 'The source is temporarily unavailable. Showing the last saved observation if available.',
  };
}
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
