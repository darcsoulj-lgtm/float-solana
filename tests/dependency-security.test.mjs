import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { evaluateAudit, verifyBracesPatch } from '../scripts/check-dependency-security.mjs';

const require = createRequire(import.meta.url);
const report = (advisory = 'GHSA-vfj7-8cjw-p6xm', version = '3.0.3') => ({
  advisories: { 1: { github_advisory_id: advisory, module_name: 'braces', severity: 'high', findings: [{ version }] } },
  metadata: { vulnerabilities: { moderate: 0, high: 1, critical: 0 } },
});
const graph = readFileSync('pnpm-lock.yaml', 'utf8');
// Resolve through an actual dependency so an unused patched copy cannot mask an unpatched active copy.
const shadcn = require.resolve('shadcn');
const fg = createRequire(shadcn).resolve('fast-glob');
const mm = createRequire(fg).resolve('micromatch');
const bracesPath = createRequire(mm).resolve('braces/package.json').replace(/[/\\]package\.json$/, '');

await test('reviewed package rejects deep patterns and direct ASTs while preserving normal globs', () => {
  verifyBracesPatch(bracesPath, 'patches/braces@3.0.3.patch');
  assert.match(graph, /braces@3\.0\.3: [a-f0-9]{64}/);
});

await test('changed or missing patch is rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'float-security-'));
  try {
    const patch = join(dir, 'changed.patch');
    writeFileSync(patch, readFileSync('patches/braces@3.0.3.patch', 'utf8') + '\n');
    assert.throws(() => verifyBracesPatch(bracesPath, patch), /patch changed/);
    assert.throws(() => verifyBracesPatch(bracesPath, join(dir, 'missing.patch')), /ENOENT/);
  } finally { rmSync(dir, { recursive: true }); }
});

await test('only the exact advisory and exact reviewed package version can be mitigated', () => {
  assert.deepEqual(evaluateAudit(report(), [bracesPath]), ['GHSA-vfj7-8cjw-p6xm']);
  assert.throws(() => evaluateAudit(report(), []), /Unmitigated/);
  assert.throws(() => evaluateAudit(report('GHSA-new-issue'), [bracesPath]), /Unmitigated/);
  assert.throws(() => evaluateAudit(report(undefined, '3.0.2'), [bracesPath]), /Unmitigated/);
});

await test('audit service errors and omitted vulnerability details fail closed', () => {
  assert.throws(() => evaluateAudit({ error: 'service offline' }, []), /Incomplete/);
  const incomplete = report(); incomplete.metadata.vulnerabilities.critical = 1;
  assert.throws(() => evaluateAudit(incomplete, [bracesPath]), /Incomplete advisory coverage/);
});

await test('security gate rejects an unpatched dependency even when the patch file exists', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { verifyBracesPatch } from './scripts/check-dependency-security.mjs';
    import { readFileSync, mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    const dir = mkdtempSync(join(tmpdir(), 'float-unpatched-'));
    try {
      cpSync(${JSON.stringify(bracesPath)}, dir, { recursive: true });
      writeFileSync(join(dir, 'lib/constants.js'), readFileSync(join(dir, 'lib/constants.js'), 'utf8').replace('MAX_DEPTH: 100,', 'MAX_DEPTH: 10000,'));
      verifyBracesPatch(dir, 'patches/braces@3.0.3.patch');
    } finally { rmSync(dir, { recursive: true }); }
  `], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unreviewed braces code/);
});
