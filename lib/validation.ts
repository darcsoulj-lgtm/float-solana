import { TOKENS, type Question } from './tokens';
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function textValue(v: unknown, min: number, max: number, name: string) {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max)
    throw new AppError(`${name} must contain ${min}–${max} characters.`);
  return v.trim();
}
export function validateSurvey(b: Record<string, unknown>) {
  const title = textValue(b.title, 8, 160, 'Title'),
    description = textValue(b.description, 20, 1800, 'Research brief');
  if (
    typeof b.symbol !== 'string' ||
    !TOKENS.some((t) => t.symbol === b.symbol && t.mint)
  )
    throw new AppError('Choose a token with an approved mint address.');
  if (
    typeof b.target !== 'number' ||
    !Number.isInteger(b.target) ||
    b.target < 5 ||
    b.target > 1000
  )
    throw new AppError('Target must be 5–1,000 responses.');
  if (
    typeof b.rewardCents !== 'number' ||
    !Number.isInteger(b.rewardCents) ||
    b.rewardCents < 0 ||
    b.rewardCents > 10000
  )
    throw new AppError('Reward must be between 0 and 100 USDC.');
  if (
    !Array.isArray(b.questions) ||
    b.questions.length < 1 ||
    b.questions.length > 10
  )
    throw new AppError('Add 1–10 questions.');
  const questions: Question[] = b.questions.map((input: unknown, i: number) => {
    if (!input || typeof input !== 'object')
      throw new AppError('Invalid question.');
    const q = input as Record<string, unknown>;
    if (q.type !== 'single' && q.type !== 'text')
      throw new AppError('Invalid question type.');
    const prompt = textValue(q.prompt, 5, 500, 'Question');
    const options =
      q.type === 'single'
        ? Array.isArray(q.options)
          ? q.options.map((o: unknown) => textValue(o, 1, 150, 'Option'))
          : []
        : [];
    if (
      q.type === 'single' &&
      (options.length < 2 ||
        options.length > 8 ||
        new Set(options).size !== options.length)
    )
      throw new AppError('Single-choice questions need 2–8 unique options.');
    return { id: `q${i + 1}`, prompt, type: q.type, options };
  });
  return {
    title,
    description,
    symbol: b.symbol,
    target: b.target,
    rewardCents: b.rewardCents,
    questions,
  };
}
export function validateAnswers(questions: Question[], answers: unknown) {
  if (
    !answers ||
    typeof answers !== 'object' ||
    Array.isArray(answers) ||
    Object.keys(answers).length !== questions.length
  )
    throw new AppError('Answer every question.');
  const clean: Record<string, string> = {};
  for (const q of questions) {
    const a = textValue(
      (answers as Record<string, unknown>)[q.id],
      1,
      500,
      'Answer',
    );
    if (q.type === 'single' && !q.options.includes(a))
      throw new AppError('Choose an available answer.');
    clean[q.id] = a;
  }
  return clean;
}
export function cohortFor(amount: bigint, decimals: number) {
  if (amount <= 0n)
    throw new AppError(
      'This wallet does not currently hold the required token.',
      403,
    );
  const unit = 10n ** BigInt(decimals);
  return amount < 10n * unit
    ? 'Under 10 tokens'
    : amount < 100n * unit
      ? '10–99 tokens'
      : '100+ tokens';
}
export function canTransition(current: string, next: string, admin: boolean) {
  if (current === 'draft' && next === 'pending') return true;
  if (admin)
    return (
      (current === 'pending' && ['active', 'rejected'].includes(next)) ||
      (current === 'active' && next === 'paused') ||
      (current === 'paused' && next === 'active') ||
      (['draft', 'pending', 'paused', 'active', 'rejected'].includes(current) &&
        next === 'closed')
    );
  return (
    (current === 'draft' && next === 'pending') ||
    (current === 'active' && next === 'paused') ||
    (['draft', 'pending', 'paused', 'active', 'rejected'].includes(current) &&
      next === 'closed')
  );
}
