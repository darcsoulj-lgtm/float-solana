import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { communitySignInInput, communitySignInMessage } from '../lib/community-sign-in.ts';

function fixture({ holdings = () => [{symbol:'MU',verifiedAt:Date.now(),slot:1,rawAmount:'1',decimals:0,uiAmount:1}] } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
  const database = {
    prepare(sql) { return { bind(...args) { return {
      run: async () => { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: result.changes } }; },
      first: async () => sqlite.prepare(sql).get(...args),
    }; } }; },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const deps = {
    '@/lib/editorial-server': { recordOperation: async () => {} },
    '@/lib/server': { db: () => database, digest: async v => 'hash:' + v, rateLimit: async () => {}, runtime: () => ({}) },
    '@/lib/request-body': { readBoundedText: r => r.text() },
    '@/lib/validation': { AppError, textValue(v,min,max) { if (typeof v !== 'string' || v.length < min || v.length > max) throw new AppError('Invalid'); return v; } },
    '@/lib/registry-server': { verifiedRegistry: async () => ({tokens: []}) },
    '@/lib/solana': { validWallet: v => v, detectHoldings: async () => holdings(), verifySignature: async (_wallet,message,signature) => { if (signature !== message) throw new AppError('Invalid signature',401); } },
    '@/lib/community-read': {},
    '@/lib/community-server': { communityCleanup: async () => {}, MEMBERSHIP_MS:86400000, sessionCookie: s => 'hp_member=' + s },
    '@/lib/community-sign-in': { communitySignInInput, communitySignInMessage },
    '@/lib/wallet-handoff': { WALLET_HANDOFF_MS:600000 },
  };
  const code = ts.transpileModule(readFileSync('app/api/community/[[...path]]/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{}};
  compileFunction(code,['require','module','exports'])(id => deps[id] || {},mod,mod.exports);
  const post = (path,body) => mod.exports.POST(new Request('https://float.test/api/community/'+path,{method:'POST',headers:{Origin:'https://float.test','Content-Type':'application/json'},body:JSON.stringify(body)}));
  return {post,sqlite};
}

for (const wallet of ['backpack','solflare','phantom']) void test(`${wallet}: challenge-bound handoff survives missing final client context`, async () => {
  const f = fixture();
  try {
    const secret = 'a'.repeat(64);
    const {id} = await (await f.post('handoff/start',{secret})).json();
    const response = await f.post('challenge',{wallet:'6zGGkXABVt52pEvsLSvMokwJW9xwkoFX4Nw5UoFHFKmH',handoffId:id,...(wallet==='phantom'?{authMethod:'signIn'}:{})});
    assert.equal(response.status,200);
    const challenge = await response.json();
    assert.equal(f.sqlite.prepare('SELECT handoff_id FROM community_challenges WHERE id=?').get(challenge.id).handoff_id,id);
    const verified = await f.post('verify',{challengeId:challenge.id,signature:challenge.message});
    assert.equal(verified.status,200,JSON.stringify(await verified.clone().json()));
    assert.equal((await verified.json()).handoffReady,true);
    assert.deepEqual(await (await f.post('handoff/claim',{id,secret:'b'.repeat(64)})).json(),{ready:false});
    const claim = await f.post('handoff/claim',{id,secret});
    assert.deepEqual(await claim.json(),{ready:true});
    assert.ok(claim.headers.get('Set-Cookie'));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_sessions').get().n,2);
    assert.deepEqual(await (await f.post('handoff/claim',{id,secret})).json(),{ready:false});
  } finally { f.sqlite.close(); }
});
void test('a challenge cannot be redirected to another app handoff or completed with an invalid signature', async () => {
  const f=fixture();
  try {
    const start=async s=>(await (await f.post('handoff/start',{secret:s.repeat(64)})).json()).id;
    const a=await start('a'), b=await start('b');
    const c=await (await f.post('challenge',{wallet:'6zGGkXABVt52pEvsLSvMokwJW9xwkoFX4Nw5UoFHFKmH',handoffId:a})).json();
    assert.equal((await f.post('verify',{challengeId:c.id,signature:c.message,handoffId:b})).status,400);
    assert.equal((await f.post('verify',{challengeId:c.id,signature:'wrong'})).status,401);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM wallet_handoffs WHERE member_id IS NOT NULL').get().n,0);
    f.sqlite.prepare('UPDATE wallet_handoffs SET expires_at=0 WHERE id=?').run(a);
    assert.equal((await f.post('verify',{challengeId:c.id,signature:c.message})).status,400);
  } finally {f.sqlite.close();}
});

void test('a fractional holder without a value tier can verify and complete a browser handoff', async () => {
  const f = fixture({holdings: () => [{symbol:'MU',verifiedAt:Date.now(),slot:1,rawAmount:'1',decimals:9,uiAmount:0.000000001}]});
  try {
    const secret='a'.repeat(64);
    const {id}=await (await f.post('handoff/start',{secret})).json();
    const c=await (await f.post('challenge',{wallet:'6zGGkXABVt52pEvsLSvMokwJW9xwkoFX4Nw5UoFHFKmH',handoffId:id})).json();
    assert.equal((await f.post('verify',{challengeId:c.id,signature:c.message})).status,200);
    const member=f.sqlite.prepare('SELECT value_tier,verified_until FROM community_members').get();
    assert.equal(member.value_tier,null);
    assert.ok(member.verified_until>Date.now());
    const claim=await f.post('handoff/claim',{id,secret});
    assert.deepEqual(await claim.json(),{ready:true});
    assert.ok(claim.headers.get('Set-Cookie'));
  } finally {f.sqlite.close();}
});
void test('zero holdings cannot start verification or create a member/session',async()=>{
  const f=fixture({holdings:()=>[]});
  try {
    assert.equal((await f.post('challenge',{wallet:'6zGGkXABVt52pEvsLSvMokwJW9xwkoFX4Nw5UoFHFKmH'})).status,403);
    for(const table of ['community_members','community_challenges','community_sessions']) assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0);
  } finally {f.sqlite.close();}
});
void test('holdings lost after challenge cannot complete verification or bind a handoff',async()=>{
  let held=true;
  const f=fixture({holdings:()=>held?[{symbol:'MU',verifiedAt:Date.now(),slot:1,rawAmount:'1',decimals:9,uiAmount:0.000000001}]:[]});
  try {
    const secret='a'.repeat(64);const {id}=await(await f.post('handoff/start',{secret})).json();
    const c=await(await f.post('challenge',{wallet:'6zGGkXABVt52pEvsLSvMokwJW9xwkoFX4Nw5UoFHFKmH',handoffId:id})).json();held=false;
    assert.equal((await f.post('verify',{challengeId:c.id,signature:c.message})).status,403);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_members').get().n,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_sessions').get().n,0);
    assert.deepEqual(await(await f.post('handoff/claim',{id,secret})).json(),{ready:false});
  } finally {f.sqlite.close();}
});
