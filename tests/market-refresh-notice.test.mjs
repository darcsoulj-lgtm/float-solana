import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './helpers/component.mjs';

const { MarketRefreshNotice } = loadComponent('components/market-refresh-notice.tsx');
const render = (props) => renderToStaticMarkup(createElement(MarketRefreshNotice, props));

void test('a successful refresh leaves no public failure notice', () => {
  assert.equal(render({ failed: false, hasData: true }), '');
  assert.equal(render({ failed: false, hasData: false }), '');
});

void test('a failed refresh with saved data shows a quiet delay status', () => {
  const html = render({ failed: true, hasData: true });
  assert.match(html, /Update delayed/);
  assert.match(html, /<output /);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /role="alert"|Could not refresh|Previously loaded|error/);
});

void test('a failed first load is unavailable rather than claiming saved data exists', () => {
  const html = render({ failed: true, hasData: false });
  assert.match(html, /Market data temporarily unavailable/);
  assert.doesNotMatch(html, /Update delayed|last available|Saved/);
});
