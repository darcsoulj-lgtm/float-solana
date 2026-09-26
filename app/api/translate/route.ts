import { communityMember } from '@/lib/community-server';
import { translateCommunityContent, TRANSLATION_MODEL } from '@/lib/community-translation';
import { db, rateLimit, runtime } from '@/lib/server';
import { readBoundedText } from '@/lib/request-body';
import { AppError } from '@/lib/validation';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  try {
    if (req.headers.get('origin') !== new URL(req.url).origin) throw new AppError('A same-origin request is required.', 403);
    if (!req.headers.get('content-type')?.includes('application/json')) throw new AppError('Use JSON.', 415);
    let input: unknown;
    try { input = JSON.parse(await readBoundedText(req, 1024)); } catch { throw new AppError('Invalid translation request.'); }
    const value = input as Record<string, unknown> | null;
    if (!value || (value.type !== 'thread' && value.type !== 'reply') || typeof value.id !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(value.id) || (value.target !== 'ko' && value.target !== 'en')) throw new AppError('Invalid translation request.');
    await rateLimit('translate-ip:' + (req.headers.get('cf-connecting-ip') || 'local'), 10);
    const member = await communityMember(req, false);
    const ai = runtime().AI;
    const result = await translateCommunityContent(db(), ai ? input => ai.run(TRANSLATION_MODEL, input) : null, { type: value.type, id: value.id, target: value.target }, member?.id ?? null);
    return respond(result);
  } catch (error) {
    return respond({ error: error instanceof AppError ? error.message : 'Translation is temporarily unavailable. Please try again later.' }, error instanceof AppError ? error.status : 503);
  }
}
