// Isolated real routes + real Worker/D1. Sessions/data are fixtures; outbound
// providers are simulated. Never reads .env or calls production/provider URLs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundle } from '../tests/helpers/bundle.mjs';
const require = createRequire(import.meta.url),
  rr = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = rr('miniflare'),
  { build } = rr('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const registry = await bundle(
  "export {TOKENS,TOKEN_REVIEW_DATE} from './lib/tokens';export {tokenBatchKey,REGISTRY_KEY} from './lib/backpack-registry';",
);
const { outputFiles } = await build({
  stdin: {
    resolveDir: root,
    loader: 'ts',
    contents: `
 import * as community from './app/api/community/[[...path]]/route';
 import * as markets from './app/api/market-data/route';
 import * as news from './app/api/holder-news/route';
 const stats={statements:0,rowsRead:0,rowsWritten:0};
 const statements=new WeakMap();
 const record=result=>{stats.statements++;stats.rowsRead+=result.meta?.rows_read||0;stats.rowsWritten+=result.meta?.rows_written||0;return result;};
 function statement(raw){const wrapped={
  bind(...args){return statement(raw.bind(...args));},
  async all(){return record(await raw.all());},async run(){return record(await raw.run());},
  async first(column){const r=record(await raw.all());return column?r.results[0]?.[column]??null:r.results[0]??null;}
 };statements.set(wrapped,raw);return wrapped;}
 globalThis.__floatInstrument=db=>({prepare:sql=>statement(db.prepare(sql)),batch:async list=>(await db.batch(list.map(s=>statements.get(s)??s))).map(record)});
 export default {async fetch(req){
  const path=new URL(req.url).pathname;
  if(path==='/__stats'){const result={...stats};if(req.method==='POST')Object.assign(stats,{statements:0,rowsRead:0,rowsWritten:0});return Response.json(result);}
  if(path.startsWith('/api/community/'))return community.GET(req);
  if(path==='/api/market-data')return markets.GET(req);
  if(path==='/api/holder-news')return req.method==='POST'?news.POST(req):news.GET(req);
  return new Response('not found',{status:404});
 }};`,
  },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  external: ['cloudflare:workers'],
  write: false,
  plugins: [
    {
      name: 'isolated-runtime',
      setup(b) {
        b.onResolve({ filter: /^@\/app\/chatgpt-auth$/ }, () => ({
          path: 'auth',
          namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export const getChatGPTUser=async()=>null;',
          loader: 'ts',
        }));
        b.onLoad({ filter: /\/lib\/server\.ts$/ }, async (args) => ({
          contents: (await readFile(args.path, 'utf8')).replace(
            'return d;',
            'return globalThis.__floatInstrument(d);',
          ),
          loader: 'ts',
        }));
      },
    },
  ],
});
let providerCalls = 0;
const providerRequests = new Map();
const worker = new Miniflare({
  modules: true,
  script: outputFiles[0].text,
  d1Databases: { DB: 'float-repair-isolated' },
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  outboundService: async (req) => {
    providerCalls++;
    const id = req.method + ':' + req.url;
    providerRequests.set(id, (providerRequests.get(id) || 0) + 1);
    await new Promise((r) => setTimeout(r, 500));
    return new Response('', { status: 429, headers: { 'Retry-After': '60' } });
  },
});
const cookies = Array.from(
  { length: 50 },
  (_, i) => 'a'.repeat(70) + i.toString(16).padStart(2, '0'),
);
const read = async (path, i = 0, init = {}) => {
  const start = performance.now();
  const r = await worker.dispatchFetch('http://localhost' + path, {
    ...init,
    headers: { cookie: 'hp_member=' + cookies[i], ...init.headers },
  });
  const body = await r.json();
  return { status: r.status, body, ms: performance.now() - start };
};
const snapshot = async (reset = false) =>
  (
    await worker.dispatchFetch('http://localhost/__stats', {
      method: reset ? 'POST' : 'GET',
    })
  ).json();
