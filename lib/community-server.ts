import { db, digest } from './server';
import { AppError, textValue } from './validation';
import { type CommunityMember } from './community-types';
import { communityPostErrors } from './community-post';
export const MEMBERSHIP_MS = 24 * 60 * 60 * 1000;
export function communityCookie(req: Request) {
  const cookies = req.headers.get('cookie') || '';
  const values = cookies
    .split(';')
    .map((x) => x.trim())
    .filter((x) => x.startsWith('hp_member='));
  if (values.length !== 1) return null;
  const value = values[0].slice(10);
  return /^[a-f0-9-]{72}$/.test(value) ? value : null;
}
export async function communityMember(req: Request, required = true) {
  const session = communityCookie(req);
  const member = session
    ? await db()
        .prepare(
          'SELECT m.id,m.alias,m.bio,m.avatar_key,m.qualifying_symbol,m.show_badge,m.show_value_badge,m.notify_replies,m.verified_until,m.suspended,m.created_at FROM community_sessions s JOIN community_members m ON m.id=s.member_id WHERE s.hash=? AND s.expires_at>? AND m.verified_until>? AND m.suspended=0',
        )
        .bind(await digest(session), Date.now(), Date.now())
        .first<CommunityMember>()
    : null;
  if (!member && required)
    throw new AppError(
      'Verify a supported stock token to enter the member community. Membership checks expire after 24 hours.',
      401,
    );
  return member;
}
export function sessionCookie(value: string, req: Request, clear = false) {
  return `hp_member=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 86400}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function validateCommunityPost(b: Record<string, unknown>) {
  const error = Object.values(communityPostErrors(b))[0];
  if (error) throw new AppError(error);
  return {
    title: String(b.title).trim(),
    body: String(b.body).trim(),
    topic: String(b.topic),
  };
}
export function validateAlias(value: unknown) {
  const alias = textValue(value, 3, 24, 'Display name');
  if (
    !/^[\p{L}\p{N} _.-]+$/u.test(alias) ||
    /admin|moderator|holderpulse|backpack|support|staff|official/i.test(alias)
  )
    throw new AppError(
      'Use a personal display name without official or moderator titles.',
    );
  return alias;
}
export async function communityCleanup() {
  await db().batch([
    db()
      .prepare('DELETE FROM community_challenges WHERE expires_at<?')
      .bind(Date.now()),
    db()
      .prepare('DELETE FROM community_sessions WHERE expires_at<?')
      .bind(Date.now()),
    db().prepare('DELETE FROM limits WHERE expires_at<?').bind(Date.now()),
  ]);
}
export const authorColumns =
  'm.alias,m.avatar_key, CASE WHEN m.show_badge=1 AND m.verified_until>? AND m.suspended=0 THEN m.qualifying_symbol ELSE NULL END badge, CASE WHEN m.show_value_badge=1 AND m.verified_until>unixepoch()*1000 AND m.value_tier_expires_at>unixepoch()*1000 AND m.suspended=0 THEN m.value_tier ELSE NULL END value_tier, m.value_tier_expires_at';
