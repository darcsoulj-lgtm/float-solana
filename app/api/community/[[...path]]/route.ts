import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  actor,
  auditStatement,
  db,
  digest,
  rateLimit,
  runtime,
} from '@/lib/server';
import { AppError, textValue } from '@/lib/validation';
import { validWallet, verifySignature, detectHoldings } from '@/lib/solana';
import { TOKENS } from '@/lib/tokens';
import {
  communitySignInInput,
  communitySignInMessage,
} from '@/lib/community-sign-in';
import {
  TOPICS,
  type CommunityMember,
  type CommunityThread,
  type CommunityReply,
  type CommunityReport,
  type CommunityRoom,
} from '@/lib/community-types';
import {
  authorColumns,
  communityCookie,
  communityMember,
  communityCleanup,
  MEMBERSHIP_MS,
  sessionCookie,
  validateAlias,
  validateCommunityPost,
} from '@/lib/community-server';
export const dynamic = 'force-dynamic';
function json(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
}

async function listRooms(): Promise<CommunityRoom[]> {
  const custom = (
    await db()
      .prepare(
        'SELECT r.id,r.name,r.description,(SELECT count(*) FROM community_threads WHERE topic=r.id AND hidden=0) thread_count FROM community_rooms r ORDER BY r.created_at DESC',
      )
      .all<CommunityRoom>()
  ).results;
  const legacy = (
    await db()
      .prepare(
        'SELECT topic,count(*) thread_count FROM community_threads WHERE hidden=0 AND topic NOT IN (SELECT id FROM community_rooms) GROUP BY topic',
      )
      .all<{ topic: string; thread_count: number }>()
  ).results;
  return [
    ...custom,
    ...legacy.map((r) => ({
      id: r.topic,
      name: TOPICS.find((t) => t.id === r.topic)?.label || r.topic,
      description: 'Community discussions',
      thread_count: r.thread_count,
    })),
  ];
}

