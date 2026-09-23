import handler from 'vinext/server/fetch-handler';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { runPoolChunk, runMarketJob, runMarketSchedule, type MarketJob, type MarketJobBinding } from './lib/market-scheduler';
import type { MarketEnvironment } from './lib/market-overview-server';

type FloatEnvironment = MarketEnvironment & { MARKET_REFRESH: MarketJobBinding };
// Reachable through the private service binding only; no HTTP refresh route.
export class MarketRefresh extends WorkerEntrypoint<FloatEnvironment> {
  async run(job: MarketJob) { await runMarketJob(this.env, job); }
  async pools(mints: string[]) { return runPoolChunk(this.env, mints); }
}
const worker = {
  fetch: handler.fetch,
  async scheduled(event: ScheduledController, env: FloatEnvironment) {
    await runMarketSchedule(env, event.scheduledTime);
  },
};

export default worker;
