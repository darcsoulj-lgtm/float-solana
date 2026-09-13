import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
const dir = await mkdtemp(tmpdir() + '/hp-markets-');
for (const file of [
  'tokens',
  'token-registry',
  'market-data',
  'market-cache',
  'cmc-data',
  'token-supply',
  'token-observation',
  'holder-tier',
  'holder-tier-server',
  'holder-news',
  'headline-cache',
]) {
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
      /from '\.\/(tokens|token-registry|market-data|market-cache|cmc-data|token-supply|token-observation|holder-tier|holder-news)'/g,
      "from './$1.mjs'",
    );
  await writeFile(dir + '/' + file + '.mjs', out);
}
const { TOKENS, BACKPACK_TOKENS } = await import(
  pathToFileURL(dir + '/tokens.mjs')
);
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
  parseTokenVolumes,
  fetchTokenVolumes,
  SourceHttpError,
} = await import(pathToFileURL(dir + '/market-data.mjs'));
const { cachedMarket } = await import(pathToFileURL(dir + '/market-cache.mjs'));
const mint = TOKENS[0].mint;
test('429 backoff honors Retry-After and defaults to five minutes', () => {
  assert.equal(
    new SourceHttpError(
      'api.geckoterminal.com',
      new Response('', { status: 429 }),
    ).retryAfterMs,
    300000,
  );
  assert.equal(
    new SourceHttpError(
      'api.geckoterminal.com',
      new Response('', { status: 429, headers: { 'Retry-After': '900' } }),
    ).retryAfterMs,
    900000,
  );
});
test('Dedicated onchain credentials stay in the approved server header and never fall back on rejection', async () => {
  let count = 0;
  await assert.rejects(
    fetchTokenVolumes(async (url, options) => {
      count++;
      assert.ok(
        String(url).startsWith('https://pro-api.coingecko.com/api/v3/onchain/'),
      );
      assert.ok(!String(url).includes('test-private'));
      assert.equal(options.headers['x-cg-pro-api-key'], 'test-private');
      assert.equal(options.redirect, 'manual');
      return new Response('', { status: 429 });
    }, 'test-private'),
    { message: 'Source unavailable: pro-api.coingecko.com HTTP 429' },
  );
  assert.equal(count, 1);
});
test('Upstream failures retain safe production diagnostics without leaking query values', async () => {
  await assert.rejects(
    publicJson(
      'https://api.geckoterminal.com/api/v2/test?key=private-value',
      async () => new Response('', { status: 429 }),
    ),
    { message: 'Source unavailable: api.geckoterminal.com HTTP 429' },
  );
});
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
test('Full September 11 audit covers every enabled security and validates all 41 finalized mints', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL('../research/token-audit/2026-09-11.json', import.meta.url),
      'utf8',
    ),
  );
  const eligible = audit.assets.flatMap((a) =>
    a.symbol.endsWith('.US')
      ? a.tokens
          .filter(
            (t) =>
              t.blockchain === 'Solana' &&
              (t.depositEnabled || t.withdrawEnabled),
          )
          .map((t) => `${a.symbol.slice(0, -3)}:${t.contractAddress}`)
      : [],
  );
  const historical = BACKPACK_TOKENS.filter((t) =>
    eligible.includes(`${t.symbol}:${t.mint}`),
  );
  assert.deepEqual(
    historical.map((t) => `${t.symbol}:${t.mint}`).sort(),
    eligible.sort(),
  );
  const listings = parseListings(audit.assets, audit.markets);
  assert.equal(
    listings.filter((t) => historical.some((h) => h.symbol === t.symbol))
      .length,
    41,
  );
  for (const symbol of ['BABA', 'DNUT', 'GRND']) {
    const listing = listings.find((t) => t.symbol === symbol);
    assert.ok(listing, symbol);
  }
  const accounts = new Map(
    audit.rows.map((t, i) => [t.mint, audit.chain.result.value[i]]),
  );
  audit.newMintCheck.verified.forEach((t, i) =>
    accounts.set(t.mint, audit.newMintCheck.chain.result.value[i]),
  );
  const chain = {
    result: {
      context: { slot: audit.chain.result.context.slot },
      value: historical.map((t) => accounts.get(t.mint)),
    },
  };
  const { parseSupplies } = await import(
    pathToFileURL(dir + '/token-supply.mjs')
  );
  assert.equal(
    Object.keys(parseSupplies(chain, Date.now(), historical)).length,
    41,
  );
  historical.forEach((t) => {
    const info = accounts.get(t.mint).data.parsed.info;
    const metadata = info.extensions.find(
      (e) => e.extension === 'tokenMetadata',
    ).state;
    assert.equal(metadata.symbol, t.symbol);
    assert.ok(metadata.name.endsWith(' - Backpack Securities'));
  });
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
  assert.ok((await fetchPools(fetcher, TOKENS.slice(0, 41))).MU.length > 0);
  assert.ok((await fetchPrices(fetcher, TOKENS.slice(0, 41))).MU.price > 0);
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
test('Provider backoff persists across requests and prevents early retries', async () => {
  const { raw, d1 } = cacheDb();
  const started = Date.now();
  await cachedMarket(d1, 'limited', 120000, async () => {
    throw new SourceHttpError(
      'api.geckoterminal.com',
      new Response('', { status: 429, headers: { 'Retry-After': '900' } }),
    );
  });
  const row = raw
    .prepare('SELECT retry_after FROM market_cache WHERE key=?')
    .get('limited');
  assert.ok(row.retry_after >= started + 900000);
  const result = await cachedMarket(
    d1,
    'limited',
    120000,
    () => assert.fail('must wait for provider'),
    started + 60000,
  );
  assert.equal(result.data, null);
  assert.equal(result.stale, true);
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
test('CMC detail volume uses only the explicit DEX field, preserving zero and rejecting unavailable data', () => {
  for (const value of [1234, 0, null, -1, '', 'NaN', undefined]) {
    const payload = structuredClone(cmc);
    const row = payload.data.find((r) => r.id === 40817);
    const quote = row.quote.find((q) => q.symbol === 'USD');
    quote.dex_volume_24h = value;
    quote.volume_24h = 999999;
    const parsed = parseTokenMarkets(payload, fixtureNow);
    const expected = value === 1234 || value === 0 ? value : null;
    assert.equal(parsed.MU.dexVolume24h, expected);
    const data = { markets: source(parsed, fixtureNow) };
    assert.equal(
      tokenObservation(data, 'MU', fixtureNow).cmcDexVolume24h,
      expected,
    );
    data.markets.stale = true;
    assert.equal(
      tokenObservation(data, 'MU', fixtureNow).cmcDexVolume24h,
      null,
    );
    data.markets.stale = false;
    assert.equal(
      tokenObservation(data, 'MU', fixtureNow + 900001).cmcDexVolume24h,
      null,
    );
  }
});
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

const { parseSupplies, fetchSupplies } = await import(
  pathToFileURL(dir + '/token-supply.mjs')
);
const { tokenObservation, issuedCoverage } = await import(
  pathToFileURL(dir + '/token-observation.mjs')
);
const { TOKEN_PROGRAMS } = await import(pathToFileURL(dir + '/tokens.mjs'));
const supplyFixture = () => ({
  result: {
    context: { slot: 123456 },
    value: TOKENS.map(() => ({
      owner: TOKEN_PROGRAMS[1],
      executable: false,
      data: {
        parsed: {
          type: 'mint',
          info: { isInitialized: true, decimals: 6, supply: '12345000000' },
        },
      },
    })),
  },
});
test('Supply checks every allowlisted mint in bounded batches, validating program, precision and complete response', async () => {
  const raw = supplyFixture();
  const rows = parseSupplies(raw);
  assert.equal(Object.keys(rows).length, TOKENS.length);
  assert.equal(rows.TTWO.supply, 12345);
  assert.equal(rows.TTWO.slot, 123456);
  raw.result.value[0].owner = 'fake';
  assert.equal(parseSupplies(raw).MU, undefined);
  assert.throws(() =>
    parseSupplies({ result: { context: { slot: 1 }, value: [] } }),
  );
  assert.throws(() =>
    parseSupplies({ ...supplyFixture(), error: { code: 429 } }),
  );
  for (const supply of ['-1', '18446744073709551616', 'abc', null]) {
    const invalid = supplyFixture();
    invalid.result.value[0].data.parsed.info.supply = supply;
    assert.equal(parseSupplies(invalid).MU, undefined);
  }
  const zero = supplyFixture();
  zero.result.value[0].data.parsed.info.supply = '0';
  assert.equal(parseSupplies(zero).MU.supply, 0);
  let offset = 0;
  const received = await fetchSupplies(
    'https://rpc.example',
    async (url, opts) => {
      const body = JSON.parse(opts.body),
        batch = TOKENS.slice(offset, offset + 100);
      assert.equal(body.method, 'getMultipleAccounts');
      assert.ok(body.params[0].length <= 100);
      assert.deepEqual(
        body.params[0],
        batch.map((t) => t.mint),
      );
      assert.equal(body.params[1].commitment, 'finalized');
      assert.equal(opts.redirect, 'manual');
      const fixture = supplyFixture();
      fixture.result.value = fixture.result.value.slice(
        offset,
        offset + batch.length,
      );
      offset += batch.length;
      return Response.json(fixture);
    },
  );
  assert.equal(offset, TOKENS.length);
  assert.equal(Object.keys(received).length, TOKENS.length);
});
const source = (data, now) => ({
  data,
  fetchedAt: now,
  stale: false,
  error: null,
});
test('TTWO without CMC gets pool price, change, volume and chain supply; value is separately calculated', () => {
  const now = Date.now();
  const data = {
    supplies: source(parseSupplies(supplyFixture(), now), now),
    markets: source({}, now),
    pools: source(
      {
        TTWO: [{ price: 218, change24h: -1, volume24h: 0, liquidity: 100000 }],
      },
      now,
    ),
    prices: source({}, now),
  };
  const row = tokenObservation(data, 'TTWO', now);
  assert.equal(row.price, 218);
  assert.equal(row.priceSource, 'DEX pool');
  assert.equal(row.change24h, -1);
  assert.equal(row.volume24h, 0);
  assert.equal(row.issuedValue, 218 * 12345);
  assert.equal(row.cmc, undefined);
  const coverage = issuedCoverage(data, now);
  assert.equal(coverage.supplyCount, TOKENS.length);
  assert.equal(coverage.valued.length, 1);
  assert.equal(coverage.total, 218 * 12345);
  data.pools.stale = true;
  assert.equal(tokenObservation(data, 'TTWO', now).price, null);
  assert.equal(issuedCoverage(data, now).total, null);
});
test('Stale supply or prices never produce a current valuation; timestamped DefiLlama fallback is bounded', () => {
  const now = Date.now();
  const data = {
    supplies: source(parseSupplies(supplyFixture(), now), now),
    markets: source({}, now),
    pools: source({}, now),
    prices: source(
      { TTWO: { price: 210, timestamp: now, confidence: 0.99 } },
      now,
    ),
  };
  assert.equal(tokenObservation(data, 'TTWO', now).priceSource, 'DefiLlama');
  data.supplies.fetchedAt = now - 300001;
  assert.equal(tokenObservation(data, 'TTWO', now).issuedValue, null);
  data.prices.data.TTWO.timestamp = now - 900001;
  assert.equal(tokenObservation(data, 'TTWO', now).priceDelayed, true);
  assert.equal(tokenObservation(data, 'TTWO', now).issuedValue, null);
  data.prices.data.TTWO.timestamp = now - 96 * 3600000 - 1;
  assert.equal(tokenObservation(data, 'TTWO', now).price, null);
  assert.equal(issuedCoverage(null, now).total, null);
});
test('CMC circulating market cap never replaces total issued value or leaks into supply', () => {
  const now = fixtureNow,
    markets = parseTokenMarkets(cmc, now);
  const data = {
    markets: source(markets, now),
    supplies: source(parseSupplies(supplyFixture(), now), now),
    pools: source({}, now),
    prices: source({}, now),
  };
  const row = tokenObservation(data, 'MU', now);
  assert.equal(row.price, markets.MU.price);
  assert.equal(row.issuedValue, 12345 * markets.MU.price);
  assert.equal(row.cmc.marketCap, markets.MU.marketCap);
  assert.notEqual(row.supply.supply, markets.MU.supply);
});

test('Token-level volume covers all 41 captured Backpack mints and includes GRND and BABA', async () => {
  const captured = JSON.parse(
    await readFile(
      new URL('../research/volume-28/all-token-volumes.json', import.meta.url),
      'utf8',
    ),
  );
  const volumes = Object.assign(
    {},
    ...captured.responses.map(parseTokenVolumes),
  );
  assert.equal(Object.keys(volumes).length, 41);
  assert.ok(volumes.GRND.usd24h > 20_000_000);
  assert.ok(volumes.BABA.usd24h > 0);
  for (const [symbol, volume] of Object.entries(volumes))
    assert.equal(
      volume.mint,
      BACKPACK_TOKENS.find((t) => t.symbol === symbol).mint,
    );
});
test('Volume parsing rejects wrong chain, fake mint, negative data and duplicates while preserving zero', () => {
  const row = {
    id: 'solana_' + mint,
    type: 'token',
    attributes: { address: mint, volume_usd: { h24: '0' } },
  };
  assert.equal(parseTokenVolumes({ data: [row] }).MU.usd24h, 0);
  assert.deepEqual(
    parseTokenVolumes({ data: [{ ...row, id: 'ethereum_' + mint }] }),
    {},
  );
  assert.deepEqual(
    parseTokenVolumes({
      data: [{ ...row, attributes: { ...row.attributes, address: 'fake' } }],
    }),
    {},
  );
  for (const value of [-1, null, 'NaN', 'Infinity', false, '']) {
    assert.deepEqual(
      parseTokenVolumes({
        data: [
          {
            ...row,
            attributes: { ...row.attributes, volume_usd: { h24: value } },
          },
        ],
      }),
      {},
    );
  }
  assert.throws(() => parseTokenVolumes({ data: [row, row] }), /Duplicate/);
  assert.throws(() => parseTokenVolumes({ data: null }), /Invalid/);
});
test('Both onchain transports parse all 41 mints in bounded batches', async () => {
  const captured = JSON.parse(
    await readFile(
      new URL('../research/volume-28/all-token-volumes.json', import.meta.url),
      'utf8',
    ),
  );
  for (const key of [undefined, 'test-private']) {
    const calls = [];
    const result = await fetchTokenVolumes(
      async (url, options) => {
        const u = new URL(url);
        calls.push(u);
        assert.equal(
          u.hostname,
          key ? 'pro-api.coingecko.com' : 'api.geckoterminal.com',
        );
        assert.ok(u.pathname.split('/').at(-1).split(',').length <= 30);
        assert.equal(options.headers['x-api-key'], undefined);
        assert.equal(options.headers['x-cg-pro-api-key'], key);
        return Response.json(captured.responses[calls.length - 1]);
      },
      key,
      TOKENS.slice(0, 41),
    );
    assert.equal(calls.length, 2);
    assert.equal(Object.keys(result).length, 41);
  }
});
test('Onchain volume stays separate from CMC/pool scope and never uses stale values', () => {
  const now = Date.now();
  const data = {
    markets: source({}, now),
    pools: source({ MU: [{ volume24h: 123 }] }, now),
    volumes: source({ MU: { usd24h: 456, mint } }, now),
  };
  assert.equal(tokenObservation(data, 'MU', now).onchainVolume24h, 456);
  assert.equal(tokenObservation(data, 'MU', now).volume24h, 123);
  data.volumes.stale = true;
  assert.equal(tokenObservation(data, 'MU', now).onchainVolume24h, null);
  data.volumes.stale = false;
  data.volumes.fetchedAt = now - 300001;
  assert.equal(tokenObservation(data, 'MU', now).onchainVolume24h, null);
});

test('Issuer totals partition one Solana total without merging wrappers or counting underlying market cap', () => {
  const now = Date.now(),
    chosen = ['MU', 'MUx', 'MUon'];
  const supplies = Object.fromEntries(
    chosen.map((s, i) => [s, { supply: (i + 1) * 10, valuationSafe: true }]),
  );
  const pools = Object.fromEntries(
    chosen.map((s) => [s, [{ price: 2, liquidity: 100 }]]),
  );
  const data = {
    supplies: source(supplies, now),
    pools: source(pools, now),
    prices: source({}, now),
    markets: source({}, now),
  };
  assert.equal(issuedCoverage(data, now).total, 120);
  assert.equal(issuedCoverage(data, now, 'backpack').total, 20);
  assert.equal(issuedCoverage(data, now, 'xstocks').total, 40);
  assert.equal(issuedCoverage(data, now, 'ondo').total, 60);
  data.supplies.data.MUon.valuationSafe = false;
  assert.equal(issuedCoverage(data, now).total, 60);
  assert.equal(issuedCoverage(data, now, 'ondo').total, null);
});
test('Adjusted mint units stay visible as supply but cannot produce an unverified valuation', () => {
  const fixture = supplyFixture(),
    info =
      fixture.result.value[TOKENS.findIndex((t) => t.symbol === 'MUx')].data
        .parsed.info;
  info.extensions = [
    {
      extension: 'scaledUiAmountConfig',
      state: {
        multiplier: '1.2',
        newMultiplier: '1.5',
        newMultiplierEffectiveTimestamp: 99999999999,
      },
    },
  ];
  assert.equal(parseSupplies(fixture).MUx.valuationSafe, false);
  info.extensions[0].state.multiplier = '1';
  assert.equal(parseSupplies(fixture).MUx.valuationSafe, true);
  info.extensions[0].state.newMultiplierEffectiveTimestamp = 0;
  assert.equal(parseSupplies(fixture).MUx.valuationSafe, false);
});
test('A failed issuer page never suppresses fresh data from another page', async () => {
  const { mergeMarketPages } = await import(
    pathToFileURL(dir + '/market-data.mjs')
  );
  const now = Date.now(),
    good = {
      catalog: source([], now),
      markets: source({}, now),
      prices: source({}, now),
      pools: source({ MU: [{ price: 2 }] }, now),
      supplies: source({ MU: { supply: 10 } }, now),
    };
  const bad = {
    ...good,
    pools: { ...source({ MUx: [{ price: 999 }] }, now), stale: true },
    supplies: { ...source({ MUx: { supply: 20 } }, now), stale: true },
  };
  const merged = mergeMarketPages([good, bad]);
  assert.equal(issuedCoverage(merged, now).total, 20);
  assert.equal(merged.pools.data.MUx, undefined);
  assert.ok(merged.pools.error);
});

test('Live GOOGLon supply agrees with the independent Solana indexer; adjusted units stay separate', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../research/market-integrity/audit-2026-09-12.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const page = audit.records.find((p) =>
    p.rows.some((r) => r.symbol === 'GOOGLon'),
  );
  const tokens = page.rows.map((r) =>
    TOKENS.find((t) => t.symbol === r.symbol),
  );
  const supply = parseSupplies(
    page.rpc,
    Date.parse(audit.startedAt),
    tokens,
  ).GOOGLon;
  const indexed = audit.samples.find((r) => r.symbol === 'GOOGLon').gecko.data
    .attributes;
  assert.equal(supply.supply, Number(indexed.normalized_total_supply));
  assert.equal(supply.amount, indexed.total_supply.split('.')[0]);
  assert.ok(supply.uiSupply > supply.supply);
  assert.equal(supply.valuationSafe, false);
  // A provider's global market cap is never interpreted as Solana supply.
  assert.notEqual(
    supply.supply,
    Number(indexed.market_cap_usd) / Number(indexed.price_usd),
  );
});

test('GOOGLon gains a same-source 24h change without using its illiquid pool price', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../research/market-integrity/audit-2026-09-12.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const page = audit.records.find((p) =>
    p.rows.some((r) => r.symbol === 'GOOGLon'),
  );
  const now = Date.parse(audit.completedAt);
  const prices = parsePrices(page.llama, now),
    history = parsePrices(page.history, now);
  const data = {
    markets: source({}, now),
    supplies: source({}, now),
    pools: source(parsePools(page.dex), now),
    prices: source(prices, now),
    history: source(history, now),
  };
  const observed = tokenObservation(data, 'GOOGLon', now);
  assert.equal(observed.priceSource, 'DefiLlama');
  assert.equal(observed.price, prices.GOOGLon.price);
  assert.equal(
    observed.change24h,
    (prices.GOOGLon.price / history.GOOGLon.price - 1) * 100,
  );
  assert.ok(observed.change24h > 2 && observed.change24h < 3);
  history.GOOGLon.timestamp -= 3600000;
  assert.equal(tokenObservation(data, 'GOOGLon', now).change24h, null);
  assert.equal(
    tokenObservation(data, 'GOOGLon', now).price,
    prices.GOOGLon.price,
  );
});

