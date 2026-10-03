import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const manifest = JSON.parse(readFileSync(new URL('../patches/braces-security.json', import.meta.url), 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// Only this reviewed code patch mitigates this exact advisory. No severity downgrade.
export function verifyBracesPatch(packagePath, patchPath) {
  assert.equal(sha256(readFileSync(patchPath)), manifest.patchSha256, 'Security patch changed or missing');
  const pkg = JSON.parse(readFileSync(resolve(packagePath, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'braces');
  assert.equal(pkg.version, manifest.version);
  for (const [file, hash] of Object.entries(manifest.files)) {
    assert.equal(sha256(readFileSync(resolve(packagePath, file))), hash, 'Unreviewed braces code: ' + file);
  }
  const braces = createRequire(import.meta.url)(resolve(packagePath, 'index.js'));
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const attack = open.repeat(4000) + 'a' + close.repeat(4000);
    for (const method of ['parse', 'compile', 'expand', 'stringify']) {
      for (const maxDepth of [undefined, Infinity, 100000]) {
        assert.throws(() => braces[method](attack, { maxDepth }), /exceeds max depth/);
      }
    }
  }
  for (const method of ['compile', 'expand', 'stringify']) {
    let ast = { type: 'text', value: 'a' };
    for (let i = 0; i < 4000; i++) ast = { type: 'brace', nodes: [ast] };
    assert.throws(() => braces[method]({ type: 'root', nodes: [ast] }), /exceeds max depth/);
  }
  assert.deepEqual(braces.expand('src/{a,b}/{1..2}.js'), ['src/a/1.js', 'src/a/2.js', 'src/b/1.js', 'src/b/2.js']);
  assert.equal(braces.compile('src/{a,b}.js'), 'src/(a|b).js');
  assert.equal(braces.stringify(braces.parse('src/{a,b}.js')), 'src/{a,b}.js');
  assert.throws(() => braces.parse('{{a,b},c}', { maxDepth: 1 }), /exceeds max depth/);
  assert.throws(() => braces.expand('{1..10001}'), /range limit/);
}

export function evaluateAudit(report, patchedPaths) {
  assert.ok(report && !report.error && report.advisories && report.metadata?.vulnerabilities, 'Incomplete dependency audit');
  const seen = { moderate: 0, high: 0, critical: 0 };
  const mitigated = [];
  for (const advisory of Object.values(report.advisories)) {
    assert.ok(['info', 'low', ...Object.keys(seen)].includes(advisory.severity), 'Unknown advisory severity');
    if (!(advisory.severity in seen)) continue;
    seen[advisory.severity]++;
    const covered = advisory.github_advisory_id === manifest.advisory
      && advisory.module_name === 'braces'
      && advisory.findings?.length > 0
      && advisory.findings.every((finding) => finding.version === manifest.version)
      && patchedPaths.length > 0;
    assert.ok(covered, 'Unmitigated dependency advisory: ' + (advisory.github_advisory_id || advisory.id));
    mitigated.push(advisory.github_advisory_id);
  }
  for (const [severity, count] of Object.entries(seen)) {
    assert.equal(report.metadata.vulnerabilities[severity], count, 'Incomplete advisory coverage: ' + severity);
  }
  return mitigated;
}

function pnpmJson(args) {
  const result = spawnSync('pnpm', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.ok(result.status === 0 || (args[0] === 'audit' && result.status === 1), 'Dependency check failed: ' + result.stderr);
  return JSON.parse(result.stdout);
}

export function checkDependencySecurity() {
  const report = pnpmJson(['audit', '--json']);
  const graph = pnpmJson(['list', 'braces', '--depth', 'Infinity', '--json']);
  assert.ok(Array.isArray(graph) && graph.length > 0, 'Dependency graph unavailable');
  const paths = new Set();
  const visit = (node) => {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, child] of Object.entries(node[section] || {})) {
        if (name === 'braces') paths.add(realpathSync(child.path));
        visit(child);
      }
    }
  };
  graph.forEach(visit);
  const patchPath = fileURLToPath(new URL('../patches/braces@3.0.3.patch', import.meta.url));
  for (const packagePath of paths) verifyBracesPatch(packagePath, patchPath);
  const mitigated = evaluateAudit(report, [...paths]);
  console.log('Dependency audit passed: no unmitigated moderate, high or critical advisories.');
  if (mitigated.length) console.log('Locally patched advisory (registry still reports it): ' + mitigated.join(', '));
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) checkDependencySecurity();
