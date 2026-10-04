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
 const db={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return raw.prepare(sql).get(...this.args)??null;},async all(){return {results:raw.prepare(sql).all(...this.args)};},async run(){return raw.prepare(sql).run(...this.args);},sql};}};return {raw,db};
}
const reply=(volume=100,time=now)=>({success:true,data:{volumeUSD:volume,updateUnixTime:Math.floor(time/1000)}});
void test('official response: accept explicit zero, reject missing, wrong mint and stale/future observations',()=>{
 assert.equal(a.parseBirdeyeVolume(reply(0),token.mint,now).usd24h,0);
 for(const raw of [reply(null),reply(-1),reply(Infinity),reply('100'),reply(1,now+120000),reply(1,now-73*3600000),{success:false,data:reply().data},{success:true,data:{...reply().data,address:tokens.find(t=>t.mint!==token.mint).mint}}])assert.throws(()=>a.parseBirdeyeVolume(raw,token.mint,now));
});
void test('69 tokens fit a free twelve-hour cadence; new listings automatically lengthen it within budget',()=>{
 assert.equal(a.birdeyeVolumeInterval(69),43200000);
 for(const count of [69,100,500])assert.ok(count*5*32*86400000/a.birdeyeVolumeInterval(count)<=24000);
 assert.throws(()=>a.birdeyeVolumeInterval(69,30000));
});
void test('atomic rolling reservation never overspends, including concurrency and month change',async()=>{
 const {raw,db}=database();
 const reserved=await Promise.all(Array.from({length:8},()=>a.reserveBirdeyeUnits(db,now,20)));
 assert.equal(reserved.filter(Boolean).length,4);
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
void test('disabled or unbudgeted integration makes no provider or database calls',async()=>{
 for(const env of [{},{BIRDEYE_API_KEY:'fixture'}, {BIRDEYE_API_KEY:'fixture',BIRDEYE_VOLUME_ENABLED:'1'}, {BIRDEYE_API_KEY:'fixture',BIRDEYE_VOLUME_ENABLED:'1',BIRDEYE_VOLUME_BUDGET_CU:'30000'}])await a.refreshBirdeyeVolumes(env,now,()=>{throw Error('Unexpected request');});
});
void test('scheduled updates use verified registry, coalesce, stop on failure, and keep last good data',async()=>{
 const {raw,db}=database(),env={DB:db,BIRDEYE_API_KEY:'test-secret',BIRDEYE_VOLUME_ENABLED:'1',BIRDEYE_VOLUME_BUDGET_CU:'24000'};
 // All but one mint already collected; avoids unrelated calls and real timers.
 for(const t of tokens)raw.prepare('INSERT INTO market_cache VALUES (?,?,?,?)').run(a.birdeyeVolumeKey(t.mint),JSON.stringify(a.parseBirdeyeVolume(reply(),t.mint,now)),now,t===token?0:now+86400000);
 let calls=0;
 const fetcher=async(url,init)=>{calls++;assert.equal(new URL(url).searchParams.get('address'),token.mint);assert.equal(new URL(url).searchParams.get('type'),'24h');assert.equal(init.headers['x-chain'],'solana');return Response.json(reply(999));};
 await Promise.all([a.refreshBirdeyeVolumes(env,now,fetcher),a.refreshBirdeyeVolumes(env,now,fetcher)]);assert.equal(calls,1);
 const before=raw.prepare('SELECT * FROM market_cache WHERE key=?').get(a.birdeyeVolumeKey(token.mint));assert.equal(JSON.parse(before.payload).usd24h,999);
 raw.exec("UPDATE market_cache SET retry_after=0 WHERE key='birdeye-schedule:v1'");raw.prepare('UPDATE market_cache SET retry_after=0 WHERE key=?').run(a.birdeyeVolumeKey(token.mint));
 await a.refreshBirdeyeVolumes(env,now+60000,async()=>{calls++;return new Response('',{status:429});});
 const after=raw.prepare('SELECT * FROM market_cache WHERE key=?').get(a.birdeyeVolumeKey(token.mint));assert.equal(after.payload,before.payload);assert.equal(after.fetched_at,before.fetched_at);
 await a.refreshBirdeyeVolumes(env,now+120000,fetcher);assert.equal(calls,2);raw.close();
});
void test('one unsupported or malformed token does not stop the remaining due tokens',async()=>{
 for(const invalid of [new Response('',{status:404}),Response.json({success:true,data:{volumeUSD:null}})]){
  const {raw,db}=database(),env={DB:db,BIRDEYE_API_KEY:'fixture',BIRDEYE_VOLUME_ENABLED:'1',BIRDEYE_VOLUME_BUDGET_CU:'20000'};
  const due=tokens.slice(0,2);
  for(const t of tokens)raw.prepare('INSERT INTO market_cache VALUES (?,?,?,?)').run(a.birdeyeVolumeKey(t.mint),JSON.stringify(a.parseBirdeyeVolume(reply(100),t.mint,now)),now,due.includes(t)?0:now+86400000);
  let calls=0;
  await a.refreshBirdeyeVolumes(env,now,async()=>++calls===1?invalid:Response.json(reply(200)));
  assert.equal(calls,2);
  const volumes=raw.prepare("SELECT payload FROM market_cache WHERE key LIKE 'birdeye-volume:%'").all().map(r=>JSON.parse(r.payload).usd24h);
  assert.equal(volumes.filter(v=>v===200).length,1);
  const status=JSON.parse(raw.prepare("SELECT payload FROM market_cache WHERE key='birdeye-schedule:v1'").get().payload);
  assert.equal(status.status,'ok');assert.equal(status.unavailable,1);raw.close();
 }
});
void test('71 listings with 20000 CU allocation use a fourteen-hour cadence',()=>{
 assert.equal(a.birdeyeVolumeInterval(71,20000),14*3600000);
});

void test('periodic volume retains older provider timestamps instead of relabeling collection time',()=>{
 const older=now-4*3600000;const v=a.parseBirdeyeVolume(reply(123,older),token.mint,now);
 assert.equal(v.observedAt,Math.floor(older/1000)*1000);assert.equal(v.collectedAt,now);
});
