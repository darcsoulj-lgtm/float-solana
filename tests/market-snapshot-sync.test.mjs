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
 const env={DB:db,MARKET_REFRESH:{async run(job){calls.push(job);if(bad&&job.hash===manifest.chunks[0])throw Error('timeout');}}};const fetcher=async()=>Response.json(manifest);
 await assert.rejects(api.syncMarketSchedule(env,fetcher),/1 market snapshot chunks failed/);assert.equal(calls.length,2);assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('market-snapshot-sync:v1'),undefined);
 bad=false;await api.syncMarketSchedule(env,fetcher);assert.equal(calls.length,4);await api.syncMarketSchedule(env,fetcher);assert.equal(calls.length,4);
 assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('market-snapshot-sync:v1').payload,commit);raw.close();
});
