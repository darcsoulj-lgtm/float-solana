import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bundle } from './helpers/bundle.mjs';
const api = await bundle(
  "export * from './lib/pool-provider-adapters'; export * from './lib/pool-fallback'; export * from './lib/pool-venue-coverage'; export {TOKENS} from './lib/tokens';",
);
const mu = api.TOKENS.find((t) => t.symbol === 'MU' && t.issuer === 'backpack');
const usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const fixture = async (n) =>
  JSON.parse(
    await readFile(
      new URL('./fixtures/pool-backup/' + n + '.json', import.meta.url),
      'utf8',
    ),
  );
const pool = {
  address: 'FAJMCRnzrLqbBTf6waQDqFk219aoTYaLGtAZNEADCTym',
  dex: 'byreal',
  baseMint: mu.mint,
  quoteMint: usdc,
  quote: 'USDC',
  volume24h: 10000,
  liquidity: 100,
  price: null,
  change24h: null,
  url: '',
};

void test('captured Byreal and PancakeSwap responses use actual mints and USD volume, not display prices or token amounts', async () => {
  for (const provider of ['byreal', 'pancakeswap']) {
    const raw = await fixture(provider);
    const rows = api.parseProviderPools(
      provider,
      raw,
      [mu],
      api.TOKENS,
      [],
      Date.now(),
    ).MU;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].baseMint, mu.mint);
    assert.equal(rows[0].quoteMint, usdc);
    assert.equal(rows[0].price, null);
    assert.equal(rows[0].source, provider);
    assert.equal(
      rows[0].volume24h,
      provider === 'byreal' ? 260633.8142606776 : 97.207286,
    );
    assert.equal(
      api.parseProviderPools(
        provider,
        raw,
        [{ ...mu, mint: usdc }],
        [],
        [],
        Date.now(),
      ).MU.length,
      0,
    );
  }
});
void test('Byreal HTTP 200 with nested provider error is an outage, never empty or zero activity', async () => {
  const raw = await fixture('byreal');
  raw.result.success = false;
  raw.result.ret_code = 500;
  raw.result.data = null;
  assert.throws(
    () =>
      api.parseProviderPools('byreal', raw, [mu], api.TOKENS, [], Date.now()),
    /Invalid byreal/,
  );
});
void test('captured DAMM v2 stock-coin pool needs verified launch identity; its 24h USD field is not a token ratio', async () => {
  const raw = await fixture('meteora-damm-v2');
  const p = raw.data[0];
  assert.equal(
    api.parseProviderPools('meteora-damm-v2', raw, [mu], api.TOKENS, [], 100).MU
      .length,
    0,
  );
  const official = [
    {
      address: p.address,
      stockMint: mu.mint,
      launchMint: p.token_x.address,
      symbol: 'RAMCAT',
    },
  ];
  const rows = api.parseProviderPools(
    'meteora-damm-v2',
    raw,
    [mu],
    api.TOKENS,
    official,
    100,
  ).MU;
  const row = rows.find((r) => r.address === p.address);
  assert.ok(row);
  assert.equal(row.volume24h, 5977.91227422985);
  assert.equal(row.price, null);
  assert.ok(api.isDirectPoolSource(row));
});
void test('captured DAMM v1 uses trading_volume, not lifetime accumulated_trading_volume', async () => {
  const raw = await fixture('meteora-damm-v1');
  const p = raw.data[0];
  // Captured DBR/USDC response is a schema fixture, not a claim DBR is eligible.
  assert.equal(
    api.parseProviderPools('meteora-damm-v1', raw, [mu], api.TOKENS, [], 100).MU
      .length,
    0,
  );
  const schemaToken = { ...mu, mint: p.pool_token_mints[0] };
  const row = api.parseProviderPools(
    'meteora-damm-v1',
    raw,
    [schemaToken],
    [schemaToken],
    [],
    100,
  ).MU[0];
  assert.equal(row.volume24h, 228531.48350826203);
  assert.notEqual(row.volume24h, p.accumulated_trading_volume);
  assert.equal(row.price, null);
});
void test('current direct venue volume wins without adding indexer amount; a separate current USD price survives', () => {
  const now = 1000000;
  const direct = {
    ...pool,
    source: 'byreal',
    observedAt: now,
    volume24h: 10200,
  };
  const indexed = {
    ...pool,
    source: 'dexscreener',
    observedAt: now,
    price: 1108,
    volume24h: 10000,
  };
  const result = api.resolvePoolSources(
    [indexed, direct, indexed],
    [pool],
    mu,
    now,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'byreal');
  assert.equal(result[0].volume24h, 10200);
  assert.equal(result[0].price, 1108);
  const conflict = api.resolvePoolSources(
    [indexed, { ...direct, volume24h: 40000 }],
    [pool],
    mu,
    now,
  );
  assert.equal(conflict[0].volume24h, null);
  assert.equal(conflict[0].volumeDisputed, true);
});
void test('stale direct observation cannot override or dispute a current indexer response', () => {
  const now = 1000000;
  const old = {
    ...pool,
    source: 'byreal',
    observedAt: now - 600000,
    volume24h: 100000,
  };
  const fresh = {
    ...pool,
    source: 'geckoterminal',
    observedAt: now,
    volume24h: 12000,
  };
  const row = api.resolvePoolSources([old, fresh], [pool], mu, now)[0];
  assert.equal(row.source, 'geckoterminal');
  assert.equal(row.volume24h, 12000);
  assert.ok(!row.volumeDisputed);
});
void test('all observed venues remain in coverage, including new unsupported venues; shared pools count once', () => {
  const now = 1000000;
  const rows = [
    ...[
      'orca',
      'raydium',
      'meteora',
      'byreal',
      'pancakeswap-v3-solana',
      'manifest',
      'zerofi',
      'humidifi',
      'new-venue',
    ].map((dex, i) => ({
      ...pool,
      dex,
      address: String(i),
      source: 'geckoterminal',
      observedAt: now,
    })),
    {
      ...pool,
      dex: 'new-venue',
      address: '8',
      source: 'geckoterminal',
      observedAt: now,
    },
  ];
  const report = api.poolVenueCoverage(rows, now);
  assert.equal(report.uniquePools, 9);
  assert.equal(report.venues.length, 9);
  assert.deepEqual(report.indexerOnlyVenues, [
    'humidifi',
    'manifest',
    'new-venue',
    'zerofi',
  ]);
  assert.ok(report.venues.every((r) => r.indexed === 1));
});
void test('a new verified listing gets DAMM v1/v2 discovery without any hardcoded symbol or known pool', async () => {
  const raw = await fixture('meteora-damm-v2');
  const p = raw.data[0];
  const newToken = { ...mu, symbol: 'NEW' };
  const calls = [];
  const result = await api.collectPoolFallbacks({
    tokens: [newToken],
    verified: [newToken],
    known: [],
    detailMints: [newToken.mint],
    dexAvailable: false,
    primary: async () =>
      Response.json({
        data: {
          tokens: [
            {
              pool: p.address,
              mint: p.token_x.address,
              symbol: 'RAMCAT',
              quote: { mint: newToken.mint },
            },
          ],
        },
      }),
    request: async (provider, url) => {
      calls.push([provider, url]);
      if (provider === 'meteora-damm-v2') return raw;
      throw Error('offline');
    },
  });
  assert.ok(result.NEW.some((r) => r.address === p.address));
  assert.ok(calls.some(([p]) => p === 'meteora-damm-v1'));
  assert.ok(
    calls.some(
      ([p, url]) => p === 'meteora-damm-v2' && url.includes(newToken.mint),
    ),
  );
});
void test('known Byreal and PancakeSwap pools refresh directly even when all indexers fail', async () => {
  const byreal = await fixture('byreal'),
    pancake = await fixture('pancakeswap');
  const other = {
    ...pool,
    address: pancake.data[0].id,
    dex: 'pancakeswap-v3-solana',
  };
  const rows = await api.collectPoolFallbacks({
    tokens: [mu],
    verified: api.TOKENS,
    known: [pool, other],
    detailMints: [],
    dexAvailable: false,
    primary: async () => Response.json({ data: { tokens: [] } }),
    request: async (provider) => {
      if (provider === 'byreal') return byreal;
      if (provider === 'pancakeswap') return pancake;
      throw Error('offline');
    },
  });
  assert.equal(
    rows.MU.find((r) => r.address === pool.address).source,
    'byreal',
  );
  assert.equal(
    rows.MU.find((r) => r.address === other.address).source,
    'pancakeswap',
  );
});
