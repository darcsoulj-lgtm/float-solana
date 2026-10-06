import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const api=await bundle("export * from './lib/stock-volume-comparison';");
void test('partial selected-token comparisons require a complete accounting of missing histories',()=>{
 const rows=['DJT','SPCX','IBM','PFE'].map((symbol,i)=>({symbol,name:symbol,mint:'1'.repeat(31)+(i+2),listingExchange:'NASDAQ',tokenUsd:100,stockUsd:0,stockMarketClosed:true,reconciled:true}));
 const valid={period:1,startUtc:'2026-10-04T04:00:00Z',endUtc:'2026-10-05T04:00:00Z',timeZone:'America/New_York',tokenSource:'birdeye',stockSource:'alpaca-sip',coverage:{available:72,total:73,unavailable:['NVDA']},rows,selectionBasis:'latest-market-volume',selectedAt:Date.parse('2026-10-06T00:00:00Z'),generatedAt:Date.parse('2026-10-06T00:01:00Z'),comparisonCoverage:{selected:['DJT','SPCX','IBM','PFE','EWZ'],unavailable:[{symbol:'EWZ',reason:'token-history-unavailable'}]}};
 assert.ok(api.validStockVolumeComparison(valid));
 for(const comparisonCoverage of [undefined,{...valid.comparisonCoverage,unavailable:[]},{...valid.comparisonCoverage,unavailable:[{symbol:'IBM',reason:'token-history-unavailable'}]},{...valid.comparisonCoverage,selected:['DJT','SPCX','IBM','PFE','OTHER']}])assert.equal(api.validStockVolumeComparison({...valid,comparisonCoverage}),false);
 assert.equal(api.validStockVolumeComparison({...valid,rows:rows.slice(0,2)}),false);
 assert.equal(api.stockVolumeRatio(rows[0]),'—');
});
