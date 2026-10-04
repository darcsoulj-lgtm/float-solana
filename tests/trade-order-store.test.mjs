import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { bundle } from './helpers/bundle.mjs';
const { orderStore } = await bundle(
  "export * from './lib/trading/order-store';",
);
const schema = await readFile(
  new URL('../drizzle/0019_trade_orders.sql', import.meta.url),
  'utf8',
);
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(schema);
  let clock = 100000;
  const db = {
    withSession(mode) {
      assert.equal(mode, 'first-primary');
      return this;
    },
    prepare(query) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return sql.prepare(query).get(...args) || null;
        },
        async run() {
          return {
            meta: { changes: Number(sql.prepare(query).run(...args).changes) },
          };
        },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sql.exec('COMMIT');
        return result;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return {
    sql,
    db,
    store: () => orderStore(db, () => clock),
    advance: (ms) => (clock += ms),
  };
}
async function ready(f, id = 'a', owner = 'wallet-a') {
  const s = f.store();
  assert.equal(await s.reserve(id, owner), true);
  return s.ready(id, owner, { messageHash: 'reviewed' }, 150000);
}
void test('independent service instances have exactly one submission winner', async () => {
  const f = fixture();
  const r = await ready(f);
  const results = await Promise.all([
    f.store().claim('a', 'wallet-a', r.revision, 'sig-a'),
    f.store().claim('a', 'wallet-a', r.revision, 'sig-b'),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await f.store().get('a', 'wallet-a')).signature, 'sig-a');
  f.sql.close();
});
void test('a second order cannot bypass a pending wallet order across sessions', async () => {
  const f = fixture();
  const r = await ready(f);
  await f.store().claim(r.id, r.walletKey, r.revision, 'sig');
  assert.equal(await f.store().reserve('b', 'wallet-a'), false);
  assert.equal(await f.store().reserve('c', 'wallet-b'), true);
  f.sql.close();
});
void test('preparation lease and superseding revoke old approvals atomically', async () => {
  const f = fixture();
  assert.equal(await f.store().reserve('a', 'wallet-a'), true);
  assert.equal(await f.store().reserve('b', 'wallet-a'), false);
  const r = await f.store().ready('a', 'wallet-a', {}, 150000);
  assert.equal(await f.store().reserve('b', 'wallet-a'), true);
  assert.equal(await f.store().claim('a', 'wallet-a', r.revision, 'sig'), null);
  assert.equal((await f.store().get('a', 'wallet-a')).state, 'superseded');
  f.sql.close();
});
void test('only preparing leases expire; unknown orders survive arbitrary time', async () => {
  const f = fixture();
  await f.store().reserve('a', 'wallet-a');
  f.advance(60001);
  assert.equal(await f.store().reserve('b', 'wallet-a'), true);
  const r = await f.store().ready('b', 'wallet-a', {}, 200000);
  const claimed = await f.store().claim('b', 'wallet-a', r.revision, 'sig');
  await f.store().settle(claimed, 'unknown', {});
  f.advance(1000000000);
  assert.equal(await f.store().reserve('c', 'wallet-a'), false);
  f.sql.close();
});
void test('expired or wrong-owner order cannot be read, prepared or submitted', async () => {
  const f = fixture();
  const r = await ready(f);
  assert.equal(await f.store().get('a', 'wallet-b'), null);
  assert.equal(await f.store().claim('a', 'wallet-b', r.revision, 'sig'), null);
  f.advance(60001);
  assert.equal(await f.store().claim('a', 'wallet-a', r.revision, 'sig'), null);
  f.sql.close();
});
void test('stale reconciliation cannot overwrite confirmed outcomes', async () => {
  const f = fixture();
  const r = await ready(f);
  const claimed = await f.store().claim('a', 'wallet-a', r.revision, 'sig');
  await f.store().settle(claimed, 'confirmed', { actualOutput: 1 });
  assert.equal(await f.store().settle(claimed, 'unknown', {}), null);
  assert.equal((await f.store().get('a', 'wallet-a')).state, 'confirmed');
  f.sql.close();
});
void test('database error cannot grant submission permission', async () => {
  const s = orderStore({
    withSession() {
      return {
        prepare() {
          return {
            bind() {
              return {
                first: async () => {
                  throw Error('write acknowledgement lost');
                },
              };
            },
          };
        },
      };
    },
  });
  await assert.rejects(s.claim('a', 'wallet-a', 1, 'sig'), /acknowledgement/);
});
