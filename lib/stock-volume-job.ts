import { validStockVolumeComparison, type StockVolumeComparison } from './stock-volume-comparison';
import snapshot from './stock-volume-published.json';

export const STOCK_VOLUME_KEY = 'stock-volume:published:v1';
export const STOCK_VOLUME_JOB_KEY = 'stock-volume:job:v1';
export const STOCK_VOLUME_HISTORY_PREFIX = 'stock-volume:history:v1:';
export const STOCK_VOLUME_AUDIENCE = 'https://joinfloat.xyz/stock-volume-collector';
const REPOSITORY = 'darcsoulj-lgtm/float-solana';
const REPOSITORY_ID = '1369155506', OWNER_ID = '273481610';
const WORKFLOW = REPOSITORY + '/.github/workflows/stock-volume.yml@refs/heads/main';
const DAY = 86400000;
type JobEnvironment = { DB: D1Database; STOCK_VOLUME_ENABLED?: string; BIRDEYE_API_KEY?: string; APCA_API_KEY_ID?: string; APCA_API_SECRET_KEY?: string };
type Claims = { iss?: string; aud?: string; sub?: string; exp?: number; nbf?: number; iat?: number; repository?: string; repository_id?:string; repository_owner_id?:string; ref?: string; workflow_ref?: string; event_name?: string; jti?: string };
let jwks: { keys: (JsonWebKey & { kid?: string; alg?: string })[]; expires: number } | undefined;
function decode(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw Error('Invalid token encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), c => c.charCodeAt(0));
}
export async function boundedStockJson(response: Response, limit = 16000) {
  if (!response.ok) { await response.body?.cancel(); throw Error('Stock source HTTP ' + response.status); }
  const reader = response.body?.getReader(); if (!reader) throw Error('Missing response');
  const decoder = new TextDecoder(); let text = '', size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > limit) throw Error('Oversized stock source'); text += decoder.decode(part.value, { stream: true }); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(text + decoder.decode()) as unknown;
}
// Short-lived, GitHub-signed identity for this exact main-branch workflow only.
// No long-lived GitHub secret or provider credential is exposed to visitors.
export async function verifyStockJobIdentity(token: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Claims> {
  if (token.length > 12000) throw Error('Oversized identity');
  const parts = token.split('.'); if (parts.length !== 3) throw Error('Invalid identity');
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw Error('Invalid identity algorithm');
  if (!jwks || jwks.expires <= now) {
    const raw = await boundedStockJson(await fetcher('https://token.actions.githubusercontent.com/.well-known/jwks', { redirect: 'manual', signal: AbortSignal.timeout(10000) }), 32000) as { keys?: (JsonWebKey & { kid?: string; alg?: string })[] };
    if (!Array.isArray(raw.keys) || !raw.keys.length || raw.keys.length > 10) throw Error('Invalid signing keys');
    jwks = { keys: raw.keys, expires: now + 300000 };
  }
  const key = jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && k.alg === 'RS256');
  if (!key) throw Error('Signing key unavailable');
  const imported = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', imported, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) throw Error('Invalid identity signature');
  const claims = JSON.parse(new TextDecoder().decode(decode(parts[1]))) as Claims;
  const seconds = Math.floor(now / 1000);
  const subjects = ['repo:' + REPOSITORY + ':ref:refs/heads/main', `repo:darcsoulj-lgtm@${OWNER_ID}/float-solana@${REPOSITORY_ID}:ref:refs/heads/main`];
  if (claims.iss !== 'https://token.actions.githubusercontent.com' || claims.aud !== STOCK_VOLUME_AUDIENCE || claims.repository !== REPOSITORY || claims.repository_id !== REPOSITORY_ID || claims.repository_owner_id !== OWNER_ID || claims.ref !== 'refs/heads/main' || claims.workflow_ref !== WORKFLOW || !subjects.includes(claims.sub ?? '') || !['schedule', 'push', 'workflow_dispatch'].includes(claims.event_name ?? '') || !Number.isSafeInteger(claims.exp) || claims.exp! <= seconds || !Number.isSafeInteger(claims.nbf) || claims.nbf! > seconds + 30 || !Number.isSafeInteger(claims.iat) || claims.iat! > seconds + 30 || claims.iat! < seconds - 600 || claims.exp! - claims.iat! > 600 || typeof claims.jti !== 'string' || claims.jti.length > 160) throw Error('Identity scope or time invalid');
  return claims;
}
// At most two 200-CU passes/day, 8K CU/rolling 32 days; regular market
// collection remains separately capped at 20K. Failed calls consume reservations.
export async function reserveStockComparison(db: D1Database, now: number) {
  const day = Math.floor(now / DAY) * DAY, key = 'stock-volume-usage:v1:' + day;
  await db.prepare("INSERT OR IGNORE INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,'0',?,0)").bind(key, day).run();
  return !!await db.prepare(`UPDATE market_cache SET payload=CAST(CAST(payload AS INTEGER)+200 AS TEXT)
    WHERE key=? AND CAST(payload AS INTEGER)<400 AND (SELECT COALESCE(SUM(CAST(payload AS INTEGER)),0) FROM market_cache WHERE key LIKE 'stock-volume-usage:v1:%' AND fetched_at>=?) + 200 <= 8000 RETURNING key`).bind(key, day - 31 * DAY).first();
}
const privateHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function stockVolumeJob(request: Request, env: JobEnvironment, fetcher: typeof fetch = fetch, now = Date.now()) {
  if (request.method !== 'POST' || env.STOCK_VOLUME_ENABLED !== '1') return new Response(null, { status: 404, headers: privateHeaders });
  try { await verifyStockJobIdentity((request.headers.get('Authorization') ?? '').replace(/^Bearer /, ''), fetcher, now); }
  catch { return new Response(null, { status: 403, headers: privateHeaders }); }
  let data: { action?: string; comparison?: unknown };
  try { data = await boundedStockJson(new Response(request.body), 16000) as typeof data; }
  catch { return new Response(null, { status: 400, headers: privateHeaders }); }
  if (!data || typeof data !== 'object') return new Response(null, { status: 400, headers: privateHeaders });
  const writeState = (status: string) => env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(STOCK_VOLUME_JOB_KEY, JSON.stringify({ status, checkedAt: now }), now).run();
  if (data.action === 'begin') {
    if (!env.BIRDEYE_API_KEY || !env.APCA_API_KEY_ID || !env.APCA_API_SECRET_KEY) return new Response(null, { status: 503, headers: privateHeaders });
    if (!await reserveStockComparison(env.DB, now)) return new Response(null, { status: 429, headers: privateHeaders });
    await writeState('collecting');
    return Response.json({ birdeye: env.BIRDEYE_API_KEY, alpacaId: env.APCA_API_KEY_ID, alpacaSecret: env.APCA_API_SECRET_KEY }, { headers: privateHeaders });
  }
  if (data.action === 'failed') { await writeState('failed'); return new Response(null, { status: 204, headers: privateHeaders }); }
  const comparison = data.comparison;
  if (data.action !== 'publish' || !validStockVolumeComparison(comparison) || comparison.selectionBasis !== 'latest-market-volume' || comparison.period !== 1 || comparison.generatedAt! > now + 60000 || now - comparison.generatedAt! > 3600000 || Date.parse(comparison.endUtc) > now || now - Date.parse(comparison.endUtc) > 48 * 3600000) return new Response(null, { status: 422, headers: privateHeaders });
  const stored = await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,0)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at
    WHERE julianday(json_extract(market_cache.payload,'$.endUtc'))<=julianday(json_extract(excluded.payload,'$.endUtc')) RETURNING key`).bind(STOCK_VOLUME_KEY, JSON.stringify(comparison), now).first();
  if (!stored) return new Response(null, { status: 409, headers: privateHeaders });
  await env.DB.prepare('INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(STOCK_VOLUME_HISTORY_PREFIX + comparison.endUtc, JSON.stringify(comparison), Date.parse(comparison.endUtc)).run();
  await env.DB.prepare('DELETE FROM market_cache WHERE key LIKE ? AND fetched_at<?').bind(STOCK_VOLUME_HISTORY_PREFIX+'%',now-91*DAY).run();
  await writeState('ok');
  return new Response(null, { status: 204, headers: privateHeaders });
}
export async function readStockVolume(db: D1Database, now = Date.now()) {
  const result = await db.prepare('SELECT key,payload FROM market_cache WHERE key IN (?,?)').bind(STOCK_VOLUME_KEY, STOCK_VOLUME_JOB_KEY).all<{ key: string; payload: string | null }>();
  let comparison: StockVolumeComparison = snapshot as StockVolumeComparison, lastAttempt: { status: string; checkedAt: number } | null = null;
  for (const row of result.results) { try { const value: unknown = JSON.parse(row.payload ?? 'null'); if (row.key === STOCK_VOLUME_KEY && validStockVolumeComparison(value) && Date.parse(value.endUtc) <= now && (value.generatedAt ?? 0) <= now + 60000) comparison = value; if (row.key === STOCK_VOLUME_JOB_KEY) { const state = value as { status: string; checkedAt: number }; if (['ok', 'failed', 'collecting'].includes(state.status) && Number.isSafeInteger(state.checkedAt) && state.checkedAt <= now + 60000) lastAttempt = state; } } catch { /* Preserve the validated, explicitly dated fallback. */ } }
  // Give the daily 06:30 UTC collection until 08:00 UTC. Do not label stale
  // observations current; readers never trigger providers or perform recovery.
  const cutoff = new Date(now); cutoff.setUTCHours(8, 0, 0, 0);
  const delayed = now >= cutoff.getTime() && now - Date.parse(comparison.endUtc) > 12 * 3600000 || lastAttempt?.status === 'failed';
  const archived = await db.prepare('SELECT payload FROM market_cache WHERE key LIKE ? AND fetched_at>=? AND fetched_at<=? ORDER BY fetched_at DESC LIMIT 90').bind(STOCK_VOLUME_HISTORY_PREFIX+'%',now-91*DAY,now).all<{payload:string}>();
  const history = new Map<string, StockVolumeComparison>();
  for(const payload of [JSON.stringify(snapshot),...archived.results.map(r=>r.payload)]) { try { const v:unknown=JSON.parse(payload); if(validStockVolumeComparison(v) && Date.parse(v.endUtc)<=now && Date.parse(v.endUtc)>=now-91*DAY && Date.parse(v.endUtc)!==Date.parse(comparison.endUtc)) history.set(String(Date.parse(v.endUtc)),v); } catch { /* Corrupt history never changes the latest publication. */ } }
  return { comparisons: [comparison], history:[...history.values()].sort((a,b)=>Date.parse(b.endUtc)-Date.parse(a.endUtc)).slice(0,90), status: delayed ? 'delayed' : comparison.selectionBasis ? 'daily' : 'pending', lastAttempt, checkedAt: now };
}
