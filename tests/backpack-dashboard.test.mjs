import { compileFunction } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))(
  'esbuild',
);
const root = new URL('../', import.meta.url).pathname;
const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './lib/backpack-dashboard'; export {issuerDashboard} from './lib/issuer-dashboard'; export {TOKENS,ISSUERS} from './lib/tokens'; export {parsePools} from './lib/market-data';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const api = await import(
  'data:text/javascript;base64,' +
    Buffer.from(outputFiles[0].text).toString('base64')
);
const now = Date.now();
const source = (data) => ({ data, fetchedAt: now, stale: false, error: null });
const blank = () => ({
  pools: source({}),
  prices: source({}),
  supplies: source({}),
  catalog: source([]),
  markets: source({}),
});
const pool = (address, volume24h, liquidity) => ({
  address,
  volume24h,
  liquidity,
  price: 100,
  change24h: 2,
  dex: 'test',
  quote: 'USDC',
  url: 'https://dexscreener.com/solana/' + address,
  createdAt: now - 86400000,
});
void test('Issuer aggregate counts shared pools once; token rows retain their own pool coverage', () => {
  const d = blank();
  d.pools.data.MU = [pool('shared', 100, 50), pool('mu-only', 20, 10)];
  d.pools.data.SPCX = [pool('shared', 100, 50)];
  const result = api.backpackDashboard(d, now);
  assert.equal(result.volume, 120);
  assert.equal(result.liquidity, 60);
  assert.equal(result.volumeCovered, 2);
  assert.equal(
    result.rows.find((r) => r.token.symbol === 'SPCX').dexVolume,
    100,
  );
  assert.equal(result.recentPools.length, 2);
});
void test('Unknown volume stays unknown; confirmed zero is zero', () => {
  const d = blank();
  assert.equal(api.backpackDashboard(d, now).volume, null);
  d.pools.data.MU = [pool('zero', 0, 0)];
  assert.equal(api.backpackDashboard(d, now).volume, 0);
  assert.equal(api.backpackDashboard(d, now).liquidity, 0);
});
void test('Expired, stale and future-dated pools cannot enter public metrics', () => {
  for (const mutate of [
    (d) => (d.pools.fetchedAt = now - 300001),
    (d) => (d.pools.stale = true),
    (d) => (d.pools.fetchedAt = now + 61000),
  ]) {
    const d = blank();
    d.pools.data.MU = [pool('old', 999, 999)];
    mutate(d);
    assert.equal(api.backpackDashboard(d, now).volume, null);
  }
});
void test('Other issuers cannot leak into Backpack-only totals', () => {
  const d = blank();
  d.pools.data.GOOGLon = [pool('ondo', 1e9, 1e9)];
  const result = api.backpackDashboard(d, now);
  assert.equal(result.volume, null);
  assert.ok(result.rows.every((r) => r.token.issuer === 'backpack'));
  assert.equal(result.rows.length, 44);
});
void test('Recent pools exclude old and future timestamps, without inventing stock listing dates', () => {
  const d = blank();
  d.pools.data.MU = [
    { ...pool('old', 1, 1), createdAt: now - 31 * 86400000 },
    { ...pool('future', 1, 1), createdAt: now + 10000 },
    pool('recent', 1, 1),
  ];
  assert.deepEqual(
    api.backpackDashboard(d, now).recentPools.map((p) => p.address),
    ['recent'],
  );
});
void test('Minted values use compatible Solana supply and exclude missing or conflicting valuations', () => {
  const d = blank();
  d.supplies.data.MU = { supply: 10, valuationSafe: true };
  d.prices.data.MU = { price: 100, confidence: 1, timestamp: now };
  assert.equal(api.backpackDashboard(d, now).mintedValue, 1000);
  d.pools.data.MU = [pool('conflict', 0, 100)];
  d.pools.data.MU[0].price = 200;
  assert.equal(api.backpackDashboard(d, now).mintedValue, null);
});
void test('Per-token discovery stays bounded and uses exact mint endpoints', async () => {
  let inflight = 0,
    max = 0;
  const urls = [];
  const result = await api.fetchBackpackPools(
    api.DASHBOARD_TOKENS.slice(0, 10),
    async (url) => {
      urls.push(String(url));
      inflight++;
      max = Math.max(max, inflight);
      await new Promise((r) => setTimeout(r, 1));
      inflight--;
      return new Response('[]', { status: 200 });
    },
  );
  assert.equal(Object.keys(result).length, 10);
  assert.ok(max <= 3);
  assert.equal(urls.length, 10);
  assert.ok(
    urls.every((u) =>
      u.startsWith('https://api.dexscreener.com/token-pairs/v1/solana/'),
    ),
  );
});
// Compile the public route with explicit dependency stubs. Any accidental auth
// import fails this harness; the output must remain public market data only.
const routeBundle = await build({
  entryPoints: [root + 'app/api/backpack/route.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  plugins: [
    {
      name: 'public-route-stubs',
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(cloudflare:workers|@\/lib\/server|@\/lib\/market-cache|\.\/market-cache)$/,
          },
          (args) => ({ path: args.path, namespace: 'stub' }),
        );
        b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
          contents:
            args.path === 'cloudflare:workers'
              ? 'export const waitUntil=()=>{}'
              : args.path.endsWith('/server')
                ? 'export const db=()=>({prepare:()=>({bind:()=>({first:async()=>null})})});export const runtime=()=>({SOLANA_RPC_URL:"https://private.example/key"});export const rateLimit=async()=>{}'
                : 'export const marketCacheRows=async()=>new Map();export const cachedMarket=async()=>{throw Error("unexpected synchronous refresh")};export const marketSnapshot=async(db,key)=>({data:key.includes("verified-listings")?(globalThis.__floatRegistryTestAdditions??[]):key.includes("catalog")?[]:{},fetchedAt:123,stale:false,error:null});',
          loader: 'js',
        }));
      },
    },
  ],
});
const route = await import(
  'data:text/javascript;base64,' +
    Buffer.from(routeBundle.outputFiles[0].text).toString('base64')
);
void test('Public route works without a wallet and never exposes runtime credentials', async () => {
  const response = await route.GET(
    new Request('https://example.com/api/backpack?batch=0'),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /public/);
  const body = await response.json();
  assert.deepEqual(
    Object.keys(body).sort(),
    [
      'registry',
      'batch',
      'catalog',
      'history',
      'markets',
      'pools',
      'prices',
      'supplies',
      'totalBatches',
    ].sort(),
  );
  assert.equal(body.totalBatches, 5);
  assert.ok(!JSON.stringify(body).includes('private.example'));
  assert.equal(response.headers.get('set-cookie'), null);
});
void test('Invalid public batch requests are rejected', async () => {
  for (const value of ['-1', '5', '1.2', 'NaN', '99', '0x1'])
    assert.equal(
      (
        await route.GET(
          new Request('https://example.com/api/backpack?batch=' + value),
        )
      ).status,
      400,
    );
});
const uiBundle = await build({
  stdin: {
    contents:
      "export * from './components/backpack-dashboard'; export {IssuerDashboardContent, TokenTradingPools} from './components/issuer-dashboard';",
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['react', 'react/jsx-runtime', 'lucide-react'],
});
const uiModule = { exports: {} };
compileFunction(uiBundle.outputFiles[0].text, ['require', 'module', 'exports'])(
  require,
  uiModule,
  uiModule.exports,
);
const { sortedBackpackRows, BackpackDashboardPage } = uiModule.exports;
void test('A direct stock link preserves matching server and first client markup', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const browserModule = { exports: {} };
  compileFunction(uiBundle.outputFiles[0].text, [
    'require',
    'module',
    'exports',
    'window',
  ])(require, browserModule, browserModule.exports, {
    location: { search: '?stock=FLWS' },
  });
  const props = {
    issuer: 'backpack',
    embedded: false,
    data: null,
    busy: true,
    error: '',
    onRefresh: () => {},
  };
  const server = renderToStaticMarkup(
    React.createElement(uiModule.exports.IssuerDashboardContent, props),
  );
  const client = renderToStaticMarkup(
    React.createElement(browserModule.exports.IssuerDashboardContent, props),
  );
  assert.equal(client, server);
});
void test('Pool disclosure ranks a copy, expands every observed pool and collapses again', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  let expanded = false;
  const poolModule = { exports: {} };
  let returnedToToggle = false;
  const event = {
    currentTarget: {
      isConnected: true,
      scrollIntoView: () => {
        returnedToToggle = true;
      },
    },
  };
  compileFunction(uiBundle.outputFiles[0].text, [
    'require',
    'module',
    'exports',
    'requestAnimationFrame',
  ])(
    (id) =>
      id === 'react'
        ? {
            ...React,
            useId: () => 'test-pools',
            useState: () => [
              expanded,
              (value) => {
                expanded = value;
              },
            ],
          }
        : require(id),
    poolModule,
    poolModule.exports,
    (callback) => callback(),
  );
  const pools = Object.freeze([
    pool('unknown', 500, null),
    pool('small', 100, 1),
    pool('large', 1, 100),
    pool('medium', 2, 50),
    pool('zero', 3, 0),
  ]);
  const render = () => poolModule.exports.TokenTradingPools({ pools });
  const links = (tree) => tree.props.children[1].props.children;
  const button = (tree) => tree.props.children[2];
  let tree = render();
  assert.deepEqual(
    links(tree).map((link) => link.key),
    ['large', 'medium', 'small'],
  );
  assert.equal(button(tree).props['aria-expanded'], false);
  assert.equal(
    button(tree).props['aria-controls'],
    tree.props.children[1].props.id,
  );
  assert.match(renderToStaticMarkup(tree), /View all pools \(5\)/);
  button(tree).props.onClick(event);
  tree = render();
  assert.equal(button(tree).props['aria-expanded'], true);
  assert.deepEqual(
    links(tree).map((link) => link.key),
    ['large', 'medium', 'small', 'zero', 'unknown'],
  );
  assert.match(renderToStaticMarkup(tree), /Show fewer pools/);
  button(tree).props.onClick(event);
  assert.equal(links(render()).length, 3);
  assert.equal(returnedToToggle, true);
  assert.deepEqual(
    pools.map((p) => p.address),
    ['unknown', 'small', 'large', 'medium', 'zero'],
  );
});
void test('Small and unavailable pool lists do not show an unnecessary disclosure', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (let count = 0; count <= 3; count++) {
    const html = renderToStaticMarkup(
      React.createElement(uiModule.exports.TokenTradingPools, {
        pools: Array.from({ length: count }, (_, i) => pool(`pool-${i}`, 0, i)),
      }),
    );
    assert.equal((html.match(/class="bp-pool"/g) || []).length, count);
    assert.doesNotMatch(html, /View all pools|Show fewer pools/);
    if (!count) assert.match(html, /No eligible pools available/);
  }
});
void test('Issuer totals include pools beyond the three initially displayed', () => {
  const d = blank();
  d.pools.data.MU = Array.from({ length: 5 }, (_, i) =>
    pool(`pool-${i}`, 10, i + 1),
  );
  const result = api.backpackDashboard(d, now);
  const row = result.rows.find((r) => r.token.symbol === 'MU');
  assert.equal(row.pools.length, 5);
  assert.equal(row.dexVolume, 50);
  assert.equal(row.poolLiquidity, 15);
  assert.equal(result.volume, 50);
  assert.equal(result.liquidity, 15);
});
void test('Sort keeps unknown values last in either direction and search matches company names', () => {
  const d = blank();
  d.pools.data.MU = [pool('mu', 50, 100)];
  d.pools.data.SPCX = [pool('spcx', 100, 200)];
  const rows = api.backpackDashboard(d, now).rows;
  assert.equal(
    sortedBackpackRows(rows, '', 'dexVolume', false)[0].token.symbol,
    'SPCX',
  );
  assert.equal(
    sortedBackpackRows(rows, '', 'dexVolume', true)[0].token.symbol,
    'MU',
  );
  assert.equal(
    sortedBackpackRows(rows, 'micron', 'dexVolume', false)[0].token.symbol,
    'MU',
  );
  assert.equal(
    sortedBackpackRows(rows, 'no such company', 'dexVolume', false).length,
    0,
  );
});
void test('Public initial render contains accessible search, sort and detail controls without requiring sign-in', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const html = renderToStaticMarkup(React.createElement(BackpackDashboardPage));
  assert.match(html, /Backpack onchain/);
  assert.match(html, /aria-label="Search stocks"/);
  assert.match(html, /aria-sort="descending"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /no wallet required/);
  assert.match(html, /Sources &amp; coverage/);
  assert.doesNotMatch(html, /Sign in to view|data-theme="light"/);
});

