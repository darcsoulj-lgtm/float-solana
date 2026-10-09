import type { MarketEnvironment } from './market-overview-server';

const REPOSITORY = 'darcsoulj-lgtm/float-solana';
export type TriggerEnvironment = Pick<MarketEnvironment, 'DB'> & { MARKET_WORKFLOW_TOKEN?: string };
export type TriggerStatus = 'not_configured' | 'cooldown' | 'fresh' | 'running' | 'dispatched' | 'exhausted' | 'error';

export async function boundedCollectionJson(response: Response, limit: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw Error('Empty response');
  let bytes = 0, text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw Error('Oversized response');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// One private dispatch boundary for the fixed market, holder and stock workflows.
// Accepted execution is never treated as a successful data observation.
type CollectionPolicy = { workflow: 'market-data.yml' | 'issuer-holders.yml' | 'stock-volume.yml'; key: string; checkMs: number; waitMs: number; needsCollection(request: (url: string) => Promise<Response>): Promise<boolean>; reserveDispatch?: () => Promise<boolean> };
export async function triggerWorkflowCollection(env: TriggerEnvironment, policy: CollectionPolicy, fetcher: typeof fetch = fetch, now = Date.now()): Promise<TriggerStatus> {
  const {key: KEY, checkMs: CHECK_MS, waitMs: DISPATCH_WAIT_MS, workflow: WORKFLOW} = policy;
  if (!env.MARKET_WORKFLOW_TOKEN) return 'not_configured';
  const owner = crypto.randomUUID();
  const lease = await env.DB.prepare(`INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after
    WHERE market_cache.retry_after<=? RETURNING key`).bind(KEY, owner, now, now + DISPATCH_WAIT_MS, now).first();
  if (!lease) return 'cooldown';
  const record = async (status: TriggerStatus, delay = CHECK_MS) => {
    await env.DB.prepare('UPDATE market_cache SET payload=?,retry_after=? WHERE key=? AND payload=?')
      .bind(JSON.stringify({ status, checkedAt: now }), now + delay, KEY, owner).run();
    return status;
  };
  const request = async (url: string, options: RequestInit = {}) => {
    const r = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), ...options });
    if (!r.ok) { await r.body?.cancel(); throw Error('Collection service unavailable'); }
    return r;
  };
  try {
    if (!await policy.needsCollection(request)) return await record('fresh');
    const headers = {
      Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + env.MARKET_WORKFLOW_TOKEN,
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Float-collection-trigger',
    };
    const endpoint = 'https://api.github.com/repos/' + REPOSITORY + '/actions/workflows/' + WORKFLOW;
    // Query active states directly: old queued work must not disappear behind
    // a page of newer completed runs. The workflow concurrency group also
    // serializes a scheduled run racing with this dispatch.
    for (const status of ['in_progress', 'queued', 'waiting', 'pending', 'requested']) {
      const payload = await boundedCollectionJson(await request(endpoint + '/runs?branch=main&per_page=1&status=' + status, { headers }), 15000) as { workflow_runs?: { status?: string }[]; total_count?: number };
      if (!Array.isArray(payload.workflow_runs) || !Number.isSafeInteger(payload.total_count) || payload.total_count! < 0 || payload.workflow_runs.some(r => !r || r.status !== status) || (!!payload.total_count !== !!payload.workflow_runs.length)) throw Error('Invalid workflow runs');
      if (payload.workflow_runs.length) return await record('running');
    }
    if (policy.reserveDispatch && !await policy.reserveDispatch()) return await record('exhausted');
    const dispatched = await request(endpoint + '/dispatches', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }),
    });
    if (dispatched.status !== 204) { await dispatched.body?.cancel(); throw Error('Unexpected dispatch response'); }
    return await record('dispatched', DISPATCH_WAIT_MS);
  } catch {
    // A timed-out POST may already have been accepted. Keep the lease cooldown
    // and inspect running work next time before trying another dispatch.
    await record('error', DISPATCH_WAIT_MS);
    throw Error('Collection trigger failed; retry remains scheduled');
  }
}
