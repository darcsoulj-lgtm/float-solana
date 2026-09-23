import { backpackRegistry, registryTokens } from './backpack-registry';
import { marketPartitions, readMarketGlobals, type MarketEnvironment } from './market-overview-server';
import { readMarketBatch } from './market-service';
import { circulationSnapshot } from './circulation-cache';
import { SourceHttpError, POOL_REFRESH_MS, MARKET_REFRESH_MS } from './market-data';

// Four staggered groups keep a normal full cycle below the existing five-minute
// validity limit. A late/failed run retries on the next cycle, never per visitor.
export const MARKET_CYCLE_MINUTES = 4;
export function scheduledBatches(count: number, scheduledTime: number) {
  const slot = Math.floor(scheduledTime / 60000) % MARKET_CYCLE_MINUTES;
  return Array.from({ length: count }, (_, index) => index)
    .filter((index) => index % MARKET_CYCLE_MINUTES === slot);
}
export type MarketJob = { kind: 'batch'; batch: number } | { kind: 'globals' | 'circulation' | 'registry' };
export type MarketJobBinding = { run(job: MarketJob): Promise<void> };

// FIFO dispatch within a job; stops queued DEX calls immediately after a 429.
// Shared D1 cooldowns also stop the following jobs and public detail requests.
export function pacedMarketFetch(fetcher: typeof fetch = fetch, gapMs = 300): typeof fetch {
  let tail = Promise.resolve(), nextStart = 0, blocked: Response | undefined;
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== 'api.dexscreener.com') return fetcher(input, init);
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      if (blocked) throw new SourceHttpError(url.hostname, blocked);
      const wait = Math.max(0, nextStart - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      nextStart = Date.now() + gapMs;
      const response = await fetcher(input, init);
      if (response.status === 429) blocked = response.clone();
      return response;
    } finally { release(); }
  };
}

export async function runMarketJob(env: MarketEnvironment, job: MarketJob) {
  const deferred: Promise<unknown>[] = [];
  const registry = await backpackRegistry(env.DB, (work) => deferred.push(work), env.SOLANA_RPC_URL, fetch, Date.now(), job.kind !== 'registry');
  const tokens = registryTokens(registry);
  if (job.kind === 'registry') {
    await Promise.all(deferred);
  } else if (job.kind === 'globals') {
    await readMarketGlobals(env, tokens, false);
  } else if (job.kind === 'circulation') {
    await circulationSnapshot(env.DB, (work) => deferred.push(work));
    await Promise.all(deferred);
  } else if (job.kind === 'batch') {
    const batch = marketPartitions(tokens)[job.batch];
    if (!Number.isSafeInteger(job.batch) || !batch) throw Error('Invalid scheduled market batch');
    const deadline = AbortSignal.timeout(16000);
    const bounded: typeof fetch = (input, init) => fetch(input, {
      ...init, signal: AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])]),
    });
    await readMarketBatch(env.DB, batch, {
      rpcUrl: env.SOLANA_RPC_URL, verifiedStocks: tokens, fetcher: pacedMarketFetch(bounded),
      // Refresh ahead of the next four-minute cycle; timing jitter must not
      // skip a just-under-TTL batch for another whole cycle.
      poolRefreshMs: POOL_REFRESH_MS - MARKET_REFRESH_MS,
    });
  }
}

export async function runMarketSchedule(env: MarketEnvironment & { MARKET_REFRESH: MarketJobBinding }, scheduledTime: number) {
  const now = Date.now();
  const leaseKey = 'market-schedule:v1';
  const lease = await env.DB.prepare(
    'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,?,?) ON CONFLICT(key) DO UPDATE SET fetched_at=excluded.fetched_at,retry_after=excluded.retry_after WHERE market_cache.retry_after<=? AND market_cache.fetched_at<? RETURNING key',
  ).bind(leaseKey, scheduledTime, now + 180000, now, scheduledTime).first();
  if (!lease) return;
  try {
  const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, Date.now(), true);
  const batches = scheduledBatches(marketPartitions(registryTokens(registry)).length, scheduledTime);
  // Same deployed Worker, private RPC entrypoint. Each bounded job gets its own
  // request budget; no public refresh endpoint or second deployment is needed.
  const jobs: MarketJob[] = [
    ...batches.map((batch) => ({ kind: 'batch' as const, batch })),
    { kind: 'globals' }, { kind: 'circulation' }, { kind: 'registry' },
  ];
  let failures = 0;
  for (const job of jobs) {
    try { await env.MARKET_REFRESH.run(job); }
    catch (error) {
      failures++;
      console.error('Scheduled market job failed', job, error instanceof Error ? error.message : 'unknown');
    }
  }
  console.log('Market refresh cycle', { batches, failures });
  if (failures) throw Error(`${failures} scheduled market jobs failed`);
  } finally {
    await env.DB.prepare('UPDATE market_cache SET retry_after=0 WHERE key=? AND fetched_at=?')
      .bind(leaseKey, scheduledTime).run();
  }
}
