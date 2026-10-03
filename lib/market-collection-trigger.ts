import { parseMarketGeneration } from './market-snapshot-sync';
import { boundedCollectionJson, triggerWorkflowCollection, type TriggerEnvironment } from './workflow-collection-trigger';

export async function triggerOverdueCollection(env: TriggerEnvironment, fetcher: typeof fetch = fetch, now = Date.now()) {
  return triggerWorkflowCollection(env, {
    workflow: 'market-data.yml', key: 'market-collection-trigger:v1', checkMs: 60000, waitMs: 12 * 60000,
    async needsCollection(request) {
      const response = await request('https://raw.githubusercontent.com/darcsoulj-lgtm/float-solana/market-data/manifest.json?minute=' + Math.floor(now / 60000));
      const manifest = parseMarketGeneration(await boundedCollectionJson(response, 10000), now);
      return now - manifest.generatedAt > 5 * 60000;
    },
  }, fetcher, now);
}
