import { runtime } from '@/lib/server';
import { readActiveMarketHealth } from '@/lib/market-active-health';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const env = runtime();
    const health = await readActiveMarketHealth(env.DB);
    const fingerprint = /^[a-f0-9]{64}$/.test(env.SOURCE_FINGERPRINT ?? '') ? env.SOURCE_FINGERPRINT : undefined;
    return Response.json({...health, ...(fingerprint ? {sourceFingerprint:fingerprint} : {})}, {status: health.status === 'ok' ? 200 : 503, headers: {'Cache-Control': 'no-store'}});
  } catch {
    return Response.json({status:'unavailable', checkedAt:null, issues:[{source:'monitor',code:'health_unavailable',affected:1}]},
      {status:503, headers:{'Cache-Control':'no-store'}});
  }
}
