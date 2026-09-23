import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const { displayPoolActivity, tokenObservation, TOKENS } = await bundle("export {displayPoolActivity,tokenObservation} from './lib/token-observation'; export {TOKENS} from './lib/tokens';");
const now = Date.now();
const a = TOKENS[0].symbol, b = TOKENS[1].symbol;
const source = data => ({data, fetchedAt: now - 45 * 60000, stale: true, error: 'HTTP 429'});
const pool = {address: 'shared', dex: 'raydium', volume24h: 100, liquidity: 200, price: 12};
const data = {pools: source({[a]: [pool], [b]: [{...pool, volume24h: 150}]}), prices: source({}), supplies: source({}), markets: source({}), catalog: source([])};

void test('Saved market and issuer summaries retain dated values without changing current valuation', () => {
 const summary = displayPoolActivity(data, [a], now);
 assert.equal(summary.volume24h, 100);
 assert.equal(summary.liquidity, 200);
 assert.equal(summary.saved, true);
 assert.equal(summary.oldestAt, data.pools.fetchedAt);
 assert.equal(tokenObservation(data, a, now).poolVolume24h, null);
 assert.equal(tokenObservation(data, a, now).issuedValue, null);
 assert.equal(tokenObservation(data, a, now).lastPoolVolume24h, summary.volume24h);
});
void test('Shared pools use the newest observation once, independent of token order', () => {
 const input = {...data, pools: {...data.pools, asOf: {[a]: now - 60 * 60000, [b]: now - 30 * 60000}}};
 for (const symbols of [[a,b],[b,a]]) {
  const summary = displayPoolActivity(input, symbols, now);
  assert.equal(summary.volume24h, 150);
  assert.equal(summary.pools.length, 1);
  assert.equal(summary.oldestAt, input.pools.asOf[b]);
 }
});
void test('Expired, missing and future observations stay unknown; observed zero is retained', () => {
 for (const time of [0, now - 25 * 3600000, now + 120000]) {
  const result = displayPoolActivity({...data, pools: {...data.pools, fetchedAt: time}}, [a], now);
  assert.equal(result.volume24h, null);
  assert.equal(result.liquidity, null);
 }
 const zero = {...data, pools: source({[a]: [{...pool, volume24h: 0, liquidity: null}]})};
 assert.equal(displayPoolActivity(zero, [a], now).volume24h, 0);
 assert.equal(displayPoolActivity(zero, [a], now).liquidity, null);
});
