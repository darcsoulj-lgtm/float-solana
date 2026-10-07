import { checkActiveMarketHealth } from './market-active-health';
import type { MarketEnvironment } from './market-overview-server';

export type MarketIncident = {id:string;code:string;opened_at:number;updated_at:number;recovered_at:number|null;notified_at:number|null};
export type MarketAlertBinding = {notify(event:{id:string;source:string;code:string;state:'failure'|'recovery';at:number}):Promise<void>};
// An optional private binding owns delivery. No arbitrary webhook destinations,
// new paid services, or implied notifications when no destination is configured.
export async function checkMarketWorkHealth(env: MarketEnvironment & {MARKET_ALERT?:MarketAlertBinding;MARKET_COLLECTION_SOURCE?:string}, now=Date.now()) {
  // Public publication age is not a substitute for the last successful
  // reference collection: pool publications can advance independently.
  const overdue=env.MARKET_COLLECTION_SOURCE && env.MARKET_COLLECTION_SOURCE!=='durable' ? {results:[]} : await env.DB.prepare("SELECT id,lane,lease_until,succeeded_at FROM market_work WHERE enabled=1 AND ((lane='references' AND COALESCE(succeeded_at,due_at)<?) OR (lease_until>0 AND lease_until<?)) ORDER BY due_at LIMIT 20")
    .bind(now-15*60000,now).all<{id:string;lane:string;lease_until:number;succeeded_at:number|null}>();
  for(const work of overdue.results) {
    const code=work.lease_until>0?'interrupted':'source_overdue';
    await env.DB.prepare('INSERT INTO market_incidents(id,code,opened_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,updated_at=excluded.updated_at,recovered_at=NULL,opened_at=CASE WHEN market_incidents.recovered_at IS NOT NULL THEN excluded.opened_at ELSE market_incidents.opened_at END,notified_at=CASE WHEN market_incidents.recovered_at IS NOT NULL THEN NULL ELSE market_incidents.notified_at END')
      .bind(work.id,code,now,now).run();
  }
  // The production fast/GitHub lanes have separate cache contracts from the
  // optional durable queue. Inspect them rather than assuming queue health.
  if(env.MARKET_COLLECTION_SOURCE){
    const active=await checkActiveMarketHealth(env,now);
    const failing=new Map(active.issues.map(issue=>[issue.source,issue]));
    const sources=['references','reference-history','supplies','volume','volume-collector','holders','activity','snapshot','snapshot-capacity','stock-comparison'];
    await env.DB.batch(sources.map(source=>{
      const issue=failing.get(source),id='active:'+source;
      return issue ? env.DB.prepare('INSERT INTO market_incidents(id,code,opened_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,updated_at=excluded.updated_at,recovered_at=NULL,opened_at=CASE WHEN market_incidents.recovered_at IS NOT NULL THEN excluded.opened_at ELSE market_incidents.opened_at END,notified_at=CASE WHEN market_incidents.recovered_at IS NOT NULL THEN NULL ELSE market_incidents.notified_at END').bind(id,issue.code,now,now)
        : env.DB.prepare('UPDATE market_incidents SET recovered_at=?,updated_at=?,notified_at=NULL WHERE id=? AND recovered_at IS NULL').bind(now,now,id);
    }));
  }
  const pending=await env.DB.prepare('SELECT * FROM market_incidents WHERE notified_at IS NULL ORDER BY updated_at LIMIT 20').all<MarketIncident>();
  // Queue-era incidents must not remain open when that collector is disabled.
  if(env.MARKET_COLLECTION_SOURCE && env.MARKET_COLLECTION_SOURCE!=='durable')await env.DB.prepare("UPDATE market_incidents SET recovered_at=?,updated_at=?,notified_at=NULL WHERE id NOT LIKE 'active:%' AND recovered_at IS NULL").bind(now,now).run();
  const count=await env.DB.prepare('SELECT COUNT(*) count FROM market_incidents WHERE recovered_at IS NULL').first<{count:number}>();
  if(!env.MARKET_ALERT) {
    if(pending.results.length)console.warn('Market incidents require an owner notification destination',{count:pending.results.length});
    return {open:count?.count??0,delivery:'not_configured' as const};
  }
  for(const incident of pending.results) {
    const state=incident.recovered_at?'recovery':'failure';
    // Stable delivery IDs let a receiver deduplicate retry after a crash.
    await env.MARKET_ALERT.notify({id:incident.id+':'+incident.opened_at+':'+state,source:incident.id,code:incident.code,state,at:incident.recovered_at??incident.opened_at});
    await env.DB.prepare('UPDATE market_incidents SET notified_at=? WHERE id=? AND updated_at=? AND recovered_at IS ?').bind(now,incident.id,incident.updated_at,incident.recovered_at).run();
  }
  return {delivered:pending.results.length,delivery:'configured' as const};
}
