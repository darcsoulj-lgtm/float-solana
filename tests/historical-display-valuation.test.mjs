import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const a=await bundle(`export * from './lib/token-observation';export * from './lib/backpack-reference';export {TOKENS} from './lib/tokens';export {calculateHolderTier} from './lib/holder-tier';`);
const now=Date.now(),HOUR=3600000,token=a.TOKENS.find(t=>t.issuer==='backpack'&&t.symbol==='MU');
const source=(data,time=now)=>({data,fetchedAt:time,stale:false,error:null});
const quote=(age=30*HOUR)=>({market:'MU.US_USDC',externalPrice:105,externalFirstPrice:100,externalChange24h:5,externalChangeUnit:'percent',externalObservedAt:now-age,externalBasis:'hourly-history'});
function fixture(age=30*HOUR,supplyAge=5*60000){return{tokens:[token],scope:'backpack',prices:source({}),markets:source({}),pools:source({}),catalog:source([]),backpack:source({MU:quote(age)}),supplies:source({MU:{supply:10,valuationSafe:true}},now-supplyAge)};}
void test('a weekend stock close estimates fresh safe supply for display only with separate original times',()=>{
 const data=fixture(),before=JSON.stringify(data),row=a.tokenObservation(data,'MU',now);
 assert.equal(row.issuedValue,null);assert.equal(row.price,null);assert.equal(row.lastIssuedValue,1050);assert.equal(row.lastIssuedValueHistoricalReference,true);assert.equal(row.lastIssuedValueBasis,'historical-stock-reference');
 assert.equal(row.lastIssuedValuePriceTime,now-30*HOUR);assert.equal(row.lastIssuedValueSupplyTime,now-5*60000);assert.equal(row.lastIssuedValueTime,now-30*HOUR);assert.equal(JSON.stringify(data),before);
 assert.equal(a.issuedCoverage(data,now,'backpack').total,null);assert.equal(a.trackedValuation(data,now,'backpack').total,1050);assert.equal(a.trackedValuation(data,now,'backpack').delayed,true);
 assert.equal(a.tokenValuation(row,'backpack').basis,'Minted · stock reference estimate');
 assert.equal(a.calculateHolderTier([{symbol:'MU',raw_amount:'100000000',decimals:6,verified_at:now}],data,now).tier,null);
});
void test('historical estimates expire at reference and supply boundaries without widening other quotes',()=>{
 assert.equal(a.tokenObservation(fixture(96*HOUR,20*60000),'MU',now).lastIssuedValue,1050);
 for(const data of [fixture(96*HOUR+1),fixture(30*HOUR,20*60000+1),fixture(-60001),fixture(30*HOUR,-60001)])assert.equal(a.tokenObservation(data,'MU',now).lastIssuedValue,null);
 for(const change of [row=>{delete row.externalBasis;},row=>{row.market='OTHER.US_USDC';}]){const data=fixture();change(data.backpack.data.MU);assert.equal(a.tokenObservation(data,'MU',now).lastIssuedValue,null);}
});
void test('unsafe supply, invalid numbers and a display-unit adjustment after the close fail closed',()=>{
 for(const patch of [{valuationSafe:false},{valuationSafe:undefined},{supply:Infinity},{supply:NaN},{supply:-1},{adjustmentAt:now-29*HOUR}]){const data=fixture();Object.assign(data.supplies.data.MU,patch);assert.equal(a.tokenObservation(data,'MU',now).lastIssuedValue,null);}
 const valid=fixture();valid.supplies.data.MU.adjustmentAt=now-31*HOUR;assert.equal(a.tokenObservation(valid,'MU',now).lastIssuedValue,1050);
});
void test('a newer compatible independent price/supply pair remains preferred over the historical estimate',()=>{
 const at=now-6*60000,data=fixture(30*HOUR,6*60000);data.prices=source({MU:{price:110,confidence:1,timestamp:at}},at);
 const row=a.tokenObservation(data,'MU',now);assert.equal(row.lastPrice,105);assert.equal(row.lastIssuedValue,1100);assert.equal(row.lastIssuedValuePriceTime,at);assert.equal(row.lastIssuedValueHistoricalReference,false);assert.equal(row.lastIssuedValueBasis,'observed-pair');
});
void test('a conflicting same-time independent reference blocks the historical estimate',()=>{
 const data=fixture(),at=data.backpack.data.MU.externalObservedAt;data.prices=source({MU:{price:200,confidence:1,timestamp:at}},at);
 assert.equal(a.tokenObservation(data,'MU',now).lastIssuedValue,null);
});
function overlay(current,history=quote()){const saved=new Map([[a.backpackHistoryKey(token.mint),{payload:JSON.stringify(history),fetched_at:now,retry_after:0}]]);return a.overlayBackpackHistory(source({MU:current}),[token],saved,now);}
void test('a fresh official quote without a return preserves the complete historical display pair separately',()=>{
 const current={...quote(),externalPrice:110,externalFirstPrice:null,externalChange24h:null,externalBasis:undefined,externalObservedAt:now},data=fixture();data.backpack=overlay(current);
 data.pools=source({MU:[{address:'pool',dex:'fixture',price:110,change24h:99,observedAt:now}]});
 const row=a.tokenObservation(data,'MU',now);
 assert.equal(row.price,110);assert.equal(row.issuedValue,1100);assert.equal(row.change24h,null);assert.equal(row.changeDelayed,false);
 assert.deepEqual(row.historicalDisplayReference,{price:105,change24h:5,observedAt:now-30*HOUR,firstPrice:100});assert.equal(data.backpack.asOf.MU,now);assert.equal(data.backpack.data.MU.externalChange24h,null);
});
void test('a valid zero current return supersedes historical display without losing its current timestamp',()=>{
 const current={...quote(),externalPrice:110,externalChange24h:0,externalBasis:undefined,externalObservedAt:now},data=fixture();data.backpack=overlay(current);
 const row=a.tokenObservation(data,'MU',now);assert.equal(row.price,110);assert.equal(row.change24h,0);assert.equal(row.historicalDisplayReference,null);assert.equal(data.backpack.data.MU.historicalExternalReference,undefined);
});
void test('historical companions require an actual consistent baseline, mint market and bounded observation',()=>{
 const current={...quote(),externalPrice:110,externalChange24h:null,externalBasis:undefined,externalObservedAt:now};
 for(const patch of [{externalChange24h:null},{externalFirstPrice:null},{externalFirstPrice:0},{externalChange24h:9},{externalObservedAt:now+1},{externalObservedAt:now-96*HOUR-1},{market:'OTHER.US_USDC'}]){
  const data=fixture();data.backpack=overlay(current,{...quote(),...patch});const row=a.tokenObservation(data,'MU',now);assert.equal(row.historicalDisplayReference,null);assert.equal(row.change24h,null);
 }
});
void test('an aged ticker cannot erase a usable official historical estimate kept as its companion',()=>{
 const current={...quote(),externalPrice:110,externalChange24h:null,externalBasis:undefined,externalObservedAt:now-30*60000},data=fixture();data.backpack=overlay(current);
 const row=a.tokenObservation(data,'MU',now);assert.equal(row.price,null);assert.equal(row.issuedValue,null);assert.equal(row.lastIssuedValue,1050);assert.equal(row.lastIssuedValueHistoricalReference,true);assert.equal(row.lastIssuedValuePriceTime,now-30*HOUR);assert.equal(row.historicalDisplayReference.price,105);
});
void test('a known unit adjustment invalidates both historical price/return display paths without suppressing a fresh quote',()=>{
 const historical=fixture();historical.supplies.data.MU.adjustmentAt=now-29*HOUR;
 const old=a.tokenObservation(historical,'MU',now);assert.equal(old.lastPrice,null);assert.equal(old.change24h,null);assert.equal(old.lastIssuedValue,null);assert.equal(old.historicalDisplayReference,null);
 const current={...quote(),externalPrice:110,externalChange24h:null,externalBasis:undefined,externalObservedAt:now},fresh=fixture();fresh.backpack=overlay(current);fresh.supplies.data.MU.adjustmentAt=now-29*HOUR;
 const row=a.tokenObservation(fresh,'MU',now);assert.equal(row.price,110);assert.equal(row.issuedValue,1100);assert.equal(row.historicalDisplayReference,null);assert.equal(row.change24h,null);
 const compatible=fixture();compatible.supplies.data.MU.adjustmentAt=now-31*HOUR;assert.equal(a.tokenObservation(compatible,'MU',now).lastPrice,105);
});
void test('a fresh DEX price without a return retains the validated primary historical stock display pair',()=>{
 const data=fixture();data.pools=source({MU:[{address:'pool',dex:'fixture',price:110,change24h:null,observedAt:now}]});
 const row=a.tokenObservation(data,'MU',now);assert.equal(row.price,110);assert.equal(row.priceSource,'DEX pool');assert.equal(row.issuedValue,1100);assert.equal(row.change24h,null);
 assert.deepEqual(row.historicalDisplayReference,{price:105,change24h:5,observedAt:now-30*HOUR,firstPrice:100});assert.equal(data.backpack.data.MU.historicalExternalReference,undefined);
 data.supplies.data.MU.adjustmentAt=now-29*HOUR;assert.equal(a.tokenObservation(data,'MU',now).historicalDisplayReference,null);
});
