import { readFile } from 'node:fs/promises';
// Development-only, read-only bridge. Never forwards cookies or private endpoints.
export function localMarketPreview() {
  const cache = new Map();
  return {
    name: 'float-local-market-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (req.method !== 'GET' || !['/api/market-data', '/api/backpack-market', '/api/issuer-holders', '/api/trading-activity'].includes(url.pathname)) return next();
        if (url.pathname === '/api/trading-activity' && process.env.FLOAT_LOCAL_ACTIVITY_FILE) {
          try {
            const body = await readFile(process.env.FLOAT_LOCAL_ACTIVITY_FILE, 'utf8'); JSON.parse(body);
            res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store'); return res.end(body);
          } catch { res.statusCode=503; return res.end('{"error":"Local activity snapshot unavailable"}'); }
        }
        if (process.env.FLOAT_LOCAL_MARKET_FILE && ['/api/market-data', '/api/backpack-market'].includes(url.pathname)) {
          try {
            const body = await readFile(process.env.FLOAT_LOCAL_MARKET_FILE, 'utf8');
            JSON.parse(body);
            res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
            return res.end(body);
          } catch { res.statusCode = 503; return res.end('{"error":"Local market snapshot unavailable"}'); }
        }
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
