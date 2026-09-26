import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle } from './helpers/bundle.mjs';
const { translateCommunityContent, translationInput, needsTranslation, translationLanguage, translationLiterals, validateTranslationLiterals } = await bundle("export * from './lib/community-translation'; export * from './lib/translation';");
function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
  sql.exec(`INSERT INTO community_members(id,wallet_hash,alias,qualifying_symbol,verified_until,created_at) VALUES('a','a','Alice','MU',9999999999999,1),('b','b','Bob','MU',9999999999999,1);
    INSERT INTO community_threads(id,member_id,topic,title,body,hidden,created_at,updated_at) VALUES('post','a','general','A thought','I hold $MU at $100. I will not buy more.',0,1,1),('hidden','a','general','Secret','Private',1,1,1);
    INSERT INTO community_replies(id,thread_id,member_id,body,hidden,created_at) VALUES('reply','post','b','I agree.',0,1),('hidden-reply','hidden','b','I agree.',0,1);`);
  const database = { prepare(query) { return { bind(...args) { return {
    first: async () => sql.prepare(query).get(...args) ?? null,
    run: async () => ({ meta: { changes: sql.prepare(query).run(...args).changes } }),
  }; } }; } };
  return { sql, database };
}
const request = { type: 'thread', id: 'post', target: 'ko' };
const result = (title = '한 가지 생각', body = '저는 $MU를 $100에 보유하고 있습니다. 더 사지 않을 것입니다.') => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ title, body }) } }] });
void test('language follows device preference, not geography; same-language and ticker-only content stays original', () => {
  assert.equal(translationLanguage(null, 'ko-KR'), 'ko');
  assert.equal(translationLanguage('en', 'ko-KR'), 'en');
  assert.equal(translationLanguage('auto', 'fr-FR'), 'en');
  assert.equal(needsTranslation('I hold $MU.', 'ko'), true);
  assert.equal(needsTranslation('$MU 100', 'ko'), false);
  assert.equal(needsTranslation('MU 주식을 보유합니다.', 'ko'), false);
  assert.equal(needsTranslation('MU 주식을 보유합니다.', 'en'), true);
});
void test('translation preserves tickers, numbers, links and wallet identifiers and rejects invented/missing values', () => {
  const text = '$MU is $123.45, down -5%. https://float.xyz/path 6zGGkXABVt52pEvsLSvMokwJW9xwkoFX4Nw5UoFHFKmH';
  const literals = translationLiterals(text);
  assert.equal(validateTranslationLiterals(text, literals), text);
  assert.throws(() => validateTranslationLiterals(text.replace('$MU', ''), literals));
  assert.throws(() => validateTranslationLiterals(text + ' 500', literals));
  const prepared = translationInput({ title: 'A thought', body: 'I hold $MU at $100. I will not buy more.' }, 'ko');
  assert.match(prepared.decode(result()).body, /\$MU.*\$100/);
  assert.throws(() => prepared.decode({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }));
  assert.throws(() => prepared.decode(result('한 가지 생각', '저는 주식을 보유합니다.')));
});
void test('public translation uses stored content, shares cache, and edits invalidate the cached version', async () => {
  const f = fixture(); let calls = 0;
  try {
    const infer = async () => { calls++; return result(); };
    const first = await translateCommunityContent(f.database, infer, request, null);
    assert.match(first.body, /\$MU.*\$100/);
    await translateCommunityContent(f.database, infer, request, 'b');
    assert.equal(calls, 1);
    f.sql.prepare("UPDATE community_threads SET title='An edited thought' WHERE id='post'").run();
    await translateCommunityContent(f.database, infer, request, null);
    assert.equal(calls, 2);
    f.sql.prepare("UPDATE community_threads SET hidden=1 WHERE id='post'").run();
    await assert.rejects(translateCommunityContent(f.database, infer, request, null), e => e.status === 404);
    assert.equal(calls, 2);
  } finally { f.sql.close(); }
});
void test('hidden parents, blocked authors and missing posts never reach the model; replies translate independently', async () => {
  const f = fixture(); let calls = 0;
  try {
    const infer = async () => { calls++; return result('', '동의합니다.'); };
    for (const req of [{...request,id:'missing'}, {...request,id:'hidden'}, {type:'reply',id:'hidden-reply',target:'ko'}])
      await assert.rejects(translateCommunityContent(f.database, infer, req, null), e => e.status === 404);
    f.sql.exec("INSERT INTO community_blocks(blocker_id,blocked_id,created_at) VALUES('b','a',1)");
    await assert.rejects(translateCommunityContent(f.database, infer, request, 'b'), e => e.status === 404);
    assert.equal(calls, 0);
    assert.equal((await translateCommunityContent(f.database, infer, { type:'reply',id:'reply',target:'ko' }, null)).body, '동의합니다.');
  } finally { f.sql.close(); }
});
void test('in-flight duplicate requests, exhausted daily allowance and malformed translations fail without caching bad output', async () => {
  const f = fixture(); let finish;
  try {
    const pending = translateCommunityContent(f.database, () => new Promise(resolve => { finish = resolve; }), request, null);
    while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
    await assert.rejects(translateCommunityContent(f.database, async () => { throw Error('must not run'); }, request, null), e => e.status === 409);
    finish(result()); await pending;
    f.sql.exec('DELETE FROM community_translations; UPDATE translation_daily_usage SET units=8000');
    await assert.rejects(translateCommunityContent(f.database, async () => { throw Error('must not run'); }, request, null), e => e.status === 429);
    f.sql.exec('DELETE FROM translation_daily_usage');
    await assert.rejects(translateCommunityContent(f.database, async () => result('생각', '잘못된 번역'), request, null), e => e.status === 503);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM community_translations WHERE payload IS NOT NULL').get().n, 0);
    assert.ok(f.sql.prepare('SELECT units FROM translation_daily_usage').get().units > 0);
  } finally { f.sql.close(); }
});
void test('a post deleted during inference cannot be returned or cached', async () => {
  const f = fixture();
  try {
    await assert.rejects(translateCommunityContent(f.database, async () => {
      f.sql.prepare("UPDATE community_threads SET hidden=1 WHERE id='post'").run(); return result();
    }, request, null), e => e.status === 409);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM community_translations WHERE payload IS NOT NULL').get().n, 0);
  } finally { f.sql.close(); }
});
