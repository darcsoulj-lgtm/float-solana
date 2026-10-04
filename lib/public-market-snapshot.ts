import {backpackRegistry,registryTokens} from './backpack-registry';
import {readMarketOverview,type MarketEnvironment} from './market-overview-server';
import {publicMarketPayload} from './public-market-payload';
import type {MarketOverview} from './market-data';
import {AppError} from './validation';

export const PUBLIC_MARKET_SNAPSHOT_KEY='public-backpack-snapshot:v1';
export const PUBLIC_MARKET_SNAPSHOT_MAX_AGE_MS=5*60000;
// Storage/security ceilings, not a tested free-plan CPU or traffic capacity.
// D1 limits each row/string to 2MB; reserve 25% for row overhead and changes.
export const PUBLIC_MARKET_SNAPSHOT_MAX_BYTES=1500000;
export const PUBLIC_MARKET_SNAPSHOT_WARNING_BYTES=400000;

// Assembly time describes the prepared response, never the providers' original
// observation times. Only this scheduled writer assembles a public snapshot.
export function serializePublicMarketSnapshot(data:MarketOverview){
  const projected:MarketOverview={
    prices:data.prices,pools:data.pools,supplies:data.supplies,markets:data.markets,catalog:data.catalog,
    ...(data.registry?{registry:data.registry}:{}),...(data.totalBatches!==undefined?{totalBatches:data.totalBatches}:{}),
    ...(data.backpack?{backpack:data.backpack}:{}),...(data.history?{history:data.history}:{}),
    ...(data.tokenVolumes?{tokenVolumes:data.tokenVolumes}:{}),...(data.issuerComparisonEnabled?{issuerComparisonEnabled:true}:{}),
    ...(data.circulation?{circulation:data.circulation}:{}),...(data.valuations?{valuations:data.valuations}:{}),...(data.ondoVolume?{ondoVolume:data.ondoVolume}:{}),
  };
  if([projected.prices,projected.pools,projected.supplies,projected.markets,projected.catalog].some(value=>!value||typeof value!=='object'||!('data' in value)))throw Error('Invalid public market sources');
  const text=JSON.stringify(publicMarketPayload(projected));
  if(new TextEncoder().encode(text).byteLength>PUBLIC_MARKET_SNAPSHOT_MAX_BYTES || /"(?:wallet[^"\\]*|session[^"\\]*|private[^"\\]*|holdings|member_id)"\s*:/i.test(text))throw Error('Invalid public market snapshot');
  return text;
}
export async function publishPublicMarketSnapshot(env:MarketEnvironment,now=Date.now()){
  const registry=await backpackRegistry(env.DB,()=>{},env.SOLANA_RPC_URL,fetch,now,true);
  const data=await readMarketOverview(env,registryTokens(registry),registry,'backpack');
  const text=serializePublicMarketSnapshot(data);
  await env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at WHERE market_cache.fetched_at<=excluded.fetched_at')
    .bind(PUBLIC_MARKET_SNAPSHOT_KEY,text,now).run();
}

// SQLite checks syntax/shape while returning the string. The Worker does not
// deserialize, merge thousands of observations, or collect external providers.
export async function readPublicMarketSnapshot(database:D1Database,now=Date.now()):Promise<string>{
  const row=await database.prepare(`SELECT payload,fetched_at,length(CAST(payload AS BLOB)) payload_bytes,CASE WHEN json_valid(payload) THEN
    json_type(payload,'$.prices')='object' AND json_type(payload,'$.pools')='object' AND
    json_type(payload,'$.supplies')='object' AND json_type(payload,'$.markets')='object' AND
    json_type(payload,'$.catalog')='object' AND
    json_type(payload,'$.prices.data') IN ('object','null') AND json_type(payload,'$.pools.data') IN ('object','null') AND
    json_type(payload,'$.supplies.data') IN ('object','null') AND json_type(payload,'$.markets.data') IN ('object','null') AND
    json_type(payload,'$.catalog.data') IN ('array','null') ELSE 0 END valid FROM market_cache WHERE key=?`)
    .bind(PUBLIC_MARKET_SNAPSHOT_KEY).first<{payload:string|null;fetched_at:number;payload_bytes:number;valid:number}>();
  if(!row?.payload || row.valid!==1 || !Number.isSafeInteger(row.fetched_at) || row.fetched_at<=0 || row.fetched_at>now || now-row.fetched_at>PUBLIC_MARKET_SNAPSHOT_MAX_AGE_MS || !Number.isSafeInteger(row.payload_bytes) || row.payload_bytes>PUBLIC_MARKET_SNAPSHOT_MAX_BYTES)throw new AppError('Market data is temporarily unavailable. Please try again.',503);
  return row.payload;
}
