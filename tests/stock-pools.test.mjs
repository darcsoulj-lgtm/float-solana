import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { bundle } from './helpers/bundle.mjs';
const api = await bundle(
  "export * from './lib/stock-pools'; export {parsePools,fetchPools,fetchTokenPools} from './lib/market-data'; export {fetchBackpackPools} from './lib/backpack-dashboard'; export {issuerDashboard} from './lib/issuer-dashboard'; export {tokenObservation} from './lib/token-observation'; export {readMarketBatch} from './lib/market-service'; export {tokenBatchKey} from './lib/backpack-registry'; export {TOKENS,ISSUERS,TOKEN_REVIEW_DATE} from './lib/tokens';",
);
const now = Date.now();
const meme = '3r3LqBy4oKPczGDajMQTeARV81hmpbCGiWU1mVEk54kw';
const stock = api.TOKENS.find((t) => t.symbol === 'METAx');
const usdc = api.POOL_SETTLEMENT_ASSETS.find((t) => t.symbol === 'USDC');
let counter = 0;
const pair = (base, quote, volume = 10) => ({
  chainId: 'solana',
  pairAddress:
    'A'.repeat(31) + '123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[counter++ % 32],
  dexId: 'raydium',
  baseToken: { address: base, symbol: 'spoofed' },
  quoteToken: { address: quote, symbol: 'spoofed' },
  priceUsd: '100',
  priceChange: { h24: 2 },
  volume: { h24: volume },
  liquidity: { usd: 20 },
  pairCreatedAt: now - 1000,
});
const source = (data) => ({ data, fetchedAt: now, stale: false, error: null });
const market = (pools) => ({
  pools: source(pools),
  volumes: source(
    Object.fromEntries(
      Object.entries(pools)
        .filter(([, rows]) => rows.length > 0)
        .map(([symbol, rows]) => {
        const token = api.TOKENS.find((candidate) => candidate.symbol === symbol);
        return [
          symbol,
          {
            usd24h: rows.reduce((total, row) => total + (row.volume24h ?? 0), 0),
            liquidityUsd: rows.reduce((total, row) => total + (row.liquidity ?? 0), 0),
            mint: token.mint,
          },
        ];
        }),
    ),
  ),
  prices: source({}),
  supplies: source({}),
  markets: source({}),
  catalog: source([]),
});

void test('The reported LIZM/METAx pair and reversed or spoofed versions never qualify', () => {
  assert.equal(stock.mint, 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu');
  const reported = {
    ...pair(meme, stock.mint),
    pairAddress: '3MTB5DMjsQDMcqisagTVUED51GnSfvGe3iMjLwe96rZ1',
  };
  const reversed = pair(stock.mint, meme);
  for (const symbol of ['USDC', 'SOL', 'MU', 'METAx']) {
    reported.baseToken.symbol = symbol;
    reversed.quoteToken.symbol = symbol;
    assert.deepEqual(
      api.parsePools([reported, reversed], [stock])[stock.symbol],
      [],
    );
  }
});

void test('Every reviewed settlement mint works in both orientations; labels come from trusted registry', () => {
  for (const asset of api.POOL_SETTLEMENT_ASSETS) {
    const rows = api.parsePools(
      [pair(stock.mint, asset.mint), pair(asset.mint, stock.mint)],
      [stock],
    )[stock.symbol];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].quote, asset.symbol);
    assert.equal(rows[0].price, 100);
    assert.equal(
      rows[1].price,
      null,
      'Counterparty price must never become the stock price',
    );
    assert.equal(rows[1].change24h, null);
  }
  const wrongChain = { ...pair(stock.mint, usdc.mint), chainId: 'ethereum' };
  assert.deepEqual(
    api.parsePools(
      [wrongChain, pair(stock.mint, stock.mint), pair(stock.mint, 'invalid')],
      [stock],
    )[stock.symbol],
    [],
  );
});

