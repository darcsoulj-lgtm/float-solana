import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
void test('D1 recovery preparation preserves foreign keys and large quoted cache payloads without overwriting output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'float-d1-recovery-'));
  const db = new DatabaseSync(':memory:');
  try {
    const source = join(dir, 'source.sql'), output = join(dir, 'prepared.sql');
    const payload = JSON.stringify({ text: "holder's 한글 ".repeat(18000) });
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    await writeFile(source, `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE children(id TEXT PRIMARY KEY, parent TEXT REFERENCES parents(id));
CREATE TABLE parents(id TEXT PRIMARY KEY);
INSERT INTO children VALUES('child','parent');
INSERT INTO parents VALUES('parent');
CREATE TABLE market_cache(key TEXT PRIMARY KEY, payload TEXT, fetched_at INTEGER, retry_after INTEGER);
INSERT INTO market_cache VALUES('large',${quote(payload)},1,2);
INSERT INTO market_cache VALUES('missing',NULL,1,2);
CREATE INDEX child_parent ON children(parent);`);
    const args = ['scripts/prepare-d1-recovery.py', source, output];
    const run = spawnSync('python3', args, { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const prepared = await readFile(output, 'utf8');
    assert.ok(prepared.indexOf('INSERT INTO "parents"') < prepared.indexOf('INSERT INTO "children"'));
    db.exec(prepared);
    assert.equal(db.prepare('SELECT payload FROM market_cache WHERE key=?').get('large').payload, payload);
    assert.equal(db.prepare('SELECT payload FROM market_cache WHERE key=?').get('missing').payload, null);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.notEqual(spawnSync('python3', args).status, 0);
    assert.equal(await readFile(output, 'utf8'), prepared);
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});
