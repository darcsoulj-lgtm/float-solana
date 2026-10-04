import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const { activityWindow, referenceDateRange } = await bundle("export * from './lib/market-presentation';");

void test('activity range trims uncollected edges, preserves real gaps and respects the requested period', () => {
  const observations = [{day:'2026-10-03'}, {day:'2026-10-01'}, {day:'2026-09-01'}, {day:'2026-10-05'}];
  const series = activityWindow(observations, '2026-10-04', 30);
  assert.deepEqual(series.map(row => row.day), ['2026-10-01','2026-10-02','2026-10-03']);
  assert.equal(series[1].point, undefined);
  assert.equal(series[0].point, observations[1]);
  assert.equal(series[2].point, observations[0]);
  assert.deepEqual(activityWindow(observations, '2026-10-04', 1), []);
  assert.deepEqual(activityWindow([], '2026-10-04', 90), []);
});

void test('reference date disclosure keeps original UTC dates and visibly represents mixed dates', () => {
  const oct2 = Date.UTC(2026,9,2,23,55), oct3 = Date.UTC(2026,9,3,1);
  assert.equal(referenceDateRange([oct2,oct3]), 'Oct 2 – Oct 3 · UTC');
  assert.equal(referenceDateRange([oct3,oct3+3600000]), 'Oct 3 · UTC');
  assert.equal(referenceDateRange([undefined,null,NaN,-1]), null);
  assert.equal(referenceDateRange([oct3,Infinity,8640000000000001]), 'Oct 3 · UTC');
});
