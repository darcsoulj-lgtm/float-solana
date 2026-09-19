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
const { groupMarketTokens, matchesAssetFilter } = await load(
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
void test('SpaceX is not classified as private solely because of its issuer', () => {
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
