import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const a=await bundle(`export * from './lib/token-observation';export {retainRefreshingSources} from './lib/market-refresh';export * from './lib/market-fast-refresh';export {executeMarketWork} from './lib/market-work-executor';export {TOKENS,TOKEN_PROGRAMS} from './lib/tokens';export {supplyObservationKey} from './lib/market-source-observations';export {marketGlobalKeys} from './lib/market-overview-server';`);
const now=Date.now(),tokens=a.TOKENS.filter(t=>t.issuer==='backpack');
const source=(data,time)=>({data,fetchedAt:time,stale:false,error:null});
const fixture=(age=6*60000,supplyAge=age)=>({markets:source({},now),pools:source({},now),prices:source({},now),catalog:source([],now),scope:'backpack',tokens:[tokens.find(t=>t.symbol==='MU')],backpack:source({MU:{externalPrice:100,externalChange24h:3}},now-age),supplies:source({MU:{supply:10,valuationSafe:true}},now-supplyAge)});
void test('a six-minute collection delay preserves a dated estimate without manufacturing a current quote',()=>{
 const data=fixture(),row=a.tokenObservation(data,'MU',now);
 assert.equal(row.price,null);assert.equal(row.lastPrice,100);assert.equal(row.issuedValue,null);
 assert.equal(row.lastIssuedValue,1000);assert.equal(row.lastIssuedValueTime,now-360000);
 assert.equal(a.issuedCoverage(data,now,'backpack').total,null);
 const total=a.trackedValuation(data,now,'backpack');assert.equal(total.total,1000);assert.equal(total.delayed,true);
 assert.equal(a.tokenValuation(row,'backpack').value,total.total);
});
void test('fresh prices accept a fifteen-minute supply cadence, but not supplies older than twenty minutes',()=>{
 assert.equal(a.tokenObservation(fixture(60000,16*60000),'MU',now).issuedValue,1000);
 assert.equal(a.tokenObservation(fixture(60000,21*60000),'MU',now).issuedValue,null);
});
void test('expired, mismatched, unsafe or conflicting saved observations never become displayed valuations',()=>{
 for(const data of [fixture(25*3600000),fixture(6*60000,25*60000)])assert.equal(a.tokenObservation(data,'MU',now).lastIssuedValue,null);
 for(const supply of [{valuationSafe:false},{valuationSafe:undefined},{supply:Infinity},{adjustmentAt:now-60000}]){
  const data=fixture();Object.assign(data.supplies.data.MU,supply);assert.equal(a.tokenObservation(data,'MU',now).lastIssuedValue,null);
 }
 const data=fixture();data.prices=source({MU:{price:200,confidence:1,timestamp:now-360000}},now-360000);assert.equal(a.tokenObservation(data,'MU',now).lastIssuedValue,null);
});
function database(){
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER);');
 const db={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return raw.prepare(sql).get(...this.args)??null;},async all(){return {results:raw.prepare(sql).all(...this.args)};},async run(){return raw.prepare(sql).run(...this.args);},sql};},async batch(statements){raw.exec('BEGIN');try{const out=statements.map(s=>({results:raw.prepare(s.sql).all(...s.args)}));raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}}};return {raw,db};
}
const supplyReply=n=>Response.json({result:{context:{slot:1},value:Array.from({length:n},()=>({owner:a.TOKEN_PROGRAMS[0],executable:false,data:{parsed:{type:'mint',info:{isInitialized:true,decimals:6,supply:'10000000'}}}}))}});
void test('the real executor accepts the planner ten-mint batch and rejects larger or incomplete batches',async()=>{
 const {raw,db}=database(),env={DB:db,SOLANA_RPC_URL:'https://rpc.invalid'},job={kind:'supplies',mints:tokens.slice(0,10).map(t=>t.mint)};
 const result=await a.executeMarketWork(env,job,async()=>supplyReply(10));assert.equal(result.writes.length,10);
 await assert.rejects(()=>a.executeMarketWork(env,{...job,mints:tokens.slice(0,11).map(t=>t.mint)},async()=>supplyReply(11)));
 await assert.rejects(()=>a.executeMarketWork(env,job,async()=>supplyReply(9)));raw.close();
});
void test('fast refresh writes canonical data without durable tables, coalesces repeats, and preserves observations on outage',async()=>{
 const {raw,db}=database(),env={DB:db,SOLANA_RPC_URL:'https://rpc.invalid'},job={kind:'supplies',mints:tokens.slice(0,10).map(t=>t.mint)};let calls=0;
 const fetcher=async()=>{calls++;return supplyReply(10);};
 await a.refreshFastMarketSource(env,job,fetcher);await a.refreshFastMarketSource(env,job,fetcher);assert.equal(calls,1);
 const key=a.supplyObservationKey(tokens[0]),before=raw.prepare('SELECT * FROM market_cache WHERE key=?').get(key);
 assert.equal(JSON.parse(before.payload).supply,10);
 raw.exec("UPDATE market_cache SET retry_after=0 WHERE key LIKE 'market-fast:%'");
 await assert.rejects(()=>a.refreshFastMarketSource(env,job,async()=>new Response('',{status:503})));
 assert.deepEqual(raw.prepare('SELECT * FROM market_cache WHERE key=?').get(key),before);raw.close();
});
void test('missed schedule slots recover due supplies promptly and do not block prices when RPC fails',async()=>{
 const {raw,db}=database(),jobs=[];
 const env={DB:db,MARKET_REFRESH:{async fast(job){jobs.push(job);if(job.kind==='supplies'){
  raw.prepare('INSERT OR REPLACE INTO market_cache VALUES (?,NULL,?,?)').run('market-fast:v1:supplies:'+job.mints.join(','),now,now+900000);
  throw Error('RPC outage');
 }}}};
 for(let tick=0;tick<4;tick++)await a.runFastMarketSchedule(env,now+tick*60000).catch(()=>{});
 assert.equal(jobs.filter(j=>j.kind==='references').length,4);
 assert.deepEqual(jobs.filter(j=>j.kind==='supplies').flatMap(j=>j.mints).sort((x,y)=>x.localeCompare(y)),tokens.map(t=>t.mint).sort((x,y)=>x.localeCompare(y)));
 await a.runFastMarketSchedule(env,now+5*60000);assert.equal(jobs.filter(j=>j.kind==='references').length,5);raw.close();
});

