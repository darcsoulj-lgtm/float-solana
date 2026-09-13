import { communityTopics } from './community-types';
import { TOKENS, type StockToken } from './tokens';

export const POST_LIMITS = {
  title: { min: 1, max: 140 },
  body: { min: 0, max: 4000 },
} as const;
export type PostErrors = Partial<Record<'topic' | 'title' | 'body', string>>;

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
  return errors;
}
