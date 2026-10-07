import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const a=await bundle(`export * from './lib/birdeye-volume';export * from './lib/birdeye-volume-server';export {readMarketOverview} from './lib/market-overview-server';export {tokenObservation} from './lib/token-observation';export {TOKENS} from './lib/tokens';`);
const now=Date.now(), tokens=a.TOKENS.filter(t=>t.issuer==='backpack'), token=tokens.find(t=>t.symbol==='MU');
const source=data=>({data,fetchedAt:now,stale:false,error:null});
const market=()=>({prices:source({}),supplies:source({}),markets:source({}),catalog:source([]),pools:source({MU:[{address:'one',volume24h:10,price:null,liquidity:1,observedAt:now}]})});
function database(){
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER);');
 const db={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return raw.prepare(sql).get(...this.args)??null;},async all(){return {results:raw.prepare(sql).all(...this.args)};},async run(){return raw.prepare(sql).run(...this.args);},sql};},async batch(statements){raw.exec('BEGIN');try{const results=await Promise.all(statements.map(s=>s.run()));raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}}};return {raw,db};
}
const reply=(volume=100,time=now)=>({success:true,data:{volumeUSD:volume,updateUnixTime:Math.floor(time/1000)}});
void test('official response: accept explicit zero, reject missing, wrong mint and stale/future observations',()=>{
 assert.equal(a.parseBirdeyeVolume(reply(0),token.mint,now).usd24h,0);
 for(const raw of [reply(null),reply(-1),reply(Infinity),reply('100'),reply(1,now+120000),reply(1,now-73*3600000),{success:false,data:reply().data},{success:true,data:{...reply().data,address:tokens.find(t=>t.mint!==token.mint).mint}}])assert.throws(()=>a.parseBirdeyeVolume(raw,token.mint,now));
});
void test('69 tokens fit the current seven-CU allowance; new listings automatically lengthen it within budget',()=>{
 assert.equal(a.birdeyeVolumeInterval(69),16*3600000);
 for(const count of [69,74,100,500])assert.ok(Math.ceil(32*86400000/a.birdeyeVolumeInterval(count,20000))*count*7<=20000);
 assert.throws(()=>a.birdeyeVolumeInterval(69,30000));
});
void test('atomic rolling reservation never overspends, including concurrency and month change',async()=>{
 const {raw,db}=database();
 const reserved=await Promise.all(Array.from({length:8},()=>a.reserveBirdeyeUnits(db,now,20)));
 assert.equal(reserved.filter(Boolean).length,2);
 assert.equal(await a.reserveBirdeyeUnits(db,now+86400000,20),false);
 assert.equal(await a.reserveBirdeyeUnits(db,now+32*86400000,20),true);raw.close();
});
void test('cache rejects corrupt identity and expiry; reads retain original provider and collection time',()=>{
 const value=a.parseBirdeyeVolume(reply(),token.mint,now);
 const rows=new Map([[a.birdeyeVolumeKey(token.mint),{payload:JSON.stringify(value),fetched_at:now,retry_after:now+43200000}]]);
 assert.deepEqual(a.readBirdeyeVolumes([token],rows,43200000,now+3600000).data[token.symbol],value);
 assert.equal(a.readBirdeyeVolumes([token],rows,43200000,now+73*3600000).data[token.symbol],undefined);
 rows.get(a.birdeyeVolumeKey(token.mint)).payload=JSON.stringify({...value,mint:'wrong'});
 assert.equal(a.readBirdeyeVolumes([token],rows,43200000,now).data[token.symbol],undefined);
});
void test('token turnover never adds pool backups and does not silently fall back when a token is missing',()=>{
 const data=market();assert.equal(a.tokenObservation(data,'MU',now).dexVolume24h,10);
 data.tokenVolumes={source:'birdeye',intervalMs:43200000,data:{MU:a.parseBirdeyeVolume(reply(1000),token.mint,now)}};
 assert.equal(a.tokenObservation(data,'MU',now).dexVolume24h,1000);
 assert.equal(a.birdeyeTurnover(data,[token,token],now).total,1000);
 delete data.tokenVolumes.data.MU;
 assert.equal(a.tokenObservation(data,'MU',now).dexVolume24h,null);
 assert.equal(a.birdeyeTurnover(data,[token],now).total,null);
});
void test('summary distinguishes provider observation from actual collection without advancing either clock',()=>{
 const collected=now-3600000,observed=now-17*3600000;
 const value=a.parseBirdeyeVolume(reply(1000,observed),token.mint,collected);
 const data={tokenVolumes:{source:'birdeye',intervalMs:14*3600000,data:{MU:value}}};
 const total=a.birdeyeTurnover(data,[token],now);
 assert.equal(total.total,1000);assert.equal(total.oldestAt,value.observedAt);assert.equal(total.collectedFrom,collected);assert.equal(total.collectedTo,collected);assert.equal(total.delayed,true);
});
void test('disabled or unbudgeted integration makes no provider or database calls',async()=>{
 for(const env of [{},{BIRDEYE_API_KEY:'fixture'}, {BIRDEYE_API_KEY:'fixture',BIRDEYE_VOLUME_ENABLED:'1'}, {BIRDEYE_API_KEY:'fixture',BIRDEYE_VOLUME_ENABLED:'1',BIRDEYE_VOLUME_BUDGET_CU:'30000'}])await a.refreshBirdeyeVolumes(env,now,()=>{throw Error('Unexpected request');});
});
const pause=async()=>{};
const envFor=db=>({DB:db,BIRDEYE_API_KEY:'fixture',BIRDEYE_VOLUME_ENABLED:'1',BIRDEYE_VOLUME_BUDGET_CU:'20000'});
const savedSnapshot=(raw)=>raw.prepare('SELECT * FROM market_cache WHERE key=?').get(a.BIRDEYE_VOLUME_SNAPSHOT_KEY);
function oldRound(raw){
 const values=Object.fromEntries(tokens.map(t=>[t.mint,a.parseBirdeyeVolume(reply(100,now-3600000),t.mint,now-3600000)]));
 const snapshot={version:1,id:'previous',mints:a.birdeyeVolumeMints(tokens),startedAt:now-3600000,completedAt:now-3600000,data:values};
 raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(a.BIRDEYE_VOLUME_SNAPSHOT_KEY,JSON.stringify(snapshot),snapshot.completedAt);
 for(const t of tokens)raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(a.birdeyeVolumeKey(t.mint),JSON.stringify(values[t.mint]),snapshot.completedAt);
 return snapshot;
}
void test('a whole registry pass remains private until complete; every public value switches together',async()=>{
 const {raw,db}=database(),env=envFor(db),previous=oldRound(raw);let calls=0;
 const fetcher=async(url,init)=>{calls++;assert.equal(new URL(url).searchParams.get('type'),'24h');assert.equal(init.headers['x-chain'],'solana');return Response.json(reply(200,now));};
 await Promise.all([a.refreshBirdeyeVolumes(env,now,fetcher,pause),a.refreshBirdeyeVolumes(env,now,fetcher,pause)]);
 assert.equal(calls,12);assert.equal(JSON.parse(savedSnapshot(raw).payload).id,previous.id);
 assert.ok(raw.prepare("SELECT payload FROM market_cache WHERE key LIKE 'birdeye-volume:v1:%'").all().every(r=>JSON.parse(r.payload).usd24h===100));
 const ticks=Math.ceil(tokens.length/12);
 for(let tick=1;tick<ticks;tick++)await a.refreshBirdeyeVolumes(env,now+tick*61000,fetcher,pause);
 assert.equal(calls,tokens.length);
 const row=savedSnapshot(raw),view=a.readBirdeyeVolumeSnapshot(tokens,row,20*3600000,now+ticks*61000);
 assert.equal(Object.keys(view.data).length,tokens.length);assert.ok(Object.values(view.data).every(v=>v.usd24h===200));
 assert.notEqual(view.round.id,previous.id);
 assert.equal(raw.prepare('SELECT * FROM market_cache WHERE key=?').get(a.BIRDEYE_VOLUME_ROUND_KEY),undefined);
 assert.equal(Number(raw.prepare("SELECT payload FROM market_cache WHERE key LIKE 'birdeye-usage:v2:%'").get().payload),tokens.length*7);
 await a.refreshBirdeyeVolumes(env,now+ticks*61000,fetcher,pause);assert.equal(calls,tokens.length);
 raw.close();
});
void test('unsupported, invalid and failed tokens never publish a partly refreshed total or a zero',async()=>{
 for(const invalid of [()=>new Response('',{status:404}),()=>Response.json({success:true,data:{volumeUSD:null}}),()=>new Response('',{status:429})]){
  const {raw,db}=database(),env=envFor(db),previous=oldRound(raw);let calls=0;
  const fetcher=async()=>++calls===1?invalid():Response.json(reply(200));
  for(let tick=0;tick<Math.ceil(tokens.length/12);tick++)await a.refreshBirdeyeVolumes(env,now+tick*61000,fetcher,pause);
  assert.equal(JSON.parse(savedSnapshot(raw).payload).id,previous.id);
  assert.ok(raw.prepare("SELECT payload FROM market_cache WHERE key LIKE 'birdeye-volume:v1:%'").all().every(r=>JSON.parse(r.payload).usd24h===100));
  const status=JSON.parse(raw.prepare("SELECT payload FROM market_cache WHERE key='birdeye-schedule:v1'").get().payload);
  assert.ok(['round_incomplete','source_unavailable'].includes(status.status));raw.close();
 }
});
void test('a new listing, damaged round, stale source or mixed collection window invalidates the entire snapshot',()=>{
 const {raw}=database();const snapshot=oldRound(raw),row=savedSnapshot(raw),interval=20*3600000;
 assert.equal(Object.keys(a.readBirdeyeVolumeSnapshot(tokens,row,interval,now).data).length,tokens.length);
 const added={...token,symbol:'NEW',mint:'11111111111111111111111111111111'};
 assert.equal(Object.keys(a.readBirdeyeVolumeSnapshot([...tokens,added],row,interval,now).data).length,0);
 for(const change of [x=>delete x.data[token.mint],x=>x.data[token.mint].usd24h=null,x=>x.data[token.mint].observedAt-=73*3600000,x=>x.startedAt-=3600000]){
  const x=structuredClone(snapshot);change(x);
  assert.equal(Object.keys(a.readBirdeyeVolumeSnapshot(tokens,{...row,payload:JSON.stringify(x)},interval,now).data).length,0);
 }
 raw.close();
});
void test('reserve the complete pass before contacting a provider, preserving legacy seven-CU-equivalent usage',async()=>{
 const {raw,db}=database();
 const day=Math.floor(now/86400000)*86400000;
 raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run('birdeye-usage:v1:'+day,'14285',day);
 let calls=0;await a.refreshBirdeyeVolumes(envFor(db),now,async()=>{calls++;return Response.json(reply());},pause);
 assert.equal(calls,0);assert.equal(savedSnapshot(raw),undefined);
 assert.equal(JSON.parse(raw.prepare("SELECT payload FROM market_cache WHERE key='birdeye-schedule:v1'").get().payload).status,'budget_exhausted');raw.close();
});
void test('an expired or registry-changed partial pass restarts with every mint, never carrying previous partial observations',async()=>{
 const {raw,db}=database();oldRound(raw);
 raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(a.BIRDEYE_VOLUME_ROUND_KEY,JSON.stringify({version:1,id:'expired',mints:a.birdeyeVolumeMints(tokens),startedAt:now-21*60000,next:tokens.length-1,data:{[token.mint]:a.parseBirdeyeVolume(reply(999),token.mint,now)}}),now);
 await a.refreshBirdeyeVolumes(envFor(db),now,async()=>Response.json(reply(200)),pause);
 const round=JSON.parse(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get(a.BIRDEYE_VOLUME_ROUND_KEY).payload);
 assert.notEqual(round.id,'expired');assert.equal(round.next,12);assert.ok(Object.values(round.data).every(v=>v.usd24h===200));raw.close();
});
void test('74 listings with 20000 CU use a twenty-one-hour cadence at the official seven-CU single-token cost',()=>{
 assert.equal(a.birdeyeVolumeInterval(74,20000),21*3600000);
});

