import { parseDiscussionAttachment } from './discussion-attachments';
import { AppError } from './validation';
import {
  communityTopics,
  COMMUNITY_CHANNELS,
  normalizeCommunityTopic,
  type CommunityThread,
  type CommunityReply,
} from './community-types';
import type { StockToken } from './tokens';

// Select public author metadata only; holdings, wallets and notification settings never leave this boundary.
export const authorColumns = `m.alias,m.bio,m.avatar_key, CASE WHEN m.show_value_badge=1 AND m.verified_until>unixepoch()*1000 AND m.suspended=0 AND m.value_tier_expires_at>unixepoch()*1000 THEN m.value_tier ELSE NULL END value_tier, CASE WHEN m.show_value_badge=1 AND m.verified_until>unixepoch()*1000 AND m.suspended=0 AND m.value_tier IS NOT NULL AND m.value_tier_expires_at>unixepoch()*1000 THEN MIN(m.value_tier_expires_at,m.verified_until) ELSE 0 END value_tier_expires_at`;

export async function readCommunityThreads(
  database: D1Database,
  url: URL,
  viewerId: string | null,
  tokens: readonly StockToken[],
) {
  const topic = normalizeCommunityTopic(url.searchParams.get('topic') || 'all');
  const requestedFeed = url.searchParams.get('feed') || 'all';
  const feed = requestedFeed === 'personal' ? 'following' : requestedFeed;
  if (!['all', 'following', 'saved', 'mine'].includes(feed))
    throw new AppError('Unknown feed.');
  if (!viewerId && feed !== 'all')
    throw new AppError('Verify your wallet to view this feed.', 401);
  const threadId = url.searchParams.get('thread') || '';
  if (threadId.length > 100) throw new AppError('Invalid discussion.');
  if (
    !communityTopics(tokens).some((t) => t.id === topic) &&
    !(await database
      .prepare('SELECT id FROM community_rooms WHERE id=?')
      .bind(topic)
      .first())
  )
    throw new AppError('Unknown topic.');
  const search = (url.searchParams.get('q') || '').trim();
  if (search.length > 80) throw new AppError('Search is too long.');
  const term = '%' + search.replace(/[\\%_]/g, c => '\\' + c) + '%';
  const matchingSymbols = tokens.filter(t => [t.symbol,t.name,t.shortName].some(value => value.toLowerCase().includes(search.toLowerCase().replace(/^\$/, '')))).map(t => t.symbol);
  const attachment = `CASE WHEN json_valid(t.attachment_json) THEN t.attachment_json ELSE '{}' END`;
  const followed = `SELECT symbol FROM community_follows WHERE member_id=?`;
  const [stamp, key = '~'] = (
    url.searchParams.get('cursor') || String(Date.now() + 1)
  ).split(':');
  const cursor = Number(stamp);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || key.length > 40)
    throw new AppError('Invalid cursor.');
  const rows = (
    await database
      .prepare(
        `SELECT t.id,t.member_id,t.topic,(SELECT name FROM community_rooms WHERE id=t.topic) room_name,t.title,t.body,t.attachment_json,t.created_at,t.updated_at,t.hidden,${authorColumns},(SELECT COUNT(*) FROM community_likes l WHERE l.thread_id=t.id) like_count,EXISTS(SELECT 1 FROM community_likes l WHERE l.thread_id=t.id AND l.member_id=?) liked,EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.member_id=? AND b.target_type='thread' AND b.target_id=t.id) saved,(SELECT count(*) FROM community_replies r WHERE r.thread_id=t.id AND r.hidden=0 AND r.member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?)) reply_count FROM community_threads t JOIN community_members m ON m.id=t.member_id WHERE t.hidden=0 AND t.member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?) AND (?='all' OR t.topic=? OR (?='channel-market-talk' AND t.topic='channel-onchain-stocks')) AND (?='' OR t.id=?) AND (?!='following' OR t.topic IN (${followed}) OR json_extract(${attachment},'$.chart.symbol') IN (${followed}) OR EXISTS(SELECT 1 FROM json_each(${attachment},'$.rows') row WHERE json_extract(CASE WHEN json_valid(row.value) THEN row.value ELSE '{}' END,'$.symbol') IN (${followed}))) AND (?='' OR t.title LIKE ? ESCAPE '\\' OR t.body LIKE ? ESCAPE '\\' OR t.topic IN (SELECT value FROM json_each(?)) OR json_extract(${attachment},'$.chart.symbol') IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_each(${attachment},'$.rows') row WHERE json_extract(CASE WHEN json_valid(row.value) THEN row.value ELSE '{}' END,'$.symbol') IN (SELECT value FROM json_each(?)))) AND (?!='saved' OR EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.member_id=? AND b.target_type='thread' AND b.target_id=t.id)) AND (?!='mine' OR t.member_id=?) AND (t.created_at<? OR (t.created_at=? AND t.id<?)) ORDER BY t.created_at DESC,t.id DESC LIMIT 31`,
      )
      .bind(
        viewerId,
        viewerId,
        viewerId,
        viewerId,
        topic,
        topic,
        topic,
        threadId,
        threadId,
        feed,
        viewerId,
        viewerId,
        viewerId,
        threadId ? '' : search,
        term,
        term,
        JSON.stringify(matchingSymbols),
        JSON.stringify(matchingSymbols),
        JSON.stringify(matchingSymbols),
        feed,
        viewerId,
        feed,
        viewerId,
        cursor,
        cursor,
        key,
      )
      .all<CommunityThread & {attachment_json?: string}>()
  ).results;
  const pageRows = rows.slice(0, 30);
  const pollOptions = new Map<
    string,
    {
      closes_at: number | null;
      id: string;
      label: string;
      position: number;
      vote_count: number;
      selected: number;
    }[]
  >();
  if (pageRows.length) {
    const placeholders = pageRows.map(() => '?').join(',');
    const optionRows = (
      await database
        .prepare(
          `SELECT p.thread_id,p.closes_at,o.id,o.label,o.position,COUNT(v.member_id) vote_count,MAX(CASE WHEN v.member_id=? THEN 1 ELSE 0 END) selected FROM community_polls p JOIN community_poll_options o ON o.thread_id=p.thread_id LEFT JOIN community_poll_votes v ON v.option_id=o.id WHERE p.thread_id IN (${placeholders}) GROUP BY p.thread_id,p.closes_at,o.id,o.label,o.position ORDER BY o.position`,
        )
        .bind(viewerId, ...pageRows.map((row) => row.id))
        .all<{
          thread_id: string;
          closes_at: number | null;
          id: string;
          label: string;
          position: number;
          vote_count: number;
          selected: number;
        }>()
    ).results;
    for (const option of optionRows) {
      const list = pollOptions.get(option.thread_id) || [];
      list.push(option);
      pollOptions.set(option.thread_id, list);
    }
  }
  return {
    threads: pageRows.map((row) => {
      const options = pollOptions.get(row.id);
      const selected = !!options?.some((option) => option.selected);
      const closed =
        !!options?.[0]?.closes_at && options[0].closes_at <= Date.now();
      const resultsVisible = selected || closed;
      const { attachment_json, ...publicRow } = row;
      return {
        ...publicRow,
        topic: normalizeCommunityTopic(row.topic),
        attachment: parseDiscussionAttachment(attachment_json),
        room_name:
          row.room_name ||
          COMMUNITY_CHANNELS.find((channel) => channel.id === normalizeCommunityTopic(row.topic))
            ?.name ||
          row.room_name,
        ...(options
          ? {
              poll: {
                closes_at: options[0].closes_at,
                closed,
                results_visible: resultsVisible,
                total_votes: resultsVisible
                  ? options.reduce((sum, option) => sum + option.vote_count, 0)
                  : null,
                options: options.map((option) => ({
                  id: option.id,
                  label: option.label,
                  position: option.position,
                  vote_count: resultsVisible ? option.vote_count : null,
                  selected: !!option.selected,
                })),
              },
            }
          : {}),
      };
    }),
    nextCursor:
      rows.length > 30 ? rows[29].created_at + ':' + rows[29].id : null,
  };
}

