import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { bundle } from './helpers/bundle.mjs';
const policy = await bundle("export * from './lib/community-eligibility'; export * from './lib/tokens'; export * from './lib/validation';");
function fixture() {
 const sql = new DatabaseSync(':memory:');
 for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/'+file,'utf8'));
 const db = {prepare(query) {return {bind(...args) {return {first:async()=>sql.prepare(query).get(...args)??null};}};}};
 const now=Date.now();
 sql.prepare("INSERT INTO community_members(id,wallet_hash,alias,qualifying_symbol,verified_until,created_at) VALUES('member','hash','Test','MU',?,?)").run(now+3600000,now);
 const cookie='a'.repeat(72);
 sql.prepare("INSERT INTO community_sessions(hash,member_id,expires_at) VALUES(?,'member',?)").run(cookie,now+3600000);
 const dependencies={ './server':{db:()=>db,digest:async v=>v}, './validation':policy, './tokens':policy, './community-eligibility':policy, './backpack-registry':{backpackRegistry:async()=>({}),registryTokens:()=>policy.TOKENS}, './community-post':{}, './community-read':{} };
 const code=ts.transpileModule(readFileSync('lib/community-server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 compileFunction(code,['require','module','exports'])(id=>dependencies[id]??{},mod,mod.exports);
 const req=new Request('https://float.test',{headers:{Cookie:'hp_member='+cookie}});
 const hold=(symbol,raw='1',time=now)=>sql.prepare("INSERT OR REPLACE INTO community_holdings(member_id,symbol,verified_at,slot,raw_amount,decimals,ui_amount) VALUES('member',?,?,1,?,9,1)").run(symbol,time,raw);
 return {sql,db,now,req,hold,member:mod.exports.communityMember};
}
void test('only Backpack tokens qualify; other issuers cannot retain legacy session privileges',async()=>{
 const f=fixture();try {
 const foreign=policy.TOKENS.filter(t=>t.issuer!=='backpack');assert.ok(foreign.length);
 for(const token of foreign) f.hold(token.symbol);
 assert.equal(await f.member(f.req,false),null);
 await assert.rejects(f.member(f.req),e=>e.status===401);
 // Identity alone is available exclusively to the server-owned balance refresh.
 assert.equal((await f.member(f.req,true,false)).id,'member');
 f.hold('MU');assert.equal((await f.member(f.req)).id,'member');
 f.sql.exec('UPDATE community_members SET suspended=1');
 await assert.rejects(f.member(f.req,true,false),e=>e.status===401);
 }finally{f.sql.close();}
});
void test('zero, malformed, absent, expired and future balance observations fail closed',async()=>{
 const f=fixture();try {
 for(const raw of ['0','000','-1','abc','1.1','',null]) {f.hold('MU',raw);assert.equal(await f.member(f.req,false),null,raw);}
 f.hold('MU','1',f.now-policy.COMMUNITY_HOLDING_MAX_AGE_MS-1000);assert.equal(await f.member(f.req,false),null);
 f.hold('MU','1',f.now+60000);assert.equal(await f.member(f.req,false),null);
 f.hold('MU','1');assert.equal((await f.member(f.req)).id,'member');
 f.sql.exec('UPDATE community_sessions SET expires_at=0');await assert.rejects(f.member(f.req),e=>e.status===401);
 }finally{f.sql.close();}
});
void test('a verified new Backpack listing qualifies without including foreign issuers',async()=>{
 const f=fixture();try {
 const tokens=[...policy.TOKENS,{...policy.TOKENS.find(t=>t.issuer==='backpack'),symbol:'NEW'}];
 f.hold('NEW');assert.equal(await policy.hasCommunityHolding(f.db,'member',tokens),true);
 assert.equal(await policy.hasCommunityHolding(f.db,'someone-else',tokens),false);
 assert.ok(policy.communityTokens(tokens).every(t=>t.issuer==='backpack'));
 }finally{f.sql.close();}
});
void test('legacy foreign-only sessions can read public threads but cannot mutate the community',async()=>{
 const f=fixture();try {
 const foreign=policy.TOKENS.find(t=>t.issuer!=='backpack');f.hold(foreign.symbol);
 const deps={
 '@/lib/editorial-server':{recordOperation:async()=>{}},
 '@/lib/community-server':{communityMember:f.member},
 '@/lib/registry-server':{verifiedRegistry:async()=>({tokens:policy.TOKENS})},
 '@/lib/community-eligibility':policy,
 '@/lib/request-body':{readBoundedText:r=>r.text()},
 '@/lib/server':{db:()=>f.db,rateLimit:async()=>{}},
 '@/lib/validation':policy,
 '@/lib/community-read':{readCommunityThreads:async(_db,_url,viewer)=>{assert.equal(viewer,null);return {threads:[{id:'public'}]};}},
 };
 const code=ts.transpileModule(readFileSync('app/api/community/[[...path]]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};compileFunction(code,['require','module','exports'])(id=>deps[id]??{},mod,mod.exports);
 const headers={Cookie:f.req.headers.get('Cookie'),Origin:'https://float.test','Content-Type':'application/json'};
 const feed=await mod.exports.GET(new Request('https://float.test/api/community/threads',{headers}));assert.equal(feed.status,200);assert.equal((await feed.json()).threads.length,1);
 for(const path of ['threads','attachments','threads/public/replies','threads/public/like','threads/public/vote','bookmark','follow','profile','report','block']) {
 const response=await mod.exports.POST(new Request('https://float.test/api/community/'+path,{method:'POST',headers,body:'{}'}));assert.equal(response.status,401,path);
 }
 }finally{f.sql.close();}
});
