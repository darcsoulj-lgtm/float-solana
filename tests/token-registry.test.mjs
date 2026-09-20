import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))(
  'esbuild',
);
const root = new URL('../', import.meta.url).pathname;
const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './lib/backpack-registry'; export {parsePrices, fetchPrices, fetchHistoricalPrices} from './lib/market-data'; export {detectHoldings} from './lib/solana'; export {communityPostErrors} from './lib/community-post'; export {parseHeadlines, companyAliases} from './lib/holder-news'; export {headlineKeys} from './lib/headline-cache'; export {TOKENS} from './lib/tokens'; export {marketTokens,mergeMarketPages,parseListings} from './lib/market-data'; export {issuerDashboard} from './lib/issuer-dashboard'; export {trackedValuation} from './lib/token-observation';",
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
const audit = JSON.parse(
  await readFile(
    new URL('../research/token-audit/2026-09-13.json', import.meta.url),
    'utf8',
  ),
);
function fixture(
  symbol = 'NEXT',
  mint = 'NEXTQFNGQmoBdXSRGKJ8tTu7uPDasw5JDcfMmWniNfow',
) {
  const index = audit.newAssets.findIndex((a) => a.symbol === 'DKNG.US');
  const asset = structuredClone(audit.newAssets[index]);
  asset.symbol = symbol + '.US';
  asset.tokens[0].contractAddress = mint;
  const account = structuredClone(audit.chain.result.value[index]);
  const meta = account.data.parsed.info.extensions.find(
    (e) => e.extension === 'tokenMetadata',
  ).state;
  Object.assign(meta, {
    mint,
    symbol,
    name: 'Next Company - Backpack Securities',
  });
  const chain = { result: { context: { slot: 123 }, value: [account] } };
  return { asset, account, chain, mint, symbol };
}
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    'CREATE TABLE market_cache (key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)',
  );
  const db = {
    prepare: (query) => ({
      bind: (...args) => ({
        first: async () => sql.prepare(query).get(...args) ?? null,
        run: async () => sql.prepare(query).run(...args),
      }),
    }),
  };
  return { db, sql };
}
const source = (data) => ({
  data,
  fetchedAt: Date.now(),
  stale: false,
  error: null,
});
function overview(registry) {
  return {
    registry,
    pools: source({}),
    volumes: source({}),
    prices: source({}),
    history: source({}),
    supplies: source({}),
    catalog: source([]),
    markets: source({}),
  };
}

void test('Live-registry discovery verifies unseen mints then adds them without a source edit', async () => {
  const f = fixture();
  let calls = 0;
  const additions = await api.discoverBackpackListings(
    [],
    undefined,
    async (url, init) => {
      calls++;
      if (String(url).includes('/assets'))
        return Response.json([...audit.enabledAssets, f.asset]);
      const request = JSON.parse(init.body);
      assert.equal(request.method, 'getMultipleAccounts');
      assert.deepEqual(request.params, [
        [f.mint],
        { encoding: 'jsonParsed', commitment: 'finalized' },
      ]);
      return Response.json(f.chain);
    },
  );
  assert.equal(calls, 2);
  assert.equal(additions.length, 1);
  assert.equal(additions[0].symbol, 'NEXT');
  const registry = {
    additions,
    checkedAt: Date.now(),
    refreshing: false,
    delayed: false,
  };
  const d = overview(registry);
  d.prices.data.NEXT = { price: 12, timestamp: Date.now(), confidence: 1 };
  d.supplies.data.NEXT = { supply: 100, valuationSafe: true };
  d.pools.data.NEXT = [
    { address: 'next-pool', price: 12, volume24h: 40, liquidity: 50 },
  ];
  d.volumes.data.NEXT = { usd24h: 40, liquidityUsd: 50, mint: additions[0].mint };
  assert.equal(api.marketTokens(d).length, api.TOKENS.length + 1);
  assert.equal(
    api
      .issuerDashboard(d, 'backpack')
      .rows.find((r) => r.token.symbol === 'NEXT').value,
    1200,
  );
  assert.equal(api.issuerDashboard(d, 'backpack').volume, 40);
  assert.equal(api.trackedValuation(d).total, 1200);
  assert.ok(
    api.parseListings([f.asset], [], additions).find((t) => t.symbol === 'NEXT')
      .deposit,
  );
  assert.ok(
    api
      .marketTokens(api.mergeMarketPages([overview(undefined), d]))
      .some((t) => t.symbol === 'NEXT'),
  );
  assert.equal(
    api.TOKENS.some((t) => t.symbol === 'NEXT'),
    false,
    'seed registry is immutable',
  );
});

