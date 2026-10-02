import { syncMarketChunk, type SnapshotChunkJob } from './market-snapshot-sync';
import { recordPoolEvidence, readPoolEvidence, retainPoolValues } from './pool-reconciliation';
import { readPoolInventory, rememberPoolInventory, poolObservationKey, saveTokenPoolObservation } from './pool-inventory';
import { collectPoolFallbacks } from './pool-fallback';
import { poolProviderRequest } from './pool-provider-fetch';
import { poolObservations, type SavedPools } from './pool-observations';
import { refreshHoldingWallets } from './issuer-holders-server';
import { backpackRegistry, registryTokens } from './backpack-registry';
import { marketPartitions, readMarketGlobals, type MarketEnvironment } from './market-overview-server';
import { readMarketBatch } from './market-service';
import { tokenBatchKey } from './backpack-registry';
import { TOKEN_REVIEW_DATE } from './tokens';
import { POOL_POLICY_VERSION } from './stock-pools';
import { type Pool, SourceHttpError } from './market-data';

// Four staggered groups keep a normal full cycle below the existing five-minute
// validity limit. A late/failed run retries on the next cycle, never per visitor.
export const MARKET_CYCLE_MINUTES = 4;
export function scheduledBatches(count: number, scheduledTime: number) {
  const slot = Math.floor(scheduledTime / 60000) % MARKET_CYCLE_MINUTES;
  return Array.from({ length: count }, (_, index) => index)
    .filter((index) => index % MARKET_CYCLE_MINUTES === slot);
}
export type MarketJob = SnapshotChunkJob | { kind: 'batch'; batch: number } | { kind: 'discovery' | 'pool-refresh'; mints: string[] } | { kind: 'globals' | 'registry' | 'holders' };
export type PoolChunkResult =
  | { data: Record<string, Pool[]> }
  | { error: { message: string; status?: number; retryAfterMs?: number } };
export type MarketJobBinding = {
  run(job: MarketJob): Promise<void>;
  pools(mints: string[]): Promise<PoolChunkResult>;
};

function rotatingMints(mints: string[], scheduledTime: number, count: number) {
  if (!mints.length) return [];
  const start = (Math.floor(scheduledTime / 60000) * count) % mints.length;
  return Array.from({length: Math.min(count, mints.length)}, (_, i) => mints[(start + i) % mints.length]);
}
// Discovery and value refresh are independently scheduled, private jobs.
export const scheduledDiscoveryMints = (mints: string[], time: number) => rotatingMints(mints, time, 8);
export const scheduledRefreshMints = (mints: string[], time: number) => rotatingMints(mints, time, 20);

// Keep the existing 90-token cache identity, but spend each private request's
// provider budget on at most ten tokens. Discovery runs separately.
export async function scheduledPools(mints: string[], binding: Pick<MarketJobBinding, 'pools'>) {
  const data: Record<string, Pool[]> = {};
  for (let offset = 0; offset < mints.length; offset += 10) {
    const result = await binding.pools(mints.slice(offset, offset + 10));
    if ('error' in result) {
      // Earlier chunks are complete observations. Preserve their progress; the
      // failed and unrequested chunks keep their old values and timestamps.
      if (Object.keys(data).length) {
        console.warn('Partial pool refresh', result.error.message);
        return data;
      }
      if (result.error.status) {
        throw new SourceHttpError('api.dexscreener.com', new Response(null, {
          status: result.error.status,
          headers: { 'Retry-After': String(Math.ceil((result.error.retryAfterMs ?? 30000) / 1000)) },
        }));
      }
      throw Error(result.error.message);
    }
    Object.assign(data, result.data);
  }
  return data;
}

