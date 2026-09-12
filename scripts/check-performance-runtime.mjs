// Controlled local Cloudflare/D1 benchmark. Provider latency is simulated;
// these numbers are NOT worldwide or production load-test results.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const runtimeRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = runtimeRequire('miniflare');
const { build } = runtimeRequire('esbuild');
const { outputFiles } = await build({
  stdin: {
    contents: `
    import { env, waitUntil } from 'cloudflare:workers';
    import { cachedMarket, marketSnapshot } from './lib/market-cache';
    export default { async fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === '/setup') {
        await env.DB.exec('CREATE TABLE market_cache (key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)');
        return new Response('ok');
      }
      const loader = async () => (await fetch('https://provider.test/quote')).json();
      const result = path === '/blocking'
        ? await cachedMarket(env.DB, 'blocking', 60000, loader)
        : await marketSnapshot(env.DB, 'snapshot', 60000, loader, waitUntil);
      return Response.json(result);
    }};`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  external: ['cloudflare:workers'],
  write: false,
});
let providerCalls = 0;
const worker = new Miniflare({
  modules: true,
  d1Databases: { DB: 'performance-test' },
  script: outputFiles[0].text,
  compatibilityDate: '2026-05-15',
  outboundService: async () => {
    providerCalls++;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return Response.json({ fixture: true, price: 123 });
  },
});
const read = async (path) => {
  const start = performance.now();
  const r = await worker.dispatchFetch('http://localhost' + path);
  assert.equal(r.status, 200);
  const data = await r.json();
  return { elapsed: performance.now() - start, data };
};
try {
  await worker.dispatchFetch('http://localhost/setup');
  const before = await read('/blocking');
  const initialCalls = providerCalls;
  const results = await Promise.all(
    Array.from({ length: 20 }, () => read('/snapshot')),
  );
  const times = results.map((r) => r.elapsed).sort((a, b) => a - b);
  assert.ok(results.every((r) => r.data.refreshing || r.data.data));
  assert.ok(
    times.at(-1) < before.elapsed,
    'Snapshot responses waited for the provider',
  );
  await new Promise((resolve) => setTimeout(resolve, 1400));
  const warm = await read('/snapshot');
  assert.equal(
    warm.data.data?.price,
    123,
    'Background waitUntil did not finish its D1 write',
  );
  assert.equal(warm.data.stale, false);
  assert.equal(
    providerCalls - initialCalls,
    1,
    'Concurrent requests duplicated the provider refresh',
  );
  console.log(
    JSON.stringify({
      mode: 'local-workers-d1-simulated-1200ms-provider',
      blockingMs: Math.round(before.elapsed),
      snapshotConcurrentRequests: 20,
      snapshotP50Ms: Math.round(times[9]),
      snapshotP95Ms: Math.round(times[18]),
      snapshotMaxMs: Math.round(times.at(-1)),
      warmMs: Math.round(warm.elapsed),
      sharedProviderRefreshes: providerCalls - initialCalls,
    }),
  );
} finally {
  await worker.dispose();
}