test('Per-token pool endpoint restores multiple pools, deduplicates addresses, and never assigns a base price to the quote asset', async () => {
  const { fetchTokenPools } = await import(
    pathToFileURL(dir + '/market-data.mjs')
  );
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../research/market-integrity/audit-2026-09-12.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const sample = audit.samples.find((s) => s.symbol === 'MU');
  const token = TOKENS.find((t) => t.symbol === 'MU');
  const pools = await fetchTokenPools(token, async (url) => {
    assert.equal(
      String(url),
      'https://api.dexscreener.com/token-pairs/v1/solana/' + token.mint,
    );
    return Response.json([...sample.pairs, ...sample.pairs]);
  });
  assert.equal(
    pools.length,
    new Set(sample.pairs.map((p) => p.pairAddress)).size,
  );
  assert.ok(pools.length > 1);
  const pair = structuredClone(sample.pairs[0]);
  pair.baseToken.address = TOKENS.find((t) => t.symbol === 'SPCX').mint;
  pair.quoteToken.address = token.mint;
  const quote = parsePools([pair], [token]).MU[0];
  assert.equal(quote.side, 'quote');
  assert.equal(quote.price, null);
  assert.equal(quote.change24h, null);
  assert.equal(quote.liquidity, pair.liquidity.usd);
});

