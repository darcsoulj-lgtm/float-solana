import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const {triggerStockCollection,stockCollectionNeeded,publishedStockVolumeComparisons,stockComparisonWindowEnd}=await bundle(`export * from './lib/stock-collection-trigger';export * from './lib/stock-volume-published';export {stockComparisonWindowEnd} from './lib/stock-volume-job';`);
const now=Date.parse('2026-10-09T07:00:00Z');
const sample=publishedStockVolumeComparisons()[0];
function comparison(at){const end=stockComparisonWindowEnd(at),start=stockComparisonWindowEnd(at-86400000);return {...sample,period:1,startUtc:start,endUtc:end,selectionBasis:'latest-market-volume',selectedAt:at-10000,generatedAt:at-1000};}
function setup(payload=JSON.stringify(comparison(now-86400000))){
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)');
 raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run('stock-volume:published:v1',payload,now);
 const DB={prepare(sql){return{bind(...args){return{first:async()=>raw.prepare(sql).get(...args)??null,run:async()=>raw.prepare(sql).run(...args)};}};}};
 return {raw,env:{DB,STOCK_VOLUME_ENABLED:'1',MARKET_WORKFLOW_TOKEN:'fixture-secret'}};
}
function provider(running=false,failed=false){const calls=[];return {calls,fetcher:async(url,options)=>{calls.push({url,options});assert.ok(url.startsWith('https://api.github.com/repos/darcsoulj-lgtm/float-solana/actions/workflows/stock-volume.yml/'));if(url.includes('/runs?')){const status=new URL(url).searchParams.get('status'),rows=running&&status==='queued'?[{status}]:[];return Response.json({total_count:rows.length,workflow_runs:rows});}return new Response(failed?'private fixture data':null,{status:failed?503:204});}};}
void test('current completed NY day and pre-collection grace perform no network work',async()=>{
 for(const [payload,time] of [[JSON.stringify(comparison(now)),now],[null,Date.parse('2026-10-09T06:29:59Z')]]){const {env,raw}=setup(payload),p=provider();assert.equal(await triggerStockCollection(env,p.fetcher,time),'fresh');assert.equal(p.calls.length,0);raw.close();}
 const {env,raw}=setup(),p=provider();delete env.MARKET_WORKFLOW_TOKEN;assert.equal(await triggerStockCollection(env,p.fetcher,now),'not_configured');env.MARKET_WORKFLOW_TOKEN='fixture';env.STOCK_VOLUME_ENABLED='0';assert.equal(await triggerStockCollection(env,p.fetcher,now),'not_configured');assert.equal(raw.prepare("SELECT count(*) n FROM market_cache WHERE key LIKE 'stock-collection%'").get().n,0);raw.close();
});
void test('missing or corrupt publication recovers without replacing it or fetching providers',async()=>{
 for(const payload of [null,'{broken']){const {env,raw}=setup(payload),p=provider();assert.equal(await triggerStockCollection(env,p.fetcher,now),'dispatched');assert.equal(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('stock-volume:published:v1').payload,payload);assert.equal(p.calls.length,6);assert.equal(p.calls.at(-1).options.body,'{"ref":"main"}');assert.ok(p.calls.every(c=>c.options.redirect==='manual'));raw.close();}
});
void test('concurrent cron ticks dispatch once and active jobs do not spend recovery attempts',async()=>{
 const {env,raw}=setup(),p=provider();assert.deepEqual((await Promise.all([triggerStockCollection(env,p.fetcher,now),triggerStockCollection(env,p.fetcher,now)])).sort((a,b)=>a.localeCompare(b)),['cooldown','dispatched']);assert.equal(p.calls.filter(c=>c.options.method==='POST').length,1);raw.close();
 const active=setup(),queued=provider(true);assert.equal(await triggerStockCollection(active.env,queued.fetcher,now),'running');assert.equal(active.raw.prepare("SELECT count(*) n FROM market_cache WHERE key LIKE 'stock-collection-dispatch:%'").get().n,0);active.raw.close();
});
void test('ambiguous dispatches consume a bounded attempt and cannot create an endless failure loop',async()=>{
 const {env,raw}=setup(),p=provider(false,true);
 await assert.rejects(triggerStockCollection(env,p.fetcher,now),/Collection trigger failed/);assert.equal(await triggerStockCollection(env,p.fetcher,now+1),'cooldown');assert.equal(await triggerStockCollection(env,p.fetcher,now+2*3600000),'cooldown');
 await assert.rejects(triggerStockCollection(env,p.fetcher,now+3*3600000),/Collection trigger failed/);assert.equal(await triggerStockCollection(env,p.fetcher,now+6*3600000),'exhausted');assert.equal(p.calls.filter(c=>c.options.method==='POST').length,2);
 assert.doesNotMatch(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('stock-collection-trigger:v1').payload,/fixture-secret|private fixture/);
 const next=provider();assert.equal(await triggerStockCollection(env,next.fetcher,now+86400000),'dispatched');raw.close();
});
void test('completion after the first dispatch cancels recovery without changing observed timestamps',async()=>{
 const {env,raw}=setup(),p=provider();await triggerStockCollection(env,p.fetcher,now);const current=comparison(now+60000);raw.prepare('UPDATE market_cache SET payload=? WHERE key=?').run(JSON.stringify(current),'stock-volume:published:v1');const count=p.calls.length;assert.equal(await triggerStockCollection(env,p.fetcher,now+3*3600000),'fresh');assert.equal(p.calls.length,count);assert.equal(JSON.parse(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('stock-volume:published:v1').payload).generatedAt,current.generatedAt);raw.close();
});
void test('winter and summer use completed NY day boundaries; future observations fail closed',()=>{
 for(const at of ['2026-03-09T06:30:00Z','2026-11-02T06:30:00Z']){const c=comparison(Date.parse(at));assert.equal(stockCollectionNeeded(JSON.stringify(c),Date.parse(at)),false);assert.equal(stockCollectionNeeded(null,Date.parse(at)),true);}
 assert.throws(()=>stockCollectionNeeded(JSON.stringify(comparison(now+86400000)),now),/Future/);
 const future={...comparison(now),generatedAt:now+60001};assert.throws(()=>stockCollectionNeeded(JSON.stringify(future),now),/Future/);
});
