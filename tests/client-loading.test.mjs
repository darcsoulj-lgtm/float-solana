import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const raw = await readFile(
  new URL('../lib/client-loading.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(raw, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const module = { exports: {} };
new Function('module', 'exports', output)(module, module.exports);
const { readThenRefresh } = module.exports;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test('saved headlines render before slow refresh finishes, then update in order', async () => {
  const refresh = deferred(),
    seen = [];
  let reads = 0;
  const run = readThenRefresh({
    read: async () => (++reads === 1 ? 'saved' : 'new'),
    refresh: () => refresh.promise,
    publish: (value) => seen.push(value),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ['saved']);
  refresh.resolve();
  await run;
  assert.deepEqual(seen, ['saved', 'new']);
});
test('refresh failures retain usable content; first-read failures can recover', async () => {
  const seen = [];
  let failures = 0;
  await readThenRefresh({
    read: async () => 'saved',
    refresh: async () => {
      throw Error('429');
    },
    publish: (value) => seen.push(value),
    refreshError: () => failures++,
  });
  assert.deepEqual(seen, ['saved']);
  assert.equal(failures, 1);
  let reads = 0;
  await readThenRefresh({
    read: async () => {
      if (++reads === 1) throw Error('Transient read');
      return 'recovered';
    },
    refresh: async () => {},
    publish: (value) => seen.push(value),
  });
  assert.deepEqual(seen, ['saved', 'recovered']);
});
test('a fast refresh cannot be overwritten by a late saved response', async () => {
  const saved = deferred(),
    seen = [];
  let reads = 0;
  const run = readThenRefresh({
    read: async () => (++reads === 1 ? saved.promise : 'new'),
    refresh: async () => {},
    publish: (value) => seen.push(value),
  });
  saved.resolve('saved');
  await run;
  assert.deepEqual(seen, ['saved', 'new']);
});
