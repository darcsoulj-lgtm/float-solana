import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFunction } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import ts from 'typescript';
import { bundle } from './helpers/bundle.mjs';
const require=createRequire(import.meta.url);
const policy=await bundle("export * from './lib/install-experience';");
const source=await readFile(new URL('../components/install-experience.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function setup({standalone=false,blockedStorage=false,path='/markets'}={}) {
  let cursor=0;
  const values=[],effects=[],timers=[],events=new Map();
  const saved=new Map([[policy.INSTALL_VISIT_KEY,String(Date.now()-3600_000)]]);
  const storage={getItem:k=>{if(blockedStorage)throw Error('blocked');return saved.get(k)??null;},setItem:(k,v)=>saved.set(k,v)};
  const display={matches:standalone,addEventListener(){},removeEventListener(){}};
  const deps={react:{...React,useState:initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],value=>{values[i]=value;}];},useEffect:fn=>effects.push(fn)},'@/lib/install-experience':policy,'./site-link':{default:'a'}};
  const compiledModule={exports:{}};
  compileFunction(code,['require','module','exports','window','navigator','location','localStorage','setTimeout','clearTimeout'])(id=>deps[id]??require(id),compiledModule,compiledModule.exports,{matchMedia:()=>display,addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)},{userAgent:'iPhone Safari',platform:'iPhone',maxTouchPoints:1,standalone},{pathname:path,search:''},storage,(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},timer=>{if(timer)timer.cancelled=true;});
  const render=()=>{cursor=0;return compiledModule.exports.InstallProvider({children:null});};
  render();const cleanup=effects[0]();timers.find(t=>t.ms===0).fn();
  return {render,events,timers,saved,cleanup};
}
void test('Return-visit reminder dismisses persistently and event subscriptions are cleaned up',()=>{
  const s=setup();s.timers.find(t=>t.ms===12000).fn();
  const reminder=s.render().props.children[1];assert.equal(reminder.type,'aside');
  reminder.props.children[2].props.onClick();
  assert.equal(s.render().props.children[1],false);
  assert.equal(s.saved.get(policy.INSTALL_DISMISS_KEY),'1');
  s.cleanup();assert.equal(s.events.size,0);
});
void test('Standalone, blocked storage and wallet screens never schedule a reminder',()=>{
  for(const options of [{standalone:true},{blockedStorage:true},{path:'/wallet/connect/id'}]) {
    const s=setup(options);assert.equal(s.timers.some(t=>t.ms===12000),false);s.cleanup();
  }
});
void test('Native installation waits for a user action and consumes the prompt only once',async()=>{
  const s=setup();let prompted=0,prevented=0;
  s.events.get('beforeinstallprompt')({preventDefault:()=>prevented++,prompt:async()=>prompted++,userChoice:Promise.resolve({outcome:'accepted'})});
  assert.equal(prevented,1);assert.equal(prompted,0);
  assert.equal(s.render().props.value.available,true);
  await s.render().props.value.install();
  assert.equal(prompted,1);assert.equal(s.render().props.value.installed,true);assert.equal(s.render().props.value.available,false);
  await s.render().props.value.install();assert.equal(prompted,1);
});
void test('Dismissed or rejected native prompts leave manual instructions available',async()=>{
  for(const reject of [false,true]) {
    const s=setup();s.events.get('beforeinstallprompt')({preventDefault(){},prompt:async()=>{if(reject)throw Error('unavailable');},userChoice:Promise.resolve({outcome:'dismissed'})});
    await s.render().props.value.install();assert.equal(s.render().props.value.installed,false);assert.equal(s.render().props.value.available,false);
  }
});
