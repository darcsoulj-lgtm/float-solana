import { waitUntil } from 'cloudflare:workers';
import { runtime, rateLimit } from '@/lib/server';
import { backpackRegistry, registryTokens } from '@/lib/backpack-registry';
import { readMarketOverview } from '@/lib/market-overview-server';
import { publicMarketResponse } from '@/lib/public-market-response';
import { AppError } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const env = runtime();
    const audience = req.headers.get('cf-connecting-ip') || 'local';
    if (env.MARKET_READ_LIMITER) {
      if (!(await env.MARKET_READ_LIMITER.limit({key: audience})).success)
        throw new AppError('Too many requests. Please wait a minute.', 429);
    } else {
      // Local/legacy deployments retain protection if the binding is absent.
      await rateLimit('backpack-market:' + audience, 120);
    }
    const cache = await caches.open('float-public-markets-v1');
    return await publicMarketResponse(req, async () => {
      const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, Date.now(), true);
      return readMarketOverview(env, registryTokens(registry), registry, 'backpack');
    }, cache, waitUntil);
  } catch (error) {
    if (!(error instanceof AppError)) console.error('Public Backpack overview failed');
    return Response.json({error: error instanceof AppError ? error.message : 'Market data is temporarily unavailable.'}, {
      status: error instanceof AppError ? error.status : 503,
      headers: {'Cache-Control': 'no-store', ...(error instanceof AppError && error.status === 429 ? {'Retry-After': '60'} : {})},
    });
  }
}
