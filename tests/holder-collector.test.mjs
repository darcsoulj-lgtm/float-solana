import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
void test('collector deduplicates addresses and rejects incomplete or changing observations',()=>{
 const run=spawnSync('python3',['scripts/holders/test_collect.py'],{encoding:'utf8'});
 assert.equal(run.status,0,run.stdout+run.stderr);
});
