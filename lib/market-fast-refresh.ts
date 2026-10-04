import { backpackHistoryKey, BACKPACK_HISTORY_REFRESH_MS } from './backpack-reference';
import { marketGlobalKeys } from './market-overview-server';
import { backpackRegistry, registryTokens } from './backpack-registry';
import type { MarketEnvironment } from './market-overview-server';
import { executeMarketWork } from './market-work-executor';
import { marketCacheRows } from './market-cache';
import { marketFailure } from './market-work-store';
import { SUPPLY_REFRESH_MS, SUPPLY_WORK_BATCH_SIZE } from './market-freshness';

export type FastMarketJob = {kind:'references'} | {kind:'reference-history';mint:string} | {kind:'supplies';mints:string[]};
export type FastMarketBinding = {
  fast(job:FastMarketJob):Promise<void>;
  fastSchedule(time:number):Promise<void>;
};

// Transitional fast lane uses the existing cache table and shared collector.
// It needs no durable-queue migration and never runs inside a visitor request.
export async function refreshFastMarketSource(env:MarketEnvironment, job:FastMarketJob, fetcher:typeof fetch=fetch) {
  if(job.kind!=='references'&&job.kind!=='supplies'&&job.kind!=='reference-history')throw Error('Invalid fast source');
  if(job.kind==='supplies'&&(!Array.isArray(job.mints)||!job.mints.length||job.mints.length>SUPPLY_WORK_BATCH_SIZE||job.mints.some(m=>!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m))))throw Error('Invalid fast supplies');
  if(job.kind==='reference-history'&&!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(job.mint))throw Error('Invalid history mint');
  const key='market-fast:v1:'+job.kind+(job.kind==='supplies'?':'+job.mints.join(','):job.kind==='reference-history'?':'+job.mint:''), started=Date.now();
  const lease=await env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,NULL,?,?) ON CONFLICT(key) DO UPDATE SET fetched_at=excluded.fetched_at,retry_after=excluded.retry_after WHERE market_cache.retry_after<=? RETURNING key')
    .bind(key,started,started+45000,started).first();
  if(!lease)return;
  try {
    const result=await executeMarketWork(env,job,fetcher),finished=Date.now();
    const fence='EXISTS(SELECT 1 FROM market_cache lease WHERE lease.key=? AND lease.fetched_at=? AND lease.retry_after>?)';
    await env.DB.batch([
      ...result.writes.map(w=>env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) SELECT ?,?,?,0 WHERE ${fence} ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=0 WHERE market_cache.fetched_at<excluded.fetched_at`)
        .bind(w.key,w.payload,w.fetchedAt,key,started,finished)),
      env.DB.prepare('UPDATE market_cache SET payload=?,retry_after=? WHERE key=? AND fetched_at=? AND retry_after>?')
        .bind(JSON.stringify({status:'ok',succeededAt:finished}),finished+(job.kind==='references'?45000:job.kind==='reference-history'?BACKPACK_HISTORY_REFRESH_MS:SUPPLY_REFRESH_MS-30000),key,started,finished),
    ]);
  }catch(error){
    const failure=marketFailure(error);
    await env.DB.prepare('UPDATE market_cache SET payload=?,retry_after=? WHERE key=? AND fetched_at=?').bind(JSON.stringify({status:failure.code,failedAt:Date.now()}),Date.now()+Math.max(30000,failure.retryAfterMs),key,started).run();
    console.error('Fast market source failed',{source:job.kind,code:failure.code});
    throw error;
  }
}

export async function runFastMarketSchedule(env:MarketEnvironment & {MARKET_REFRESH:FastMarketBinding},time:number) {
  // Start prices before registry/supply planning. An RPC or registry failure
  // must not prevent the independent Backpack request from completing.
  const tasks:Promise<unknown>[]=[env.MARKET_REFRESH.fast({kind:'references'})];
  tasks.push((async()=>{
    const registry=await backpackRegistry(env.DB,()=>{},env.SOLANA_RPC_URL,fetch,Date.now(),true);
    const tokens=registryTokens(registry).filter(t=>t.issuer==='backpack');
    const batches: {job:FastMarketJob;key:string}[]=[];
    for(let offset=0;offset<tokens.length;offset+=SUPPLY_WORK_BATCH_SIZE){
      const mints=tokens.slice(offset,offset+SUPPLY_WORK_BATCH_SIZE).map(t=>t.mint);
      batches.push({job:{kind:'supplies',mints},key:'market-fast:v1:supplies:'+mints.join(',')});
    }
    const globalKey = (await marketGlobalKeys(tokens)).backpack;
    const rows=await marketCacheRows(env.DB,[...batches.map(b=>b.key),globalKey,...tokens.flatMap(t=>[backpackHistoryKey(t.mint),'market-fast:v1:reference-history:'+t.mint])]);
    const tickerRow = rows.get(globalKey);
    const tickers = tickerRow?.payload ? JSON.parse(tickerRow.payload) as Record<string, import('./market-data').BackpackMarket> : {};
    const historyDue = tokens.filter(t=>{
      const quote = tickers[t.symbol];
      const time = quote?.externalObservedAt ?? tickerRow?.fetched_at ?? 0;
      if(quote?.externalPrice != null && quote.externalChange24h != null && time <= Date.now() && Date.now()-time <= 5*60000)return false;
      const history = rows.get(backpackHistoryKey(t.mint));
      return (rows.get('market-fast:v1:reference-history:'+t.mint)?.retry_after ?? 0) <= Date.now() && (!history?.fetched_at || Date.now()-history.fetched_at >= BACKPACK_HISTORY_REFRESH_MS);
    }).sort((a,b)=>Math.max(rows.get(backpackHistoryKey(a.mint))?.fetched_at ?? 0,rows.get('market-fast:v1:reference-history:'+a.mint)?.fetched_at ?? 0)-Math.max(rows.get(backpackHistoryKey(b.mint))?.fetched_at ?? 0,rows.get('market-fast:v1:reference-history:'+b.mint)?.fetched_at ?? 0));
    // At most four official history requests per tick, independent of RPC jobs.
    const histories = Promise.allSettled(historyDue.slice(0,4).map(t=>env.MARKET_REFRESH.fast({kind:'reference-history',mint:t.mint})));
    // Due work survives missed cron ticks. Oldest first, at most two bounded
    // RPC batches per tick; an initial/recovered deployment catches up quickly.
    const due=batches.filter(b=>(rows.get(b.key)?.retry_after??0)<=time)
      .sort((a,b)=>(rows.get(a.key)?.fetched_at??0)-(rows.get(b.key)?.fetched_at??0));
    const jobs=due.slice(0,2).map(b=>env.MARKET_REFRESH.fast(b.job));
    const results = await Promise.allSettled([...jobs, histories]);
    if (results.some(r=>r.status==='rejected')) throw Error('Fast source retry required');
  })());
  const results=await Promise.allSettled(tasks);
  if(results.some(r=>r.status==='rejected'))throw Error('A fast market source needs retry');
}
