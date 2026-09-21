import { readRooms } from '@/lib/community-rooms';
import { verifiedRegistry } from '@/lib/registry-server';
import { readBoundedText } from '@/lib/request-body';
import { communityHome } from '@/lib/community-home';
import { updateHolderTier } from '@/lib/holder-tier-server';
import { refreshHoldings } from '@/lib/holdings-refresh';
import { adminWallet, adminChallenge, adminVerify, adminLogout } from '@/lib/admin-wallet';
import {
  auditStatement,
  db,
  digest,
  rateLimit,
  runtime,
} from '@/lib/server';
import { AppError, textValue } from '@/lib/validation';
import { validWallet, verifySignature, detectHoldings } from '@/lib/solana';
import { WALLET_HANDOFF_MS } from '@/lib/wallet-handoff';

import {
  communitySignInInput,
  communitySignInMessage,
} from '@/lib/community-sign-in';
import {
  communityTopics,
  COMMUNITY_CHANNELS,
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
  validateCommunityPoll,
  validateCommunityPost,
  pollClosesAt,
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
    let registryRead: ReturnType<typeof verifiedRegistry> | undefined;
    const registry = () => (registryRead ??= verifiedRegistry());
    let b: Record<string, unknown> = {};
    if (post) {
      if (req.headers.get('origin') !== url.origin)
        throw new AppError('A same-origin request is required.', 403);
      if (!req.headers.get('content-type')?.includes('application/json'))
        throw new AppError('Use JSON.', 415);
      const raw = await readBoundedText(req, 32768);
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
    if (path[0] === 'admin-auth') {
      if (path[1] === 'status' && !post)
        return json({ admin: !!(await adminWallet(req, false)) });
      if (path[1] === 'challenge' && post)
        return json(await adminChallenge(req, b.wallet));
      if (path[1] === 'verify' && post)
        return json({ ok: true }, 200, await adminVerify(req, b.challengeId, b.signature));
      if (path[1] === 'logout' && post)
        return json({ ok: true }, 200, await adminLogout(req));
      throw new AppError('Unknown administrator request.', 404);
    }
    if (path[0] === 'status' && !post) {
      const [member, adminWalletAddress, counts] = await Promise.all([
        communityMember(req, false),
        adminWallet(req, false),
        db().batch<{ count: number }>([
          db().prepare(
            'SELECT count(*) count FROM community_members WHERE suspended=0',
          ),
          db().prepare(
            'SELECT count(*) count FROM community_threads WHERE hidden=0',
          ),
        ]),
      ]);
      const admin = !!adminWalletAddress;
      return json({
        member,
        admin,
        memberCount: counts[0].results[0]?.count || 0,
        threadCount: counts[1].results[0]?.count || 0,
      });
    }
    if (path[0] === 'handoff' && path[1] === 'start' && post) {
      const secret = textValue(b.secret, 64, 64, 'Handoff secret');
      if (!/^[a-f0-9]{64}$/.test(secret)) throw new AppError('Invalid handoff secret.');
      const id = crypto.randomUUID();
      const expiresAt = Date.now() + WALLET_HANDOFF_MS;
      await db().prepare(
        'INSERT INTO wallet_handoffs (id,secret_hash,expires_at) VALUES (?,?,?)',
      ).bind(id, await digest(secret), expiresAt).run();
      return json({ id, expiresAt });
    }
    if (path[0] === 'handoff' && path[1] === 'claim' && post) {
      const id = textValue(b.id, 36, 36, 'Handoff');
      const secret = textValue(b.secret, 64, 64, 'Handoff secret');
      if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(secret))
        throw new AppError('Invalid handoff.');
      const secretHash = await digest(secret);
      const handoff = await db().prepare(
        'SELECT h.member_id,h.wallet FROM wallet_handoffs h JOIN community_members m ON m.id=h.member_id WHERE h.id=? AND h.secret_hash=? AND h.expires_at>? AND m.verified_until>? AND m.suspended=0',
      ).bind(id, secretHash, Date.now(), Date.now()).first<{ member_id: string; wallet: string }>();
      if (!handoff) return json({ ready: false });
      const consumed = await db().prepare(
        'DELETE FROM wallet_handoffs WHERE id=? AND secret_hash=? AND member_id=? AND expires_at>? RETURNING id',
      ).bind(id, secretHash, handoff.member_id, Date.now()).first();
      if (!consumed) return json({ ready: false });
      const session = crypto.randomUUID() + crypto.randomUUID();
      await db().prepare(
        'INSERT INTO community_sessions (hash,member_id,expires_at,wallet) VALUES (?,?,?,?)',
      ).bind(await digest(session), handoff.member_id, Date.now() + MEMBERSHIP_MS, handoff.wallet).run();
      return json({ ready: true }, 200, sessionCookie(session, req));
    }
    if (path[0] === 'challenge' && post) {
      const handoffId = b.handoffId === undefined ? null : textValue(b.handoffId, 36, 36, 'Handoff');
      if (handoffId && !await db().prepare('SELECT id FROM wallet_handoffs WHERE id=? AND member_id IS NULL AND expires_at>?').bind(handoffId, Date.now()).first()) {
        throw new AppError('Return to Float and start wallet connection again.', 400);
      }
      if (b.authMethod !== undefined && b.authMethod !== 'signIn')
        throw new AppError('Unsupported authentication method.');
      const wallet = validWallet(textValue(b.wallet, 32, 44, 'Wallet'));
      await rateLimit('community-wallet:' + wallet, 5);
      await communityCleanup();
      const holdings = await detectHoldings(
        wallet,
        runtime().SOLANA_RPC_URL,
        fetch,
        false,
        (await registry()).tokens,
      );
      if (!holdings.length)
        return json(
          {
            error:
              'No supported tokenized stocks were found in this wallet. Try another Solana account, or view eligible stocks. No signature is needed.',
            code: 'NO_SUPPORTED_HOLDINGS',
          },
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
        : `Float community membership\nOrigin: ${url.origin}\nWallet: ${wallet}\nAccess: All community topics\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nSign to prove control of this wallet and verify supported tokenized-equity holdings for 24-hour community access. Your wallet address is kept for this session to refresh supported holdings; supported balances are stored privately to show your portfolio and verify access. No transaction or asset transfer is authorized.`;
      await db()
        .prepare(
          'INSERT INTO community_challenges (id,wallet,symbol,message,expires_at,consumed,handoff_id) VALUES (?,?,?,?,?,0,?)',
        )
        .bind(id, wallet, '*', message, expires, handoffId)
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
          handoff_id: string | null;
        }>();
      if (!c)
        throw new AppError(
          'This verification expired or was already used. Please sign again.',
          401,
        );
      const requestedHandoff = b.handoffId === undefined ? null : textValue(b.handoffId, 36, 36, 'Handoff');
      if (c.handoff_id && requestedHandoff && c.handoff_id !== requestedHandoff)
        throw new AppError('The app sign-in request changed. Start again.', 400);
      // New clients bind at challenge creation. Keep old in-flight clients compatible.
      const handoffId = c.handoff_id || requestedHandoff;
      if (handoffId && !await db().prepare('SELECT id FROM wallet_handoffs WHERE id=? AND member_id IS NULL AND expires_at>?').bind(handoffId, Date.now()).first())
        throw new AppError('Return to Float and start wallet connection again.', 400);
      await verifySignature(c.wallet, c.message, b.signature);
      const consumed = await db()
        .prepare(
          'UPDATE community_challenges SET consumed=1 WHERE id=? AND consumed=0 RETURNING id',
        )
        .bind(c.id)
        .first();
      if (!consumed)
        throw new AppError('This signature has already been used.', 409);
      const holdings = await detectHoldings(
        c.wallet,
        runtime().SOLANA_RPC_URL,
        fetch,
        true,
        (await registry()).tokens,
      );
      if (!holdings.length)
        throw new AppError(
          'This wallet no longer holds a supported tokenized stock. Please reconnect after checking your holdings.',
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
      const committed = await db().batch([
        db()
          .prepare(
            'UPDATE community_members SET value_tier=NULL,value_tier_expires_at=0 WHERE id=?',
          )
          .bind(member.id),
        db()
          .prepare('DELETE FROM community_holdings WHERE member_id=?')
          .bind(member.id),
        ...holdings.map((h) =>
          db()
            .prepare(
              'INSERT INTO community_holdings (member_id,symbol,verified_at,slot,raw_amount,decimals,ui_amount) VALUES (?,?,?,?,?,?,?)',
            )
            .bind(
              member.id,
              h.symbol,
              h.verifiedAt,
              h.slot,
              h.rawAmount ?? null,
              h.decimals ?? null,
              h.uiAmount ?? null,
            ),
        ),
        db()
          .prepare(
            'UPDATE community_members SET show_badge=0,qualifying_symbol=? WHERE id=? AND qualifying_symbol NOT IN (SELECT value FROM json_each(?))',
          )
          .bind(
            holdings[0].symbol,
            member.id,
            JSON.stringify(holdings.map((h) => h.symbol)),
          ),
        db()
          .prepare('DELETE FROM community_sessions WHERE member_id=?')
          .bind(member.id),
        db()
          .prepare(
            'INSERT INTO community_sessions (hash,member_id,expires_at,wallet) VALUES (?,?,?,?)',
          )
          .bind(
            await digest(session),
            member.id,
            now + MEMBERSHIP_MS,
            c.wallet,
          ),
        db().prepare('DELETE FROM community_challenges WHERE id=?').bind(c.id),
        ...(handoffId ? [db().prepare(
          'UPDATE wallet_handoffs SET member_id=?,wallet=? WHERE id=? AND member_id IS NULL AND expires_at>?',
        ).bind(member.id, c.wallet, handoffId, Date.now())] : []),
      ]);
      if (handoffId && committed.at(-1)?.meta.changes !== 1)
        throw new AppError('App sign-in expired. Reopen Float and connect again.', 400);
      return json({ ok: true, handoffReady: !!handoffId }, 200, sessionCookie(session, req));
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
      const wallet = await adminWallet(req);
      const admin = { userId: 'wallet:' + (await digest(wallet)) };
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
          !(await registry()).tokens.some((t) => t.symbol === b.symbol) ||
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
    if (path[0] === 'holdings-refresh' && post) {
      await rateLimit('holdings-refresh:' + member!.id, 10);
      await communityCleanup();
      return json(
        await refreshHoldings(
          db(),
          await digest(communityCookie(req)!),
          member!.id,
          runtime().SOLANA_RPC_URL,
          b.force === true,
          (await registry()).tokens,
        ),
      );
    }
    if (!member) throw new AppError('Membership required.', 401);
    if (path[0] === 'holder-tier' && post) {
      await rateLimit('holder-tier:' + member.id, 10);
      const result = await updateHolderTier(
        db(), member.id, runtime().SOLANA_RPC_URL,
        runtime().CMC_API_KEY, (await registry()).registry,
      );
      return json(result.tier ? result : { tier: 'bronze', expiresAt: member.verified_until });
    }
    if (path[0] === 'rooms' && !post) {
      await rateLimit('community-rooms:' + member.id, 60);
      return json(
        await readRooms(
          db(),
          url.searchParams.get('cursor') || '',
          url.searchParams.get('q') || '',
        ),
      );
    }
    if (path[0] === 'rooms' && post) {
      throw new AppError('Only Float can create channels.', 403);
    }
    if (path[0] === 'channels' && !post) {
      await rateLimit('community-channels:' + member.id, 60);
      const counts = (
        await db()
          .prepare(
            'SELECT topic,COUNT(*) thread_count FROM community_threads WHERE hidden=0 GROUP BY topic',
          )
          .all<{ topic: string; thread_count: number }>()
      ).results;
      const countByTopic = new Map(
        counts.map((row) => [row.topic, Number(row.thread_count)]),
      );
      return json({
        channels: COMMUNITY_CHANNELS.map((channel) => ({
          ...channel,
          thread_count: countByTopic.get(channel.id) || 0,
        })),
      });
    }
    if (path[0] === 'channels' && post)
      throw new AppError('Channels are curated by Float.', 403);
    if (path[0] === 'home' && !post) {
      return json({
        ...(await communityHome(
          db(),
          member.id,
          await digest(communityCookie(req)!),
        )),
        registry: (await registry()).registry,
      });
    }
    if (path[0] === 'follow' && post) {
      if (
        (b.symbol !== 'general' &&
          !(
            typeof b.symbol === 'string' &&
            COMMUNITY_CHANNELS.some((channel) => channel.id === b.symbol)
          ) &&
          !(await registry()).tokens.some((t) => t.symbol === b.symbol) &&
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
      const bio =
        b.bio === undefined
          ? member.bio || ''
          : textValue(b.bio, 0, 160, 'Bio');
      if (b.notifyReplies !== undefined && typeof b.notifyReplies !== 'boolean')
        throw new AppError('Invalid notification preference.');
      if (
        b.showValueBadge !== undefined &&
        typeof b.showValueBadge !== 'boolean'
      )
        throw new AppError('Invalid value badge preference.');
      await db()
        .prepare(
          'UPDATE community_members SET alias=?,bio=?,show_badge=0,notify_replies=?,show_value_badge=? WHERE id=?',
        )
        .bind(
          alias,
          bio,
          b.notifyReplies === undefined
            ? member.notify_replies
            : b.notifyReplies
              ? 1
              : 0,
          b.showValueBadge === undefined
            ? member.show_value_badge || 0
            : b.showValueBadge
              ? 1
              : 0,
          member.id,
        )
        .run();
      return json({ ok: true });
    }
    if (path[0] === 'threads' && !path[1]) {
      if (post) {
        const p = validateCommunityPost(b, (await registry()).tokens);
        const poll = validateCommunityPoll(b.poll);
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
        const token = (await registry()).tokens.find(
          (t) => t.symbol === p.topic,
        );
        await db().batch([
          ...(!p.topic.startsWith('room-') &&
          !COMMUNITY_CHANNELS.some((channel) => channel.id === p.topic)
            ? [
                db()
                  .prepare(
                    'INSERT OR IGNORE INTO community_rooms(id,name,name_key,description,creator_id,created_at) VALUES(?,?,?,?,?,?)',
                  )
                  .bind(
                    p.topic,
                    token?.shortName || p.topic,
                    'topic:' + p.topic.toLowerCase(),
                    'Community discussions',
                    member.id,
                    now,
                  ),
              ]
            : []),
          db()
            .prepare(
              'INSERT INTO community_threads (id,member_id,topic,title,body,hidden,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)',
            )
            .bind(id, member.id, p.topic, p.title, p.body, now, now),
          ...(poll
            ? [
                db()
                  .prepare(
                    'INSERT INTO community_polls (thread_id,closes_at,created_at) VALUES (?,?,?)',
                  )
                  .bind(id, pollClosesAt(poll.duration, now), now),
                ...poll.options.map((label, position) =>
                  db()
                    .prepare(
                      'INSERT INTO community_poll_options (id,thread_id,label,position) VALUES (?,?,?,?)',
                    )
                    .bind(crypto.randomUUID(), id, label, position),
                ),
              ]
            : []),
        ]);
        return json({ id }, 201);
      }
      const topic = url.searchParams.get('topic') || 'all';
      const feed = url.searchParams.get('feed') || 'all';
      if (!['all', 'personal', 'saved', 'mine'].includes(feed))
        throw new AppError('Unknown feed.');
      const threadId = url.searchParams.get('thread') || '';
      if (threadId.length > 100) throw new AppError('Invalid discussion.');
      if (
        !communityTopics((await registry()).tokens).some(
          (t) => t.id === topic,
        ) &&
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
            `SELECT t.id,t.member_id,t.topic,(SELECT name FROM community_rooms WHERE id=t.topic) room_name,t.title,t.body,t.created_at,t.hidden,${authorColumns},EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.member_id=? AND b.target_type='thread' AND b.target_id=t.id) saved,(SELECT count(*) FROM community_replies r WHERE r.thread_id=t.id AND r.hidden=0 AND r.member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?)) reply_count FROM community_threads t JOIN community_members m ON m.id=t.member_id WHERE t.hidden=0 AND t.member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?) AND (?='all' OR t.topic=?) AND (?='' OR t.id=?) AND (?!='personal' OR t.topic='general' OR t.topic IN (SELECT symbol FROM community_holdings WHERE member_id=? UNION SELECT symbol FROM community_follows WHERE member_id=?)) AND (?!='saved' OR EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.member_id=? AND b.target_type='thread' AND b.target_id=t.id)) AND (?!='mine' OR t.member_id=?) AND (t.created_at<? OR (t.created_at=? AND t.id<?)) ORDER BY t.created_at DESC,t.id DESC LIMIT 31`,
          )
          .bind(
            member.id,
            member.id,
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
            feed,
            member.id,
            cursor,
            cursor,
            key,
          )
          .all<CommunityThread>()
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
          await db()
            .prepare(
              `SELECT p.thread_id,p.closes_at,o.id,o.label,o.position,COUNT(v.member_id) vote_count,MAX(CASE WHEN v.member_id=? THEN 1 ELSE 0 END) selected FROM community_polls p JOIN community_poll_options o ON o.thread_id=p.thread_id LEFT JOIN community_poll_votes v ON v.option_id=o.id WHERE p.thread_id IN (${placeholders}) GROUP BY p.thread_id,p.closes_at,o.id,o.label,o.position ORDER BY o.position`,
            )
            .bind(member.id, ...pageRows.map((row) => row.id))
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
      return json({
        threads: pageRows.map((row) => {
          const options = pollOptions.get(row.id);
          const selected = !!options?.some((option) => option.selected);
          const closed = !!options?.[0]?.closes_at && options[0].closes_at <= Date.now();
          const resultsVisible = selected || closed;
          return {
          ...row,
          room_name:
            row.room_name ||
            COMMUNITY_CHANNELS.find((channel) => channel.id === row.topic)
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
      });
    }
    if (path[0] === 'blocks') {
      if (!post) {
        const blockedMembers = (
          await db()
            .prepare(
              'SELECT m.id,m.alias,m.avatar_key FROM community_blocks b JOIN community_members m ON m.id=b.blocked_id WHERE b.blocker_id=? ORDER BY m.alias,m.id',
            )
            .bind(member.id)
            .all()
        ).results;
        return json({ blockedMembers });
      }
      const blockedId = textValue(b.memberId, 36, 36, 'Member');
      if (blockedId === member.id)
        throw new AppError('You cannot block yourself.');
      if (
        !(await db()
          .prepare('SELECT id FROM community_members WHERE id=?')
          .bind(blockedId)
          .first())
      )
        throw new AppError('Member unavailable.', 404);
      if (b.block === true)
        await db()
          .prepare(
            'INSERT INTO community_blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?) ON CONFLICT(blocker_id,blocked_id) DO NOTHING',
          )
          .bind(member.id, blockedId, Date.now())
          .run();
      else if (b.block === false)
        await db()
          .prepare(
            'DELETE FROM community_blocks WHERE blocker_id=? AND blocked_id=?',
          )
          .bind(member.id, blockedId)
          .run();
      else throw new AppError('Choose whether to block this member.');
      return json({ ok: true });
    }
    if (path[0] === 'threads' && path[1]) {
      const thread = await db()
        .prepare(
          'SELECT id,member_id,hidden FROM community_threads WHERE id=? AND member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?)',
        )
        .bind(path[1], member.id)
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
      if (path[2] === 'poll' && path[3] === 'vote' && post) {
        await rateLimit('community-poll:' + member.id, 10);
        const poll = await db()
          .prepare(
            'SELECT closes_at FROM community_polls WHERE thread_id=?',
          )
          .bind(thread.id)
          .first<{ closes_at: number | null }>();
        if (!poll) throw new AppError('Poll unavailable.', 404);
        if (poll.closes_at !== null && poll.closes_at <= Date.now())
          throw new AppError('This poll is closed.', 409);
        const optionId = textValue(b.optionId, 36, 36, 'Poll option');
        const option = await db()
          .prepare(
            'SELECT id FROM community_poll_options WHERE id=? AND thread_id=?',
          )
          .bind(optionId, thread.id)
          .first();
        if (!option) throw new AppError('Poll option unavailable.', 404);
        const voted = await db()
          .prepare(
            'INSERT INTO community_poll_votes(thread_id,member_id,option_id,created_at) VALUES (?,?,?,?) ON CONFLICT(thread_id,member_id) DO NOTHING',
          )
          .bind(thread.id, member.id, optionId, Date.now())
          .run();
        if (!voted.meta.changes)
          throw new AppError('You have already voted in this poll.', 409);
        return json({ ok: true }, 201);
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
                'INSERT INTO community_notifications (id,member_id,thread_id,reply_id,read,created_at) SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM community_members WHERE id=? AND notify_replies=1 AND suspended=0) AND NOT EXISTS(SELECT 1 FROM community_blocks WHERE blocker_id=? AND blocked_id=?)',
              )
              .bind(
                crypto.randomUUID(),
                thread.member_id,
                thread.member_id,
                member.id,
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
              `SELECT r.id,r.member_id,r.thread_id,r.body,r.hidden,r.created_at,${authorColumns} FROM community_replies r JOIN community_members m ON m.id=r.member_id WHERE r.thread_id=? AND r.hidden=0 AND r.member_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id=?) AND (r.created_at>? OR (r.created_at=? AND r.id>?)) ORDER BY r.created_at,r.id LIMIT 51`,
            )
            .bind(thread.id, member.id, cursor, cursor, key)
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
