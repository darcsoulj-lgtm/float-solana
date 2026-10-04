import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
const a=await bundle(`export * from './lib/stock-logo';`);
void test('new Backpack listings resolve automatically without a manual asset map',()=>{
 assert.equal(a.stockLogo({issuer:'backpack',symbol:'NEWSTOCK'}),'/api/stock-logo?symbol=NEWSTOCK&v=1');
 assert.match(a.stockLogo({issuer:'backpack',symbol:'MU'}),/^\/stock-logos\//);
 assert.equal(a.stockLogo({issuer:'ondo',symbol:'NEWSTOCK'}),undefined);
});
void test('official images are bounded, cached and sandboxed, with no arbitrary fetch destinations',async()=>{
 let url;const r=await a.fetchStockLogo('BLK',async (u,options)=>{assert.equal(options.redirect,'manual');url=u;return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>',{headers:{'content-type':'image/svg+xml'}});});
 assert.equal(url,'https://backpack.exchange/api/stock-logo/BLK');assert.equal(r.status,200);
 assert.match(r.headers.get('Content-Security-Policy'),/^sandbox;/);assert.match(r.headers.get('Cache-Control'),/86400/);
 let calls=0;assert.equal(await a.fetchStockLogo('../bad',async()=>{calls++;}),null);assert.equal(calls,0);
 for(const response of [new Response(null,{status:302,headers:{location:'https://untrusted.invalid'}}),new Response('bad',{status:404}),new Response('html',{headers:{'content-type':'text/html'}}),new Response(new Uint8Array(256001),{headers:{'content-type':'image/png'}})])assert.equal(await a.fetchStockLogo('BLK',async()=>response),null);
});