const distribution = (values) => {
  const times = values.toSorted((a, b) => a - b);
  return {
    p50: times[Math.ceil(times.length * 0.5) - 1],
    p95: times[Math.ceil(times.length * 0.95) - 1],
    p99: times[Math.ceil(times.length * 0.99) - 1],
    max: times.at(-1),
  };
};
const results = {
  mode: 'isolated-local-worker-real-auth-routes-D1-simulated-500ms-429-providers',
  workloads: [],
};
try {
  console.log('Preparing isolated database and 10,000 discussion fixtures');
  const db = await worker.getD1Database('DB');
  for (const file of (await readdir(root + 'drizzle'))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    for (const sql of (await readFile(root + 'drizzle/' + file, 'utf8'))
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  }
  const now = Date.now();
  for (let i = 0; i < cookies.length; i++) {
    await db
      .prepare(
        'INSERT INTO community_members(id,wallet_hash,alias,qualifying_symbol,verified_until,created_at) VALUES(?,?,?,?,?,?)',
      )
      .bind('member' + i, 'hash' + i, 'Member' + i, 'MU', now + 3600000, now)
      .run();
    await db
      .prepare(
        'INSERT INTO community_sessions(hash,member_id,expires_at,wallet) VALUES(?,?,?,?)',
      )
      .bind(
        createHash('sha256').update(cookies[i]).digest('hex'),
        'member' + i,
        now + 3600000,
        'fixture-wallet-' + i,
      )
      .run();
    await db
      .prepare(
        'INSERT INTO community_holdings(member_id,symbol,verified_at,slot,raw_amount,decimals,ui_amount) VALUES(?,?,?,?,?,?,?)',
      )
      .bind('member' + i, 'MU', now, 123, String(i + 1), 0, String(i + 1))
      .run();
  }
  await db
    .prepare(
      'INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES(?,?,?,?)',
    )
    .bind(registry.REGISTRY_KEY, '[]', now, now + 300000)
    .run();
  for (let i = 0; i < 100; i++)
    await db
      .prepare(
        'INSERT INTO community_rooms(id,name,name_key,description,creator_id,created_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(
        'room' + i,
        'Room ' + i,
        'room ' + i,
        'Load fixture',
        'member0',
        now + i,
      )
      .run();
  // A realistic directory-size fixture; topic index must avoid a scan per room.
  for (let b = 0; b < 100; b++)
    await db.batch(
      Array.from({ length: 100 }, (_, n) => {
        const i = b * 100 + n;
        return db
          .prepare(
            'INSERT INTO community_threads(id,member_id,topic,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
          )
          .bind(
            'thread' + i,
            'member' + (i % 50),
            'room' + (i % 100),
            'Fixture ' + i,
            'Content',
            now + i,
            now + i,
          );
      }),
    );
  const denied = await worker.dispatchFetch(
    'http://localhost/api/community/home',
  );
  assert.equal(denied.status, 401);
  const forged = await read('/api/community/home?memberId=member49', 0);
  assert.equal(forged.status, 200);
  assert.equal(forged.body.holdings[0].raw_amount, '1');
  assert.ok(!JSON.stringify(forged.body).includes('fixture-wallet-49'));
  const oversized = await read('/api/community/threads', 0, {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: 'x'.repeat(40000),
  });
  assert.equal(oversized.status, 413);
  const crossOrigin = await read('/api/community/profile', 0, {
    method: 'POST',
    headers: { origin: 'http://elsewhere', 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(crossOrigin.status, 403);
  console.log('Checking authenticated routes, privacy and request limits');
  for (const concurrent of [10, 25, 50]) {
    console.log('Testing ' + concurrent + ' concurrent member journeys');
    await snapshot(true);
    const callsBefore = providerCalls;
    const requests = await Promise.all(
      Array.from({ length: concurrent }, async (_, i) => {
        const home = await read('/api/community/home', i);
        assert.equal(home.status, 200);
        assert.equal(home.body.holdings[0].raw_amount, String(i + 1));
        assert.ok(home.body.rooms.length <= 50);
        const news = await read('/api/holder-news?symbol=MU', i);
        assert.equal(news.status, 200);
        const rooms = await read('/api/community/rooms', i);
        assert.equal(rooms.status, 200);
        assert.equal(rooms.body.rooms.length, 50);
        return home.ms + news.ms + rooms.ms;
      }),
    );
    results.workloads.push({
      name: 'authenticated-home-news-rooms',
      concurrent,
      requests: concurrent * 3,
      journeyMs: distribution(requests),
      d1: await snapshot(),
      providerCalls: providerCalls - callsBefore,
    });
  }
  await snapshot(true);
  const callsBefore = providerCalls;
  const cold = await Promise.all(
    Array.from({ length: 20 }, (_, i) => read('/api/market-data?batch=0', i)),
  );
  assert.ok(cold.every((r) => r.status === 200));
  assert.ok(
    cold.every((r) => r.body.prices.stale && r.body.prices.data === null),
  );
  results.workloads.push({
    name: 'cold-market-provider-outage',
    concurrent: 20,
    latencyMs: distribution(cold.map((r) => r.ms)),
    d1: await snapshot(),
  });
  await new Promise((r) => setTimeout(r, 1800));
  results.outageProviderCalls = providerCalls - callsBefore;
  results.providerMaximumRequestsPerEndpoint = Math.max(
    ...providerRequests.values(),
  );
  assert.equal(
    results.providerMaximumRequestsPerEndpoint,
    1,
    'Concurrent users multiplied a source refresh',
  );
  const key =
    registry.TOKEN_REVIEW_DATE +
    ':' +
    (await registry.tokenBatchKey(registry.TOKENS.slice(0, 90)));
  for (const [prefix, data] of Object.entries({
    'llama-prices-v3:': {
      MU: { price: 12, confidence: 1, timestamp: Date.now() },
    },
    'solana-supplies-v4:': { MU: { supply: 100, valuationSafe: true } },
    'llama-history-v1:': {},
    'dex-pools-v4:': {},
  })) {
    await db
      .prepare(
        'INSERT INTO market_cache(key,payload,fetched_at,retry_after) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after',
      )
      .bind(prefix + key, JSON.stringify(data), Date.now(), Date.now() + 120000)
      .run();
  }
  await snapshot(true);
  const warmBefore = providerCalls;
  const warm = await Promise.all(
    Array.from({ length: 50 }, (_, i) => read('/api/market-data?batch=0', i)),
  );
  assert.ok(
    warm.every(
      (r) =>
        r.status === 200 &&
        r.body.prices.data.MU.price === 12 &&
        !r.body.prices.stale,
    ),
  );
  results.workloads.push({
    name: 'warm-market',
    concurrent: 50,
    latencyMs: distribution(warm.map((r) => r.ms)),
    d1: await snapshot(),
    providerCalls: providerCalls - warmBefore,
  });
  assert.equal(providerCalls, warmBefore);
  results.security = {
    unsignedRejected: true,
    crossOriginRejected: true,
    streamedBodyBounded: true,
    privateMemberScopeVerified: true,
  };
  await mkdir(root + 'research/engineering/2026-09-13', { recursive: true });
  await writeFile(
    root + 'research/engineering/2026-09-13/repair-runtime.json',
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await worker.dispose();
}
