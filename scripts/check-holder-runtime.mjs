import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url), rr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=rr('miniflare'),{build}=rr('esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));
const compiled=await build({stdin:{resolveDir:root,loader:'ts',contents:`import {refreshHoldingWallets,readHoldingWallets} from './lib/issuer-holders-server';import {holderRegistry} from './lib/issuer-holder-registry';const tokens=['backpack','xstocks','ondo'].map(issuer=>({issuer,mint:issuer}));export default {async fetch(req,env){const u=new URL(req.url);if(u.pathname==='/registry')return Response.json(await holderRegistry(tokens));if(u.pathname==='/run'){try{await refreshHoldingWallets(env,fetch,Number(u.searchParams.get('now')));}catch{return new Response('upstream failed',{status:503});}}return Response.json(await readHoldingWallets(env.DB,Number(u.searchParams.get('now'))||Date.now()));}};`},bundle:true,format:'esm',platform:'browser',write:false,plugins:[{name:'registry-fixture',setup(b){b.onResolve({filter:/backpack-registry$/},()=>({path:'registry',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'ts',contents:`export const backpackRegistry=async()=>({});export const registryTokens=()=>['backpack','xstocks','ondo'].map(issuer=>({issuer,mint:issuer}));`}));}}]});
let response=null,calls=0;
const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,d1Databases:{DB:'holder-test'},compatibilityDate:'2026-05-15',outboundService:async()=>{calls++;return response===null?new Response('offline',{status:503}):Response.json(response);}});
try{
 const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE market_cache (key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)');
 const read=async path=>(await mf.dispatchFetch('https://test'+path)).json();let now=Date.now();const original=await read('/?now='+now);const registry=await read('/registry');
 response={version:1,chain:'solana',method:'positive-owner-union-v1',issuers:registry.map(r=>({issuer:r.issuer,wallets:123,tokens:1,registryHash:r.registryHash,startedAt:now-1000,checkedAt:now}))};
 assert.equal((await mf.dispatchFetch('https://test/run?now='+now)).status,200);assert.equal((await read('/?now='+now)).issuers[0].wallets,123);
 await mf.dispatchFetch('https://test/run?now='+now);assert.equal(calls,1,'duplicate delivery must reuse lease');
 now+=3600001;response=null;assert.equal((await mf.dispatchFetch('https://test/run?now='+now)).status,503);assert.equal((await read('/?now='+now)).issuers[0].wallets,123);
 now+=3600001;response={version:1,chain:'solana',method:'positive-owner-union-v1',issuers:original.issuers.map(r=>({...r,wallets:999,startedAt:now-1000,checkedAt:now,registryHash:'0'.repeat(64)}))};
 await mf.dispatchFetch('https://test/run?now='+now);assert.equal((await read('/?now='+now)).issuers[0].wallets,123,'wrong registry cannot replace old values');
 now+=3600001;response={broken:true};assert.equal((await mf.dispatchFetch('https://test/run?now='+now)).status,503);assert.equal((await read('/?now='+now)).issuers[0].wallets,123);
 console.log('PASS: real Worker + D1 publication, lease, failure retention, registry mismatch and malformed input');
}finally{await mf.dispose();}
