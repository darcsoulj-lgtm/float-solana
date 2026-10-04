import { SUPPLY_REFRESH_MS, SUPPLY_WORK_BATCH_SIZE } from './market-freshness';
import { backpackRegistry, registryTokens, tokenBatchKey } from './backpack-registry';
import { poolObservationKey, readPoolInventory } from './pool-inventory';
import { POOL_PROVIDERS } from './pool-provider-adapters';
import type { MarketEnvironment } from './market-overview-server';
import { seedMarketWork, claimMarketWork, completeMarketWork, failMarketWork, type MarketWork, type WorkDefinition, type MarketLane, type DurableMarketJob } from './market-work-store';
import { executeMarketWork,poolShardKey } from './market-work-executor';
import type { Pool } from './market-data';

export type DurableMarketBinding = { work(id: string, leaseToken: string): Promise<void>; plan(): Promise<void>; planTokens(mints:string[],scope:string):Promise<string[]>; planShards(addresses:string[],scope:string):Promise<string[]>; health(): Promise<void> };
export type DurableMarketEnvironment = MarketEnvironment & { MARKET_REFRESH: DurableMarketBinding };
const PLAN_KEY = 'market-work-plan:v1';
// Bound each scheduler tick. This is a queueing limit, not evidence that the
// Free plan has enough D1 or CPU headroom; production remains gated on soak data.
export const WORK_LANE_BUDGET: readonly [MarketLane, number][] = [['references',1], ['supplies',3], ['refresh',3], ['backup',1], ['discovery',4], ['publication',4]];

