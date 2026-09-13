import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import ts from 'typescript';
import {
  snapshotClientAssets,
  restoreClientAssets,
} from '../scripts/retain-client-assets.mjs';
const raw = await readFile(
  new URL('../lib/client-module.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(raw, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { loadClientModule, clientFault } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);

test('Transient module downloads retry twice without reloading the document', async () => {
  let calls = 0;
  const delays = [];
  const value = await loadClientModule(
    async () => {
      if (++calls < 3)
        throw new TypeError('Failed to fetch dynamically imported module');
      return { default: 'loaded' };
    },
    async (ms) => {
      delays.push(ms);
    },
  );
  assert.equal(value.default, 'loaded');
  assert.deepEqual(delays, [400, 1200]);
});
test('Persistent module failures terminate and programming errors are never retried', async () => {
  for (const [message, expected] of [
    ['Importing a module script failed', 3],
    ['Cannot read properties of undefined', 1],
  ]) {
    let calls = 0;
    await assert.rejects(
      loadClientModule(
        async () => {
          calls++;
          throw new Error(message);
        },
        async () => {},
      ),
      { message },
    );
    assert.equal(calls, expected);
  }
});
test('Client diagnostics exclude messages, page URLs, queries and personal content', () => {
  const e = new Error(
    'Failed to fetch dynamically imported module: https://example.com/_next/static/chunks/market-ABC.js?wallet=private',
  );
  e.stack =
    'at https://example.com/_next/static/chunks/home-ABC.js:10:20\n at https://example.com/?secret=private';
  const payload = clientFault(e, 'Markets');
  assert.deepEqual(payload.assets, [
    '/_next/static/chunks/market-ABC.js',
    '/_next/static/chunks/home-ABC.js:10:20',
  ]);
  assert.equal(payload.kind, 'module');
  assert.doesNotMatch(
    JSON.stringify(payload),
    /private|example.com|wallet|secret/,
  );
  assert.equal(
    clientFault(new Error('Minified React error #418; user content'), 'Home')
      .code,
    '418',
  );
});
test('Releases preserve complete previous JS/CSS graphs, never old HTML or manifests, and prune history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'float-assets-'));
  const out = join(root, 'dist'),
    cache = join(root, 'cache');
  try {
    for (let version = 1; version <= 6; version++) {
      await snapshotClientAssets(out, cache);
      await rm(out, { recursive: true, force: true });
      await mkdir(join(out, '.vite'), { recursive: true });
      const file = `_next/static/chunks/page-${version}.js`;
      const css = `_next/static/chunks/page-${version}.css`;
      for (const name of [file, css]) {
        await mkdir(dirname(join(out, name)), { recursive: true });
        await writeFile(join(out, name), 'current-' + version);
      }
      await writeFile(join(out, 'index.html'), 'HTML-' + version);
      const manifest = JSON.stringify({
        page: { file, css: [css] },
        ignored: { file: '../not-an-asset' },
      });
      await writeFile(join(out, '.vite/manifest.json'), manifest);
      await snapshotClientAssets(out, cache);
      await restoreClientAssets(out, cache);
      assert.equal(
        await readFile(join(out, 'index.html'), 'utf8'),
        'HTML-' + version,
      );
      assert.equal(
        await readFile(join(out, '.vite/manifest.json'), 'utf8'),
        manifest,
      );
      for (
        let previous = Math.max(1, version - 3);
        previous <= version;
        previous++
      ) {
        for (const ext of ['js', 'css'])
          assert.equal(
            await readFile(
              join(out, `_next/static/chunks/page-${previous}.${ext}`),
              'utf8',
            ),
            'current-' + previous,
          );
      }
      if (version > 4)
        await assert.rejects(
          access(join(out, `_next/static/chunks/page-${version - 4}.js`)),
        );
    }
    assert.equal(
      JSON.parse(await readFile(join(cache, 'history.json'), 'utf8')).length,
      4,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Diagnostic endpoint rejects cross-origin and oversized input and logs only allowed fields', async () => {
  const raw = await readFile(new URL('../app/api/client-error/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(raw, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(() => ({ rateLimit: async () => {} }), module, module.exports);
  const request = (body, origin = 'https://float.example') => new Request('https://float.example/api/client-error', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const valid = { section: 'Markets', kind: 'module', code: null, assets: ['/_next/static/chunks/market-ABC.js'] };
  const old = console.error, logs = [];
  console.error = (...args) => logs.push(args);
  try {
    assert.equal((await module.exports.POST(request(valid, 'https://other.example'))).status, 403);
    assert.equal((await module.exports.POST(request({ ...valid, assets: ['/private/wallet'] }))).status, 400);
    assert.equal((await module.exports.POST(request({ ...valid, unused: 'x'.repeat(3000) }))).status, 413);
    assert.equal(logs.length, 0);
    assert.equal((await module.exports.POST(request({ ...valid, privateData: 'never log this' }))).status, 204);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(JSON.stringify(logs), /privateData|never log/);
  } finally { console.error = old; }
});
