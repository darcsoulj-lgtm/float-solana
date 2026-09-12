import { communityMember } from '@/lib/community-server';
import { db, rateLimit } from '@/lib/server';
import { cachedMarket } from '@/lib/market-cache';
import {
  NEWS_WINDOW_MS,
  HEADLINE_REFRESH_MS,
  fetchHeadlines,
  type Headline,
} from '@/lib/holder-news';
import { editorialColumns, editorialRow } from '@/lib/editorial-server';
import { AppError } from '@/lib/validation';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const prefix = 'headlines-v2:';
async function handle(req: Request) {
  try {
    const member = await communityMember(req);
    const database = db(),
      now = Date.now();
    const held = await database
      .prepare(
        'SELECT symbol FROM community_holdings WHERE member_id=? ORDER BY symbol',
      )
      .bind(member!.id)
      .all<{ symbol: string }>();
    let symbol = new URL(req.url).searchParams.get('symbol') || 'all';
    if (req.method === 'POST') {
      if (req.headers.get('origin') !== new URL(req.url).origin)
        throw new AppError('A same-origin request is required.', 403);
      await rateLimit('news-refresh:' + member!.id, 12);
      const body = await req.text();
      if (body.length > 200) throw new AppError('Request too large.', 413);
      try {
        symbol = JSON.parse(body).symbol || 'all';
      } catch {
        throw new AppError('Invalid request.');
      }
    }
    if (symbol !== 'all' && !held.results.some((h) => h.symbol === symbol))
      throw new AppError('Choose one of your holdings.', 403);
    const symbols = held.results
      .map((h) => h.symbol)
      .filter((s) => symbol === 'all' || s === symbol);
    if (!symbols.length)
      return Response.json(
        { items: [], hasMore: false, lastReviewed: null },
        { headers },
      );
    const keys = symbols.map((s) => prefix + s);
    const cached = await database
      .prepare(
        `SELECT key,payload,fetched_at,retry_after FROM market_cache WHERE key IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify(keys))
      .all<{
        key: string;
        payload: string | null;
        fetched_at: number;
        retry_after: number;
      }>();
    const byKey = new Map(cached.results.map((r) => [r.key, r]));
    if (req.method === 'POST') {
      const due = symbols
        .filter((s) => {
          const c = byKey.get(prefix + s);
          return (
            (!c || now - c.fetched_at >= HEADLINE_REFRESH_MS) &&
            (!c || c.retry_after <= now)
          );
        })
        .sort(
          (a, b) =>
            (byKey.get(prefix + a)?.fetched_at || 0) -
            (byKey.get(prefix + b)?.fetched_at || 0),
        )
        .slice(0, 6);
      for (let i = 0; i < due.length; i += 3)
        await Promise.all(
          due
            .slice(i, i + 3)
            .map((s) =>
              cachedMarket(database, prefix + s, HEADLINE_REFRESH_MS, () =>
                fetchHeadlines(s),
              ),
            ),
        );
      // Rolling public headline cache only. Curated stories and discussion links are retained.
      await database
        .prepare(
          'DELETE FROM market_cache WHERE key LIKE ? AND fetched_at<? AND retry_after<?',
        )
        .bind(prefix + '%', now - NEWS_WINDOW_MS, now)
        .run();
      return Response.json({ ok: true }, { headers });
    }
    const offset = Number(new URL(req.url).searchParams.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 5000)
      throw new AppError('Invalid page.');
    const map = new Map<string, Record<string, unknown>>();
    let last = 0,
      unavailable = 0,
      pending = 0;
    for (const s of symbols) {
      const c = byKey.get(prefix + s);
      if (!c || !c.payload) {
        unavailable++;
        if (!c) pending++;
        continue;
      }
      if (now - c.fetched_at >= HEADLINE_REFRESH_MS) unavailable++;
      last = Math.max(last, c.fetched_at);
      try {
        for (const n of JSON.parse(c.payload) as Headline[]) {
          if (n.published_at < now - NEWS_WINDOW_MS || n.published_at > now)
            continue;
          const old = map.get(n.url);
          map.set(n.url, {
            ...n,
            summary: '',
            kind: 'news',
            coverage: 'direct',
            featured: 0,
            event_at: null,
            event_date: null,
            certainty: 'confirmed',
            symbols: [...new Set([...((old?.symbols as string[]) || []), s])],
          });
        }
      } catch {
        unavailable++;
      }
    }
    const curated = await database
      .prepare(
        `SELECT ${editorialColumns} FROM editorial_items e WHERE e.kind='news' AND e.status='published' AND e.coverage='direct' AND e.published_at>=? AND e.published_at<=? AND EXISTS(SELECT 1 FROM editorial_tags t WHERE t.item_id=e.id AND t.symbol IN (SELECT value FROM json_each(?))) ORDER BY e.published_at DESC LIMIT 100`,
      )
      .bind(now - NEWS_WINDOW_MS, now, JSON.stringify(symbols))
      .all<Record<string, unknown>>();
    for (const row of curated.results) {
      const n = editorialRow(row);
      map.set(n.url, n as unknown as Record<string, unknown>);
    }
    const items = [...map.values()].sort(
      (a, b) =>
        Number(b.published_at) - Number(a.published_at) ||
        String(a.id).localeCompare(String(b.id)),
    );
    return Response.json(
      {
        items: items.slice(offset, offset + 20),
        hasMore: items.length > offset + 20,
        lastReviewed: last || null,
        pending,
        unavailable,
        notice: unavailable
          ? `Coverage is updating or unavailable for ${unavailable} holding${unavailable === 1 ? '' : 's'}.`
          : 'Company-matched headlines via Yahoo Finance RSS. Publisher updates may be delayed.',
      },
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : 'News is temporarily unavailable.',
      },
      { status: e instanceof AppError ? e.status : 503, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
