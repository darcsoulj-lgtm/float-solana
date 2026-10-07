import { readStockVolume } from './stock-volume-job';
import { backpackRegistry, registryTokens } from './backpack-registry';
import { backpackHistoryKey, BACKPACK_REFERENCE_RETAIN_MS } from './backpack-reference';
import { birdeyeTokenVolume, birdeyeVolumeKey } from './birdeye-volume';
import { marketCacheRows, type CacheRow } from './market-cache';
import { readMarketOverview, type MarketEnvironment } from './market-overview-server';
import { SUPPLY_MAX_AGE_MS } from './market-freshness';
import { holderRegistry } from './issuer-holder-registry';
import { readHoldingWallets } from './issuer-holders-server';
import { readTradingActivity } from './trading-activity-server';
import type { HoldingWallets } from './issuer-holders';
import type { MarketOverview } from './market-data';
import type { StockToken } from './tokens';
import { PUBLIC_MARKET_SNAPSHOT_KEY, PUBLIC_MARKET_SNAPSHOT_MAX_AGE_MS, PUBLIC_MARKET_SNAPSHOT_WARNING_BYTES } from './public-market-snapshot';

export const ACTIVE_HEALTH_KEY = 'market-active-health:v1';
const BASELINE_KEY = 'market-health-listings:v1';
const HOUR = 3600000;
const NEW_LISTING_GRACE = HOUR;
export type ActiveHealthIssue = {source:string;code:string;affected:number};
export type ActiveHealthCoverage = {references:number;supplies:number;volume:number;tracked:number};
export type ActiveHealthSummary = {version:1;checkedAt:number;status:'ok'|'degraded';issues:ActiveHealthIssue[];warnings?:ActiveHealthIssue[];coverage?:ActiveHealthCoverage};
const recent = (at: number | null | undefined, age: number, now: number) => Number.isSafeInteger(at) && at! > 0 && at! <= now + 60000 && now - at! <= age;

