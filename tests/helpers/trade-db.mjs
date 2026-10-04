import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { bundle } from './bundle.mjs';
const { orderStore } = await bundle(
  "export * from './lib/trading/order-store';",
);
const schema = await readFile(
  new URL('../../drizzle/0019_trade_orders.sql', import.meta.url),
  'utf8',
);
export function tradeFixture() {
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
