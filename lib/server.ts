import type { StoredSurvey, Question } from './tokens';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { AppError } from './validation';
export const runtime = () =>
  env as unknown as {
    DB: D1Database;
    AVATARS?: R2Bucket;
    SOLANA_RPC_URL?: string;
    ADMIN_EMAILS?: string;
    BENZINGA_API_KEY?: string;
    CMC_API_KEY?: string;
  };
export function db() {
  const d = runtime().DB;
  if (!d) throw new AppError('Database is unavailable. Please try again.', 503);
  return d;
}
export async function actor() {
  const u = await getChatGPTUser();
  if (!u) throw new AppError('Sign in to your research workspace.', 401);
  const admins = (runtime().ADMIN_EMAILS || '')
    .toLowerCase()
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return { ...u, admin: admins.includes(u.email.toLowerCase()) };
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function walletHash(wallet: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(wallet)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function rateLimit(key: string, max = 30) {
  const now = Date.now(),
    window = Math.floor(now / 60000),
    h = await digest(key + window);
  const row = await db()
    .prepare(
      'INSERT INTO limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(h, now + 120000)
    .first<{ count: number }>();
  if ((row?.count || 0) > max)
    throw new AppError('Too many requests. Please wait a minute.', 429);
}
export async function cleanup() {
  await db().batch([
    db()
      .prepare('DELETE FROM challenges WHERE expires_at < ?')
      .bind(Date.now()),
    db().prepare('DELETE FROM proofs WHERE expires_at < ?').bind(Date.now()),
    db().prepare('DELETE FROM limits WHERE expires_at < ?').bind(Date.now()),
  ]);
}
export function publicSurvey(row: StoredSurvey) {
  const { salt: _salt, owner_id: _ownerId, ...rest } = row;
  return {
    ...rest,
    questions:
      typeof row.questions === 'string'
        ? (JSON.parse(row.questions) as Question[])
        : row.questions,
  };
}
export async function getSurvey(id: string) {
  const row = await db()
    .prepare(
      'SELECT s.*, (SELECT count(*) FROM responses r WHERE r.survey_id=s.id AND r.demo=s.demo) response_count FROM surveys s WHERE s.id=?',
    )
    .bind(id)
    .first<StoredSurvey>();
  if (!row) throw new AppError('Survey not found.', 404);
  return row;
}
export async function ownedSurvey(id: string) {
  const user = await actor(),
    s = await getSurvey(id);
  if (s.owner_id !== user.userId && !user.admin)
    throw new AppError('You do not have access to this survey.', 403);
  return { s, user };
}
export function auditStatement(actor: string, action: string, target: string) {
  return db()
    .prepare(
      'INSERT INTO audit (id,actor,action,target,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(crypto.randomUUID(), actor, action, target, Date.now());
}
