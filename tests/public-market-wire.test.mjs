import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePublicMarketWire,decodePublicMarketWire} from '../lib/public-market-wire.mjs';
import {publicationIssues} from '../scripts/market/publication-check.mjs';
import {bundle} from './helpers/bundle.mjs';
const api=await bundle(`export{publicMarketPayload}from './lib/public-market-payload';export{tokenObservation,displayPoolActivity}from './lib/token-observation';`);
const now=Date.now(),source=data=>({data,fetchedAt:now,stale:false,error:null});
function fixture(rows){return{backpack:source({MU:{externalPrice:10,externalChange24h:null,externalChangeUnit:'percent'}}),prices:source({}),supplies:source({}),markets:source({}),catalog:source([]),pools:{...source({MU:rows,SKHY:rows}),asOf:{MU:now,SKHY:now-1000}}};}
function pool(i=0){return{address:'pool-'+i,dex:'raydium',quote:'USDC',price:10.1234567890123,change24h:null,liquidity:100,volume24h:0,source:'dexscreener',observedAt:now};}
void test('compact transport preserves every null, zero, precision, timestamp and qualification',()=>{
 const input=api.publicMarketPayload(fixture([pool(),{...pool(1),url:'https://example.test/pool',observedAt:now-1000,origin:'stonkfun',unavailable:true,delayed:true,volumeDisputed:true,price:null,liquidity:null,volume24h:null}]));
 const before=JSON.stringify(input),decoded=decodePublicMarketWire(JSON.parse(JSON.stringify(encodePublicMarketWire(input))));
 assert.equal(JSON.stringify(input),before);assert.deepEqual(decoded,input);
 for(const s of ['MU','SKHY'])assert.deepEqual(api.tokenObservation(decoded,s,now),api.tokenObservation(input,s,now));
 assert.deepEqual(api.displayPoolActivity(decoded,['MU','SKHY'],now),api.displayPoolActivity(input,['MU','SKHY'],now));
 assert.equal(decodePublicMarketWire(input),input,'legacy responses remain usable');
});
void test('2000 pool transport remains below the same 400KB guard without truncation',()=>{
 const rows=Array.from({length:1000},(_,i)=>({...pool(i),address:String(i).padEnd(44,'a'),observedAt:now-i,volume24h:i+1}));
 const input=api.publicMarketPayload(fixture(rows)),wire=encodePublicMarketWire(input),text=JSON.stringify(wire);
 assert.ok(Buffer.byteLength(JSON.stringify(input))>400000);assert.ok(Buffer.byteLength(text)<300000);
 assert.deepEqual(decodePublicMarketWire(JSON.parse(text)),input);
 const expected={tokens:Object.entries(input.pools.data).map(([symbol,pools])=>({symbol,pools:pools.map(p=>({...p,observedAt:p.observedAt??input.pools.asOf[symbol]}))}))};
 const headers=new Headers({'cache-control':'no-store'});assert.deepEqual(publicationIssues(expected,text,headers,now),[]);
 wire.pools.data.MU[0][6]=999;
 assert.match(publicationIssues(expected,JSON.stringify(wire),headers,now).join(';'),/not published/);
 wire.pools.data.MU.shift();
 assert.match(publicationIssues(expected,JSON.stringify(wire),headers,now).join(';'),/collected pool missing/);
});
void test('malformed transport fails closed and null source is preserved',()=>{
 const input=fixture([]);input.pools.data=null;assert.deepEqual(decodePublicMarketWire(encodePublicMarketWire(input)),input);
 for(const change of [m=>m.marketWireVersion=2,m=>m.pools.data.MU[0].splice(6),m=>m.pools.data.MU[0][6]='0',m=>m.pools.data.MU[0][9]='today',m=>m.pools.data.MU[0][11]='true']){
  const wire=encodePublicMarketWire(fixture([pool()]));change(wire);assert.throws(()=>decodePublicMarketWire(wire));
 }
});