export async function readCommunityReplies(
  database: D1Database,
  url: URL,
  threadId: string,
  viewerId: string | null,
) {
  if (threadId.length > 100) throw new AppError('Invalid discussion.');
  const thread = await database
    .prepare(
      'SELECT id FROM community_threads WHERE id=? AND hidden=0 AND member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?)',
    )
    .bind(threadId, viewerId)
    .first<{ id: string }>();
  if (!thread) throw new AppError('Discussion unavailable.', 404);
  const [stamp, key = ''] = (url.searchParams.get('cursor') || '0').split(':');
  const cursor = Number(stamp);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || key.length > 40)
    throw new AppError('Invalid cursor.');
  const rows = (
    await database
      .prepare(
        `SELECT r.id,r.member_id,r.thread_id,r.body,r.hidden,r.created_at,${authorColumns} FROM community_replies r JOIN community_members m ON m.id=r.member_id WHERE r.thread_id=? AND r.hidden=0 AND r.member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?) AND (r.created_at>? OR (r.created_at=? AND r.id>?)) ORDER BY r.created_at,r.id LIMIT 51`,
      )
      .bind(thread.id, viewerId, cursor, cursor, key)
      .all<CommunityReply>()
  ).results;
  return {
    replies: rows.slice(0, 50),
    nextCursor:
      rows.length > 50 ? rows[49].created_at + ':' + rows[49].id : null,
  };
}
