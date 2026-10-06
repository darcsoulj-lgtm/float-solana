import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const api=await bundle(`export * from './lib/market-snapshot-sync';`);
function database(){const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)');
const db={prepare(sql){return{bind(...args){return{first:async()=>raw.prepare(sql).get(...args)??null,run:async()=>raw.prepare(sql).run(...args)};}};},batch:async statements=>Promise.all(statements.map(s=>s.run()))};return{raw,db};}
const now=Date.now(),commit='a'.repeat(40),key='pool-token-stonkfun-v2:'+'A'.repeat(32);
const row=(time=now)=>({key,payload:JSON.stringify([{address:'B'.repeat(32),volume24h:123}]),fetched_at:time});
const manifestFetch=(get)=>async url=>Response.json(String(url).startsWith('https://api.github.com/')?{object:{type:'commit',sha:'f'.repeat(40)}}:get());
void test('the importer resolves the current API head and never selects the stale mutable raw branch',async()=>{
 const calls=[],head='c'.repeat(40),manifest={version:1,generatedAt:now,commit,chunks:['b'.repeat(64)]};
 const fetcher=async(url,options)=>{calls.push({url:String(url),options});return Response.json(String(url).startsWith('https://api.github.com/')?{object:{type:'commit',sha:head}}:manifest);};
 assert.deepEqual(await api.currentMarketManifest(fetcher,'test-token',now),manifest);
 assert.equal(calls.length,2);
 assert.equal(calls[0].options.headers.Authorization,'Bearer test-token');
 assert.equal(calls[1].url,`https://raw.githubusercontent.com/darcsoulj-lgtm/float-solana/${head}/manifest.json`);
 assert.equal(calls[1].options.headers,undefined);
 assert.ok(calls.every(c=>!c.url.includes('/market-data/manifest.json')));
 for(const object of [{type:'tag',sha:head},{type:'commit',sha:'../main'},{}])await assert.rejects(api.currentMarketManifest(async()=>Response.json({object}),undefined,now),/Invalid market snapshot head/);
 await assert.rejects(api.currentMarketManifest(async()=>new Response('failure',{status:503}),undefined,now),/HTTP 503/);
});
void test('market manifests validate generation time, immutable commit references, unique hashes and bounded chunks',()=>{
 const good={version:1,generatedAt:now,commit,chunks:['b'.repeat(64)]};assert.deepEqual(api.parseMarketManifest(good,now),good);
 for(const bad of [{...good,generatedAt:now+60001},{...good,generatedAt:now-49*3600000},{...good,commit:'../main'},{...good,chunks:[]},{...good,chunks:['b'.repeat(64),'b'.repeat(64)]},{...good,chunks:Array(101).fill('x')}])assert.throws(()=>api.parseMarketManifest(bad,now));
});
void test('snapshot ingestion accepts only valid public market keys and JSON, rejects private fields and future observations',()=>{
 assert.equal(api.parseMarketRows(JSON.stringify([row()]),now)[0].fetched_at,now);
 for(const bad of [{...row(),key:'community-session:member'},{...row(),fetched_at:now+60001},{...row(),payload:'invalid'},{...row(),payload:JSON.stringify({session:'secret'})},{...row(),payload:JSON.stringify({nested:{walletHash:'secret'}})},{...row(),payload:JSON.stringify({privateKey:'secret'})}])assert.throws(()=>api.parseMarketRows(JSON.stringify([bad]),now));
 assert.throws(()=>api.parseMarketRows(JSON.stringify(Array(11).fill(row())),now));
});
void test('a chunk verifies the pinned digest and cannot overwrite a newer observation',async()=>{
 const {raw,db}=database();const text=JSON.stringify([row()]);const hash=createHash('sha256').update(text).digest('hex');let url;
 await api.syncMarketChunk({DB:db},{kind:'snapshot',commit,hash},async input=>{url=String(input);return new Response(text);});
 assert.equal(url,`https://raw.githubusercontent.com/darcsoulj-lgtm/float-solana/${commit}/chunks/${hash}.json`);
 assert.equal(raw.prepare('SELECT fetched_at FROM market_cache WHERE key=?').get(key).fetched_at,now);
 const older=JSON.stringify([row(now-5000)]),oldHash=createHash('sha256').update(older).digest('hex');
 await api.syncMarketChunk({DB:db},{kind:'snapshot',commit,hash:oldHash},async()=>new Response(older));assert.equal(raw.prepare('SELECT fetched_at FROM market_cache WHERE key=?').get(key).fetched_at,now);
 await assert.rejects(api.syncMarketChunk({DB:db},{kind:'snapshot',commit,hash},async()=>new Response('[]')),/digest/);
 await assert.rejects(api.syncMarketChunk({DB:db},{kind:'snapshot',commit,hash},async()=>new Response('x'.repeat(100001))),/Oversized/);
 raw.close();
});
void test('partial generation sync preserves successful chunks and retries failures before marking a generation complete',async()=>{
 const {raw,db}=database();const manifest={version:1,generatedAt:now,commit,chunks:['b'.repeat(64),'c'.repeat(64)]};let bad=true;const calls=[];
 const env={DB:db,MARKET_REFRESH:{async run(job){calls.push(job);if(bad&&job.hash===manifest.chunks[0])throw Error('timeout');}}};const fetcher=manifestFetch(()=>manifest);
 await assert.rejects(api.syncMarketSchedule(env,fetcher),/1 market snapshot chunks failed/);assert.equal(calls.length,2);assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('market-snapshot-sync:v1'),undefined);
 bad=false;await api.syncMarketSchedule(env,fetcher);assert.equal(calls.length,3);await api.syncMarketSchedule(env,fetcher);assert.equal(calls.length,3);
 assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('market-snapshot-sync:v1').payload,commit);raw.close();
});