export async function planMarketWork(env: DurableMarketEnvironment) {
  const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, Date.now(), true);
  const tokens = registryTokens(registry).filter(t => t.issuer === 'backpack');
  const scope = await tokenBatchKey(tokens);
  const old = await env.DB.prepare('SELECT payload FROM market_cache WHERE key=?').bind(PLAN_KEY).first<{payload:string|null}>();
  // Plan once per ten minutes, also responding immediately to new verified mints.
  const planningScope = scope + ':' + Math.floor(Date.now() / 600000);
  if (old?.payload === planningScope) return;
  const definitions: WorkDefinition[] = [
    {id:'references',lane:'references',job:{kind:'references'},interval:60000},
    {id:'catalog',lane:'catalog',job:{kind:'catalog'},interval:900000},
    {id:'registry',lane:'registry',job:{kind:'registry'},interval:300000},
    {id:'launch-registry',lane:'catalog',job:{kind:'launch-registry'},interval:900000},
  ];
  for (let offset=0;offset<tokens.length;offset+=SUPPLY_WORK_BATCH_SIZE) {
    const mints=tokens.slice(offset,offset+SUPPLY_WORK_BATCH_SIZE).map(t=>t.mint);
    // Supply changes slowly; a 15-minute check preserves market-cap utility
    // without spending a D1 write for every token every few minutes.
    definitions.push({id:'supplies:'+mints.join(','),lane:'supplies',job:{kind:'supplies',mints},interval:SUPPLY_REFRESH_MS});
  }
  await seedMarketWork(env.DB,scope,definitions,Date.now());
  // Bounded planning invocations: inspecting every pool inventory and writing
  // hundreds of definitions in a single free Worker would repeat the CPU fault.
  const progress=await env.DB.prepare('SELECT payload FROM market_cache WHERE key=?').bind(PLAN_KEY+':progress').first<{payload:string|null}>();
  const position: {scope:string;offset:number;addresses?:string[]}|null=progress?.payload?JSON.parse(progress.payload):null;
  const start=position?.scope===scope?position.offset:0;
  const end=Math.min(tokens.length,start+20);
  const addresses=new Set(position?.scope===scope?position.addresses??[]:[]);
  for(let offset=start;offset<end;offset+=2)
    for(const address of await env.MARKET_REFRESH.planTokens(tokens.slice(offset,offset+2).map(t=>t.mint),scope))addresses.add(address);
  if(end<tokens.length) {
    await env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(PLAN_KEY+':progress',JSON.stringify({scope,offset:end,addresses:[...addresses]}),Date.now()).run();
    return;
  }
  const sorted=[...addresses].sort(),shardIds:string[]=[];
  for(let offset=0;offset<sorted.length;offset+=120)shardIds.push(...await env.MARKET_REFRESH.planShards(sorted.slice(offset,offset+120),scope));
  const existing=await env.DB.prepare("SELECT id FROM market_work WHERE enabled=1 AND json_extract(payload,'$.kind')='pool-shard'").all<{id:string}>();
  const live=new Set(shardIds);
  for(const row of existing.results)if(!live.has(row.id))await env.DB.prepare('UPDATE market_work SET enabled=0,lease_token=NULL,lease_until=0 WHERE id=?').bind(row.id).run();
  await env.DB.prepare('UPDATE market_work SET enabled=0,lease_until=0,lease_token=NULL WHERE scope<>? AND enabled=1').bind(scope).run();
  await env.DB.prepare('DELETE FROM market_cache WHERE key=?').bind(PLAN_KEY+':progress').run();
  await env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(PLAN_KEY,planningScope,Date.now()).run();
}
export async function planMarketTokens(env:MarketEnvironment,mints:string[],scope:string) {
  if(!Array.isArray(mints)||!mints.length||mints.length>2||new Set(mints).size!==mints.length)throw Error('Invalid planning chunk');
  const registry=await backpackRegistry(env.DB,()=>{},env.SOLANA_RPC_URL,fetch,Date.now(),true);
  const tokens=registryTokens(registry).filter(t=>t.issuer==='backpack');
  if(await tokenBatchKey(tokens)!==scope||mints.some(m=>!tokens.some(t=>t.mint===m)))throw Error('Unverified planning scope');
  const definitions:WorkDefinition[]=[];
  const addresses=new Set<string>();
  for (const token of tokens.filter(t=>mints.includes(t.mint))) {
    const inventory = await readPoolInventory(env.DB,[token]);
    inventory.forEach(p=>addresses.add(p.address));
    const row = await env.DB.prepare('SELECT payload FROM market_cache WHERE key=?').bind(poolObservationKey(token)).first<{payload:string|null}>();
    const current:Pool[]=row?.payload ? JSON.parse(row.payload) : [];
    const activity=current.reduce((n,p)=>n+(p.volume24h??0),0);
    const active = activity>=1000;
    definitions.push({id:'publish:'+token.mint,lane:'publication',job:{kind:'pool-publish',mint:token.mint},interval:3600000,priority:active?1:0});
    const venues=new Set(inventory.map(p=>p.dex));
    for(const provider of POOL_PROVIDERS) {
      if(provider==='dexscreener'&&!inventory.length||!['dexscreener','geckoterminal'].includes(provider)&&(venues.has(provider)||provider.startsWith('meteora')&&venues.has('meteora')||provider==='pancakeswap'&&venues.has('pancakeswap-v3-solana')))
        definitions.push({id:`refresh:${provider}:${token.mint}`,lane:provider==='dexscreener'?'refresh':'discovery',job:{kind:'pool-source',mint:token.mint,provider,discovery:false},interval:6*3600000,priority:active?1:0});
      // Known endpoints only. Pancake discovery and Byreal pagination have not
      // passed live validation; retain indexer discovery rather than guessing.
      if(!['pancakeswap','byreal'].includes(provider)) definitions.push({id:`discover:${provider}:${token.mint}`,lane:'discovery',job:{kind:'pool-source',mint:token.mint,provider,discovery:true},interval:24*3600000});
    }
  }
  await seedMarketWork(env.DB,scope,definitions,Date.now());
  const desired=new Set(definitions.map(d=>d.id));
  for(const token of tokens.filter(t=>mints.includes(t.mint)))for(const provider of ['dexscreener','geckoterminal']){
    const id=`refresh:${provider}:${token.mint}`;
    if(!desired.has(id))await env.DB.prepare('UPDATE market_work SET enabled=0,lease_token=NULL,lease_until=0 WHERE id=? AND enabled=1').bind(id).run();
  }
  return [...addresses];
}
export async function planMarketShards(env:MarketEnvironment,addresses:string[],scope:string) {
  if(!addresses.length||addresses.length>120||new Set(addresses).size!==addresses.length||addresses.some(a=>!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)))throw Error('Invalid pool shard');
  const ids:string[]=[],definitions:WorkDefinition[]=[],mapping:D1PreparedStatement[]=[];
  for(let offset=0;offset<addresses.length;offset+=30)for(const provider of ['dexscreener','geckoterminal'] as const){
    const group=addresses.slice(offset,offset+30),key=await poolShardKey(provider,group),id='shard:'+key;
    ids.push(id);definitions.push({id,lane:provider==='dexscreener'?'refresh':'backup',job:{kind:'pool-shard',provider,addresses:group},interval:provider==='dexscreener'?600000:1800000});
    for(const address of group)mapping.push(env.DB.prepare('INSERT INTO market_pool_shards(address,provider,source_key) VALUES (?,?,?) ON CONFLICT(address,provider) DO UPDATE SET source_key=excluded.source_key WHERE market_pool_shards.source_key<>excluded.source_key').bind(address,provider,key));
  }
  for(let offset=0;offset<mapping.length;offset+=40)await env.DB.batch(mapping.slice(offset,offset+40));
  await seedMarketWork(env.DB,scope,definitions,Date.now());
  return ids;
}
export async function runDurableMarketWork(env: MarketEnvironment, id: string, leaseToken: string, fetcher: typeof fetch = fetch) {
  const now=Date.now();
  const work=await env.DB.prepare('SELECT * FROM market_work WHERE id=? AND lease_token=? AND enabled=1 AND lease_until>?').bind(id,leaseToken,now).first<MarketWork>();
  if(!work)return;
  try {
    const result=await executeMarketWork(env,JSON.parse(work.payload) as DurableMarketJob,fetcher);
    await completeMarketWork(env.DB,work,result.writes,Date.now(),result.wakeMint);
  } catch(error) {await failMarketWork(env.DB,work,error,Date.now());}
}
export async function runDurableMarketSchedule(env: DurableMarketEnvironment, scheduledTime: number) {
  const now=Date.now(),leaseKey='market-work-schedule:v1';
  const lease=await env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,NULL,?,?) ON CONFLICT(key) DO UPDATE SET fetched_at=excluded.fetched_at,retry_after=excluded.retry_after WHERE market_cache.retry_after<=? AND market_cache.fetched_at<? RETURNING key')
    .bind(leaseKey,scheduledTime,now+55000,now,scheduledTime).first();
  if(!lease)return;
  try {
    await env.MARKET_REFRESH.plan();
    const lanes:[MarketLane,number][]=[...WORK_LANE_BUDGET];
    // Low-frequency metadata gets a separate reserved slot, never ahead of prices.
    lanes.push([Math.floor(scheduledTime/60000)%2 ? 'registry':'catalog',1]);
    // Start every lane before waiting for any provider. Persistent leases fence
    // duplicates; independent RPC invocations isolate CPU and response parsing.
    const running:Promise<unknown>[]=[];
    const providerCounts=new Map<string,number>();
    for(const [lane,count] of lanes)for(let i=0;i<count;i++){
      const excluded=[...providerCounts].filter(([provider,n])=>n>=(provider==='geckoterminal'?1:3)).map(([provider])=>provider);
      const work=await claimMarketWork(env.DB,lane,Date.now(),excluded);
      if(!work)break;
      const payload=JSON.parse(work.payload) as DurableMarketJob;
      if(payload.kind==='pool-source'||payload.kind==='pool-shard')providerCounts.set(payload.provider,(providerCounts.get(payload.provider)??0)+1);
      running.push(env.MARKET_REFRESH.work(work.id,work.lease_token).catch(()=>{}));
    }
    await Promise.all(running);
    await env.MARKET_REFRESH.health();
  } finally {
    await env.DB.prepare('UPDATE market_cache SET retry_after=0 WHERE key=? AND fetched_at=?').bind(leaseKey,scheduledTime).run();
  }
}
