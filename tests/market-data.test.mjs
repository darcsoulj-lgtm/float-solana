import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
const dir = await mkdtemp(tmpdir() + '/hp-markets-');
for (const file of ['tokens', 'market-data', 'market-cache']) {
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
    .outputText.replace(/from '\.\/(tokens|market-data)'/g, "from './$1.mjs'");
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
