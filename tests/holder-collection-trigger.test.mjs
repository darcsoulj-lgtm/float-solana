import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const {triggerHolderCollection,holderCollectionNeeded,holderRegistry,TOKENS,refreshHoldingWallets}=await bundle(`export * from './lib/holder-collection-trigger';export * from './lib/issuer-holder-registry';export * from './lib/issuer-holders-server';export {TOKENS} from './lib/tokens';`);
const now=Date.UTC(2026,9,3,4),secret='fixture-secret';
const scopes=await holderRegistry(TOKENS);
function setup(age=60000){
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)');
 const snapshot={version:1,chain:'solana',method:'positive-owner-union-v1',issuers:scopes.map(s=>({issuer:s.issuer,wallets:123,tokens:s.mints.length,registryHash:s.registryHash,startedAt:now-age-1000,checkedAt:now-age}))};
 raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run('backpack-verified-listings-v1','[]',now);
 raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run('issuer-holding-wallets:v1',JSON.stringify(snapshot),now-age);
 const DB={prepare(sql){return{bind(...args){return{first:async()=>raw.prepare(sql).get(...args)??null,run:async()=>raw.prepare(sql).run(...args)};}};}};
 return {raw,snapshot,env:{DB,MARKET_WORKFLOW_TOKEN:secret}};
}
function provider(running=false){const calls=[];return {calls,fetcher:async(url,options)=>{calls.push({url,options});assert.ok(url.startsWith('https://api.github.com/repos/darcsoulj-lgtm/float-solana/actions/workflows/issuer-holders.yml/'));if(url.includes('/runs?')){const state=new URL(url).searchParams.get('status');const rows=running&&state==='queued'?[{status:state}]:[];return Response.json({total_count:rows.length,workflow_runs:rows});}return new Response(null,{status:204});}};}
void test('holder recovery is disabled without credentials and fresh complete coverage does no network work',async()=>{
 const {env,raw}=setup(),p=provider();assert.equal(await triggerHolderCollection(env,p.fetcher,now),'fresh');assert.equal(p.calls.length,0);
 delete env.MARKET_WORKFLOW_TOKEN;assert.equal(await triggerHolderCollection(env,p.fetcher,now),'not_configured');raw.close();
});
void test('new verified listings trigger a full census even when the previous count is only a minute old',async()=>{
 const {env,raw}=setup(),p=provider();const addition={symbol:'NEW',mint:'11111111111111111111111111111111',name:'New',shortName:'New',underlyingSymbol:'NEW',issuer:'backpack',source:'https://api.backpack.exchange/api/v1/assets'};
 raw.prepare('UPDATE market_cache SET payload=? WHERE key=?').run(JSON.stringify([addition]),'backpack-verified-listings-v1');
 const results=await Promise.all([triggerHolderCollection(env,p.fetcher,now),triggerHolderCollection(env,p.fetcher,now)]);
 assert.deepEqual(results.sort((a,b)=>a.localeCompare(b)),['cooldown','dispatched']);assert.equal(p.calls.filter(c=>c.options.method==='POST').length,1);
 assert.equal(p.calls.at(-1).options.body,'{"ref":"main"}');assert.ok(p.calls.every(c=>c.options.redirect==='manual'));
 assert.doesNotMatch(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('holder-collection-trigger:v1').payload,/fixture-secret|succeeded/);raw.close();
});
void test('daily staleness triggers collection; an active holder job blocks duplicates',async()=>{
 for(const running of [false,true]){const {env,raw}=setup(86400000),p=provider(running);assert.equal(await triggerHolderCollection(env,p.fetcher,now),running?'running':'dispatched');raw.close();}
});
void test('scope identity changes cannot hide behind an unchanged token count; future observations are invalid',()=>{
 const scope=scopes[0],row={registryHash:scope.registryHash,tokens:scope.mints.length,checkedAt:now};
 assert.equal(holderCollectionNeeded(row,scope,now),false);assert.equal(holderCollectionNeeded({...row,registryHash:'a'.repeat(64)},scope,now),true);
 assert.throws(()=>holderCollectionNeeded({...row,checkedAt:now+60001},scope,now),/Future/);
});
void test('failed dispatch is bounded and cannot mark the old census fresh or leak provider errors',async()=>{
 const {env,raw,snapshot}=setup(86400000);let calls=0;const fail=async()=>{calls++;return new Response('private fixture data',{status:503});};
 await assert.rejects(triggerHolderCollection(env,fail,now),/Collection trigger failed/);assert.equal(await triggerHolderCollection(env,fail,now+1),'cooldown');assert.equal(calls,1);
 assert.deepEqual(JSON.parse(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('issuer-holding-wallets:v1').payload),snapshot);raw.close();
});
void test('holder import preserves a prior census for the wrong scope, then imports the matching complete count within the bounded cadence',async()=>{
 const {env,raw,snapshot}=setup(86400000);const fresh=structuredClone(snapshot);fresh.issuers[0]={...fresh.issuers[0],wallets:456,startedAt:now-1000,checkedAt:now};
 const bad=structuredClone(fresh);bad.issuers[0].registryHash='a'.repeat(64);
 await refreshHoldingWallets(env,async()=>Response.json(bad),now);
 assert.equal(JSON.parse(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('issuer-holding-wallets:v1').payload).issuers[0].wallets,123);
 let url;await refreshHoldingWallets(env,async(u)=>{url=u;return Response.json(fresh);},now+300000);
 const saved=JSON.parse(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('issuer-holding-wallets:v1').payload).issuers[0];
 assert.equal(saved.wallets,456);assert.equal(saved.checkedAt,now);assert.match(url,/\?check=/);raw.close();
});
void test('holder import migrates an obsolete hourly lease without duplicating an active five-minute import',async()=>{
 const {env,raw,snapshot}=setup(86400000);const fresh=structuredClone(snapshot);fresh.issuers[0]={...fresh.issuers[0],wallets:456,startedAt:now-1000,checkedAt:now};
 raw.prepare('UPDATE market_cache SET retry_after=? WHERE key=?').run(now+3600000,'issuer-holding-wallets:v1');
 let calls=0;const fetcher=async()=>{calls++;return Response.json(fresh);};
 await refreshHoldingWallets(env,fetcher,now);
 assert.equal(JSON.parse(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('issuer-holding-wallets:v1').payload).issuers[0].wallets,456);
 await refreshHoldingWallets(env,fetcher,now+1);assert.equal(calls,1);raw.close();
});
