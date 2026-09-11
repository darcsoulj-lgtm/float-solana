import {
  fetchNewsDrafts,
  persistNewsDrafts,
  NEWS_TICKERS,
} from '@/lib/news-provider';
import { db, actor, rateLimit, runtime, auditStatement } from '@/lib/server';
import { communityMember } from '@/lib/community-server';
import { AppError } from '@/lib/validation';
import { validateEditorial, dateValue } from '@/lib/editorial';
import {
  editorialColumns,
  editorialRow,
  initializeEditorial,
} from '@/lib/editorial-server';
import { TOKENS } from '@/lib/tokens';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
async function handler(req: Request) {
  try {
    const url = new URL(req.url),
      path = url.pathname.replace('/api/editorial/', '');
    const post = req.method === 'POST';
    let b: Record<string, unknown> = {};
    if (post) {
      if (req.headers.get('origin') !== url.origin)
        throw new AppError('A same-origin request is required.', 403);
      if (!req.headers.get('content-type')?.includes('application/json'))
        throw new AppError('Use JSON.', 415);
      const text = await req.text();
      if (text.length > 14000) throw new AppError('Content is too large.', 413);
      try {
        b = JSON.parse(text);
        if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error();
      } catch {
        throw new AppError('Invalid request.');
      }
    }
    if (path === 'initialize' && post) {
      if (Object.keys(b).length)
        throw new AppError(
          'This action only initializes reviewed release content.',
        );
      const member = await communityMember(req, false);
      if (!member && !(await actor()).admin)
        throw new AppError('Administrator access is required.', 403);
      await initializeEditorial();
      return json({ ok: true });
    }
    if (path === 'brief' && !post) {
      const member = await communityMember(req);
      const scope = url.searchParams.get('scope') || 'personal',
        kind = url.searchParams.get('kind') || 'news';
      const symbol = url.searchParams.get('symbol') || 'all';
      const offset = Number(url.searchParams.get('offset') || 0);
      if (
        !['personal', 'all'].includes(scope) ||
        !['news', 'event'].includes(kind) ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 5000 ||
        (symbol !== 'all' && !TOKENS.some((t) => t.symbol === symbol))
      )
        throw new AppError('Invalid feed filter.');
      const from = dateValue(
        url.searchParams.get('today') || new Date().toISOString().slice(0, 10),
      );
      const rows = await db()
        .prepare(
          `SELECT ${editorialColumns} FROM editorial_items e WHERE e.status='published' AND e.kind=? AND (?='all' OR EXISTS (SELECT 1 FROM editorial_tags WHERE item_id=e.id AND symbol=?)) AND (?='all' OR (e.coverage='direct' AND EXISTS (SELECT 1 FROM editorial_tags WHERE item_id=e.id AND symbol IN (SELECT symbol FROM community_holdings WHERE member_id=?)))) AND (?='news' OR (e.event_at IS NOT NULL AND e.event_at>=?) OR (e.event_at IS NULL AND e.event_date>=?)) ORDER BY ${kind === 'news' ? 'e.featured DESC,e.published_at DESC,e.id' : 'e.event_date ASC,coalesce(e.event_at,0) ASC,e.id'} LIMIT 21 OFFSET ?`,
        )
        .bind(
          kind,
          symbol,
          symbol,
          'personal',
          member!.id,
          kind,
          Date.now(),
          from,
          offset,
        )
        .all<Record<string, unknown>>();
      const reviewed = await db()
        .prepare(
          "SELECT max(updated_at) updated FROM editorial_items WHERE status='published'",
        )
        .first<{ updated: number | null }>();
      return json({
        items: rows.results.slice(0, 20).map(editorialRow),
        hasMore: rows.results.length > 20,
        lastReviewed: reviewed?.updated || null,
      });
    }
    const user = await actor();
    if (!user.admin)
      throw new AppError('Administrator access is required.', 403);
    if (path === 'import-news' && post) {
      if (typeof b.symbol !== 'string')
        throw new AppError('Choose a supported stock.');
      await rateLimit('news-import:' + user.userId, 3);
      const drafts = await fetchNewsDrafts(
        runtime().BENZINGA_API_KEY,
        b.symbol,
      );
      const imported = await persistNewsDrafts(db(), drafts);
      await auditStatement(
        user.userId,
        'editorial:import-news',
        'benzinga:' + b.symbol + ':' + imported,
      ).run();
      return json({ imported, skipped: drafts.length - imported });
    }
    if (path === 'operations' && !post) {
      const now = Date.now();
      const results = await db().batch<Record<string, unknown>>([
        db().prepare(
          `SELECT ${editorialColumns} FROM editorial_items e ORDER BY e.updated_at DESC,e.id LIMIT 500`,
        ),
        db().prepare(
          "SELECT (SELECT count(*) FROM community_members WHERE suspended=0) members,(SELECT count(*) FROM community_threads WHERE hidden=0) posts,(SELECT count(*) FROM community_reports WHERE status='open') reports,(SELECT count(*) FROM editorial_items WHERE status='draft') drafts",
        ),
        db()
          .prepare(
            'SELECT operation,outcome,sum(count) count,max(last_at) last_at FROM operation_counts WHERE bucket>=? GROUP BY operation,outcome',
          )
          .bind(Math.floor((now - 86400000) / 3600000) * 3600000),
        db().prepare(
          "SELECT action,target,created_at FROM audit WHERE action LIKE 'editorial:%' OR action LIKE 'community:%' ORDER BY created_at DESC LIMIT 15",
        ),
        db().prepare(
          "SELECT max(updated_at) updated FROM editorial_items WHERE status='published'",
        ),
      ]);
      return json({
        items: results[0].results.map(editorialRow),
        counts: results[1].results[0],
        operations: results[2].results,
        audit: results[3].results,
        lastReviewed: results[4].results[0]?.updated || null,
        sampledAt: now,
        newsProvider: {
          configured: !!runtime().BENZINGA_API_KEY?.trim(),
          symbols: Object.keys(NEWS_TICKERS),
        },
      });
    }
    if (path === 'items' && post) {
      await rateLimit('editorial:' + user.userId, 60);
      const p = validateEditorial(b),
        id = typeof b.id === 'string' ? b.id : crypto.randomUUID(),
        now = Date.now();
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(id))
        throw new AppError('Invalid content ID.');
      const existing = await db()
        .prepare('SELECT updated_at FROM editorial_items WHERE id=?')
        .bind(id)
        .first<{ updated_at: number }>();
      if (b.id && !existing)
        throw new AppError('Content no longer exists.', 404);
      if (existing && b.expected_updated_at !== existing.updated_at)
        throw new AppError(
          'This item changed since you opened it. Reload it before saving.',
          409,
        );
      const duplicate = await db()
        .prepare(
          'SELECT id FROM editorial_items WHERE kind=? AND url=? AND id!=?',
        )
        .bind(p.kind, p.url, id)
        .first();
      if (duplicate)
        throw new AppError(
          'This source is already in the library. Edit that item and add any other relevant stocks.',
          409,
        );
      const stamp = Math.max(now, (existing?.updated_at || 0) + 1),
        editToken = crypto.randomUUID();
      const statements = [
        existing
          ? db()
              .prepare(
                'UPDATE editorial_items SET kind=?,title=?,summary=?,publisher=?,url=?,published_at=?,event_date=?,event_at=?,certainty=?,status=?,featured=?,updated_at=?,edit_token=?,coverage=? WHERE id=? AND updated_at=?',
              )
              .bind(
                p.kind,
                p.title,
                p.summary,
                p.publisher,
                p.url,
                p.published_at,
                p.event_date,
                p.event_at,
                p.certainty,
                p.status,
                p.featured,
                stamp,
                editToken,
                p.coverage,
                id,
                existing.updated_at,
              )
          : db()
              .prepare(
                'INSERT INTO editorial_items (id,kind,title,summary,publisher,url,published_at,event_date,event_at,certainty,status,featured,created_at,updated_at,edit_token,coverage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
              )
              .bind(
                id,
                p.kind,
                p.title,
                p.summary,
                p.publisher,
                p.url,
                p.published_at,
                p.event_date,
                p.event_at,
                p.certainty,
                p.status,
                p.featured,
                stamp,
                stamp,
                editToken,
                p.coverage,
              ),
        db()
          .prepare(
            'DELETE FROM editorial_tags WHERE item_id=? AND EXISTS (SELECT 1 FROM editorial_items WHERE id=? AND edit_token=?)',
          )
          .bind(id, id, editToken),
        ...p.symbols.map((symbol) =>
          db()
            .prepare(
              'INSERT OR IGNORE INTO editorial_tags (item_id,symbol) SELECT ?,? WHERE EXISTS (SELECT 1 FROM editorial_items WHERE id=? AND edit_token=?)',
            )
            .bind(id, symbol, id, editToken),
        ),
        db()
          .prepare(
            'INSERT INTO audit (id,actor,action,target,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM editorial_items WHERE id=? AND edit_token=?)',
          )
          .bind(
            crypto.randomUUID(),
            user.userId,
            'editorial:' + p.status,
            id,
            stamp,
            id,
            editToken,
          ),
      ];
      const result = await db().batch(statements);
      if (!result[0].meta.changes)
        throw new AppError(
          'Another editor saved this item. Reload before saving.',
          409,
        );
      return json({ id }, existing ? 200 : 201);
    }
    throw new AppError('Endpoint not found.', 404);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if (e instanceof Error && /UNIQUE constraint failed/.test(e.message))
      return json(
        { error: 'This source already exists. Reload the content library.' },
        409,
      );
    console.error(
      'Editorial request failed',
      e instanceof Error ? e.name : 'unknown',
    );
    return json(
      { error: 'Content is temporarily unavailable. Please try again.' },
      500,
    );
  }
}
export const GET = handler;
export const POST = handler;
