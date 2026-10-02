import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bundle } from './helpers/bundle.mjs';
const api = await bundle(
  "export * from './lib/pool-provider-adapters'; export * from './lib/pool-reconciliation'; export * from './lib/pool-venue-coverage'; export {poolMetrics} from './lib/stock-pools'; export {displayPoolActivity,tokenObservation} from './lib/token-observation';",
);
const captured = JSON.parse(
  await readFile(
    new URL('./fixtures/pool-backup/rwa-volume-conflict.json', import.meta.url),
  ),
);

void test('captured DRAM, AMC and MU major Raydium pools retain the indexed rolling volume despite incomparable direct statistics', () => {
  for (const { token, now, candidates } of captured) {
    const resolved = api.resolvePoolSources(candidates, [], token, now);
    for (const indexed of candidates.filter(
      (p) =>
        p.source === 'dexscreener' &&
        p.dex === 'raydium' &&
        now - p.observedAt <= 300000,
    )) {
      const selected = resolved.find((p) => p.address === indexed.address);
      assert.ok(selected, token.symbol + ': missing discovered pool');
      assert.equal(
        selected.volume24h,
        indexed.volume24h,
        token.symbol + ': ' + indexed.address,
      );
      assert.ok(!selected.volumeDisputed);
      assert.notEqual(selected.source, 'raydium');
    }
  }
});
const { token, now, candidates } = captured[0];
const base = candidates.find(
  (p) => p.source === 'dexscreener' && p.volume24h > 1000000,
);
void test('unqualified direct statistics cannot re-enter via stored evidence, retention, zero confirmation or direct-only discovery', () => {
  const direct = {
    ...base,
    source: 'raydium',
    volume24h: 2000000,
    observedAt: now,
  };
  assert.equal(api.poolMetrics([direct]).volume24h, null);
  assert.equal(api.poolMetrics([direct]).partial, true);
  assert.equal(
    api.resolvePoolSources([direct], [], token, now)[0].volume24h,
    null,
  );
  const missing = { ...base, unavailable: true, volume24h: null };
  assert.equal(
    api.retainPoolValues([missing], [direct], token, now)[0].volume24h,
    null,
  );
  const zero = {
    ...base,
    volume24h: 0,
    source: 'dexscreener',
    observedAt: now,
  };
  assert.equal(
    api.resolvePoolSources(
      [zero, { ...direct, volume24h: 0 }],
      [base],
      token,
      now,
    )[0].volume24h,
    null,
  );
  assert.equal(api.poolVenueCoverage([direct], now).venues[0].unresolved, 1);
});
void test('disagreement between comparable sources still blocks a pool and its positive-subset aggregate', () => {
  const a = {
    ...base,
    source: 'dexscreener',
    observedAt: now,
    volume24h: 10000,
  };
  const b = { ...a, source: 'geckoterminal', volume24h: 30000 };
  const [disputed] = api.resolvePoolSources([a, b], [base], token, now);
  assert.equal(disputed.volume24h, null);
  assert.equal(
    api.poolMetrics([{ ...a, address: 'other' }, disputed]).volume24h,
    null,
  );
  assert.equal(
    api.poolMetrics([a, { ...b, address: 'missing', unavailable: true }])
      .volume24h,
    null,
  );
  assert.equal(api.poolMetrics([a, a]).volume24h, 10000);
});
void test('list, detail and dashboard share the same unresolved aggregate; an entirely absent token blocks the market total', () => {
  const source = (data) => ({
    data,
    fetchedAt: now,
    stale: false,
    error: null,
  });
  const unknown = {
    ...base,
    address: 'unknown',
    volume24h: null,
    volumeDisputed: true,
  };
  const market = {
    pools: { ...source({ DRAM: [base, unknown] }), asOf: { DRAM: now } },
    markets: source({}),
    prices: source({}),
    supplies: source({}),
    catalog: source([]),
  };
  const row = api.tokenObservation(market, 'DRAM', now);
  assert.equal(row.poolVolume24h, null);
  assert.equal(row.lastPoolVolume24h, null);
  assert.equal(api.displayPoolActivity(market, ['DRAM'], now).volume24h, null);
  market.pools.data.DRAM = [base];
  assert.equal(
    api.displayPoolActivity(market, ['DRAM', 'AMC'], now).volume24h,
    null,
  );
  assert.equal(
    api.displayPoolActivity(market, ['DRAM'], now).volume24h,
    base.volume24h,
  );
});
void test('recovery restores the total without duplicate providers or a permanent disputed marker', () => {
  const a = {
    ...base,
    source: 'dexscreener',
    observedAt: now,
    volume24h: 10000,
  };
  const b = { ...a, source: 'geckoterminal', volume24h: 10100 };
  const old = { ...a, volume24h: null, volumeDisputed: true };
  const resolved = api.resolvePoolSources([a, b, a], [old], token, now);
  assert.equal(resolved.length, 1);
  assert.ok(!resolved[0].volumeDisputed);
  assert.equal(api.poolMetrics(resolved).volume24h, 10000);
});
void test('identity-only refresh preserves a qualified saved volume and original time, including confirmed zero', () => {
  for (const volume24h of [0, 10000]) {
    const old = {...base, source:'geckoterminal', volume24h, observedAt:now-600000};
    const identity = {...old, source:'orca', volume24h:null, observedAt:now};
    const [retained] = api.retainPoolValues([identity], [old], token, now);
    assert.equal(retained.volume24h, volume24h);
    assert.equal(retained.source, 'geckoterminal');
    assert.equal(retained.observedAt, old.observedAt);
    assert.equal(retained.delayed, true);
    assert.equal(api.retainPoolValues([{...identity,volumeDisputed:true}], [old], token, now)[0].volume24h, null);
  }
});
void test('observed display sums preserve qualified amounts without declaring an incomplete total', () => {
  const source = data => ({data, fetchedAt: now, stale: false, error: null});
  const good = {...base, volume24h: 10000, observedAt: now};
  const unknown = {...good, address: 'missing', volume24h: null, source: 'raydium'};
  const market = {pools: {...source({DRAM: [good, unknown]}), asOf: {DRAM: now}}, markets: source({}), prices: source({}), supplies: source({}), catalog: source([])};
  const display = api.displayPoolActivity(market, ['DRAM', 'AMC'], now);
  assert.equal(display.volume24h, null);
  assert.equal(display.observedVolume24h, 10000);
  assert.equal(display.observedCount, 1);
  assert.equal(display.unresolvedCount, 1);
  assert.equal(display.missingTokenCount, 1);
  assert.equal(display.partial, true);
  const row = api.tokenObservation(market, 'DRAM', now);
  assert.equal(row.poolVolume24h, null);
  assert.equal(row.observedPoolVolume24h, 10000);
  market.pools.data.DRAM[0].volume24h = 0;
  assert.equal(api.displayPoolActivity(market, ['DRAM'], now).observedVolume24h, null);
  market.pools.data.DRAM = [good, {...good, volume24h: 900000, observedAt: now - 25*3600000}];
  assert.equal(api.displayPoolActivity(market, ['DRAM'], now).observedVolume24h, 0);
  market.pools.data.DRAM = [{...good, volume24h: 10000, observedAt: now - 25*3600000}];
  assert.equal(api.displayPoolActivity(market, ['DRAM'], now).observedVolume24h, null);
});
void test('coverage regression alerts track lost verified activity instead of every new unknown identity', () => {
  const good = {...base, volume24h: 10000, observedAt: now};
  const unknown = {...good, address: 'new', volume24h: null};
  assert.deepEqual(api.poolCoverageRegressions([good], [good, unknown], now), []);
  assert.deepEqual(api.poolCoverageRegressions([good], [{...good, volume24h: null, volumeDisputed: true}], now), [good.address]);
  assert.deepEqual(api.poolCoverageRegressions([good], [{...good, volume24h: 0}], now), []);
  assert.deepEqual(api.poolCoverageRegressions([{...good, observedAt: now - 25*3600000}], [], now), []);
});
void test('shared market pools count once, retain the newer actual timestamp and cannot turn missing markets into zero', () => {
  const source = data => ({data, fetchedAt: now, stale: false, error: null});
  const good = {...base, volume24h: 100, observedAt: now};
  const market = {pools: {...source({DRAM: [good], AMC: [{...good, volume24h: 90, observedAt: now - 1000}]}), asOf: {DRAM: now, AMC: now}}, markets: source({}), prices: source({}), supplies: source({}), catalog: source([])};
  assert.equal(api.displayPoolActivity(market, ['DRAM', 'AMC'], now).observedVolume24h, 100);
  assert.equal(api.displayPoolActivity(market, ['DRAM', 'AMC'], now).knownCount, 1);
  market.pools.data = {DRAM: [{...good, volume24h: 0}]};
  assert.equal(api.displayPoolActivity(market, ['DRAM', 'AMC'], now).observedVolume24h, null);
  market.pools.data.DRAM = [{...good, observedAt: now + 60001}];
  assert.equal(api.displayPoolActivity(market, ['DRAM'], now).observedVolume24h, null);
});
