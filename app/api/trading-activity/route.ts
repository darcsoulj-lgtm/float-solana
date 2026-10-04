import { waitUntil } from 'cloudflare:workers';
import { runtime } from '@/lib/server';
import { readTradingActivity } from '@/lib/trading-activity-server';
import { publicMarketResponse } from '@/lib/public-market-response';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const env = runtime();
    if (env.MARKET_READ_LIMITER && !(await env.MARKET_READ_LIMITER.limit({key:request.headers.get('cf-connecting-ip') ?? 'local'})).success)
      return Response.json({error:'Please try again shortly.'},{status:429,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
    return await publicMarketResponse(request, async () => ({points: await readTradingActivity(env.DB)}),
      await caches.open('float-public-activity-v1'), waitUntil,
      {path:'/api/trading-activity?schema=1',maxAgeSeconds:300});
  } catch {
    console.error('Trading activity history unavailable');
    return Response.json({error: 'History is temporarily unavailable.'}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
