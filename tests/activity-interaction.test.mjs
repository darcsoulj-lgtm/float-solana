import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {compileFunction} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {bundle} from './helpers/bundle.mjs';
const require=createRequire(import.meta.url);
const activity=await bundle("export * from './lib/trading-activity';");
const presentation=await bundle("export * from './lib/market-presentation';");
const source=await readFile(new URL('../components/market-activity-history.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const point={day:'2026-10-03',capturedAt:Date.UTC(2026,9,3,12),oldestAt:Date.UTC(2026,9,3,11),newestAt:Date.UTC(2026,9,3,12),basis:'pools',total:100,partial:true,covered:1,known:2,tokens:[{symbol:'MU',value:60},{symbol:'SPCX',value:40}]};
function load(history=[]){
 let hook=0;const changes=[];const compiledModule={exports:{}};
 compileFunction(compiled,['require','module','exports'])(id=>id==='react'?{...React,useId:()=> 'activity-help',useEffect:()=>{},useMemo:fn=>fn(),useState:initial=>{const index=hook++;return [index===1?history:index===4?'ready':initial,value=>changes.push({index,value})];}}:id==='@/lib/client'?{api:()=>{throw Error('Unexpected API in render');}}:id==='@/lib/trading-activity'?{...activity,tradingActivity:()=>point}:id==='@/lib/market-presentation'?presentation:id==='@/components/site-link'?{default:'a'}:id==='./metric-info'?{MetricInfo:()=>null}:require(id),compiledModule,compiledModule.exports);
 return {...compiledModule.exports,changes};
}
function nodes(tree){if(!tree || typeof tree!=='object') return [];if(Array.isArray(tree)) return tree.flatMap(nodes);return [tree,...(Array.isArray(tree?.props?.children)?tree.props.children:[tree?.props?.children]).flatMap(child=>child&&typeof child==='object'?nodes(child):[])];}
void test('Composition segments show the exact amount on hover, focus and tap; Escape dismisses',()=>{
 const {MarketActivityHistory,changes}=load();const tree=MarketActivityHistory({data:null,now:point.capturedAt});
 const button=nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']==='MU: $60');
 assert.ok(button);
 for(const event of ['onPointerEnter','onFocus','onClick']){button.props[event]();assert.equal(changes.at(-1).value.symbol,'MU');assert.equal(changes.at(-1).value.point,point);}
 assert.ok(changes.every(c=>c.index===0),'Inspection does not change the selected date');
 button.props.onBlur();assert.equal(changes.at(-1).value,null);
 button.props.onKeyDown({key:'Escape'});assert.equal(changes.at(-1).value,null);
});
void test('Historical hover is transient; tapping selects that observation',()=>{
 const past={...point,day:'2026-10-02',capturedAt:point.capturedAt-86400000,oldestAt:point.oldestAt-86400000,newestAt:point.newestAt-86400000};
 const {MarketActivityHistory,changes}=load([past]);const tree=MarketActivityHistory({data:null,now:point.capturedAt});
 const bar=nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']==='Oct 2: $100');assert.ok(bar);
 bar.props.onPointerEnter();assert.equal(changes.at(-1).value.point,past);assert.equal(changes.length,1);
 bar.props.onFocus();assert.equal(changes.at(-1).value.point,past);
 bar.props.onClick();assert.ok(changes.some(c=>c.index===3&&c.value==='2026-10-02'));
 nodes(tree).find(n=>n.props?.className==='activity-plot').props.onPointerLeave();assert.equal(changes.at(-1).value,null);
});
void test('Tooltip distinguishes total volume from token contribution and exposes exact currency',()=>{
 const {ActivityTooltip}=load();const render=props=>renderToStaticMarkup(React.createElement(ActivityTooltip,{id:'test',point,x:50,...props}));
 assert.match(render({}),/24h volume/);assert.match(render({}),/\$100\.00/);
 assert.match(render({symbol:'MU'}),/\$60\.00/);assert.match(render({symbol:'MU'}),/60\.0% of observed volume/);
 assert.match(render({composition:true}),/SPCX/);assert.match(render({composition:true}),/\$40\.00/);
});

void test('one observation uses a compact snapshot without empty period controls or a history plot',()=>{
 const {MarketActivityHistory}=load();
 const tree=MarketActivityHistory({data:null,now:point.capturedAt});
 const all=nodes(tree);
 assert.match(tree.props.className,/activity-snapshot/);
 assert.ok(!all.some(n=>n.type==='fieldset'&&n.props['aria-label']==='Activity period'));
 assert.ok(!all.some(n=>n.type==='svg'));
 assert.equal(all.filter(n=>n.props?.className==='activity-token-share').length,2);
 const html=renderToStaticMarkup(tree);
 assert.ok(!html.includes('Daily history is building.'));
 assert.match(html,/60.0%/);assert.match(html,/40.0%/);
});
void test('two observations fill the actual date span without premature period controls or oversized bars',()=>{
 const past={...point,day:'2026-10-02',capturedAt:point.capturedAt-86400000,oldestAt:point.oldestAt-86400000,newestAt:point.newestAt-86400000};
 const {MarketActivityHistory}=load([past]);
 const tree=MarketActivityHistory({data:null,now:point.capturedAt});const all=nodes(tree);
 assert.ok(!tree.props.className.includes('activity-snapshot'));
 assert.ok(!all.some(n=>n.type==='fieldset'&&n.props['aria-label']==='Activity period'));
 const svg=all.find(n=>n.type==='svg');assert.ok(svg);
 assert.match(svg.props['aria-label'],/2 observations over 2 days/);
 assert.ok(all.filter(n=>n.type==='rect'&&n.props.fill!=='transparent').every(n=>n.props.width<=80));
 assert.match(renderToStaticMarkup(tree),/60.0%/);
});
void test('period controls appear after a real week of observed history, and inner gaps remain blank',()=>{
 const past={...point,day:'2026-09-25',capturedAt:point.capturedAt-8*86400000,oldestAt:point.oldestAt-8*86400000,newestAt:point.newestAt-8*86400000};
 const {MarketActivityHistory}=load([past]);const all=nodes(MarketActivityHistory({data:null,now:point.capturedAt}));
 assert.ok(all.some(n=>n.type==='fieldset'&&n.props['aria-label']==='Activity period'));
 assert.match(all.find(n=>n.type==='svg').props['aria-label'],/2 observations over 9 days/);
 assert.equal(all.filter(n=>n.props?.className==='activity-day').length,2);
});
void test('retained prior-day volume cannot create a transient bar for today',()=>{
 const {MarketActivityHistory}=load([point]);
 const tree=MarketActivityHistory({data:null,now:point.capturedAt+86400000});
 const all=nodes(tree);
 assert.ok(!all.some(n=>n.type==='svg'),'The saved prior date remains a snapshot, not a second invented day');
 const html=renderToStaticMarkup(tree);
 assert.match(html,/Oct 3 · UTC/);
 assert.ok(!html.includes('Oct 4'));
 assert.match(html,/\$100/);
});
