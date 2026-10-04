import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const a=await bundle(`export * from './lib/backpack-reference';export * from './lib/backpack-charts';export {tokenObservation} from './lib/token-observation';export {calculateHolderTier} from './lib/holder-tier';export {fetchBackpackMarkets} from './lib/market-data';export {readMarketGlobals,marketGlobalKeys} from './lib/market-overview-server';export {TOKENS} from './lib/tokens';export {refreshFastMarketSource,runFastMarketSchedule} from './lib/market-fast-refresh';`);
const token=a.TOKENS.find(t=>t.issuer==='backpack'&&t.symbol==='MU'),now=Date.now();
const chart={market:'MU.US_USDC',points:[[now-48*3600000,100],[now-24*3600000,105]],fetchedAt:now};
const quote=a.referenceFromChart(chart);
const source=(data,time=now)=>({data,fetchedAt:time,stale:false,error:null});
function database(){
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER);');
 const db={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return raw.prepare(sql).get(...this.args)??null;},async all(){return {results:raw.prepare(sql).all(...this.args)};},async run(){return raw.prepare(sql).run(...this.args);},sql};},async batch(statements){raw.exec('BEGIN');try{const out=statements.map(s=>({results:raw.prepare(s.sql).all(...s.args)}));raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}}};return {raw,db};
}
void test('HTTP 200 empty external tickers cannot become a successful price refresh, even with valid venue rows',async()=>{
 const fetcher=async url=>Response.json(String(url).includes('External')?[]:[{symbol:'MU.US_USDC',lastPrice:'900',priceChangePercent:'0.01'}]);
 await assert.rejects(()=>a.fetchBackpackMarkets(fetcher,[token]),/external references unavailable/);
 await assert.rejects(()=>a.fetchBackpackMarkets(fetcher,[token],{requireExternal:true}),/external references unavailable/);
 const {raw,db}=database(),key=(await a.marketGlobalKeys([token])).backpack;
 raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(key,JSON.stringify({MU:quote}),now-120000);
 const previous=raw.prepare('SELECT * FROM market_cache WHERE key=?').get(key);
 await assert.rejects(()=>a.refreshFastMarketSource({DB:db},{kind:'references'},fetcher));
 assert.deepEqual(raw.prepare('SELECT * FROM market_cache WHERE key=?').get(key),previous);
 // Test the legacy scheduled loader, not just the private fast executor.
 const fetch=globalThis.fetch;globalThis.fetch=fetcher;
 try {await a.readMarketGlobals({DB:db},[token],false);} finally {globalThis.fetch=fetch;}
 assert.equal(raw.prepare('SELECT fetched_at FROM market_cache WHERE key=?').get(key).fetched_at,previous.fetched_at);
 assert.deepEqual(JSON.parse(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get(key).payload),{MU:quote});raw.close();
});
void test('history compares actual completed hours and cannot fill an absent 24-hour baseline with an adjacent price',()=>{
 assert.ok(Math.abs(quote.externalChange24h-5)<1e-9);assert.equal(quote.externalObservedAt,now-24*3600000);
 assert.equal(a.referenceFromChart({...chart,points:[[now-48*3600000-1,100],[now-24*3600000,105]]}).externalChange24h,null);
});
void test('dated recovery survives a fresh null snapshot and remains display-only with original age and paired percentage',()=>{
 const saved=new Map([[a.backpackHistoryKey(token.mint),{payload:JSON.stringify(quote),fetched_at:now,retry_after:0}]]);
 const backpack=a.overlayBackpackHistory(source({MU:{...quote,externalPrice:null,externalChange24h:null,externalObservedAt:undefined,externalBasis:undefined}}),[token],saved,now);
 const data={tokens:[token],scope:'backpack',markets:source({}),prices:source({}),pools:source({}),catalog:source([]),supplies:source({MU:{supply:10,valuationSafe:true}}),backpack};
 const row=a.tokenObservation(data,'MU',now);assert.equal(row.price,null);assert.equal(row.lastPrice,105);assert.ok(Math.abs(row.change24h-5)<1e-9);
 assert.equal(row.changeTime,quote.externalObservedAt);assert.equal(row.lastPriceTime,quote.externalObservedAt);assert.equal(row.changeDelayed,true);
 assert.equal(row.issuedValue,null);assert.equal(row.lastIssuedValue,1050);assert.equal(row.lastIssuedValueHistoricalReference,true);assert.equal(row.historicalReference,true);
 const expired=a.overlayBackpackHistory(source({}),[token],saved,now+97*3600000);assert.deepEqual(expired.data,{});
 const future=a.overlayBackpackHistory(source({}),[token],new Map([[a.backpackHistoryKey(token.mint),{payload:JSON.stringify({...quote,externalObservedAt:now+1}),fetched_at:now}]]),now);assert.deepEqual(future.data,{});
 const fresh=a.overlayBackpackHistory(source({MU:{...quote,externalPrice:110,externalBasis:undefined,externalObservedAt:now}}),[token],saved,now);assert.equal(fresh.data.MU.externalPrice,110);
});
void test('partial ticker refresh never renews or erases an omitted symbol',()=>{
 const previous=source({MU:quote,SKHY:{...quote,externalObservedAt:undefined}},now-360000);
 const rows=a.retainBackpackReferences({MU:{...quote,externalPrice:111},SKHY:{...quote,externalPrice:null}},previous,now);
 assert.equal(rows.MU.externalObservedAt,now);assert.equal(rows.SKHY.externalObservedAt,now-360000);assert.equal(rows.SKHY.externalPrice,105);
});
void test('history recovery is bounded, includes newly registered tokens, and runs when RPC jobs fail',async()=>{
 const {raw,db}=database(),jobs=[];
 await a.runFastMarketSchedule({DB:db,MARKET_REFRESH:{async fast(job){jobs.push(job);if(job.kind==='supplies')throw Error('RPC down');}}},now).catch(()=>{});
 assert.equal(jobs.filter(j=>j.kind==='reference-history').length,4);assert.equal(jobs.filter(j=>j.kind==='references').length,1);raw.close();
});

