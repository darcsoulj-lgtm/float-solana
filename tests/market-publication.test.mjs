import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationIssues} from '../scripts/market/publication-check.mjs';
const now=200000000,observedAt=now-120000;
const pool={address:'pool',volume24h:500000,observedAt};
const expected={tokens:[{symbol:'DRAM',pools:[pool]}]};
const market={backpack:{fetchedAt:now},catalog:{fetchedAt:now},pools:{data:{DRAM:[pool]}}};
const headers=new Headers({'cache-control':'no-store'});
const check=(value=market,h=headers)=>publicationIssues(expected,JSON.stringify(value),h,now);
void test('compact public timestamps retain freshness, immutable value and future-time guards',()=>{
 const {observedAt:omitted,...compactPool}=pool;
 const compact={...market,pools:{data:{DRAM:[compactPool]},asOf:{DRAM:omitted},fetchedAt:omitted-86400000}};
 assert.equal(compact.pools.data.DRAM[0].observedAt,undefined);
 assert.deepEqual(check(compact),[]);
 assert.match(check({...compact,pools:{...compact.pools,data:{DRAM:[{...compact.pools.data.DRAM[0],volume24h:0}]}}}).join(';'),/not published/);
 assert.match(check({...compact,pools:{...compact.pools,asOf:{DRAM:now-16*60000}}}).join(';'),/No recent public pool observations/);
 assert.match(check({...compact,pools:{...compact.pools,asOf:{DRAM:now+60001}}}).join(';'),/future pool observation/);
 const mixed={...compact,pools:{...compact.pools,data:{DRAM:[{...compactPool,observedAt:observedAt-1000}]}}};
 assert.match(check(mixed).join(';'),/not published/);
 const legacy={...compact,pools:{data:compact.pools.data,fetchedAt:observedAt}};
 assert.deepEqual(check(legacy),[]);
 const unknown={...compact,pools:{data:compact.pools.data}};
 assert.match(check(unknown).join(';'),/No recent public pool observations/);
});
void test('publication independently rejects unqualified venue volume and a mismatched selected source',()=>{
 assert.match(check({...market,pools:{data:{DRAM:[{...pool,source:'raydium'}]}}}).join(';'),/unqualified Raydium/);
 const identity={...pool,source:'raydium',volume24h:null};
 const identityMarket={...market,pools:{data:{DRAM:[identity]}}};
 assert.deepEqual(publicationIssues({tokens:[{symbol:'DRAM',pools:[identity]}]},JSON.stringify(identityMarket),headers,now),[]);
 assert.match(publicationIssues({tokens:[{symbol:'DRAM',pools:[{...pool,source:'dexscreener'}]}]},JSON.stringify({...market,pools:{data:{DRAM:[{...pool,source:'geckoterminal'}]}}}),headers,now).join(';'),/not published/);
});
void test('publication verifier detects percentage-unit regressions even with fresh market data',()=>{
 const row={externalFirstPrice:100,externalPrice:105,externalChange24h:5,externalChangeUnit:'percent'};
 const value={...market,backpack:{fetchedAt:now,data:{MU:row}}};
 assert.deepEqual(check(value),[]);
 assert.match(check({...value,backpack:{...value.backpack,data:{MU:{...row,externalChange24h:0.05}}}}).join(';'),/disagrees with first\/last/);
 assert.match(check({...value,backpack:{...value.backpack,data:{MU:{...row,externalChangeUnit:undefined}}}}).join(';'),/unnormalized/);
 assert.deepEqual(check({...value,backpack:{...value.backpack,data:{MU:{...row,externalChange24h:null}}}}),[]);
});
void test('independent publication check detects a collected pool omitted by a valid-looking public response',()=>{
 assert.deepEqual(check(),[]);
 assert.match(check({...market,pools:{data:{DRAM:[]}}}).join(';'),/collected pool missing/);
 assert.match(check({...market,pools:{data:{DRAM:[{...pool,volume24h:0}]}}}).join(';'),/not published/);
 const pending={tokens:[...expected.tokens,{symbol:'NEW',pools:[]}]};
 assert.deepEqual(publicationIssues(pending,JSON.stringify(market),headers,now),[]);
});
void test('same-window values must match; a newer verified zero is accepted instead of maximizing volume',()=>{
 assert.deepEqual(check({...market,pools:{data:{DRAM:[{...pool,volume24h:0,observedAt:observedAt+1}]}}}),[]);
 assert.match(check({...market,pools:{data:{DRAM:[{...pool,observedAt:observedAt-1}]}}}).join(';'),/not published/);
});
void test('cache HIT still requires no-store; cookies, stale references, invalid volumes and duplicate identities fail',()=>{
 const hit=new Headers({'cache-control':'public, max-age=300','cf-cache-status':'HIT','set-cookie':'private=1'});
 assert.match(check(market,hit).join(';'),/no-store/);assert.match(check(market,hit).join(';'),/cookie/);
 assert.match(check({...market,backpack:{fetchedAt:now-16*60000}}).join(';'),/not fresh/);
 assert.match(check({...market,sessionToken:'secret'}).join(';'),/Private field/);
 assert.match(check({...market,pools:{data:{DRAM:[pool,pool]}}}).join(';'),/duplicate/);
 assert.match(check({...market,pools:{data:{DRAM:[{...pool,observedAt:now+61000}]}}}).join(';'),/future/);
 assert.match(check({...market,pools:{data:{DRAM:[{...pool,volume24h:-1}]}}}).join(';'),/invalid/);
});

void test('fresh collection timestamps cannot conceal blank prices; dated history is allowed only inside its explicit retention window',()=>{
 const blank={...market,backpack:{fetchedAt:now,data:{MU:{externalPrice:null,externalChange24h:null,externalChangeUnit:'percent'}}}};
 assert.match(check(blank).join(';'),/No usable Backpack reference prices/);
 const row={externalPrice:105,externalFirstPrice:100,externalChange24h:5,externalChangeUnit:'percent',externalBasis:'hourly-history',externalObservedAt:now-24*3600000};
 const dated={...market,backpack:{fetchedAt:now-24*3600000,data:{MU:row}}};
 assert.deepEqual(check(dated),[]);
 assert.match(check({...dated,backpack:{...dated.backpack,data:{MU:{...row,externalObservedAt:now-97*3600000}}}}).join(';'),/invalid dated reference/);
 assert.match(check({...dated,backpack:{...dated.backpack,data:{MU:{...row,externalObservedAt:now+1}}}}).join(';'),/invalid dated reference/);
});
