import { backpackHistoryKey, fetchBackpackReference, retainBackpackReferences } from './backpack-reference';
import { SUPPLY_WORK_BATCH_SIZE } from './market-freshness';
import { backpackRegistry, discoverBackpackListings, REGISTRY_KEY, registryTokens } from './backpack-registry';
import { marketGlobalKeys, type MarketEnvironment } from './market-overview-server';
import { fetchBackpackMarkets, fetchCatalog, normalizeBackpackChanges, parsePools, stonkfunPoolRegistry, type Pool } from './market-data';
import { parseProviderPools, resolvePoolSources, type PoolProvider, POOL_PROVIDERS } from './pool-provider-adapters';
import { poolProviderRequest } from './pool-provider-fetch';
import { poolWorkRequest } from './pool-work-plan';
import { readPoolInventory, poolObservationKey } from './pool-inventory';
import { retainPoolValues, POOL_RETAIN_MS } from './pool-reconciliation';
import { comparablePoolVolume, qualifiedPoolVolume } from './pool-volume-policy';
import { POOL_POLICY_VERSION, type StonkfunPoolIdentity } from './stock-pools';
import { fetchSupplies } from './token-supply';
import { supplyObservationKey } from './market-source-observations';
import { MarketWorkError, type MarketWrite, type DurableMarketJob } from './market-work-store';
import {marketCacheRows} from './market-cache';
import type { StockToken } from './tokens';

export const poolSourceKey = (mint: string, provider: PoolProvider, discovery: boolean) => `pool-source-v1:${provider}:${discovery ? 'discovery' : 'refresh'}:${mint}`;
type SourceEvidence = { cursor: number; attemptedAt: number; pools: Pool[]; issues: {address: string; code: Pool['volumeIssue']; rawVolume?: number}[] };
const json = async <T>(db: D1Database, key: string, fallback: T): Promise<T> => {
  const row = await db.prepare('SELECT payload FROM market_cache WHERE key=?').bind(key).first<{payload:string|null}>();
  return row?.payload ? JSON.parse(row.payload) as T : fallback;
};
const write = (key: string, value: unknown, fetchedAt: number): MarketWrite => ({key, payload:JSON.stringify(value), fetchedAt});

