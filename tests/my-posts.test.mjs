import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

void test('My posts query isolates ownership, excludes deleted posts and preserves pagination', async () => {
  const source = await readFile(new URL('../lib/community-read.ts', import.meta.url), 'utf8');
  const query = source.match(/`(SELECT t.id,t.member_id,t.topic,[^`]+)`/)[1].replace('${authorColumns}', 'm.alias');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE community_members(id TEXT,alias TEXT);
      CREATE TABLE community_threads(id TEXT,member_id TEXT,topic TEXT,title TEXT,body TEXT,created_at INTEGER,updated_at INTEGER,hidden INTEGER);
      CREATE TABLE community_rooms(id TEXT,name TEXT);
      CREATE TABLE community_bookmarks(member_id TEXT,target_type TEXT,target_id TEXT);
      CREATE TABLE community_replies(thread_id TEXT,hidden INTEGER,member_id TEXT);
      CREATE TABLE community_blocks(blocker_id TEXT,blocked_id TEXT);
      CREATE TABLE community_holdings(member_id TEXT,symbol TEXT);
      CREATE TABLE community_follows(member_id TEXT,symbol TEXT);
      INSERT INTO community_members VALUES ('alice','Alice'),('bob','Bob');
      INSERT INTO community_threads VALUES ('a','alice','general','A','Body',10,10,0),('b','bob','general','B','Body',20,20,0),('hidden','alice','general','Hidden','Body',30,30,1);`);
    const read = (member, feed, stamp=100) => db.prepare(query).all(member,member,member,'all','all','','',feed,member,member,feed,member,feed,member,stamp,stamp,'~').map(t=>t.id);
    assert.deepEqual(read('alice','mine'), ['a']);
    assert.deepEqual(read('bob','mine'), ['b']);
    assert.deepEqual(read('alice','all'), ['b','a']);
    assert.deepEqual(read('alice','mine',5), []);
  } finally { db.close(); }
});
