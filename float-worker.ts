import { runMarketMaintenance } from './lib/market-scheduled-maintenance';
import { recordTradingActivity } from './lib/trading-activity-server';
import { refreshBirdeyeVolumes } from './lib/birdeye-volume-server';
import { stockVolumeJob, readStockVolume } from './lib/stock-volume-job';
import { syncMarketSchedule } from './lib/market-snapshot-sync';
import { triggerOverdueCollection } from './lib/market-collection-trigger';
import { triggerHolderCollection } from './lib/holder-collection-trigger';
import handler from 'vinext/server/fetch-handler';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { publicPageResponse } from './lib/public-page-response';
import { publicBuiltShell } from './lib/public-built-shell';
import { cleanupExpiredRecords } from './lib/expired-record-cleanup';
import { publishPublicMarketSnapshot } from './lib/public-market-snapshot';
import { runPoolChunk, runMarketJob, runMarketSchedule, type MarketJob, type MarketJobBinding } from './lib/market-scheduler';
import type { MarketEnvironment } from './lib/market-overview-server';
import { runDurableMarketSchedule, runDurableMarketWork, planMarketWork, planMarketTokens, planMarketShards, type DurableMarketBinding } from './lib/market-work-scheduler';
import { checkMarketWorkHealth, type MarketAlertBinding } from './lib/market-work-health';
import { runFastMarketSchedule, refreshFastMarketSource, type FastMarketBinding, type FastMarketJob } from './lib/market-fast-refresh';

type FloatEnvironment = MarketEnvironment & { STOCK_VOLUME_ENABLED?:string; APCA_API_KEY_ID?:string; APCA_API_SECRET_KEY?:string; ASSETS?: {fetch(request:Request):Promise<Response>}; MARKET_REFRESH: MarketJobBinding & DurableMarketBinding & FastMarketBinding & {tokenVolumes():Promise<void>; activity():Promise<void>; publicSnapshot():Promise<void>; health():Promise<void>; collectionTrigger():Promise<void>; holderCollectionTrigger():Promise<void>}; MARKET_WORKFLOW_TOKEN?:string; MARKET_FAST_SOURCE?:string; MARKET_ALERT?:MarketAlertBinding; PUBLIC_RENDER_VERSION?: string; MARKET_COLLECTION_SOURCE?: string };
// Reachable through the private service binding only; no HTTP refresh route.
export class MarketRefresh extends WorkerEntrypoint<FloatEnvironment> {
  async run(job: MarketJob) { await runMarketJob(this.env, job); }
  async pools(mints: string[]) { return runPoolChunk(this.env, mints); }
  async plan() { await planMarketWork(this.env); }
  async planTokens(mints:string[],scope:string) { return planMarketTokens(this.env,mints,scope); }
  async planShards(addresses:string[],scope:string) { return planMarketShards(this.env,addresses,scope); }
  async work(id: string, leaseToken: string) { await runDurableMarketWork(this.env, id, leaseToken); }
  async health() {
    const results = await Promise.allSettled([checkMarketWorkHealth(this.env), cleanupExpiredRecords(this.env.DB)]);
    if (results.some(result => result.status === 'rejected')) throw Error('Market health or bounded maintenance failed');
  }
  async publicSnapshot() { await publishPublicMarketSnapshot(this.env); }
  async activity() { await recordTradingActivity(this.env); }
  async tokenVolumes() { await refreshBirdeyeVolumes(this.env); }
  async collectionTrigger() { await triggerOverdueCollection(this.env); }
  async holderCollectionTrigger() { await triggerHolderCollection(this.env); }
  async fast(job:FastMarketJob) { await refreshFastMarketSource(this.env,job); }
  async fastSchedule(time:number) { await runFastMarketSchedule(this.env,time); }
}
const worker = {
  async fetch(request: Request, env: FloatEnvironment, context: ExecutionContext) {
    // This custom-domain Worker has no trusted ChatGPT identity proxy. Public
    // callers must not authenticate legacy routes by supplying these headers.
    const headers = new Headers(request.headers);
    const identityHeaders = Array.from(headers.keys()).filter(name => name.toLowerCase().startsWith('oai-authenticated-user-'));
    for (const name of identityHeaders) headers.delete(name);
    request = new Request(request, {headers});
    const path = new URL(request.url).pathname;
    if (path === '/api/stock-volume-job') return stockVolumeJob(request, env);
    if (path === '/api/stock-volume' && request.method === 'GET') return Response.json(await readStockVolume(env.DB), {headers:{'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
    const built = await publicBuiltShell(request, env.ASSETS);
    if (built) return built;
    let cache: Cache;
    try { cache = await caches.open('float-public-pages-v1'); }
    catch { return handler.fetch(request, env, context); }
    return publicPageResponse(request, () => handler.fetch(request, env, context), cache,
      work => context.waitUntil(work), env.PUBLIC_RENDER_VERSION);
  },
  async scheduled(event: ScheduledController, env: FloatEnvironment) {
    // Publish and check health before collectors spend the shared request budget.
    let sourceFailed = await runMarketMaintenance(env.MARKET_REFRESH,event.scheduledTime);
    try {
    if (env.MARKET_COLLECTION_SOURCE === 'durable') {
      await Promise.all([runDurableMarketSchedule(env,event.scheduledTime), env.MARKET_REFRESH.tokenVolumes()]);
      await env.MARKET_REFRESH.run({kind:'holders'});
    } else if (env.MARKET_COLLECTION_SOURCE === 'github') {
      const results=await Promise.allSettled([
        syncMarketSchedule(env),
        env.MARKET_REFRESH.collectionTrigger(),
        env.MARKET_REFRESH.holderCollectionTrigger(),
        env.MARKET_REFRESH.tokenVolumes(),
        env.MARKET_REFRESH.run({kind:'holders'}),
        ...(env.MARKET_FAST_SOURCE==='1'?[env.MARKET_REFRESH.fastSchedule(event.scheduledTime)]:[]),
      ]);
      sourceFailed = sourceFailed || results.some(r=>r.status==='rejected');
    } else await runMarketSchedule(env, event.scheduledTime);
    } catch { sourceFailed = true; }
    if (sourceFailed) throw Error('A scheduled market source failed; independent sources completed');
  },
};

export default worker;
