import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {root} from './helpers/bundle.mjs';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
// Exercise the real Worker entrypoint and recovery adapter with network/storage
// fixtures. Other independently tested lanes are stubs, never live providers.
const stubs={
 'vinext/server/fetch-handler': `export default {fetch:async(req)=>Response.json({identity:req.headers.get('oai-authenticated-user-id'),email:req.headers.get('oai-authenticated-user-email'),name:req.headers.get('oai-authenticated-user-full-name'),extension:req.headers.get('oai-authenticated-user-future'),cookie:req.headers.get('cookie'),authorization:req.headers.get('authorization'),method:req.method,body:req.method==='POST'?await req.text():null})};`,
 'cloudflare:workers': 'export class WorkerEntrypoint {constructor(ctx,env){this.env=env;}}',
 './lib/trading-activity-server': 'export async function recordTradingActivity(){}',
 './lib/birdeye-volume-server': 'export async function refreshBirdeyeVolumes(){}',
 './lib/market-scheduler': 'export async function runPoolChunk(){};export async function runMarketJob(){};export async function runMarketSchedule(){}',
 './lib/market-work-scheduler': 'export async function runDurableMarketSchedule(){};export async function runDurableMarketWork(){};export async function planMarketWork(){};export async function planMarketTokens(){};export async function planMarketShards(){}',
 './lib/expired-record-cleanup': 'export async function cleanupExpiredRecords(){}',
 './lib/public-market-snapshot': 'export async function publishPublicMarketSnapshot(){}',
 './lib/market-work-health': 'export async function checkMarketWorkHealth(){}',
 './lib/market-fast-refresh': 'export async function runFastMarketSchedule(){};export async function refreshFastMarketSource(){}',
};
const {outputFiles}=await build({stdin:{contents:`export {default,MarketRefresh} from './float-worker';`,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'isolated-lanes',setup(build){build.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:'fixture'}:undefined);build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'js'}));}}]});
const {default:worker,MarketRefresh}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const now=Date.now(),commit='a'.repeat(40);
function environment(){
 const calls=[];
 const env={MARKET_COLLECTION_SOURCE:'github',MARKET_FAST_SOURCE:'1',DB:{prepare(){return{bind(){return{first:async()=>({payload:commit})};}};}}};
 const privateWorker=new MarketRefresh({},env);
 env.MARKET_REFRESH={collectionTrigger:async()=>{calls.push('trigger');await privateWorker.collectionTrigger();},holderCollectionTrigger:async()=>{calls.push('holder-trigger');await privateWorker.holderCollectionTrigger();},tokenVolumes:async()=>{calls.push('volumes');},run:async()=>{calls.push('holders');},fastSchedule:async()=>{calls.push('fast');},activity:async()=>{calls.push('activity');},publicSnapshot:async()=>{calls.push('snapshot');},health:async()=>{calls.push('health');}};
 return {env,calls};
}
void test('GitHub cron invokes the private recovery binding while an absent credential leaves all existing lanes working',async()=>{
 const original=globalThis.fetch;let reads=0;
 globalThis.fetch=async()=>{reads++;return Response.json({version:1,generatedAt:now,commit,chunks:['b'.repeat(64)]});};
 try{const {env,calls}=environment();await worker.scheduled({scheduledTime:now-now%60000+60000},env);assert.deepEqual(calls.filter(c=>!['activity','health'].includes(c)).sort((a,b)=>a.localeCompare(b)),['fast','holder-trigger','holders','snapshot','trigger','volumes']);assert.equal(reads,1);}finally{globalThis.fetch=original;}
});
void test('a recovery failure cannot skip price, holder or snapshot lanes and is still reported',async()=>{
 const original=globalThis.fetch;let reads=0;
 globalThis.fetch=async()=>{reads++;return Response.json({version:1,generatedAt:now,commit,chunks:['b'.repeat(64)]});};
 try{const {env,calls}=environment();env.MARKET_REFRESH.collectionTrigger=async()=>{calls.push('trigger');throw Error('fixture rejected');};await assert.rejects(worker.scheduled({scheduledTime:now},env),/scheduled market source failed/);assert.ok(['trigger','fast','holders','volumes'].every(c=>calls.includes(c)));assert.equal(reads,1);}finally{globalThis.fetch=original;}
});
void test('an hourly source outage cannot prevent independent activity recording or hide the failure',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({version:1,generatedAt:now,commit,chunks:['b'.repeat(64)]});
 try{const {env,calls}=environment();env.MARKET_REFRESH.fastSchedule=async()=>{calls.push('fast');throw Error('provider outage');};await assert.rejects(worker.scheduled({scheduledTime:now-now%3600000},env),/scheduled market source failed/);assert.ok(calls.includes('activity'));assert.ok(calls.includes('volumes'));assert.ok(calls.includes('snapshot'));assert.ok(calls.includes('health'));}finally{globalThis.fetch=original;}
});
void test('custom-domain ingress removes spoofed legacy identity even if cache is unavailable, preserving wallet credentials and bodies',async()=>{
 const original=globalThis.caches;
 globalThis.caches={open:async()=>{throw Error('cache unavailable');}};
 try{
  const req=new Request('https://float.test/api/me',{method:'POST',headers:{'OAI-Authenticated-User-Id':'attacker','oai-authenticated-user-email':'attacker@example.invalid','oai-authenticated-user-full-name':'Attacker','oai-authenticated-user-future':'forged','cookie':'float_session=fixture','authorization':'Bearer fixture'},body:'fixture-body'});
  const result=await (await worker.fetch(req,{},{})).json();
  assert.deepEqual(result,{identity:null,email:null,name:null,extension:null,cookie:'float_session=fixture',authorization:'Bearer fixture',method:'POST',body:'fixture-body'});
 }finally{globalThis.caches=original;}
});
void test('custom-domain identity stripping also applies through the ordinary cache wrapper',async()=>{
 const original=globalThis.caches;
 globalThis.caches={open:async()=>({match:async()=>undefined,put:async()=>{}})};
 try{const r=await worker.fetch(new Request('https://float.test/api/me',{headers:{'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':'attacker@example.invalid'}}),{PUBLIC_RENDER_VERSION:'audit'},{waitUntil(){}});assert.equal((await r.json()).identity,null);}finally{globalThis.caches=original;}
});