void test('Embedded Backpack keeps dashboard controls without the public join prompt', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const html = renderToStaticMarkup(
    React.createElement(BackpackDashboardPage, { embedded: true }),
  );
  assert.match(html, /backpack-dashboard bp-embedded/);
  assert.match(html, /aria-label="Search stocks"/);
  assert.match(html, /Sources &amp; coverage/);
  assert.doesNotMatch(html, /Join the holder community|FLOAT \/ SOLANA/);
  const publicHtml = renderToStaticMarkup(
    React.createElement(BackpackDashboardPage),
  );
  assert.match(publicHtml, /Join the holder community/);
});

void test('Every issuer uses isolated, deduplicated pool totals with unknown values preserved', () => {
  for (const issuer of api.ISSUERS) {
    const d = blank();
    const tokens = api.TOKENS.filter((t) => t.issuer === issuer.id);
    d.pools.data[tokens[0].symbol] = [pool('shared', 125, 50)];
    if (tokens[1]) d.pools.data[tokens[1].symbol] = [pool('shared', 125, 50)];
    const other = api.TOKENS.find((t) => t.issuer !== issuer.id);
    d.pools.data[other.symbol] = [pool('outside', 1e9, 1e9)];
    const result = api.issuerDashboard(d, issuer.id, now);
    assert.equal(result.rows.length, tokens.length);
    assert.equal(result.volume, 125);
    assert.equal(result.liquidity, 50);
    assert.ok(result.rows.every((r) => r.token.issuer === issuer.id));
    assert.equal(api.issuerDashboard(blank(), issuer.id, now).volume, null);
  }
});
void test('xStocks dashboard never substitutes gross minted or global values for circulation', () => {
  const token = api.TOKENS.find((t) => t.issuer === 'xstocks');
  const d = blank();
  d.supplies.data[token.symbol] = { supply: 1e9, valuationSafe: true };
  d.prices.data[token.symbol] = { price: 100, confidence: 1, timestamp: now };
  assert.equal(api.issuerDashboard(d, 'xstocks', now).value, null);
  d.circulation = source({
    [token.symbol]: {
      mint: token.mint,
      circulatingSupply: 2,
      totalSupply: 1e9,
      referencePriceUsd: 110,
      valueUsd: 220,
    },
  });
  const result = api.issuerDashboard(d, 'xstocks', now);
  assert.equal(result.value, 220);
  assert.equal(result.mintedValue, null);
  assert.equal(result.valueLabel, 'Circulating value');
  d.circulation.fetchedAt = now - 3600000;
  assert.equal(api.issuerDashboard(d, 'xstocks', now).delayed, true);
  d.circulation.fetchedAt = now - 86400001;
  assert.equal(api.issuerDashboard(d, 'xstocks', now).value, null);
});
void test('Issuer dashboards prioritize trading metrics and retain valuation in collapsed coverage', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const issuer of api.ISSUERS) {
    const html = renderToStaticMarkup(
      React.createElement(uiModule.exports.IssuerDashboardContent, {
        issuer: issuer.id,
        embedded: true,
        data: blank(),
        busy: false,
        error: '',
        onRefresh: () => {},
      }),
    );
    assert.match(html, new RegExp(issuer.name + ' onchain'));
    assert.doesNotMatch(html, /onchain<span>\.<\/span>/);
    for (const label of [
      'DEX pool volume',
      'Pool liquidity',
      '24h change',
      'Search stocks',
      'Sources &amp; coverage',
    ])
      assert.ok(html.includes(label));
    assert.ok(
      html.includes(
        issuer.id === 'xstocks' ? 'Circulating value' : 'Minted value',
      ),
    );
    const summary = html.split('<details class="bp-method"')[0];
    assert.doesNotMatch(summary, /Minted value/);
    assert.match(
      summary,
      issuer.id === 'xstocks' ? /Circulating value/ : /Tracked on Solana/,
    );
    assert.match(html.split('<details class="bp-method"')[1], /tokens valued/);
    assert.doesNotMatch(html, /Join the holder community/);
  }
});

