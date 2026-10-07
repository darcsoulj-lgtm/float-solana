// Isolated Worker + D1 + private service binding. Never contacts a live provider.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {bundle,root} from '../tests/helpers/bundle.mjs';
const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=runtime('miniflare'),{build}=runtime('esbuild');
const a=await bundle(`export * from './lib/birdeye-volume';export {registryTokens} from './lib/token-registry';export {TOKENS} from './lib/tokens';export {REGISTRY_KEY} from './lib/backpack-registry';`);
const compiled=await build({stdin:{resolveDir:root,loader:'ts',contents:"export {default,MarketRefresh} from './float-worker';"},bundle:true,platform:'browser',format:'esm',write:false,external:['cloudflare:workers'],plugins:[{name:'test-only-http',setup(b){
 b.onResolve({filter:/^vinext\/server\/fetch-handler$/},()=>({path:'http',namespace:'fixture'}));
 b.onResolve({filter:/^@\/app\/chatgpt-auth$/},()=>({path:'auth',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'ts',resolveDir:root,contents:path==='auth'?'export const getChatGPTUser=async()=>null;':`import {GET} from './app/api/backpack-market/route';export default{async fetch(request,env){if(new URL(request.url).pathname==='/test-volume'){await env.MARKET_REFRESH.tokenVolumes();await env.MARKET_REFRESH.publicSnapshot();return Response.json({ok:true});}return GET(request);}};`}));
}}]});
let calls=0;
const now=Date.now();
const addition={...a.TOKENS.find(t=>t.issuer==='backpack'),symbol:'NEWSTOCK',underlyingSymbol:'NEWSTOCK',mint:'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',source:'https://api.backpack.exchange/api/v1/assets'};
const tokens=a.registryTokens({additions:[addition]}).filter(t=>t.issuer==='backpack'),mu=addition;
const worker=new Miniflare({name:'float-birdeye-test',modules:true,script:compiled.outputFiles[0].text,d1Databases:{DB:'isolated'},bindings:{BIRDEYE_API_KEY:'synthetic-private-key',BIRDEYE_VOLUME_ENABLED:'1',BIRDEYE_VOLUME_BUDGET_CU:'24000'},serviceBindings:{MARKET_REFRESH:{name:'float-birdeye-test',entrypoint:'MarketRefresh'}},compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],outboundService:async request=>{
 calls++;assert.equal(new URL(request.url).hostname,'public-api.birdeye.so');assert.equal(new URL(request.url).searchParams.get('address'),mu.mint);assert.equal(request.headers.get('X-API-KEY'),'synthetic-private-key');
 return Response.json({success:true,data:{volumeUSD:1234567,updateUnixTime:Math.floor(now/1000)}});
}});
try{
 const db=await worker.getD1Database('DB');await db.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER); CREATE TABLE limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);');
 await db.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').bind(a.REGISTRY_KEY,JSON.stringify([addition]),now).run();
 for(const t of tokens)await db.prepare('INSERT INTO market_cache VALUES (?,?,?,?)').bind(a.birdeyeVolumeKey(t.mint),JSON.stringify({mint:t.mint,usd24h:100,observedAt:now,collectedAt:now}),now,t===mu?0:now+86400000).run();
 const mints=a.birdeyeVolumeMints(tokens);assert.equal(mints.at(-1),mu.mint);
 const stage={version:1,id:'synthetic-round',mints,startedAt:now,next:mints.length-1,data:Object.fromEntries(tokens.filter(t=>t.mint!==mu.mint).map(t=>[t.mint,{mint:t.mint,usd24h:100,observedAt:now,collectedAt:now}]))};
 await db.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').bind(a.BIRDEYE_VOLUME_ROUND_KEY,JSON.stringify(stage),now).run();
 await db.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').bind('birdeye-usage:v2:'+Math.floor(now/86400000)*86400000,String(tokens.length*7),Math.floor(now/86400000)*86400000).run();
 const run=await worker.dispatchFetch('http://localhost/test-volume');assert.equal(run.status,200);assert.equal(calls,1, JSON.stringify((await db.prepare("SELECT key,payload FROM market_cache WHERE key LIKE 'birdeye-schedule:%' OR key LIKE 'birdeye-usage:%'").all()).results));
 for(let i=0;i<2;i++){
  const response=await worker.dispatchFetch('http://localhost/api/backpack-market');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  const text=await response.text(),data=JSON.parse(text);assert.equal(data.tokenVolumes.data.NEWSTOCK.usd24h,1234567);assert.equal(data.tokenVolumes.intervalMs,a.birdeyeVolumeInterval(tokens.length));assert.equal(Object.keys(data.tokenVolumes.data).length,tokens.length);assert.equal(data.tokenVolumes.round.id,'synthetic-round');assert.ok(!text.includes('synthetic-private-key'));assert.ok(!text.includes('birdeye-volume-round:'));assert.ok(!text.includes('birdeye-usage'));assert.ok(!response.headers.has('set-cookie'));assert.ok(Buffer.byteLength(text)<400000);
 }
 assert.equal(calls,1,'Public GETs must not call providers');
 const report={environment:'isolated Worker and D1; synthetic provider',privateScheduledCollection:true,publicReadsCallNoProviders:true,publicSecretsAbsent:true,cacheNoStoreOnBothReads:true,tokenCount:tokens.length,liveBirdeyeVerified:false};
 await mkdir('outputs',{recursive:true});await writeFile('outputs/birdeye-runtime.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await worker.dispose();}
