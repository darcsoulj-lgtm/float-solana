import { waitUntil } from 'cloudflare:workers';
import { db, rateLimit } from '@/lib/server';
import { marketSnapshot } from '@/lib/market-cache';
import { fetchOndoValues, ONDO_VALUE_MAX_AGE_MS } from '@/lib/ondo-valuation';
import { AppError } from '@/lib/validation';
import { tokenBatchKey } from '@/lib/backpack-registry';
import { TOKENS } from '@/lib/tokens';
export const dynamic = 'force-dynamic';
// Public issuer observations only. One shared provider request per ten minutes,
// protected by the existing D1 refresh lease; no wallet data enters this cache.
export async function GET(req: Request) {
  try {
    await rateLimit(
      'issuer-values:' + (req.headers.get('cf-connecting-ip') || 'anonymous'),
      60,
    );
    const valuations = await marketSnapshot(
      db(),
      'ondo-solana-value:v1:' +
        (await tokenBatchKey(TOKENS.filter((t) => t.issuer === 'ondo'))),
      600000,
      fetchOndoValues,
      waitUntil,
      Date.now(),
      ONDO_VALUE_MAX_AGE_MS,
    );
    return Response.json(
      { valuations },
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=0',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (e) {
    return Response.json(
      { error: 'Issuer valuation is temporarily unavailable.' },
      {
        status: e instanceof AppError ? e.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
