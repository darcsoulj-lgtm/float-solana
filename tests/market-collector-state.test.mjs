import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const {restoreCollectorState}=await bundle(`export * from './scripts/market/state';`);
const now=200000000,sha='a'.repeat(40),row={key:'pool-token-stonkfun-v2:mint',payload:'[]',fetched_at:now,retry_after:0};
const provider=(state,status=200)=>async url=>url.includes('api.github.com')?Response.json({object:{sha}}):Response.json(state,{status});
void test('collector restores a pinned generation and sends credentials only to GitHub API',async()=>{
 const calls=[];const source=provider([row]);
 assert.deepEqual(await restoreCollectorState(async(url,init)=>{calls.push({url,init});return source(url);},'test-key',now),[row]);
 assert.ok(calls[1].url.includes('/'+sha+'/state.json'));assert.equal(calls[1].init.headers,undefined);assert.equal(calls[0].init.headers.Authorization,'Bearer test-key');
});
void test('state outages, malformed data and future or private records stop collection before old discovery can be erased',async()=>{
 for(const source of [provider([],503),provider([]),provider([row,row]),provider([{...row,fetched_at:now+60001}]),provider([{...row,payload:'not JSON'}]),provider([{...row,payload:'{"sessionToken":"private"}'}]),async()=>Response.json({object:{sha:'invalid'}})])
  await assert.rejects(restoreCollectorState(source,undefined,now));
});
