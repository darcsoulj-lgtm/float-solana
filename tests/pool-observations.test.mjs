import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const api = await bundle("export * from './lib/pool-observations'; export {fetchPools} from './lib/market-data'; export {TOKENS} from './lib/tokens';");
void test('partial refresh preserves the failed token value and time, including legacy cache migration',()=>{
 const old=api.poolObservations({A:[{volume24h:10}],B:[{volume24h:20}]},100);
 const merged=api.mergePoolObservations(old,{B:[],C:[{volume24h:30}]},1000000);
 assert.deepEqual(merged.asOf,{A:100,B:1000000,C:1000000});
 assert.equal(merged.data.A[0].volume24h,10);assert.deepEqual(merged.data.B,[]);
 const source=api.poolSource({data:merged,fetchedAt:1000000,stale:false,error:null},1000001);
 assert.equal(source.asOf.A,100);assert.equal(source.asOf.C,1000000);assert.ok(source.error);
 assert.throws(()=>api.mergePoolObservations(old,{},1000000),/No complete/);
});
void test('a missing known pool isolates its tokens while unrelated tokens refresh',async()=>{
 const [a,b]=api.TOKENS;const usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
 const missing={address:'missing-pool',baseMint:a.mint,quoteMint:usdc};
 const fetcher=async url=>Response.json(String(url).includes('stonkfun')?{data:{tokens:[]}}:String(url).includes('/latest/dex/pairs/')?{pairs:[]}:[]);
 const data=await api.fetchPools(fetcher,[a,b],[a,b],{knownPools:[missing],detailMints:[],isolateMissing:true});
 assert.equal(data[a.symbol],undefined);assert.deepEqual(data[b.symbol],[]);
 await assert.rejects(api.fetchPools(fetcher,[a,b],[a,b],{knownPools:[missing],detailMints:[]}),/incomplete/);
});
