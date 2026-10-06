import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const api=await bundle("export * from './lib/market-scheduled-maintenance';");

void test('publication and monitoring execute before hourly work, with independent failure handling',async()=>{
  const calls=[];
  const failed=await api.runMarketMaintenance({
    async publicSnapshot(){calls.push('snapshot');throw Error('database unavailable');},
    async health(){calls.push('health');},
    async activity(){calls.push('activity');throw Error('provider unavailable');},
  },3600000);
  assert.equal(failed,true);assert.deepEqual(calls,['snapshot','health','activity']);
});

void test('ordinary minute refresh publishes without repeatedly recording daily history or checking health',async()=>{
  const calls=[];
  assert.equal(await api.runMarketMaintenance({
    async publicSnapshot(){calls.push('snapshot');},
    async health(){calls.push('health');},
    async activity(){calls.push('activity');},
  },60000),false);
  assert.deepEqual(calls,['snapshot']);
});