export async function runPoolChunk(env: MarketEnvironment, mints: string[], mode: 'refresh' | 'discovery' = 'refresh'): Promise<PoolChunkResult> {
  try {
    if (!Array.isArray(mints) || !mints.length || mints.length > (mode === 'discovery' ? 4 : 10) || new Set(mints).size !== mints.length)
      throw Error('Invalid pool chunk');
    const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, Date.now(), true);
    const stocks = registryTokens(registry);
    const byMint = new Map(stocks.filter(token => token.issuer === 'backpack').map(token => [token.mint, token]));
    const tokens = mints.map(mint => {
      const token = byMint.get(mint);
      if (!token) throw Error('Unverified pool token');
      return token;
    });
    const containing = marketPartitions(stocks).filter(batch => batch.some(t => mints.includes(t.mint)));
    const knownPools: Pool[] = await readPoolInventory(env.DB, tokens);
    for (const batch of containing) {
      const key = `dex-pools-${POOL_POLICY_VERSION}:` + TOKEN_REVIEW_DATE + ':' + await tokenBatchKey(batch);
      const row = await env.DB.prepare('SELECT payload FROM market_cache WHERE key=?').bind(key).first<{payload: string | null}>();
      if (row?.payload) {
        const prior = poolObservations(JSON.parse(row.payload) as SavedPools, null).data;
        for (const token of tokens) knownPools.push(...(prior[token.symbol] ?? []));
      }
    }
    for (const token of tokens) {
      const row = await env.DB.prepare('SELECT payload FROM market_cache WHERE key=?').bind(poolObservationKey(token)).first<{payload: string | null}>();
      if (row?.payload) knownPools.push(...JSON.parse(row.payload) as Pool[]);
    }
    const recent: Pool[] = [];
    if (mode === 'refresh') for (const token of tokens) {
      const row = await env.DB.prepare('SELECT payload FROM market_cache WHERE key=?').bind('pool-discovery-values:'+token.mint).first<{payload:string|null}>();
      if (row?.payload) recent.push(...JSON.parse(row.payload) as Pool[]);
    }
    const deadline = AbortSignal.timeout(45000);
    const primaryDeadline = AbortSignal.timeout(18000);
    const bounded: typeof fetch = (input, init) => fetch(input, {
      ...init, signal: AbortSignal.any([deadline, primaryDeadline, ...(init?.signal ? [init.signal] : [])]),
    });
    const cooldown = await env.DB.prepare('SELECT retry_after FROM market_cache WHERE key=?')
      .bind('provider-cooldown:dexscreener').first<{retry_after:number}>();
    const known = [...new Map(knownPools.map(p => [p.address, p])).values()];
    const data = await collectPoolFallbacks({tokens, verified:stocks.filter(t=>t.issuer==='backpack'),known, mode, recent,
      observation: (provider,token,pools)=>recordPoolEvidence(env.DB,token,provider,pools,Date.now()),
      detailMints:mode === 'discovery' ? mints : [], dexAvailable:!(cooldown && cooldown.retry_after>Date.now()),
      primary:pacedMarketFetch(retryLimitedMarketFetch(env.DB,bounded,primaryDeadline),1000),
      request:poolProviderRequest(env.DB,fetch,deadline),
      discoveryObserved: async (mint, now) => {
        await env.DB.prepare('INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,?,0) ON CONFLICT(key) DO UPDATE SET fetched_at=excluded.fetched_at')
          .bind('pool-discovery:geckoterminal:'+mint,now).run();
      },
      primaryFailure: async error => {
        if(error instanceof SourceHttpError && error.status===429) await env.DB.prepare(
          'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?) ON CONFLICT(key) DO UPDATE SET retry_after=MAX(market_cache.retry_after,excluded.retry_after)',
        ).bind('provider-cooldown:dexscreener',Date.now()+error.retryAfterMs).run();
      },
    });
    if(mode==='refresh')for(const token of tokens)if(data[token.symbol])
      data[token.symbol]=retainPoolValues(data[token.symbol],[...known,...await readPoolEvidence(env.DB,token)],token,Date.now());
    for (const token of tokens) if (data[token.symbol]?.length)
      await rememberPoolInventory(env.DB, token, data[token.symbol], Date.now());
    if (mode === 'discovery') for (const token of tokens) if (data[token.symbol]?.length)
      await env.DB.prepare('INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at')
        .bind('pool-discovery-values:'+token.mint,JSON.stringify(data[token.symbol]),Date.now()).run();
    return {data};
  } catch (error) {
    if (error instanceof SourceHttpError && error.status === 429) {
      await env.DB.prepare(
        'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?) ON CONFLICT(key) DO UPDATE SET retry_after=MAX(market_cache.retry_after,excluded.retry_after)',
      ).bind('provider-cooldown:dexscreener', Date.now() + error.retryAfterMs).run();
    }
    // RPC exceptions lose custom properties. Preserve 429/Retry-After explicitly
    // so the canonical cache can apply its shared provider cooldown.
    return { error: {
      message: error instanceof Error ? error.message : 'Pool refresh failed',
      ...(error instanceof SourceHttpError ? { status: error.status, retryAfterMs: error.retryAfterMs } : {}),
    } };
  }
}

// One retry per private chunk, only when the provider explicitly permits a
// short retry within our deadline. Publish the cooldown before waiting so
// other views/jobs do not keep requesting while this job backs off.
export function retryLimitedMarketFetch(
  db: D1Database, fetcher: typeof fetch, signal: AbortSignal,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): typeof fetch {
  let retried = false;
  return async (input, init) => {
    const response = await fetcher(input, init);
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== 'api.dexscreener.com' || response.status !== 429) return response;
    const error = new SourceHttpError(url.hostname, response);
    // Small positive jitter prevents retrying exactly on a reset boundary.
    const delay = error.retryAfterMs + 1000 + Math.floor(Math.random() * 1000);
    await db.prepare(
      'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?) ON CONFLICT(key) DO UPDATE SET retry_after=MAX(market_cache.retry_after,excluded.retry_after)',
    ).bind('provider-cooldown:dexscreener', Date.now() + delay).run();
    if (retried || delay > 20000 || !response.headers.has('retry-after')) return response;
    retried = true;
    await response.body?.cancel();
    await sleep(delay);
    signal.throwIfAborted();
    const cooldown = await db.prepare('SELECT retry_after FROM market_cache WHERE key=?')
      .bind('provider-cooldown:dexscreener').first<{retry_after: number}>();
    // Another caller may have received a longer cooldown in the meantime.
    if (cooldown && cooldown.retry_after > Date.now()) throw error;
    // A retry is a new HTTP attempt with its own timeout. The original
    // private-job deadline remains authoritative across both attempts.
    return fetcher(input, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
  };
}

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

