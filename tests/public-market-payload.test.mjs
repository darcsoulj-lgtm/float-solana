import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
import {publicationIssues} from '../scripts/market/publication-check.mjs';
const { publicMarketPayload, tokenObservation, displayPoolActivity, poolLink } = await bundle(`
  export * from './lib/public-market-payload';
  export {poolLink} from './lib/market-data';
  export {tokenObservation,displayPoolActivity} from './lib/token-observation';
`);
const now = Date.now();
const source = data => ({data,fetchedAt:now,stale:false,error:null});
const pool = (address, overrides={}) => ({
  address, dex:'raydium',quote:'USDC',price:10,change24h:2,
  liquidity:100,volume24h:200,url:'https://dexscreener.com/solana/'+address,
  baseMint:'a'.repeat(44),quoteMint:'b'.repeat(44),createdAt:now-86400000,
  side:'base',source:'dexscreener',observedAt:now,...overrides,
});
const overview = pools => ({
  prices:source({}),supplies:source({}),markets:source({}),catalog:source([]),
  pools:{...source(pools),asOf:{MU:now,SKHY:now-600000}},
});
void test('real public projection remains verifiable without publishing repeated pool timestamps',()=>{
 const original=pool('verified');
 const input={...overview({MU:[original]}),backpack:source({MU:{externalPrice:10,externalChange24h:null,externalChangeUnit:'percent'}})};
 const compact=publicMarketPayload(input);
 assert.equal(compact.pools.data.MU[0].observedAt,undefined);
 const expected={tokens:[{symbol:'MU',pools:[original]}]};
 assert.deepEqual(publicationIssues(expected,JSON.stringify(compact),new Headers({'cache-control':'no-store'}),now),[]);
 compact.pools.data.MU[0].volume24h=0;
 assert.match(publicationIssues(expected,JSON.stringify(compact),new Headers({'cache-control':'no-store'}),now).join(';'),/not published/);
});
void test('public projection preserves observations, missing/disputed coverage and cross-token deduplication',()=>{
  const shared=pool('shared');
  const input=overview({MU:[shared,pool('missing',{unavailable:true,price:null,liquidity:null,volume24h:null}),pool('disputed',{volumeDisputed:true,volume24h:null})],SKHY:[shared]});
  const before=JSON.stringify(input);
  const compact=publicMarketPayload(input);
  assert.equal(JSON.stringify(input),before,'canonical records must not be mutated');
  assert.deepEqual(displayPoolActivity(compact,['MU','SKHY'],now),{
    ...displayPoolActivity(input,['MU','SKHY'],now),
    pools:displayPoolActivity(input,['MU','SKHY'],now).pools.map(p=>({...compact.pools.data.MU.find(q=>q.address===p.address), observedAt:p.observedAt})),
  });
  for(const symbol of ['MU','SKHY']) {
    const a=tokenObservation(input,symbol,now), b=tokenObservation(compact,symbol,now);
    for(const key of ['price','change24h','priceConflict','issuedValue','poolVolume24h','lastPoolVolume24h','poolCoveragePartial','lastPoolTime','priceTime'])assert.equal(b[key],a[key],key);
    assert.equal(compact.pools.data[symbol].length,input.pools.data[symbol].length);
  }
  assert.deepEqual(compact.pools.asOf,input.pools.asOf);
  assert.equal(compact.pools.data.MU[0].source,'dexscreener');
  assert.equal(compact.pools.data.MU[0].observedAt ?? compact.pools.asOf.MU,now);
  assert.equal('observedAt' in compact.pools.data.MU[0],false,'omit only timestamps identical to the enclosing source');
  for(const key of ['baseMint','quoteMint','createdAt','side'])assert.equal(key in compact.pools.data.MU[0],false);
});
void test('large public pool inventories stay within the payload budget without truncation',()=>{
  const pools=Array.from({length:1000},(_,i)=>pool(String(i).padEnd(44,'a')));
  const input=overview({MU:pools});
  const compact=publicMarketPayload(input);
  assert.ok(Buffer.byteLength(JSON.stringify(input))>400000);
  assert.ok(Buffer.byteLength(JSON.stringify(compact))<400000);
  assert.equal(compact.pools.data.MU.length,1000);
  assert.equal(displayPoolActivity(compact,['MU'],now).volume24h,200000);
});
void test('unavailable pool data remains null and retains its error and timestamps',()=>{
  const input=overview(null);input.pools.error='Unavailable';input.pools.stale=true;
  assert.deepEqual(publicMarketPayload(input),input);
});

void test('repeated default pool links are reconstructed and custom venue links retained',()=>{
 const original=pool('address');const other=pool('custom',{url:'https://www.geckoterminal.com/solana/pools/custom'});
 const out=publicMarketPayload(overview({MU:[original,other]})).pools.data.MU;
 assert.equal(out[0].url,undefined);assert.equal(poolLink(out[0]),original.url);assert.equal(poolLink(out[1]),other.url);
});
