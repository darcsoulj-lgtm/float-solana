import { db, auditStatement } from './server';
import {
  EDITORIAL_RELEASE,
  REVIEWED_AT,
  STARTER_CONTENT,
} from './editorial-starter';
import { validateEditorial, type EditorialItem } from './editorial';

export const editorialColumns = `e.id,e.kind,e.title,e.summary,e.publisher,e.url,e.published_at,e.event_date,e.event_at,e.certainty,e.status,e.featured,e.created_at,e.updated_at, (SELECT json_group_array(symbol) FROM editorial_tags WHERE item_id=e.id) symbols`;
export function editorialRow(row: Record<string, unknown>): EditorialItem {
  return {
    ...row,
    symbols: JSON.parse(typeof row.symbols === 'string' ? row.symbols : '[]'),
  } as EditorialItem;
}
export async function initializeEditorial() {
  if (
    await db()
      .prepare('SELECT id FROM content_releases WHERE id=?')
      .bind(EDITORIAL_RELEASE)
      .first()
  )
    return;
  const statements: D1PreparedStatement[] = [];
  for (const raw of STARTER_CONTENT) {
    const p = validateEditorial(raw);
    statements.push(
      db()
        .prepare(
          `INSERT OR IGNORE INTO editorial_items (id,kind,title,summary,publisher,url,published_at,event_date,event_at,certainty,status,featured,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM content_releases WHERE id=?)`,
        )
        .bind(
          raw.id,
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
          REVIEWED_AT,
          REVIEWED_AT,
          EDITORIAL_RELEASE,
        ),
    );
    for (const symbol of p.symbols)
      statements.push(
        db()
          .prepare(
            `INSERT OR IGNORE INTO editorial_tags (item_id,symbol) SELECT ?,? WHERE EXISTS (SELECT 1 FROM editorial_items WHERE id=?) AND NOT EXISTS (SELECT 1 FROM content_releases WHERE id=?)`,
          )
          .bind(raw.id, symbol, raw.id, EDITORIAL_RELEASE),
      );
  }
  statements.push(
    db()
      .prepare(
        'INSERT OR IGNORE INTO content_releases (id,applied_at) VALUES (?,?)',
      )
      .bind(EDITORIAL_RELEASE, Date.now()),
  );
  statements.push(
    auditStatement('release', 'editorial:initialize', EDITORIAL_RELEASE),
  );
  await db().batch(statements);
}
export async function recordOperation(operation: string, status: number) {
  const now = Date.now(),
    bucket = Math.floor(now / 3600000) * 3600000;
  try {
    await db()
      .prepare(
        'INSERT INTO operation_counts (bucket,operation,outcome,count,last_at) VALUES (?,?,?,1,?) ON CONFLICT(bucket,operation,outcome) DO UPDATE SET count=count+1,last_at=excluded.last_at',
      )
      .bind(
        bucket,
        operation,
        status < 400 ? 'success' : status < 500 ? 'rejected' : 'error',
        now,
      )
      .run();
  } catch {
    console.warn('Operation counter unavailable');
  }
}
