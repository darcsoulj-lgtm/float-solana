// Isolated real Worker/D1/RPC verification. No credentials or live providers.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { bundle } from '../tests/helpers/bundle.mjs';
const require = createRequire(import.meta.url);
const rr = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = rr('miniflare');
const { build } = rr('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const api = await bundle(`export * from './lib/market-overview-server';export {TOKENS,TOKEN_REVIEW_DATE} from './lib/tokens';export {tokenBatchKey,REGISTRY_KEY} from './lib/backpack-registry';export {POOL_POLICY_VERSION} from './lib/stock-pools';export {scheduledBatches} from './lib/market-scheduler';`);
const compiled = await build({
  stdin: {resolveDir:root,loader:'ts',contents:"export {default,MarketRefresh} from './float-worker';"},
  bundle:true,platform:'browser',format:'esm',write:false,external:['cloudflare:workers'],
  plugins:[{name:'isolated-runtime',setup(b){
    b.onResolve({filter:/^vinext\/server\/fetch-handler$/},()=>({path:'http',namespace:'fixture'}));
    b.onResolve({filter:/^@\/app\/chatgpt-auth$/},()=>({path:'auth',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'ts',resolveDir:root,contents:path==='auth'
      ? 'export const getChatGPTUser=async()=>null;'
      : `import {GET} from './app/api/market-data/route';export default {fetch:GET};`}));
  }}],
});
let providerCalls=0, recoveryPair=null;
const worker = new Miniflare({
  name:'float-market-test',unsafeTriggerHandlers:true,modules:true,script:compiled.outputFiles[0].text,
  d1Databases:{DB:'market-isolated'},bindings:{MARKET_SCHEDULED:'1'},
  serviceBindings:{MARKET_REFRESH:{name:'float-market-test',entrypoint:'MarketRefresh'}},
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],
  outboundService:async(req)=>{
    providerCalls++;
    if(recoveryPair){
      if(req.url.includes('stonkfun.xyz')) return Response.json({data:{tokens:[]}});
      if(req.url.includes('api.dexscreener.com')) return Response.json([recoveryPair]);
    }
    return new Response('',{status:429,headers:{'Retry-After':'600'}});
  },
});
const read=async()=>{
  const start=performance.now();
  const response=await worker.dispatchFetch('http://localhost/api/market-data?overview=1');
  return {status:response.status,body:await response.json(),ms:performance.now()-start};
};
try {
  const db=await worker.getD1Database('DB');
  await db.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER); CREATE TABLE limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);');
  const cold=await read();assert.equal(cold.status,200);assert.equal(cold.body.prices.data,null);assert.equal(providerCalls,0);
  const now=Date.now();
  const seed=(key,data,time=now)=>db.prepare('INSERT INTO market_cache VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=0').bind(key,JSON.stringify(data),time).run();
  await seed(api.REGISTRY_KEY,[]);
  const partitions=api.marketPartitions(api.TOKENS);
  for(const batch of partitions){
    const suffix=api.TOKEN_REVIEW_DATE+':'+await api.tokenBatchKey(batch);
    await seed('llama-prices-v3:'+suffix,Object.fromEntries(batch.map(t=>[t.symbol,{price:12,confidence:1,timestamp:now}])));
    for(const prefix of ['solana-supplies-v4:','llama-history-v1:',`dex-pools-${api.POOL_POLICY_VERSION}:`])await seed(prefix+suffix,{});
  }
  const keys=await api.marketGlobalKeys(api.TOKENS);
  await seed(keys.catalog,[]);await seed(keys.markets,{});await seed(keys.backpack,{});await seed(keys.valuations,{rows:{},observedAt:now});await seed('xstocks-circulation:v1',{});
  const warm=await read();assert.equal(Object.keys(warm.body.prices.data).length,api.TOKENS.length);assert.equal(providerCalls,0);
  const readings=await Promise.all(Array.from({length:30},()=>read()));
  assert.ok(readings.every(r=>r.status===200));assert.equal(providerCalls,0);
  const scheduled=await fetch(new URL('/cdn-cgi/handler/scheduled?cron=*+*+*+*+*', await worker.ready));
  assert.equal(scheduled.status,200,await scheduled.text());assert.equal(providerCalls,0);
  assert.ok(await db.prepare('SELECT key FROM market_cache WHERE key=?').bind('market-schedule:v1').first());
  // Expired pool data remains readable while a scheduled job encounters 429.
  const scheduledTime=Date.now()+60000;
  const index=api.scheduledBatches(partitions.length,scheduledTime)[0];
  const batch=partitions[index];const symbol=batch[0].symbol;
  const key=`dex-pools-${api.POOL_POLICY_VERSION}:`+api.TOKEN_REVIEW_DATE+':'+await api.tokenBatchKey(batch);
  const observed=Date.now()-360000;await seed(key,{[symbol]:[{volume24h:42,liquidity:84}]},observed);
  // Direct private RPC exercises exactly the production job entrypoint.
  // Cron's private binding invokes a real WorkerEntrypoint; reset delivery lease to run it again.
  await db.prepare('DELETE FROM market_cache WHERE key=?').bind('market-schedule:v1').run();
  const dueIndex=api.scheduledBatches(partitions.length,Date.now())[0];
  const dueBatch=partitions[dueIndex];const dueKey=`dex-pools-${api.POOL_POLICY_VERSION}:`+api.TOKEN_REVIEW_DATE+':'+await api.tokenBatchKey(dueBatch);
  await seed(dueKey,{[dueBatch[0].symbol]:[{volume24h:42,liquidity:84}]},observed);
  const rerun=await fetch(new URL('/cdn-cgi/handler/scheduled?cron=*+*+*+*+*', await worker.ready));
  assert.equal(rerun.status,200,await rerun.text());
  const saved=await db.prepare('SELECT payload,fetched_at FROM market_cache WHERE key=?').bind(dueKey).first();
  assert.equal(saved.fetched_at,observed);assert.equal(JSON.parse(saved.payload)[dueBatch[0].symbol][0].volume24h,42);
  assert.ok(providerCalls > 0);
  const before=providerCalls;const stale=await read();assert.equal(stale.status,200);assert.equal(providerCalls,before);
  const failureProviderCalls=providerCalls;
  recoveryPair={chainId:'solana',pairAddress:'A'.repeat(32),dexId:'raydium',
    baseToken:{address:dueBatch[0].mint},quoteToken:{address:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'},
    priceUsd:'15',priceChange:{h24:2},volume:{h24:1234},liquidity:{usd:5678},pairCreatedAt:now-1000};
  await db.prepare('DELETE FROM market_cache WHERE key IN (?,?)').bind('market-schedule:v1','provider-cooldown:dexscreener').run();
  await db.prepare('UPDATE market_cache SET retry_after=0 WHERE key=?').bind(dueKey).run();
  const recovered=await fetch(new URL('/cdn-cgi/handler/scheduled?cron=*+*+*+*+*', await worker.ready));
  assert.equal(recovered.status,200,await recovered.text());
  const updated=await db.prepare('SELECT payload,fetched_at FROM market_cache WHERE key=?').bind(dueKey).first();
  assert.ok(updated.fetched_at>observed);
  assert.equal(JSON.parse(updated.payload)[dueBatch[0].symbol][0].volume24h,1234);
  const refreshed=await read();assert.equal(refreshed.body.pools.data[dueBatch[0].symbol][0].volume24h,1234);
  const times=readings.map(r=>r.ms).sort((a,b)=>a-b);
  const report={environment:'isolated Miniflare, synthetic providers and D1 fixtures',coldMs:cold.ms,warmMs:warm.ms,concurrentReaders:readings.length,p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1],readProviderCalls:0,scheduledFailureProviderCalls:failureProviderCalls,successfulRecovery:true,tokenCoverage:Object.keys(warm.body.prices.data).length,preservedOriginalTimestamp:true};
  await mkdir('outputs',{recursive:true});await writeFile('outputs/market-scheduler-runtime.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await worker.dispose();}
