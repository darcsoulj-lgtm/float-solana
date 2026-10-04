import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers/bundle.mjs';
import {validateHealth} from '../scripts/market/check-health.mjs';
const {publicBuiltShell} = await bundle("export * from './lib/public-built-shell';");
const req = (path, headers={}) => new Request('https://float.test'+path,{headers:{accept:'text/html',...headers}});
void test('offline public shells strip all request identity and preserve security/browser freshness',async()=>{
  let forwarded;
  const response=await publicBuiltShell(req('/?view=home',{cookie:'private=1',authorization:'Bearer secret'}),{fetch:async request=>{
    forwarded=request;return new Response('<html>public</html>',{headers:{'content-type':'text/html'}});
  }});
  assert.equal(forwarded.headers.has('cookie'),false);assert.equal(forwarded.headers.has('authorization'),false);
  assert.equal(new URL(forwarded.url).pathname,'/__float-shells/home.html');assert.equal(new URL(forwarded.url).search,'');
  assert.equal(response.headers.get('X-Float-Page-Cache'),'BUILT');assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.equal(response.headers.get('X-Frame-Options'),'DENY');
});
void test('private routes, callbacks, mutations and RSC never use offline shells',async()=>{
  let called=0;const assets={fetch:async()=>{called++;return new Response('no');}};
  for(const request of [req('/profile'),req('/api/community/status'),req('/?wallet_callback=1'),req('/markets?token=MU'),req('/',{RSC:'1'}),req('/',{'next-router-state-tree':'private'}),req('/',{'x-vinext-rsc-render-mode':'1'}),new Request('https://float.test/',{method:'POST',headers:{accept:'text/html'}})]) assert.equal(await publicBuiltShell(request,assets),null);
  assert.equal(called,0);
});
void test('missing, invalid and session-setting built assets fall back to the application',async()=>{
  for(const stored of [new Response('missing',{status:404}),Response.json({private:true}),new Response('<html/>',{headers:{'content-type':'text/html','set-cookie':'private=1'}})]) assert.equal(await publicBuiltShell(req('/markets'),{fetch:async()=>stored}),null);
  assert.equal(await publicBuiltShell(req('/markets')),null);
});
void test('owner monitoring passes healthy fresh state and fails outages or a stopped monitor',()=>{
  const now=Date.now();validateHealth(200,{status:'ok',checkedAt:now,issues:[]},now);
  for(const state of [{status:'degraded',checkedAt:now,issues:[{source:'snapshot',code:'snapshot_publication_overdue'}]},{status:'ok',checkedAt:now-16*60000,issues:[]},{status:'ok',checkedAt:now,issues:[{source:'volume',code:'overdue'}]}]) assert.throws(()=>validateHealth(200,state,now));
  assert.throws(()=>validateHealth(503,{status:'ok',checkedAt:now,issues:[]},now));
});
