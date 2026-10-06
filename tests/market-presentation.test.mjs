import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const { activityWindow, activitySnapshots, volumeObservationTime, referenceDateRange, displayedMarketReference } = await bundle("export * from './lib/market-presentation';");

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


void test('a historical return is always paired with its historical close and original date', () => {
  const observedAt = Date.UTC(2026,9,2,20);
  const row = {price:120, priceTime:observedAt+36*3600000, priceSource:'Backpack · external', change24h:null,
    historicalDisplayReference:{price:105, change24h:4.2, observedAt}};
  const display = displayedMarketReference(row);
  assert.equal(display.price,105);
  assert.equal(display.change,4.2);
  assert.equal(display.priceTime,observedAt);
  assert.equal(display.changeTime,observedAt);
  assert.equal(display.historical,true);
  assert.equal(display.saved,true);
  assert.equal(row.price,120,'The strict current observation remains unchanged');
  assert.equal(row.change24h,null,'Display retention does not invent a current return');
});

void test('a valid current pair retains its current price and return without historical decoration', () => {
  const now=Date.UTC(2026,9,4);
  const display=displayedMarketReference({price:120, priceTime:now, priceSource:'Backpack · external', change24h:2, changeTime:now, historicalDisplayReference:null});
  assert.equal(display.price,120);
  assert.equal(display.change,2);
  assert.equal(display.priceTime,now);
  assert.equal(display.saved,false);
  assert.equal(display.historical,false);
});

void test('Latest snapshot replaces the earlier chart total for its actual source day without mutating history',()=>{
 const early={day:'2026-10-05',basis:'turnover',total:26.93,covered:70,newestAt:Date.UTC(2026,9,5,5)};
 const latest={day:'2026-10-05',basis:'turnover',total:51.33,covered:72,newestAt:Date.UTC(2026,9,5,20)};
 const pool={...early,basis:'pools',total:99};
 const snapshots=activitySnapshots([early,pool],latest,'turnover');
 assert.equal(snapshots.size,1);assert.equal(snapshots.get('2026-10-05'),latest);
 assert.equal(early.total,26.93);assert.equal(activityWindow(snapshots.values(),'2026-10-06',7)[0].point.total,51.33);
 assert.ok(!snapshots.has('2026-10-06'));
 assert.match(volumeObservationTime(latest.newestAt),/Oct 5.*20:00 UTC/);
 assert.equal(activitySnapshots([early],null,'turnover').get('2026-10-05'),early);
});
