import { SourceHttpError } from './market-data';
import type { PoolProvider } from './pool-provider-adapters';

export type MarketLane = 'references' | 'supplies' | 'refresh' | 'backup' | 'discovery' | 'publication' | 'catalog' | 'registry';
export type DurableMarketJob =
  | { kind: 'references' }
  | { kind: 'reference-history'; mint: string }
  | { kind: 'catalog' }
  | { kind: 'registry' }
  | { kind: 'launch-registry' }
  | { kind: 'supplies'; mints: string[] }
  | { kind: 'pool-source'; mint: string; provider: PoolProvider; discovery: boolean }
  | { kind: 'pool-shard'; provider:'dexscreener'|'geckoterminal'; addresses:string[] }
  | { kind: 'pool-publish'; mint: string };
export type MarketWrite = { key: string; payload: string; fetchedAt: number };
export type MarketFailure = 'throttled' | 'timeout' | 'provider_http' | 'invalid_response' | 'request_budget' | 'provider_cooldown' | 'internal';
export class MarketWorkError extends Error {
  constructor(public code: MarketFailure, public retryAfterMs = 30000, message: string = code) { super(message); }
}
export function marketFailure(error: unknown): { code: MarketFailure; retryAfterMs: number } {
  if (error instanceof MarketWorkError) return error;
  if (error instanceof SourceHttpError) return { code: error.status === 429 ? 'throttled' : 'provider_http', retryAfterMs: error.retryAfterMs };
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return { code: 'timeout', retryAfterMs: 30000 };
  if (error instanceof SyntaxError) return {code:'invalid_response',retryAfterMs:30000};
  return { code: 'internal', retryAfterMs: 30000 };
}
export type MarketWork = {
  id: string; lane: MarketLane; payload: string; scope: string; interval_ms: number;
  due_at: number; lease_until: number; lease_token: string; attempts: number;
  started_at: number | null; succeeded_at: number | null; published_at: number | null;
};
export type WorkDefinition = { id: string; lane: MarketLane; job: DurableMarketJob; interval: number; priority?: number };
export async function seedMarketWork(db: D1Database, scope: string, definitions: WorkDefinition[], now: number) {
  // Planning only runs when verified membership of the registry changes.
  for (let offset = 0; offset < definitions.length; offset += 40) await db.batch(definitions.slice(offset, offset + 40).map(d => db.prepare(
    'INSERT INTO market_work(id,lane,payload,scope,interval_ms,due_at,priority) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,scope=excluded.scope,enabled=1,interval_ms=excluded.interval_ms,priority=excluded.priority WHERE market_work.scope<>excluded.scope OR market_work.enabled=0 OR market_work.interval_ms<>excluded.interval_ms OR market_work.priority<>excluded.priority OR market_work.payload<>excluded.payload',
  ).bind(d.id, d.lane, JSON.stringify(d.job), scope, d.interval, now, d.priority ?? 0)));
}
export async function claimMarketWork(db: D1Database, lane: MarketLane, now: number, excludedProviders: readonly string[] = []): Promise<MarketWork | null> {
  const token = crypto.randomUUID();
  const exclusions=excludedProviders.length ? ` AND (json_extract(payload,'$.provider') IS NULL OR json_extract(payload,'$.provider') NOT IN (${excludedProviders.map(()=>'?').join(',')}))` : '';
  return db.prepare(
    `UPDATE market_work SET lease_token=?,lease_until=?,started_at=? WHERE id=(SELECT id FROM market_work WHERE enabled=1 AND lane=? AND due_at<=? AND lease_until<=? AND NOT EXISTS(SELECT 1 FROM market_cache c WHERE c.key='provider-cooldown:'||json_extract(market_work.payload,'$.provider') AND c.retry_after>?)${exclusions} ORDER BY due_at ASC,priority DESC,id ASC LIMIT 1) AND lease_until<=? RETURNING *`,
  ).bind(token, now + 45000, now, lane, now, now, now, ...excludedProviders, now).first<MarketWork>();
}
const fence = 'EXISTS(SELECT 1 FROM market_work WHERE id=? AND enabled=1 AND lease_token=? AND lease_until>?)';
export async function completeMarketWork(db: D1Database, work: MarketWork, writes: MarketWrite[], now: number, wakeMint?: string | string[]) {
  // D1 batch is transactional. Fencing is in every write, not a preflight read:
  // an expired worker cannot overwrite a new lease owner's canonical data.
  if (writes.length > 16 || writes.some(w => !Number.isSafeInteger(w.fetchedAt) || w.fetchedAt <= 0 || w.fetchedAt > now + 60000 || w.payload.length > 100000)) throw new MarketWorkError('invalid_response');
  const statements = writes.map(w => db.prepare(
    `INSERT INTO market_cache(key,payload,fetched_at,retry_after) SELECT ?,?,?,0 WHERE ${fence} ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=0 WHERE market_cache.fetched_at<=excluded.fetched_at`,
  ).bind(w.key, w.payload, w.fetchedAt, work.id, work.lease_token, now));
  const publicPublication=writes.some(w=>/^(pool-token-|backpack-tickers-v1:|backpack-catalog-v2:|supply-token-v1:|backpack-verified-listings-v1$)/.test(w.key));
  const wake=typeof wakeMint==='string'?[wakeMint]:wakeMint??[];
  if(wake.length)statements.push(db.prepare(
    `UPDATE market_work SET due_at=? WHERE id IN (${wake.map(()=>'?').join(',')}) AND enabled=1 AND due_at>? AND ${fence}`,
  ).bind(now,...wake.map(m=>'publish:'+m),now,work.id,work.lease_token,now));
  statements.push(db.prepare(
    `UPDATE market_incidents SET recovered_at=?,updated_at=?,notified_at=NULL WHERE id=? AND recovered_at IS NULL AND ${fence}`,
  ).bind(now, now, work.id, work.id, work.lease_token, now));
  statements.push(db.prepare(
    'UPDATE market_work SET due_at=?,lease_until=0,lease_token=NULL,attempts=0,failure_code=NULL,succeeded_at=?,published_at=CASE WHEN ? THEN ? ELSE published_at END WHERE id=? AND enabled=1 AND lease_token=? AND lease_until>? RETURNING id',
  ).bind(now + work.interval_ms, now, publicPublication ? 1 : 0, now, work.id, work.lease_token, now));
  const result = await db.batch(statements);
  return result[result.length - 1].results.length > 0;
}
export async function failMarketWork(db: D1Database, work: MarketWork, error: unknown, now: number) {
  const failure = marketFailure(error);
  const backoff = Math.max(failure.retryAfterMs, Math.min(30 * 60000, 30000 * 2 ** Math.min(work.attempts, 6)));
  // Persist only classifications/timestamps, never response bodies or credentials.
  await db.batch([
    db.prepare(`INSERT INTO market_incidents(id,code,opened_at,updated_at) SELECT ?,?,?,? WHERE ${fence} ON CONFLICT(id) DO UPDATE SET code=excluded.code,updated_at=excluded.updated_at,opened_at=CASE WHEN market_incidents.recovered_at IS NOT NULL THEN excluded.opened_at ELSE market_incidents.opened_at END,recovered_at=NULL,notified_at=CASE WHEN market_incidents.recovered_at IS NOT NULL THEN NULL ELSE market_incidents.notified_at END`)
      .bind(work.id, failure.code, now, now, work.id, work.lease_token, now),
    db.prepare('UPDATE market_work SET due_at=?,lease_until=0,lease_token=NULL,attempts=attempts+1,failure_code=? WHERE id=? AND enabled=1 AND lease_token=? AND lease_until>?')
      .bind(now + backoff, failure.code, work.id, work.lease_token, now),
  ]);
}
