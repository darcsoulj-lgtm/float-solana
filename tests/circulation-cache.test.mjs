import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))(
  'esbuild',
);
const root = new URL('../', import.meta.url).pathname;
const { outputFiles } = await build({
  stdin: {
    contents:
      "export {circulationSnapshot} from './lib/circulation-cache'; export {circulatingCoverage,issuerValuation,tokenObservation,tokenValuation} from './lib/token-observation'; export {mergeMarketPages} from './lib/market-data';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const api = await import(
  'data:text/javascript;base64,' +
    Buffer.from(outputFiles[0].text).toString('base64')
);
const fixture = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      root +
        'research/market-integrity/xstocks-issuer-circulation-2026-09-12.json.gz',
    ),
  ),
);
const xml = fs.readFileSync(
  root + 'research/market-integrity/ecb-2026-09-11.xml',
  'utf8',
);
function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(
    'CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)',
  );
  return {
    raw,
    d1: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              first: async () => raw.prepare(sql).get(...args) || null,
              all: async () => ({ results: raw.prepare(sql).all(...args) }),
              run: async () => raw.prepare(sql).run(...args),
            };
          },
        };
      },
    },
  };
}
test('Interrupted pagination retains completed pages, retries the failed page, and atomically publishes a complete snapshot', async () => {
  const { raw, d1 } = database();
  let clock = Date.parse('2026-09-12T14:01:00Z');
  const original = Date.now;
  Date.now = () => clock;
  try {
    const calls = new Map();
    let fail = true;
    let jobs = [];
    const fetcher = async (url, opts) => {
      if (String(url).includes('ecb')) return new Response(xml);
      const { variables } = JSON.parse(opts.body);
      assert.equal(variables.orderBy.field, 'symbol');
      const page = variables.page;
      calls.set(page, (calls.get(page) || 0) + 1);
      if (page === 2 && fail) throw new Error('Timed out');
      return Response.json(fixture[page]);
    };
    const run = async () => {
      jobs = [];
      const result = await api.circulationSnapshot(
        d1,
        (p) => jobs.push(p),
        clock,
        fetcher,
      );
      await Promise.all(jobs);
      return result;
    };
    for (let i = 0; i < 5; i++) await run();
    assert.equal(calls.get(0), 1);
    assert.equal(calls.get(1), 1);
    assert.equal(
      raw
        .prepare('SELECT * FROM market_cache WHERE key=?')
        .get('xstocks-circulation:v1'),
      undefined,
    );
    fail = false;
    clock += 31000;
    await run();
    const completed = await run();
    assert.equal(completed.stale, false);
    assert.equal(completed.refreshing, false);
    assert.ok(Object.keys(completed.data).length > 800);
    assert.equal(calls.get(2), 2);
    assert.equal(calls.get(0), 1);
    assert.equal(calls.get(8), 1);
    assert.ok(completed.fetchedAt < clock);
    const repeat = await run();
    assert.equal(repeat.fetchedAt, completed.fetchedAt);
    assert.equal(calls.get(2), 2);
  } finally {
    Date.now = original;
    raw.close();
  }
});
test('Dated fallback survives page merging, stays labeled, and never enters strict current circulation totals', () => {
  const now = Date.now(),
    source = (data) => ({
      data,
      fetchedAt: now - 3600000,
      stale: true,
      error: 'timeout',
    });
  const data = {
    catalog: source([]),
    markets: source({}),
    prices: source({}),
    supplies: source({}),
    pools: source({}),
    circulation: source({
      AAOIx: {
        mint: 'verified',
        circulatingSupply: 10,
        totalSupply: 1000,
        referencePriceUsd: 5,
        valueUsd: 50,
        currency: 'USD',
        fxDate: null,
      },
    }),
  };
  const merged = api.mergeMarketPages([data]);
  assert.equal(merged.circulation.fetchedAt, now - 3600000);
  assert.equal(api.circulatingCoverage(merged, now).total, null);
  const c = api.circulatingCoverage(merged, now, undefined, true);
  assert.equal(c.total, 50);
  assert.equal(c.delayed, true);
  assert.equal(c.observedAt, now - 3600000);
  assert.equal(api.issuerValuation(merged, now, 'xstocks').delayed, true);
  assert.equal(
    api.tokenValuation(api.tokenObservation(merged, 'AAOIx', now), 'xstocks')
      .basis,
    'Circulating · last verified',
  );
  assert.equal(
    api.circulatingCoverage(merged, now + 86400000, undefined, true).total,
    null,
  );
});
test('An invalid new generation never overwrites the previous complete snapshot', async () => {
  const { raw, d1 } = database();
  const now = Date.now();
  raw
    .prepare('INSERT INTO market_cache VALUES(?,?,?,?)')
    .run(
      'xstocks-circulation:v1',
      JSON.stringify({ AAOIx: { valueUsd: 50 } }),
      now - 3600000,
      0,
    );
  const prefix = 'xstocks-page:v2:' + Math.floor(now / 600000) + ':';
  const bad = structuredClone(fixture);
  bad[1].data.tokens.nodes[0] = bad[0].data.tokens.nodes[0];
  for (let i = 0; i < bad.length; i++)
    raw
      .prepare('INSERT INTO market_cache VALUES(?,?,?,?)')
      .run(prefix + i, JSON.stringify(bad[i]), now, now + 600000);
  const jobs = [];
  const result = await api.circulationSnapshot(
    d1,
    (p) => jobs.push(p),
    now,
    async () => new Response(xml),
  );
  await Promise.all(jobs);
  assert.equal(result.data.AAOIx.valueUsd, 50);
  assert.equal(result.fetchedAt, now - 3600000);
  assert.equal(result.stale, true);
  assert.equal(
    raw
      .prepare('SELECT count(*) AS n FROM market_cache WHERE key LIKE ?')
      .get(prefix + '%').n,
    0,
  );
  raw.close();
});

test('Wallet verification without checkbox still enforces challenge and signature checks', async () => {
  const ts = require('typescript');
  let challenge = null,
    signatureCalls = 0;
  class AppError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }
  const source = fs.readFileSync(
    root + 'app/api/community/[[...path]]/route.ts',
    'utf8',
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const dependencies = {
    '@/lib/server': {
      rateLimit: async () => {},
      db: () => ({
        prepare: () => ({ bind: () => ({ first: async () => challenge }) }),
      }),
    },
    '@/lib/validation': { AppError, textValue: (x) => x },
    '@/lib/solana': {
      verifySignature: async () => {
        signatureCalls++;
        throw new AppError('Invalid signature', 401);
      },
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    (id) => dependencies[id] || {},
    module,
    module.exports,
  );
  const req = () =>
    new Request('https://example.com/api/community/verify', {
      method: 'POST',
      headers: {
        origin: 'https://example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ challengeId: 'test', signature: [] }),
    });
  const expired = await module.exports.GET(req());
  assert.equal(expired.status, 401);
  assert.match((await expired.json()).error, /expired/);
  assert.equal(signatureCalls, 0);
  challenge = { id: 'test', wallet: 'wallet', message: 'message' };
  const badSignature = await module.exports.GET(req());
  assert.equal(badSignature.status, 401);
  assert.equal(signatureCalls, 1);
  assert.equal((await badSignature.json()).error, 'Invalid signature');
});
