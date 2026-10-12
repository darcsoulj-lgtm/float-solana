import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileFunction} from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../hooks/use-market-overview.ts',import.meta.url),'utf8');

void test('restoring a suspended market page fetches new data and removes its resume listener on unmount',async()=>{
 const saved={window:globalThis.window,document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,dateNow:Date.now};
 let clock=100000,calls=0;const timers=new Set(),effects=[];
 const win=new EventTarget();win.localStorage={};const doc=new EventTarget();doc.hidden=false;
 globalThis.window=win;globalThis.document=doc;Date.now=()=>clock;
 globalThis.setInterval=fn=>{timers.add(fn);return fn;};globalThis.clearInterval=fn=>timers.delete(fn);
 const exports={},dependencies={
  react:{useEffect:fn=>effects.push(fn),useState:()=>[false,()=>{}],useSyncExternalStore:(subscribe,get)=>{subscribe(()=>{});return get();}},
  '@/lib/client':{api:async()=>({generation:++calls})},
  '@/lib/market-browser-cache':{savedMarketPages:()=>[],saveMarketPage:()=>{}},
  '@/lib/market-refresh':{retainRefreshingSources:()=>{}},
  '@/lib/market-data':{MARKET_REFRESH_MS:30000},
 };
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  compileFunction(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,['require','module','exports'])(name=>{assert.ok(name in dependencies,name);return dependencies[name];},{exports},exports);
  exports.useMarketOverview([],0,'backpack');const cleanup=effects[0]();await settle();assert.equal(calls,1);
  // Initial pageshow and simultaneous visibility/focus wakes do not duplicate a request.
  win.dispatchEvent(new Event('pageshow'));await settle();assert.equal(calls,1);
  doc.hidden=true;clock+=3600000;win.dispatchEvent(new Event('pageshow'));await settle();assert.equal(calls,1);
  doc.hidden=false;win.dispatchEvent(new Event('pageshow'));win.dispatchEvent(new Event('focus'));doc.dispatchEvent(new Event('visibilitychange'));
  await settle();assert.equal(calls,2,'A restored page must load the current snapshot without requiring navigation');
  assert.equal(timers.size,1);cleanup();assert.equal(timers.size,0);
  clock+=3600000;win.dispatchEvent(new Event('pageshow'));await settle();assert.equal(calls,2,'Unmounted pages must not fetch data');
 }finally{Object.assign(globalThis,{window:saved.window,document:saved.document,setInterval:saved.setInterval,clearInterval:saved.clearInterval});Date.now=saved.dateNow;}
});
