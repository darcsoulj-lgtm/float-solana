import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { bundle } from './helpers/bundle.mjs';
const { communityHome, readRooms } = await bundle(
  "export * from './lib/community-home';export * from './lib/community-rooms';",
);
void test('home loads in one database batch and isolates holdings, session and bookmarks', async () => {
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
          async all() {
            return { results: sql.prepare(this.query).all(...this.args) };
          },
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
          assert.fail('Home must be read-only: ' + query);
        });
      },
    };
    sql.exec(
      "INSERT INTO community_rooms(id,name,name_key,description,creator_id,created_at) VALUES('room-a','Alpha','alpha','Description','a',1)",
    );
    for (let i = 0; i < 120; i++)
      sql
        .prepare(
          'INSERT INTO community_rooms(id,name,name_key,description,creator_id,created_at) VALUES(?,?,?,?,?,?)',
        )
        .run(
          'room-' + i,
          'Room ' + i,
          'room ' + i,
          'Description',
          'a',
          100 + i,
        );
    sql.exec(
      "INSERT INTO community_threads(id,member_id,topic,title,body,created_at,updated_at) VALUES('count-test','a','room-a','Title','Body',1,1)",
    );
    const count = (id) =>
      sql
        .prepare('SELECT thread_count n FROM community_rooms WHERE id=?')
        .get(id).n;
    assert.equal(count('room-a'), 1);
    sql.exec("UPDATE community_threads SET hidden=1 WHERE id='count-test'");
    assert.equal(count('room-a'), 0);
    sql.exec(
      "UPDATE community_threads SET hidden=0,topic='room-1' WHERE id='count-test'",
    );
    assert.equal(count('room-a'), 0);
    assert.equal(count('room-1'), 1);
    sql.exec("DELETE FROM community_threads WHERE id='count-test'");
    assert.equal(count('room-1'), 0);
    const firstPage = await readRooms(database);
    const secondPage = await readRooms(database, firstPage.nextCursor);
    const thirdPage = await readRooms(database, secondPage.nextCursor);
    assert.equal(firstPage.rooms.length, 50);
    assert.equal(secondPage.rooms.length, 50);
    assert.equal(thirdPage.rooms.length, 21);
    assert.equal(thirdPage.nextCursor, null);
    assert.equal(
      new Set(
        [...firstPage.rooms, ...secondPage.rooms, ...thirdPage.rooms].map(
          (r) => r.id,
        ),
      ).size,
      121,
    );
    assert.equal((await readRooms(database, '', 'Alpha')).rooms.length, 1);
    assert.equal((await readRooms(database, '', '%')).rooms.length, 0);
    await assert.rejects(readRooms(database, 'bad:cursor'));
    const plan = sql
      .prepare(
        'EXPLAIN QUERY PLAN SELECT count(*) FROM community_threads WHERE topic=? AND hidden=0',
      )
      .all('MU');
    assert.ok(
      plan.some((row) => row.detail.includes('idx_community_threads_topic')),
    );
    const a = await communityHome(database, 'a', 'sa');
    assert.equal(batches, 1);
    assert.deepEqual(
      a.holdings.map((h) => h.symbol),
      ['MU'],
    );
    assert.equal(a.sources.length, 3);
    assert.equal(a.holdingsRefreshAvailable, true);
    assert.equal(a.rooms.length, 10);
    assert.ok(a.rooms.every((room) => room.id.startsWith('channel-')));
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