void test('Registry ignores non-Solana, disabled, missing and ambiguous addresses', () => {
  const f = fixture();
  for (const mutate of [
    (a) => (a.tokens[0].blockchain = 'Ethereum'),
    (a) => (a.tokens[0].contractAddress = null),
    (a) => {
      a.tokens[0].depositEnabled = false;
      a.tokens[0].withdrawEnabled = false;
    },
  ]) {
    const a = structuredClone(f.asset);
    mutate(a);
    assert.deepEqual(api.backpackCandidates([a]), []);
  }
  assert.deepEqual(api.backpackCandidates([f.asset, f.asset]), []);
  assert.throws(() => api.backpackCandidates({}), /Invalid/);
});

void test('Spoofed issuer, mint, ticker, decimals and non-mint accounts fail verification', () => {
  const f = fixture(),
    c = api.backpackCandidates([f.asset]);
  const changes = [
    (a) => (a.owner = 'fake'),
    (a) => (a.executable = true),
    (a) => (a.data.parsed.type = 'account'),
    (a) => (a.data.parsed.info.isInitialized = false),
    (a) => (a.data.parsed.info.decimals = 9),
    (a) =>
      (a.data.parsed.info.extensions.find(
        (e) => e.extension === 'tokenMetadata',
      ).state.updateAuthority = 'attacker'),
    (a) =>
      (a.data.parsed.info.extensions.find(
        (e) => e.extension === 'tokenMetadata',
      ).state.mint = 'wrong'),
    (a) =>
      (a.data.parsed.info.extensions.find(
        (e) => e.extension === 'tokenMetadata',
      ).state.symbol = 'wrong'),
    (a) =>
      (a.data.parsed.info.extensions.find(
        (e) => e.extension === 'tokenMetadata',
      ).state.name = 'Same ticker, different issuer'),
  ];
  for (const change of changes) {
    const chain = structuredClone(f.chain);
    change(chain.result.value[0]);
    assert.deepEqual(api.verifiedBackpackMints(c, chain), []);
  }
  assert.throws(
    () =>
      api.verifiedBackpackMints(c, {
        result: { context: { slot: 1 }, value: [] },
      }),
    /Incomplete/,
  );
});

void test('Repeated checks preserve ordering and do not duplicate, overwrite or reverify known identities', async () => {
  const f = fixture(),
    previous = api.verifiedBackpackMints(
      api.backpackCandidates([f.asset]),
      f.chain,
    );
  const conflict = structuredClone(f.asset);
  conflict.tokens[0].contractAddress =
    'FakeQFNGQmoBdXSRGKJ8tTu7uPDasw5JDcfMmWniNfow';
  let calls = 0;
  const next = await api.discoverBackpackListings(
    previous,
    undefined,
    async () => {
      calls++;
      return Response.json([...audit.enabledAssets, conflict]);
    },
  );
  assert.deepEqual(next, previous);
  assert.equal(calls, 1);
  assert.deepEqual(
    api
      .registryTokens({ additions: [...previous, ...previous] })
      .slice(api.TOKENS.length),
    previous,
  );
  assert.notEqual(
    await api.tokenBatchKey(api.TOKENS.slice(-10)),
    await api.tokenBatchKey([...api.TOKENS.slice(-10), ...previous]),
  );
});

