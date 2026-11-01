import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const a=await bundle(`export * from './lib/backpack-reference';export {TOKENS} from './lib/tokens';export {tokenObservation} from './lib/token-observation';export {displayedMarketReference} from './lib/market-presentation';`);
const HOUR=3600000,now=Math.floor(Date.now()/HOUR)*HOUR,latest=now-2*HOUR;
const token=a.TOKENS.find(t=>t.issuer==='backpack'&&t.symbol==='MU');
const chart=(points)=>({market:'MU.US_USDC',points,fetchedAt:now});
const source=(data)=>({data,fetchedAt:now,stale:false,error:null});
void test('a missing latest baseline keeps latest price and current return unchanged while recovering the newest exact dated pair',()=>{
 const points=[[latest-27*HOUR,80],[latest-26*HOUR,100],[latest-3*HOUR,88],[latest-2*HOUR,105],[latest,120]];
 const before=JSON.stringify(points),row=a.referenceFromChart(chart(points));
 assert.equal(row.externalPrice,120);assert.equal(row.externalObservedAt,latest);
 assert.equal(row.externalFirstPrice,null);assert.equal(row.externalChange24h,null);
 assert.deepEqual(row.historicalExternalReference,{price:105,change24h:(105/100-1)*100,observedAt:latest-2*HOUR,firstPrice:100});
 assert.equal(JSON.stringify(points),before);
 const saved=new Map([[a.backpackHistoryKey(token.mint),{payload:JSON.stringify(row),fetched_at:now,retry_after:0}]]);
 const data={tokens:[token],scope:'backpack',prices:source({}),markets:source({}),pools:source({}),catalog:source([]),supplies:source({}),backpack:a.overlayBackpackHistory(source({}),[token],saved,now)};
 const observation=a.tokenObservation(data,'MU',now),display=a.displayedMarketReference(observation);
 assert.equal(observation.change24h,null);assert.equal(observation.lastPrice,120);
 assert.equal(display.price,105);assert.equal(display.change,(105/100-1)*100);
 assert.equal(display.priceTime,latest-2*HOUR);assert.equal(display.changeTime,latest-2*HOUR);
});
void test('an available latest baseline supersedes dated fallback, including a zero return',()=>{
 const row=a.referenceFromChart(chart([[latest-24*HOUR,120],[latest,120]]));
 assert.equal(row.externalChange24h,0);assert.equal(row.historicalExternalReference,undefined);
 assert.equal(a.historicalReferencePair(row,now).observedAt,latest);
});
void test('nearby, expired, future and inconsistent pairs cannot fill a missing comparison',()=>{
 for(const points of [
  [[latest-25*HOUR,100],[latest,105]],
  [[now-122*HOUR,100],[now-98*HOUR,105],[latest,120]],
 ])assert.equal(a.referenceFromChart(chart(points)).historicalExternalReference,undefined);
 const base={market:'MU.US_USDC',externalBasis:'hourly-history',externalPrice:120,externalObservedAt:latest,externalChange24h:null};
 for(const patch of [{observedAt:now+HOUR},{observedAt:now-97*HOUR},{change24h:9},{firstPrice:0}]){
  assert.equal(a.historicalReferencePair({...base,historicalExternalReference:{price:105,change24h:5,observedAt:latest-HOUR,firstPrice:100,...patch}},now),null);
 }
});
void test('fresh quotes retain the dated companion separately and do not acquire its old return',()=>{
 const history=a.referenceFromChart(chart([[latest-26*HOUR,100],[latest-2*HOUR,105],[latest,120]]));
 const current={market:'MU.US_USDC',externalPrice:125,externalObservedAt:now,externalChange24h:null};
 const saved=new Map([[a.backpackHistoryKey(token.mint),{payload:JSON.stringify(history),fetched_at:now,retry_after:0}]]);
 const overlaid=a.overlayBackpackHistory(source({MU:current}),[token],saved,now).data.MU;
 assert.equal(overlaid.externalPrice,125);assert.equal(overlaid.externalObservedAt,now);assert.equal(overlaid.externalChange24h,null);
 assert.deepEqual(overlaid.historicalExternalReference,history.historicalExternalReference);
});
