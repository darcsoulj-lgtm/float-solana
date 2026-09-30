import { registryTokens } from '@/lib/token-registry';
import type { RegistryStatus } from '@/lib/token-registry';
import type { StockToken } from '@/lib/tokens';
let listings: { at: number; tokens: readonly StockToken[] } | undefined;
let listingJob: Promise<readonly StockToken[]> | undefined;
async function previewTokens() {
  if (listings && Date.now() - listings.at < 300000) return listings.tokens;
  listingJob ??= fetch('https://joinfloat.xyz/api/market-data?overview=1', { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FloatHolderCensus/1.0; +https://joinfloat.xyz)' }, signal: AbortSignal.timeout(15000), redirect: 'manual' }).then(async response => {
    if (!response.ok) throw Error('Token registry unavailable');
    const data = await response.json() as { registry?: RegistryStatus };
    const tokens = registryTokens(data.registry).filter(t => t.issuer === 'backpack');
    listings = { at: Date.now(), tokens }; return tokens;
  }).finally(() => { listingJob = undefined; });
  return listingJob;
}
import { fetchBackpackChart, type BackpackChart } from '@/lib/backpack-charts';

const cache = new Map<string, BackpackChart>();
const pending = new Map<string, Promise<BackpackChart>>();
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') return new Response(null, { status: 404 });
  const symbol = new URL(request.url).searchParams.get('symbol');
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const tokens = await previewTokens();
    if (!symbol) return Response.json({ tokens: tokens.map(t => ({ symbol: t.symbol, name: t.shortName })) }, { headers });
    const token = tokens.find(t => t.symbol === symbol);
    if (!token) return Response.json({ error: 'Unsupported token' }, { status: 400, headers });
    let chart = cache.get(token.symbol);
    if (!chart || Date.now() - chart.fetchedAt >= 300000) {
      let job = pending.get(token.symbol);
      if (!job) {
        job = fetchBackpackChart(token).then(result => { cache.set(token.symbol, result); return result; }).finally(() => { pending.delete(token.symbol); });
        pending.set(token.symbol, job);
      }
      chart = await job;
    }
    return Response.json({ chart }, { headers });
  } catch (error) {
    console.warn('Local Backpack chart:', error instanceof Error ? error.message : 'Provider unavailable');
    // Do not substitute a saved sample, pool price or fabricated quote on failure.
    return Response.json({ error: 'Backpack chart unavailable. Try again shortly.' }, { status: 503, headers });
  }
}
