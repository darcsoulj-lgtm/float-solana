import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {MarketEnvironment} from '../../lib/market-overview-server';
import type {MarketJobBinding} from '../../lib/market-scheduler';
import {runMarketJob,runPoolChunk} from '../../lib/market-scheduler';
import {backpackRegistry,registryTokens,REGISTRY_KEY,tokenBatchKey} from '../../lib/backpack-registry';
import {TOKEN_REVIEW_DATE} from '../../lib/tokens';
import {marketPartitions} from '../../lib/market-overview-server';
import {prioritizePoolDiscovery} from '../../lib/pool-inventory';
import {parseMarketRows} from '../../lib/market-snapshot-sync';

const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)');
const db={prepare(sql:string){return{bind(...args:(string|number|null)[]){return{
 first:async()=>raw.prepare(sql).get(...args)??null,
 all:async()=>({results:raw.prepare(sql).all(...args)}),
 run:async()=>raw.prepare(sql).run(...args),
};}};}} as unknown as D1Database;
const output='work/market-snapshot';await mkdir(output+'/chunks',{recursive:true});
try {
 const response=await fetch('https://raw.githubusercontent.com/darcsoulj-lgtm/float-solana/market-data/state.json',{signal:AbortSignal.timeout(15000)});
 if(response.ok){const state=await response.json() as {key:string;payload:string|null;fetched_at:number;retry_after:number}[];
 if(!Array.isArray(state)||state.length>3000)throw Error('Invalid collector state');
 for(const row of state)raw.prepare('INSERT INTO market_cache VALUES (?,?,?,?)').run(row.key,row.payload,row.fetched_at,row.retry_after);
 } else if(response.status!==404)throw Error('Collector state unavailable');
} catch(error){console.warn('Previous collector state unavailable',error instanceof Error?error.message:'unknown');}
if(!raw.prepare('SELECT key FROM market_cache WHERE key=?').get(REGISTRY_KEY)){
 const r=await fetch('https://joinfloat.xyz/api/backpack-market',{signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Bootstrap registry unavailable');
 const market=await r.json() as {registry:{additions:unknown[];checkedAt:number}};
 raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(REGISTRY_KEY,JSON.stringify(market.registry.additions),market.registry.checkedAt);
}
// Expire the registry refresh lease only; provider cooldowns survive every run.
raw.prepare('UPDATE market_cache SET retry_after=0 WHERE key=?').run(REGISTRY_KEY);
const env:MarketEnvironment & {MARKET_REFRESH:MarketJobBinding}={DB:db,SOLANA_RPC_URL:'https://api.mainnet.solana.com',MARKET_REFRESH:{run:async(job:Parameters<typeof runMarketJob>[1])=>runMarketJob(env,job),pools:async(mints:string[])=>runPoolChunk(env,mints)}};
await runMarketJob(env,{kind:'registry'});
const registry=await backpackRegistry(db,()=>{},env.SOLANA_RPC_URL,fetch,Date.now(),true);
const tokens=registryTokens(registry),mints=tokens.filter(t=>t.issuer==='backpack').map(t=>t.mint);
const bootstrap=await fetch('https://joinfloat.xyz/api/backpack-market',{signal:AbortSignal.timeout(15000)});
if(bootstrap.ok){
 const market=await bootstrap.json() as Record<string,{data:Record<string,unknown>;fetchedAt:number;asOf?:Record<string,number>}>;
 for(const batch of marketPartitions(tokens)){
  const active=batch.filter(t=>t.issuer==='backpack');if(!active.length)continue;
  const suffix=TOKEN_REVIEW_DATE+':'+await tokenBatchKey(batch);
  for(const [source,prefix] of [['prices','llama-prices-v3:'],['history','llama-history-v1:'],['supplies','solana-supplies-v4:']]){
   if(raw.prepare('SELECT payload FROM market_cache WHERE key=?').get(prefix+suffix)?.payload)continue;
   const saved=market[source];if(!saved?.data||!saved.fetchedAt)continue;
   const data=Object.fromEntries(active.filter(t=>saved.data[t.symbol]!=null).map(t=>[t.symbol,saved.data[t.symbol]]));
   if(Object.keys(data).length)raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').run(prefix+suffix,JSON.stringify(data),saved.fetchedAt);
  }
 }
}
const start=Date.now();let failures=0;
// Persisted success times prevent a throttled provider from repeatedly checking
// the same early symbols while later/new listings starve.
const checkedAt=new Map(mints.map(mint=>[mint,(raw.prepare('SELECT fetched_at FROM market_cache WHERE key=?').get('pool-discovery:geckoterminal:'+mint)?.fetched_at as number|undefined)??0]));
const activity=new Map(mints.map(mint=>{
 const row=raw.prepare('SELECT payload FROM market_cache WHERE key=?').get('pool-token-stonkfun-v2:'+mint);
 const pools=row?.payload?JSON.parse(row.payload as string) as {volume24h:number|null}[]:[];
 return [mint,pools.reduce((n,p)=>n+(p.volume24h??0),0)] as const;
}));
// A conservative free-provider budget; oldest successful checks win, with
// higher observed activity breaking ties. Known values refresh for all tokens.
const discoveryMints=prioritizePoolDiscovery(mints,checkedAt,activity).slice(0,16);
// Spend the free indexer budget on missing known values before new discovery.
// Active markets lead the queue; no symbol is hardcoded or excluded.
const refreshMints=[...mints].sort((a,b)=>(activity.get(b)??0)-(activity.get(a)??0));
for(let i=0;i<refreshMints.length;i+=10)try{await runMarketJob(env,{kind:'pool-refresh',mints:refreshMints.slice(i,i+10)});}catch{failures++;}
for(let i=0;i<discoveryMints.length;i+=4)try{await runMarketJob(env,{kind:'discovery',mints:discoveryMints.slice(i,i+4)});}catch{failures++;}
for(let i=0;i<discoveryMints.length;i+=10)try{await runMarketJob(env,{kind:'pool-refresh',mints:discoveryMints.slice(i,i+10)});}catch{failures++;}
for(const [batch,rows] of marketPartitions(tokens).entries())if(rows.some(t=>t.issuer==='backpack'))await runMarketJob(env,{kind:'batch',batch});
await runMarketJob(env,{kind:'globals'});
const all=raw.prepare('SELECT * FROM market_cache').all();
await writeFile(output+'/state.json',JSON.stringify(all));
const rows=all.filter(row=>row.payload&&/^(backpack-verified-listings-v1|pool-token-|llama-prices-v3:|llama-history-v1:|solana-supplies-v4:|backpack-catalog-v2:|backpack-tickers-v1:)/.test(row.key as string));
const chunks:string[]=[];let group:unknown[]=[];
async function flush(){if(!group.length)return;const text=JSON.stringify(group);parseMarketRows(text);const hash=createHash('sha256').update(text).digest('hex');await writeFile(output+'/chunks/'+hash+'.json',text);chunks.push(hash);group=[];}
for(const row of rows){if(group.length>=10||JSON.stringify([...group,row]).length>24000)await flush();group.push(row);}
await flush();
if(!chunks.length)throw Error('No publishable market observations');
await writeFile(output+'/pending.json',JSON.stringify({version:1,generatedAt:Date.now(),chunks}));
console.log(JSON.stringify({tokens:mints.length,failures,seconds:Math.round((Date.now()-start)/1000),chunks:chunks.length}));
raw.close();
