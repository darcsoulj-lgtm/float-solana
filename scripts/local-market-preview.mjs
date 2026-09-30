// Development-only, read-only bridge. Never forwards cookies or private endpoints.
export function localMarketPreview() {
  const cache = new Map();
  return {
    name: 'float-local-market-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (req.method !== 'GET' || !['/api/market-data', '/api/issuer-holders'].includes(url.pathname)) return next();
        const key = url.pathname + url.search;
        try {
          let saved = cache.get(key);
          if (!saved || Date.now() - saved.at > 60000) {
            const response = await fetch('https://joinfloat.xyz' + key, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FloatHolderCensus/1.0; +https://joinfloat.xyz)' },
              signal: AbortSignal.timeout(25000), redirect: 'error',
            });
            if (!response.ok) throw Error('Public data unavailable');
            saved = { body: await response.text(), at: Date.now() };
            cache.set(key, saved);
          }
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(saved.body);
        } catch {
          const saved = cache.get(key);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.statusCode = saved ? 200 : 503;
          // Preserve source timestamps, never manufacture a fresh observation.
          res.end(saved?.body || JSON.stringify({ error: 'Preview could not load public market data.' }));
        }
      });
    },
  };
}
