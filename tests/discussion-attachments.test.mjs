import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {bundle} from './helpers/bundle.mjs';
const {portfolioAttachment,parseDiscussionAttachment,attachmentForPost,prepareDiscussionAttachment,readCommunityThreads,TOKENS}=await bundle(`export * from './lib/discussion-attachments'; export * from './lib/discussion-attachment-server'; export {readCommunityThreads} from './lib/community-read'; export {TOKENS} from './lib/tokens';`);
const now=Date.now(), tokens=TOKENS.filter(t=>t.issuer==='backpack').slice(0,3);
const source=data=>({data,fetchedAt:now,stale:false,error:null});
function fixtureData(){return {prices:source({}),supplies:source(Object.fromEntries(tokens.map(t=>[t.symbol,{valuationSafe:true,multiplier:1,decimals:6,supply:100,amount:'100000000',slot:10,timestamp:now}]))),markets:source({}),backpack:source(Object.fromEntries(tokens.map(t=>[t.symbol,{market:`${t.symbol}.US_USDC`,externalPrice:100,externalChange24h:0}]))),history:source({}),pools:source({}),catalog:source([])};}
const holdings=tokens.map(t=>({symbol:t.symbol,raw_amount:'1000000',decimals:6,verified_at:now,slot:10,ui_amount:'1'}));
void test('allocation derives complete server holdings, sums to 100 and strips private fields',()=>{
 const a=portfolioAttachment(holdings,fixtureData(),now);assert.equal(a.rows.reduce((s,r)=>s+Math.round(r.percent*10),0),1000);assert.deepEqual(a.rows.map(r=>r.percent),[33.4,33.3,33.3]);assert.doesNotMatch(JSON.stringify(a),/raw_amount|ui_amount|slot|wallet|quantity|total/);assert.equal(a.checkedAt,now);
 assert.deepEqual(parseDiscussionAttachment(JSON.stringify({...a,wallet:'secret',rows:a.rows.map(r=>({...r,raw_amount:'secret'}))})),a);
});
void test('portfolio refuses missing, stale, ambiguous, partial and manipulated values',()=>{
 for(const mutate of [d=>delete d.backpack.data[tokens[0].symbol],d=>d.supplies.data[tokens[0].symbol].multiplier=1.01,d=>d.supplies.fetchedAt=now-301000,d=>d.backpack.fetchedAt=now-301000,d=>d.backpack.fetchedAt=now+61000,d=>d.supplies.fetchedAt=now+61000,d=>d.backpack.data[tokens[0].symbol].market='OTHER.US_USDC',d=>d.supplies.data[tokens[0].symbol].decimals=9]) {const d=fixtureData();mutate(d);assert.throws(()=>portfolioAttachment(holdings,d,now));}
 assert.throws(()=>portfolioAttachment([...holdings,holdings[0]],fixtureData(),now));
 assert.throws(()=>portfolioAttachment(holdings.map(h=>({...h,verified_at:now-181000})),fixtureData(),now));
 assert.throws(()=>portfolioAttachment(holdings.map(h=>({...h,raw_amount:'NaN'})),fixtureData(),now));
 assert.equal(parseDiscussionAttachment('{bad'),null);
});
async function databaseFixture(fn){const sql=new DatabaseSync(':memory:');try{
 const dir=new URL('../drizzle/',import.meta.url);for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())sql.exec(await readFile(new URL(name,dir),'utf8'));
 sql.exec(`INSERT INTO community_members(id,wallet_hash,alias,qualifying_symbol,verified_until,created_at) VALUES('alice','private-a','Alice','MU',9999999999999,1),('bob','private-b','Bob','MU',9999999999999,1)`);
 const db={prepare(query){return {args:[],bind(...args){this.args=args;return this;},async first(){return sql.prepare(query).get(...this.args)??null;},async all(){return {results:sql.prepare(query).all(...this.args)};},async run(){return {meta:{changes:sql.prepare(query).run(...this.args).changes}};}};},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};await fn(db,sql);
 }finally{sql.close();}}