void test('periodic volume retains older provider timestamps instead of relabeling collection time',()=>{
 const older=now-4*3600000;const v=a.parseBirdeyeVolume(reply(123,older),token.mint,now);
 assert.equal(v.observedAt,Math.floor(older/1000)*1000);assert.equal(v.collectedAt,now);
});

void test('a collector that loses its lease cannot persist progress or publish',async()=>{
 const {raw,db}=database();const previous=oldRound(raw);let calls=0;
 await a.refreshBirdeyeVolumes(envFor(db),now,async()=>{
  calls++;raw.prepare("UPDATE market_cache SET payload=? WHERE key='birdeye-schedule:v1'").run('new-owner');return Response.json(reply(999));
 },pause);
 assert.equal(calls,1);assert.equal(JSON.parse(savedSnapshot(raw).payload).id,previous.id);
 assert.equal(raw.prepare("SELECT payload FROM market_cache WHERE key='birdeye-schedule:v1'").get().payload,'new-owner');raw.close();
});

void test('a newly collected whole round preserves older provider snapshot times instead of imposing price-style five-minute freshness',()=>{
 const {raw}=database(),snapshot=oldRound(raw),row=savedSnapshot(raw);
 snapshot.data[token.mint].observedAt=now-25*3600000;
 const view=a.readBirdeyeVolumeSnapshot(tokens,{...row,payload:JSON.stringify(snapshot)},20*3600000,now);
 assert.equal(Object.keys(view.data).length,tokens.length);assert.equal(view.data[token.symbol].observedAt,now-25*3600000);
 assert.equal(a.birdeyeTurnover({tokenVolumes:view},tokens,now).delayed,true);raw.close();
});
