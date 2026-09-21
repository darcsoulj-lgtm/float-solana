import { compileFunction } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    `CREATE TABLE community_members (id TEXT,alias TEXT,bio TEXT,show_badge INTEGER,qualifying_symbol TEXT,notify_replies INTEGER,show_value_badge INTEGER); INSERT INTO community_members VALUES ('verified-wallet-owner','Alice','',0,'MU',1,0)`,
  );
  sqlite.exec(`ALTER TABLE community_members ADD COLUMN verified_until INTEGER DEFAULT 0;
    ALTER TABLE community_members ADD COLUMN suspended INTEGER DEFAULT 0;
    CREATE TABLE wallet_handoffs (id TEXT PRIMARY KEY, secret_hash TEXT, member_id TEXT, wallet TEXT, expires_at INTEGER);
    CREATE TABLE community_sessions (hash TEXT PRIMARY KEY, member_id TEXT, expires_at INTEGER, wallet TEXT);
    UPDATE community_members SET verified_until=${Date.now() + 3600000};`);
  const database = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              return sqlite.prepare(sql).run(...values);
            },
            async first() {
              return sqlite.prepare(sql).get(...values);
            },
          };
        },
      };
    },
  };
  class AppError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }
  let signedIn = true,
    providerDown = false,
    missingPrice = false;
  const calls = [];
  const dependencies = {
    '@/lib/community-rooms': {},
    '@/lib/request-body': { readBoundedText: async (req) => req.text() },
    '@/lib/registry-server': {
      verifiedRegistry: async () => ({
        registry: { additions: [] },
        tokens: [],
      }),
    },
    '@/lib/community-home': {},
    '@/lib/holder-tier-server': {
      updateHolderTier: async (db, id) => {
        assert.equal(db, database);
        calls.push(id);
        return missingPrice ? { tier: null, expiresAt: 0 } : { tier: 'bronze', expiresAt: 123 };
      },
    },
    '@/lib/holdings-refresh': {},
    '@/app/chatgpt-auth': {},
    '@/lib/server': {
      db: () => database,
      digest: async (value) => 'hash:' + value,
      rateLimit: async () => {},
      runtime: () => ({}),
    },
    '@/lib/validation': {
      AppError,
      textValue: (v, min, max) => {
        if (typeof v !== 'string' || v.length < min || v.length > max)
          throw new AppError('Invalid text');
        return v;
      },
    },
    '@/lib/solana': {
      validWallet: (value) => value,
      detectHoldings: async () => {
        if (providerDown) throw new AppError('Provider unavailable', 503);
        return [];
      },
    },
    '@/lib/tokens': {},
    '@/lib/community-sign-in': {},
    '@/lib/wallet-handoff': { WALLET_HANDOFF_MS: 600000 },
    '@/lib/admin-wallet': {
      adminWallet: async () => null,
    },
    '@/lib/community-types': {},
    '@/lib/community-server': {
      communityMember: async () => {
        if (!signedIn) throw new AppError('Sign in', 401);
        return sqlite.prepare('SELECT * FROM community_members').get();
      },
      communityCleanup: async () => {},
      MEMBERSHIP_MS: 86400000,
      sessionCookie: (session) => 'hp_member=' + session,
      validateAlias: (x) => x,
    },
  };
  const source = await readFile(
    new URL('../app/api/community/[[...path]]/route.ts', import.meta.url),
    'utf8',
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  compileFunction(output, ['require', 'module', 'exports'])(
    (id) => {
      if (!(id in dependencies)) throw Error(id);
      return dependencies[id];
    },
    compiledModule,
    compiledModule.exports,
  );
  const post = (path, body, origin = 'https://test.local') =>
    compiledModule.exports.POST(
      new Request('https://test.local/api/community/' + path, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  return {
    sqlite,
    post,
    calls,
    losePrice: () => { missingPrice = true; },
    failProvider: () => {
      providerDown = true;
    },
    logout: () => {
      signedIn = false;
    },
  };
}
void test('installed Float claims a signed wallet only with its private one-time secret', async () => {
  const f = await fixture();
  try {
    const secret = 'a'.repeat(64);
    const started = await f.post('handoff/start', { secret });
    assert.equal(started.status, 200);
    const { id } = await started.json();
    assert.equal(f.sqlite.prepare('SELECT secret_hash FROM wallet_handoffs WHERE id=?').get(id).secret_hash, 'hash:' + secret);
    assert.deepEqual(await (await f.post('handoff/claim', { id, secret })).json(), { ready: false });
    f.sqlite.prepare('UPDATE wallet_handoffs SET member_id=?,wallet=? WHERE id=?').run('verified-wallet-owner', 'test-wallet', id);
    assert.deepEqual(await (await f.post('handoff/claim', { id, secret: 'b'.repeat(64) })).json(), { ready: false });
    const claimed = await f.post('handoff/claim', { id, secret });
    assert.deepEqual(await claimed.json(), { ready: true });
    assert.match(claimed.headers.get('Set-Cookie'), /^hp_member=/);
    assert.equal(f.sqlite.prepare('SELECT wallet FROM community_sessions').get().wallet, 'test-wallet');
    assert.deepEqual(await (await f.post('handoff/claim', { id, secret })).json(), { ready: false });
  } finally {
    f.sqlite.close();
  }
});
void test('tier endpoint ignores client-supplied identity, total and tier', async () => {
  const f = await fixture();
  const r = await f.post('holder-tier', {
    memberId: 'other-holder',
    tier: 'diamond',
    value: 1e12,
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { tier: 'bronze', expiresAt: 123 });
  assert.deepEqual(f.calls, ['verified-wallet-owner']);
  f.sqlite.close();
});
void test('tier endpoint rejects unsigned and cross-origin requests', async () => {
  const f = await fixture();
  assert.equal(
    (await f.post('holder-tier', {}, 'https://elsewhere.example')).status,
    403,
  );
  f.logout();
  assert.equal((await f.post('holder-tier', {})).status, 401);
  assert.equal(f.calls.length, 0);
  f.sqlite.close();
});
void test('value badge preference persists, can be revoked, and rejects non-booleans', async () => {
  const f = await fixture();
  const profile = { alias: 'Alice', bio: 'Hello' };
  assert.equal(
    (await f.post('profile', { ...profile, showValueBadge: true })).status,
    200,
  );
  assert.equal(
    f.sqlite.prepare('SELECT show_value_badge FROM community_members').get()
      .show_value_badge,
    1,
  );
  await f.post('profile', profile);
  assert.equal(
    f.sqlite.prepare('SELECT show_value_badge FROM community_members').get()
      .show_value_badge,
    1,
  );
  assert.equal(
    (await f.post('profile', { ...profile, showValueBadge: 'yes' })).status,
    400,
  );
  await f.post('profile', { ...profile, showValueBadge: false });
  assert.equal(
    f.sqlite.prepare('SELECT show_value_badge FROM community_members').get()
      .show_value_badge,
    0,
  );
  f.sqlite.close();
});

void test('Empty-wallet challenge supplies eligibility help without requesting a signature', async () => {
  const f = await fixture();
  try {
    const response = await f.post('challenge', {
      wallet: '11111111111111111111111111111111',
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const body = await response.json();
    assert.equal(body.code, 'NO_SUPPORTED_HOLDINGS');
    assert.equal(body.id, undefined);
    assert.match(body.error, /No signature is needed/);
    f.failProvider();
    const outage = await f.post('challenge', {
      wallet: '11111111111111111111111111111111',
    });
    assert.equal(outage.status, 503);
    assert.equal(
      (await outage.json()).code,
      undefined,
      'RPC outages are not interpreted as ineligible holdings',
    );
  } finally {
    f.sqlite.close();
  }
});

void test('Member room creation is blocked because channels are curated', async () => {
  const f = await fixture();
  try {
    const response = await f.post('rooms', {
      name: 'My room',
      description: 'A member-created room',
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /curated|Float/i);
  } finally {
    f.sqlite.close();
  }
});

void test('verified membership receives Bronze when prices cannot establish a value tier', async () => {
  const f = await fixture();
  try {
    f.losePrice();
    const r = await f.post('holder-tier', {});
    const result = await r.json();
    assert.equal(r.status, 200);
    assert.equal(result.tier, 'bronze');
    assert.equal(result.expiresAt, f.sqlite.prepare('SELECT verified_until FROM community_members').get().verified_until);
  } finally { f.sqlite.close(); }
});
