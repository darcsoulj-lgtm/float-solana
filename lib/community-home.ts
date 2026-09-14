import { COMMUNITY_CHANNELS, type CommunityRoom } from './community-types';

// Auth is enforced by the route. All private reads use its verified member ID.
// One database batch avoids serial network trips; all statements are read-only.
export async function communityHome(
  database: D1Database,
  memberId: string,
  sessionHash: string,
) {
  const result = await database.batch<Record<string, unknown>>([
    database
      .prepare(
        'SELECT symbol,verified_at,slot,raw_amount,decimals,ui_amount FROM community_holdings WHERE member_id=? ORDER BY symbol',
      )
      .bind(memberId),
    database
      .prepare(
        'SELECT symbol FROM community_follows WHERE member_id=? ORDER BY symbol',
      )
      .bind(memberId),
    database
      .prepare(
        "SELECT s.*,EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.member_id=? AND b.target_type='source' AND b.target_id=s.id) saved FROM community_sources s WHERE s.active=1 ORDER BY s.created_at DESC,s.id LIMIT 100",
      )
      .bind(memberId),
    database
      .prepare(
        'SELECT n.id,n.thread_id,n.read,n.created_at,t.title,m.alias FROM community_notifications n JOIN community_threads t ON t.id=n.thread_id JOIN community_replies r ON r.id=n.reply_id JOIN community_members m ON m.id=r.member_id WHERE n.member_id=? AND t.hidden=0 AND r.hidden=0 ORDER BY n.created_at DESC LIMIT 30',
      )
      .bind(memberId),
    database
      .prepare(
        'SELECT 1 FROM community_sessions WHERE hash=? AND member_id=? AND wallet IS NOT NULL',
      )
      .bind(sessionHash, memberId),
  ]);
  const [holdings, follows, links, notifications, session] = result;
  return {
    holdingsRefreshAvailable: !!session.results.length,
    holdings: holdings.results,
    follows: follows.results.map((row) => row.symbol),
    sources: links.results,
    notifications: notifications.results,
    rooms: COMMUNITY_CHANNELS.map((channel) => ({
      ...channel,
      thread_count: 0,
    })) as CommunityRoom[],
  };
}