void test('short refresh outages retain paired dated Backpack changes, with a bounded expiry',()=>{
 for(const age of [360000, 14*60000]){
  const data=fixture(age);data.backpack.stale=true;
  const row=a.tokenObservation(data,'MU',now);
  assert.equal(row.price,null);assert.equal(row.lastPrice,100);
  assert.equal(row.change24h,3);assert.equal(row.changeDelayed,true);assert.equal(row.changeTime,now-age);
 }
 for(const age of [16*60000,25*3600000]) assert.equal(a.tokenObservation(fixture(age),'MU',now).change24h,null);
 for(const value of [null,undefined,NaN,Infinity]){
  const data=fixture();data.backpack.data.MU.externalChange24h=value;
  assert.equal(a.tokenObservation(data,'MU',now).change24h,null);
 }
 const data=fixture();data.backpack.data.MU.externalChange24h=0;
 assert.equal(a.tokenObservation(data,'MU',now).change24h,0);
});

void test('missing-source refresh and recovery preserve the observation timestamp and reset delayed state',()=>{
 const previous=fixture(60000),next=fixture(60000);next.backpack=source(null,now);
 a.retainRefreshingSources(next,previous);
 const retained=a.tokenObservation(next,'MU',now);
 assert.equal(retained.change24h,3);assert.equal(retained.changeDelayed,true);assert.equal(retained.changeTime,now-60000);
 const recovered=fixture(0);recovered.backpack.data.MU.externalChange24h=-2;
 const row=a.tokenObservation(recovered,'MU',now);assert.equal(row.change24h,-2);assert.equal(row.changeDelayed,false);
});
