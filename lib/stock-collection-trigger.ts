import { STOCK_VOLUME_KEY, stockComparisonWindowEnd } from './stock-volume-job';
import { validStockVolumeComparison } from './stock-volume-comparison';
import { triggerWorkflowCollection, type TriggerEnvironment } from './workflow-collection-trigger';

// GitHub schedule delivery may lag by hours. The existing minute scheduler
// requests the same authenticated job, after its normal data-ready time.
// The job still owns provider reservations, fencing and publication validation.
export function stockCollectionNeeded(payload: string | null | undefined, now: number) {
  const ready = new Date(now); ready.setUTCHours(6, 30, 0, 0);
  if (now < ready.getTime()) return false;
  let comparison: unknown;
  try { comparison = JSON.parse(payload ?? 'null'); } catch { return true; }
  if (!validStockVolumeComparison(comparison) || comparison.period !== 1) return true;
  const end = Date.parse(comparison.endUtc), expected = Date.parse(stockComparisonWindowEnd(now));
  if (end > expected || (comparison.generatedAt ?? 0) > now + 60000) throw Error('Future stock comparison');
  return end < expected;
}

export async function triggerStockCollection(env: TriggerEnvironment & { STOCK_VOLUME_ENABLED?: string }, fetcher: typeof fetch = fetch, now = Date.now()) {
  if (env.STOCK_VOLUME_ENABLED !== '1') return 'not_configured';
  return triggerWorkflowCollection(env, {
    workflow: 'stock-volume.yml', key: 'stock-collection-trigger:v1', checkMs: 5 * 60000, waitMs: 15 * 60000,
    async needsCollection() {
      const row = await env.DB.prepare('SELECT payload FROM market_cache WHERE key=?').bind(STOCK_VOLUME_KEY).first<{payload:string|null}>();
      return stockCollectionNeeded(row?.payload, now);
    },
    async reserveDispatch() {
      // Count ambiguous POSTs too. At most two recovery dispatches per NY day;
      // provider exhaustion cannot create an endless failed-workflow/email loop.
      const key = 'stock-collection-dispatch:v1:' + stockComparisonWindowEnd(now);
      return !!await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,'1',?,0)
        ON CONFLICT(key) DO UPDATE SET payload=CAST(CAST(market_cache.payload AS INTEGER)+1 AS TEXT)
        WHERE CAST(market_cache.payload AS INTEGER)<2 RETURNING key`).bind(key, now).first();
    },
  }, fetcher, now);
}
