import { db, digest } from './server';
import { AppError, textValue } from './validation';
import { normalizeCommunityTopic, type CommunityMember } from './community-types';
import { TOKENS, type StockToken } from './tokens';
import { communityTokens, hasCommunityHolding } from './community-eligibility';
import { backpackRegistry, registryTokens } from './backpack-registry';
import {
  communityPostErrors,
  POLL_DURATIONS,
  type PollDraft,
} from './community-post';
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
export async function communityMember(req: Request, required = true, eligibilityCheck = true) {
  const session = communityCookie(req);
  let member = session
    ? await db()
        .prepare(
          'SELECT m.id,m.alias,m.bio,m.avatar_key,m.qualifying_symbol,m.show_badge,m.show_value_badge,m.notify_replies,m.verified_until,m.suspended,m.created_at FROM community_sessions s JOIN community_members m ON m.id=s.member_id WHERE s.hash=? AND s.expires_at>? AND m.verified_until>? AND m.suspended=0',
        )
        .bind(await digest(session), Date.now(), Date.now())
        .first<CommunityMember>()
    : null;
  if (member && eligibilityCheck) {
    // Cache-only: admission checks never start provider work on a reader request.
    const registry = await backpackRegistry(db(), () => {}, undefined, fetch, Date.now(), true);
    if (!await hasCommunityHolding(db(), member.id, registryTokens(registry))) member = null;
  }
  if (!member && required)
    throw new AppError(
      'Verify a Backpack tokenized-stock holding to participate. Anyone can read.',
      401,
    );
  return member;
}
export function sessionCookie(value: string, req: Request, clear = false) {
  return `hp_member=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 86400}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function validateCommunityPost(
  b: Record<string, unknown>,
  tokens: readonly StockToken[] = TOKENS,
) {
  const topic = normalizeCommunityTopic(typeof b.topic === 'string' ? b.topic : 'channel-market-talk');
  const error = Object.values(communityPostErrors({...b, topic}, communityTokens(tokens)))[0];
  if (error) throw new AppError(error);
  return {
    title: String(b.title).trim(),
    body: String(b.body).trim(),
    topic,
  };
}
export function validateCommunityPoll(value: unknown): PollDraft | null {
  if (value === undefined) return null;
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const candidate = {
    options: Array.isArray(input.options) ? input.options : [],
    duration: input.duration,
  };
  const error = communityPostErrors({
    topic: 'general',
    title: 'Poll',
    body: '',
    poll: candidate,
  }).pollOptions;
  if (error) throw new AppError(error);
  return {
    options: candidate.options.map((option) => String(option).trim()),
    duration: candidate.duration as PollDraft['duration'],
  };
}
export function pollClosesAt(duration: PollDraft['duration'], now: number) {
  if (!POLL_DURATIONS.includes(duration)) throw new AppError('Invalid poll.');
  const days = duration === 'none' ? 0 : Number.parseInt(duration, 10);
  return days ? now + days * 86400000 : null;
}
export function validateAlias(value: unknown) {
  const alias = textValue(value, 3, 24, 'Display name');
  if (
    !/^[\p{L}\p{N} _.-]+$/u.test(alias) ||
    /admin|moderator|holderpulse|float|backpack|support|staff|official/i.test(
      alias,
    )
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
    db()
      .prepare('DELETE FROM wallet_handoffs WHERE expires_at<?')
      .bind(Date.now()),
    db().prepare('DELETE FROM limits WHERE expires_at<?').bind(Date.now()),
  ]);
}
export { authorColumns } from './community-read';
