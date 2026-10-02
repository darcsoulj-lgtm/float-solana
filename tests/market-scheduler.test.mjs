import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { bundle } from './helpers/bundle.mjs';
const api = await bundle(`
export * from './lib/market-scheduler';
export * from './lib/market-overview-server';
export {cachedMarket, marketSnapshot} from './lib/market-cache';
export {TOKENS,TOKEN_REVIEW_DATE} from './lib/tokens';
export {tokenBatchKey} from './lib/backpack-registry';
export {POOL_POLICY_VERSION} from './lib/stock-pools';
export {SourceHttpError} from './lib/market-data';
export * from './lib/pool-inventory';
export {readMarketBatch} from './lib/market-service';
`);
function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)');
  let reads = 0, writes = 0;
  const d1 = { prepare(sql) { return { bind(...args) { return {
    first: async () => { reads++; return raw.prepare(sql).get(...args) ?? null; },
    all: async () => { reads++; return { results: raw.prepare(sql).all(...args) }; },
    run: async () => { writes++; return raw.prepare(sql).run(...args); },
  }; } }; } };
  return { raw, d1, stats: () => ({reads,writes}) };
}
void test('a four-minute cycle covers every canonical batch exactly once, including new listings', () => {
  for (const count of [1, 15, 18]) {
    const jobs = Array.from({length: 4}, (_, slot) => api.scheduledBatches(count, slot * 60000)).flat().sort((a,b)=>a-b);
    assert.deepEqual(jobs, Array.from({length: count}, (_, index)=>index));
  }
});
void test('the public overview reads all saved batches without waiting on any provider, including outages', async () => {
  const {raw,d1,stats} = database();
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('provider outage'); };
  try {
    const registry = {additions: [], checkedAt: Date.now(), refreshing:false, delayed:false};
    const cold = await api.readMarketOverview({DB:d1}, api.TOKENS, registry);
    assert.equal(cold.prices.data, null);
    const observed = Date.now()-360000;
    for (const batch of api.marketPartitions(api.TOKENS)) {
      const key = api.TOKEN_REVIEW_DATE+':'+await api.tokenBatchKey(batch);
      const prices = Object.fromEntries(batch.map(t=>[t.symbol,{price:12,confidence:1,timestamp:observed}]));
      raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run('llama-prices-v3:'+key,JSON.stringify(prices),observed);
    }
    const before = stats();
    const saved = await api.readMarketOverview({DB:d1}, api.TOKENS, registry);
    assert.equal(Object.keys(saved.prices.data).length,api.TOKENS.length);
    assert.equal(saved.prices.fetchedAt,observed);
    assert.equal(saved.prices.stale,true);
    assert.equal(calls,0);
    assert.equal(stats().writes,0);
    assert.equal(stats().reads-before.reads,2); // bounded bulk reads; D1 bind limit remains safe
  } finally {globalThis.fetch=previousFetch;raw.close();}
});
void test('provider requests are serialized and queued requests stop at the first 429', async () => {
  let active=0, peak=0, calls=0;
  const paced=api.pacedMarketFetch(async()=>{
    calls++;active++;peak=Math.max(peak,active);
    await new Promise(r=>setTimeout(r,5));active--;
    return new Response('',{status:429,headers:{'Retry-After':'600'}});
  },1);
  const results=await Promise.allSettled(Array.from({length:6},()=>paced('https://api.dexscreener.com/tokens/v1/solana/test')));
  assert.equal(calls,1);assert.equal(peak,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,5);
  assert.equal(results[1].reason.retryAfterMs,600000);
});
void test('failed refresh keeps its old payload and time and backs off across pool batches', async () => {
  const {raw,d1}=database();
  const observed=Date.now()-360000;
  raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run('dex-pools-test:a',JSON.stringify({MU:[{volume24h:10}]}),observed);
  let calls=0;
  const loader=async()=>{calls++;throw new api.SourceHttpError('api.dexscreener.com',new Response('',{status:429,headers:{'Retry-After':'600'}}));};
  const a=await api.cachedMarket(d1,'dex-pools-test:a',60000,loader);
  await api.cachedMarket(d1,'dex-pools-test:b',60000,loader);
  assert.equal(calls,1);assert.equal(a.data.MU[0].volume24h,10);assert.equal(a.fetchedAt,observed);
  assert.equal(raw.prepare('SELECT fetched_at FROM market_cache WHERE key=?').get('dex-pools-test:a').fetched_at,observed);
  raw.close();
});
void test('duplicate cron delivery does not duplicate jobs and a failed job does not stop other batches', async () => {
  const {raw,d1}=database();
  const jobs=[];const scheduledTime=Math.floor(Date.now()/240000)*240000;
  const env={DB:d1,MARKET_REFRESH:{async run(job){jobs.push(job);if(job.kind==='batch'&&jobs.length===1)throw Error('timeout');}}};
  await assert.rejects(api.runMarketSchedule(env,scheduledTime),/scheduled market jobs failed/);
  const count=jobs.length;
  assert.ok(jobs.some(job=>job.kind==='globals'));
  assert.ok(!jobs.some(job=>job.kind==='circulation'));
  for (const job of jobs.filter(job=>job.kind==='batch')) assert.ok(api.marketPartitions(api.TOKENS)[job.batch].some(token=>token.issuer==='backpack'));
  await api.runMarketSchedule(env,scheduledTime);
  assert.equal(jobs.length,count);
  raw.close();
});

