import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const { parseHolderSnapshot, retainHolderSnapshot } = await bundle("export * from './lib/issuer-holders';");
const now=2000000000000;
const data={version:1,chain:'solana',method:'positive-owner-union-v1',issuers:['backpack','xstocks','ondo'].map(issuer=>({issuer,registryHash:"a".repeat(64),wallets:0,tokens:2,startedAt:now-2000,checkedAt:now-1000}))};
void test('zero is a valid observation, but partial, duplicate and malformed snapshots are rejected',()=>{
 assert.equal(parseHolderSnapshot(data,now).length,3);
 for(const bad of [null,{}, {...data,chain:'ethereum'},{...data,issuers:data.issuers.slice(0,2)}, {...data,issuers:[data.issuers[0],data.issuers[0],data.issuers[2]]}]) assert.equal(parseHolderSnapshot(bad,now),null);
 for(const override of [{wallets:-1},{wallets:1.5},{tokens:0},{checkedAt:now+120000},{startedAt:now}]) assert.equal(parseHolderSnapshot({...data,issuers:[{...data.issuers[0],...override},...data.issuers.slice(1)]},now),null);
});
void test('failure and older responses retain the previous observation without changing its date',()=>{
 const old=parseHolderSnapshot(data,now);
 assert.equal(retainHolderSnapshot(old,{},now),old);
 assert.equal(retainHolderSnapshot(old,{...data,issuers:data.issuers.map(r=>({...r,checkedAt:now-1500}))},now),old);
 const fresh={...data,issuers:data.issuers.map(r=>({...r,wallets:123,checkedAt:now}))};
 assert.equal(retainHolderSnapshot(old,fresh,now)[0].wallets,123);
});
