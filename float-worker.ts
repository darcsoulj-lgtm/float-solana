import { syncMarketSchedule } from './lib/market-snapshot-sync';
import { triggerOverdueCollection } from './lib/market-collection-trigger';
import handler from 'vinext/server/fetch-handler';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { runPoolChunk, runMarketJob, runMarketSchedule, type MarketJob, type MarketJobBinding } from './lib/market-scheduler';
import type { MarketEnvironment } from './lib/market-overview-server';

type FloatEnvironment = MarketEnvironment & { MARKET_REFRESH: MarketJobBinding & {collectionTrigger():Promise<void>}; MARKET_WORKFLOW_TOKEN?:string; MARKET_COLLECTION_SOURCE?: string };
// Reachable through the private service binding only; no HTTP refresh route.
export class MarketRefresh extends WorkerEntrypoint<FloatEnvironment> {
  async run(job: MarketJob) { await runMarketJob(this.env, job); }
  async pools(mints: string[]) { return runPoolChunk(this.env, mints); }
  async collectionTrigger() { await triggerOverdueCollection(this.env); }
}
const worker = {
  fetch: handler.fetch,
  async scheduled(event: ScheduledController, env: FloatEnvironment) {
    if (env.MARKET_COLLECTION_SOURCE === 'github') {
      await syncMarketSchedule(env);
      await env.MARKET_REFRESH.run({kind:'holders'});
      // Preserve this repository's existing snapshot/holder execution order.
      await env.MARKET_REFRESH.collectionTrigger();
    } else await runMarketSchedule(env, event.scheduledTime);
  },
};

export default worker;
