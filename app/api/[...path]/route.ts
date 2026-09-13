import { readBoundedText } from '@/lib/request-body';
import {
  actor,
  auditStatement,
  cleanup,
  db,
  digest,
  getSurvey,
  ownedSurvey,
  publicSurvey,
  rateLimit,
  runtime,
  walletHash,
} from '@/lib/server';
import {
  AppError,
  canTransition,
  textValue,
  validateAnswers,
  validateSurvey,
} from '@/lib/validation';
import { validWallet, verifyHolding, verifySignature } from '@/lib/solana';
import type { StoredSurvey, StoredResponse, Question } from '@/lib/tokens';
import { TOKENS } from '@/lib/tokens';
import { seedDemos } from '@/lib/seeds';
export const dynamic = 'force-dynamic';
function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
async function handler(req: Request) {
  try {
    const u = new URL(req.url),
      p = u.pathname.replace(/^\/api\//, '').split('/'),
      method = req.method;
    let b: Record<string, unknown> = {};
    if (method !== 'GET') {
      if (req.headers.get('origin') !== u.origin)
        throw new AppError('A same-origin request is required.', 403);
      if (!req.headers.get('content-type')?.includes('application/json'))
        throw new AppError('Use a JSON request.', 415);
      const raw = await readBoundedText(req, 24000);
      if (raw.length > 24000) throw new AppError('Request is too large.', 413);
      try {
        b = JSON.parse(raw);
      } catch {
        throw new AppError('Invalid JSON.');
      }
      if (!b || typeof b !== 'object' || Array.isArray(b))
        throw new AppError('Invalid request.');
      await rateLimit(req.headers.get('cf-connecting-ip') || 'local', 60);
    }
    if (p[0] === 'health' && method === 'GET') {
      await db().prepare('SELECT 1').first();
      return json({
        status: 'ok',
        verification: 'Solana mainnet finalized',
        rewards: 'unfunded',
        payments: 'invoice requests',
      });
    }
    if (p[0] === 'me' && method === 'GET') {
      const a = await actor();
      return json({
        name: a.displayName,
        email: a.email,
        role: a.admin ? 'admin' : 'researcher',
      });
    }
    if (p[0] === 'tokens' && method === 'GET') return json(TOKENS);
    if (p[0] === 'orders') {
      const a = await actor();
      if (method === 'GET')
        return json(
          (
            await db()
              .prepare(
                'SELECT id,plan,organization,status,created_at FROM orders WHERE owner_id=? ORDER BY created_at DESC LIMIT 50',
              )
              .bind(a.userId)
              .all()
          ).results,
        );
      if (method === 'POST') {
        await rateLimit('orders:' + a.userId, 3);
        if (
          typeof b.plan !== 'string' ||
          !['survey', 'enterprise'].includes(b.plan)
        )
          throw new AppError('Choose a plan.');
        const organization = textValue(b.organization, 2, 150, 'Organization'),
          notes = textValue(b.notes || 'Pricing request', 1, 1500, 'Notes'),
          id = crypto.randomUUID();
        await db()
          .prepare(
            'INSERT INTO orders (id,owner_id,plan,organization,email,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?)',
          )
          .bind(
            id,
            a.userId,
            b.plan,
            organization,
            a.email,
            notes,
            'requested',
            Date.now(),
          )
          .run();
        return json({ id, status: 'requested' }, 201);
      }
    }
    if (p[0] === 'admin') {
      const a = await actor();
      if (!a.admin)
        throw new AppError('Administrator access is required.', 403);
      if (p[1] === 'seed' && method === 'POST') return json(await seedDemos());
      if (method === 'GET') {
        const results = await db().batch([
          db().prepare(
            'SELECT id,title,symbol,status,demo,created_at FROM surveys ORDER BY created_at DESC LIMIT 200',
          ),
          db().prepare(
            'SELECT id,plan,organization,email,notes,status,created_at FROM orders ORDER BY created_at DESC LIMIT 100',
          ),
          db().prepare(
            'SELECT action,target,created_at FROM audit ORDER BY created_at DESC LIMIT 50',
          ),
        ]);
        return json({
          surveys: results[0].results,
          orders: results[1].results,
          audit: results[2].results,
        });
      }
      if (p[1] === 'orders' && method === 'POST') {
        if (
          typeof b.status !== 'string' ||
          !['requested', 'contacted', 'closed'].includes(b.status)
        )
          throw new AppError('Invalid order status.');
        await db().batch([
          db()
            .prepare('UPDATE orders SET status=? WHERE id=?')
            .bind(b.status, b.id),
          auditStatement(
            a.userId,
            'order:' + b.status,
            textValue(b.id, 1, 100, 'Order ID'),
          ),
        ]);
        return json({ ok: true });
      }
    }
    if (p[0] === 'surveys' && !p[1]) {
      if (method === 'GET') {
        const mine = u.searchParams.get('mine') === '1';
        const sql =
          'SELECT s.*, (SELECT count(*) FROM responses r WHERE r.survey_id=s.id AND r.demo=s.demo) response_count FROM surveys s ';
        const stmt = mine
          ? db()
              .prepare(
                sql + 'WHERE s.owner_id=? ORDER BY s.created_at DESC LIMIT 100',
              )
              .bind((await actor()).userId)
          : db().prepare(
              sql +
                "WHERE s.status='active' ORDER BY s.demo ASC,s.created_at DESC LIMIT 100",
            );
        return json((await stmt.all<StoredSurvey>()).results.map(publicSurvey));
      }
      if (method === 'POST') {
        const a = await actor();
        await rateLimit('create:' + a.userId, 5);
        const v = validateSurvey(b),
          id = crypto.randomUUID(),
          now = Date.now();
        await db().batch([
          db()
            .prepare(
              'INSERT INTO surveys (id,owner_id,title,description,symbol,questions,status,demo,target,reward_cents,salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?)',
            )
            .bind(
              id,
              a.userId,
              v.title,
              v.description,
              v.symbol,
              JSON.stringify(v.questions),
              'draft',
              v.target,
              v.rewardCents,
              crypto.randomUUID() + crypto.randomUUID(),
              now,
              now,
            ),
          auditStatement(a.userId, 'survey:create', id),
        ]);
        return json({ id }, 201);
      }
    }
    if (p[0] === 'surveys' && p[1]) {
      const id = p[1];
      if (!p[2] && method === 'GET') {
        const s = await getSurvey(id);
        if (s.status !== 'active') await ownedSurvey(id);
        return json(publicSurvey(s));
      }
      if (p[2] === 'edit' && method === 'POST') {
        const { s, user } = await ownedSurvey(id);
        if (s.demo || s.status !== 'draft')
          throw new AppError('Only private drafts can be edited.');
        const v = validateSurvey(b);
        const result = await db().batch([
          db()
            .prepare(
              "UPDATE surveys SET title=?,description=?,symbol=?,questions=?,target=?,reward_cents=?,updated_at=? WHERE id=? AND status='draft' RETURNING id",
            )
            .bind(
              v.title,
              v.description,
              v.symbol,
              JSON.stringify(v.questions),
              v.target,
              v.rewardCents,
              Date.now(),
              id,
            ),
          auditStatement(user.userId, 'survey:edit', id),
        ]);
        if (!result[0].results.length)
          throw new AppError(
            'Study status changed. Reload before editing.',
            409,
          );
        return json({ id });
      }
      if (p[2] === 'status' && method === 'POST') {
        const { s, user } = await ownedSurvey(id);
        if (s.demo)
          throw new AppError(
            'Example studies cannot be published as live studies.',
          );
        if (
          !canTransition(
            s.status,
            textValue(b.status, 1, 20, 'Status'),
            user.admin,
          )
        )
          throw new AppError('This status change is not allowed.');
        await db().batch([
          db()
            .prepare(
              'UPDATE surveys SET status=?,updated_at=? WHERE id=? AND status=?',
            )
            .bind(b.status, Date.now(), id, s.status),
          auditStatement(user.userId, 'survey:' + b.status, id),
        ]);
        return json({ status: b.status });
      }
      if (p[2] === 'analytics' && method === 'GET') {
        const s = await getSurvey(id);
        if (!s.demo) await ownedSurvey(id);
        const rows = (
          await db()
            .prepare(
              'SELECT answers,cohort,slot,verified_at,created_at FROM responses WHERE survey_id=? AND demo=? ORDER BY created_at',
            )
            .bind(id, s.demo)
            .all<StoredResponse>()
        ).results;
        const questions = JSON.parse(s.questions) as Question[];
        const aggregate = questions.map((q: Question) => ({
          ...q,
          distribution:
            q.type === 'single'
              ? q.options.map((option: string) => ({
                  option,
                  count: rows.filter(
                    (r) => JSON.parse(r.answers)[q.id] === option,
                  ).length,
                }))
              : [],
          textResponses:
            q.type === 'text'
              ? rows.map((r) => JSON.parse(r.answers)[q.id])
              : [],
        }));
        const cohorts = ['Under 10 tokens', '10–99 tokens', '100+ tokens'].map(
          (label) => ({
            label,
            count: rows.filter((r) => r.cohort === label).length,
          }),
        );
        return json({
          survey: publicSurvey(s),
          count: rows.length,
          questions: aggregate,
          cohorts: rows.length >= 5 ? cohorts : [],
          cohortsSuppressed: rows.length < 5,
          holdingDuration: null,
          newBuyers: null,
          latestVerifiedAt: s.demo
            ? null
            : Math.max(0, ...rows.map((r) => r.verified_at)),
          rows: s.demo
            ? []
            : rows.map(({ answers, cohort: _cohort, ...r }) => ({
                ...r,
                answers: JSON.parse(answers),
              })),
        });
      }
      if (p[2] === 'challenge' && method === 'POST') {
        const s = await getSurvey(id);
        if (s.demo || s.status !== 'active' || s.response_count >= s.target)
          throw new AppError('This survey is not accepting live responses.');
        const wallet = validWallet(textValue(b.wallet, 32, 44, 'Wallet'));
        await rateLimit('wallet:' + wallet, 5);
        await cleanup();
        const challengeId = crypto.randomUUID(),
          expiry = Date.now() + 300000;
        const message = `Float ownership verification\nOrigin: ${u.origin}\nWallet: ${wallet}\nSurvey: ${id}\nNonce: ${challengeId}\nExpires: ${new Date(expiry).toISOString()}\nThis is a sign-in message only. No transaction or asset transfer is authorized.`;
        await db()
          .prepare(
            'INSERT INTO challenges (id,survey_id,wallet,message,expires_at,consumed) VALUES (?,?,?,?,?,0)',
          )
          .bind(challengeId, id, wallet, message, expiry)
          .run();
        return json({ id: challengeId, message, expiresAt: expiry });
      }
      if (p[2] === 'verify' && method === 'POST') {
        const s = await getSurvey(id);
        if (s.demo || s.status !== 'active')
          throw new AppError('This survey is not accepting responses.');
        const c = await db()
          .prepare(
            'SELECT * FROM challenges WHERE id=? AND survey_id=? AND consumed=0 AND expires_at>?',
          )
          .bind(b.challengeId, id, Date.now())
          .first<{ id: string; wallet: string; message: string }>();
        if (!c)
          throw new AppError(
            'Verification expired. Connect and sign again.',
            401,
          );
        await verifySignature(c.wallet, c.message, b.signature);
        const consumed = await db()
          .prepare(
            'UPDATE challenges SET consumed=1 WHERE id=? AND consumed=0 RETURNING id',
          )
          .bind(c.id)
          .first();
        if (!consumed)
          throw new AppError('This signature has already been used.', 409);
        const verification = await verifyHolding(
          c.wallet,
          s.symbol,
          runtime().SOLANA_RPC_URL,
        );
        const duplicate = await db()
          .prepare(
            'SELECT id FROM responses WHERE survey_id=? AND wallet_hash=?',
          )
          .bind(id, await walletHash(c.wallet, s.salt))
          .first();
        if (duplicate)
          throw new AppError('This wallet already answered this survey.', 409);
        const proof = crypto.randomUUID() + crypto.randomUUID();
        await db()
          .prepare(
            'INSERT INTO proofs (hash,survey_id,wallet,expires_at) VALUES (?,?,?,?)',
          )
          .bind(await digest(proof), id, c.wallet, Date.now() + 600000)
          .run();
        return json({
          proof,
          eligible: true,
          verifiedAt: verification.verifiedAt,
          slot: verification.slot,
        });
      }
      if (p[2] === 'respond' && method === 'POST') {
        const s = await getSurvey(id);
        if (s.demo || s.status !== 'active')
          throw new AppError('This survey is not accepting responses.');
        if (b.consent !== true) throw new AppError('Consent is required.');
        const answers = validateAnswers(JSON.parse(s.questions), b.answers),
          proofHash = await digest(
            textValue(b.proof, 60, 100, 'Verification proof'),
          );
        const proof = await db()
          .prepare(
            'SELECT * FROM proofs WHERE hash=? AND survey_id=? AND expires_at>?',
          )
          .bind(proofHash, id, Date.now())
          .first<{ wallet: string }>();
        if (!proof)
          throw new AppError(
            'Verification expired. Connect and sign again.',
            401,
          );
        const verified = await verifyHolding(
            proof.wallet,
            s.symbol,
            runtime().SOLANA_RPC_URL,
          ),
          responseId = crypto.randomUUID();
        const res = await db().batch([
          db()
            .prepare(
              "INSERT INTO responses (id,survey_id,wallet_hash,answers,cohort,slot,verified_at,created_at,demo) SELECT ?,?,?,?,?,?,?,?,0 WHERE EXISTS (SELECT 1 FROM surveys WHERE id=? AND status='active' AND demo=0 AND (SELECT count(*) FROM responses WHERE survey_id=?)<target) AND EXISTS (SELECT 1 FROM proofs WHERE hash=? AND expires_at>?) ON CONFLICT(survey_id,wallet_hash) DO NOTHING RETURNING id",
            )
            .bind(
              responseId,
              id,
              await walletHash(proof.wallet, s.salt),
              JSON.stringify(answers),
              verified.cohort,
              verified.slot,
              verified.verifiedAt,
              Date.now(),
              id,
              id,
              proofHash,
              Date.now(),
            ),
          db().prepare('DELETE FROM proofs WHERE hash=?').bind(proofHash),
          db()
            .prepare(
              "INSERT INTO reward_claims (id,response_id,status,amount_cents,created_at) SELECT ?,?,'unfunded',?,? WHERE ?>0 AND EXISTS (SELECT 1 FROM responses WHERE id=?)",
            )
            .bind(
              crypto.randomUUID(),
              responseId,
              s.reward_cents,
              Date.now(),
              s.reward_cents,
              responseId,
            ),
        ]);
        if (!res[0].results.length)
          throw new AppError(
            'Already answered, survey closed, or response target reached.',
            409,
          );
        return json(
          {
            id: responseId,
            rewardCents: s.reward_cents,
            claimStatus: s.reward_cents ? 'unfunded' : 'not_offered',
          },
          201,
        );
      }
      if (p[2] === 'claim' && method === 'POST') {
        throw new AppError(
          'Reward funding is not enabled. No USDC is currently claimable. Your research response is saved independently of rewards.',
          503,
        );
      }
    }
    throw new AppError('Endpoint not found.', 404);
  } catch (error) {
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    console.error(
      'Float request failed',
      error instanceof Error ? error.name : 'unknown',
    );
    return json(
      { error: 'The request could not be completed. Please try again.' },
      500,
    );
  }
}
export const GET = handler;
export const POST = handler;
