import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';

const api = await bundle("export * from './lib/stonkfun-data'; export {TOKENS} from './lib/tokens';");
const stock = api.TOKENS.find((token) => token.issuer === 'xstocks');
const launch = {
  mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  symbol: 'STONK',
  name: 'STONK',
  quote: { mint: stock.mint, symbol: stock.symbol, category: 'xstock' },
  market: { marketCapUsd: 1000, volume24hUsd: 25 },
  createdAt: '2026-09-14T00:00:00Z',
};

void test('Stonkfun official nested quote and market data match only verified stock mints', () => {
  const rows = api.parseStonkfunTokens({ data: { tokens: [launch, {
    ...launch, quote: { ...launch.quote, mint: 'unknown-mint' },
  }] } }, [stock]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stockMint, stock.mint);
  assert.equal(rows[0].stockSide, 'quote');
  assert.equal(rows[0].category, 'xstock');
  assert.equal(rows[0].volume24hUsd, 25);
  assert.equal(rows[0].marketCapUsd, 1000);
});

void test('Stonkfun never treats unspecified volume as 24h USD volume or invalid data as empty coverage', () => {
  const [row] = api.parseStonkfunTokens([{
    ...launch, market: {}, volume: 999999,
  }], [stock]);
  assert.equal(row.volume24hUsd, null);
  assert.throws(() => api.parseStonkfunTokens({ error: 'unavailable' }, [stock]));
});

void test('Overlapping Stonkfun discovery feeds count a launch once and preserve a successful feed during an outage', async () => {
  const response = () => Response.json({ data: { tokens: [launch] } });
  const result = await api.fetchStonkfunOverview(async () => response(), [stock]);
  assert.equal(result.linkedLaunches, 1);
  assert.equal(result.volume24hUsd, 25);
  const partial = await api.fetchStonkfunOverview(async (url) => {
    if (String(url).includes('newest')) throw Error('provider unavailable');
    return response();
  }, [stock]);
  assert.equal(partial.linkedLaunches, 1);
  await assert.rejects(api.fetchStonkfunOverview(async () => { throw Error('offline'); }, [stock]));
});