test('Old batches do not age out fresh prices and supply in another batch', async () => {
  const { mergeMarketPages } = await import(
    pathToFileURL(dir + '/market-data.mjs')
  );
  const now = Date.now();
  const page = (symbol, time) => ({
    catalog: source([], time),
    markets: source({}, time),
    pools: source({}, time),
    prices: source(
      { [symbol]: { price: 2, timestamp: time, confidence: 1 } },
      time,
    ),
    supplies: source({ [symbol]: { supply: 10, valuationSafe: true } }, time),
  });
  const merged = mergeMarketPages([
    page('MU', now - 600000),
    page('SPCX', now),
  ]);
  assert.equal(tokenObservation(merged, 'MU', now).price, null);
  assert.equal(tokenObservation(merged, 'SPCX', now).issuedValue, 20);
});

test('Low-confidence prices and stale historical sources cannot manufacture a daily change', () => {
  const now = Date.now();
  const data = {
    markets: source({}, now),
    supplies: source({}, now),
    pools: source({}, now),
    prices: source({ MU: { price: 10, confidence: 0.2, timestamp: now } }, now),
    history: source(
      { MU: { price: 5, confidence: 1, timestamp: now - 86400000 } },
      now,
    ),
  };
  assert.equal(tokenObservation(data, 'MU', now).price, null);
  data.prices.data.MU.confidence = 1;
  data.history.stale = true;
  assert.equal(tokenObservation(data, 'MU', now).price, 10);
  assert.equal(tokenObservation(data, 'MU', now).change24h, null);
});