// The transport is bounded before parsing, including RPC responses. Provider
// destinations and identity/volume eligibility still belong to shared adapters.
export function boundedMarketFetch(fetcher: typeof fetch, signal: AbortSignal): typeof fetch {
  return async (input, init) => {
    const response = await fetcher(input, {...init, signal:AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]), redirect:'manual'});
    if (!response.ok) return response;
    const reader = response.body?.getReader();
    if (!reader) throw new MarketWorkError('invalid_response');
    const parts: Uint8Array[] = []; let size = 0;
    try { while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 400000) throw new MarketWorkError('invalid_response');
      parts.push(part.value);
    } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return new Response(new Blob(parts as BlobPart[]), {status:response.status, headers:response.headers});
  };
}
function officialIdentities(known: readonly Pool[], verified: readonly StockToken[]): StonkfunPoolIdentity[] {
  const mints = new Set(verified.map(t => t.mint));
  return known.filter(p => p.origin === 'stonkfun' && p.baseMint && p.quoteMint && mints.has(p.baseMint) !== mints.has(p.quoteMint)).map(p => ({address:p.address, stockMint:(mints.has(p.baseMint!) ? p.baseMint : p.quoteMint)!, launchMint:(mints.has(p.baseMint!) ? p.quoteMint : p.baseMint)!, symbol:p.quote}));
}
const belongs = (pool: Pool, mint: string) => pool.baseMint === mint || pool.quoteMint === mint;
export async function executeMarketWork(env: MarketEnvironment, job: DurableMarketJob, fetcher: typeof fetch = fetch): Promise<{writes:MarketWrite[]; wakeMint?:string | string[]}> {
  const signal = AbortSignal.timeout(20000), bounded = boundedMarketFetch(fetcher, signal);
  const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, bounded, Date.now(), true);
  const tokens = registryTokens(registry).filter(t => t.issuer === 'backpack');
  const byMint = new Map(tokens.map(t => [t.mint, t]));
  if (job.kind === 'launch-registry') return {writes:[write('pool-launch-identities:v1', await stonkfunPoolRegistry(bounded,tokens),Date.now())]};
  if (job.kind === 'registry') return {writes:[write(REGISTRY_KEY, await discoverBackpackListings(registry.additions, env.SOLANA_RPC_URL, bounded), Date.now())]};
  if (job.kind === 'references' || job.kind === 'catalog') {
    const keys = await marketGlobalKeys(tokens);
    let value;
    try { value = job.kind === 'references' ? await fetchBackpackMarkets(bounded, tokens, {requireExternal:true}) : await fetchCatalog(bounded, tokens); }
    catch (error) {
      if (error instanceof Error && error.message === 'Backpack external references unavailable') throw new MarketWorkError('invalid_response', 5 * 60000);
      throw error;
    }
    if (!Array.isArray(value) && !Object.values(value).some(row => row.externalPrice !== null)) throw new MarketWorkError('invalid_response');
    if (job.kind === 'references' && !Array.isArray(value)) {
      const row = await env.DB.prepare('SELECT payload,fetched_at FROM market_cache WHERE key=?').bind(keys.backpack).first<{payload:string|null;fetched_at:number}>();
      value = retainBackpackReferences(value, {data: row?.payload ? normalizeBackpackChanges(JSON.parse(row.payload)) : null, fetchedAt: row?.fetched_at ?? null, stale:true,error:null}, Date.now());
    }
    return {writes:[write(job.kind === 'references' ? keys.backpack : keys.catalog, value, Date.now())]};
  }
  if (job.kind === 'supplies') {
    if (!Array.isArray(job.mints) || !job.mints.length || job.mints.length > SUPPLY_WORK_BATCH_SIZE || new Set(job.mints).size !== job.mints.length) throw new MarketWorkError('invalid_response');
    const selected = job.mints.map(mint => { const t = byMint.get(mint); if (!t) throw new MarketWorkError('invalid_response'); return t; });
    const values = await fetchSupplies(env.SOLANA_RPC_URL, bounded, selected);
    if (selected.some(t => !values[t.symbol])) throw new MarketWorkError('invalid_response');
    return {writes:selected.map(t => write(supplyObservationKey(t), values[t.symbol], values[t.symbol].timestamp))};
  }
  if(job.kind==='pool-shard') {
    if(!['dexscreener','geckoterminal'].includes(job.provider)||!Array.isArray(job.addresses)||!job.addresses.length||job.addresses.length>30||new Set(job.addresses).size!==job.addresses.length||job.addresses.some(a=>!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)))throw new MarketWorkError('invalid_response');
    const key=await poolShardKey(job.provider,job.addresses);
    // Obsolete partitions are retired when discovery changes the address set.
    const mapped=await env.DB.prepare(`SELECT COUNT(*) AS n FROM market_pool_shards WHERE provider=? AND source_key=? AND address IN (${job.addresses.map(()=>'?').join(',')})`).bind(job.provider,key,...job.addresses).first<{n:number}>();
    if(mapped?.n!==job.addresses.length)return {writes:[]};
    const url=job.provider==='dexscreener'?'https://api.dexscreener.com/latest/dex/pairs/solana/'+job.addresses.join(','):'https://api.geckoterminal.com/api/v2/networks/solana/pools/multi/'+job.addresses.join(',');
    const raw=await poolProviderRequest(env.DB,bounded,signal)(job.provider,url);
    const now=Date.now();let data:Record<string,Pool[]>;
    const official=await json<StonkfunPoolIdentity[]>(env.DB,'pool-launch-identities:v1',[]);
    try{
      if(job.provider==='dexscreener'){
        const pairs=(raw as {pairs?:unknown}).pairs;if(!Array.isArray(pairs))throw Error('Invalid pairs');
        data=parsePools(pairs,tokens,tokens,official);
      }else data=parseProviderPools('geckoterminal',raw,tokens,tokens,official,now);
    }catch{throw new MarketWorkError('invalid_response');}
    const allowed=new Set(job.addresses);
    for(const symbol of Object.keys(data))data[symbol]=data[symbol].filter(p=>allowed.has(p.address)).map(p=>({...p,source:job.provider,observedAt:now}));
    return {writes:[write(key,{data,attemptedAt:now},now)],wakeMint:tokens.filter(t=>data[t.symbol]?.length).map(t=>t.mint)};
  }
  const token = byMint.get(job.mint);
  if (!token) throw new MarketWorkError('invalid_response');
  if (job.kind === 'reference-history') {
    const value = await fetchBackpackReference(token, bounded);
    const previous = await json<import('./market-data').BackpackMarket | null>(env.DB, backpackHistoryKey(token.mint), null);
    if (previous?.externalObservedAt && value.externalObservedAt! < previous.externalObservedAt) throw new MarketWorkError('invalid_response', 60 * 60000);
    return {writes:[write(backpackHistoryKey(token.mint), value, Date.now())]};
  }
  const known = await readPoolInventory(env.DB, [token]);
  const current = await json<Pool[]>(env.DB, poolObservationKey(token), []);
  if (job.kind === 'pool-publish') {
    const sourceKeys=POOL_PROVIDERS.flatMap(provider=>[poolSourceKey(token.mint,provider,false),poolSourceKey(token.mint,provider,true),`pool-evidence:${provider}:${token.mint}`]);
    const sourceRows=await marketCacheRows(env.DB,sourceKeys);
    const sources=sourceKeys.flatMap(key=>{const row=sourceRows.get(key);if(!row?.payload)return [];const value=JSON.parse(row.payload) as SourceEvidence|Pool[];return Array.isArray(value)?value:value.pools;});
    const now = Date.now();
    const shardKeys=new Set<string>();
    for(let offset=0;offset<known.length;offset+=80){
      const addresses=known.slice(offset,offset+80).map(p=>p.address);if(!addresses.length)continue;
      const rows=await env.DB.prepare(`SELECT DISTINCT source_key FROM market_pool_shards WHERE address IN (${addresses.map(()=>'?').join(',')})`).bind(...addresses).all<{source_key:string}>();
      rows.results.forEach(r=>shardKeys.add(r.source_key));
    }
    const shardPools:Pool[]=[];
    const allKeys=[...shardKeys];
    for(let offset=0;offset<allKeys.length;offset+=80){
      const keys=allKeys.slice(offset,offset+80);if(!keys.length)continue;
      const rows=await env.DB.prepare(`SELECT json_extract(payload,?) AS payload FROM market_cache WHERE key IN (${keys.map(()=>'?').join(',')})`).bind('$.data.'+JSON.stringify(token.symbol),...keys).all<{payload:string|null}>();
      for(const row of rows.results)if(row.payload)shardPools.push(...JSON.parse(row.payload) as Pool[]);
    }
    const evidence = [...sources, ...shardPools];
    const candidates = evidence.filter(p => belongs(p, token.mint) && p.observedAt && p.observedAt <= now && now - p.observedAt <= POOL_RETAIN_MS);
    const identities = [...new Map([...known, ...current, ...candidates].map(p => [p.address, p])).values()];
    let pools = retainPoolValues(resolvePoolSources(candidates, identities, token, now), current, token, now);
    pools = pools.map(p => qualifiedPoolVolume(p) && (!p.observedAt || now - p.observedAt > 300000) ? {...p, delayed:true} : p);
    if (!candidates.length) throw new MarketWorkError('invalid_response');
    const identityOnly = identities.map(p => ({...p, unavailable:true, price:null,change24h:null,volume24h:null,liquidity:null,observedAt:undefined,volumeIssue:undefined}));
    const priorIdentities=new Set(known.map(p=>p.address));
    return {writes:[write(poolObservationKey(token), pools, now), ...(identityOnly.some(p=>!priorIdentities.has(p.address))?[write(`pool-inventory-${POOL_POLICY_VERSION}:${token.mint}`, identityOnly, now)]:[])]};
  }
  if (!POOL_PROVIDERS.includes(job.provider)) throw new MarketWorkError('invalid_response');
  const key = poolSourceKey(token.mint, job.provider, job.discovery);
  const previous = await json<SourceEvidence>(env.DB, key, {cursor:0,attemptedAt:0,pools:[],issues:[]});
  const plan = poolWorkRequest(job.provider, token.mint, known, job.discovery, previous.cursor);
  if (!plan) return {writes:[]};
  const request = poolProviderRequest(env.DB, bounded, signal);
  let raw = await request(job.provider, plan.url);
  if (job.provider === 'dexscreener' && raw && typeof raw === 'object' && 'pairs' in raw) raw = (raw as {pairs:unknown}).pairs;
  if (job.provider === 'dexscreener' && !Array.isArray(raw)) throw new MarketWorkError('invalid_response');
  const now = Date.now();
  const official = [...officialIdentities(known, tokens), ...await json<StonkfunPoolIdentity[]>(env.DB,'pool-launch-identities:v1',[])];
  let parsed: Record<string, Pool[]>;
  try { parsed = job.provider === 'dexscreener' ? parsePools(raw, [token], tokens, official) : parseProviderPools(job.provider, raw, [token], tokens, official, now); }
  catch { throw new MarketWorkError('invalid_response'); }
  const fresh = (parsed[token.symbol] ?? []).map(p => ({...p,source:job.provider,observedAt:now}));
  const pools = new Map(previous.pools.filter(p => p.observedAt && now - p.observedAt <= POOL_RETAIN_MS).map(p => [p.address, p]));
  for (const p of fresh) pools.set(p.address, p);
  const issues: SourceEvidence['issues'] = fresh.filter(p => !qualifiedPoolVolume(p)).map(p => ({address:p.address, code:comparablePoolVolume(p) ? 'source_null' : 'metric_unqualified'}));
  if (job.provider === 'raydium') {
    const data = (raw as {data?:unknown}).data;
    const rows = Array.isArray(data) ? data : (data as {data?:unknown[]})?.data ?? [];
    for (const issue of issues) {
      const row = rows.find(r => r?.id === issue.address), amount = Number(row?.day?.volume);
      if (row?.day?.volume != null && Number.isFinite(amount) && amount >= 0) issue.rawVolume = amount;
    }
  }
  // Empty successful pages advance discovery but never certify zero volume.
  return {writes:[write(key, {cursor:plan.next,attemptedAt:now,pools:[...pools.values()],issues}, now)], ...(fresh.length ? {wakeMint:token.mint} : {})};
}
export async function poolShardKey(provider:'dexscreener'|'geckoterminal',addresses:readonly string[]) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(addresses.join(',')));
  return `pool-shard-source-v1:${provider}:`+Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
