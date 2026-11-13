import {loadComponent} from './helpers/component.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
import { readFile } from 'node:fs/promises';
import { compileFunction } from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stockVolumePreview } from '../scripts/stock-volume-preview.mjs';
const a = await bundle("export * from './lib/stock-volume-comparison'; export * from './lib/stock-volume-published';");
const fixture = () => ({ period:1, startUtc:'2026-10-02T04:00:00Z', endUtc:'2026-10-03T04:00:00Z', timeZone:'America/New_York', tokenSource:'birdeye', stockSource:'alpaca-sip', coverage:{available:70,total:71,unavailable:['NVDA']}, rows: ['BLK','PUSA','SPCX','DJT','MU'].map((symbol,i) => ({symbol,name:symbol+' company',mint:'1'.repeat(31)+(i+2),listingExchange:i===0?'NYSE':'NASDAQ',tokenUsd:[21e6,11e6,8e6,7e6,5e6][i],stockUsd:[600e6,8e6,18e9,35e6,29e9][i],reconciled:true})) });

void test('matched New York calendar dates, including DST, are required', () => {
  assert.ok(a.validStockVolumeComparison(fixture()));
  for (const change of [{period:7},{period:30},{startUtc:'2026-10-02T00:00:00Z'},{endUtc:'2026-10-03T03:59:59Z'},{timeZone:'UTC'},{tokenSource:'dexscreener'},{stockSource:'iex'},{endUtc:'invalid'}]) assert.equal(a.validStockVolumeComparison({...fixture(),...change}),false);
  assert.ok(a.validStockVolumeComparison({...fixture(), startUtc:'2026-11-01T04:00:00Z', endUtc:'2026-11-02T05:00:00Z'}), '25-hour DST day is one calendar day');
  assert.ok(a.validStockVolumeComparison({...fixture(),period:7,startUtc:'2026-10-27T04:00:00Z',endUtc:'2026-11-03T05:00:00Z'}));
});
void test('unknown data never becomes zero, duplicate identities and incomplete reconciliations fail closed', () => {
  for (const change of [{tokenUsd:null},{stockUsd:NaN},{tokenUsd:-1},{stockUsd:Infinity},{reconciled:false},{mint:'bad'},{listingExchange:'unknown'}]) {
    const c=fixture(); Object.assign(c.rows[0],change); assert.equal(a.validStockVolumeComparison(c),false);
  }
  const duplicate=fixture(); duplicate.rows[1]=duplicate.rows[0]; assert.equal(a.validStockVolumeComparison(duplicate),false);
  const missing=fixture(); missing.coverage.unavailable=['BLK']; assert.equal(a.validStockVolumeComparison(missing),false);
  assert.equal(a.validStockVolumeComparison({...fixture(),coverage:{available:71,total:71,unavailable:['NVDA']}}),false);
  assert.equal(a.validStockVolumeComparison({...fixture(),rows:fixture().rows.slice(0,4)}),false);
});
void test('ranking uses selected-period token dollar volume and ratios use dollar sums, without clipping', () => {
  const c=fixture(); c.rows.reverse(); assert.deepEqual(a.rankedStockVolumeRows(c).map(r=>r.symbol),['BLK','PUSA','SPCX','DJT','MU']);
  assert.equal(a.stockVolumeRatio({tokenUsd:11e6,stockUsd:8e6}),'1.38×');
  assert.equal(a.stockVolumeRatio({tokenUsd:0,stockUsd:3}),'0%');
  assert.equal(a.stockVolumeRatio({tokenUsd:3,stockUsd:0}),'—');
  assert.equal(a.stockVolumeRatio({tokenUsd:1,stockUsd:1e9}),'<0.001%');
  assert.equal(a.stockVolumeDateLabel(c),'Oct 2, 2026 · ET');
});
void test('next scheduled collection follows the published day across DST and year boundaries', () => {
  assert.equal(a.nextStockVolumeCollection(fixture()), Date.UTC(2026,9,4,9,15));
  assert.equal(a.nextStockVolumeCollection({...fixture(),startUtc:'2026-11-01T04:00:00Z',endUtc:'2026-11-02T05:00:00Z'}), Date.UTC(2026,10,3,9,15));
  assert.equal(a.nextStockVolumeCollection({...fixture(),startUtc:'2026-12-31T05:00:00Z',endUtc:'2027-01-01T05:00:00Z'}), Date.UTC(2027,0,2,9,15));
});
const require=createRequire(import.meta.url), compiled={exports:{}};
const source=ts.transpileModule(await readFile(new URL('../components/stock-volume-comparison.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
compileFunction(source,['require','module','exports'])(id=>id==='@/lib/stock-volume-comparison'?a:id==='@/components/site-link'?{default:({children,...props})=>React.createElement('a',props,children)}:id==='./market-date-navigation'?loadComponent('components/market-date-navigation.tsx'):id==='./metric-info'?{MetricInfo:({label,children})=>React.createElement('details',{'aria-label':label},children)}:require(id),compiled,compiled.exports);
void test('rendered card hides missing data and unavailable period controls and keeps actual amounts accessible',()=>{
  const Card=compiled.exports.StockVolumeComparisonCard;
  assert.equal(renderToStaticMarkup(React.createElement(Card,{comparisons:[]})),'');
  const html=renderToStaticMarkup(React.createElement(Card,{comparisons:[fixture()]}));
  assert.match(html,/1\.38×/);assert.doesNotMatch(html,/class="stock-volume-caption"/);
  assert.doesNotMatch(html,/class="stock-volume-periods"/); assert.match(html,/7D and 30D need complete matched history/);
  assert.match(html,/\$21,000,000\.00/); assert.match(html,/Unavailable: NVDA/);
  assert.match(html,/consolidated SIP/); assert.doesNotMatch(html,/market share:<\/|138%/);
});
void test('daily selection discloses its own timestamp and period without claiming a current or exhaustive top five',()=>{
  const comparison={...fixture(),selectionBasis:'latest-market-volume',selectedAt:Date.UTC(2026,9,3,12),generatedAt:Date.UTC(2026,9,3,12,1)};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.StockVolumeComparisonCard,{comparisons:[comparison],automatic:true}));
  assert.match(html,/Daily · New York time/);
  assert.match(html,/Tokens selected:/);assert.match(html,/New York time/);
  assert.match(html,/calendar-day comparison differs from the rolling 24h/);
  assert.match(html,/selection stays fixed for this date/);
  assert.match(html,/not an exhaustive top-five ranking/);
  assert.doesNotMatch(html,/5 most active tokens/);
  assert.match(html,/Oct 2, 2026/);assert.match(html,/\$21,000,000\.00/);
});
void test('a missing historical series cannot block four verified rows or silently become zero',()=>{
  const comparison={...fixture(),selectionBasis:'latest-market-volume',selectedAt:Date.UTC(2026,9,3,12),generatedAt:Date.UTC(2026,9,3,12,1),rows:fixture().rows.slice(0,4),comparisonCoverage:{selected:['BLK','PUSA','SPCX','DJT','MU'],unavailable:[{symbol:'MU',reason:'token-history-unavailable'}]}};
  assert.ok(a.validStockVolumeComparison(comparison));
  for(const scope of [undefined,{...comparison.comparisonCoverage,unavailable:[]},{...comparison.comparisonCoverage,unavailable:[{symbol:'BLK',reason:'token-history-unavailable'}]},{...comparison.comparisonCoverage,unavailable:[{symbol:'MU',reason:'provider-error'}]},{...comparison.comparisonCoverage,selected:['BLK','PUSA','SPCX','DJT','OTHER']}])assert.equal(a.validStockVolumeComparison({...comparison,comparisonCoverage:scope}),false);
  assert.equal(a.validStockVolumeComparison({...comparison,rows:comparison.rows.slice(0,2)}),false);
  const html=renderToStaticMarkup(React.createElement(compiled.exports.StockVolumeComparisonCard,{comparisons:[comparison],automatic:true}));
  assert.match(html,/4 \/ 5 comparisons/);assert.match(html,/MU history unavailable/);assert.doesNotMatch(html,/MU: Backpack/);
});
void test('private data bridge runs only during development and rejects nonlocal callers',async()=>{
  const plugin=stockVolumePreview(); assert.equal(plugin.apply,'serve');
  let handler; plugin.configureServer({middlewares:{use(fn){handler=fn;}}});
  let next=0, body='',status=200;
  const res={setHeader(){},set statusCode(v){status=v;},end(v=''){body=v;}};
  await handler({url:'/api/stock-volume',method:'GET',headers:{host:'localhost:3217'}},res,()=>next++);assert.equal(next,1);
  await handler({url:'/__float-preview/stock-volume',method:'GET',headers:{host:'evil.example'}},res,()=>next++);assert.equal(status,404);assert.equal(body,'');
});

void test('public historical export preserves verified values, dates and unavailable coverage without provider calls', () => {
  const data=a.publishedStockVolumeComparisons();
  assert.equal(data.length,1); assert.ok(a.validStockVolumeComparison(data[0]));
  assert.equal(data[0].period,1); assert.deepEqual(data[0].coverage.unavailable,['NVDA']);
  assert.deepEqual(data[0].rows.map(r=>r.symbol),['BLK','PUSA','SPCX','DJT','MU']);
  assert.equal(data[0].rows[0].tokenUsd,21798413.76807024);
  assert.equal(data[0].rows[0].stockUsd,607614317.1573);
  assert.equal(a.stockVolumeRatio(data[0].rows[1]),'1.38×');
  assert.deepEqual(a.publishedStockVolumeComparisons({...data[0],period:7}),[]);
  const html=renderToStaticMarkup(React.createElement(compiled.exports.StockVolumeComparisonCard,{comparisons:data,historicalSnapshot:true}));
  assert.match(html,/Historical snapshot · Not automatically updated/);
  assert.match(html,/Oct 2, 2026/);
  assert.match(html,/href="\/data-methodology#stock-volume-comparison"/);
});

void test('member and public Markets omit the stock comparison while mounting the market overview', async () => {
  const inputs=[];
  const Overview=props=>{
    inputs.push(props);
    return React.createElement('div',null,'Market overview');
  };
  async function entry(path, member=false) {
    const code=ts.transpileModule(await readFile(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const output={exports:{}};
    compileFunction(code,['require','module','exports'])(id=>id==='react'&&member?{...React,lazy:()=>Overview}:id==='@/lib/market-scope'?{MARKET_ISSUER_SCOPE:'backpack'}:id==='@/lib/client-module'?{loadClientModule:fn=>fn()}:id==='@/components/market-overview'?{MarketOverviewPanel:Overview}:id==='@/components/site-link'?{default:'a'}:require(id),output,output.exports);
    return output.exports;
  }
  const member=await entry('components/member-markets.tsx',true);
  const positions=[{symbol:'MU',amount:2}];
  const memberHtml=renderToStaticMarkup(React.createElement(member.MemberMarkets,{positions,market:'backpack',onMarketChange:()=>{}}));
  const publicPage=await entry('app/markets/page.tsx');
  const publicHtml=renderToStaticMarkup(React.createElement(publicPage.default));
  for(const html of [memberHtml,publicHtml]){
    assert.match(html,/Market overview/);
  }
  for (const props of inputs) {
    assert.equal(Object.hasOwn(props,'stockComparisons'),false);
    assert.equal(props.issuerScope,'backpack');
  }
  assert.deepEqual(inputs[0].holdings,['MU']);
  assert.deepEqual(inputs[0].positions,positions);
});
