import { waitUntil } from 'cloudflare:workers';
import { db, rateLimit } from '@/lib/server';
import { circulationSnapshot } from '@/lib/circulation-cache';
import { AppError } from '@/lib/validation';
export const dynamic = 'force-dynamic';
// Public issuer observations only. No member data or private balances.
export async function GET(req: Request) {
  try {
    await rateLimit(
      'circulation-read:' +
        (req.headers.get('cf-connecting-ip') || 'anonymous'),
      60,
    );
    const circulation = await circulationSnapshot(db(), waitUntil);
    return Response.json(
      { circulation },
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=0',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (e) {
    return Response.json(
      { error: 'Issuer data is temporarily unavailable.' },
      {
        status: e instanceof AppError ? e.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
