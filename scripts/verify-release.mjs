import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

// One fail-closed release gate. Never replace this with a scoped lint/test run.
const suites = readdirSync('tests')
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => 'tests/' + name);
if (!suites.length) throw Error('No regression suites found');
for (const [label, args] of [
  ['Types', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['Lint', ['node_modules/oxlint/bin/oxlint']],
  ['Tests', ['--test', ...suites]],
  ['Production build', ['node_modules/vinext/dist/cli.js', 'build']],
]) {
  console.log('\n' + label);
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(
  'Release checks passed. Runtime and rendered-flow verification are still required.',
);
