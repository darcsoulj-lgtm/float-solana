import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const { retainRefreshingSources, MARKET_RECHECK_DELAYS } = await bundle(
  "export * from './lib/market-refresh';",
);
void test('a newer pool snapshot is displayed even while another refresh is running', () => {
  const previous = {
    pools: { data: { MU: [{ volume24h: 1 }] }, fetchedAt: 100, stale: true },
  };
  const next = {
    pools: {
      data: { MU: [{ volume24h: 2 }] },
      fetchedAt: 200,
      stale: false,
      refreshing: true,
    },
  };
  retainRefreshingSources(next, previous);
  assert.equal(next.pools.data.MU[0].volume24h, 2);
  assert.equal(next.pools.fetchedAt, 200);
  assert.equal(next.pools.stale, false);
});
void test('missing refresh payload retains its timestamp; a confirmed empty result replaces it', () => {
  const previous = { pools: { data: { MU: [] }, fetchedAt: 100, stale: true } };
  const missing = { pools: { data: null, refreshing: true } };
  retainRefreshingSources(missing, previous);
  assert.equal(missing.pools.fetchedAt, 100);
  assert.equal(missing.pools.stale, true);
  const empty = { pools: { data: {}, fetchedAt: 200, refreshing: true } };
  retainRefreshingSources(empty, previous);
  assert.deepEqual(empty.pools.data, {});
});
void test('bounded follow-up checks cover a ten-second provider timeout without a two-minute wait', () => {
  const elapsed = MARKET_RECHECK_DELAYS.reduce((n, delay) => n + delay, 0);
  assert.ok(elapsed >= 20000 && elapsed <= 40000);
  assert.ok(MARKET_RECHECK_DELAYS.length <= 5);
});