void test('90-token caches preserve complete chunks and stop after a failed provider', async () => {
  const mints = Array.from({length:90}, (_,i)=>String(i));
  const calls = [];
  const data = await api.scheduledPools(mints, {async pools(chunk) {
    calls.push(chunk);
    return {data:Object.fromEntries(chunk.map(mint=>[mint,[]]))};
  }});
  assert.deepEqual(calls.map(chunk=>chunk.length),Array(9).fill(10));
  assert.equal(Object.keys(data).length,90);
  assert.deepEqual(calls.flat(),mints);
  let count=0;
  const partial=await api.scheduledPools(mints,{async pools() {
    count++;
    return count===1 ? {data:{MU:[]}} : {error:{message:'limited',status:429,retryAfterMs:600000}};
  }});
  assert.deepEqual(partial,{MU:[]});
  await assert.rejects(api.scheduledPools(mints,{async pools(){return {error:{message:'limited',status:429,retryAfterMs:600000}};}}),
    error=>error instanceof api.SourceHttpError && error.status===429);
  assert.equal(count,2, 'no later chunk after a failed provider');
});
void test('private pool jobs reject unknown, duplicate, or oversized mint lists', async () => {
  const {raw,d1}=database();
  for (const mints of [[],Array(31).fill('x'),['x','x'],['not-a-stock']]) {
    const result = await api.runPoolChunk({DB:d1},mints);
    assert.ok(result.error);
  }
  raw.close();
});
void test('extended pool lease prevents a second refresh while chunked collection is in flight', async () => {
  const {raw,d1}=database();const now=Date.now();let finish;
  const pending=api.cachedMarket(d1,'dex-pools-lease:test',240000,
    ()=>new Promise(resolve=>{finish=resolve;}),now,undefined,120000);
  while(!finish) await new Promise(resolve=>setTimeout(resolve,1));
  let duplicate=0;
  await api.cachedMarket(d1,'dex-pools-lease:test',240000,async()=>{duplicate++;return {};},now+21000);
  assert.equal(duplicate,0);
  finish({MU:[{volume24h:100}]});await pending;
  assert.equal(JSON.parse(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('dex-pools-lease:test').payload).MU[0].volume24h,100);
  raw.close();
});

