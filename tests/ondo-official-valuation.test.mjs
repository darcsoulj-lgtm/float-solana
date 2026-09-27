import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const {
  parseOfficialOndoValues,
  fetchOfficialOndoValues,
  TOKENS,
  tokenObservation,
} = await bundle(
  `export * from './lib/ondo-official-valuation'; export {TOKENS} from './lib/tokens'; export {tokenObservation} from './lib/token-observation';`,
);
const now = Date.UTC(2026, 8, 27, 5);
const token = TOKENS.find((t) => t.symbol === 'NVDAon');
const catalog = () => ({
  lastUpdatedAt: new Date(now).toISOString(),
  assets: [
    {
      symbol: token.symbol,
      primaryMarket: {
        symbol: token.symbol,
        price: '999999',
        priceHistory24h: [{ timestamp: now - 36 * 3600000, price: '210' }],
      },
    },
  ],
});
const supplies = () => ({
  [token.symbol]: {
    supply: 10,
    uiSupply: 12,
    multiplier: 1.2,
    valuationSafe: false,
    adjustmentAt: now - 72 * 3600000,
    timestamp: now,
    amount: '10000000000',
    decimals: 9,
    slot: 123,
  },
});
void test('Official Ondo estimate uses dated primary token price and raw Solana supply exactly once', () => {
  const r = parseOfficialOndoValues(catalog(), supplies(), now);
  assert.equal(r.rows.NVDAon.valueUsd, 2100);
  assert.equal(r.rows.NVDAon.mint, token.mint);
  assert.equal(r.rows.NVDAon.priceAt, now - 36 * 3600000);
  assert.equal(r.rows.NVDAon.supplyAt, now);
  const d = {
    valuations: { data: r, fetchedAt: now, stale: false },
    markets: { data: {}, stale: false },
    prices: { data: {} },
    pools: { data: {} },
    supplies: { data: {} },
  };
  const o = tokenObservation(d, token.symbol, now);
  assert.equal(o.issuedValue, 2100);
  assert.equal(o.valuationTime, now - 36 * 3600000);
  assert.equal(o.valuationSource, r.source);
  assert.equal(
    tokenObservation(d, token.symbol, now + 61 * 3600000).issuedValue,
    null,
  );
});
void test('Official Ondo fails closed on stale, future, duplicate, mismatched and malformed observations', () => {
  for (const mutate of [
    (c) => {
      c.lastUpdatedAt = new Date(now - 3600001).toISOString();
    },
    (c) => {
      c.assets.push(c.assets[0]);
    },
    (c) => {
      c.assets[0].primaryMarket.symbol = 'TSLAon';
    },
    (c) => {
      c.assets[0].primaryMarket.priceHistory24h[0].timestamp =
        now - 97 * 3600000;
    },
    (c) => {
      c.assets[0].primaryMarket.priceHistory24h[0].timestamp = now + 61000;
    },
    (c) => {
      c.assets[0].primaryMarket.priceHistory24h[0].price = 'Infinity';
    },
    (c) => {
      c.assets[0].primaryMarket.priceHistory24h.push(
        c.assets[0].primaryMarket.priceHistory24h[0],
      );
    },
    (_, s) => {
      s.NVDAon.timestamp = now - 300001;
    },
    (_, s) => {
      s.NVDAon.multiplier = null;
    },
    (_, s) => {
      s.NVDAon.adjustmentAt = now - 3600000;
    },
  ]) {
    const c = catalog(),
      s = supplies();
    mutate(c, s);
    assert.throws(() => parseOfficialOndoValues(c, s, now));
  }
});
void test('Missing data stays partial; unsupported assets cannot enter equity totals', () => {
  const c = catalog();
  c.assets.push({
    symbol: 'USDY',
    primaryMarket: {
      symbol: 'USDY',
      priceHistory24h: [{ timestamp: now, price: '10000000' }],
    },
  });
  const r = parseOfficialOndoValues(c, supplies(), now);
  assert.deepEqual(Object.keys(r.rows), ['NVDAon']);
  assert.deepEqual(r.excluded, ['USDY']);
});
void test('Official endpoint rejects HTTP errors, redirects and oversized bodies before RPC', async () => {
  await assert.rejects(
    fetchOfficialOndoValues(undefined, async (url, opts) => {
      assert.equal(url, 'https://app.ondo.finance/api/v2/assets');
      assert.equal(opts.redirect, 'manual');
      return new Response('', { status: 429 });
    }),
    /429/,
  );
  await assert.rejects(
    fetchOfficialOndoValues(
      undefined,
      async () => new Response('', { status: 302 }),
    ),
    /302/,
  );
  await assert.rejects(
    fetchOfficialOndoValues(
      undefined,
      async () =>
        new Response('large', {
          headers: { 'Content-Length': String(7 * 1024 * 1024) },
        }),
    ),
    /too large/,
  );
});
