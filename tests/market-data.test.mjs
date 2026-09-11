import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
const dir = await mkdtemp(tmpdir() + '/hp-markets-');
for (const file of ['tokens', 'market-data', 'market-cache', 'cmc-data']) {
  const raw = await readFile(
    new URL('../lib/' + file + '.ts', import.meta.url),
    'utf8',
  );
  const out = ts
    .transpileModule(raw, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replace(
      /from '\.\/(tokens|market-data|cmc-data)'/g,
      "from './$1.mjs'",
    );
  await writeFile(dir + '/' + file + '.mjs', out);
}
const { TOKENS } = await import(pathToFileURL(dir + '/tokens.mjs'));
const {
  parseListings,
  parsePools,
  parsePrices,
  parseBook,
  publicJson,
  fetchCatalog,
  fetchPools,
  fetchPrices,
  numeric,
} = await import(pathToFileURL(dir + '/market-data.mjs'));
const { cachedMarket } = await import(pathToFileURL(dir + '/market-cache.mjs'));
const mint = TOKENS[0].mint;
const fixture = async (name) =>
  JSON.parse(
    await readFile(
      new URL('../research/market-data/' + name + '.json', import.meta.url),
      'utf8',
    ),
  );
test('Observed live Backpack registry matches the exact mint and excludes perpetual markets', async () => {
  const listings = parseListings(
    await fixture('assets'),
    await fixture('markets'),
  );
  assert.ok(listings.length >= 39);
  assert.equal(listings.find((t) => t.symbol === 'MU').spot, 'MU.US_USDC');
  assert.ok(listings.every((t) => !t.spot?.endsWith('PERP')));
});
test('A matching ticker with a different mint never qualifies; duplicate registry matches fail closed', () => {
  const asset = {
    symbol: 'MU.US',
    tokens: [
      { blockchain: 'Solana', contractAddress: 'fake', depositEnabled: true },
    ],
  };
  assert.deepEqual(parseListings([asset], []), []);
  asset.tokens[0].contractAddress = mint;
  assert.deepEqual(parseListings([asset, asset], []), []);
});
test('Captured pool matches MU by mint, keeps DEX-only measurements and deduplicates pools', async () => {
  const input = await fixture('dex'),
    out = parsePools([...input, ...input]);
  assert.equal(out.MU.length, 1);
  assert.ok(out.MU[0].liquidity > 0);
  assert.ok(out.MU[0].url.startsWith('https://dexscreener.com/solana/'));
  assert.equal(
    parsePools([
      {
        ...input[0],
        baseToken: { address: 'fake' },
        quoteToken: { address: mint },
      },
    ]).MU.length,
    0,
  );
});
test('Missing and malformed values remain unknown, not zero; genuine zero volume is retained', async () => {
  for (const x of [null, '', false, {}, NaN, Infinity])
    assert.equal(numeric(x), null);
  const [p] = await fixture('dex');
  const out = parsePools([
    {
      ...p,
      liquidity: { usd: null },
      volume: { h24: 0 },
      priceUsd: '',
      priceChange: {},
    },
  ]).MU[0];
  assert.equal(out.liquidity, null);
  assert.equal(out.volume24h, 0);
  assert.equal(out.price, null);
  assert.equal(out.change24h, null);
});
test('DefiLlama preserves the source timestamp and does not use the wrong mint or future data', () => {
  const now = Date.now(),
    seconds = Math.floor(now / 1000) - 3600;
  const out = parsePrices(
    {
      coins: {
        ['solana:' + mint]: {
          price: 100,
          timestamp: seconds,
          confidence: 0.99,
        },
        'solana:fake': { price: 1, timestamp: seconds },
      },
    },
    now,
  );
  assert.equal(out.MU.timestamp, seconds * 1000);
  assert.equal(Object.keys(out).length, 1);
  assert.deepEqual(
    parsePrices(
      {
        coins: {
          ['solana:' + mint]: { price: 1, timestamp: now / 1000 + 1000 },
        },
      },
      now,
    ),
    {},
  );
});
test('Unsorted Backpack book levels produce correct spread and separate bid/ask depth', () => {
  const now = Date.now(),
    book = parseBook(
      {
        bids: [
          ['98', '1'],
          ['100', '2'],
          ['99.5', '1'],
        ],
        asks: [
          ['102', '3'],
          ['101', '2'],
        ],
        timestamp: now * 1000,
      },
      'MU.US_USDC',
      now,
    );
  assert.equal(book.bid, 100);
  assert.equal(book.ask, 101);
  assert.equal(book.bidDepth1pct, 299.5);
  assert.equal(book.askDepth1pct, 508);
  assert.equal(book.timestamp, now);
  assert.ok(Math.abs(book.spreadBps - 99.502487562) < 0.00001);
});
test('Old, crossed, one-sided or invalid order books are never presented as fresh quotes', () => {
  const now = Date.now(),
    base = {
      bids: [['100', '1']],
      asks: [['101', '1']],
      timestamp: now * 1000,
    };
  for (const raw of [
    { ...base, timestamp: (now - 120001) * 1000 },
    { ...base, bids: [['102', '1']] },
    { ...base, asks: [] },
    { ...base, bids: [['100', '-1']] },
    { ...base, timestamp: (now + 60000) * 1000 },
  ])
    assert.throws(() => parseBook(raw, 'MU.US_USDC', now));
});
test('Public-source transport allows only fixed hosts and rejects redirects', async () => {
  await assert.rejects(
    publicJson('https://evil.invalid/api', () => assert.fail('must not fetch')),
  );
  await publicJson(
    'https://api.backpack.exchange/api/v1/assets',
    async (url, options) => {
      assert.equal(options.redirect, 'manual');
      assert.equal(options.method, undefined);
      return Response.json([]);
    },
  );
  await assert.rejects(
    publicJson(
      'https://api.backpack.exchange/api/v1/assets',
      async () => new Response('', { status: 429 }),
    ),
  );
});
test('Provider fetchers use documented batches and parse actual recorded responses', async () => {
  let calls = 0;
  const fetcher = async (u) => {
    calls++;
    const url = new URL(u);
    if (url.pathname.endsWith('/assets'))
      return Response.json(await fixture('assets'));
    if (url.pathname.endsWith('/markets'))
      return Response.json(await fixture('markets'));
    if (url.hostname === 'api.dexscreener.com') {
      assert.ok(url.pathname.split('/').at(-1).split(',').length <= 30);
      return Response.json(await fixture('dex'));
    }
    return Response.json(await fixture('llamaprice'));
  };
  assert.ok((await fetchCatalog(fetcher)).length > 0);
  assert.ok((await fetchPools(fetcher)).MU.length > 0);
  assert.ok((await fetchPrices(fetcher)).MU.price > 0);
  assert.equal(calls, 5);
});
function cacheDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE market_cache (key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)',
  );
  return {
    raw: db,
    d1: {
      prepare: (sql) => ({
        bind: (...args) => ({
          first: async () => db.prepare(sql).get(...args) || null,
          run: async () => ({ meta: db.prepare(sql).run(...args) }),
        }),
      }),
    },
  };
}
test('Shared cache persists successful data and avoids redundant provider calls', async () => {
  const { raw, d1 } = cacheDb();
  let calls = 0;
  const loader = async () => {
    calls++;
    return { price: 42 };
  };
  const a = await cachedMarket(d1, 'test', 60000, loader);
  const b = await cachedMarket(d1, 'test', 60000, loader);
  assert.equal(calls, 1);
  assert.deepEqual(b, a);
  assert.equal(b.stale, false);
  raw.close();
});
test('Cache failure preserves old data and original time, backs off and marks it delayed', async () => {
  const { raw, d1 } = cacheDb();
  const old = Date.now() - 3600000;
  raw
    .prepare('INSERT INTO market_cache VALUES (?,?,?,0)')
    .run('test', JSON.stringify({ price: 42 }), old);
  let calls = 0;
  const loader = async () => {
    calls++;
    throw Error('offline');
  };
  const a = await cachedMarket(d1, 'test', 60000, loader);
  const b = await cachedMarket(d1, 'test', 60000, loader);
  assert.equal(calls, 1);
  assert.equal(a.stale, true);
  assert.equal(a.fetchedAt, old);
  assert.deepEqual(b.data, { price: 42 });
  raw.close();
});
test('Concurrent refresh lease prevents duplicate loads; empty cache is unavailable rather than fake data', async () => {
  const { raw, d1 } = cacheDb();
  raw
    .prepare('INSERT INTO market_cache VALUES (?,NULL,0,?)')
    .run('test', Date.now() + 10000);
  const a = await cachedMarket(d1, 'test', 60000, () =>
    assert.fail('lease held'),
  );
  assert.equal(a.data, null);
  assert.equal(a.stale, true);
  raw.close();
});

