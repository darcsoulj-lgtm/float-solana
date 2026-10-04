import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { bundle } from './helpers/bundle.mjs';
const {readCommunityThreads}=await bundle("export {readCommunityThreads} from './lib/community-read';");
void test('My posts query isolates ownership, excludes deleted posts and preserves pagination', async () => {
  const sql = new DatabaseSync(':memory:');
  try {
    for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
    sql.exec(`INSERT INTO community_members(id,wallet_hash,alias,qualifying_symbol,verified_until,created_at) VALUES ('alice','a','Alice','MU',9999999999999,1),('bob','b','Bob','MU',9999999999999,1);
      INSERT INTO community_threads(id,member_id,topic,title,body,created_at,updated_at,hidden) VALUES ('a','alice','general','A','Body',10,10,0),('b','bob','general','B','Body',20,20,0),('hidden','alice','general','Hidden','Body',30,30,1);`);
    const db={prepare(query){return {bind(...args){return {all:async()=>({results:sql.prepare(query).all(...args)}),first:async()=>sql.prepare(query).get(...args)??null};}};}};
    const read=async(member,feed,stamp=100)=>(await readCommunityThreads(db,new URL(`https://float.test/threads?feed=${feed}&cursor=${stamp}:~`),member,[])).threads.map(t=>t.id);
    assert.deepEqual(await read('alice','mine'),['a']);assert.deepEqual(await read('bob','mine'),['b']);
    assert.deepEqual(await read('alice','all'),['b','a']);assert.deepEqual(await read('alice','mine',5),[]);
  } finally {sql.close();}
});