void test('48-chunk generations resume under the free request budget and mark completion only after every chunk',async()=>{
 const {raw,db}=database(),chunks=Array.from({length:48},(_,i)=>(i+1).toString(16).padStart(64,'0'));
 const manifest={version:1,generatedAt:now,commit,chunks};const calls=[];
 let budget=0;
 const fetcher=async url=>{budget++;return manifestFetch(()=>manifest)(url);};
 const env={DB:db,MARKET_REFRESH:{async run(job){if(++budget>50)throw Error('Too many subrequests');calls.push(job.hash);}}};
 for(let tick=0;tick<5;tick++){
   budget=30;const before=calls.length;await api.syncMarketSchedule(env,fetcher);
   assert.ok(calls.length-before<=10);assert.ok(budget<=42);
   const synced=raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('market-snapshot-sync:v1');
   if(tick<4)assert.equal(synced,undefined);else assert.equal(synced.payload,commit);
 }
 assert.deepEqual(calls,chunks);await api.syncMarketSchedule(env,fetcher);assert.equal(calls.length,48);raw.close();
});
void test('overlapping cron invocations share a fenced import lease',async()=>{
 const {raw,db}=database(),manifest={version:1,generatedAt:now,commit,chunks:['b'.repeat(64)]};let release,entered;
 const enteredPromise=new Promise(r=>{entered=r;});const gate=new Promise(r=>{release=r;});let calls=0;
 const env={DB:db,MARKET_REFRESH:{async run(){calls++;entered();await gate;}}},fetcher=manifestFetch(()=>manifest);
 const first=api.syncMarketSchedule(env,fetcher);await enteredPromise;await api.syncMarketSchedule(env,fetcher);
 assert.equal(calls,1);release();await first;
 assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('market-snapshot-sync:v1').payload,commit);raw.close();
});
void test('a newer generation restarts progress without carrying hashes from the older generation',async()=>{
 const {raw,db}=database();let manifest={version:1,generatedAt:now-1000,commit,chunks:Array.from({length:12},(_,i)=>(i+1).toString(16).padStart(64,'0'))};const calls=[];
 const env={DB:db,MARKET_REFRESH:{async run(job){calls.push(job);}}},fetcher=manifestFetch(()=>manifest);
 await api.syncMarketSchedule(env,fetcher);manifest={...manifest,generatedAt:now,commit:'d'.repeat(40),chunks:['e'.repeat(64)]};await api.syncMarketSchedule(env,fetcher);
 assert.equal(calls.at(-1).commit,manifest.commit);assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('market-snapshot-sync:v1').payload,manifest.commit);
 const older={...manifest,generatedAt:now-2000,commit:'f'.repeat(40)};await api.syncMarketSchedule(env,manifestFetch(()=>older));assert.equal(calls.length,11);raw.close();
});
