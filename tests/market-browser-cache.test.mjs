import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';

const { saveMarketPage, savedMarketPages } = await bundle(
  "export * from './lib/market-browser-cache';",
);

void test('a reload restores only public, dated market observations', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const page = {
    registry: { additions: [], checkedAt: Date.now() },
    prices: { data: { MU: { price: 2, timestamp: Date.now() } }, fetchedAt: Date.now() },
    supplies: { data: {}, fetchedAt: Date.now() },
    pools: { data: {}, fetchedAt: Date.now() },
    catalog: { data: [], fetchedAt: Date.now() },
    markets: { data: {}, fetchedAt: Date.now() },
    holdings: [{ address: 'private-wallet' }],
  };
  saveMarketPage(storage, 0, page);
  const restored = savedMarketPages(storage, 1)[0];
  assert.equal(restored.prices.data.MU.price, 2);
  assert.equal(restored.holdings, undefined);
  assert.equal([...values.values()][0].includes('private-wallet'), false);
});

void test('Backpack and full-universe snapshots cannot overwrite each other', () => {
  const values = new Map();
  const storage = {getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k)};
  const page = symbol => ({prices:{data:{[symbol]:{price:1}},fetchedAt:Date.now()},supplies:{data:{}},pools:{data:{}}});
  saveMarketPage(storage,0,page('NVDAx'));
  saveMarketPage(storage,1000,page('MU'));
  assert.deepEqual(Object.keys(savedMarketPages(storage,1)[0].prices.data),['NVDAx']);
  assert.deepEqual(Object.keys(savedMarketPages(storage,1,1000)[0].prices.data),['MU']);
});
void test('reload preserves Birdeye volume basis, amounts and original times without restoring v2 pool-only snapshots', () => {
  const values=new Map(),time=Date.now()-3600000;
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const tokenVolumes={source:'birdeye',intervalMs:14*3600000,data:{MU:{mint:'public-mint',usd24h:4430000,observedAt:time,collectedAt:time+1000}}};
  const page={prices:{data:{}},supplies:{data:{}},pools:{data:{MU:[{volume24h:4110000}]}},tokenVolumes,issuerComparisonEnabled:false,holdings:[{address:'private-wallet'}]};
  saveMarketPage(storage,1000,page);
  const restored=savedMarketPages(storage,1,1000)[0];
  assert.deepEqual(restored.tokenVolumes,tokenVolumes);
  assert.equal(restored.tokenVolumes.data.NVDA,undefined,'Unavailable tokens remain unavailable');
  assert.equal(restored.issuerComparisonEnabled,false);
  assert.equal(restored.holdings,undefined);
  const [key,raw]=[...values.entries()][0];
  assert.equal(raw.includes('private-wallet'),false);
  values.clear();values.set(key.replace(':v3:',':v2:'),raw);
  assert.equal(savedMarketPages(storage,1,1000)[0],undefined,'Old cache schema must not select the old volume basis');
});
void test('browser snapshots normalize legacy Backpack changes without scaling DEX percentages or renewing times', () => {
  const values=new Map(),time=Date.now()-1000;
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const page={prices:{data:{}},supplies:{data:{}},pools:{data:{MU:[{change24h:4.2}]}},
    backpack:{data:{MU:{externalPrice:1107.565,externalChange24h:0.042086}},fetchedAt:time}};
  saveMarketPage(storage,1000,page);
  const restored=savedMarketPages(storage,1,1000)[0];
  assert.equal(restored.backpack.data.MU.externalChange24h,4.2086);
  assert.equal(restored.backpack.fetchedAt,time);
  assert.equal(restored.pools.data.MU[0].change24h,4.2);
  saveMarketPage(storage,1000,restored);
  assert.equal(savedMarketPages(storage,1,1000)[0].backpack.data.MU.externalChange24h,4.2086);
});
