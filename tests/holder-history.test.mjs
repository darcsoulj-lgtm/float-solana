import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const {appendHolderHistory,holderTrend,parseHolderHistory}=await bundle("export * from './lib/holder-history';");
const day=86400000, now=1800000000000, hash='a'.repeat(64);
const point=(offset,wallets=100)=>({issuer:'backpack',wallets,checkedAt:now+offset*day,registryHash:hash});
void test('same UTC day keeps latest observation, never inserts failed days or regresses',()=>{
 const a=point(-2); const b={...a,checkedAt:a.checkedAt+1000,wallets:120};
 const history=appendHolderHistory([a],[b,a,point(0)],now);
 assert.equal(history.length,2);assert.equal(history[0].wallets,120);
 assert.equal(appendHolderHistory(history,[],now).length,2);
 assert.equal(parseHolderHistory([{...a,wallets:-1}],now).length,0);
});
void test('chart needs seven actual dates and comparable registry; 30-day change requires exact baseline',()=>{
 const row={...point(0,110),tokens:1,startedAt:now};
 assert.equal(holderTrend(Array.from({length:6},(_,i)=>point(-i)),row),null);
 const points=Array.from({length:7},(_,i)=>point(-i));
 assert.equal(holderTrend(points,row).change,null);
 assert.ok(Math.abs(holderTrend([point(-30),...points],row).change-10)<1e-8);
 assert.equal(holderTrend([{...point(-3),registryHash:'b'.repeat(64)},...points.filter(p=>p.checkedAt!==now-3*day)],row),null);
});
