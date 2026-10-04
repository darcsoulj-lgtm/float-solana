import { AppError, textValue } from './validation';

// Caller supplies the server-verified member, never an identity from the body.
export async function setThreadLike(database: D1Database, memberId: string, threadId: string, liked: unknown) {
  if (!memberId) throw new AppError('Membership required.', 401);
  if (typeof liked !== 'boolean') throw new AppError('Choose whether to like this post.');
  const id = textValue(threadId, 1, 100, 'Post');
  const visible = await database.prepare(
    'SELECT id FROM community_threads WHERE id=? AND hidden=0 AND member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?)',
  ).bind(id, memberId).first();
  if (!visible) throw new AppError('Post unavailable.', 404);
  if (liked) {
    await database.prepare(
      'INSERT OR IGNORE INTO community_likes(thread_id,member_id,created_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM community_threads WHERE id=? AND hidden=0 AND member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?))',
    ).bind(id, memberId, Date.now(), id, memberId).run();
  } else {
    await database.prepare('DELETE FROM community_likes WHERE thread_id=? AND member_id=?').bind(id, memberId).run();
  }
  const state = await database.prepare(
    'SELECT COUNT(*) like_count,COALESCE(MAX(CASE WHEN member_id=? THEN 1 ELSE 0 END),0) liked FROM community_likes WHERE thread_id=?',
  ).bind(memberId, id).first<{like_count:number;liked:number}>();
  return {like_count:state?.like_count ?? 0,liked:!!state?.liked};
}
