import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { bundle } from './helpers/bundle.mjs';
const { readCommunityThreads, readCommunityReplies, AppError, textValue, setThreadLike } = await bundle(
  "export * from './lib/community-read'; export * from './lib/community-likes'; export { AppError, textValue } from './lib/validation';",
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
      INSERT INTO community_poll_votes(thread_id,member_id,option_id,created_at) VALUES('visible','a','opt-a',10);
      INSERT INTO community_likes(thread_id,member_id,created_at) VALUES('visible','a',10);`);
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
          async run() {
            const result = sql.prepare(query).run(...this.args);
            return { meta: { changes: result.changes } };
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
    assert.equal(alice.like_count,1);
    assert.equal(alice.liked,0);
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
    assert.equal(member.threads[0].liked,1);
    assert.equal(member.threads[0].like_count,1);
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
  fixture(async (database, sql) => {
    const { compileFunction } = await import('node:vm');
    const { default: ts } = await import('typescript');
    // Compile the actual route. Provider/auth dependencies are isolated; the real read
    // service and SQLite schema are exercised through HTTP Request/Response objects.
    const dependencies = {
      '@/lib/discussion-attachment-server': {},
      '@/lib/editorial-server': { recordOperation: async () => {} },
      '@/lib/community-read': { readCommunityThreads, readCommunityReplies },
      '@/lib/community-likes': {setThreadLike},
      '@/lib/community-server': {
        communityMember: async (req, required = true) => {
          const id = req.headers.get('x-test-member');
          if (id === 'a' || id === 'b') return { id };
          if (required) throw new AppError('Verify your wallet', 401);
          return null;
        },
      },
      '@/lib/community-eligibility': { communityTokens: tokens => tokens.filter(t => t.issuer === 'backpack') },
    '@/lib/registry-server': {
        verifiedRegistry: async () => ({ tokens: [] }),
      },
      '@/lib/server': { db: () => database, rateLimit: async () => {} },
      '@/lib/validation': { AppError, textValue },
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
      'attachments',
      'threads/visible/replies',
      'threads/visible/remove',
      'threads/visible/like',
      'threads/visible/edit',
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
    const like = (id, member, liked, origin='https://float.example') => compiled.exports.POST(new Request(`https://float.example/api/community/threads/${id}/like`, {
      method:'POST',headers:{origin,'content-type':'application/json','x-test-member':member},body:JSON.stringify({liked,memberId:'b'}),
    }));
    assert.equal((await like('visible','a',false,'https://evil.example')).status,403);
    const unliked=await like('visible','a',false);
    assert.equal(unliked.status,200);assert.deepEqual(await unliked.json(),{like_count:0,liked:false});
    const liked=await like('visible','a',true);
    assert.equal(liked.status,200);assert.deepEqual(await liked.json(),{like_count:1,liked:true});
    assert.equal((await like('visible','a',true)).status,200);
    assert.equal(sql.prepare("SELECT member_id FROM community_likes WHERE thread_id='visible'").get().member_id,'a');
    assert.equal((await like('hidden','a',true)).status,404);
    assert.equal((await like('visible','a','yes')).status,400);
    const edit = (id, member, body) => compiled.exports.POST(new Request(`https://float.example/api/community/threads/${id}/edit`, {
      method: 'POST',
      headers: { origin: 'https://float.example', 'content-type': 'application/json', 'x-test-member': member },
      body: JSON.stringify(body),
    }));
    assert.equal((await edit('visible', 'b', { title: 'Stolen', body: 'No' })).status, 403);
    assert.equal((await edit('visible', 'a', { title: ' ', body: 'No' })).status, 400);
    assert.equal((await edit('hidden', 'a', { title: 'Hidden edit', body: '' })).status, 404);
    assert.equal((await edit('visible', 'a', { title: 'Edited title', body: 'Edited body' })).status, 200);
    const updated = sql.prepare("SELECT title,body,updated_at FROM community_threads WHERE id='visible'").get();
    assert.equal(updated.title, 'Edited title');
    assert.equal(updated.body, 'Edited body');
    assert.ok(updated.updated_at > 10);
    assert.equal(sql.prepare("SELECT COUNT(*) count FROM community_replies WHERE thread_id='visible'").get().count, 2);
  }));
