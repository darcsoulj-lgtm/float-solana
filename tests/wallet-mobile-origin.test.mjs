import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as handoffs from '../lib/wallet-handoff.ts';
import * as links from '../lib/wallet-browser-link.ts';
const require = createRequire(import.meta.url);
const id = '85e158b6-5f36-4732-983c-54dd80d9a4ef';
function setup(file, { userAgent = 'Mozilla/5.0 (iPhone) KAKAOTALK', standalone = false, url = 'https://float.test/?join=1', saved = false, claimReady = true, claimError = false } = {}) {
  const values = new Map(saved ? [[handoffs.WALLET_HANDOFF_KEY, JSON.stringify({ id, secret: 'a'.repeat(64), expiresAt: Date.now() + 600000 })]] : []);
  const storage = { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  let cursor = 0;
  const states = [], effects = [], timers = [], calls = [], events = new Map();
  const window = { matchMedia: () => ({matches: standalone}), location: { href: url, search: new URL(url).search, assign: value => calls.push(['navigate',value]) }, addEventListener: (key,fn) => events.set(key,fn), removeEventListener: key => events.delete(key) };
  const document = { visibilityState: 'visible', addEventListener: (key,fn) => events.set(key,fn), removeEventListener: key => events.delete(key) };
  const Button = () => null;
  const deps = {
    react: {...React, useState(initial) { const n=cursor++; if (!(n in states)) states[n]=typeof initial==='function'?initial():initial; return [states[n],v=>{states[n]=typeof v==='function'?v(states[n]):v;}]; }, useEffect: fn=>effects.push(fn), useRef: value=>({current:value}), useCallback: fn=>fn },
    '@/lib/wallet-handoff': handoffs, '@/lib/wallet-browser-link': links,
    '@/lib/wallet-provider': { walletAvailability: () => ['phantom','backpack','solflare'].map(id=>({id,state:'detected'})), subscribeWallets: ()=>()=>{} },
    '@/lib/client': { api: async (path,body) => { calls.push([path,body]); if(path==='community/handoff/start') return {id,expiresAt:Date.now()+600000}; if(path==='community/handoff/claim') { if(claimError) throw Error('Network unavailable'); return {ready:claimReady}; } return {member:{id:'member'}}; } },
    './ui/button': {Button}, 'next/image': {default:()=>null},
  };
  const code=ts.transpileModule(readFileSync('components/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};
  compileFunction(code,['require','module','exports','window','document','navigator','localStorage','sessionStorage','setTimeout','clearTimeout','setInterval','clearInterval'])(key=>deps[key] || (key.startsWith('.')||key.startsWith('@/')?{}:require(key)),mod,mod.exports,window,document,{userAgent,platform:'iPhone',maxTouchPoints:1,standalone},storage,storage,fn=>timers.push(fn),()=>{},()=>0,()=>{});
  return { calls,events,effects,timers,values,Button, render(props={disabled:false,onConnect:()=>calls.push(['connect'])}) { cursor=0; return (mod.exports.WalletList || mod.exports.Community)(props); } };
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function buttons(tree, Button, out=[]) { if(!tree||typeof tree!=='object')return out; if(tree.type===Button)out.push(tree); React.Children.forEach(tree.props?.children,n=>buttons(n,Button,out));return out; }
for(const {name,options} of [{name:'KakaoTalk',options:{}},{name:'Safari',options:{userAgent:'Mozilla/5.0 (iPhone) Safari'}},{name:'Home Screen',options:{standalone:true}}]) {
  for(const wallet of ['phantom','backpack','solflare']) void test(`${name}: ${wallet} launch retains origin claim secret and transfers only ID`,async()=>{
    const f=setup('wallet-list.tsx',options);f.render();f.effects.forEach(fn=>fn());f.timers.forEach(fn=>fn());await flush();
    const target=buttons(f.render(),f.Button)[['phantom','backpack','solflare'].indexOf(wallet)];
    assert.equal(target.props.disabled,false);target.props.onClick();
    const link=f.calls.find(c=>c[0]==='navigate')[1];const page=decodeURIComponent(link.split('/browse/')[1].split('?ref=')[0]);
    const flow=JSON.parse(f.values.get(handoffs.WALLET_HANDOFF_KEY));assert.equal(handoffs.walletHandoffId(page),id);assert.ok(!link.includes(flow.secret));assert.equal(f.calls.filter(c=>c[0]==='community/handoff/start').length,1);
  });
}
void test('wallet receiver does not replace incoming transfer and connects named provider directly',async()=>{
  const f=setup('wallet-list.tsx',{url:`https://float.test/wallet/connect/${id}?float_wallet=backpack`});f.render();f.effects.forEach(fn=>fn());f.timers.forEach(fn=>fn());await flush();buttons(f.render(),f.Button)[1].props.onClick();assert.deepEqual(f.calls,[['connect']]);
});
void test('ordinary in-app browser claims saved transfer on restore and clears secret only after success',async()=>{
  const f=setup('community.tsx',{saved:true});f.render();const claimEffect=f.effects.find(fn=>fn.toString().includes('community/handoff/claim'));assert.ok(claimEffect);const cleanup=claimEffect();await flush();assert.ok(f.calls.some(c=>c[0]==='community/handoff/claim'));assert.ok(f.calls.some(c=>c[0]==='community/status'));assert.equal(f.values.has(handoffs.WALLET_HANDOFF_KEY),false);assert.ok(f.events.has('pageshow'));cleanup();assert.equal(f.events.has('pageshow'),false);
});

for(const options of [{claimReady:false},{claimError:true}]) void test('incomplete or interrupted return keeps its secret for the next foreground check',async()=>{
  const f=setup('community.tsx',{saved:true,...options});f.render();const cleanup=f.effects.find(fn=>fn.toString().includes('community/handoff/claim'))();await flush();assert.equal(f.values.has(handoffs.WALLET_HANDOFF_KEY),true);await f.events.get('pageshow')();assert.equal(f.calls.filter(c=>c[0]==='community/handoff/claim').length,2);cleanup();
});
