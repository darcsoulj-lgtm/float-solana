import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const {
  parseOndoVolume,
  fetchPools,
  scheduledDiscoveryMints,
  TOKENS,
  issuerDashboard,
} = await bundle(
  `export * from './lib/ondo-volume'; export {fetchPools} from './lib/market-data'; export {scheduledDiscoveryMints} from './lib/market-scheduler'; export {TOKENS} from './lib/tokens'; export {issuerDashboard} from './lib/issuer-dashboard';`,
);
const now = Date.UTC(2026, 8, 27, 6);
const day = Date.UTC(2026, 8, 25) / 1000;
const fixture = () => ({
  name: 'Ondo Global Markets',
  total24h: 999999999,
  totalDataChartBreakdown: [
    [
      day,
      {
        Solana: { 'Ondo Global Markets': 228956 },
        Ethereum: { 'Ondo Global Markets': 2123408 },
      },
    ],
  ],
});
void test('Ondo daily volume takes only the explicit Solana day, never global total24h', () => {
  assert.deepEqual(parseOndoVolume(fixture(), now), {
    usd: 228956,
    startAt: day * 1000,
    endAt: day * 1000 + 86400000,
  });
  for (const mutate of [
    (f) => {
      delete f.totalDataChartBreakdown[0][1].Solana;
    },
    (f) => {
      f.totalDataChartBreakdown.push(f.totalDataChartBreakdown[0]);
    },
    (f) => {
      f.totalDataChartBreakdown[0][0] = now / 1000;
    },
    (f) => {
      f.totalDataChartBreakdown[0][1].Solana['Ondo Global Markets'] = -1;
    },
    (f) => {
      f.name = 'Ondo Yield Assets';
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => parseOndoVolume(f, now));
  }
  assert.throws(() => parseOndoVolume(fixture(), now + 4 * 86400000));
});
void test('Independent discovery reaches every mint within ceil(count/8) minute slots', () => {
  for (const n of [1, 2, 29, 30, 69, 70, 101]) {
    const m = Array.from({ length: n }, (_, i) => 'mint' + i);
    const seen = new Set();
    for (let i = 0; i < Math.ceil(n / 8); i++) {
      const selected = scheduledDiscoveryMints(m, i * 60000);
      assert.ok(selected.length <= 8);
      selected.forEach((v) => seen.add(v));
    }
    assert.equal(seen.size, n);
  }
});
const token = TOKENS.find((t) => t.symbol === 'NVDAon');
const pair = {
  chainId: 'solana',
  dexId: 'meteora',
  pairAddress: '44HYCHVmWcEdgamxqkzapSu7VuAzp3rutV9Fp39Aadjs',
  baseToken: { address: token.mint },
  quoteToken: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  volume: { h24: 25 },
  liquidity: { usd: 100 },
  priceUsd: '200',
};
void test('Known pools survive discovery omission and are freshly fetched in batches; detail work is bounded', async () => {
  const requests = [];
  const fetcher = async (input) => {
    const u = new URL(input);
    requests.push(u.pathname);
    if (u.hostname.includes('stonkfun'))
      return Response.json({ data: { tokens: [] } });
    if (u.pathname.includes('/latest/dex/pairs/'))
      return Response.json({ pairs: [pair] });
    return Response.json([]);
  };
  const out = await fetchPools(fetcher, [token], TOKENS, {
    knownPools: [{ address: pair.pairAddress }],
    detailMints: [],
  });
  assert.equal(out.NVDAon[0].volume24h, 25);
  assert.equal(requests.filter((p) => p.includes('/token-pairs/')).length, 0);
  await assert.rejects(
    fetchPools(
      async (input) =>
        new URL(input).pathname.includes('/latest/dex/pairs/')
          ? Response.json({ pairs: [] })
          : fetcher(input),
      [token],
      TOKENS,
      { knownPools: [{ address: pair.pairAddress }], detailMints: [] },
    ),
    /incomplete/,
  );
});
void test('One stale market batch does not hide a fresh Ondo pool observation', () => {
  const source = (data) => ({ data, fetchedAt: now - 3600000, stale: true });
  const d = {
    catalog: source([]),
    markets: source({}),
    prices: source({}),
    supplies: source({}),
    pools: {
      ...source({
        NVDAon: [{ address: pair.pairAddress, volume24h: 25, liquidity: 100 }],
      }),
      asOf: { NVDAon: now - 1000 },
    },
  };
  assert.equal(issuerDashboard(d, 'ondo', now).volume, 25);
  assert.equal(issuerDashboard(d, 'ondo', now + 300000).volume, null);
});