test('Divergent quote units never enter issuer valuation totals; adjustment windows suppress unconfirmed returns', () => {
  const now = Date.now();
  const data = {
    markets: source({}, now),
    supplies: source({ MU: { supply: 100, valuationSafe: true } }, now),
    pools: source({ MU: [{ price: 1000, liquidity: 10000 }] }, now),
    prices: source({ MU: { price: 100, confidence: 1, timestamp: now } }, now),
    history: source(
      { MU: { price: 90, confidence: 1, timestamp: now - 86400000 } },
      now,
    ),
  };
  const row = tokenObservation(data, 'MU', now);
  assert.equal(row.priceConflict, true);
  assert.equal(row.price, 100);
  assert.equal(row.issuedValue, null);
  assert.equal(issuedCoverage(data, now).total, null);
  data.supplies.data.MU.adjustmentAt = now - 3600000;
  assert.equal(tokenObservation(data, 'MU', now).change24h, null);
});

const { calculateHolderTier, tierForValue } = await import(
  pathToFileURL(dir + '/holder-tier.mjs')
);
const { TIER_WRITE_SQL } = await import(
  pathToFileURL(dir + '/holder-tier-server.mjs')
);
test('holder tiers cover each boundary and never rank zero or invalid values', () => {
  for (const [value, tier] of [
    [0, null],
    [-1, null],
    [NaN, null],
    [Infinity, null],
    [0.01, 'bronze'],
    [99.99, 'bronze'],
    [100, 'silver'],
    [999.99, 'silver'],
    [1000, 'gold'],
    [9999.99, 'gold'],
    [10000, 'platinum'],
    [99999.99, 'platinum'],
    [100000, 'diamond'],
  ])
    assert.equal(tierForValue(value), tier);
});
function tierFixture() {
  const now = Date.now();
  const source = (data) => ({
    data,
    fetchedAt: now,
    stale: false,
    error: null,
  });
  return {
    now,
    holdings: [
      {
        symbol: 'MU',
        raw_amount: '2000000',
        decimals: 6,
        verified_at: now,
        slot: 1,
      },
    ],
    data: {
      markets: source({}),
      catalog: source([]),
      pools: source({ MU: [] }),
      prices: source({ MU: { price: 600, confidence: 1, timestamp: now } }),
      supplies: source({ MU: { supply: 10000, valuationSafe: true } }),
    },
  };
}
test('holder tier uses verified raw units, prices all holdings and bounds expiry', () => {
  const { now, holdings, data } = tierFixture();
  assert.deepEqual(calculateHolderTier(holdings, data, now), {
    tier: 'gold',
    expiresAt: now + 120000,
  });
  holdings[0].ui_amount = '999999999';
  assert.equal(calculateHolderTier(holdings, data, now).tier, 'gold');
  holdings.push({ ...holdings[0], symbol: 'SPCX' });
  assert.equal(calculateHolderTier(holdings, data, now).tier, null);
});
test('holder tier fails closed for stale, conflicting, ambiguous and pool-only valuations', () => {
  const changes = [
    (f) => (f.holdings[0].verified_at -= 180000),
    (f) => (f.holdings[0].verified_at += 10000),
    (f) => (f.holdings[0].raw_amount = null),
    (f) => (f.holdings[0].raw_amount = '-5'),
    (f) => (f.holdings[0].symbol = 'fake'),
    (f) => (f.holdings[0].decimals = 99),
    (f) => (f.data.supplies.stale = true),
    (f) => (f.data.supplies.data.MU.valuationSafe = false),
    (f) => delete f.data.supplies.data.MU.valuationSafe,
    (f) => (f.data.prices.data.MU.confidence = 0.2),
    (f) => (f.data.prices.fetchedAt -= 300001),
    (f) => (f.data.pools.data.MU = [{ price: 1000 }]),
    (f) => {
      f.data.prices.data = {};
      f.data.pools.data.MU = [{ price: 600 }];
    },
    (f) => f.holdings.push({ ...f.holdings[0] }),
  ];
  for (const change of changes) {
    const f = tierFixture();
    change(f);
    assert.equal(calculateHolderTier(f.holdings, f.data, f.now).tier, null);
  }
});
test('tier migration preserves users, defaults private, and rejects writes for changed snapshots', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    "CREATE TABLE community_members (id TEXT PRIMARY KEY, suspended INTEGER, verified_until INTEGER); CREATE TABLE community_holdings (member_id TEXT,symbol TEXT,verified_at INTEGER); INSERT INTO community_members VALUES ('a',0,9999999999999); INSERT INTO community_holdings VALUES ('a','MU',1000)",
  );
  const migration = await readFile(
    new URL('../drizzle/0008_hot_reavers.sql', import.meta.url),
    'utf8',
  );
  db.exec(migration);
  assert.equal(
    db.prepare('SELECT show_value_badge FROM community_members').get()
      .show_value_badge,
    0,
  );
  const write = db.prepare(TIER_WRITE_SQL);
  assert.equal(write.get('gold', 5000, 'a', 1000, 1, 1000).value_tier, 'gold');
  db.exec('UPDATE community_holdings SET verified_at=2000');
  assert.equal(write.get('diamond', 5000, 'a', 1000, 1, 1000), undefined);
  db.exec("INSERT INTO community_holdings VALUES ('a','SPCX',2000)");
  assert.equal(write.get('diamond', 5000, 'a', 1000, 1, 2000), undefined);
  db.exec('UPDATE community_members SET suspended=1');
  assert.equal(write.get('diamond', 5000, 'a', 1000, 2, 2000), undefined);
  db.close();
});
test('public author queries reveal tiers only with opt-in, fresh verification and fresh tier', async () => {
  const raw = await readFile(
    new URL('../lib/community-server.ts', import.meta.url),
    'utf8',
  );
  const sql = raw.match(/export const authorColumns =\s*'([^']+)'/)[1];
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE community_members (alias TEXT,avatar_key TEXT,show_badge INTEGER,show_value_badge INTEGER,qualifying_symbol TEXT,verified_until INTEGER,suspended INTEGER,value_tier TEXT,value_tier_expires_at INTEGER)',
  );
  const now = Date.now();
  db.prepare('INSERT INTO community_members VALUES (?,?,?,?,?,?,?,?,?)').run(
    'Alias',
    null,
    0,
    0,
    'MU',
    now + 60000,
    0,
    'gold',
    now + 60000,
  );
  const get = () =>
    db.prepare('SELECT ' + sql + ' FROM community_members m').get(now);
  assert.equal(get().value_tier, null);
  db.exec('UPDATE community_members SET show_value_badge=1');
  assert.equal(get().value_tier, 'gold');
  db.exec('UPDATE community_members SET value_tier_expires_at=0');
  assert.equal(get().value_tier, null);
  db.prepare(
    'UPDATE community_members SET value_tier_expires_at=?,verified_until=0',
  ).run(now + 60000);
  assert.equal(get().value_tier, null);
  db.prepare('UPDATE community_members SET verified_until=?,suspended=1').run(
    now + 60000,
  );
  assert.equal(get().value_tier, null);
  db.close();
});

