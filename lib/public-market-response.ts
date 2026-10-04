// This boundary accepts a public-only loader. Never wrap a session-aware endpoint.
export async function publicMarketResponse(
  request: Request,
  load: () => Promise<unknown>,
  cache: Pick<Cache, 'match' | 'put'>,
  defer: (work: Promise<unknown>) => void,
  options: { path?: string; maxAgeSeconds?: number; rawJson?: boolean } = {},
) {
  // Ignore cookies, query strings and arbitrary headers in the cache identity.
  const key = new Request(new URL(options.path ?? '/api/backpack-market?schema=4', request.url).toString());
  let cached: Response | undefined;
  try { cached = await cache.match(key); } catch { /* Cache failure falls back to D1. */ }
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set('X-Float-Cache', 'HIT');
    // Cache API hits may carry Cloudflare's zone-level Browser Cache TTL
    // (four hours by default). Only the internal copy may be cached.
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  const data = await load();
  if(options.rawJson && typeof data!=='string')throw Error('Expected a prepared public JSON snapshot');
  const init={headers: {
    'Cache-Control': `public, max-age=${options.maxAgeSeconds ?? 30}`,
    'X-Content-Type-Options': 'nosniff',
    'X-Float-Cache': 'MISS',
    'Content-Type':'application/json; charset=utf-8',
  }};
  const response=options.rawJson ? new Response(data as string,init) : Response.json(data,init);
  defer(cache.put(key, response.clone()).catch(() => {}));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
