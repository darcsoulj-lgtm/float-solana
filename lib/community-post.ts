import { communityTopics } from './community-types';
import { TOKENS, type StockToken } from './tokens';

export const POST_LIMITS = {
  title: { min: 1, max: 140 },
  body: { min: 0, max: 4000 },
  pollOption: { min: 1, max: 100 },
} as const;
export const POLL_DURATIONS = ['1d', '3d', '7d', 'none'] as const;
export type PollDuration = (typeof POLL_DURATIONS)[number];
export type PollDraft = {
  options: string[];
  duration: PollDuration;
};
export type PostErrors = Partial<
  Record<'topic' | 'title' | 'body' | 'pollOptions', string>
>;

// Shared by the form and server so whitespace and length rules cannot diverge.
export function communityPostErrors(
  input: Record<string, unknown>,
  tokens: readonly StockToken[] = TOKENS,
): PostErrors {
  const errors: PostErrors = {};
  if (
    !communityTopics(tokens).some(
      (topic) => topic.id !== 'all' && topic.id === input.topic,
    ) &&
    !(
      typeof input.topic === 'string' &&
      /^room-[a-f0-9-]{36}$/.test(input.topic)
    )
  )
    errors.topic = 'Choose a discussion topic.';
  for (const field of ['title', 'body'] as const) {
    const length =
      typeof input[field] === 'string' ? input[field].trim().length : -1;
    const { min, max } = POST_LIMITS[field];
    if (length < min || length > max)
      errors[field] =
        length < min
          ? field === 'title'
            ? 'Add a title.'
            : 'Add a message.'
          : `${field === 'title' ? 'Title' : 'Message'} is too long (maximum ${max.toLocaleString('en-US')} characters).`;
  }
  if (input.poll !== undefined) {
    const poll = input.poll as Partial<PollDraft> | null;
    const options = Array.isArray(poll?.options) ? poll.options : [];
    const cleaned = options.map((option) =>
      typeof option === 'string' ? option.trim() : '',
    );
    if (
      cleaned.length < 2 ||
      cleaned.length > 4 ||
      cleaned.some(
        (option) =>
          option.length < POST_LIMITS.pollOption.min ||
          option.length > POST_LIMITS.pollOption.max,
      ) ||
      new Set(cleaned.map((option) => option.toLocaleLowerCase())).size !==
        cleaned.length
    )
      errors.pollOptions =
        'Add 2–4 different poll options, each up to 100 characters.';
    if (!POLL_DURATIONS.includes(poll?.duration as PollDuration))
      errors.pollOptions = 'Choose when the poll closes.';
  }
  return errors;
}
