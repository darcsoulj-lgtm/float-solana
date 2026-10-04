import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { bundle } from './helpers/bundle.mjs';
import { visitorAnalyticsBootstrap } from '../lib/visitor-analytics.ts';
const security = await bundle(readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8').replace(
  "import { NextResponse } from 'next/server';",
  'const NextResponse = { next: () => new Response(null) };',
));
void test('actual response policy permits only the analytics script and collection endpoint while logos remain sandboxed', () => {
  const policy = security.proxy(new Request('https://joinfloat.xyz/markets')).headers.get('Content-Security-Policy');
  const directives = new Map(policy.split('; ').map(value => {
    const [name, ...sources] = value.split(' '); return [name, sources];
  }));
  assert.deepEqual(directives.get('script-src'), ["'self'", "'unsafe-inline'", 'https://static.cloudflareinsights.com/beacon.min.js']);
  assert.deepEqual(directives.get('connect-src'), ["'self'", 'https://cloudflareinsights.com/cdn-cgi/rum']);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
  assert.equal(security.proxy(new Request('https://joinfloat.xyz/api/stock-logo?symbol=NVDA')).headers.get('Content-Security-Policy'), "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
});
function run(url='https://joinfloat.xyz/', options={}) {
  const saved=new Map(options.excluded ? [['float-analytics-excluded','1']] : []);
  const scripts=[]; const history=[];
  const context={URL,JSON,location:new URL(url),localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>{if(options.blocked)throw Error('blocked'); saved.set(k,v);}},history:{state:null,replaceState:(_s,_t,u)=>history.push(u)},document:{referrer:options.referrer||'',getElementById:()=>options.existing,createElement:()=>({setAttribute(k,v){this[k]=v;}}),head:{appendChild:s=>scripts.push(s)}}};
  vm.runInNewContext(visitorAnalyticsBootstrap,context);
  return {saved,scripts,history};
}
void test('public production pages load exactly one configured beacon',()=>{
  const {scripts}=run('https://joinfloat.xyz/markets/BB?token=BB');
  assert.equal(scripts.length,1);
  assert.equal(scripts[0].src,'https://static.cloudflareinsights.com/beacon.min.js');
  assert.equal(JSON.parse(scripts[0]['data-cf-beacon']).spa,false);
  assert.equal(run(undefined,{existing:true}).scripts.length,0);
});
void test('internal preference applies before loading and persists without the URL marker',()=>{
  const r=run('https://joinfloat.xyz/analytics-settings?float_internal=1');
  assert.equal(r.saved.get('float-analytics-excluded'),'1');
  assert.deepEqual(r.history,['/analytics-settings']);
  assert.equal(r.scripts.length,0);
  assert.equal(run(undefined,{excluded:true}).scripts.length,0);
  assert.equal(run('https://joinfloat.xyz/?float_internal=0',{excluded:true}).saved.get('float-analytics-excluded'),'0');
});
void test('local, private and sensitive return flows never load analytics',()=>{
  for(const url of ['http://localhost:3012/','https://preview.example/','https://joinfloat.xyz/wallet/connect/secret','https://joinfloat.xyz/profile','https://joinfloat.xyz/widget','https://joinfloat.xyz/?float_handoff=secret','https://joinfloat.xyz/?join=1','https://joinfloat.xyz/?float_wallet=phantom'])assert.equal(run(url).scripts.length,0,url);
  assert.equal(run(undefined,{referrer:'https://joinfloat.xyz/wallet/connect/secret'}).scripts.length,0);
  assert.equal(run('https://joinfloat.xyz/?float_internal=1',{blocked:true}).scripts.length,0);
});