const headlines = await import(pathToFileURL(dir + '/headline-cache.mjs'));
function newsDatabase() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    'CREATE TABLE market_cache (key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)',
  );
  const db = {
    prepare(query) {
      return {
        bind(...args) {
          return {
            async first() {
              return sql.prepare(query).get(...args) || null;
            },
            async all() {
              return { results: sql.prepare(query).all(...args) };
            },
            async run() {
              return sql.prepare(query).run(...args);
            },
          };
        },
      };
    },
  };
  return {
    sql,
    db,
    row: (key) =>
      sql.prepare('SELECT * FROM market_cache WHERE key=?').get(key),
  };
}
function newsXml(provider, title = 'Micron latest headline') {
  const link =
    provider === 'google'
      ? 'https://news.google.com/rss/articles/test-story'
      : 'https://finance.yahoo.com/news/micron-story';
  return `<rss><item><title>${title}${provider === 'google' ? ' - Reuters' : ''}</title><pubDate>${new Date(Date.now() - 10000).toUTCString()}</pubDate><link>${link}</link>${provider === 'google' ? '<source url="https://reuters.com">Reuters</source>' : ''}</item></rss>`;
}
test('Google recovers headlines despite Yahoo cooldown, then shares the successful cache', async () => {
  const f = newsDatabase(),
    keys = headlines.headlineKeys('MU');
  let calls = [];
  f.sql
    .prepare('INSERT INTO market_cache VALUES (?,NULL,0,?)')
    .run(keys[1], Date.now() + 600000);
  const fetcher = async (url) => {
    calls.push(new URL(url).hostname);
    return new Response(newsXml('google'));
  };
  await headlines.refreshHeadlineSources(f.db, 'MU', fetcher);
  assert.deepEqual(calls, ['news.google.com']);
  assert.equal(
    headlines.cachedHeadlines(f.row(keys[0]))[0].publisher,
    'Reuters',
  );
  assert.equal(headlines.headlineStatus(keys.map(f.row)).unavailable, false);
  await headlines.refreshHeadlineSources(f.db, 'MU', fetcher);
  assert.equal(calls.length, 1);
  assert.equal(headlines.headlinesDue(keys.map(f.row)), false);
  f.sql.close();
});
test('Yahoo fallback works when Google fails and both provider Retry-After windows are honored', async () => {
  const f = newsDatabase(),
    keys = headlines.headlineKeys('MU');
  let calls = [];
  await headlines.refreshHeadlineSources(f.db, 'MU', async (url) => {
    const host = new URL(url).hostname;
    calls.push(host);
    return host === 'news.google.com'
      ? new Response(null, { status: 429, headers: { 'Retry-After': '600' } })
      : new Response(newsXml('yahoo'));
  });
  assert.deepEqual(calls, ['news.google.com', 'feeds.finance.yahoo.com']);
  assert.equal(headlines.cachedHeadlines(f.row(keys[1])).length, 1);
  assert.equal(headlines.headlineStatus(keys.map(f.row)).unavailable, false);
  assert.ok(f.row(keys[0]).retry_after >= Date.now() + 590000);
  await headlines.refreshHeadlineSources(f.db, 'MU', async () => {
    throw Error('Must respect cooldown and fresh cache');
  });
  assert.equal(headlines.cachedHeadlines(f.row(keys[1])).length, 1);
  f.sql.close();
});
test('both-provider failure retains cached headlines and reports unavailable rather than empty success', async () => {
  const f = newsDatabase(),
    keys = headlines.headlineKeys('MU');
  const old = [
    {
      id: 'old',
      title: 'Micron saved headline',
      publisher: 'Reuters',
      url: 'https://reuters.com/saved',
      published_at: Date.now() - 3600000,
      symbols: ['MU'],
    },
  ];
  f.sql
    .prepare('INSERT INTO market_cache VALUES (?,?,?,0)')
    .run(keys[0], JSON.stringify(old), Date.now() - 3600000);
  let calls = 0;
  await headlines.refreshHeadlineSources(f.db, 'MU', async () => {
    calls++;
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': '600' },
    });
  });
  assert.equal(calls, 2);
  assert.deepEqual(headlines.cachedHeadlines(f.row(keys[0])), old);
  assert.equal(headlines.headlineStatus(keys.map(f.row)).unavailable, true);
  assert.equal(headlines.headlinesDue(keys.map(f.row)), false);
  f.sql.close();
});
test('shorter successful feeds retain seven-day history, and invalid caches never report healthy', async () => {
  const f = newsDatabase(),
    keys = headlines.headlineKeys('MU');
  const old = [
    {
      id: 'old',
      title: 'Micron saved headline',
      publisher: 'Reuters',
      url: 'https://reuters.com/saved',
      published_at: Date.now() - 3600000,
      symbols: ['MU'],
    },
  ];
  f.sql
    .prepare('INSERT INTO market_cache VALUES (?,?,?,0)')
    .run(keys[0], JSON.stringify(old), Date.now() - 3600000);
  await headlines.refreshHeadlineSources(
    f.db,
    'MU',
    async () => new Response(newsXml('google')),
  );
  assert.equal(headlines.cachedHeadlines(f.row(keys[0])).length, 2);
  assert.equal(
    headlines.headlineStatus([{ payload: '{}', fetched_at: Date.now() }])
      .unavailable,
    true,
  );
  assert.notEqual(
    headlines.headlineIdentity({ publisher: 'Source', title: '삼성 발표' }),
    headlines.headlineIdentity({ publisher: 'Source', title: '미국 발표' }),
  );
  f.sql.close();
});

