import { waitUntil } from 'cloudflare:workers';
import { db, runtime, rateLimit } from '@/lib/server';
import { backpackRegistry } from '@/lib/backpack-registry';
import { AppError } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    await rateLimit(
      'token-registry:' + (req.headers.get('cf-connecting-ip') || 'anonymous'),
      120,
    );
    const registry = await backpackRegistry(
      db(),
      waitUntil,
      runtime().SOLANA_RPC_URL,
    );
    return Response.json(registry, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=10',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return Response.json(
      { error: 'Listings could not refresh.' },
      {
        status: e instanceof AppError ? e.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
