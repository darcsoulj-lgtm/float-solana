// This boundary accepts a public-only loader. Never wrap a session-aware endpoint.
export async function publicMarketResponse(
  request: Request,
  load: () => Promise<unknown>,
  cache: Pick<Cache, 'match' | 'put'>,
  defer: (work: Promise<unknown>) => void,
) {
  // Ignore cookies, query strings and arbitrary headers in the cache identity.
  const key = new Request(new URL('/api/backpack-market?schema=1', request.url).toString());
  let cached: Response | undefined;
  try { cached = await cache.match(key); } catch { /* Cache failure falls back to D1. */ }
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set('X-Float-Cache', 'HIT');
    return response;
  }
  const data = await load();
  const response = Response.json(data, {headers: {
    'Cache-Control': 'public, max-age=30',
    'X-Content-Type-Options': 'nosniff',
    'X-Float-Cache': 'MISS',
  }});
  defer(cache.put(key, response.clone()).catch(() => {}));
  return response;
}
