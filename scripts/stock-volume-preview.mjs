import { readFile } from 'node:fs/promises';

// Opt-in Vite development middleware. No app API, provider calls, credentials,
// public cache or research snapshot is included in a production build.
export function stockVolumePreview() {
  return {
    name: 'float-stock-volume-private-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname !== '/__float-preview/stock-volume') return next();
        const host = req.headers.host ?? '';
        if (req.method !== 'GET' || !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) { res.statusCode = 404; return res.end(); }
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json');
        try {
          const raw = JSON.parse(await readFile(new URL('../outputs/stock-volume-feasibility-2026-10-04/verified-top5-comparison.json', import.meta.url), 'utf8'));
          // Explicitly consume only this private, reconciled one-day research export.
          if (raw.status !== 'verified_private_top5_provider_data' || raw.public_display_permission_verified !== false || !Array.isArray(raw.records) || raw.records.length !== 5) throw Error('Invalid research export');
          const comparison = {
            period: 1, startUtc: raw.start_utc, endUtc: raw.end_utc_exclusive,
            timeZone: 'America/New_York', tokenSource: 'birdeye', stockSource: 'alpaca-sip',
            coverage: { available: 70, total: 71, unavailable: raw.unavailable_symbols },
            rows: raw.records.map(r => ({ symbol: r.symbol, name: r.name, mint: r.mint, listingExchange: r.listing_exchange, tokenUsd: Number(r.token_usd), stockUsd: Number(r.stock_usd), reconciled: r.share_and_count_reconciled })),
          };
          return res.end(JSON.stringify({ comparisons: [comparison] }));
        } catch { res.statusCode = 503; return res.end('{"error":"Verified private snapshot unavailable"}'); }
      });
    },
  };
}
