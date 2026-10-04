import { waitUntil } from 'cloudflare:workers';
import { runtime } from '@/lib/server';
import { readIssuerComparison } from '@/lib/issuer-comparison-server';
import { publicMarketResponse } from '@/lib/public-market-response';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const env = runtime();
    if (env.MARKET_READ_LIMITER && !(await env.MARKET_READ_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'local' })).success)
      return Response.json({ error: 'Please try again shortly.' }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
    return await publicMarketResponse(request, async () => ({ comparison: await readIssuerComparison(env) }),
      await caches.open('float-public-issuer-comparison-v1'), waitUntil,
      { path: '/api/issuer-comparison?schema=1', maxAgeSeconds: 300 });
  } catch {
    console.error('Issuer comparison unavailable');
    return Response.json({ error: 'Comparison is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