void test('Ondo limited pool coverage is visible alongside volume, not presented as issuer total', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const data = blank();
  data.pools.data.GOOGLon = [pool('googl', 7.28, 20)];
  const html = renderToStaticMarkup(
    React.createElement(uiModule.exports.IssuerDashboardContent, {
      issuer: 'ondo',
      embedded: true,
      data,
      busy: false,
      error: '',
      onRefresh: () => {},
    }),
  );
  assert.match(html, /DEX pool volume/);
  assert.match(html, /1 of 416 tokens · RFQ excluded/);
  assert.match(html, /Volume source and coverage/);
});

void test('Public dashboard grows beyond the original page count without a deploy', async () => {
  globalThis.__floatRegistryTestAdditions = Array.from(
    { length: 7 },
    (_, i) => ({
      symbol: 'NEXT' + i,
      mint: 'NEXT' + String(i + 1) + 'FNGQmoBdXSRGKJ8tTu7uPDasw5JDcfMmWniNfow',
      name: 'Next Company',
      shortName: 'Next',
      issuer: 'backpack',
      underlyingSymbol: 'NEXT' + i,
      source: 'https://api.backpack.exchange/api/v1/assets',
    }),
  );
  try {
    const first = await (
      await route.GET(new Request('https://example.com/api/backpack?batch=0'))
    ).json();
    assert.equal(first.totalBatches, 6);
    const extra = await route.GET(
      new Request('https://example.com/api/backpack?batch=5'),
    );
    assert.equal(extra.status, 200);
    assert.equal((await extra.json()).registry.additions.length, 7);
    assert.equal(
      (await route.GET(new Request('https://example.com/api/backpack?batch=6')))
        .status,
      400,
    );
  } finally {
    delete globalThis.__floatRegistryTestAdditions;
  }
});
