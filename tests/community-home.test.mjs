import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const raw = await readFile(
  new URL('../lib/community-home.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(raw, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', output)(
  () => ({ TOPICS: [{ id: 'MU', label: 'Micron' }] }),
  module,
  module.exports,
);
const { communityHome } = module.exports;
test('home loads in one database batch and isolates holdings, session and bookmarks', async () => {
  const sql = new DatabaseSync(':memory:');
  try {
    const migrations = new URL('../drizzle/', import.meta.url);
    for (const file of (await readdir(migrations))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      sql.exec(await readFile(new URL(file, migrations), 'utf8'));
    sql.exec(
      "INSERT INTO community_members(id,wallet_hash,alias,qualifying_symbol,verified_until,created_at) VALUES('a','hash-a','Alice','MU',9999999999999,1),('b','hash-b','Bob','SPCX',9999999999999,1);",
    );
    sql.exec(
      "INSERT INTO community_holdings(member_id,symbol,verified_at,slot,raw_amount,decimals,ui_amount) VALUES('a','MU',1,1,'10',1,'1'),('b','SPCX',1,1,'20',1,'2');",
    );
    sql.exec(
      "INSERT INTO community_sessions(hash,member_id,expires_at,wallet) VALUES('sa','a',9999999999999,'wallet-a'),('sb','b',9999999999999,'wallet-b');",
    );
    let batches = 0;
    const database = {
      prepare(query) {
        const stmt = {
          query,
          args: [],
          bind(...args) {
            this.args = args;
            return this;
          },
        };
        return stmt;
      },
      async batch(statements) {
        batches++;
        return statements.map(({ query, args }) => {
          const statement = sql.prepare(query);
          if (query.startsWith('SELECT'))
            return { results: statement.all(...args) };
          statement.run(...args);
          return { results: [] };
        });
      },
    };
    const a = await communityHome(database, 'a', 'sa');
    assert.equal(batches, 1);
    assert.deepEqual(
      a.holdings.map((h) => h.symbol),
      ['MU'],
    );
    assert.equal(a.sources.length, 3);
    assert.equal(a.holdingsRefreshAvailable, true);
    sql.exec(
      "INSERT INTO community_bookmarks(member_id,target_type,target_id,created_at) VALUES('a','source','micron-ir',1)",
    );
    const b = await communityHome(database, 'b', 'sa');
    assert.deepEqual(
      b.holdings.map((h) => h.symbol),
      ['SPCX'],
    );
    assert.ok(b.sources.every((s) => s.saved === 0));
    assert.equal(b.holdingsRefreshAvailable, false);
    assert.equal(
      sql.prepare('SELECT count(*) n FROM community_sources').get().n,
      3,
    );
  } finally {
    sql.close();
  }
});
