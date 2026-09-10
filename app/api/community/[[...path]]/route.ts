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
import { validWallet, verifySignature, verifyHolding } from '@/lib/solana';
import { TOKENS } from '@/lib/tokens';
import {
  TOPICS,
  type CommunityMember,
  type CommunityThread,
  type CommunityReply,
  type CommunityReport,
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
      const wallet = validWallet(textValue(b.wallet, 32, 44, 'Wallet'));
      if (!TOKENS.some((t) => t.symbol === b.symbol && t.mint))
        throw new AppError('Choose a supported token: MU or SKHY.');
      await rateLimit('community-wallet:' + wallet, 5);
      await communityCleanup();
      const id = crypto.randomUUID(),
        expires = Date.now() + 300000;
      const message = `HolderPulse community membership\nOrigin: ${url.origin}\nWallet: ${wallet}\nToken: ${String(b.symbol)}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nSign to verify a holding and join all community topics for 24 hours. No transaction or asset transfer is authorized.`;
      await db()
        .prepare(
          'INSERT INTO community_challenges (id,wallet,symbol,message,expires_at,consumed) VALUES (?,?,?,?,?,0)',
        )
        .bind(id, wallet, b.symbol, message, expires)
        .run();
      return json({ id, message, expiresAt: expires });
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
      await verifyHolding(c.wallet, c.symbol, runtime().SOLANA_RPC_URL);
      const walletHash = await digest('holderpulse-community:' + c.wallet),
        now = Date.now(),
        id = crypto.randomUUID();
      await db()
        .prepare(
          'INSERT INTO community_members (id,wallet_hash,alias,qualifying_symbol,show_badge,verified_until,suspended,created_at) VALUES (?,?,?,?,0,?,0,?) ON CONFLICT(wallet_hash) DO UPDATE SET qualifying_symbol=excluded.qualifying_symbol,verified_until=excluded.verified_until',
        )
        .bind(
          id,
          walletHash,
          'Holder-' + id.slice(0, 6),
          c.symbol,
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
        ]);
        return json({
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
    if (path[0] === 'profile' && post) {
      const alias = validateAlias(b.alias);
      if (typeof b.showBadge !== 'boolean')
        throw new AppError('Choose a badge preference.');
      await db()
        .prepare('UPDATE community_members SET alias=?,show_badge=? WHERE id=?')
        .bind(alias, b.showBadge ? 1 : 0, member.id)
        .run();
      return json({ ok: true });
    }
    if (path[0] === 'threads' && !path[1]) {
      if (post) {
        await rateLimit('community-post:' + member.id, 3);
        const p = validateCommunityPost(b),
          id = crypto.randomUUID(),
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
      if (!TOPICS.some((t) => t.id === topic))
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
            `SELECT t.id,t.member_id,t.topic,t.title,t.body,t.created_at,t.hidden,${authorColumns},(SELECT count(*) FROM community_replies r WHERE r.thread_id=t.id AND r.hidden=0) reply_count FROM community_threads t JOIN community_members m ON m.id=t.member_id WHERE t.hidden=0 AND (?='all' OR t.topic=?) AND (t.created_at<? OR (t.created_at=? AND t.id<?)) ORDER BY t.created_at DESC,t.id DESC LIMIT 31`,
          )
          .bind(Date.now(), topic, topic, cursor, cursor, key)
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
export const POST = handler;
