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
    assert.equal(stats().reads-before.reads,2); // one bulk read, one circulation read
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
  const jobs=[];const scheduledTime=Math.floor(Date.now()/60000)*60000;
  const env={DB:d1,MARKET_REFRESH:{async run(job){jobs.push(job);if(job.kind==='batch'&&jobs.length===1)throw Error('timeout');}}};
  await assert.rejects(api.runMarketSchedule(env,scheduledTime),/scheduled market jobs failed/);
  const count=jobs.length;
  assert.ok(jobs.some(job=>job.kind==='globals'));
  await api.runMarketSchedule(env,scheduledTime);
  assert.equal(jobs.length,count);
  raw.close();
});
