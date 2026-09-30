import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
void test('isolated full-schema backup restores discussions and frozen attachments',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'float-recovery-'));
 const db=new DatabaseSync(join(directory,'source.sqlite'));
 let restored;
 try {
  for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()) db.exec(await readFile('drizzle/'+name,'utf8'));
  db.prepare('INSERT INTO community_members(id,wallet_hash,alias,qualifying_symbol,verified_until,created_at) VALUES(?,?,?,?,?,?)').run('recovery-member','fixture-only','Recovery QA','MU',Date.now()+60000,Date.now());
  const payload=JSON.stringify({kind:'portfolio',version:1,checkedAt:1,pricesAt:1,rows:[{symbol:'MU',name:'Micron',percent:100}]});
  db.prepare('INSERT INTO community_threads(id,member_id,topic,title,body,created_at,updated_at,attachment_json) VALUES(?,?,?,?,?,?,?,?)').run('recovery-thread','recovery-member','general','Fixture','Recovery test only',1,1,payload);
  const backup=join(directory,'backup.sqlite');db.prepare('VACUUM INTO ?').run(backup);
  db.prepare('DELETE FROM community_threads WHERE id=?').run('recovery-thread');
  restored=new DatabaseSync(backup);
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(restored.prepare('SELECT attachment_json FROM community_threads WHERE id=?').get('recovery-thread').attachment_json,payload);
  assert.equal(restored.prepare('SELECT alias FROM community_members WHERE id=?').get('recovery-member').alias,'Recovery QA');
 } finally {restored?.close();db.close();await rm(directory,{recursive:true,force:true});}
});
