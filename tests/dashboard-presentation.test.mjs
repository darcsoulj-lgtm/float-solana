import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
async function component(file, overrides) {
  const source = await readFile(
    new URL('../components/' + file, import.meta.url),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => overrides[id] ?? require(id),
    module,
    module.exports,
  );
  return module.exports;
}
async function portfolio({ hidden = false, prices = {}, positions }) {
  let hook = 0;
  const { PortfolioSummary } = await component('portfolio-summary.tsx', {
    react: {
      ...React,
      useState: () => [hook++ === 0 ? hidden : false, () => {}],
    },
    '@/lib/token-observation': {
      tokenObservation: (_, symbol) => ({
        price: prices[symbol] ?? null,
        priceSource: 'test quote',
        priceTime: 1,
      }),
    },
  });
  return PortfolioSummary({ positions, data: null, now: 1 });
}
const holding = (symbol, raw_amount = '100') => ({
  symbol,
  raw_amount,
  decimals: 2,
  ui_amount: '1',
  verified_at: 1,
});
function elements(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => elements(n, type));
  return [
    ...(node.type === type ? [node] : []),
    ...elements(node.props?.children, type),
  ];
}
test('Portfolio ring and list agree on value and allocation', async () => {
  const tree = await portfolio({
    positions: [holding('MU'), holding('SPCX')],
    prices: { MU: 75, SPCX: 25 },
  });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /\$100\.00/);
  assert.match(html, /MU: 75\.0%/);
  assert.match(html, /SPCX: 25\.0%/);
  const arcs = elements(tree, 'circle').filter((c) => c.props.pathLength);
  assert.equal(arcs.length, 2);
  assert.equal(arcs[1].props.strokeDashoffset, -75);
});
test('An unpriced holding suppresses allocation instead of presenting a false 100 percent', async () => {
  const tree = await portfolio({
    positions: [holding('MU'), holding('SPCX')],
    prices: { MU: 75 },
  });
  assert.equal(
    elements(tree, 'circle').filter((c) => c.props.pathLength).length,
    0,
  );
  assert.match(renderToStaticMarkup(tree), /Priced holdings/);
});
test('Hide balances removes dollar values and allocation from the rendered chart and list', async () => {
  const tree = await portfolio({
    hidden: true,
    positions: [holding('MU')],
    prices: { MU: 75 },
  });
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /\$75|100\.0%|MU: 100/);
  assert.equal(
    elements(tree, 'circle').filter((c) => c.props.pathLength).length,
    0,
  );
});
test('Large portfolios group smaller holdings in the ring and initially show five rows', async () => {
  const positions = Array.from({ length: 8 }, (_, i) => holding('T' + i));
  const prices = Object.fromEntries(positions.map((p, i) => [p.symbol, 8 - i]));
  const tree = await portfolio({ positions, prices });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Other: 16\.7%/);
  assert.match(html, /Show all 8 holdings/);
  assert.equal(
    elements(tree, 'li').filter(
      (e) => e.props.className === 'portfolio-position',
    ).length,
    5,
  );
});
test('Appearance offers direct Light selection, persists it, and synchronizes all controls', async () => {
  const callbacks = new Map(),
    saved = new Map(),
    effects = [];
  let dark = true;
  const prior = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
  };
  globalThis.document = {
    documentElement: {
      dataset: { theme: 'dark' },
      classList: {
        toggle: (_, enabled) => {
          dark = enabled;
        },
      },
    },
  };
  globalThis.localStorage = { setItem: (key, value) => saved.set(key, value) };
  globalThis.window = {
    matchMedia: () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
    addEventListener: (key, callback) => callbacks.set(key, callback),
    removeEventListener: (key) => callbacks.delete(key),
    dispatchEvent: (event) => callbacks.get(event.type)?.(),
  };
  try {
    const { ThemeToggle } = await component('theme-toggle.tsx', {
      react: {
        ...React,
        useState: () => ['dark', () => {}],
        useEffect: (effect) => effects.push(effect),
      },
      '@/components/ui/toggle-group': {
        ToggleGroup: 'group',
        ToggleGroupItem: 'choice',
      },
    });
    const tree = ThemeToggle();
    const cleanup = effects[0]();
    assert.deepEqual(
      tree.props.children.map((child) => child.props.value),
      ['light', 'dark', 'system'],
    );
    tree.props.onValueChange(['light']);
    assert.equal(saved.get('hp-theme'), 'light');
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.equal(dark, false);
    tree.props.onValueChange([]);
    assert.equal(document.documentElement.dataset.theme, 'light');
    cleanup();
  } finally {
    Object.assign(globalThis, prior);
  }
});
