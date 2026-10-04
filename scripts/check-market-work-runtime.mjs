// Isolated real WorkerEntrypoint + D1 test. Recorded/synthetic provider replies;
// no production writes, live API traffic, wallet actions or trading.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {bundle,root} from '../tests/helpers/bundle.mjs';
const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=runtime('miniflare'),{build}=runtime('esbuild');
const api=await bundle(`export * from './lib/market-work-store';export {TOKENS} from './lib/tokens';export {REGISTRY_KEY} from './lib/backpack-registry';export {marketGlobalKeys} from './lib/market-overview-server';export {poolObservationKey} from './lib/pool-inventory';export {POOL_POLICY_VERSION} from './lib/stock-pools';export {parseProviderPools} from './lib/pool-provider-adapters';export {poolSourceKey} from './lib/market-work-executor';`);
const compiled=await build({stdin:{resolveDir:root,loader:'ts',contents:"export {default,MarketRefresh} from './float-worker';"},bundle:true,platform:'browser',format:'esm',write:false,external:['cloudflare:workers'],plugins:[{name:'test-only-http',setup(b){
 b.onResolve({filter:/^vinext\/server\/fetch-handler$/},()=>({path:'http',namespace:'fixture'}));
 b.onResolve({filter:/^@\/app\/chatgpt-auth$/},()=>({path:'auth',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'ts',resolveDir:root,contents:path==='auth'?'export const getChatGPTUser=async()=>null;':`import {GET} from './app/api/backpack-market/route';export default{async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/test-fast'){await env.MARKET_REFRESH.fast(await request.json());return Response.json({ok:true});}if(url.pathname==='/test-work'){const job=await request.json();await env.MARKET_REFRESH.work(job.id,job.token);return Response.json({ok:true});}return GET(request);}};`}));
}}]});
const tokens=api.TOKENS.filter(t=>t.issuer==='backpack'),dram=tokens.find(t=>t.symbol==='DRAM');
const gecko=JSON.parse(await readFile('tests/fixtures/pool-backup/dram-gecko.json','utf8'));
let held=true,release,replies='outage',calls=0;
const waiting=new Promise(resolve=>{release=resolve;});
const worker=new Miniflare({name:'float-durable-test',unsafeTriggerHandlers:true,modules:true,script:compiled.outputFiles[0].text,d1Databases:{DB:'durable-isolated'},bindings:{MARKET_SCHEDULED:'1'},serviceBindings:{MARKET_REFRESH:{name:'float-durable-test',entrypoint:'MarketRefresh'}},compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],outboundService:async request=>{
 calls++;
 if(request.url.includes('api.backpack.exchange/api/v1/tickers'))return Response.json(tokens.map(t=>({symbol:t.symbol+'.US_USDC',firstPrice:'100',lastPrice:'105',priceChangePercent:'0.05',volume:'10',quoteVolume:'1050',trades:'10'})));
 if(request.url.includes('api.geckoterminal.com')){if(held)await waiting;return replies==='outage'?new Response('',{status:503}):Response.json(gecko);}
 if(request.url.includes('api.orca.so'))return Response.json({data:[{address:gecko.data[0].attributes.address,tokenMintA:dram.mint,tokenMintB:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',tvlUsdc:100,stats:{'24h':{volume:null}}}]});
 return new Response('',{status:503});
}});
try{
 const db=await worker.getD1Database('DB');
 await db.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER); CREATE TABLE limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);');
 await db.exec((await readFile('drizzle/0021_market_work.sql','utf8')).replace(/--[^\n]*/g,'').replace(/\s+/g,' '));
 const now=Date.now(),oldTime=now-600000;
 const seed=async(key,value,time=now)=>db.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').bind(key,JSON.stringify(value),time).run();
 await seed(api.REGISTRY_KEY,[]);
 const old={...api.parseProviderPools('geckoterminal',gecko,[dram],tokens,[],oldTime).DRAM[0],volume24h:42};
 await seed(api.poolObservationKey(dram),[old],oldTime);
 await seed('pool-inventory-'+api.POOL_POLICY_VERSION+':'+dram.mint,[{...old,unavailable:true,volume24h:null,observedAt:undefined}]);
 await api.seedMarketWork(db,'scope',[
  {id:'references',lane:'references',job:{kind:'references'},interval:60000},
  {id:'source',lane:'refresh',job:{kind:'pool-source',mint:dram.mint,provider:'geckoterminal',discovery:false},interval:60000},
  {id:'publish:'+dram.mint,lane:'publication',job:{kind:'pool-publish',mint:dram.mint},interval:60000},
  {id:'null-source',lane:'discovery',job:{kind:'pool-source',mint:dram.mint,provider:'orca',discovery:true},interval:60000},
 ],now);
 const run=work=>worker.dispatchFetch('http://localhost/test-work',{method:'POST',body:JSON.stringify({id:work.id,token:work.lease_token}),headers:{'content-type':'application/json'}});
 const slow=await api.claimMarketWork(db,'refresh',Date.now()),fast=await api.claimMarketWork(db,'references',Date.now());
 const slowRequest=run(slow);
 const fastResponse=await worker.dispatchFetch('http://localhost/test-fast',{method:'POST',body:JSON.stringify({kind:'references'})});assert.equal(fastResponse.status,200);
 await run(fast);
 const keys=await api.marketGlobalKeys(tokens);
 const price=await db.prepare('SELECT * FROM market_cache WHERE key=?').bind(keys.backpack).first();
 assert.ok(price.fetched_at>=now);assert.equal(JSON.parse(price.payload).DRAM.externalChange24h,5);
 const stalled=await db.prepare('SELECT * FROM market_work WHERE id=?').bind('source').first();assert.ok(stalled.lease_token);assert.equal(stalled.succeeded_at,null);
 release();await slowRequest;held=false;
 const failed=await db.prepare('SELECT * FROM market_work WHERE id=?').bind('source').first();assert.equal(failed.failure_code,'provider_http');
 const unchanged=await db.prepare('SELECT * FROM market_cache WHERE key=?').bind(api.poolObservationKey(dram)).first();assert.equal(unchanged.fetched_at,oldTime);assert.equal(JSON.parse(unchanged.payload)[0].volume24h,42);
 await db.prepare("DELETE FROM market_cache WHERE key LIKE 'pool-request-slot:%'").run();
 await db.prepare('UPDATE market_work SET due_at=0 WHERE id=?').bind('source').run();replies='recovered';
 await run(await api.claimMarketWork(db,'refresh',Date.now()));
 await run(await api.claimMarketWork(db,'publication',Date.now()));
 const published=await db.prepare('SELECT payload FROM market_cache WHERE key=?').bind(api.poolObservationKey(dram)).first();const pools=JSON.parse(published.payload);
 assert.ok(pools.length>1);assert.ok(pools.some(p=>p.volume24h>42));
 const first=await worker.dispatchFetch('http://localhost/api/backpack-market'),body=await first.json();assert.equal(first.status,200);assert.match(first.headers.get('cache-control'),/no-store/);
 assert.equal(body.backpack.data.DRAM.externalChange24h,5);assert.ok(body.pools.data.DRAM.some(p=>p.volume24h>42));
 assert.ok(!JSON.stringify(body).includes('pool-source-v1'));assert.ok(!JSON.stringify(body).includes('volumeIssue'));
 const afterRead=calls;const hit=await worker.dispatchFetch('http://localhost/api/backpack-market');assert.equal(hit.status,200);assert.match(hit.headers.get('cache-control'),/no-store/);assert.equal(calls,afterRead);
 await run(await api.claimMarketWork(db,'discovery',Date.now()));
 const nullEvidence=await db.prepare('SELECT payload FROM market_cache WHERE key=?').bind(api.poolSourceKey(dram.mint,'orca',true)).first();
 assert.equal(JSON.parse(nullEvidence.payload).issues[0].code,'source_null');assert.equal(JSON.parse(nullEvidence.payload).pools[0].volume24h,null);
 const report={environment:'isolated real Worker/private RPC/D1; recorded and synthetic providers',referencesPublishWhilePoolsBlocked:true,fastServicePublishesWhilePoolsBlocked:true,normalizedChangePercent:5,providerFailurePreservesValueAndOriginalTime:true,retryResumesWithoutProcessRestart:true,newPoolIdentitiesAppearAfterSourcePublication:true,sourceNullDistinctFromZero:true,publicCacheNoStoreOnBothReads:true,publicReadsCallNoProviders:true,ownerAlertDelivery:'unit-tested with fake receiver; no real destination configured',wallClock24HourSoak:false,cloudflareProductionCpuMeasured:false};
 await mkdir('outputs',{recursive:true});await writeFile('outputs/market-work-runtime.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{release();await worker.dispose();}
