import { waitUntil } from 'cloudflare:workers';
import { backpackRegistry, registryTokens, tokenBatchKey } from '@/lib/backpack-registry';
import { communityMember } from '@/lib/community-server';
import { db, rateLimit, runtime } from '@/lib/server';
import { marketSnapshot } from '@/lib/market-cache';
import { fetchStonkfunOverview, STONKFUN_REFRESH_MS } from '@/lib/stonkfun-data';
import { AppError } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const member = await communityMember(req);
    await rateLimit('stonkfun:' + member!.id, 60);
    const database = db();
    const registry = await backpackRegistry(
      database,
      waitUntil,
      runtime().SOLANA_RPC_URL,
    );
    const tokens = registryTokens(registry);
    const key = 'stonkfun-linked-v1:' + (await tokenBatchKey(tokens));
    const stonkfun = await marketSnapshot(
      database,
      key,
      STONKFUN_REFRESH_MS,
      () => fetchStonkfunOverview(fetch, tokens),
      waitUntil,
      Date.now(),
      900000,
    );
    return Response.json(
      { stonkfun },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          Vary: 'Cookie',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: 'Stock-linked ecosystem data is temporarily unavailable.' },
      {
        status: error instanceof AppError ? error.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
