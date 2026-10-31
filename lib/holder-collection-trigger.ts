import { backpackRegistry, registryTokens } from './backpack-registry';
import { holderRegistry } from './issuer-holder-registry';
import { readHoldingWallets } from './issuer-holders-server';
import type { HoldingWallets } from './issuer-holders';
import type { MarketEnvironment } from './market-overview-server';
import { triggerWorkflowCollection } from './workflow-collection-trigger';

type HolderScope = { registryHash: string; mints: string[] };
export function holderCollectionNeeded(row: HoldingWallets | undefined, scope: HolderScope, now: number) {
  if (row && row.checkedAt > now + 60000) throw Error('Future holder observation');
  return !row || row.registryHash !== scope.registryHash || row.tokens !== scope.mints.length || now - row.checkedAt >= 86400000;
}

// Compare the authoritative verified listing cache to the imported aggregate.
// No owner addresses, public self-fetch, or new RPC scan occurs in the Worker.
export async function triggerHolderCollection(env: MarketEnvironment & { MARKET_WORKFLOW_TOKEN?: string }, fetcher: typeof fetch = fetch, now = Date.now()) {
  return triggerWorkflowCollection(env, {
    workflow: 'issuer-holders.yml', key: 'holder-collection-trigger:v1', checkMs: 5 * 60000, waitMs: 6 * 3600000,
    async needsCollection() {
      const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetcher, now, true);
      if (!registry.checkedAt) throw Error('Verified listings unavailable');
      const scope = (await holderRegistry(registryTokens(registry))).find(row => row.issuer === 'backpack')!;
      const row = (await readHoldingWallets(env.DB, now)).issuers.find(item => item.issuer === 'backpack');
      return holderCollectionNeeded(row, scope, now);
    },
    async reserveDispatch() {
      // A failed census leaves the observation stale. Bound recovery attempts
      // independently of freshness; the daily scheduled census remains enabled.
      // Reserve before POST so ambiguous responses cannot bypass the limit.
      const key = 'holder-collection-dispatch:v1:' + new Date(now).toISOString().slice(0, 10);
      return !!await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,'1',?,0)
        ON CONFLICT(key) DO UPDATE SET payload=CAST(CAST(market_cache.payload AS INTEGER)+1 AS TEXT)
        WHERE CAST(market_cache.payload AS INTEGER)<2 RETURNING key`).bind(key, now).first();
    },
  }, fetcher, now);
}
