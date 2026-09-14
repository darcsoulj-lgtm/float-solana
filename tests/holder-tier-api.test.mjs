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
    providerDown = false;
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
        return { tier: 'bronze', expiresAt: 123 };
      },
    },
    '@/lib/holdings-refresh': {},
    '@/app/chatgpt-auth': {},
    '@/lib/server': {
      db: () => database,
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
    '@/lib/community-types': {},
    '@/lib/community-server': {
      communityMember: async () => {
        if (!signedIn) throw new AppError('Sign in', 401);
        return sqlite.prepare('SELECT * FROM community_members').get();
      },
      communityCleanup: async () => {},
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
    failProvider: () => {
      providerDown = true;
    },
    logout: () => {
      signedIn = false;
    },
  };
}
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
  const profile = { alias: 'Alice', bio: 'Hello', showBadge: false };
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