test('holder news route returns cached MU and SPCX stories with pagination and holdings isolation', async () => {
  const f = newsDatabase();
  f.sql.exec(
    "CREATE TABLE community_holdings(member_id TEXT,symbol TEXT); INSERT INTO community_holdings VALUES('owner','MU'),('owner','SPCX'),('other','SKHY')",
  );
  const now = Date.now();
  for (const symbol of ['MU', 'SPCX', 'SKHY']) {
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: symbol + i,
      title: symbol + ' headline ' + i,
      publisher: 'Reuters',
      url: 'https://news.google.com/rss/articles/' + symbol + i,
      published_at: now - 1000 - i,
      symbols: [symbol],
    }));
    f.sql
      .prepare('INSERT INTO market_cache VALUES(?,?,?,?)')
      .run(headlines.headlineKeys(symbol)[0], JSON.stringify(items), now, 0);
    f.sql
      .prepare('INSERT INTO market_cache VALUES(?,?,?,?)')
      .run(headlines.headlineKeys(symbol)[1], null, 0, now + 600000);
  }
  class AppError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }
  let signedIn = true;
  const deps = {
    '@/lib/community-server': {
      communityMember: async () => {
        if (!signedIn) throw new AppError('Sign in', 401);
        return { id: 'owner' };
      },
    },
    '@/lib/server': {
      db: () => ({
        prepare: (query) =>
          query.includes('FROM editorial_items')
            ? { bind: () => ({ all: async () => ({ results: [] }) }) }
            : f.db.prepare(query),
      }),
      rateLimit: async () => {},
    },
    '@/lib/headline-cache': headlines,
    '@/lib/holder-news': { NEWS_WINDOW_MS: 7 * 86400000 },
    '@/lib/editorial-server': { editorialColumns: '*', editorialRow: (x) => x },
    '@/lib/validation': { AppError },
  };
  const raw = await readFile(
    new URL('../app/api/holder-news/route.ts', import.meta.url),
    'utf8',
  );
  const output = ts.transpileModule(raw, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    (id) => {
      assert.ok(id in deps, id);
      return deps[id];
    },
    module,
    module.exports,
  );
  const get = (query) =>
    module.exports.GET(
      new Request('https://test.local/api/holder-news' + query),
    );
  const first = await (await get('')).json();
  assert.equal(first.items.length, 20);
  assert.equal(first.hasMore, true);
  assert.equal(first.unavailable, 0);
  assert.ok(first.items.every((n) => !n.symbols.includes('SKHY')));
  const spcx = await (await get('?symbol=SPCX')).json();
  assert.ok(spcx.items.every((n) => n.symbols.join() === 'SPCX'));
  const page2 = await (await get('?symbol=SPCX&offset=20')).json();
  assert.equal(page2.items.length, 5);
  assert.equal(page2.hasMore, false);
  const title = 'SpaceX To Get Weighting Boost In Nasdaq 100 After Rebalance';
  const copies = [
    {
      id: 'syndicated',
      title,
      publisher: 'Yahoo Finance',
      url: 'https://finance.yahoo.com/news/spacex-rebalance',
      published_at: now - 100,
      symbols: ['SPCX'],
    },
    {
      id: 'original',
      title,
      publisher: 'Bloomberg.com',
      url: 'https://www.bloomberg.com/news/articles/spacex-rebalance',
      published_at: now - 100,
      symbols: ['SPCX'],
    },
  ];
  f.sql
    .prepare('UPDATE market_cache SET payload=? WHERE key=?')
    .run(JSON.stringify(copies), headlines.headlineKeys('SPCX')[0]);
  const deduplicated = await (await get('?symbol=SPCX')).json();
  assert.equal(deduplicated.items.length, 1);
  assert.equal(deduplicated.items[0].publisher, 'Bloomberg.com');
  assert.equal(deduplicated.items[0].url, copies[1].url);
  assert.equal(deduplicated.items[0].published_at, now - 100);
  assert.equal(deduplicated.hasMore, false);
  assert.equal((await get('?symbol=SKHY')).status, 403);
  assert.equal((await get('?offset=-1')).status, 400);
  signedIn = false;
  assert.equal((await get('')).status, 401);
  f.sql.close();
});