export async function runMarketJob(env: MarketEnvironment & { MARKET_REFRESH: MarketJobBinding }, job: MarketJob) {
  if (job.kind === 'snapshot') { await syncMarketChunk(env,job); return; }
  if (!['batch', 'discovery', 'pool-refresh', 'globals', 'registry', 'holders'].includes(job.kind)) throw Error('Unsupported market job');
  if (job.kind === 'discovery' || job.kind === 'pool-refresh') {
    const result = await runPoolChunk(env, job.mints, job.kind === 'discovery' ? 'discovery' : 'refresh');
    if ('error' in result) throw Error(result.error.message);
    if (job.kind === 'pool-refresh') {
      const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, Date.now(), true);
      for (const token of registryTokens(registry)) if (token.issuer === 'backpack' && job.mints.includes(token.mint) && result.data[token.symbol])
        await saveTokenPoolObservation(env.DB, token, result.data[token.symbol], Date.now());
    }
    return;
  }
  if (job.kind === 'holders') { await refreshHoldingWallets(env); return; }
  const deferred: Promise<unknown>[] = [];
  const registry = await backpackRegistry(env.DB, (work) => deferred.push(work), env.SOLANA_RPC_URL, fetch, Date.now(), job.kind !== 'registry');
  const tokens = registryTokens(registry);
  if (job.kind === 'registry') {
    await Promise.all(deferred);
  } else if (job.kind === 'globals') {
    await readMarketGlobals(env, tokens, false);
  } else if (job.kind === 'batch') {
    const batch = marketPartitions(tokens)[job.batch];
    if (!Number.isSafeInteger(job.batch) || !batch?.some(token => token.issuer === 'backpack')) throw Error('Invalid scheduled market batch');
    const deadline = AbortSignal.timeout(16000);
    const bounded: typeof fetch = (input, init) => fetch(input, {
      ...init, signal: AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])]),
    });
    await readMarketBatch(env.DB, batch, {
      rpcUrl: env.SOLANA_RPC_URL, verifiedStocks: tokens, fetcher: pacedMarketFetch(bounded),
      pools: false, // Independent pool jobs commit each token immediately.
    });
  }
}

export async function runMarketSchedule(env: MarketEnvironment & { MARKET_REFRESH: MarketJobBinding }, scheduledTime: number) {
  const now = Date.now();
  const leaseKey = 'market-schedule:v1';
  const lease = await env.DB.prepare(
    'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,?,?) ON CONFLICT(key) DO UPDATE SET fetched_at=excluded.fetched_at,retry_after=excluded.retry_after WHERE market_cache.retry_after<=? AND market_cache.fetched_at<? RETURNING key',
  ).bind(leaseKey, scheduledTime, now + 300000, now, scheduledTime).first();
  if (!lease) return;
  try {
  const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, Date.now(), true);
  const tokens = registryTokens(registry);
  const partitions = marketPartitions(tokens);
  const activeBatches = partitions.flatMap((batch, index) => batch.some(token => token.issuer === 'backpack') ? [index] : []);
  const batches = scheduledBatches(activeBatches.length, scheduledTime).map(index => activeBatches[index]);
  // Same deployed Worker, private RPC entrypoint. Each bounded job gets its own
  // request budget; no public refresh endpoint or second deployment is needed.
  const mints = tokens.filter(t => t.issuer === 'backpack').map(t => t.mint);
  const discoveries = scheduledDiscoveryMints(mints, scheduledTime);
  const refreshes = scheduledRefreshMints(mints, scheduledTime);
  const refreshJobs: MarketJob[] = [];
  for (let offset = 0; offset < refreshes.length; offset += 10)
    refreshJobs.push({kind: 'pool-refresh', mints: refreshes.slice(offset, offset + 10)});
  const discoveryJobs: MarketJob[] = [];
  for (let offset = 0; offset < discoveries.length; offset += 4)
    discoveryJobs.push({kind: 'discovery', mints: discoveries.slice(offset, offset + 4)});
  const jobs: MarketJob[] = [
    ...batches.map((batch) => ({ kind: 'batch' as const, batch })),
    ...discoveryJobs, ...refreshJobs,
    { kind: 'globals' }, { kind: 'registry' }, { kind: 'holders' },
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
