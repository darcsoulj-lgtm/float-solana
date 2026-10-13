import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const {validTradingActivity,activitySnapshots}=await bundle("export {validTradingActivity} from './lib/trading-activity';export {activitySnapshots} from './lib/market-presentation';");
const start=Date.UTC(2026,9,12),end=start+86400000;
const point=()=>({day:'2026-10-12',capturedAt:end+10000,collectedAt:end+9000,
 oldestAt:start,newestAt:end-3600000,basis:'turnover',total:30,partial:false,covered:2,known:2,
 tokens:[{symbol:'MU',value:20},{symbol:'RIOT',value:10}],
 backfill:{source:'birdeye-ohlcv',startAt:start,endAt:end,registryHash:'a'.repeat(64)}});
void test('a recovered day validates only a completed UTC window and reconciled token scope',()=>{
 assert.equal(validTradingActivity(point()),true);
 for(const patch of [{startAt:start+4*3600000},{endAt:end-1},{endAt:end+86400000},{source:'dexscreener'},{registryHash:'unverified'}]){
  const p=point();p.backfill={...p.backfill,...patch};assert.equal(validTradingActivity(p),false);
 }
 for(const patch of [{oldestAt:start-1},{newestAt:end},{collectedAt:end-1},{capturedAt:end-1},{basis:'pools'},{covered:1},{partial:true}])assert.equal(validTradingActivity({...point(),...patch}),false);
 assert.equal(validTradingActivity({...point(),total:31}),false);
});
void test('an absent token is explicitly excluded rather than invented as zero',()=>{
 const p={...point(),partial:true,known:3,excludedSymbols:['NVDA']};assert.equal(validTradingActivity(p),true);
 assert.equal(validTradingActivity({...p,excludedSymbols:['MU']}),false);
 assert.equal(validTradingActivity({...p,excludedSymbols:undefined}),false);
});
void test('a historical backfill fills its date without changing the latest live observation',()=>{
 const historical=point();const latest={...point(),day:'2026-10-13',oldestAt:end,newestAt:end+3600000,capturedAt:end+3601000,collectedAt:end+3601000,total:50,tokens:[{symbol:'MU',value:40},{symbol:'RIOT',value:10}]};delete latest.backfill;
 const before=JSON.stringify(latest);const days=activitySnapshots([historical],latest,'turnover');
 assert.equal(days.get('2026-10-12').total,30);assert.equal(days.get('2026-10-13').total,50);assert.equal(JSON.stringify(latest),before);assert.ok(days.get('2026-10-12').backfill);
});
