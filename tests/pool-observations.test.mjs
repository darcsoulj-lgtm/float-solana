import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const api = await bundle("export * from './lib/pool-observations'; export {fetchPools} from './lib/market-data'; export {TOKENS} from './lib/tokens'; export {poolMetrics} from './lib/stock-pools';");
void test('partial refresh preserves the failed token value and time, including legacy cache migration',()=>{
 const old=api.poolObservations({A:[{volume24h:10}],B:[{volume24h:20}]},100);
 const merged=api.mergePoolObservations(old,{B:[],C:[{volume24h:30}]},1000000);
 assert.deepEqual(merged.asOf,{A:100,B:1000000,C:1000000});
 assert.equal(merged.data.A[0].volume24h,10);assert.deepEqual(merged.data.B,[]);
 const source=api.poolSource({data:merged,fetchedAt:1000000,stale:false,error:null},1000001);
 assert.equal(source.asOf.A,100);assert.equal(source.asOf.C,1000000);assert.ok(source.error);
 assert.throws(()=>api.mergePoolObservations(old,{},1000000),/No complete/);
});
void test('missing pools retain retry identities without freezing token refresh',async()=>{
 const [a,b]=api.TOKENS;const usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
 const missing={address:'missing-pool',baseMint:a.mint,quoteMint:usdc};
 const fetcher=async url=>Response.json(String(url).includes('stonkfun')?{data:{tokens:[]}}:String(url).includes('/latest/dex/pairs/')?{pairs:[]}:[]);
 const data=await api.fetchPools(fetcher,[a,b],[a,b],{knownPools:[missing],detailMints:[],isolateMissing:true});
 assert.equal(data[a.symbol][0].unavailable,true);assert.equal(data[a.symbol][0].volume24h,null);assert.deepEqual(data[b.symbol],[]);
 assert.equal(api.poolMetrics(data[a.symbol]).volume24h,null);
 assert.equal(api.poolMetrics(data[a.symbol]).partial,true);
 await assert.rejects(api.fetchPools(fetcher,[a,b],[a,b],{knownPools:[missing],detailMints:[]}),/incomplete/);
});

void test('active and newly discovered pools refresh beside a missing pool, then recover automatically',async()=>{
 const [a]=api.TOKENS; const usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
 const address1='11111111111111111111111111111111',address2='22222222222222222222222222222222';
 const pair=(address,volume)=>({chainId:'solana',pairAddress:address,dexId:'orca',url:'https://dexscreener.com/solana/'+address,
 baseToken:{address:a.mint,symbol:a.symbol},quoteToken:{address:usdc,symbol:'USDC'},priceUsd:'10',volume:{h24:volume},liquidity:{usd:100},priceChange:{h24:1}});
 const old={address:address1,baseMint:a.mint,quoteMint:usdc,dex:'orca',quote:'USDC',price:9,change24h:2,volume24h:999,liquidity:999,url:''};
 let recovered=false;
 const fetcher=async input=>{const url=String(input.url??input);return Response.json(url.includes('stonkfun')?{data:{tokens:[]}}:
 url.includes('/latest/dex/pairs/')?{pairs:recovered?[pair(address1,20)]:[]}:[pair(address2,50)]);};
 const fresh=await api.fetchPools(fetcher,[a],[a],{knownPools:[old],detailMints:[a.mint],isolateMissing:true});
 assert.equal(api.poolMetrics(fresh[a.symbol]).volume24h,null);
 assert.equal(api.poolMetrics(fresh[a.symbol]).partial,true);
 const merged=api.mergePoolObservations(api.poolObservations({[a.symbol]:[old]},1),fresh,1000000);
 assert.equal(merged.asOf[a.symbol],1000000);
 assert.ok(api.poolSource({data:merged,fetchedAt:1000000,stale:false,error:null},1000001).error);
 recovered=true;
 const next=await api.fetchPools(fetcher,[a],[a],{knownPools:fresh[a.symbol],detailMints:[a.mint],isolateMissing:true});
 assert.equal(api.poolMetrics(next[a.symbol]).volume24h,70);
 assert.equal(api.poolMetrics(next[a.symbol]).partial,false);
 assert.equal(api.poolSource({data:api.mergePoolObservations(merged,next,1000002),fetchedAt:1000002,stale:false,error:null},1000003).error,null);
});
void test('a provider outage rejects the refresh rather than publishing zero or renewing timestamps',async()=>{
 const [a]=api.TOKENS;
 const fetcher=async input=>String(input.url??input).includes('stonkfun')?Response.json({data:{tokens:[]}}):new Response('',{status:503});
 await assert.rejects(api.fetchPools(fetcher,[a],[a],{knownPools:[],detailMints:[],isolateMissing:true}));
});

void test('detail display picks the newest eligible observation, never an older zero or future timestamp',()=>{
 const now=10000000;
 const row=(volume)=>({address:'pool',volume24h:volume,liquidity:1});
 const overview={data:{BB:[row(47000)]},asOf:{BB:now-1000},fetchedAt:1,stale:true,error:null};
 const detail={data:[row(0)],fetchedAt:now-2000,stale:false,error:null};
 assert.equal(api.latestTokenPoolSource(overview,detail,'BB',now).data[0].volume24h,47000);
 assert.equal(api.latestTokenPoolSource(overview,{...detail,fetchedAt:now},'BB',now).data[0].volume24h,0);
 assert.equal(api.latestTokenPoolSource(overview,{...detail,fetchedAt:now+61000},'BB',now).data[0].volume24h,47000);
 assert.equal(api.latestTokenPoolSource({...overview,asOf:{BB:now-400000}},detail,'BB',now).data[0].volume24h,0);
 const saved=api.latestTokenPoolSource({...overview,asOf:{BB:now-400000}},null,'BB',now);
 assert.equal(saved.stale,true);assert.equal(saved.fetchedAt,now-400000);
 assert.equal(api.latestTokenPoolSource({...overview,asOf:{BB:now-86400001}},null,'BB',now).data,null);
});
