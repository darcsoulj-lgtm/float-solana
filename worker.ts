// Vinext generates the HTTP handler during the build. This small wrapper keeps
// the app intact while giving Float a durable, rate-limited market refresh.
import generated from './dist/server/index.js';
import { REGISTRY_KEY } from './lib/backpack-registry';
import {
  onchainMarketBatches,
  refreshOnchainMarketBatch,
} from './lib/onchain-market-cache';
import { registryTokens } from './lib/token-registry';
import type { StockToken } from './lib/tokens';

type Env = { DB: D1Database };
type AppHandler = {
  fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response>;
};

async function scheduledTokens(database: D1Database) {
  const saved = await database
    .prepare('SELECT payload FROM market_cache WHERE key=?')
    .bind(REGISTRY_KEY)
    .first<{ payload: string | null }>();
  let additions: StockToken[] = [];
  try {
    const parsed = JSON.parse(saved?.payload || '[]');
    if (Array.isArray(parsed)) additions = parsed as StockToken[];
  } catch {
    // The reviewed static registry remains safe if a cached registry is invalid.
  }
  return registryTokens({ additions });
}

async function refreshOnchainMarket(
  controller: ScheduledController,
  env: Env,
) {
  const tokens = await scheduledTokens(env.DB);
  const batches = onchainMarketBatches(tokens);
  if (!batches.length) return;
  // One free-provider request per minute stays far beneath its public quota.
  // A full registry pass completes in roughly 90 minutes without visitor traffic.
  const minute = Math.floor(controller.scheduledTime / 60000);
  const batch = batches[minute % batches.length];
  await refreshOnchainMarketBatch(env.DB, batch);
}

const app = generated as unknown as AppHandler;

export default {
  fetch(request: Request, env: Env, context: ExecutionContext) {
    return app.fetch(request, env, context);
  },
  async scheduled(controller: ScheduledController, env: Env) {
    await refreshOnchainMarket(controller, env);
  },
} satisfies ExportedHandler<Env>;