void test('short provider Retry-After permits one bounded retry and publishes cooldown first', async () => {
  const {raw,d1}=database();
  const realNow=Date.now;let now=1000000;Date.now=()=>now;
  let calls=0, slept=0;
  try {
    const wrapped=api.retryLimitedMarketFetch(d1,async()=>{
      calls++;
      return calls===1 ? new Response('limited',{status:429,headers:{'Retry-After':'14'}}) : new Response('[]');
    },new AbortController().signal,async ms=>{
      slept=ms;
      assert.equal(raw.prepare('SELECT retry_after FROM market_cache WHERE key=?').get('provider-cooldown:dexscreener').retry_after,now+ms);
      now+=ms;
    });
    assert.equal((await wrapped('https://api.dexscreener.com/tokens/v1/solana/test')).status,200);
    assert.equal(calls,2);assert.ok(slept>=15000&&slept<16000);
  } finally { Date.now=realNow;raw.close(); }
});
void test('long or absent retry hints never cause an in-job retry', async () => {
  for(const headers of [{},{'Retry-After':'600'}]) {
    const {raw,d1}=database();let calls=0;
    const wrapped=api.retryLimitedMarketFetch(d1,async()=>{calls++;return new Response('',{status:429,headers});},new AbortController().signal,async()=>{throw Error('must not sleep');});
    assert.equal((await wrapped('https://api.dexscreener.com/tokens/v1/solana/test')).status,429);
    assert.equal(calls,1);raw.close();
  }
});
void test('a repeated throttle stops after one retry and abort prevents retry', async () => {
  for(const abort of [false,true]) {
    const {raw,d1}=database();const realNow=Date.now;let now=1000000;Date.now=()=>now;
    const controller=new AbortController();let calls=0;
    try {
      const wrapped=api.retryLimitedMarketFetch(d1,async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'1'}});},controller.signal,async ms=>{now+=ms;if(abort)controller.abort();});
      if(abort) {await assert.rejects(wrapped('https://api.dexscreener.com/tokens/v1/solana/test'));assert.equal(calls,1);}
      else {assert.equal((await wrapped('https://api.dexscreener.com/tokens/v1/solana/test')).status,429);assert.equal(calls,2);}
    } finally {Date.now=realNow;raw.close();}
  }
});

void test('Backpack overview preserves canonical cache keys and prices but excludes other issuers', async () => {
  const {raw,d1,stats} = database();
  const observed = Date.now() - 1000;
  for (const batch of api.marketPartitions(api.TOKENS)) {
    const key = api.TOKEN_REVIEW_DATE + ':' + await api.tokenBatchKey(batch);
    raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run('llama-prices-v3:' + key,
      JSON.stringify(Object.fromEntries(batch.map(t => [t.symbol, {price: 12, confidence: 1, timestamp: observed}]))), observed);
  }
  const registry = {additions: [], checkedAt: observed, refreshing: false, delayed: false};
  const all = await api.readMarketOverview({DB:d1}, api.TOKENS, registry);
  const scoped = await api.readMarketOverview({DB:d1}, api.TOKENS, registry, 'backpack');
  const wanted = api.TOKENS.filter(t => t.issuer === 'backpack').map(t => t.symbol).sort();
  assert.deepEqual(Object.keys(scoped.prices.data).sort(), wanted);
  assert.deepEqual(Object.keys(scoped.prices.asOf).sort(), wanted);
  for (const symbol of wanted) assert.deepEqual(scoped.prices.data[symbol], all.prices.data[symbol]);
  assert.equal(scoped.prices.fetchedAt, observed);
  assert.equal(scoped.ondoVolume, undefined);
  assert.equal(scoped.valuations, undefined);
  assert.equal(scoped.circulation, undefined);
  assert.ok(scoped.totalBatches < all.totalBatches);
  assert.equal(stats().writes, 0);
  raw.close();
});

