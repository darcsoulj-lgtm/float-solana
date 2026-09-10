import { TOPICS } from './community-types';

export const POST_LIMITS = {
  title: { min: 5, max: 140 },
  body: { min: 10, max: 4000 },
} as const;
export type PostErrors = Partial<Record<'topic' | 'title' | 'body', string>>;

// Shared by the form and server so whitespace and length rules cannot diverge.
export function communityPostErrors(
  input: Record<string, unknown>,
): PostErrors {
  const errors: PostErrors = {};
  if (!TOPICS.some((topic) => topic.id !== 'all' && topic.id === input.topic))
    errors.topic = 'Choose a discussion topic.';
  for (const field of ['title', 'body'] as const) {
    const length =
      typeof input[field] === 'string' ? input[field].trim().length : 0;
    const { min, max } = POST_LIMITS[field];
    if (length < min || length > max)
      errors[field] =
        `${field === 'title' ? 'Title' : 'Your perspective'} must contain ${min}–${max.toLocaleString('en-US')} characters.`;
  }
  return errors;
}
