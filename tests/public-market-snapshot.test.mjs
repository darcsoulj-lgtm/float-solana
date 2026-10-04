import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const api=await bundle(`export * from './lib/public-market-snapshot';export {publicMarketResponse} from './lib/public-market-response';export {registryTokens} from './lib/backpack-registry';export {marketGlobalKeys} from './lib/market-overview-server';`);
const now=Date.now(),source=data=>({data,fetchedAt:now-86400000,stale:true,error:null});
const market=()=>({prices:source({}),pools:source({MU:[]}),supplies:source({}),markets:source({}),catalog:source([]),backpack:source({MU:{externalPrice:100,externalChange24h:2,externalObservedAt:now-86400000,externalBasis:'hourly-history'}}),tokenVolumes:{source:'birdeye',intervalMs:14*3600000,data:{MU:{mint:'1'.repeat(32),usd24h:3,observedAt:now-3600000,collectedAt:now-3500000}}}});
function database(){const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)');let reads=0;const db={prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async first(){reads++;return raw.prepare(sql).get(...this.args)??null;},async all(){return{results:raw.prepare(sql).all(...this.args)};},async run(){return raw.prepare(sql).run(...this.args);},sql};}};return{raw,db,reads:()=>reads};}
void test('prepared response preserves provider timestamps and missing values while assembly has its own time',async()=>{
 const {raw,db,reads}=database(),text=api.serializePublicMarketSnapshot(market());raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(api.PUBLIC_MARKET_SNAPSHOT_KEY,text,now);
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No providers on reads');};
 try{assert.equal(await api.readPublicMarketSnapshot(db,now),text);assert.equal(reads(),1);const parsed=JSON.parse(text);assert.equal(parsed.backpack.data.MU.externalObservedAt,now-86400000);assert.equal(parsed.prices.fetchedAt,now-86400000);assert.deepEqual(parsed.prices.data,{});assert.equal(parsed.tokenVolumes.data.MU.observedAt,now-3600000);}finally{globalThis.fetch=original;raw.close();}
});
void test('absent, stale, future and syntactically or structurally malformed prepared snapshots fail503',async()=>{
 const {raw,db}=database();await assert.rejects(api.readPublicMarketSnapshot(db,now),e=>e.status===503);
 for(const [payload,at] of [[api.serializePublicMarketSnapshot(market()),now-300001],[api.serializePublicMarketSnapshot(market()),now+1],['{invalid',now],['{}',now],['null',now],['{"prices":{}}',now],['{"prices":{},"pools":{},"supplies":{},"markets":{},"catalog":{}}',now]]){raw.prepare('INSERT OR REPLACE INTO market_cache VALUES (?,?,?,0)').run(api.PUBLIC_MARKET_SNAPSHOT_KEY,payload,at);await assert.rejects(api.readPublicMarketSnapshot(db,now),e=>e.status===503);}raw.close();
});
void test('projection drops unexpected top-level private data and rejects nested private fields or oversized snapshots',()=>{
 const input=market();input.walletAddress='private';input.member={id:'private'};const text=api.serializePublicMarketSnapshot(input);assert.equal(text.includes('private'),false);
 input.prices.data.MU={price:100,walletAddress:'private'};assert.throws(()=>api.serializePublicMarketSnapshot(input),/Invalid public market snapshot/);
 const large=market();large.prices.data.MU={price:100,note:'x'.repeat(api.PUBLIC_MARKET_SNAPSHOT_MAX_BYTES+1)};assert.throws(()=>api.serializePublicMarketSnapshot(large),/Invalid public market snapshot/);
});
void test('the explicit storage ceiling uses UTF8 bytes at both writer and single-read boundary',async()=>{
 const input=market();input.prices.data.MU={price:100,note:''};
 const overhead=Buffer.byteLength(api.serializePublicMarketSnapshot(input)),count=Math.floor((api.PUBLIC_MARKET_SNAPSHOT_MAX_BYTES-overhead)/3);
 input.prices.data.MU.note='€'.repeat(count);const text=api.serializePublicMarketSnapshot(input);assert.ok(Buffer.byteLength(text)<=api.PUBLIC_MARKET_SNAPSHOT_MAX_BYTES);
 const {raw,db}=database();raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(api.PUBLIC_MARKET_SNAPSHOT_KEY,text,now);assert.equal(await api.readPublicMarketSnapshot(db,now),text);
 input.prices.data.MU.note+='€';assert.throws(()=>api.serializePublicMarketSnapshot(input),/Invalid public market snapshot/);
 const oversized=JSON.stringify(input);assert.ok(oversized.length<api.PUBLIC_MARKET_SNAPSHOT_MAX_BYTES);raw.prepare('INSERT OR REPLACE INTO market_cache VALUES (?,?,?,0)').run(api.PUBLIC_MARKET_SNAPSHOT_KEY,oversized,now);await assert.rejects(api.readPublicMarketSnapshot(db,now),e=>e.status===503);raw.close();
});
void test('growth beyond the warning threshold preserves every pool observation and metric',()=>{
 const input=market(),pools=Array.from({length:4500},(_,index)=>({address:'pool-'+index,dex:'fixture',quote:'USDC',price:10,change24h:1,liquidity:100,volume24h:index+1,source:'dexscreener',observedAt:now-1000}));input.pools.data.MU=pools;
 const text=api.serializePublicMarketSnapshot(input),saved=JSON.parse(text).pools.data.MU;assert.ok(Buffer.byteLength(text)>api.PUBLIC_MARKET_SNAPSHOT_WARNING_BYTES);assert.ok(Buffer.byteLength(text)<api.PUBLIC_MARKET_SNAPSHOT_MAX_BYTES);
 assert.equal(saved.length,pools.length);assert.deepEqual(saved.map(p=>p.address),pools.map(p=>p.address));assert.deepEqual(saved.map(p=>p.volume24h),pools.map(p=>p.volume24h));assert.deepEqual(saved.map(p=>p.observedAt),pools.map(p=>p.observedAt));
});
void test('raw JSON response uses schema4, retains exact bytes and no-store through cache hits',async()=>{
 const entries=new Map(),jobs=[],cache={match:async r=>entries.get(r.url)?.clone(),put:async(r,v)=>entries.set(r.url,v)},text=api.serializePublicMarketSnapshot(market());let loads=0;
 const load=async()=>{loads++;return text;};const req=new Request('https://float.test/api/backpack-market',{headers:{cookie:'hp_member=ignored'}});
 const first=await api.publicMarketResponse(req,load,cache,p=>jobs.push(p),{rawJson:true});await Promise.all(jobs);const hit=await api.publicMarketResponse(req,load,cache,()=>{},{rawJson:true});
 assert.equal(loads,1);assert.equal(await first.text(),text);assert.equal(await hit.text(),text);assert.equal(hit.headers.get('Cache-Control'),'no-store');assert.equal(hit.headers.get('set-cookie'),null);assert.equal([...entries.keys()][0],'https://float.test/api/backpack-market?schema=4');
});
void test('failed cache-only assembly cannot overwrite the last prepared response',async()=>{
 const {raw,db}=database(),text=api.serializePublicMarketSnapshot(market());raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(api.PUBLIC_MARKET_SNAPSHOT_KEY,text,now);
 const failingDb={prepare(sql){if(sql.includes('WHERE key IN'))throw Error('fixture database unavailable');return db.prepare(sql);}};
 await assert.rejects(api.publishPublicMarketSnapshot({DB:failingDb},now+1),/fixture database unavailable/);assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get(api.PUBLIC_MARKET_SNAPSHOT_KEY).payload,text);assert.equal(raw.prepare('SELECT fetched_at FROM market_cache WHERE key=?').get(api.PUBLIC_MARKET_SNAPSHOT_KEY).fetched_at,now);raw.close();
});
void test('successful scheduled assembly uses canonical cached sources without providers or retimestamping',async()=>{
 const {readdir,readFile}=await import('node:fs/promises'),raw=new DatabaseSync(':memory:');
 for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())raw.exec(await readFile('drizzle/'+name,'utf8'));
 const db={prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async first(){return raw.prepare(sql).get(...this.args)??null;},async all(){return{results:raw.prepare(sql).all(...this.args)};},async run(){return{meta:{changes:raw.prepare(sql).run(...this.args).changes}};}};}};
 const tokens=api.registryTokens({additions:[]}),keys=await api.marketGlobalKeys(tokens),at=now-60000;
 raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(keys.backpack,JSON.stringify({MU:{externalPrice:100,externalChange24h:2,externalChangeUnit:'percent',externalObservedAt:at}}),at);
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Provider calls are forbidden');};
 try{
  await api.publishPublicMarketSnapshot({DB:db},now);
  const row=raw.prepare('SELECT payload,fetched_at FROM market_cache WHERE key=?').get(api.PUBLIC_MARKET_SNAPSHOT_KEY),data=JSON.parse(await api.readPublicMarketSnapshot(db,now));
  assert.equal(calls,0);assert.equal(row.fetched_at,now);assert.equal(data.backpack.fetchedAt,at);assert.equal(data.backpack.data.MU.externalObservedAt,at);assert.equal(data.backpack.data.MU.externalPrice,100);assert.equal(data.prices.data,null);assert.equal(data.supplies.data,null);
 }finally{globalThis.fetch=original;raw.close();}
});
