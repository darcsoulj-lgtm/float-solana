import { db, rateLimit, runtime } from '@/lib/server';
import { cachedMarket } from '@/lib/market-cache';
import {
  fetchTokenVolumes,
  MARKET_REFRESH_MS,
  volumeCacheKey,
} from '@/lib/market-data';
import { AppError } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Public operational health only: no market payload, member identity or balances.
// Uses the same global cache/refresh lease as the member endpoint.
export async function GET(req: Request) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    await rateLimit(
      'market-health:' + (req.headers.get('cf-connecting-ip') || 'unknown'),
      6,
    );
    const volume = await cachedMarket(
      db(),
      volumeCacheKey(runtime().COINGECKO_PRO_API_KEY),
      MARKET_REFRESH_MS,
      () => fetchTokenVolumes(fetch, runtime().COINGECKO_PRO_API_KEY),
    );
    return Response.json(
      {
        status: volume.data && !volume.stale ? 'ok' : 'degraded',
        volume: {
          available: !!volume.data && !volume.stale,
          fetchedAt: volume.fetchedAt,
          coverage: Object.keys(volume.data || {}).length,
        },
      },
      { headers },
    );
  } catch (e) {
    return Response.json(
      { status: 'unavailable' },
      { status: e instanceof AppError ? e.status : 503, headers },
    );
  }
}
