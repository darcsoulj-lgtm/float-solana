import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const {triggerOverdueCollection}=await bundle(`export * from './lib/market-collection-trigger';`);
const now=200000000,secret='fixture-secret';
function database(){
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)');
 const db={prepare(sql){return{bind(...args){return{first:async()=>raw.prepare(sql).get(...args)??null,run:async()=>raw.prepare(sql).run(...args)};}};}};
 return {raw,env:{DB:db,MARKET_WORKFLOW_TOKEN:secret}};
}
function provider({time=now-3600000,runs=[],dispatch=204}={}){
 const calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});if(url.includes('raw.githubusercontent.com'))return Response.json({version:1,generatedAt:time,commit:'a'.repeat(40),chunks:['b'.repeat(64)]});if(url.includes('/runs?')){const status=new URL(url).searchParams.get('status'),active=runs.filter(r=>r.status===status);return Response.json({workflow_runs:active.slice(0,1),total_count:active.length});}return new Response(null,{status:dispatch});};
 return {calls,fetcher};
}
void test('disabled trigger performs no provider calls or database writes',async()=>{
 const {env,raw}=database(),{fetcher,calls}=provider();delete env.MARKET_WORKFLOW_TOKEN;
 assert.equal(await triggerOverdueCollection(env,fetcher,now),'not_configured');assert.equal(calls.length,0);assert.equal(raw.prepare('SELECT count(*) AS n FROM market_cache').get().n,0);raw.close();
});
void test('fresh immutable generation does not dispatch or expose credentials to raw content',async()=>{
 const {env,raw}=database(),{fetcher,calls}=provider({time:now-60000});
 assert.equal(await triggerOverdueCollection(env,fetcher,now),'fresh');assert.equal(calls.length,1);assert.equal(calls[0].options.headers,undefined);
 assert.equal(await triggerOverdueCollection(env,fetcher,now+1),'cooldown');raw.close();
});
void test('late generation dispatches only the fixed main workflow; concurrent cron ticks share one lease',async()=>{
 const {env,raw}=database(),{fetcher,calls}=provider();
 const results=await Promise.all([triggerOverdueCollection(env,fetcher,now),triggerOverdueCollection(env,fetcher,now)]);
 assert.deepEqual(results.sort((a,b)=>a.localeCompare(b)),['cooldown','dispatched']);assert.equal(calls.length,7);
 const post=calls[6];assert.equal(post.url,'https://api.github.com/repos/darcsoulj-lgtm/float-solana/actions/workflows/market-data.yml/dispatches');assert.equal(post.options.body,'{"ref":"main"}');assert.equal(post.options.headers.Authorization,'Bearer '+secret);
 assert.ok(calls.every(c=>c.options.redirect==='manual'));
 assert.equal(await triggerOverdueCollection(env,fetcher,now+11*60000),'cooldown');raw.close();
});
void test('queued or running collection blocks duplicate dispatch and accepted work remains distinct from successful collection',async()=>{
 for(const status of ['queued','in_progress','waiting','pending','requested']){
  const {env,raw}=database(),{fetcher,calls}=provider({runs:[{status}]});assert.equal(await triggerOverdueCollection(env,fetcher,now),'running');assert.equal(calls.length,2+['in_progress','queued','waiting','pending','requested'].indexOf(status));raw.close();
 }
 const {env,raw}=database(),{fetcher}=provider();await triggerOverdueCollection(env,fetcher,now);
 const state=raw.prepare('SELECT payload FROM market_cache').get().payload;assert.match(state,/dispatched/);assert.doesNotMatch(state,/succeeded|fixture-secret/);raw.close();
});
void test('failed or ambiguous dispatch retains cooldown, hides response data and retries after the lease',async()=>{
 const {env,raw}=database(),{fetcher,calls}=provider({dispatch:403});
 await assert.rejects(triggerOverdueCollection(env,fetcher,now),/Collection trigger failed/);
 assert.equal(await triggerOverdueCollection(env,fetcher,now+1),'cooldown');assert.equal(calls.length,7);
 const recovered=provider();assert.equal(await triggerOverdueCollection(env,recovered.fetcher,now+12*60000),'dispatched');raw.close();
});
void test('invalid and future generations stop before workflow execution',async()=>{
 for(const time of [now+60001,0,-1]){
  const {env,raw}=database(),{fetcher,calls}=provider({time});await assert.rejects(triggerOverdueCollection(env,fetcher,now));assert.equal(calls.length,1);raw.close();
 }
 const {env,raw}=database();await assert.rejects(triggerOverdueCollection(env,async()=>new Response('x'.repeat(10001)),now));raw.close();
});

void test('a generation too old to import can still trigger recovery without being relabeled fresh',async()=>{
 const {env,raw}=database(),{fetcher,calls}=provider({time:now-49*3600000});
 assert.equal(await triggerOverdueCollection(env,fetcher,now),'dispatched');assert.equal(calls.length,7);raw.close();
});
void test('malformed active-run responses and redirects prevent dispatch and preserve retry cooldown',async()=>{
 for(const response of [()=>Response.json({workflow_runs:[],total_count:1}),()=>Response.json({workflow_runs:[{status:'completed'}],total_count:1}),()=>new Response(null,{status:302,headers:{Location:'https://example.com'}})]){
  const {env,raw}=database(),base=provider();let posts=0;
  const fetcher=async(url,options)=>{if(options.method==='POST')posts++;return url.includes('/runs?')?response():base.fetcher(url,options);};
  await assert.rejects(triggerOverdueCollection(env,fetcher,now),/Collection trigger failed/);assert.equal(posts,0);assert.equal(await triggerOverdueCollection(env,fetcher,now+1),'cooldown');raw.close();
 }
});