void test('All issuers exclude meme activity from prices, totals and recent pools while retaining real zero', () => {
  for (const issuer of api.ISSUERS) {
    const token = api.TOKENS.find((t) => t.issuer === issuer.id);
    const bad = pair(meme, token.mint, 9999999);
    const good = pair(token.mint, usdc.mint, 0);
    const d = market(api.parsePools([bad, good, good], [token]));
    const result = api.issuerDashboard(d, issuer.id, now);
    assert.equal(result.volume, 0);
    assert.equal(result.liquidity, 20);
    assert.deepEqual(
      result.recentPools.map((p) => p.address),
      [good.pairAddress],
    );
    const observation = api.tokenObservation(d, token.symbol, now);
    assert.equal(observation.poolVolume24h, 0);
    assert.equal(observation.liquidity, 20);
    const empty = market(api.parsePools([bad], [token]));
    assert.equal(api.issuerDashboard(empty, issuer.id, now).volume, null);
    assert.equal(api.tokenObservation(empty, token.symbol, now).price, null);
    d.pools.stale = true;
    d.volumes.stale = true;
    assert.equal(api.issuerDashboard(d, issuer.id, now).volume, null);
  }
});

void test('Cross-issuer and newly verified stocks qualify outside the requested batch on every fetch path', async () => {
  const extra = {
    ...stock,
    symbol: 'NEW',
    mint: 'B'.repeat(32),
    issuer: 'backpack',
  };
  const registry = [...api.TOKENS, extra];
  const raw = [pair(stock.mint, extra.mint)];
  const fetcher = async () => Response.json(raw);
  assert.equal(api.parsePools(raw, [stock])[stock.symbol].length, 0);
  assert.equal(
    (await api.fetchPools(fetcher, [stock], registry))[stock.symbol].length,
    1,
  );
  assert.equal((await api.fetchTokenPools(stock, fetcher, registry)).length, 1);
  assert.equal(
    (await api.fetchBackpackPools([stock], fetcher, registry))[stock.symbol]
      .length,
    1,
  );
  const other = api.TOKENS.find((t) => t.issuer === 'ondo');
  assert.equal(
    api.parsePools([pair(stock.mint, other.mint)], [stock])[stock.symbol]
      .length,
    1,
  );
});

void test('A stock-stock pool stays visible for both mints in the shared onchain index', () => {
  const [a, b] = api.TOKENS.filter((t) => t.issuer === 'backpack');
  const raw = pair(a.mint, b.mint, 75);
  const data = market(api.parsePools([raw, raw], [a, b]));
  assert.equal(api.tokenObservation(data, a.symbol, now).poolVolume24h, 75);
  assert.equal(api.tokenObservation(data, b.symbol, now).poolVolume24h, 75);
  assert.equal(api.issuerDashboard(data, 'backpack', now).volume, 150);
});

void test('A warm legacy pool cache cannot reintroduce excluded activity, including when refresh fails', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    'CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)',
  );
  const db = {
    prepare(query) {
      return {
        bind(...values) {
          return {
            async all() {
              return { results: sql.prepare(query).all(...values) };
            },
            async first() {
              return sql.prepare(query).get(...values) ?? null;
            },
            async run() {
              return sql.prepare(query).run(...values);
            },
          };
        },
      };
    },
  };
  const key = api.TOKEN_REVIEW_DATE + ':' + (await api.tokenBatchKey([stock]));
  const insert = sql.prepare('INSERT INTO market_cache VALUES(?,?,?,?)');
  for (const prefix of ['llama-prices-v3:', 'solana-supplies-v4:'])
    insert.run(prefix + key, '{}', now, now + 120000);
  insert.run(
    'dex-pools-v4:' + key,
    JSON.stringify({ [stock.symbol]: [{ volume24h: 9999999 }] }),
    now,
    now + 240000,
  );
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('', { status: 429 });
  };
  try {
    const result = await api.readMarketBatch(db, [stock], { history: false });
    assert.equal(calls, 1);
    assert.equal(result.pools.data, null);
    assert.ok(result.pools.error);
    assert.equal(
      api.tokenObservation({ ...market({}), ...result }, stock.symbol, now)
        .poolVolume24h,
      null,
    );
  } finally {
    globalThis.fetch = original;
    sql.close();
  }
});
