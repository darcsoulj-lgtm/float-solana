import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const { publicPageResponse } = await bundle("export * from './lib/public-page-response';");
const html=(headers={})=>new Response('<html>public shell</html>',{headers:{'Content-Type':'text/html; charset=utf-8',...headers}});
const request=(path='/',headers={})=>new Request('https://float.test'+path,{headers:{accept:'text/html',...headers}});
void test('anonymous HTML shells share an edge cache without browser caching and versions isolate releases',async()=>{
  const entries=new Map(),jobs=[];let renders=0;
  const cache={match:async key=>entries.get(key.url)?.clone(),put:async(key,response)=>{entries.set(key.url,response);}};
  const load=async()=>{renders++;return html();};
  const first=await publicPageResponse(request(),load,cache,p=>jobs.push(p),'one');await Promise.all(jobs);
  const second=await publicPageResponse(request(),load,cache,p=>jobs.push(p),'one');
  assert.equal(renders,1);assert.equal(await first.text(),await second.text());
  assert.equal(first.headers.get('Cache-Control'),'no-store');assert.equal(second.headers.get('Cache-Control'),'no-store');
  assert.equal(second.headers.get('X-Float-Page-Cache'),'HIT');
  assert.equal([...entries.values()][0].headers.get('Cache-Control'),'public, max-age=86400');
  await publicPageResponse(request(),load,cache,p=>jobs.push(p),'two');assert.equal(renders,2);
});
void test('cookies, credentials, RSC/navigation headers, queries and all private routes bypass shared cache',async()=>{
  let reads=0,writes=0,renders=0;
  const cache={match:async()=>{reads++;return html();},put:async()=>{writes++;}};
  const cases=[request('/',{cookie:'member=private'}),request('/',{authorization:'Bearer private'}),request('/?view=home'),request('/?thread=1'),request('/api/community/status'),request('/widget'),request('/profile'),request('/',{accept:'application/json'})];
  for(const header of ['RSC','Next-Router-State-Tree','Next-Router-Prefetch','Next-Router-Segment-Prefetch','Next-Url','X-Vinext-Interception-Context','X-Vinext-Mounted-Slots','X-Vinext-Rsc-Render-Mode','oai-authenticated-user-id','oai-authenticated-user-email','oai-authenticated-user-full-name','oai-authenticated-user-full-name-encoding'])cases.push(request('/',{[header]:'1'}));
  cases.push(new Request('https://float.test/',{method:'POST',headers:{accept:'text/html'}}));
  for(const req of cases)await publicPageResponse(req,async()=>{renders++;return html();},cache,()=>{},'one');
  assert.equal(renders,cases.length);assert.equal(reads,0);assert.equal(writes,0);
});
void test('private, session-setting, non-HTML and failed responses never enter the public page cache',async()=>{
  let writes=0;const cache={match:async()=>undefined,put:async()=>{writes++;}};
  const responses=[html({'Set-Cookie':'member=private'}),html({'Cache-Control':'private'}),html({'Cache-Control':'no-store'}),html({Vary:'Cookie'}),html({Vary:'Authorization'}),html({Vary:'*'}),Response.json({private:true}),new Response('failure',{status:503})];
  for(const response of responses){const actual=await publicPageResponse(request('/markets'),async()=>response,cache,()=>{},'one');assert.equal(actual,response);}
  assert.equal(writes,0);
});
void test('cache failures preserve normal rendering and missing deployment versions disable caching',async()=>{
  const cache={match:async()=>{throw Error('cache unavailable');},put:async()=>{throw Error('cache unavailable');}};
  const jobs=[];
  assert.equal(await (await publicPageResponse(request(),async()=>html(),cache,p=>jobs.push(p),'one')).text(),'<html>public shell</html>');await Promise.all(jobs);
  const response=html();assert.equal(await publicPageResponse(request(),async()=>response,cache,()=>{}),response);
});