async function handler(req: Request) {
  try {
    const url = new URL(req.url),
      path = url.pathname.replace(/^\/api\/community\/?/, '').split('/'),
      post = req.method === 'POST';
    let b: Record<string, unknown> = {};
    if (post) {
      if (req.headers.get('origin') !== url.origin)
        throw new AppError('A same-origin request is required.', 403);
      if (!req.headers.get('content-type')?.includes('application/json'))
        throw new AppError('Use JSON.', 415);
      const raw = await req.text();
      if (raw.length > 12000) throw new AppError('Request is too large.', 413);
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error();
        b = parsed as Record<string, unknown>;
      } catch {
        throw new AppError('Invalid request.');
      }
      await rateLimit(
        'community-ip:' + (req.headers.get('cf-connecting-ip') || 'local'),
        60,
      );
    }
    if (path[0] === 'wallet-diagnostic' && post) {
      if (
        typeof b.provider !== 'string' ||
        !['phantom', 'backpack', 'solflare'].includes(b.provider) ||
        typeof b.phase !== 'string' ||
        !['connect', 'holdings', 'sign', 'verify'].includes(b.phase) ||
        typeof b.code !== 'string' ||
        ![
          'ok',
          'requested',
          'failed',
          'cancelled',
          'timeout',
          'account-changed',
          'invalid-response',
        ].includes(b.code) ||
        typeof b.flowId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(b.flowId) ||
        (b.clientVersion !== undefined &&
          b.clientVersion !== 12 &&
          b.clientVersion !== 13) ||
        (b.method !== undefined &&
          (typeof b.method !== 'string' ||
            !['signIn', 'signMessage'].includes(b.method)))
      )
        throw new AppError('Invalid diagnostic.');
      console.info(
        'Wallet flow',
        JSON.stringify({
          provider: b.provider,
          phase: b.phase,
          code: b.code,
          flowId: b.flowId,
          clientVersion: b.clientVersion,
          method: b.method,
        }),
      );
      return json({ ok: true });
    }
    if (path[0] === 'status' && !post) {
      const member = await communityMember(req, false),
        user = await getChatGPTUser();
      let admin = false;
      if (user) admin = (await actor()).admin;
      const counts = await db().batch<{ count: number }>([
        db().prepare(
          'SELECT count(*) count FROM community_members WHERE suspended=0',
        ),
        db().prepare(
          'SELECT count(*) count FROM community_threads WHERE hidden=0',
        ),
      ]);
      return json({
        member,
        admin,
        memberCount: counts[0].results[0]?.count || 0,
        threadCount: counts[1].results[0]?.count || 0,
      });
    }
    if (path[0] === 'challenge' && post) {
      if (b.authMethod !== undefined && b.authMethod !== 'signIn')
        throw new AppError('Unsupported authentication method.');
      const wallet = validWallet(textValue(b.wallet, 32, 44, 'Wallet'));
      await rateLimit('community-wallet:' + wallet, 5);
      await communityCleanup();
      const holdings = await detectHoldings(wallet, runtime().SOLANA_RPC_URL);
      if (!holdings.length)
        throw new AppError(
          'No supported stock tokens were found in this wallet. Try another Solana account, or check the supported stocks list. No signature is needed.',
          403,
        );
      const id = crypto.randomUUID(),
        issuedAt = Date.now(),
        expires = issuedAt + 300000;
      const signInInput =
        b.authMethod === 'signIn'
          ? communitySignInInput(url.origin, wallet, id, issuedAt, expires)
          : undefined;
      const message = signInInput
        ? communitySignInMessage(signInInput)
        : `HolderPulse community membership\nOrigin: ${url.origin}\nWallet: ${wallet}\nAccess: All community topics\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nSign to prove control of this wallet and verify supported tokenized-equity holdings for 24-hour community access. Only supported holdings are retained for your private feed; balances are not saved. No transaction or asset transfer is authorized.`;
      await db()
        .prepare(
          'INSERT INTO community_challenges (id,wallet,symbol,message,expires_at,consumed) VALUES (?,?,?,?,?,0)',
        )
        .bind(id, wallet, '*', message, expires)
        .run();
      return json({
        id,
        message,
        expiresAt: expires,
        holdingCount: holdings.length,
        signInInput,
      });
    }
    if (path[0] === 'verify' && post) {
      if (b.consent !== true)
        throw new AppError(
          'Accept the community guidelines and privacy notice to join.',
        );
      const c = await db()
        .prepare(
          'SELECT * FROM community_challenges WHERE id=? AND consumed=0 AND expires_at>?',
        )
        .bind(textValue(b.challengeId, 36, 36, 'Challenge'), Date.now())
        .first<{
          id: string;
          wallet: string;
          symbol: string;
          message: string;
        }>();
      if (!c)
        throw new AppError(
          'This verification expired or was already used. Please sign again.',
          401,
        );
      await verifySignature(c.wallet, c.message, b.signature);
      const consumed = await db()
        .prepare(
          'UPDATE community_challenges SET consumed=1 WHERE id=? AND consumed=0 RETURNING id',
        )
        .bind(c.id)
        .first();
      if (!consumed)
        throw new AppError('This signature has already been used.', 409);
      const holdings = await detectHoldings(c.wallet, runtime().SOLANA_RPC_URL);
      if (!holdings.length)
        throw new AppError(
          'This wallet no longer holds a supported stock token. Please reconnect after checking your holdings.',
          403,
        );
      const walletHash = await digest('holderpulse-community:' + c.wallet),
        now = Date.now(),
        id = crypto.randomUUID();
      await db()
        .prepare(
          'INSERT INTO community_members (id,wallet_hash,alias,qualifying_symbol,show_badge,verified_until,suspended,created_at) VALUES (?,?,?,?,0,?,0,?) ON CONFLICT(wallet_hash) DO UPDATE SET verified_until=excluded.verified_until',
        )
        .bind(
          id,
          walletHash,
          'Holder-' + id.slice(0, 6),
          holdings[0].symbol,
          now + MEMBERSHIP_MS,
          now,
        )
        .run();
      const member = await db()
        .prepare(
          'SELECT id,suspended FROM community_members WHERE wallet_hash=?',
        )
        .bind(walletHash)
        .first<{ id: string; suspended: number }>();
      if (!member || member.suspended)
        throw new AppError(
          'This membership is suspended. Contact the community operator through the support page.',
          403,
        );
      const session = crypto.randomUUID() + crypto.randomUUID();
      await db().batch([
        db()
          .prepare('DELETE FROM community_holdings WHERE member_id=?')
          .bind(member.id),
        ...holdings.map((h) =>
          db()
            .prepare(
              'INSERT INTO community_holdings (member_id,symbol,verified_at,slot) VALUES (?,?,?,?)',
            )
            .bind(member.id, h.symbol, h.verifiedAt, h.slot),
        ),
        db()
          .prepare(
            'UPDATE community_members SET show_badge=0,qualifying_symbol=? WHERE id=? AND qualifying_symbol NOT IN (' +
              holdings.map(() => '?').join(',') +
              ')',
          )
          .bind(
            holdings[0].symbol,
            member.id,
            ...holdings.map((h) => h.symbol),
          ),
        db()
          .prepare('DELETE FROM community_sessions WHERE member_id=?')
          .bind(member.id),
        db()
          .prepare(
            'INSERT INTO community_sessions (hash,member_id,expires_at) VALUES (?,?,?)',
          )
          .bind(await digest(session), member.id, now + MEMBERSHIP_MS),
        db().prepare('DELETE FROM community_challenges WHERE id=?').bind(c.id),
      ]);
      return json({ ok: true }, 200, sessionCookie(session, req));
    }
    if (path[0] === 'logout' && post) {
      const cookie = communityCookie(req);
      if (cookie)
        await db()
          .prepare('DELETE FROM community_sessions WHERE hash=?')
          .bind(await digest(cookie))
          .run();
      return json({ ok: true }, 200, sessionCookie('', req, true));
    }
    if (path[0] === 'moderation') {
      const admin = await actor();
      if (!admin.admin)
        throw new AppError('Administrator access is required.', 403);
      if (post && b.action === 'source') {
        const id = b.id
          ? textValue(b.id, 1, 100, 'Source')
          : crypto.randomUUID();
        const title = textValue(b.title, 5, 160, 'Source title'),
          publisher = textValue(b.publisher, 2, 80, 'Publisher');
        const link = textValue(b.url, 10, 1000, 'Source URL');
        let sourceUrl: URL;
        try {
          sourceUrl = new URL(link);
        } catch {
          throw new AppError('Use a valid HTTPS source URL.');
        }
        if (
          sourceUrl.protocol !== 'https:' ||
          sourceUrl.username ||
          sourceUrl.password ||
          !TOKENS.some((t) => t.symbol === b.symbol) ||
          typeof b.active !== 'boolean'
        )
          throw new AppError(
            'Choose a supported symbol, HTTPS source, and visibility.',
          );
        await db().batch([
          db()
            .prepare(
              'INSERT INTO community_sources (id,symbol,title,publisher,url,active,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET symbol=excluded.symbol,title=excluded.title,publisher=excluded.publisher,url=excluded.url,active=excluded.active',
            )
            .bind(
              id,
              b.symbol,
              title,
              publisher,
              sourceUrl.href,
              b.active ? 1 : 0,
              Date.now(),
            ),
          auditStatement(admin.userId, 'community:source', id),
        ]);
        return json({ ok: true });
      }
      if (!post) {
        const result = await db().batch([
          db().prepare(
            "SELECT r.id,r.target_type,r.target_id,r.reason,r.status,r.created_at,m.alias reporter,CASE WHEN r.target_type='thread' THEN (SELECT title||char(10)||body FROM community_threads WHERE id=r.target_id) ELSE (SELECT body FROM community_replies WHERE id=r.target_id) END content FROM community_reports r JOIN community_members m ON m.id=r.member_id WHERE r.status='open' ORDER BY r.created_at LIMIT 100",
          ),
          db().prepare(
            'SELECT id,alias,qualifying_symbol,show_badge,verified_until,suspended,created_at FROM community_members ORDER BY created_at DESC LIMIT 100',
          ),
          db().prepare(
            'SELECT t.*,m.alias FROM community_threads t JOIN community_members m ON m.id=t.member_id WHERE t.hidden=1 ORDER BY t.created_at DESC LIMIT 50',
          ),
          db().prepare(
            'SELECT r.*,m.alias FROM community_replies r JOIN community_members m ON m.id=r.member_id WHERE r.hidden=1 ORDER BY r.created_at DESC LIMIT 50',
          ),
          db().prepare(
            'SELECT * FROM community_sources ORDER BY created_at DESC LIMIT 100',
          ),
        ]);
        return json({
          sources: result[4].results,
          reports: result[0].results as CommunityReport[],
          members: result[1].results as CommunityMember[],
          hiddenThreads: result[2].results,
          hiddenReplies: result[3].results,
        });
      }
      const id = textValue(b.id, 1, 100, 'Target');
      if (b.action === 'resolve') {
        await db().batch([
          db()
            .prepare(
              "UPDATE community_reports SET status='resolved' WHERE id=?",
            )
            .bind(id),
          auditStatement(admin.userId, 'community:resolve-report', id),
        ]);
        return json({ ok: true });
      }
      if (b.action === 'suspend' || b.action === 'restore-member') {
        await db().batch([
          db()
            .prepare('UPDATE community_members SET suspended=? WHERE id=?')
            .bind(b.action === 'suspend' ? 1 : 0, id),
          db()
            .prepare('DELETE FROM community_sessions WHERE member_id=?')
            .bind(id),
          auditStatement(admin.userId, 'community:' + b.action, id),
        ]);
        return json({ ok: true });
      }
      if (
        !['hide', 'restore'].includes(String(b.action)) ||
        !['thread', 'reply'].includes(String(b.type))
      )
        throw new AppError('Invalid moderation action.');
      const table =
        b.type === 'thread' ? 'community_threads' : 'community_replies';
      await db().batch([
        db()
          .prepare(`UPDATE ${table} SET hidden=? WHERE id=?`)
          .bind(b.action === 'hide' ? 1 : 0, id),
        auditStatement(admin.userId, 'community:' + b.action, id),
      ]);
      return json({ ok: true });
    }
    const member = await communityMember(req);
    if (!member) throw new AppError('Membership required.', 401);
    if (path[0] === 'rooms' && post) {
      const name = textValue(b.name, 3, 60, 'Room name')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim();
      const description = textValue(b.description, 10, 240, 'Description');
      if (name.length < 3 || /[\p{Cc}\p{Cf}]/u.test(name))
        throw new AppError('Use a readable room name of 3–60 characters.');
      const nameKey = name.toLowerCase();
      if (['all', 'general', 'all discussions'].includes(nameKey))
        throw new AppError(
          'That name is reserved for the shared discussion feed.',
        );
      const legacy = TOPICS.find(
        (t) =>
          t.id.toLowerCase() === nameKey || t.label.toLowerCase() === nameKey,
      );
      if (
        legacy &&
        (await db()
          .prepare(
            'SELECT 1 FROM community_threads WHERE topic=? AND hidden=0 LIMIT 1',
          )
          .bind(legacy.id)
          .first())
      )
        throw new AppError(
          'That room already has discussions. Find it in Rooms.',
          409,
        );
      await rateLimit('community-room:' + member.id, 3);
      const id = 'room-' + crypto.randomUUID();
      try {
        await db().batch([
          db()
            .prepare(
              'INSERT INTO community_rooms (id,name,name_key,description,creator_id,created_at) VALUES (?,?,?,?,?,?)',
            )
            .bind(id, name, nameKey, description, member.id, Date.now()),
          db()
            .prepare(
              'INSERT INTO community_follows (member_id,symbol) VALUES (?,?)',
            )
            .bind(member.id, id),
          auditStatement(member.id, 'community:create-room', id),
        ]);
      } catch (e) {
        if (e instanceof Error && /UNIQUE constraint/.test(e.message))
          throw new AppError(
            'A room with that name already exists. Find it in Rooms.',
            409,
          );
        throw e;
      }
      return json({ id }, 201);
    }
    if (path[0] === 'home' && !post) {
      // Reviewed source directories, not generated headlines or member activity.
      const sources = [
        [
          'micron-ir',
          'MU',
          'Earnings, filings & investor updates',
          'Micron',
          'https://investors.micron.com/overview/default.aspx',
        ],
        [
          'skhynix-news',
          'SKHY',
          'Inside the memory industry',
          'SK hynix Newsroom',
          'https://news.skhynix.com/en/',
        ],
        [
          'nvidia-ir',
          'NVDA',
          'Results & company announcements',
          'NVIDIA',
          'https://investor.nvidia.com/home/default.aspx',
        ],
      ];
      await db().batch(
        sources.map((source) =>
          db()
            .prepare(
              'INSERT OR IGNORE INTO community_sources (id,symbol,title,publisher,url,created_at) VALUES (?,?,?,?,?,?)',
            )
            .bind(...source, 1788994800000),
        ),
      );
      const result = await db().batch([
        db()
          .prepare(
            'SELECT symbol,verified_at,slot FROM community_holdings WHERE member_id=? ORDER BY symbol',
          )
          .bind(member.id),
        db()
          .prepare(
            'SELECT symbol FROM community_follows WHERE member_id=? ORDER BY symbol',
          )
          .bind(member.id),
        db()
          .prepare(
            "SELECT s.*,EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.member_id=? AND b.target_type='source' AND b.target_id=s.id) saved FROM community_sources s WHERE s.active=1 ORDER BY s.created_at DESC,s.id LIMIT 100",
          )
          .bind(member.id),
        db()
          .prepare(
            'SELECT n.id,n.thread_id,n.read,n.created_at,t.title,m.alias FROM community_notifications n JOIN community_threads t ON t.id=n.thread_id JOIN community_replies r ON r.id=n.reply_id JOIN community_members m ON m.id=r.member_id WHERE n.member_id=? AND t.hidden=0 AND r.hidden=0 ORDER BY n.created_at DESC LIMIT 30',
          )
          .bind(member.id),
      ]);
      return json({
        rooms: await listRooms(),
        holdings: result[0].results,
        follows: (result[1].results as { symbol: string }[]).map(
          (r) => r.symbol,
        ),
        sources: result[2].results,
        notifications: result[3].results,
      });
    }
    if (path[0] === 'follow' && post) {
      if (
        (b.symbol !== 'general' &&
          !TOKENS.some((t) => t.symbol === b.symbol) &&
          !(
            typeof b.symbol === 'string' &&
            (await db()
              .prepare('SELECT id FROM community_rooms WHERE id=?')
              .bind(b.symbol)
              .first())
          )) ||
        typeof b.follow !== 'boolean'
      )
        throw new AppError('Choose a supported topic and follow preference.');
      await db()
        .prepare(
          b.follow
            ? 'INSERT OR IGNORE INTO community_follows (member_id,symbol) VALUES (?,?)'
            : 'DELETE FROM community_follows WHERE member_id=? AND symbol=?',
        )
        .bind(member.id, b.symbol)
        .run();
      return json({ ok: true });
    }
    if (path[0] === 'save' && post) {
      if (
        !['thread', 'source'].includes(String(b.type)) ||
        typeof b.save !== 'boolean'
      )
        throw new AppError('Invalid saved item.');
      const id = textValue(b.id, 1, 100, 'Item');
      const table =
        b.type === 'thread' ? 'community_threads' : 'community_sources';
      const visible = b.type === 'thread' ? 'hidden=0' : 'active=1';
      if (
        b.save &&
        !(await db()
          .prepare(`SELECT id FROM ${table} WHERE id=? AND ${visible}`)
          .bind(id)
          .first())
      )
        throw new AppError('Item unavailable.', 404);
      await (
        b.save
          ? db()
              .prepare(
                'INSERT OR IGNORE INTO community_bookmarks (member_id,target_type,target_id,created_at) VALUES (?,?,?,?)',
              )
              .bind(member.id, b.type, id, Date.now())
          : db()
              .prepare(
                'DELETE FROM community_bookmarks WHERE member_id=? AND target_type=? AND target_id=?',
              )
              .bind(member.id, b.type, id)
      ).run();
      return json({ ok: true });
    }
    if (path[0] === 'notifications' && post) {
      await db()
        .prepare('UPDATE community_notifications SET read=1 WHERE member_id=?')
        .bind(member.id)
        .run();
      return json({ ok: true });
    }
    if (path[0] === 'profile' && post) {
      const alias = validateAlias(b.alias);
      if (typeof b.showBadge !== 'boolean')
        throw new AppError('Choose a badge preference.');
      const symbol =
        typeof b.badgeSymbol === 'string'
          ? b.badgeSymbol
          : member.qualifying_symbol;
      if (
        symbol !== member.qualifying_symbol &&
        !(await db()
          .prepare(
            'SELECT 1 FROM community_holdings WHERE member_id=? AND symbol=?',
          )
          .bind(member.id, symbol)
          .first())
      )
        throw new AppError('Only a verified holding can appear as your badge.');
      if (b.notifyReplies !== undefined && typeof b.notifyReplies !== 'boolean')
        throw new AppError('Invalid notification preference.');
      await db()
        .prepare(
          'UPDATE community_members SET alias=?,show_badge=?,qualifying_symbol=?,notify_replies=? WHERE id=?',
        )
        .bind(
          alias,
          b.showBadge ? 1 : 0,
          symbol,
          b.notifyReplies === undefined
            ? member.notify_replies
            : b.notifyReplies
              ? 1
              : 0,
          member.id,
        )
        .run();
      return json({ ok: true });
    }
    if (path[0] === 'threads' && !path[1]) {
      if (post) {
        const p = validateCommunityPost(b);
        if (
          p.topic.startsWith('room-') &&
          !(await db()
            .prepare('SELECT id FROM community_rooms WHERE id=?')
            .bind(p.topic)
            .first())
        )
          throw new AppError('Room no longer exists.', 404);
        await rateLimit('community-post:' + member.id, 3);
        const id = crypto.randomUUID(),
          now = Date.now();
        await db()
          .prepare(
            'INSERT INTO community_threads (id,member_id,topic,title,body,hidden,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)',
          )
          .bind(id, member.id, p.topic, p.title, p.body, now, now)
          .run();
        return json({ id }, 201);
      }
      const topic = url.searchParams.get('topic') || 'all';
      const feed = url.searchParams.get('feed') || 'all';
      if (!['all', 'personal', 'saved'].includes(feed))
        throw new AppError('Unknown feed.');
      const threadId = url.searchParams.get('thread') || '';
      if (threadId.length > 100) throw new AppError('Invalid discussion.');
      if (
        !TOPICS.some((t) => t.id === topic) &&
        !(await db()
          .prepare('SELECT id FROM community_rooms WHERE id=?')
          .bind(topic)
          .first())
      )
        throw new AppError('Unknown topic.');
      const [stamp, key = '~'] = (
        url.searchParams.get('cursor') || String(Date.now() + 1)
      ).split(':');
      const cursor = Number(stamp);
      if (!Number.isSafeInteger(cursor) || cursor < 0 || key.length > 40)
        throw new AppError('Invalid cursor.');
      const rows = (
        await db()
          .prepare(
            `SELECT t.id,t.member_id,t.topic,(SELECT name FROM community_rooms WHERE id=t.topic) room_name,t.title,t.body,t.created_at,t.hidden,${authorColumns},EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.member_id=? AND b.target_type='thread' AND b.target_id=t.id) saved,(SELECT count(*) FROM community_replies r WHERE r.thread_id=t.id AND r.hidden=0) reply_count FROM community_threads t JOIN community_members m ON m.id=t.member_id WHERE t.hidden=0 AND (?='all' OR t.topic=?) AND (?='' OR t.id=?) AND (?!='personal' OR t.topic='general' OR t.topic IN (SELECT symbol FROM community_holdings WHERE member_id=? UNION SELECT symbol FROM community_follows WHERE member_id=?)) AND (?!='saved' OR EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.member_id=? AND b.target_type='thread' AND b.target_id=t.id)) AND (t.created_at<? OR (t.created_at=? AND t.id<?)) ORDER BY t.created_at DESC,t.id DESC LIMIT 31`,
          )
          .bind(
            Date.now(),
            member.id,
            topic,
            topic,
            threadId,
            threadId,
            feed,
            member.id,
            member.id,
            feed,
            member.id,
            cursor,
            cursor,
            key,
          )
          .all<CommunityThread>()
      ).results;
      return json({
        threads: rows.slice(0, 30),
        nextCursor:
          rows.length > 30 ? rows[29].created_at + ':' + rows[29].id : null,
      });
    }
    if (path[0] === 'threads' && path[1]) {
      const thread = await db()
        .prepare('SELECT id,member_id,hidden FROM community_threads WHERE id=?')
        .bind(path[1])
        .first<{ id: string; member_id: string; hidden: number }>();
      if (!thread || thread.hidden)
        throw new AppError('Discussion unavailable.', 404);
      if (path[2] === 'remove' && post) {
        if (thread.member_id !== member.id)
          throw new AppError('You can only remove your own discussion.', 403);
        await db()
          .prepare('UPDATE community_threads SET hidden=1 WHERE id=?')
          .bind(thread.id)
          .run();
        return json({ ok: true });
      }
      if (path[2] === 'replies') {
        if (post) {
          await rateLimit('community-reply:' + member.id, 10);
          const body = textValue(b.body, 1, 2000, 'Reply'),
            id = crypto.randomUUID(),
            now = Date.now();
          const inserted = await db()
            .prepare(
              'INSERT INTO community_replies (id,thread_id,member_id,body,hidden,created_at) SELECT ?,?,?,?,0,? WHERE EXISTS (SELECT 1 FROM community_threads WHERE id=? AND hidden=0)',
            )
            .bind(id, thread.id, member.id, body, now, thread.id)
            .run();
          if (!inserted.meta.changes)
            throw new AppError('Discussion unavailable.', 404);
          if (thread.member_id !== member.id)
            await db()
              .prepare(
                'INSERT INTO community_notifications (id,member_id,thread_id,reply_id,read,created_at) SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM community_members WHERE id=? AND notify_replies=1 AND suspended=0)',
              )
              .bind(
                crypto.randomUUID(),
                thread.member_id,
                thread.id,
                id,
                now,
                thread.member_id,
              )
              .run();
          return json({ id }, 201);
        }
        const [stamp, key = ''] = (url.searchParams.get('cursor') || '0').split(
          ':',
        );
        const cursor = Number(stamp);
        if (!Number.isSafeInteger(cursor) || cursor < 0 || key.length > 40)
          throw new AppError('Invalid cursor.');
        const rows = (
          await db()
            .prepare(
              `SELECT r.id,r.member_id,r.thread_id,r.body,r.hidden,r.created_at,${authorColumns} FROM community_replies r JOIN community_members m ON m.id=r.member_id WHERE r.thread_id=? AND r.hidden=0 AND (r.created_at>? OR (r.created_at=? AND r.id>?)) ORDER BY r.created_at,r.id LIMIT 51`,
            )
            .bind(Date.now(), thread.id, cursor, cursor, key)
            .all<CommunityReply>()
        ).results;
        return json({
          replies: rows.slice(0, 50),
          nextCursor:
            rows.length > 50 ? rows[49].created_at + ':' + rows[49].id : null,
        });
      }
    }
    if (path[0] === 'replies' && path[1] && path[2] === 'remove' && post) {
      const r = await db()
        .prepare(
          'UPDATE community_replies SET hidden=1 WHERE id=? AND member_id=? RETURNING id',
        )
        .bind(path[1], member.id)
        .first();
      if (!r) throw new AppError('You can only remove your own reply.', 403);
      return json({ ok: true });
    }
    if (path[0] === 'reports' && post) {
      await rateLimit('community-report:' + member.id, 5);
      if (b.type !== 'thread' && b.type !== 'reply')
        throw new AppError('Invalid report target.');
      const id = textValue(b.id, 1, 100, 'Target'),
        reason = textValue(b.reason, 5, 500, 'Reason'),
        table = b.type === 'thread' ? 'community_threads' : 'community_replies';
      if (
        !(await db()
          .prepare(`SELECT id FROM ${table} WHERE id=? AND hidden=0`)
          .bind(id)
          .first())
      )
        throw new AppError('Content unavailable.', 404);
      await db()
        .prepare(
          "INSERT INTO community_reports (id,member_id,target_type,target_id,reason,status,created_at) VALUES (?,?,?,?,?,'open',?) ON CONFLICT(member_id,target_type,target_id) DO UPDATE SET reason=excluded.reason,status='open'",
        )
        .bind(crypto.randomUUID(), member.id, b.type, id, reason, Date.now())
        .run();
      return json({ ok: true });
    }
    throw new AppError('Endpoint not found.', 404);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    console.error(
      'Community request failed',
      e instanceof Error ? e.name : 'unknown',
    );
    return json(
      { error: 'The community is temporarily unavailable. Please try again.' },
      500,
    );
  }
}
export const GET = handler;
export async function POST(req: Request) {
  const response = await handler(req);
  const path = new URL(req.url).pathname;
  const operation =
    path === '/api/community/verify'
      ? 'verify'
      : path === '/api/community/threads'
        ? 'post'
        : null;
  if (operation) {
    const { recordOperation } = await import('@/lib/editorial-server');
    await recordOperation(operation, response.status);
  }
  return response;
}