void test('failed history mints do not starve unvisited stocks in the rotating schedule',async()=>{
 const {raw,db}=database(),jobs=[];
 const env={DB:db,MARKET_REFRESH:{async fast(job){if(job.kind!=='reference-history')return; jobs.push(job.mint);raw.prepare('INSERT OR REPLACE INTO market_cache VALUES (?,NULL,?,0)').run('market-fast:v1:reference-history:'+job.mint,now);throw Error('empty history');}}};
 await a.runFastMarketSchedule(env,now);await a.runFastMarketSchedule(env,now);
 assert.equal(new Set(jobs).size,8);raw.close();
});

void test('a historical stock price cannot suppress a newer valid display-only valuation pair',()=>{
 const saved=new Map([[a.backpackHistoryKey(token.mint),{payload:JSON.stringify(quote),fetched_at:now,retry_after:0}]]);
 const backpack=a.overlayBackpackHistory(source({}),[token],saved,now),observedAt=now-6*60000;
 const data={tokens:[token],scope:'backpack',markets:source({}),prices:source({MU:{price:100,confidence:1,timestamp:observedAt}},observedAt),pools:source({}),catalog:source([]),supplies:source({MU:{supply:10,valuationSafe:true}},observedAt),backpack};
 const row=a.tokenObservation(data,'MU',now);assert.equal(row.lastPrice,105);assert.equal(row.issuedValue,null);assert.equal(row.lastIssuedValue,1000);assert.equal(row.lastIssuedValueTime,observedAt);
});

void test('per-symbol observation age is enforced even for a fresh global cache read without an asOf map',()=>{
 const old={...quote,externalBasis:undefined,externalObservedAt:now-10*60000};
 const data={tokens:[token],scope:'backpack',markets:source({}),prices:source({}),pools:source({}),catalog:source([]),supplies:source({MU:{supply:10,valuationSafe:true}}),backpack:source({MU:old})};
 const row=a.tokenObservation(data,'MU',now);assert.equal(row.price,null);assert.equal(row.issuedValue,null);assert.equal(row.lastPriceTime,old.externalObservedAt);
});

void test('holder tier expiry uses the original reference timestamp after a partial global refresh',()=>{
 const old={...quote,externalBasis:undefined,externalObservedAt:now-4*60000};
 const data={tokens:[token],scope:'backpack',markets:source({}),prices:source({}),pools:source({}),catalog:source([]),supplies:source({MU:{supply:10,valuationSafe:true}}),backpack:source({MU:old})};
 const result=a.calculateHolderTier([{symbol:'MU',raw_amount:'1000000',decimals:6,verified_at:now}],data,now);
 assert.equal(result.tier,'bronze');assert.equal(result.expiresAt,now+60000);
});
