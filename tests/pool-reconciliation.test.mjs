import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const api=await bundle(`export * from './lib/pool-reconciliation';export * from './lib/pool-inventory';export {TOKENS} from './lib/tokens';export {poolMetrics} from './lib/stock-pools';export {publicMarketPayload} from './lib/public-market-payload';`);
const token=api.TOKENS.find(t=>t.issuer==='backpack'&&t.symbol==='DRAM'),now=200000000;
const pool=(address='A'.repeat(32),extra={})=>({address,baseMint:token.mint,quoteMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',dex:'zerofi',quote:'USDC',price:60,change24h:1,liquidity:1000,volume24h:500000,url:'',source:'geckoterminal',observedAt:now-120000,...extra});
function database(){const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)');
return {raw,db:{prepare(sql){return {bind(...args){return {first:async()=>raw.prepare(sql).get(...args)??null,run:async()=>raw.prepare(sql).run(...args)};}};}}};}
void test('a missing backup preserves a timestamped valid value and becomes delayed, without replacing current confirmed zeros or disputes',()=>{
 const old=pool(),missing=pool(old.address,{unavailable:true,volume24h:null,observedAt:undefined});
 const retained=api.retainPoolValues([missing],[old],token,now)[0];
 assert.equal(retained.volume24h,500000);assert.equal(retained.observedAt,old.observedAt);assert.equal(retained.delayed,true);assert.equal(api.poolMetrics([retained]).partial,true);
 const zero=pool(old.address,{volume24h:0,observedAt:now});assert.equal(api.retainPoolValues([zero],[old],token,now)[0].volume24h,0);
 const dispute={...missing,volumeDisputed:true};assert.equal(api.retainPoolValues([dispute],[old],token,now)[0].volume24h,null);
});
void test('retention rejects expired, future, invalid and other-mint evidence and chooses time rather than greatest amount',()=>{
 const missing=pool('A'.repeat(32),{unavailable:true,volume24h:null});
 for(const extra of [{observedAt:now+1},{observedAt:now-api.POOL_RETAIN_MS-1},{volume24h:NaN},{volume24h:-1},{baseMint:'other',quoteMint:'other'},{volumeDisputed:true}])
  assert.equal(api.retainPoolValues([missing],[pool(missing.address,extra)],token,now)[0].volume24h,null);
 const result=api.retainPoolValues([missing],[pool(missing.address,{volume24h:900000,observedAt:now-200000}),pool(missing.address,{volume24h:100,observedAt:now-100000})],token,now);
 assert.equal(result[0].volume24h,100);
});
void test('source evidence survives omission and old writes cannot replace a newer value; new empty pools do not grow the retry set',async()=>{
 const {raw,db}=database();const old=pool();
 await api.recordPoolEvidence(db,token,'geckoterminal',[old],now);
 await api.recordPoolEvidence(db,token,'geckoterminal',[],now+1000);
 await api.recordPoolEvidence(db,token,'geckoterminal',[{...old,observedAt:now-200000,volume24h:900000},pool('B'.repeat(32),{volume24h:0,liquidity:0})],now+2000);
 const saved=await api.readPoolEvidence(db,token);assert.equal(saved.length,1);assert.equal(saved[0].volume24h,500000);assert.equal(saved[0].observedAt,old.observedAt);
 await api.recordPoolEvidence(db,token,'geckoterminal',[],now+api.POOL_RETAIN_MS+1);assert.deepEqual(await api.readPoolEvidence(db,token),[]);raw.close();
});
void test('independent reconciliation detects omitted identities, missing amounts and duplicates; no volume-total comparison or largest-provider selection',()=>{
 const a=pool(),b=pool('B'.repeat(32));
 const omitted=api.reconcilePoolCoverage(token,[a],[a,b],now);assert.deepEqual(omitted.missing,[b.address]);assert.equal(omitted.status,'delayed');
 const healthy=api.reconcilePoolCoverage(token,[a,b],[{...a,volume24h:9000000},b],now);assert.equal(healthy.status,'healthy');assert.deepEqual(healthy.missing,[]);
 assert.deepEqual(api.reconcilePoolCoverage(token,[a,a],[a],now).duplicates,[a.address]);
 assert.equal(api.reconcilePoolCoverage(token,[],[],now).status,'pending');
 assert.equal(api.reconcilePoolCoverage(token,[{...a,unavailable:true,volume24h:null}],[a],now).status,'unavailable');
});
void test('retained and old pool observations stay visible to reconciliation and expire safely',()=>{
 const old=pool('A'.repeat(32),{delayed:true,observedAt:now-api.POOL_HEALTH_MS-1});
 const health=api.reconcilePoolCoverage(token,[old],[old],now);assert.equal(health.status,'delayed');assert.deepEqual(health.retained,[old.address]);assert.deepEqual(health.stale,[old.address]);assert.ok(health.repairPriority>0);
});
void test('repair discovery has a cooldown and cannot consume the fair new-listing budget',()=>{
 const health=Array.from({length:12},(_,i)=>({...api.reconcilePoolCoverage(token,[],[],now),mint:'repair'+i,repairPriority:12-i}));
 const fair=Array.from({length:12},(_,i)=>'new'+i);
 const queued=api.recoveryDiscoveryQueue(fair,health,new Map([['repair0',now-1]]),now,8);
 assert.equal(queued.length,8);assert.deepEqual(queued.slice(0,4),['repair1','repair2','repair3','repair4']);assert.deepEqual(queued.slice(4),fair.slice(0,4));
});
void test('new canonical collection writes remain monotonic while displayed timestamps retain the oldest actual included pool observation',async()=>{
 const {raw,db}=database();const pools=[pool(),pool('B'.repeat(32),{observedAt:now,volume24h:100})];
 await api.saveTokenPoolObservation(db,token,pools,now);
 const row=raw.prepare('SELECT * FROM market_cache WHERE key=?').get(api.poolObservationKey(token));assert.equal(row.fetched_at,now);
 const result=api.overlayTokenPools({kind:'pool-observations-v1',data:{},asOf:{}},[token],new Map([[row.key,row]]),now);
 assert.equal(result.asOf[token.symbol],now-120000);assert.equal(api.poolMetrics(result.data[token.symbol]).volume24h,500100);
 await api.saveTokenPoolObservation(db,token,[],now-1);assert.equal(JSON.parse(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get(row.key).payload).length,2);raw.close();
});
