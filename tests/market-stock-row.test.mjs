import { compileFunction } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = await readFile(
  new URL('../components/market-stock-row.tsx', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
});
const compiledModule = { exports: {} };
compileFunction(outputText, ['require', 'module', 'exports'])(
  require,
  compiledModule,
  compiledModule.exports,
);
const { MarketStockRow } = compiledModule.exports;

void test('Clicking any SPCX metric cell reaches the row action and selects SPCX, not MU', () => {
  let selected = 'MU';
  const row = MarketStockRow({
    symbol: 'SPCX',
    name: 'SpaceX',
    selected: false,
    held: true,
    onSelect: (symbol) => {
      selected = symbol;
    },
    children: 'metric cells',
  });
  assert.equal(row.type, 'tr');
  assert.equal(row.props.role, undefined);
  row.props.onClick();
  assert.equal(selected, 'SPCX');
});

void test('Stock-name activation stays keyboard accessible and prevents duplicate row activation', () => {
  const calls = [];
  const row = MarketStockRow({
    symbol: 'SPCX',
    name: 'SpaceX',
    selected: true,
    held: true,
    onSelect: (symbol) => calls.push(symbol),
    children: null,
  });
  const button = row.props.children[0].props.children;
  assert.equal(button.type, 'button');
  assert.equal(button.props.type, 'button');
  assert.equal(button.props['aria-label'], 'View SPCX details');
  assert.equal(button.props['aria-pressed'], true);
  assert.equal(row.props.className, 'is-selected');
  let stopped = false;
  button.props.onClick({
    stopPropagation() {
      stopped = true;
    },
  });
  if (!stopped) row.props.onClick();
  assert.deepEqual(calls, ['SPCX']);
});