const {
  parseTokenMarkets,
  freshTokenMarket,
  marketCoverage,
  fetchTokenMarkets,
  CMC_IDS,
} = await import(pathToFileURL(dir + '/cmc-data.mjs'));
const cmc = await fixture('cmc-quotes-all');
const fixtureNow = Date.parse(cmc.status.timestamp);
test('CMC live fixture matches six supported Solana mints and retains original timestamps', () => {
  const rows = parseTokenMarkets(cmc, fixtureNow);
  assert.equal(Object.keys(rows).length, 6);
  assert.equal(rows.MU.id, 40817);
  assert.ok(rows.MU.supply > 0);
  assert.ok(rows.MU.marketCap > 0);
  assert.ok(rows.MU.change7d !== null);
  assert.ok(rows.MU.timestamp <= fixtureNow);
  assert.equal(rows.NKE, undefined);
});
test('CMC rejects wrong mint, wrong chain, crossed IDs and duplicate token results', () => {
  const mu = cmc.data.find((r) => r.id === 40817);
  const base = { ...cmc, data: [mu] };
  for (const bad of [
    { ...mu, platform: { ...mu.platform, token_address: 'fake' } },
    { ...mu, platform: { ...mu.platform, id: 1 } },
    { ...mu, id: 40833 },
  ])
    assert.throws(() =>
      parseTokenMarkets({ ...base, data: [bad] }, fixtureNow),
    );
  assert.throws(() =>
    parseTokenMarkets({ ...base, data: [mu, mu] }, fixtureNow),
  );
});
test('CMC rejects error envelopes, malformed times and unsafe links', () => {
  const mu = cmc.data.find((r) => r.id === 40817);
  for (const raw of [
    { ...cmc, status: { error_code: 429 } },
    { ...cmc, data: {} },
    { ...cmc, data: [{ ...mu, last_updated: 'invalid' }] },
    { ...cmc, data: [{ ...mu, slug: 'bad?redirect=evil' }] },
    {
      ...cmc,
      data: [
        {
          ...mu,
          last_updated: new Date(fixtureNow + 120000).toISOString(),
          quote: mu.quote.map((q) => ({
            ...q,
            last_updated: new Date(fixtureNow + 120000).toISOString(),
          })),
        },
      ],
    },
  ])
    assert.throws(() => parseTokenMarkets(raw, fixtureNow));
});
test('Missing CMC supply, cap and volume are unknown; genuine zero volume is retained', () => {
  const mu = cmc.data.find((r) => r.id === 40817);
  const raw = {
    ...cmc,
    data: [
      {
        ...mu,
        circulating_supply: null,
        quote: mu.quote.map((q) => ({ ...q, market_cap: null, volume_24h: 0 })),
      },
    ],
  };
  const m = parseTokenMarkets(raw, fixtureNow).MU;
  assert.equal(m.supply, null);
  assert.equal(m.marketCap, null);
  assert.equal(m.volume24h, 0);
  const covered = marketCoverage({ MU: m }, fixtureNow);
  assert.equal(covered.marketCap, null);
  assert.equal(covered.capCount, 0);
  assert.equal(covered.volume24h, 0);
  assert.equal(covered.volumeCount, 1);
});
test('Ecosystem totals exclude stale observations and report each metric coverage separately', () => {
  const rows = parseTokenMarkets(cmc, fixtureNow);
  const old = { ...rows.MU, timestamp: fixtureNow - 900001 };
  assert.equal(freshTokenMarket(old, fixtureNow), undefined);
  const covered = marketCoverage({ MU: old, SKHY: rows.SKHY }, fixtureNow);
  assert.equal(covered.fresh.length, 1);
  assert.equal(covered.marketCap, rows.SKHY.marketCap);
  assert.equal(marketCoverage(null).marketCap, null);
});
test('CMC fetch uses batched IDs, public endpoint and no secret header by default', async () => {
  const result = await fetchTokenMarkets(undefined, async (url, options) => {
    const u = new URL(url);
    assert.equal(u.origin, 'https://pro-api.coinmarketcap.com');
    assert.equal(u.pathname, '/public-api/v3/cryptocurrency/quotes/latest');
    assert.equal(u.searchParams.get('id'), CMC_IDS.join(','));
    assert.equal(options.headers['X-CMC_PRO_API_KEY'], undefined);
    assert.equal(options.redirect, 'manual');
    return Response.json(cmc);
  });
  assert.ok(result.MU);
});
test('Optional CMC credential stays in a server header; redirects and rate limits fail safely', async () => {
  await fetchTokenMarkets('test-secret', async (url, options) => {
    assert.equal(new URL(url).pathname, '/v3/cryptocurrency/quotes/latest');
    assert.equal(String(url).includes('test-secret'), false);
    assert.equal(options.headers['X-CMC_PRO_API_KEY'], 'test-secret');
    return Response.json(cmc);
  });
  for (const status of [301, 429, 500])
    await assert.rejects(
      fetchTokenMarkets(undefined, async () => new Response('', { status })),
    );
});

test('Unreported zero capitalization and supply are not presented as established zero value', () => {
  const rows = parseTokenMarkets(cmc, fixtureNow);
  assert.equal(rows.AMC.supply, null);
  assert.equal(rows.AMC.marketCap, null);
  assert.ok(rows.AMC.price > 0);
  const coverage = marketCoverage(rows, fixtureNow);
  assert.equal(coverage.fresh.length, 6);
  assert.equal(coverage.capCount, 5);
});
