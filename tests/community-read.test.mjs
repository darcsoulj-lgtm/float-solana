import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { bundle } from './helpers/bundle.mjs';
const { readCommunityThreads, readCommunityReplies, AppError } = await bundle(
  "export * from './lib/community-read'; export { AppError } from './lib/validation';",
);
async function fixture(run) {
  const sql = new DatabaseSync(':memory:');
  try {
    const dir = new URL('../drizzle/', import.meta.url);
    for (const file of (await readdir(dir))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      sql.exec(await readFile(new URL(file, dir), 'utf8'));
    sql.exec(`INSERT INTO community_members(id,wallet_hash,alias,bio,qualifying_symbol,verified_until,created_at,show_value_badge) VALUES('a','private-hash-a','Alice','Public bio','MU',9999999999999,1,1),('b','private-hash-b','Bob','Bio','SPCX',9999999999999,1,0);
      INSERT INTO community_threads(id,member_id,topic,title,body,hidden,created_at,updated_at) VALUES('visible','a','general','Public title','Public body',0,10,10),('hidden','a','general','Hidden title','Hidden body',1,20,20),('other','b','general','Other title','Other body',0,30,30);
      INSERT INTO community_replies(id,member_id,thread_id,body,hidden,created_at) VALUES('reply','b','visible','Public reply',0,11),('secret-reply','a','visible','Hidden reply',1,12);
      INSERT INTO community_bookmarks(member_id,target_type,target_id,created_at) VALUES('a','thread','visible',10);
      INSERT INTO community_blocks(blocker_id,blocked_id,created_at) VALUES('a','b',10);
      INSERT INTO community_polls(thread_id,closes_at,created_at) VALUES('visible',9999999999999,10);
      INSERT INTO community_poll_options(id,thread_id,label,position) VALUES('opt-a','visible','Yes',0),('opt-b','visible','No',1);
      INSERT INTO community_poll_votes(thread_id,member_id,option_id,created_at) VALUES('visible','a','opt-a',10);`);
    const database = {
      prepare(query) {
        return {
          args: [],
          bind(...args) {
            this.args = args;
            return this;
          },
          async all() {
            assert.match(query, /^SELECT/);
            return { results: sql.prepare(query).all(...this.args) };
          },
          async first() {
            assert.match(query, /^SELECT/);
            return sql.prepare(query).get(...this.args) ?? null;
          },
        };
      },
    };
    await run(database, sql);
  } finally {
    sql.close();
  }
}
const url = (query = '') =>
  new URL('https://float.example/api/community/threads' + query);
void test('guest feed reads public metadata without bookmarks, private holdings, or poll choice', () =>
  fixture(async (database) => {
    const result = await readCommunityThreads(database, url(), null, []);
    assert.deepEqual(
      result.threads.map((t) => t.id),
      ['other', 'visible'],
    );
    const alice = result.threads[1];
    assert.equal(alice.bio, 'Public bio');
    assert.equal(alice.value_tier, null);
    assert.equal(result.threads[0].value_tier, null);
    assert.equal(alice.saved, 0);
    assert.equal(alice.reply_count, 1);
    assert.equal(alice.poll.results_visible, false);
    assert.equal(alice.poll.total_votes, null);
    assert.ok(
      alice.poll.options.every((o) => !o.selected && o.vote_count === null),
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      /wallet|qualifying_symbol|notify_replies|private-hash|Hidden/,
    );
    const member = await readCommunityThreads(database, url(), 'a', []);
    assert.deepEqual(
      member.threads.map((t) => t.id),
      ['visible'],
    );
    assert.equal(member.threads[0].saved, 1);
    assert.equal(member.threads[0].reply_count, 0);
    assert.equal(member.threads[0].poll.total_votes, 1);
  }));
void test('guest private feeds fail closed and thread detail filtering remains public', () =>
  fixture(async (database) => {
    for (const feed of ['personal', 'saved', 'mine'])
      await assert.rejects(
        readCommunityThreads(database, url('?feed=' + feed), null, []),
        (e) => e.status === 401,
      );
    const result = await readCommunityThreads(
      database,
      url('?thread=visible'),
      null,
      [],
    );
    assert.deepEqual(
      result.threads.map((t) => t.id),
      ['visible'],
    );
    assert.equal(
      (await readCommunityThreads(database, url('?thread=hidden'), null, []))
        .threads.length,
      0,
    );
  }));
void test('guest replies respect hidden thread and reply boundaries; member blocking remains scoped', () =>
  fixture(async (database) => {
    const result = await readCommunityReplies(database, url(), 'visible', null);
    assert.deepEqual(
      result.replies.map((r) => r.id),
      ['reply'],
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      /wallet|qualifying_symbol|notify_replies|private-hash/,
    );
    assert.equal(
      (await readCommunityReplies(database, url(), 'visible', 'a')).replies
        .length,
      0,
    );
    for (const id of ['hidden', 'missing'])
      await assert.rejects(
        readCommunityReplies(database, url(), id, null),
        (e) => e.status === 404,
      );
  }));

void test('HTTP routes permit guest reading but reject every member mutation and private endpoint', () =>
  fixture(async (database) => {
    const { compileFunction } = await import('node:vm');
    const { default: ts } = await import('typescript');
    // Compile the actual route. Provider/auth dependencies are isolated; the real read
    // service and SQLite schema are exercised through HTTP Request/Response objects.
    const dependencies = {
      '@/lib/editorial-server': { recordOperation: async () => {} },
      '@/lib/community-read': { readCommunityThreads, readCommunityReplies },
      '@/lib/community-server': {
        communityMember: async (_req, required = true) => {
          if (required) throw new AppError('Verify your wallet', 401);
          return null;
        },
      },
      '@/lib/registry-server': {
        verifiedRegistry: async () => ({ tokens: [] }),
      },
      '@/lib/server': { db: () => database, rateLimit: async () => {} },
      '@/lib/validation': { AppError },
      '@/lib/request-body': { readBoundedText: async (req) => req.text() },
      '@/lib/community-rooms': {},
      '@/lib/community-home': {},
      '@/lib/holder-tier-server': {},
      '@/lib/holdings-refresh': {},
      '@/lib/admin-wallet': {},
      '@/lib/solana': {},
      '@/lib/wallet-handoff': {},
      '@/lib/community-sign-in': {},
      '@/lib/community-types': {},
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
    const compiled = { exports: {} };
    compileFunction(output, ['require', 'module', 'exports'])(
      (id) => {
        assert.ok(id in dependencies, id);
        return dependencies[id];
      },
      compiled,
      compiled.exports,
    );
    const feed = await compiled.exports.GET(
      new Request('https://float.example/api/community/threads'),
    );
    assert.equal(feed.status, 200);
    assert.equal((await feed.json()).threads.length, 2);
    assert.equal(feed.headers.get('cache-control'), 'private, no-store');
    const replies = await compiled.exports.GET(
      new Request(
        'https://float.example/api/community/threads/visible/replies',
      ),
    );
    assert.equal(replies.status, 200);
    assert.equal((await replies.json()).replies.length, 1);
    for (const path of [
      'home',
      'blocks',
      'threads?feed=saved',
      'threads?feed=mine',
      'threads?feed=personal',
    ]) {
      assert.equal(
        (
          await compiled.exports.GET(
            new Request('https://float.example/api/community/' + path),
          )
        ).status,
        401,
        path,
      );
    }
    for (const path of [
      'threads',
      'threads/visible/replies',
      'threads/visible/remove',
      'threads/visible/poll/vote',
      'replies/reply/remove',
      'save',
      'follow',
      'reports',
      'blocks',
      'profile',
    ]) {
      const response = await compiled.exports.POST(
        new Request('https://float.example/api/community/' + path, {
          method: 'POST',
          headers: {
            origin: 'https://float.example',
            'content-type': 'application/json',
          },
          body: '{}',
        }),
      );
      assert.equal(response.status, 401, path);
    }
  }));
