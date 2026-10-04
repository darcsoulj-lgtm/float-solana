import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { compileFunction } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bundle } from './helpers/bundle.mjs';
const a = await bundle(`export * from './lib/issuer-comparison'; export * from './lib/issuer-comparison-server'; export {birdeyeVolumeKey} from './lib/birdeye-volume'; export {TOKENS} from './lib/tokens'; export {REGISTRY_KEY} from './lib/backpack-registry';`);
const now = Date.now();
const tokens = a.COMPARISON_ISSUERS.map(issuer => a.TOKENS.find(t => t.issuer === issuer));
function fixture(cohort = tokens, values = [78e6,62e6,10e6]) {
  return new Map(cohort.map((token,i) => [a.birdeyeVolumeKey(token.mint), {key:a.birdeyeVolumeKey(token.mint),payload:JSON.stringify({mint:token.mint,usd24h:values[i]??1,observedAt:now-2*3600000,collectedAt:now-3600000}),fetched_at:now-3600000,retry_after:0}]));
}
function mutate(rows, index, change) {
  const key = a.birdeyeVolumeKey(tokens[index].mint), row = rows.get(key);
  const value = {...JSON.parse(row.payload), ...change};
  rows.set(key, {...row, payload:JSON.stringify(value), fetched_at:value.collectedAt});
  return rows;
}
void test('one source, three issuer sums, exact mint deduplication and zero-safe shares', () => {
  const result = a.buildIssuerComparison([...tokens,tokens[0]],fixture(),now);
  assert.equal(result.total,150e6);
  assert.deepEqual(result.rows.map(r => r.usd24h),[78e6,62e6,10e6]);
  assert.deepEqual(result.rows.map(r => r.tokens),[1,1,1]);
  assert.equal(result.oldestAt,now-2*3600000);
  assert.ok(a.validIssuerComparison(result,now));
  const zero = a.buildIssuerComparison(tokens,fixture(tokens,[0,0,0]),now);
  assert.equal(zero.total,0);assert.ok(a.validIssuerComparison(zero,now));
});
void test('missing issuer, missing/new mint, identity conflicts and corrupt observations fail closed', () => {
  assert.equal(a.buildIssuerComparison(tokens.slice(0,2),fixture(),now),null);
  const newToken = {...tokens[0], symbol:'NEWSTOCK',mint:'11111111111111111111111111111112'};
  assert.equal(a.buildIssuerComparison([...tokens,newToken],fixture(),now),null);
  const complete = fixture([...tokens,newToken]);
  assert.equal(a.buildIssuerComparison([...tokens,newToken],complete,now).rows[0].tokens,2);
  assert.equal(a.buildIssuerComparison([...tokens,{...tokens[0],issuer:'ondo'}],fixture(),now),null);
  assert.equal(a.buildIssuerComparison(tokens,mutate(fixture(),1,{mint:tokens[0].mint}),now),null);
  const broken=fixture();broken.get(a.birdeyeVolumeKey(tokens[0].mint)).payload='{bad';
  assert.equal(a.buildIssuerComparison(tokens,broken,now),null);
  assert.equal(a.buildIssuerComparison(tokens,mutate(fixture(),0,{usd24h:-1}),now),null);
  const record=fixture();record.get(a.birdeyeVolumeKey(tokens[0].mint)).fetched_at=now;
  assert.equal(a.buildIssuerComparison(tokens,record,now),null);
});
void test('original observation time, age and aligned windows cannot be relabelled by collection', () => {
  for(const change of [{observedAt:now+120000},{observedAt:now-25*3600000},{collectedAt:now+120000},{collectedAt:now-3*3600000},{observedAt:now-9*3600000}])
    assert.equal(a.buildIssuerComparison(tokens,mutate(fixture(),0,change),now),null);
  const valid=a.buildIssuerComparison(tokens,fixture(),now);
  assert.equal(a.validIssuerComparison(valid,now+23*3600000),false,'A browser-held snapshot expires too');
});
void test('public DTO rejects forged totals, unsupported sources/chains/issuers and nonfinite values', () => {
  const value=a.buildIssuerComparison(tokens,fixture(),now);
  for(const change of [{total:1},{total:Infinity},{source:'dexscreener'},{chain:'ethereum'},{window:'1h'},{rows:value.rows.slice(0,2)},{rows:[{...value.rows[0],issuer:'fake'},...value.rows.slice(1)]},{rows:[{...value.rows[0],tokens:0},...value.rows.slice(1)]}])
    assert.equal(a.validIssuerComparison({...value,...change},now),false);
});
function database(){
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER);');
 const db={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return raw.prepare(sql).get(...this.args)??null;},async all(){return {results:raw.prepare(sql).all(...this.args)};},async run(){return raw.prepare(sql).run(...this.args);}};}};return {raw,db};
}
void test('disabled reader makes no DB/provider requests; enabled cache reader includes all canonical mints and dynamic listings', async () => {
  assert.equal(await a.readIssuerComparison({DB:{prepare(){throw Error('Unexpected DB');}},BIRDEYE_VOLUME_ENABLED:'1'},now),null);
  const {raw,db}=database(), original=globalThis.fetch;
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected upstream');};
  try {
    const extra={...tokens[0],symbol:'NEWSTOCK',underlyingSymbol:'NEWSTOCK',mint:'11111111111111111111111111111112',source:'https://api.backpack.exchange/api/v1/assets'};
    raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(a.REGISTRY_KEY,JSON.stringify([extra]),now);
    const cohort=[...a.TOKENS.filter(t=>a.COMPARISON_ISSUERS.includes(t.issuer)),extra];
    for(const [key,row] of fixture(cohort))raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(key,row.payload,row.fetched_at);
    const result=await a.readIssuerComparison({DB:db,BIRDEYE_VOLUME_ENABLED:'1',BIRDEYE_COMPARISON_ENABLED:'1'},now);
    assert.ok(result);assert.equal(result.rows.reduce((n,r)=>n+r.tokens,0),cohort.length);
    raw.prepare('DELETE FROM market_cache WHERE key=?').run(a.birdeyeVolumeKey(extra.mint));
    assert.equal(await a.readIssuerComparison({DB:db,BIRDEYE_VOLUME_ENABLED:'1',BIRDEYE_COMPARISON_ENABLED:'1'},now),null);
    assert.equal(calls,0);
  } finally { globalThis.fetch=original;raw.close(); }
});
const require=createRequire(import.meta.url);
const output=ts.transpileModule(await readFile(new URL('../components/issuer-comparison.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const compiledModule={exports:{}};
compileFunction(output,['require','module','exports'])(id=>id==='@/lib/issuer-comparison'?a:id==='@/lib/client'?{api:()=>{throw Error('Unexpected static-render fetch');}}:id==='@/components/site-link'?{default:({children,...props})=>React.createElement('a',props,children)}:id==='./metric-info'?{MetricInfo:({label})=>React.createElement('button',{'aria-label':label})}:require(id),compiledModule,compiledModule.exports);
void test('actual card render has aligned accessible rows, one methodology tip, precise amounts and zero-safe percentages', () => {
  const Card=compiledModule.exports.IssuerComparisonCard;
  const render=value=>renderToStaticMarkup(React.createElement(Card,{comparison:value,now}));
  const html=render(a.buildIssuerComparison(tokens,fixture(),now));
  assert.match(html,/Issuer comparison/);assert.match(html,/52\.0%/);assert.match(html,/41\.3%/);assert.match(html,/6\.7%/);
  assert.equal((html.match(/class="issuer-comparison-target"/g)??[]).length,3);
  assert.equal((html.match(/About issuer comparison/g)??[]).length,1);
  assert.match(html,/aria-label="Backpack: \$78,000,000\.00/);
  assert.match(html,/\/data-methodology#issuer-comparison/);
  assert.equal(render(null),'');
  const zero=render(a.buildIssuerComparison(tokens,fixture(tokens,[0,0,0]),now));
  assert.ok(!zero.includes('NaN')&&!zero.includes('0.0%'));
  assert.match(zero,/share unavailable because total is zero/);
});
