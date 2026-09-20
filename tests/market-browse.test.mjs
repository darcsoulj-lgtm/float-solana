import { compileFunction } from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  });
  const compiled = { exports: {} };
  compileFunction(outputText, ['exports', 'module'])(
    compiled.exports,
    compiled,
  );
  return compiled.exports;
}
const { groupMarketTokens, marketAssetPath, matchesAssetFilter, fundUnderlyings } = await load(
  '../lib/market-browse.ts',
);
const { parseTesseraContext } = await load('../lib/tessera-data.ts');
void test('issuer versions retain individual identity and sorted group priority', () => {
  const tokens = [
    { symbol: 'AAPLx', underlyingSymbol: 'AAPL' },
    { symbol: 'MU', underlyingSymbol: 'MU' },
    { symbol: 'AAPLon', underlyingSymbol: 'AAPL' },
  ];
  assert.deepEqual(
    groupMarketTokens(tokens).map((g) => g.versions.map((t) => t.symbol)),
    [['AAPLx', 'AAPLon'], ['MU']],
  );
});
void test('asset URLs group issuer tokens under one shareable underlying route', () => {
  assert.equal(marketAssetPath('MU', 'MU'), '/markets/mu?token=MU');
  assert.equal(marketAssetPath('MU', 'MUx'), '/markets/mu?token=MUx');
  assert.equal(marketAssetPath('SPCX'), '/markets/spcx');
});
void test('stock and Pre-IPO filters distinguish issuer exposure from funds', () => {
  assert.equal(
    matchesAssetFilter(
      { issuer: 'prestocks', underlyingSymbol: 'SPCX' },
      'private',
    ),
    false,
  );
  assert.equal(
    matchesAssetFilter(
      { issuer: 'tessera', underlyingSymbol: 'OPENAI' },
      'private',
    ),
    true,
  );
  assert.equal(matchesAssetFilter({ name: 'US Treasury ETF' }, 'funds'), true);
  const versions = [
    { name: 'SPDR S&P 500 ETF', underlyingSymbol: 'SPY', issuer: 'ondo' },
    { name: 'SP500', underlyingSymbol: 'SPY', issuer: 'xstocks' },
    { name: 'Micron', underlyingSymbol: 'MU', issuer: 'backpack' },
  ];
  const funds = fundUnderlyings(versions);
  assert.equal(matchesAssetFilter(versions[1], 'funds', funds), true);
  assert.equal(matchesAssetFilter(versions[1], 'stocks', funds), false);
  assert.equal(matchesAssetFilter(versions[2], 'stocks', funds), true);
  assert.equal(matchesAssetFilter({ name: 'Gold', underlyingSymbol: 'GLD' }, 'stocks'), false);
  assert.equal(matchesAssetFilter({ name: 'Digital Realty Trust', underlyingSymbol: 'DLR' }, 'stocks'), true);
  assert.equal(matchesAssetFilter({ name: 'iShares Gold Trust', underlyingSymbol: 'IAU' }, 'funds'), true);
  assert.equal(matchesAssetFilter({ issuer: 'prestocks', underlyingSymbol: 'OPENAI' }, 'stocks'), false);
  assert.equal(matchesAssetFilter({ issuer: 'prestocks', underlyingSymbol: 'SPCX' }, 'stocks'), true);
});
void test('Tessera context accepts only registry-confirmed Tessera mints and finite positive marks', () => {
  const tokens = [
    { issuer: 'tessera', mint: 'verified' },
    { issuer: 'backpack', mint: 'other' },
  ];
  const rows = parseTesseraContext(
    [
      { mint: 'verified', markPrice: 42, sector: 'AI' },
      { mint: 'other', markPrice: 100 },
      { mint: 'unknown', markPrice: 200 },
    ],
    tokens,
  );
  assert.deepEqual(rows, [{ mint: 'verified', markPrice: 42, sector: 'AI' }]);
  assert.equal(
    parseTesseraContext([{ mint: 'verified', markPrice: Infinity }], tokens)[0]
      .markPrice,
    null,
  );
  assert.throws(() => parseTesseraContext({}, tokens));
});