void test('Concurrent visitors share one durable refresh; empty/rate-limited sources retain verified additions', async () => {
  const { db, sql } = database(),
    f = fixture();
  let calls = 0;
  const work = [];
  const fetcher = async (url) => {
    calls++;
    return Response.json(
      String(url).includes('/assets')
        ? [...audit.enabledAssets, f.asset]
        : f.chain,
    );
  };
  const before = await Promise.all(
    Array.from({ length: 5 }, () =>
      api.backpackRegistry(db, (p) => work.push(p), undefined, fetcher),
    ),
  );
  assert.ok(before.every((r) => r.refreshing));
  await Promise.all(work);
  const good = await api.backpackRegistry(
    db,
    (p) => work.push(p),
    undefined,
    fetcher,
  );
  assert.equal(calls, 2);
  assert.equal(good.additions[0].symbol, 'NEXT');
  assert.equal(good.refreshing, false);
  for (const response of [
    () => Response.json([]),
    () => new Response('', { status: 429, headers: { 'Retry-After': '300' } }),
  ]) {
    sql
      .prepare('UPDATE market_cache SET fetched_at=?,retry_after=0')
      .run(Date.now() - api.REGISTRY_REFRESH_MS - 1000);
    const pending = [];
    const stale = await api.backpackRegistry(
      db,
      (p) => pending.push(p),
      undefined,
      async () => response(),
    );
    assert.equal(stale.additions.length, 1);
    await Promise.all(pending);
    const saved = JSON.parse(
      sql
        .prepare('SELECT payload FROM market_cache WHERE key=?')
        .get(api.REGISTRY_KEY).payload,
    );
    assert.equal(saved[0].symbol, 'NEXT');
    const failed = await api.backpackRegistry(
      db,
      (p) => pending.push(p),
      undefined,
      async () => {
        throw Error('Should be cooling down');
      },
    );
    assert.equal(failed.additions.length, 1);
  }
  sql.close();
});

void test('New verified listings flow through live price adapters, wallet eligibility, discussions and company-matched news', async () => {
  const f = fixture();
  const additions = api.verifiedBackpackMints(
    api.backpackCandidates([f.asset]),
    f.chain,
  );
  const tokens = api.marketTokens(overview({ additions }));
  const now = Date.now();
  const fetchPrice = async (url) =>
    Response.json({
      coins: {
        ['solana:' + f.mint]: {
          price: 12,
          timestamp:
            (String(url).includes('/historical/') ? now - 86400000 : now) /
            1000,
          confidence: 1,
        },
      },
    });
  assert.equal((await api.fetchPrices(fetchPrice, tokens)).NEXT.price, 12);
  assert.equal(
    (await api.fetchHistoricalPrices(fetchPrice, tokens, now)).NEXT.price,
    12,
  );
  const wallet = '11111111111111111111111111111111';
  const holdings = await api.detectHoldings(
    wallet,
    undefined,
    async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.method === 'getMultipleAccounts')
        return Response.json(f.chain);
      const program = request.params[1].programId;
      return Response.json({
        result: {
          context: { slot: 123 },
          value:
            program === f.account.owner
              ? [
                  {
                    account: {
                      owner: program,
                      data: {
                        parsed: {
                          type: 'account',
                          info: {
                            mint: f.mint,
                            owner: wallet,
                            state: 'initialized',
                            tokenAmount: {
                              amount: '1250000',
                              decimals: 6,
                              uiAmount: 1.25,
                            },
                          },
                        },
                      },
                    },
                  },
                ]
              : [],
        },
      });
    },
    true,
    tokens,
  );
  assert.equal(holdings[0].symbol, 'NEXT');
  assert.equal(holdings[0].rawAmount, '1250000');
  assert.deepEqual(
    api.communityPostErrors(
      { topic: 'NEXT', title: 'Company update', body: '' },
      tokens,
    ),
    {},
  );
  assert.ok(
    api.communityPostErrors(
      { topic: 'SPOOF', title: 'Company update', body: '' },
      tokens,
    ).topic,
  );
  assert.ok(api.headlineKeys('NEXT', tokens).length);
  const xml = `<rss><item><title>Next Company announces results</title><pubDate>${new Date(now - 1000).toUTCString()}</pubDate><link>https://finance.yahoo.com/news/next-results</link></item></rss>`;
  assert.equal(api.parseHeadlines(xml, 'NEXT', now, 'yahoo', tokens).length, 1);
  assert.equal(
    api.parseHeadlines(
      xml.replace('Next Company', 'Unrelated Corporation'),
      'NEXT',
      now,
      'yahoo',
      tokens,
    ).length,
    0,
  );
});