void test('saved attachment is owner-bound, expires, requires consent and survives public reread without private data',()=>databaseFixture(async(db,sql)=>{
 const a=portfolioAttachment(holdings,fixtureData(),now),id=crypto.randomUUID();
 sql.prepare('INSERT INTO community_attachment_drafts VALUES(?,?,?,?)').run(id,'alice',JSON.stringify(a),now+60000);
 await assert.rejects(attachmentForPost(db,'bob',id,true,now));await assert.rejects(attachmentForPost(db,'alice',id,false,now));await assert.rejects(attachmentForPost(db,'alice',id,true,now+61000));
 const payload=await attachmentForPost(db,'alice',id,true,now);
 sql.prepare('INSERT INTO community_threads(id,member_id,topic,title,body,created_at,updated_at,attachment_json) VALUES(?,?,?,?,?,?,?,?)').run('post','alice','general','My allocation','What do you think?',now,now,payload);
 sql.exec('DELETE FROM community_attachment_drafts');
 for(let i=0;i<2;i++){const feed=await readCommunityThreads(db,new URL('https://float.example/api/community/threads'),null,TOKENS);assert.deepEqual(feed.threads[0].attachment,a);assert.equal(feed.threads[0].attachment_json,undefined);assert.doesNotMatch(JSON.stringify(feed),/private-a|raw_amount|ui_amount/);}
 sql.exec("UPDATE community_threads SET hidden=1 WHERE id='post'");assert.equal((await readCommunityThreads(db,new URL('https://float.example/api/community/threads'),null,TOKENS)).threads.length,0);
}));
void test('chart prepare fetches registered symbol, caches public prices, freezes snapshot and excludes client payload',()=>databaseFixture(async(db)=>{
 const previous=globalThis.fetch;let requests=0;
 const end=Math.floor(Date.now()/3600000)*3600000;
 const stamp=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
 globalThis.fetch=async url=>{requests++;assert.match(typeof url==='string'?url:url instanceof URL?url.href:url.url,/source=External/);return Response.json([2,1].map(n=>({start:stamp(end-(n+1)*3600000),end:stamp(end-n*3600000),open:'99',close:'100',high:'101',low:'98',volume:'4',trades:'2'})));};
 try {const registry={tokens,registry:undefined};const a=await prepareDiscussionAttachment(db,'alice','ignored',{kind:'chart',symbol:tokens[0].symbol,period:7,chart:{price:999999}},registry);assert.equal(a.attachment.chart.points[0][1],100);assert.equal(a.attachment.chart.source,'Backpack External');const b=await prepareDiscussionAttachment(db,'bob','ignored',{kind:'chart',symbol:tokens[0].symbol,period:7},registry);const newer=await prepareDiscussionAttachment(db,'alice','ignored',{kind:'chart',symbol:tokens[0].symbol,period:1},registry);await attachmentForPost(db,'alice',a.id,false);await attachmentForPost(db,'alice',newer.id,false);assert.equal(requests,1);assert.deepEqual(b.attachment,a.attachment);await assert.rejects(attachmentForPost(db,'bob',a.id,false));assert.equal(JSON.parse(await attachmentForPost(db,'alice',a.id,false)).chart.points[0][1],100);await assert.rejects(prepareDiscussionAttachment(db,'alice','x',{kind:'chart',symbol:'BAD',period:7},registry));await assert.rejects(prepareDiscussionAttachment(db,'alice','x',{kind:'portfolio',wallet:'invented'},registry));}finally{globalThis.fetch=previous;}
}));
void test('portfolio preparation uses session wallet only, scans current holdings, and returns no balances',async()=>{
 const {compileFunction}=await import('node:vm'),{default:ts}=await import('typescript');
 const source=await readFile(new URL('../lib/discussion-attachment-server.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 await databaseFixture(async(db,sql)=>{
  sql.prepare('INSERT INTO community_sessions(hash,member_id,expires_at,wallet) VALUES(?,?,?,?)').run('signed-session','alice',Date.now()+60000,'session-wallet');
  let scanned;
  const deps={
   './backpack-charts':{},'./market-cache':{},
   './market-overview-server':{readMarketOverview:async()=>fixtureData()},
   './solana':{detectHoldings:async(wallet,_rpc,_fetch,amounts,allowed)=>{scanned=wallet;assert.equal(amounts,true);assert.ok(allowed.every(t=>t.issuer==='backpack'));return holdings.map(h=>({symbol:h.symbol,verifiedAt:h.verified_at,slot:h.slot,rawAmount:h.raw_amount,decimals:h.decimals,uiAmount:h.ui_amount}));}},
   './discussion-attachments':{portfolioAttachment,parseDiscussionAttachment},
   './validation':{AppError:class extends Error{constructor(message,status=400){super(message);this.status=status;}}},
  };
  const compiled={exports:{}};compileFunction(code,['require','module','exports'])(id=>{assert.ok(id in deps,id);return deps[id];},compiled,compiled.exports);
  const result=await compiled.exports.prepareDiscussionAttachment(db,'alice','signed-session',{kind:'portfolio',wallet:'attacker-wallet',memberId:'bob',total:999999},{tokens:TOKENS,registry:undefined});
  assert.equal(scanned,'session-wallet');assert.equal(result.attachment.rows.length,3);assert.doesNotMatch(JSON.stringify(result),/session-wallet|attacker-wallet|rawAmount|uiAmount|999999/);
  await assert.rejects(compiled.exports.prepareDiscussionAttachment(db,'bob','signed-session',{kind:'portfolio'},{tokens:TOKENS,registry:undefined}));
 });
});

void test('adjusted mint balances pair with issuer share prices without rejecting MU-style multipliers',()=>{
 const d=fixtureData(),scale=1.0001069293175175;
 d.supplies.data[tokens[0].symbol].multiplier=scale;
 const changed=holdings.map((h,i)=>i===0?{...h,raw_amount:'1000000000',ui_amount:String(Math.floor(1000000000*scale)/1e6)}:h);
 const a=portfolioAttachment(changed,d,now);
 assert.equal(a.rows[0].symbol,tokens[0].symbol);assert.equal(a.rows[0].percent,99.8);
 assert.throws(()=>portfolioAttachment(changed.map((h,i)=>i===0?{...h,ui_amount:'1000'}:h),d,now));
 assert.throws(()=>portfolioAttachment(changed.map((h,i)=>i===0?{...h,ui_amount:null}:h),d,now));
 assert.doesNotMatch(JSON.stringify(a),/ui_amount|raw_amount|multiplier|wallet|total/);
});
