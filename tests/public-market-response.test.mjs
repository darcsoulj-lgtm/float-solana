import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const {publicMarketResponse}=await bundle("export * from './lib/public-market-response';");
void test('public market cache shares only public payload across cookies and ignores cache-busting queries',async()=>{
  let reads=0;const entries=new Map(),jobs=[];
  const cache={match:async r=>entries.get(r.url)?.clone(),put:async(r,v)=>{entries.set(r.url,v);}};
  const load=async()=>{reads++;return {prices:{data:{MU:{price:10}},fetchedAt:100}};};
  const first=await publicMarketResponse(new Request('https://float.test/api/backpack-market?a=1',{headers:{cookie:'hp_member=one'}}),load,cache,p=>jobs.push(p));
  await Promise.all(jobs);
  const second=await publicMarketResponse(new Request('https://float.test/api/backpack-market?a=2',{headers:{cookie:'hp_member=two'}}),load,cache,p=>jobs.push(p));
  assert.equal(reads,1);assert.deepEqual(await first.json(),await second.json());
  assert.equal(second.headers.get('X-Float-Cache'),'HIT');assert.equal(second.headers.get('Set-Cookie'),null);
  assert.equal(second.headers.get('Cache-Control'),'public, max-age=30');
});
void test('provider/database failures never populate the public response cache',async()=>{
  let writes=0;
  await assert.rejects(publicMarketResponse(new Request('https://float.test/api/backpack-market'),async()=>{throw Error('db down');},{match:async()=>undefined,put:async()=>{writes++;}},()=>{}),/db down/);
  assert.equal(writes,0);
});
