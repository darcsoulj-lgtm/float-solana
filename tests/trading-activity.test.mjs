import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const {tradingActivity,activityBreakdown,validTradingActivity} = await bundle("export * from './lib/trading-activity';");
const {marketTokens} = await bundle("export {marketTokens} from './lib/market-data';");
const {displayPoolActivity} = await bundle("export {displayPoolActivity} from './lib/token-observation';");
const now=Date.UTC(2026,9,3,12);
const tokens=marketTokens(null).filter(t=>t.issuer==='backpack').slice(0,7);
const source=(data)=>({data,fetchedAt:now-60000,stale:false,error:null});
const shared={address:'11111111111111111111111111111111',dex:'orca',quote:'USDC',price:null,change24h:null,liquidity:100,volume24h:100,observedAt:now-60000,source:'orca'};
const market=(pools)=>({pools:source(pools),prices:source({}),supplies:source({}),markets:source({}),catalog:source([])});

void test('Activity total follows the dashboard; shared pools contribute once',()=>{
 const data=market({[tokens[0].symbol]:[shared],[tokens[1].symbol]:[shared]});
 const p=tradingActivity(data,now);
 assert.equal(p.total,displayPoolActivity(data,marketTokens(data).filter(t=>t.issuer==='backpack').map(t=>t.symbol),now).observedVolume24h);
 assert.equal(p.total,100);
 assert.deepEqual(p.tokens.map(r=>r.value),[50,50]);
 assert.equal(p.partial,true);
 assert.equal(validTradingActivity(p),true);
});
void test('Unknown, disputed, stale and future pools do not become zero or new volume',()=>{
 for(const changes of [{volume24h:null},{volumeDisputed:true},{unavailable:true},{source:'raydium'},{observedAt:now-25*3600000},{observedAt:now+120000}]){
  assert.equal(tradingActivity(market({[tokens[0].symbol]:[{...shared,...changes}]}),now),null);
 }
 assert.equal(tradingActivity(null,now),null);
});
void test('Top five plus Other equals the full observed total',()=>{
 const data=market(Object.fromEntries(tokens.map((t,i)=>[t.symbol,[{...shared,address:String(i+1).repeat(32),volume24h:i+1}]])));
 const p=tradingActivity(data,now);
 const parts=activityBreakdown(p);
 assert.equal(parts.length,6);
 assert.equal(parts.at(-1).symbol,'Other');
 assert.equal(parts.reduce((n,r)=>n+r.value,0),p.total);
});
void test('Turnover never mixes pool totals into a provider observation',()=>{
 const data={...market({[tokens[0].symbol]:[shared]}),tokenVolumes:{source:'birdeye',intervalMs:12*3600000,data:{[tokens[0].symbol]:{mint:tokens[0].mint,usd24h:17,observedAt:now-60000,collectedAt:now-60000}}}};
 const p=tradingActivity(data,now);
 assert.equal(p.basis,'turnover');assert.equal(p.total,17);assert.equal(validTradingActivity(p),true);
});
void test('History validation rejects corrupt amounts, duplicates and invalid source times',()=>{
 const p=tradingActivity(market({[tokens[0].symbol]:[shared]}),now);
 for(const invalid of [{...p,total:NaN},{...p,total:-1},{...p,capturedAt:1e20},{...p,day:'2020-01-01'},{...p,newestAt:now+120000},{...p,tokens:[...p.tokens,...p.tokens]},{...p,tokens:[{symbol:'MU',value:5}]}])assert.equal(validTradingActivity(invalid),false);
});

// Exercise scheduled persistence with isolated storage and stubbed public data.
const {readFile} = await import('node:fs/promises');
const {compileFunction} = await import('node:vm');
const ts = (await import('typescript')).default;
const serverSource=await readFile(new URL('../lib/trading-activity-server.ts',import.meta.url),'utf8');
function server(data) {
 const compiled={exports:{}};
 compileFunction(ts.transpileModule(serverSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,['require','module','exports'])(name=>{
  if(name==='./backpack-registry')return {backpackRegistry:async()=>({}),registryTokens:()=>tokens};
  if(name==='./market-overview-server')return {readMarketOverview:async()=>data};
  if(name==='./trading-activity')return {tradingActivity,validTradingActivity};
  if(name==='./stock-pools')return {POOL_POLICY_VERSION:'test'};
  if(name==='./birdeye-volume-server')return {birdeyeVolumeEnabled:env=>env.BIRDEYE_VOLUME_ENABLED==='1'};
  throw Error(name);
 },compiled,compiled.exports);
 return compiled.exports;
}
function isolatedDB() {
 const rows=new Map();let writes=0;
 return {rows,get writes(){return writes;},prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return rows.has(args[0])?{key:args[0]}:null;},async all(){return {results:[...rows.entries()].filter(([key])=>key>=args[0]&&key<args[1]).sort(([a],[b])=>a.localeCompare(b)).slice(0,180).map(([,payload])=>({payload}))};},async run(){if(sql.startsWith('INSERT')&&!rows.has(args[0])){rows.set(args[0],args[1]);writes++;}if(sql.startsWith('DELETE'))for(const key of rows.keys())if(key>=args[0]&&key<args[1])rows.delete(key);return {success:true};}};}};
}
void test('Daily capture is immutable, bounded and excludes unchanged previous-day observations',async()=>{
 const data=market({[tokens[0].symbol]:[shared]});const functions=server(data);const DB=isolatedDB();
 await functions.recordTradingActivity({DB},now);assert.equal(DB.writes,1);
 await functions.recordTradingActivity({DB},now+60000);assert.equal(DB.writes,1);
 assert.equal((await functions.readTradingActivity(DB,now)).length,1);
 await functions.recordTradingActivity({DB},now+86400000);assert.equal(DB.writes,1);
 const nextData=market({[tokens[0].symbol]:[{...shared,observedAt:now+86400000}]});nextData.pools.fetchedAt=now+86400000;
 const newer=server(nextData);
 await newer.recordTradingActivity({DB},now+86400000);assert.equal(DB.writes,2);
 DB.rows.set('trading-activity:v1:test:2026-10-01','{"total":0}');
 assert.equal((await newer.readTradingActivity(DB,now+86400000)).length,2);
});
void test('Unavailable source does not write a historical zero',async()=>{
 const DB=isolatedDB();await server(market({})).recordTradingActivity({DB},now);assert.equal(DB.writes,0);
});
void test('Provider activation preserves pool history and records turnover on the same UTC day',async()=>{
 const DB=isolatedDB();await server(market({[tokens[0].symbol]:[shared]})).recordTradingActivity({DB},now);
 const data={...market({}),tokenVolumes:{source:'birdeye',intervalMs:14*3600000,data:{[tokens[0].symbol]:{mint:tokens[0].mint,usd24h:17,observedAt:now-60000,collectedAt:now-60000}}}};
 const functions=server(data),env={DB,BIRDEYE_VOLUME_ENABLED:'1'};
 await functions.recordTradingActivity(env,now);await functions.recordTradingActivity(env,now+60000);
 assert.equal(DB.writes,2);const points=await functions.readTradingActivity(DB,now+60000);
 assert.deepEqual(points.map(p=>[p.basis,p.total]),[['pools',100],['turnover',17]]);
});
