// Workers transport check. Add --live for real public feeds; default uses labeled fixtures.
// No member session or production database is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const runtimeRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = runtimeRequire('miniflare');
const { build } = runtimeRequire('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const live = process.argv.includes('--live');
const { outputFiles } = await build({
  stdin: {
    contents: `import { refreshHeadlineSources, headlineKeys, cachedHeadlines } from './lib/headline-cache';
      export default { async fetch(request, env) {
        const symbol = new URL(request.url).searchParams.get('symbol');
        try {
          await env.DB.exec('CREATE TABLE IF NOT EXISTS market_cache (key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)');
          await refreshHeadlineSources(env.DB, symbol);
          const rows = await env.DB.prepare('SELECT * FROM market_cache WHERE key=?').bind(headlineKeys(symbol)[0]).first();
          const items = cachedHeadlines(rows) || [];
          return Response.json({ symbol, count: items.length, newest: items[0]?.published_at, title:items[0]?.title, publisher:items[0]?.publisher, url:items[0]?.url });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 502 });
        }
      }};`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
});
const worker = new Miniflare({
  modules: true,
  d1Databases: { DB: 'news-runtime-test' },
  script: outputFiles[0].text,
  compatibilityDate: '2026-05-15',
  ...(live
    ? {}
    : {
        outboundService: async (request) => {
          const u = new URL(request.url);
          assert.equal(u.hostname, 'news.google.com');
          const company = ['Micron', 'SK Hynix', 'SpaceX'].find((name) =>
            u.searchParams.get('q')?.includes(name),
          );
          assert.ok(company);
          return new Response(
            `<rss><item><title>${company} runtime test fixture</title><pubDate>${new Date(Date.now() - 1000).toUTCString()}</pubDate><link>https://news.google.com/rss/articles/test-headline</link><source url="https://example.com">Test publisher</source></item></rss>`,
          );
        },
      }),
});
try {
  for (const symbol of ['MU', 'SKHY', 'SPCX']) {
    const response = await worker.dispatchFetch(
      'http://localhost/?symbol=' + symbol,
    );
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.ok(
      result.count > 0,
      'Expected current company-matched headlines for ' + symbol,
    );
    assert.ok(result.newest >= Date.now() - 7 * 86400000);
    console.log(JSON.stringify({ mode: live ? 'live' : 'fixture', ...result }));
  }
} finally {
  await worker.dispose();
}
