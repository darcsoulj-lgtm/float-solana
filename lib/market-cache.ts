import type { SourceResult } from './market-data';
import { SourceHttpError } from './market-data';
type CacheRow = {
  payload: string | null;
  fetched_at: number;
  retry_after: number;
};
// Four observations for one canonical batch use one D1 read, not four trips.
export async function marketCacheRows(db: D1Database, keys: readonly string[]) {
  if (!keys.length) return new Map<string, CacheRow>();
  const result = await db
    .prepare(
      `SELECT key,payload,fetched_at,retry_after FROM market_cache WHERE key IN (${keys.map(() => '?').join(',')})`,
    )
    .bind(...keys)
    .all<CacheRow & { key: string }>();
  return new Map(result.results.map((row) => [row.key, row]));
}
// HTTP reads must not wait for external providers. Keep the existing leased
// refresh path for jobs and verification that actually require a fresh result.
export async function marketSnapshot<T>(
  db: D1Database,
  key: string,
  ttl: number,
  loader: () => Promise<T>,
  defer: (work: Promise<unknown>) => void,
  now = Date.now(),
  maxAge = ttl,
  savedRow?: CacheRow | null,
): Promise<SourceResult<T>> {
  const row =
    savedRow !== undefined
      ? savedRow
      : await db
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
  // Refresh cadence and validity are separate. Never renew the observation
  // timestamp merely because it was served from cache.
  const fresh =
    data !== null &&
    !!row &&
    row.fetched_at <= now &&
    now - row.fetched_at < ttl;
  const usable =
    data !== null &&
    !!row &&
    row.fetched_at <= now &&
    now - row.fetched_at < Math.max(ttl, maxAge);
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
    stale: !usable,
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
  savedRow?: CacheRow | null,
): Promise<SourceResult<T>> {
  const row =
    savedRow !== undefined
      ? savedRow
      : await db
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
  if (old && row && row.fetched_at <= now && now - row.fetched_at < ttl)
    return { data: old, fetchedAt: row.fetched_at, stale: false, error: null };
  // A provider-wide 429 must also stop the other market pages and detail reads.
  const cooldownKey =
    key.startsWith('dex-pools-') || key.startsWith('token-pairs-')
      ? 'provider-cooldown:dexscreener'
      : key.startsWith('headlines-google-v1:')
        ? 'provider-cooldown:google-news'
        : key.startsWith('headlines-v2:')
          ? 'provider-cooldown:yahoo-news'
          : null;
  if (cooldownKey) {
    const cooldown = await db
      .prepare('SELECT retry_after FROM market_cache WHERE key=?')
      .bind(cooldownKey)
      .first<{ retry_after: number }>();
    if (cooldown && cooldown.retry_after > now) {
      await db
        .prepare(
          'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?) ON CONFLICT(key) DO UPDATE SET retry_after=MAX(market_cache.retry_after,excluded.retry_after)',
        )
        .bind(key, cooldown.retry_after)
        .run();
      return previous();
    }
  }
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
    if (
      cooldownKey &&
      error instanceof SourceHttpError &&
      error.status === 429
    ) {
      await db
        .prepare(
          'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?) ON CONFLICT(key) DO UPDATE SET retry_after=MAX(market_cache.retry_after,excluded.retry_after)',
        )
        .bind(cooldownKey, Date.now() + error.retryAfterMs)
        .run();
    }
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
