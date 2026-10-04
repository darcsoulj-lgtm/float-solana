const renderHeaders = [
  'rsc', 'next-router-state-tree', 'next-router-prefetch',
  'next-router-segment-prefetch', 'next-url',
  'x-vinext-interception-context', 'x-vinext-mounted-slots',
  'x-vinext-rsc-render-mode',
  'oai-authenticated-user-id', 'oai-authenticated-user-email',
  'oai-authenticated-user-full-name', 'oai-authenticated-user-full-name-encoding',
];

// Only anonymous, ordinary HTML entry pages. Live data and membership are
// loaded separately by the browser. Never cache a session or RSC response.
export async function publicPageResponse(
  request: Request,
  load: () => Promise<Response>,
  cache: Pick<Cache, 'match' | 'put'>,
  defer: (work: Promise<unknown>) => void,
  version?: string,
) {
  const url = new URL(request.url);
  if (!version || request.method !== 'GET' ||
    !['/', '/markets'].includes(url.pathname) || url.search ||
    request.headers.has('cookie') || request.headers.has('authorization') ||
    renderHeaders.some(header => request.headers.has(header)) ||
    !request.headers.get('accept')?.includes('text/html')) return load();
  const key = new Request(new URL(url.pathname + '?render=' + encodeURIComponent(version), url.origin));
  let cached: Response | undefined;
  try { cached = await cache.match(key); } catch { /* Cache failure falls back to rendering. */ }
  const downstream = (response: Response, status: string) => {
    const copy = new Response(response.body, response);
    copy.headers.set('Cache-Control', 'no-store');
    copy.headers.set('X-Float-Page-Cache', status);
    return copy;
  };
  if (cached) return downstream(cached, 'HIT');
  const response = await load();
  const control = response.headers.get('cache-control') || '';
  const vary = (response.headers.get('vary') || '').toLowerCase();
  if (response.status !== 200 || response.headers.has('set-cookie') ||
    !response.headers.get('content-type')?.startsWith('text/html') ||
    /\b(private|no-store)\b/i.test(control) ||
    vary.split(',').some(header => ['*', 'cookie', 'authorization'].includes(header.trim()))) return response;
  const stored = new Response(response.clone().body, response);
  // This is the static shell, not market observations. A new deployment has a
  // new key; keeping shells for a day avoids repeated expensive SSR misses.
  stored.headers.set('Cache-Control', 'public, max-age=86400');
  defer(cache.put(key, stored).catch(() => {}));
  return downstream(response, 'MISS');
}
