import { compileFunction } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/market-history.ts', import.meta.url),
  'utf8',
);
const stockPoolSource = await readFile(
  new URL('../lib/stock-pools.ts', import.meta.url),
  'utf8',
);
const stockPoolModule = { exports: {} };
compileFunction(
  ts.transpileModule(stockPoolSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  ['require', 'module', 'exports'],
)(() => ({}), stockPoolModule, stockPoolModule.exports);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
});
const compiledModule = { exports: {} };
compileFunction(outputText, ['require', 'module', 'exports'])(
  (name) => {
    if (name === './stock-pools') return stockPoolModule.exports;
    if (name === './tokens')
      return { MARKET_BATCH_SIZE: 90, TOKEN_REVIEW_DATE: '2026-09-13' };
    return {};
  },
  compiledModule,
  compiledModule.exports,
);
const { completeMarketActivity } = compiledModule.exports;
const now = Date.UTC(2026, 8, 20, 14);
const address = '11111111111111111111111111111111';
const batches = [
  { key: 'first', symbols: ['MU'] },
  { key: 'second', symbols: ['MUx'] },
];
const pool = {
  address,
  dex: 'raydium',
  volume24h: 12,
  liquidity: 50,
};
const cache = (first = pool, second = pool) =>
  new Map([
    ['first', { payload: JSON.stringify({ MU: [first] }), fetched_at: now - 30000 }],
    ['second', { payload: JSON.stringify({ MUx: [second] }), fetched_at: now - 20000 }],
  ]);

void test('Daily market activity counts a shared pool once across issuer batches', () => {
  assert.deepEqual(completeMarketActivity(batches, cache(), now), {
    observed_at: now - 20000,
    volume_24h: 12,
    liquidity: 50,
    pool_count: 1,
    batch_count: 2,
  });
});
void test('Incomplete, stale and skewed batches never create a historical zero', () => {
  const missing = cache();
  missing.delete('second');
  assert.equal(completeMarketActivity(batches, missing, now), null);
  const stale = cache();
  stale.get('second').fetched_at = now - 300000;
  assert.equal(completeMarketActivity(batches, stale, now), null);
  const skewed = cache();
  skewed.get('second').fetched_at = now - 240000;
  assert.equal(completeMarketActivity(batches, skewed, now), null);
  const invalid = cache();
  invalid.get('first').payload = JSON.stringify({ MU: [{ ...pool, volume24h: -1 }] });
  assert.equal(completeMarketActivity(batches, invalid, now), null);
});
void test('Known empty eligible pools stay unavailable, not a fabricated zero', () => {
  const empty = cache();
  empty.get('first').payload = JSON.stringify({ MU: [] });
  empty.get('second').payload = JSON.stringify({ MUx: [] });
  assert.deepEqual(completeMarketActivity(batches, empty, now), {
    observed_at: now - 20000,
    volume_24h: null,
    liquidity: null,
    pool_count: 0,
    batch_count: 2,
  });
});