void test('global refresh contacts only Backpack, even when upstreams fail', async () => {
  const {raw,d1}=database(); const previous=globalThis.fetch; const urls=[];
  globalThis.fetch=async input=>{urls.push(typeof input==='string'?input:input instanceof URL?input.href:input.url);return new Response('',{status:503});};
  try {
    const result=await api.readMarketGlobals({DB:d1},api.TOKENS,false);
    assert.ok(urls.length>0);
    assert.ok(urls.every(url=>new URL(url).hostname==='api.backpack.exchange'));
    assert.equal(result.valuations,undefined);assert.equal(result.ondoVolume,undefined);
    assert.equal(result.markets.fetchedAt,null);
  } finally {globalThis.fetch=previous;raw.close();}
});
void test('public cache reads migrate legacy ratios once while retaining prices and observation timestamps', async () => {
 const {raw,d1,stats}=database(); const previous=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('public reads must not request a provider');};
 try {
  const keys=await api.marketGlobalKeys(api.TOKENS),observed=Date.now()-1000;
  const legacy={MU:{market:'MU.US_USDC',externalPrice:1107.565,externalChange24h:0.042086}};
  raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(keys.backpack,JSON.stringify(legacy),observed);
  const first=await api.readMarketGlobals({DB:d1},api.TOKENS),second=await api.readMarketGlobals({DB:d1},api.TOKENS);
  assert.equal(first.backpack.data.MU.externalChange24h,4.2086);
  assert.equal(first.backpack.data.MU.externalPrice,1107.565);
  assert.equal(first.backpack.fetchedAt,observed);
  assert.deepEqual(second.backpack,first.backpack);
  assert.equal(stats().writes,0);
  const normalized={MU:{...legacy.MU,externalChange24h:4.2086,externalChangeUnit:'percent'}};
  raw.prepare('UPDATE market_cache SET payload=? WHERE key=?').run(JSON.stringify(normalized),keys.backpack);
  assert.equal((await api.readMarketGlobals({DB:d1},api.TOKENS)).backpack.data.MU.externalChange24h,4.2086);
 } finally {globalThis.fetch=previous;raw.close();}
});
void test('every scheduled cycle excludes retired issuer batches and jobs', async () => {
  for(let slot=0;slot<4;slot++) {
    const {raw,d1}=database();const jobs=[];
    await api.runMarketSchedule({DB:d1,MARKET_REFRESH:{async run(job){jobs.push(job);}}},240000+slot*60000);
    assert.deepEqual(jobs.filter(job=>!['batch','discovery','pool-refresh'].includes(job.kind)).map(job=>job.kind),['globals','registry','holders']);
    for(const job of jobs.filter(job=>job.kind==='batch')) assert.ok(api.marketPartitions(api.TOKENS)[job.batch].some(token=>token.issuer==='backpack'));
    raw.close();
  }
});
void test('retired circulation jobs are rejected before accessing providers', async () => {
  await assert.rejects(api.runMarketJob({}, {kind:'circulation'}),/Unsupported market job/);
});

void test('mixed canonical caches request only Backpack mint identities', async () => {
  const {raw,d1}=database(); const calls=[];
  const active=api.TOKENS.find(token=>token.issuer==='backpack');
  const retired=api.TOKENS.find(token=>token.issuer==='xstocks');
  await api.readMarketBatch(d1,[active,retired],{pools:false,fetcher:async(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    calls.push(url+(typeof init?.body==='string'?init.body:''));
    return new Response('',{status:503});
  }});
  assert.ok(calls.length>=2);
  assert.ok(calls.some(call=>call.includes(active.mint)));
  assert.ok(calls.every(call=>!call.includes(retired.mint)));
  raw.close();
});