test('market snapshots return before a blocked provider and concurrent readers share one refresh', async () => {
  const { marketSnapshot } = await import(
    pathToFileURL(dir + '/market-cache.mjs')
  );
  const f = newsDatabase(),
    jobs = [];
  let release,
    calls = 0;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const loader = async () => {
    calls++;
    await pending;
    return { MU: 100 };
  };
  try {
    const results = await Promise.race([
      Promise.all(
        Array.from({ length: 20 }, () =>
          marketSnapshot(f.db, 'test:fast', 60000, loader, (work) =>
            jobs.push(work),
          ),
        ),
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(Error('Snapshot waited for its provider')),
          500,
        ),
      ),
    ]);
    assert.ok(results.every((r) => r.data === null && r.refreshing));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    release();
    await Promise.all(jobs);
    const warm = await marketSnapshot(
      f.db,
      'test:fast',
      60000,
      loader,
      (work) => jobs.push(work),
    );
    assert.deepEqual(warm.data, { MU: 100 });
    assert.equal(warm.stale, false);
    assert.equal(warm.refreshing, false);
    assert.equal(calls, 1);
  } finally {
    release();
    await Promise.allSettled(jobs);
    f.sql.close();
  }
});
test('snapshot failure preserves stale data and respects the provider cooldown', async () => {
  const { marketSnapshot } = await import(
    pathToFileURL(dir + '/market-cache.mjs')
  );
  const f = newsDatabase(),
    jobs = [],
    now = Date.now();
  f.sql
    .prepare('INSERT INTO market_cache VALUES(?,?,?,?)')
    .run('test:cooldown', '{"MU":99}', now - 70000, now + 300000);
  let calls = 0;
  const result = await marketSnapshot(
    f.db,
    'test:cooldown',
    60000,
    async () => {
      calls++;
      return {};
    },
    (work) => jobs.push(work),
  );
  assert.equal(result.stale, true);
  assert.equal(result.refreshing, false);
  assert.deepEqual(result.data, { MU: 99 });
  assert.equal(calls, 0);
  assert.equal(jobs.length, 0);
  f.sql.close();
});

test('refreshing market snapshots retain valid observations without resetting their age', async () => {
  const { marketSnapshot } = await import(
    pathToFileURL(dir + '/market-cache.mjs')
  );
  const { mergeMarketPages } = await import(
    pathToFileURL(dir + '/market-data.mjs')
  );
  const f = newsDatabase(),
    jobs = [],
    now = Date.now(),
    observedAt = now - 130000;
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  f.sql
    .prepare('INSERT INTO market_cache VALUES(?,?,?,?)')
    .run(
      'test:refresh-window',
      JSON.stringify({ MUx: { supply: 10, valuationSafe: true } }),
      observedAt,
      0,
    );
  try {
    const supply = await marketSnapshot(
      f.db,
      'test:refresh-window',
      120000,
      async () => {
        await wait;
        return {};
      },
      (work) => jobs.push(work),
      now,
      300000,
    );
    assert.equal(supply.stale, false);
    assert.equal(supply.refreshing, true);
    assert.equal(supply.fetchedAt, observedAt);
    const page = {
      catalog: source([], now),
      markets: source({}, now),
      prices: source({}, now),
      pools: source({ MUx: [{ price: 2 }] }, observedAt),
      supplies: supply,
    };
    const merged = mergeMarketPages([page]);
    assert.equal(issuedCoverage(merged, now, 'xstocks').total, 20);
    assert.equal(merged.supplies.asOf.MUx, observedAt);
    assert.equal(
      issuedCoverage(merged, observedAt + 300001, 'xstocks').total,
      null,
    );
  } finally {
    release();
    await Promise.allSettled(jobs);
    f.sql.close();
  }
});

test('DEX rate-limit cooldown is shared across batches and token detail lookups', async () => {
  const f = newsDatabase();
  let requests = 0;
  try {
    await cachedMarket(f.db, 'dex-pools-v4:test:1', 240000, async () => {
      requests++;
      throw new SourceHttpError(
        'api.dexscreener.com',
        new Response('', { status: 429 }),
      );
    });
    for (const key of ['dex-pools-v4:test:2', 'token-pairs-v1:mint']) {
      const result = await cachedMarket(f.db, key, 120000, async () => {
        requests++;
        return {};
      });
      assert.equal(result.stale, true);
    }
    assert.equal(requests, 1);
  } finally {
    f.sql.close();
  }
});