// Observation age and collector age are distinct: an unchanged weekend candle
// is healthy if it is still valid and its scheduled history check is running.
export function activeHealthIssues(input: {
  market:MarketOverview; tokens:readonly StockToken[]; controls:Map<string,CacheRow>;
  firstSeen:Record<string,number>; holder:HoldingWallets|undefined; holderScope:{registryHash:string;mints:string[]};
  activityAt:number|null; volumeEnabled:boolean; stockComparison?:{status:string}; now:number;
}): ActiveHealthIssue[] {
  const {market,tokens,controls,firstSeen,holder,holderScope,activityAt,volumeEnabled,now}=input;
  const eligible=tokens.filter(t=>t.issuer==='backpack' && now-(firstSeen[t.mint]??now)>=NEW_LISTING_GRACE);
  const issues:ActiveHealthIssue[]=[];
  let references=0,historyChecks=0,supplies=0,volumes=0;
  for(const token of eligible){
    const quote=market.backpack?.data?.[token.symbol];
    const observed=quote?.externalObservedAt??market.backpack?.asOf?.[token.symbol]??market.backpack?.fetchedAt;
    const priceValid=quote?.externalPrice!=null && Number.isFinite(quote.externalPrice) && quote.externalPrice>0;
    const historical=quote?.externalBasis==='hourly-history';
    if(!priceValid || !recent(observed,historical?BACKPACK_REFERENCE_RETAIN_MS:24*HOUR,now))references++;
    else if(!recent(observed,15*60000,now) && !recent(controls.get(backpackHistoryKey(token.mint))?.fetched_at,2*HOUR,now))historyChecks++;
    const supply=market.supplies.data?.[token.symbol];
    const supplyTime=market.supplies.asOf?.[token.symbol]??market.supplies.fetchedAt;
    if(!supply || !Number.isFinite(supply.supply) || supply.supply<0 || !recent(supplyTime,SUPPLY_MAX_AGE_MS+10*60000,now))supplies++;
    const volume=birdeyeTokenVolume(market,token,now);
    // Never-indexed tokens (currently NVDA) are disclosed coverage, not a
    // provider outage. A previously collected value aging out is actionable.
    const prior=controls.get(birdeyeVolumeKey(token.mint));
    if(volumeEnabled && ((volume && !recent(volume.collectedAt,(market.tokenVolumes?.intervalMs??14*HOUR)+2*HOUR,now)) || (!volume && !!prior?.payload && prior.fetched_at>0)))volumes++;
  }
  if(references)issues.push({source:'references',code:'reference_coverage_missing',affected:references});
  if(historyChecks)issues.push({source:'reference-history',code:'history_collection_overdue',affected:historyChecks});
  if(supplies)issues.push({source:'supplies',code:'supply_collection_overdue',affected:supplies});
  if(volumes)issues.push({source:'volume',code:'volume_coverage_overdue',affected:volumes});
  if(volumeEnabled && eligible.length && !eligible.some(t=>birdeyeTokenVolume(market,t,now)))issues.push({source:'volume',code:'volume_coverage_overdue',affected:eligible.length});
  if(volumeEnabled){
    let scheduler: {status?:string;checkedAt?:number}|null=null;
    try{scheduler=JSON.parse(controls.get('birdeye-schedule:v1')?.payload??'null');}catch{/* Corrupt private state is an unavailable collector. */}
    if(eligible.length && (!recent(scheduler?.checkedAt,15*60000,now) || scheduler?.status!=='ok'))issues.push({source:'volume-collector',code:scheduler?.status==='budget_exhausted'?'volume_budget_exhausted':'volume_collector_unhealthy',affected:1});
  }
  const oldestKnown=Math.min(...Object.values(firstSeen).filter(at=>recent(at,365*24*HOUR,now)));
  const settled=Number.isFinite(oldestKnown)&&now-oldestKnown>=NEW_LISTING_GRACE;
  const allListingsSettled=tokens.filter(t=>t.issuer==='backpack').every(t=>now-(firstSeen[t.mint]??now)>=NEW_LISTING_GRACE);
  if(settled && (!holder || !recent(holder.checkedAt,30*HOUR,now)))issues.push({source:'holders',code:'holder_collection_overdue',affected:1});
  else if(settled && allListingsSettled && (holder?.registryHash!==holderScope.registryHash || holder.tokens!==holderScope.mints.length))issues.push({source:'holders',code:'holder_registry_mismatch',affected:1});
  const publicSnapshot=controls.get(PUBLIC_MARKET_SNAPSHOT_KEY);
  if(!publicSnapshot?.payload || publicSnapshot.fetched_at>now || !recent(publicSnapshot.fetched_at,PUBLIC_MARKET_SNAPSHOT_MAX_AGE_MS,now))issues.push({source:'snapshot',code:'snapshot_publication_overdue',affected:1});
  const prepared=publicSnapshot?.payload;
  if(prepared && new TextEncoder().encode(prepared).byteLength>=PUBLIC_MARKET_SNAPSHOT_WARNING_BYTES)issues.push({source:'snapshot-capacity',code:'snapshot_payload_large',affected:1});
  if(settled && !recent(activityAt,24*HOUR+(market.tokenVolumes?.intervalMs??2*HOUR)+2*HOUR,now))issues.push({source:'activity',code:'activity_recording_overdue',affected:1});
  if(input.stockComparison && input.stockComparison.status!=='daily')issues.push({source:'stock-comparison',code:'stock_comparison_overdue',affected:1});
  return issues;
}

// A successful scheduled fetch can return an older provider observation.
// Keep that visible as delayed data, without claiming our collector stopped.
export function activeHealthWarnings(input: Parameters<typeof activeHealthIssues>[0]): ActiveHealthIssue[] {
  if (!input.volumeEnabled) return [];
  const age = (input.market.tokenVolumes?.intervalMs ?? 14*HOUR) + 2*HOUR;
  const affected = input.tokens.filter(token => {
    if (token.issuer !== 'backpack' || input.now-(input.firstSeen[token.mint]??input.now)<NEW_LISTING_GRACE) return false;
    const volume = birdeyeTokenVolume(input.market, token, input.now);
    return volume && recent(volume.collectedAt, age, input.now) && !recent(volume.observedAt, age, input.now);
  }).length;
  return affected ? [{source:'volume',code:'volume_source_delayed',affected}] : [];
}

