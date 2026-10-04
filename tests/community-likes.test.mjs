import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {bundle} from './helpers/bundle.mjs';
const {setThreadLike}=await bundle("export * from './lib/community-likes';");
async function fixture(run) {
 const sql=new DatabaseSync(':memory:');
 try {
  const dir=new URL('../drizzle/',import.meta.url);
  for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile(new URL(f,dir),'utf8'));
  sql.exec("INSERT INTO community_members(id,wallet_hash,alias,qualifying_symbol,verified_until,created_at) VALUES('a','a','Alice','MU',9999999999999,1),('b','b','Bob','MU',9999999999999,1); INSERT INTO community_threads(id,member_id,topic,title,body,created_at,updated_at,hidden) VALUES('post','a','general','Test','Test',1,1,0),('hidden','a','general','Hidden','Hidden',1,1,1);");
  const db = {
   prepare(query) {
    return {
     bind(...args) {
      return {
       first: async () => sql.prepare(query).get(...args) ?? null,
       run: async () => ({meta:{changes:sql.prepare(query).run(...args).changes}}),
      };
     },
    };
   },
  };
  await run(db,sql);
 }finally{sql.close();}
}
void test('likes are idempotent, shared counts persist, and unlike affects only the actor',()=>fixture(async db=>{
 assert.deepEqual(await setThreadLike(db,'a','post',true),{like_count:1,liked:true});
 assert.deepEqual(await setThreadLike(db,'a','post',true),{like_count:1,liked:true});
 assert.deepEqual(await setThreadLike(db,'b','post',true),{like_count:2,liked:true});
 assert.deepEqual(await setThreadLike(db,'a','post',false),{like_count:1,liked:false});
 assert.deepEqual(await setThreadLike(db,'a','post',false),{like_count:1,liked:false});
 assert.deepEqual(await setThreadLike(db,'b','post',true),{like_count:1,liked:true});
}));
void test('guest, invalid input, hidden, absent and blocked posts cannot be liked',()=>fixture(async(db,sql)=>{
 await assert.rejects(setThreadLike(db,'','post',true),e=>e.status===401);
 await assert.rejects(setThreadLike(db,'a','post','yes'),e=>e.status===400);
 for(const id of ['hidden','absent'])await assert.rejects(setThreadLike(db,'b',id,true),e=>e.status===404);
 sql.exec("INSERT INTO community_blocks(blocker_id,blocked_id,created_at) VALUES('b','a',1)");
 await assert.rejects(setThreadLike(db,'b','post',true),e=>e.status===404);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM community_likes').get().n,0);
}));