void test('company and ticker search includes attached stocks, escaped text and only public posts', () => fixture(async(database,sql)=>{
  const {TOKENS}=await bundle("export {TOKENS} from './lib/tokens';");
  const insert=sql.prepare("INSERT INTO community_threads(id,member_id,topic,title,body,attachment_json,hidden,created_at,updated_at) VALUES(?,'b',?,?,?,?,?,100,100)");
  insert.run('chart','channel-technology','My thesis','Read this',JSON.stringify({kind:'chart',chart:{symbol:'MU',name:'Micron'}}),0);
  insert.run('portfolio','channel-market-talk','Allocation','',JSON.stringify({kind:'portfolio',rows:[{symbol:'MU',name:'Micron',percent:100}]}),0);
  insert.run('ticker','MU','Stock thesis','',null,0);
  insert.run('hidden-stock','MU','Secret','',null,1);
  insert.run('literal','channel-market-talk','100% certain','',null,0);
  insert.run('bad-json','channel-market-talk','Unrelated','', 'not-json',0);
  for(const search of ['Micron','MU','$MU']) {
    const results=await readCommunityThreads(database,url('?q='+encodeURIComponent(search)),null,TOKENS);
    assert.deepEqual(results.threads.map(t=>t.id).sort(),['chart','portfolio','ticker']);
  }
  assert.deepEqual((await readCommunityThreads(database,url('?q=%25'),null,TOKENS)).threads.map(t=>t.id),['literal']);
  assert.equal((await readCommunityThreads(database,url('?q='+encodeURIComponent("' OR 1=1 --")),null,TOKENS)).threads.length,0);
  await assert.rejects(readCommunityThreads(database,url('?q='+'a'.repeat(81)),null,TOKENS),e=>e.status===400);
  // Opening a post must not be blocked by the previous search phrase.
  assert.equal((await readCommunityThreads(database,url('?thread=chart&q=unrelated'),null,TOKENS)).threads[0].id,'chart');
}));
void test('Following is isolated to followed stocks and includes chart and portfolio attachments',()=>fixture(async(database,sql)=>{
  sql.exec("INSERT INTO community_follows(member_id,symbol) VALUES('a','MU'); DELETE FROM community_blocks;");
  const insert=sql.prepare("INSERT INTO community_threads(id,member_id,topic,title,body,attachment_json,created_at,updated_at) VALUES(?,'b',?,'Idea','',?,100,100)");
  insert.run('company','MU',null);
  insert.run('attached','channel-technology',JSON.stringify({chart:{symbol:'MU'}}));
  insert.run('allocation','channel-market-talk',JSON.stringify({rows:[{symbol:'MU'}]}));
  for(const feed of ['following','personal']) {
    assert.deepEqual((await readCommunityThreads(database,url('?feed='+feed),'a',[])).threads.map(t=>t.id).sort(),['allocation','attached','company']);
    assert.equal((await readCommunityThreads(database,url('?feed='+feed),'b',[])).threads.length,0);
    await assert.rejects(readCommunityThreads(database,url('?feed='+feed),null,[]),e=>e.status===401);
  }
}));
void test('retired Onchain Stocks posts and links appear under Market Talk without deleting history',()=>fixture(async(database,sql)=>{
  sql.exec("INSERT INTO community_threads(id,member_id,topic,title,body,created_at,updated_at) VALUES('legacy','b','channel-onchain-stocks','Custody','Question',100,100)");
  for(const topic of ['channel-onchain-stocks','channel-market-talk']) {
    const result=await readCommunityThreads(database,url('?topic='+topic),null,[]);
    assert.equal(result.threads[0].id,'legacy');assert.equal(result.threads[0].topic,'channel-market-talk');assert.equal(result.threads[0].room_name,'Market Talk');
  }
  assert.equal(sql.prepare("SELECT topic FROM community_threads WHERE id='legacy'").get().topic,'channel-onchain-stocks');
}));
