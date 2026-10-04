import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const api=await bundle(`export * from './lib/market-work-store';export * from './lib/market-work-executor';export * from './lib/market-work-health';export * from './lib/market-source-observations';export * from './lib/pool-work-plan';export {TOKENS} from './lib/tokens';export {poolObservationKey} from './lib/pool-inventory';`);
const migration=await readFile('drizzle/0021_market_work.sql','utf8');
function database(){
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER);'+migration);
 const db={prepare(sql){const stmt={args:[],bind(...args){this.args=args;return this;},async first(){return raw.prepare(sql).get(...this.args)??null;},async all(){return {results:raw.prepare(sql).all(...this.args)};},async run(){return raw.prepare(sql).run(...this.args);},_sql:sql};return stmt;},async batch(statements){raw.exec('BEGIN');try{const r=statements.map(s=>({results:raw.prepare(s._sql).all(...s.args)}));raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};
 return {raw,db};
}
const def=(id,lane='refresh',job={kind:'pool-source',mint:'mint',provider:'orca',discovery:false})=>({id,lane,job,interval:60000});
const seed=(raw,key,value,time=Date.now())=>raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(key,JSON.stringify(value),time);

void test('leases survive process restart; expired workers cannot publish, wake or acknowledge another owner',async()=>{
 const {raw,db}=database(),now=Date.now();await api.seedMarketWork(db,'scope',[def('a')],now);
 const old=await api.claimMarketWork(db,'refresh',now);assert.ok(old);
 assert.equal(await api.claimMarketWork(db,'refresh',now+1000),null);
 const next=await api.claimMarketWork(db,'refresh',now+45001);assert.ok(next);assert.notEqual(old.lease_token,next.lease_token);
 const stale=await api.completeMarketWork(db,old,[{key:'value',payload:'123',fetchedAt:now}],now+45002);
 assert.equal(stale,false);assert.equal(raw.prepare('SELECT * FROM market_cache WHERE key=?').get('value'),undefined);
 assert.equal(await api.completeMarketWork(db,next,[{key:'value',payload:'456',fetchedAt:now+45003}],now+45003),true);
 assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('value').payload,'456');raw.close();
});
void test('a timeout or throttle never changes canonical data; retry-after, incident and recovery survive restart',async()=>{
 const {raw,db}=database(),now=Date.now();seed(raw,'old',{volume:42},now-60000);
 await api.seedMarketWork(db,'scope',[def('a')],now);const failed=await api.claimMarketWork(db,'refresh',now);
 await api.failMarketWork(db,failed,new api.MarketWorkError('throttled',120000),now+1);
 assert.equal(raw.prepare('SELECT failure_code FROM market_work').get().failure_code,'throttled');
 assert.equal(raw.prepare('SELECT fetched_at FROM market_cache WHERE key=?').get('old').fetched_at,now-60000);
 assert.equal(await api.claimMarketWork(db,'refresh',now+60000),null);
 const retry=await api.claimMarketWork(db,'refresh',now+120001);assert.equal(retry.attempts,1);
 await api.completeMarketWork(db,retry,[{key:'old',payload:'{"volume":43}',fetchedAt:now+120002}],now+120002);
 assert.equal(raw.prepare('SELECT recovered_at FROM market_incidents').get().recovered_at,now+120002);raw.close();
});
void test('replanning preserves retry backoff and leases; provider cooldown skips work without consuming attempts',async()=>{
 const {raw,db}=database(),now=Date.now();await api.seedMarketWork(db,'scope',[def('a'),def('b','refresh',{kind:'pool-source',mint:'mint',provider:'geckoterminal',discovery:false})],now);
 seed(raw,'provider-cooldown:orca',null,0);raw.prepare('UPDATE market_cache SET retry_after=? WHERE key=?').run(now+90000,'provider-cooldown:orca');
 const work=await api.claimMarketWork(db,'refresh',now);assert.equal(work.id,'b');
 await api.seedMarketWork(db,'scope',[def('a'),def('b','refresh',{kind:'pool-source',mint:'mint',provider:'geckoterminal',discovery:false})],now+1);
 assert.equal(await api.claimMarketWork(db,'refresh',now+1000),null);assert.equal(raw.prepare('SELECT attempts FROM market_work WHERE id=?').get('a').attempts,0);raw.close();
});
void test('old observations cannot overwrite newer canonical rows; source success and publication have separate timestamps',async()=>{
 const {raw,db}=database(),now=Date.now();seed(raw,'value',{value:2},now);
 await api.seedMarketWork(db,'scope',[def('a')],now);const work=await api.claimMarketWork(db,'refresh',now);
 await api.completeMarketWork(db,work,[{key:'value',payload:'{"value":1}',fetchedAt:now-1000}],now+1);
 assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('value').payload,'{"value":2}');
 assert.equal(raw.prepare('SELECT succeeded_at FROM market_work').get().succeeded_at,now+1);raw.close();
});
void test('owner alerts are optional, deduplicated and retry on delivery failure; a configured receiver actually receives failure and recovery',async()=>{
 const {raw,db}=database(),now=Date.now();await api.seedMarketWork(db,'scope',[def('a')],now);
 const work=await api.claimMarketWork(db,'refresh',now);await api.failMarketWork(db,work,new api.MarketWorkError('timeout'),now+1);
 assert.equal((await api.checkMarketWorkHealth({DB:db},now+2)).delivery,'not_configured');
 const events=[];let broken=true;
 const env={DB:db,MARKET_ALERT:{async notify(e){if(broken)throw Error('delivery unavailable');events.push(e);}}};
 await assert.rejects(()=>api.checkMarketWorkHealth(env,now+2));broken=false;
 await api.checkMarketWorkHealth(env,now+3);await api.checkMarketWorkHealth(env,now+4);assert.equal(events.length,1);assert.equal(events[0].state,'failure');
 const retry=await api.claimMarketWork(db,'refresh',now+30001);await api.completeMarketWork(db,retry,[],now+30002);
 await api.checkMarketWorkHealth(env,now+30003);assert.equal(events.length,2);assert.equal(events[1].state,'recovery');raw.close();
});
void test('a recent pool publication cannot hide stale Backpack reference collection',async()=>{
 const {raw,db}=database(),now=Date.now();await api.seedMarketWork(db,'scope',[{id:'references',lane:'references',job:{kind:'references'},interval:60000}],now-60*60000);
 raw.prepare('UPDATE market_work SET succeeded_at=?,published_at=?,due_at=? WHERE id=?').run(now-60*60000,now-1000,now+60000,'references');
 const result=await api.checkMarketWorkHealth({DB:db},now);
 assert.equal(result.open,1);assert.equal(raw.prepare('SELECT code FROM market_incidents WHERE id=?').get('references').code,'source_overdue');raw.close();
});
void test('bounded transport rejects oversized provider bodies before JSON parsing and cancels the stream',async()=>{
 const fetcher=api.boundedMarketFetch(async()=>new Response('x'.repeat(400001)),new AbortController().signal);
 await assert.rejects(()=>fetcher('https://api.orca.so/'),e=>e.code==='invalid_response');
});
void test('new per-token supplies retain their own timestamp and cannot make an old or malformed supply fresh',()=>{
 const t=api.TOKENS.find(t=>t.issuer==='backpack'),now=Date.now();
 const supply={supply:1,amount:'1000000',decimals:6,slot:1,timestamp:now};
 const source={data:{OLD:supply},asOf:{OLD:now-30*60000},fetchedAt:now-30*60000,stale:true,error:null};
 const rows=new Map([[api.supplyObservationKey(t),{payload:JSON.stringify(supply),fetched_at:now,retry_after:0}]]);
 const out=api.overlaySupplyObservations(source,[t],rows,now);assert.equal(out.asOf.OLD,now-30*60000);assert.equal(out.asOf[t.symbol],now);assert.equal(out.stale,true);
 rows.get(api.supplyObservationKey(t)).payload=JSON.stringify({...supply,timestamp:now-1});assert.equal(api.overlaySupplyObservations(source,[t],rows,now).data[t.symbol],undefined);
});
void test('exact-address refresh rotates all known pools without dropping identities or assuming zero',()=>{
 const known=Array.from({length:75},(_,i)=>({address:String(i).padStart(3,'0'),dex:'orca'}));
 let cursor=0;const seen=new Set();for(let i=0;i<4;i++){const p=api.poolWorkRequest('orca','mint',known,false,cursor);cursor=p.next;new URL(p.url).searchParams.get('addresses').split(',').forEach(a=>seen.add(a));}
 assert.equal(seen.size,75);assert.equal(api.poolWorkRequest('pancakeswap','mint',[],true,0),null);
});