export async function checkActiveMarketHealth(env:MarketEnvironment & {STOCK_VOLUME_ENABLED?:string},now=Date.now()):Promise<ActiveHealthSummary>{
  const registry=await backpackRegistry(env.DB,()=>{},env.SOLANA_RPC_URL,fetch,now,true);
  const tokens=registryTokens(registry),backpack=tokens.filter(t=>t.issuer==='backpack');
  const controls=await marketCacheRows(env.DB,[BASELINE_KEY,'birdeye-schedule:v1','public-backpack-snapshot:v1',...backpack.flatMap(t=>[backpackHistoryKey(t.mint),birdeyeVolumeKey(t.mint)])]);
  let previous:Record<string,number>={};
  try{previous=JSON.parse(controls.get(BASELINE_KEY)?.payload??'{}');}catch{/* Rebuild a corrupt baseline without fabricating old coverage. */}
  const firstSeen=Object.fromEntries(backpack.map(t=>[t.mint,recent(previous?.[t.mint],365*24*HOUR,now)?previous[t.mint]:now]));
  if(JSON.stringify(firstSeen)!==JSON.stringify(previous))await env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(BASELINE_KEY,JSON.stringify(firstSeen),now).run();
  const [market,holders,activity,scopes,stockComparison]=await Promise.all([readMarketOverview(env,tokens,registry,'backpack'),readHoldingWallets(env.DB,now),readTradingActivity(env.DB,now),holderRegistry(tokens),env.STOCK_VOLUME_ENABLED==='1'?readStockVolume(env.DB,now):Promise.resolve(undefined)]);
  const input={market,tokens,controls,firstSeen,holder:holders.issuers.find(row=>row.issuer==='backpack'),holderScope:scopes.find(row=>row.issuer==='backpack')!,activityAt:activity.at(-1)?.capturedAt??null,volumeEnabled:env.BIRDEYE_VOLUME_ENABLED==='1',stockComparison,now};
  const issues=activeHealthIssues(input),warnings=activeHealthWarnings(input);
  const unique=[...new Map(issues.map(i=>[i.source,i])).values()];
  const coverage={references:backpack.filter(t=>{const row=market.backpack?.data?.[t.symbol];return row?.externalPrice!=null && Number.isFinite(row.externalPrice) && row.externalPrice>0;}).length,supplies:backpack.filter(t=>!!market.supplies.data?.[t.symbol]).length,volume:backpack.filter(t=>!!birdeyeTokenVolume(market,t,now)).length,tracked:backpack.length};
  const summary:ActiveHealthSummary={version:1,checkedAt:now,status:unique.length?'degraded':'ok',issues:unique,...(warnings.length?{warnings}:{}),coverage};
  await env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(ACTIVE_HEALTH_KEY,JSON.stringify(summary),now).run();
  return summary;
}

// Safe for a publication monitor: fixed source categories and counts only.
// Stale/missing monitoring is itself a failure, never a clean health result.
export async function readActiveMarketHealth(database:D1Database,now=Date.now()){
  const row=await database.prepare('SELECT payload FROM market_cache WHERE key=?').bind(ACTIVE_HEALTH_KEY).first<{payload:string|null}>();
  try{
    const value=JSON.parse(row?.payload??'null') as ActiveHealthSummary|null;
    const sources=['references','reference-history','supplies','volume','volume-collector','holders','activity','snapshot','snapshot-capacity','stock-comparison'];
    const codes=['reference_coverage_missing','history_collection_overdue','supply_collection_overdue','volume_coverage_overdue','volume_budget_exhausted','volume_collector_unhealthy','holder_collection_overdue','holder_registry_mismatch','activity_recording_overdue','snapshot_publication_overdue','snapshot_payload_large','stock_comparison_overdue'];
    if(value?.version===1 && ['ok','degraded'].includes(value.status) && value.status===(value.issues?.length?'degraded':'ok') && recent(value.checkedAt,15*60000,now) && Array.isArray(value.issues) && value.issues.length<=11 && value.issues.every(i=>sources.includes(i.source)&&codes.includes(i.code)&&Number.isSafeInteger(i.affected)&&i.affected>0) &&
        (value.warnings===undefined || (Array.isArray(value.warnings) && value.warnings.length<=1 && value.warnings.every(i=>i.source==='volume'&&i.code==='volume_source_delayed'&&Number.isSafeInteger(i.affected)&&i.affected>0)))){
      const c=value.coverage,coverage=c && Number.isSafeInteger(c.tracked)&&c.tracked>0&&[c.references,c.supplies,c.volume].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=c.tracked)?{references:c.references,supplies:c.supplies,volume:c.volume,tracked:c.tracked}:undefined;
      return{status:value.issues.length?'degraded':'ok',checkedAt:value.checkedAt,issues:value.issues.map(({source,code,affected})=>({source,code,affected})),...(value.warnings?.length?{warnings:value.warnings.map(({source,code,affected})=>({source,code,affected}))}:{}),...(coverage?{coverage}:{})};
    }
  }catch{/* No private state or raw error text is exposed. */}
  return{status:'unavailable',checkedAt:null,issues:[{source:'monitor',code:'monitor_overdue',affected:1}]};
}
