import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const {trackedValuation,issuerValuation,marketTokens,TOKENS} = await bundle("export {trackedValuation,issuerValuation} from './lib/token-observation'; export {marketTokens} from './lib/market-data'; export {TOKENS} from './lib/tokens';");
void test('scoped market totals use only Backpack and preserve other issuer registry entries', () => {
  const now=Date.now();
  const data={registry:{additions:[{symbol:'PREVIEWTEST',underlyingSymbol:'PREVIEWTEST',name:'Test',shortName:'Test',mint:'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',issuer:'backpack',source:'https://api.backpack.exchange/api/v1/assets'}]},prices:{data:{MU:{price:10,timestamp:now,confidence:1}},fetchedAt:now,stale:false},supplies:{data:{MU:{supply:20,valuationSafe:true}},fetchedAt:now,stale:false},markets:{data:{},fetchedAt:now,stale:false}};
  const scoped=trackedValuation(data,now,'backpack');
  assert.deepEqual(scoped.issuers.map(i=>i.id),['backpack']);
  assert.equal(scoped.total,200);
  assert.equal(scoped.total,issuerValuation(data,now,'backpack').total);
  assert.ok(scoped.rows.every(r=>r.issuer==='backpack'));
  assert.ok(scoped.rows.some(r=>r.symbol==='PREVIEWTEST'));
  assert.equal(scoped.partial,true);
  assert.ok(trackedValuation(data,now).issuers.length>1);
  assert.ok(marketTokens(data).some(t=>t.issuer==='ondo'));
  assert.ok(TOKENS.some(t=>t.issuer==='xstocks'));
  assert.equal(trackedValuation(null,now,'backpack').total,null);
});
