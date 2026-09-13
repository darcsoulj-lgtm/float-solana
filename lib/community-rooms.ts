import { AppError } from './validation';
import type { CommunityRoom } from './community-types';

export const ROOM_PAGE_SIZE = 50;
export type RoomPage = { rooms: CommunityRoom[]; nextCursor: string | null };
type RoomRow = CommunityRoom & { created_at: number };
export function roomStatement(database: D1Database, cursor = '', search = '') {
  const [stamp, id = '~'] = cursor
    ? cursor.split(':')
    : [String(Number.MAX_SAFE_INTEGER)];
  const before = Number(stamp);
  if (
    !Number.isSafeInteger(before) ||
    before < 0 ||
    id.length > 100 ||
    search.length > 60
  )
    throw new AppError('Invalid room search.');
  const term = search.trim();
  const escaped = term.replace(/[\\%_]/g, (c) => '\\' + c);
  return database
    .prepare(`SELECT r.id,r.name,r.description,r.created_at,
    r.thread_count
    FROM community_rooms r
    WHERE (r.created_at<? OR (r.created_at=? AND r.id<?))
    ${term ? "AND (r.name LIKE ? ESCAPE '\\' OR r.description LIKE ? ESCAPE '\\' OR r.id LIKE ? ESCAPE '\\')" : ''}
    ORDER BY r.created_at DESC,r.id DESC LIMIT ${ROOM_PAGE_SIZE + 1}`)
    .bind(
      before,
      before,
      id,
      ...(term ? Array(3).fill('%' + escaped + '%') : []),
    );
}
export function roomPage(rows: RoomRow[]): RoomPage {
  const page = rows.slice(0, ROOM_PAGE_SIZE);
  const last = page.at(-1);
  return {
    rooms: page.map(({ created_at: _createdAt, ...row }) => row),
    nextCursor:
      rows.length > ROOM_PAGE_SIZE && last
        ? last.created_at + ':' + last.id
        : null,
  };
}
export async function readRooms(
  database: D1Database,
  cursor = '',
  search = '',
) {
  return roomPage(
    (await roomStatement(database, cursor, search).all<RoomRow>()).results,
  );
}
