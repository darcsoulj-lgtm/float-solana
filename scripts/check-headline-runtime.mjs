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
    contents: `import { fetchHeadlines } from './lib/holder-news';
      export default { async fetch(request) {
        const symbol = new URL(request.url).searchParams.get('symbol');
        try {
          const items = await fetchHeadlines(symbol);
          return Response.json({ symbol, count: items.length, newest: items[0]?.published_at });
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
  script: outputFiles[0].text,
  compatibilityDate: '2026-05-15',
  ...(live
    ? {}
    : {
        outboundService: async (request) => {
          const u = new URL(request.url);
          assert.equal(u.hostname, 'feeds.finance.yahoo.com');
          const company = { MU: 'Micron', SKHY: 'SK Hynix', SPCX: 'SpaceX' }[
            u.searchParams.get('s')
          ];
          assert.ok(company);
          return new Response(
            `<rss><item><title>${company} runtime test fixture</title><pubDate>${new Date(Date.now() - 1000).toUTCString()}</pubDate><link>https://example.com/test-headline</link></item></rss>`,
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