test('coverage explains every excluded listing without overlap or zero filling', () => {
  const now = Date.now(),
    data = {
      markets: source({}, now),
      prices: source({}, now),
      pools: source({ MUx: [{ price: 2 }], AAPLx: [{ price: 3 }] }, now),
      supplies: source(
        {
          MUx: { supply: 10, valuationSafe: true },
          AAPLx: { supply: 10, valuationSafe: false },
          AAx: { supply: 10, valuationSafe: true },
        },
        now,
      ),
    };
  const c = issuedCoverage(data, now, 'xstocks');
  assert.equal(c.total, 20);
  assert.equal(c.valued.length, 1);
  assert.equal(c.missing.units, 1);
  assert.equal(c.missing.price, 1);
  assert.equal(
    c.rows.length,
    c.valued.length + Object.values(c.missing).reduce((a, b) => a + b, 0),
  );
});

test('Dated references recover estimates with original timestamps, without pretending to be live', () => {
  const now = Date.now(),
    at = now - 3 * 3600000;
  const data = {
    markets: source({}, now),
    pools: source({}, now),
    supplies: source({ MUx: { supply: 10, valuationSafe: true } }, now),
    prices: source(
      { MUx: { price: 100, confidence: 0.9, timestamp: at } },
      now,
    ),
    history: source(
      { MUx: { price: 90, confidence: 1, timestamp: at - 86400000 } },
      now,
    ),
  };
  const o = tokenObservation(data, 'MUx', now);
  assert.equal(o.issuedValue, 1000);
  assert.equal(o.priceTime, at);
  assert.equal(o.priceDelayed, true);
  assert.equal(o.change24h, null);
  data.pools.data.MUx = [{ price: 105, change24h: 2, liquidity: 10000 }];
  const fresh = tokenObservation(data, 'MUx', now);
  assert.equal(fresh.price, 105);
  assert.equal(fresh.priceSource, 'DEX pool');
  assert.equal(fresh.priceDelayed, false);
  assert.equal(fresh.priceConflict, false);
  delete data.pools.data.MUx;
  data.prices.data.MUx.timestamp = now - 96 * 3600000 - 1;
  assert.equal(tokenObservation(data, 'MUx', now).price, null);
  data.prices.data.MUx.timestamp = now + 60001;
  assert.equal(tokenObservation(data, 'MUx', now).price, null);
  data.prices.data.MUx.timestamp = at;
  data.supplies.data.MUx.adjustmentAt = at + 1000;
  assert.equal(tokenObservation(data, 'MUx', now).issuedValue, null);
  delete data.supplies.data.MUx.adjustmentAt;
  data.supplies.data.MUx.valuationSafe = false;
  assert.equal(tokenObservation(data, 'MUx', now).issuedValue, null);
  data.prices.stale = true;
  assert.equal(tokenObservation(data, 'MUx', now).price, null);
});

test('Dated prices cannot qualify a holder ranking even with fresh holdings and supply', () => {
  const now = Date.now();
  const data = {
    markets: source({}, now),
    pools: source({}, now),
    supplies: source({ MU: { supply: 100, valuationSafe: true } }, now),
    prices: source(
      { MU: { price: 100, confidence: 1, timestamp: now - 3600000 } },
      now,
    ),
  };
  const holdings = [
    { symbol: 'MU', raw_amount: '10000000', decimals: 6, verified_at: now },
  ];
  assert.equal(calculateHolderTier(holdings, data, now).tier, null);
});

test('Syndication matching keeps different stories, days and generic headlines separate', () => {
  const base = {
    publisher: 'Yahoo Finance',
    title: 'SpaceX To Get Weighting Boost In Nasdaq 100 After Rebalance',
    published_at: Date.UTC(2026, 8, 13, 3),
  };
  assert.equal(
    headlines.headlineStoryIdentity(base),
    headlines.headlineStoryIdentity({ ...base, publisher: 'Bloomberg.com' }),
  );
  assert.notEqual(
    headlines.headlineStoryIdentity(base),
    headlines.headlineStoryIdentity({
      ...base,
      published_at: base.published_at - 86400000,
    }),
  );
  assert.notEqual(
    headlines.headlineStoryIdentity(base),
    headlines.headlineStoryIdentity({
      ...base,
      title: base.title + ' Updated outlook',
    }),
  );
  assert.notEqual(
    headlines.headlineStoryIdentity({ ...base, title: 'Market update' }),
    headlines.headlineStoryIdentity({
      ...base,
      title: 'Market update',
      publisher: 'Bloomberg.com',
    }),
  );
  assert.equal(
    headlines.preferHeadlineSource(
      { publisher: 'Bloomberg.com' },
      { publisher: 'Yahoo Finance' },
    ),
    false,
  );
});

test('September 13 listings match the full enabled registry and verified finalized mints', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL('../research/token-audit/2026-09-13.json', import.meta.url),
      'utf8',
    ),
  );
  const enabled = audit.enabledAssets.flatMap((a) =>
    a.tokens
      .filter(
        (t) =>
          t.blockchain === 'Solana' && (t.depositEnabled || t.withdrawEnabled),
      )
      .map((t) => `${a.symbol.slice(0, -3)}:${t.contractAddress}`),
  );
  assert.deepEqual(
    BACKPACK_TOKENS.map((t) => `${t.symbol}:${t.mint}`).sort(),
    enabled.sort(),
  );
  assert.equal(BACKPACK_TOKENS.length, 44);
  const listings = parseListings(audit.enabledAssets, []);
  for (const symbol of ['DKNG', 'FLWS', 'WEN']) {
    const token = BACKPACK_TOKENS.find((t) => t.symbol === symbol);
    const index = audit.newAssets.findIndex((a) => a.symbol === symbol + '.US');
    const account = audit.chain.result.value[index];
    const metadata = account.data.parsed.info.extensions.find(
      (e) => e.extension === 'tokenMetadata',
    ).state;
    assert.equal(account.owner, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    assert.equal(metadata.mint, token.mint);
    assert.equal(metadata.symbol, symbol);
    assert.equal(
      metadata.updateAuthority,
      '2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a',
    );
    assert.ok(metadata.name.endsWith(' - Backpack Securities'));
    assert.ok(listings.find((t) => t.symbol === symbol)?.deposit);
    assert.ok(
      TOKENS.find(
        (t) =>
          t.mint === token.mint &&
          t.issuer === 'backpack' &&
          t.underlyingSymbol === symbol,
      ),
    );
  }
  assert.equal(
    TOKENS.some((t) => t.symbol === 'FLWG'),
    false,
  );
});