void test('independent refresh covers the entire Backpack registry within four minute slots; discovery is private and bounded', async () => {
  for (const count of [1, 44, 70, 79]) {
    const mints=Array.from({length:count},(_,i)=>'mint'+i);
    const seen=new Set(Array.from({length:Math.ceil(count/20)},(_,i)=>api.scheduledRefreshMints(mints,i*60000)).flat());
    assert.equal(seen.size,count);
  }
  const {raw,d1}=database(),jobs=[];
  await api.runMarketSchedule({DB:d1,MARKET_REFRESH:{async run(job){jobs.push(job);}}},60000);
  assert.deepEqual(jobs.filter(j=>j.kind==='discovery').map(j=>j.mints.length),[4,4]);
  assert.deepEqual(jobs.filter(j=>j.kind==='pool-refresh').map(j=>j.mints.length),[10,10]);
  const allowed=new Set(api.TOKENS.filter(t=>t.issuer==='backpack').map(t=>t.mint));
  assert.ok(jobs.filter(j=>j.mints).every(j=>j.mints.every(m=>allowed.has(m))));
  raw.close();
});
void test('discovery inventory retains pool identities through omissions without renewing volume or token freshness',async()=>{
  const {raw,d1}=database(); const token=api.TOKENS.find(t=>t.issuer==='backpack');
  const p={address:'A'.repeat(32),baseMint:token.mint,quoteMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',dex:'zerofi',volume24h:500000,liquidity:5000,price:10,change24h:1};
  await api.rememberPoolInventory(d1,token,[p],1000);
  await api.rememberPoolInventory(d1,token,[],2000);
  const inventory=await api.readPoolInventory(d1,[token]);
  assert.equal(inventory.length,1);assert.equal(inventory[0].volume24h,null);assert.equal(inventory[0].unavailable,true);
  const prior={kind:'pool-observations-v1',data:{[token.symbol]:[]},asOf:{[token.symbol]:500}};
  const empty=api.overlayTokenPools(prior,[token],new Map(),3000);assert.equal(empty.asOf[token.symbol],500);
  await api.saveTokenPoolObservation(d1,token,[p],2000);
  await api.saveTokenPoolObservation(d1,token,[{...p,volume24h:1}],1500);
  const row=raw.prepare('SELECT * FROM market_cache WHERE key=?').get(api.poolObservationKey(token));
  assert.equal(row.fetched_at,2000);assert.equal(JSON.parse(row.payload)[0].volume24h,500000);
  const saved=api.overlayTokenPools(prior,[token],new Map([[api.poolObservationKey(token),row]]),3000);
  assert.equal(saved.asOf[token.symbol],2000);assert.equal(saved.data[token.symbol][0].volume24h,500000);
  raw.close();
});
void test('public list reads independently committed pool values with the same timestamps as detail and no provider requests',async()=>{
  const {raw,d1}=database();const token=api.TOKENS.find(t=>t.issuer==='backpack');const time=Date.now();
  await api.saveTokenPoolObservation(d1,token,[{address:'A'.repeat(32),volume24h:500000,liquidity:500}],time);
  const overview=await api.readMarketOverview({DB:d1},api.TOKENS,{additions:[],checkedAt:time},'backpack');
  const detail=await api.readMarketBatch(d1,api.TOKENS.slice(0,90),{cacheOnly:true});
  assert.equal(overview.pools.data[token.symbol][0].volume24h,500000);
  assert.equal(overview.pools.asOf[token.symbol],time);assert.equal(detail.pools.asOf[token.symbol],time);
  raw.close();
});

void test('provider discovery prioritizes unchecked/new tokens after throttling rather than restarting at the same early symbols',()=>{
 assert.deepEqual(api.prioritizePoolDiscovery(['A','B','NEW','D'],new Map([['A',100],['B',200],['D',50]])),['NEW','D','A','B']);
 assert.deepEqual(api.prioritizePoolDiscovery(['A','B','C'],new Map([['A',1000]])),['B','C','A']);
 assert.deepEqual(api.prioritizePoolDiscovery(['A','B','C'],new Map(),new Map([['A',1],['B',50],['C',10]])),['B','C','A']);
});
