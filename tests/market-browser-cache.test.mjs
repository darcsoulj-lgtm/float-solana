import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';

const { saveMarketPage, savedMarketPages } = await bundle(
  "export * from './lib/market-browser-cache';",
);

void test('a reload restores only public, dated market observations', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const page = {
    registry: { additions: [], checkedAt: Date.now() },
    prices: { data: { MU: { price: 2, timestamp: Date.now() } }, fetchedAt: Date.now() },
    supplies: { data: {}, fetchedAt: Date.now() },
    pools: { data: {}, fetchedAt: Date.now() },
    catalog: { data: [], fetchedAt: Date.now() },
    markets: { data: {}, fetchedAt: Date.now() },
    holdings: [{ address: 'private-wallet' }],
  };
  saveMarketPage(storage, 0, page);
  const restored = savedMarketPages(storage, 1)[0];
  assert.equal(restored.prices.data.MU.price, 2);
  assert.equal(restored.holdings, undefined);
  assert.equal([...values.values()][0].includes('private-wallet'), false);
});
