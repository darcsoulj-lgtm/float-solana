import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dir = await mkdtemp(tmpdir() + '/holderpulse-test-');
for (const file of [
  'tokens',
  'validation',
  'solana',
  'community-types',
  'community-post',
  'editorial',
  'editorial-starter',
  'news-provider',
  'holder-news',
  'market-data',
  'avatar-image',
]) {
  const source = await readFile(
    new URL('../lib/' + file + '.ts', import.meta.url),
    'utf8',
  );
  const output = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replace(
      /from '\.\/(tokens|validation|community-types|community-post|editorial|editorial-starter|market-data)'/g,
      "from './$1.mjs'",
    );
  await writeFile(
    dir + '/' + file + '.mjs',
    output.replace(
      "'@noble/curves/ed25519.js'",
      JSON.stringify(
        pathToFileURL(require.resolve('@noble/curves/ed25519.js')).href,
      ),
    ),
  );
}
const { validateSurvey, validateAnswers, cohortFor, canTransition } =
  await import(pathToFileURL(dir + '/validation.mjs'));
const {
  decodeBase58,
  validWallet,
  verifySignature,
  verifyHolding,
  detectHoldings,
  displayTokenAmount,
} = await import(pathToFileURL(dir + '/solana.mjs'));
const { TOKENS, BACKPACK_TOKENS, TOKEN_PROGRAMS } = await import(
  pathToFileURL(dir + '/tokens.mjs')
);
const { communityPostErrors } = await import(
  pathToFileURL(dir + '/community-post.mjs')
);
test('Discussion validation identifies every invalid field before submission', () => {
  assert.deepEqual(
    Object.keys(communityPostErrors({ title: '', body: '', topic: 'all' })),
    ['topic', 'title'],
  );
  assert.deepEqual(
    communityPostErrors({
      title: 'A real question',
      body: 'Here is my perspective.',
      topic: 'general',
    }),
    {},
  );
});
test('Discussion validation uses trimmed lengths and accepts every available room', () => {
  for (const topic of ['general', ...TOKENS.map((t) => t.symbol)])
    assert.deepEqual(
      communityPostErrors({ title: ' 12345 ', body: ' 1234567890 ', topic }),
      {},
    );
  for (const title of ['     ', null, 12345, 'x'.repeat(141)])
    assert.ok(
      communityPostErrors({ title, body: 'A valid perspective', topic: 'MU' })
        .title,
    );
  for (const body of [undefined, {}, 'x'.repeat(4001)])
    assert.ok(
      communityPostErrors({ title: 'Valid title', body, topic: 'MU' }).body,
    );
});
const good = {
  title: 'A valid research question',
  description: 'This is a detailed research study brief.',
  symbol: 'MU',
  target: 100,
  rewardCents: 0,
  questions: [
    { type: 'single', prompt: 'Which matters most?', options: ['A', 'B'] },
  ],
};
test('Valid survey is normalized and question IDs are server-owned', () => {
  const r = validateSurvey(good);
  assert.equal(r.questions[0].id, 'q1');
});
test('Reject arbitrary mints, unsupported symbols, invalid targets and duplicate options', () => {
  for (const b of [
    { ...good, symbol: 'FAKE' },
    { ...good, target: NaN },
    { ...good, target: -1 },
    { ...good, rewardCents: 10001 },
    {
      ...good,
      questions: [
        { type: 'single', prompt: 'Invalid choice', options: ['same', 'same'] },
      ],
    },
  ])
    assert.throws(() => validateSurvey(b));
});
test('Answers require exact questions and valid options', () => {
  const q = validateSurvey(good).questions;
  assert.deepEqual(validateAnswers(q, { q1: 'A' }), { q1: 'A' });
  for (const a of [{}, { q1: 'C' }, { q1: 'A', fake: 'B' }])
    assert.throws(() => validateAnswers(q, a));
});
test('Integer cohorts preserve fractional holdings and boundaries', () => {
  assert.equal(cohortFor(1n, 6), 'Under 10 tokens');
  assert.equal(cohortFor(10000000n, 6), '10–99 tokens');
  assert.equal(cohortFor(100000000n, 6), '100+ tokens');
  assert.throws(() => cohortFor(0n, 6));
});
test('Researchers cannot self-publish or reopen closed studies', () => {
  assert.ok(canTransition('draft', 'pending', false));
  assert.ok(!canTransition('pending', 'active', false));
  assert.ok(canTransition('pending', 'active', true));
  assert.ok(!canTransition('closed', 'active', true));
});
test('Base58 wallet validation rejects malformed values', () => {
  assert.equal(decodeBase58('11111111111111111111111111111111').length, 32);
  assert.throws(() => validWallet('not-a-wallet'));
  for (const t of TOKENS.filter((t) => t.mint))
    assert.equal(validWallet(t.mint), t.mint);
});
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode(b) {
  let n = BigInt('0x' + Buffer.from(b).toString('hex')),
    s = '';
  while (n > 0) {
    s = alphabet[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const x of b) {
    if (x !== 0) break;
    s = '1' + s;
  }
  return s;
}
test('Ed25519 signatures bind both message and wallet', async () => {
  const pair = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey),
    wallet = encode(new Uint8Array(raw)),
    message = 'HolderPulse survey nonce';
  const signature = Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        'Ed25519',
        pair.privateKey,
        new TextEncoder().encode(message),
      ),
    ),
  );
  await verifySignature(wallet, message, signature);
  await assert.rejects(
    verifySignature(wallet, message + 'tampered', signature),
  );
  await assert.rejects(verifySignature(wallet, message, [1]));
});
const wallet = '11111111111111111111111111111111',
  mint = TOKENS[0].mint;
function mock(accounts, { program = TOKEN_PROGRAMS[1], error = false } = {}) {
  const calls = [];
  const fetcher = async (_, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    if (error) return new Response('unavailable', { status: 429 });
    return Response.json({
      result:
        body.method === 'getAccountInfo'
          ? {
              context: { slot: 123 },
              value: {
                owner: program,
                data: {
                  parsed: {
                    type: 'mint',
                    info: { decimals: 6, isInitialized: true },
                  },
                },
              },
            }
          : {
              context: { slot: 125 },
              value: accounts.map((a) => ({
                account: {
                  owner: TOKEN_PROGRAMS[1],
                  data: {
                    parsed: {
                      type: 'account',
                      info: {
                        owner: wallet,
                        mint,
                        state: 'initialized',
                        tokenAmount: { amount: a.amount || '1', decimals: 6 },
                        ...a,
                      },
                    },
                  },
                },
              })),
            },
    });
  };
  return { fetcher, calls };
}
test('Finalized RPC aggregates all owned Token-2022 accounts with integer balances', async () => {
  const m = mock([{ amount: '9000000' }, { amount: '2000000' }]);
  const r = await verifyHolding(wallet, 'MU', 'https://rpc.test', m.fetcher);
  assert.equal(r.cohort, '10–99 tokens');
  assert.equal(r.slot, 125);
  assert.equal(m.calls[1].params[2].commitment, 'finalized');
  assert.equal(m.calls[1].params[2].minContextSlot, 123);
  assert.ok(!('amount' in r));
});
test('Wrong owner or mint accounts do not qualify', async () => {
  const m = mock([{ owner: TOKENS[1].mint }, { mint: TOKENS[1].mint }]);
  await assert.rejects(
    verifyHolding(wallet, 'MU', 'https://rpc.test', m.fetcher),
    /does not currently hold/,
  );
});
test('RPC and invalid program errors fail closed', async () => {
  for (const options of [{ error: true }, { program: 'fake' }]) {
    const m = mock([], options);
    await assert.rejects(
      verifyHolding(wallet, 'MU', 'https://rpc.test', m.fetcher),
    );
  }
});

test('Small-order public keys cannot authenticate with zero signatures', async () => {
  await assert.rejects(
    verifySignature(
      '11111111111111111111111111111111',
      'any message',
      Array(64).fill(0),
    ),
  );
});

test('Transient RPC errors retry once and recover', async () => {
  const good = mock([{ amount: '1' }]);
  let calls = 0;
  const fetcher = async (...args) =>
    ++calls === 1 ? new Response('', { status: 429 }) : good.fetcher(...args);
  await verifyHolding(wallet, 'MU', 'https://fixture.invalid', fetcher);
  assert.equal(calls, 3);
});
test('Provider authorization rejection is not described as busy or retried', async () => {
  let calls = 0;
  await assert.rejects(
    verifyHolding(wallet, 'MU', 'https://fixture.invalid', async () => {
      calls++;
      return new Response('', { status: 403 });
    }),
    /connection was rejected/,
  );
  assert.equal(calls, 1);
});
test('Malformed provider JSON fails with a controlled service error', async () => {
  await assert.rejects(
    verifyHolding(
      wallet,
      'MU',
      'https://fixture.invalid',
      async () => new Response('not JSON'),
    ),
    /unreadable response/,
  );
});

test('Reviewed registry includes every enabled Solana security from the captured official source', async () => {
  const evidence = JSON.parse(
    await readFile(
      new URL('../docs/token-registry-review.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(BACKPACK_TOKENS.length, 41);
  assert.equal(
    new Set(BACKPACK_TOKENS.map((t) => t.mint)).size,
    BACKPACK_TOKENS.length,
  );
  assert.deepEqual(
    BACKPACK_TOKENS.map((t) => [t.symbol, t.mint]),
    evidence.tokens.map((t) => [t.symbol, t.mint]),
  );
  for (const t of BACKPACK_TOKENS) {
    assert.equal(decodeBase58(t.mint).length, 32);
    assert.equal(
      validateSurvey({ ...good, symbol: t.symbol }).symbol,
      t.symbol,
    );
  }
  assert.ok(BACKPACK_TOKENS.find((t) => t.symbol === 'SPCX')?.mint);
});
test('Wallet client does not request transaction signing or sending', async () => {
  for (const file of ['community', 'participant']) {
    const source = await readFile(
      new URL('../components/' + file + '.tsx', import.meta.url),
      'utf8',
    );
    assert.ok(source.includes('signMessage'));
    assert.doesNotMatch(
      source,
      /signTransaction|signAllTransactions|signAndSendTransaction|sendTransaction/,
    );
  }
});

test('Every supported stock verifies only against its exact registry mint', async () => {
  for (const token of TOKENS) {
    const fixture = mock([{ mint: token.mint, amount: '1' }]);
    await verifyHolding(
      wallet,
      token.symbol,
      'https://fixture.invalid',
      fixture.fetcher,
    );
    assert.equal(fixture.calls[0].params[0], token.mint);
    assert.equal(fixture.calls[1].params[1].mint, token.mint);
  }
});

function discoveryMock({
  assets = [
    { mint: TOKENS[0].mint, amount: '1', program: TOKEN_PROGRAMS[0] },
    { mint: TOKENS[1].mint, amount: '2', program: TOKEN_PROGRAMS[1] },
  ],
  failProgram = '',
  invalidMint = false,
  amountOverride,
  malformed = false,
} = {}) {
  const calls = [];
  return {
    calls,
    fetcher: async (_, opts) => {
      const b = JSON.parse(opts.body);
      calls.push(b);
      if (b.method === 'getTokenAccountsByOwner') {
        if (b.params[1].programId === failProgram)
          return new Response('', { status: 403 });
        if (malformed)
          return Response.json({
            result: { context: { slot: 100 }, value: null },
          });
        return Response.json({
          result: {
            context: { slot: 100 },
            value: assets
              .filter((a) => a.program === b.params[1].programId)
              .map((a, i) => ({
                pubkey: a.mint + i,
                account: {
                  owner: a.program,
                  data: {
                    parsed: {
                      type: 'account',
                      info: {
                        mint: a.mint,
                        owner: a.owner || wallet,
                        state: 'initialized',
                        tokenAmount: {
                          amount: amountOverride ?? a.amount,
                          decimals: 6,
                        },
                      },
                    },
                  },
                },
              })),
          },
        });
      }
      assert.equal(b.method, 'getMultipleAccounts');
      return Response.json({
        result: {
          context: { slot: 102 },
          value: b.params[0].map((mint) => ({
            owner: invalidMint
              ? 'fake'
              : assets.find((a) => a.mint === mint).program,
            data: {
              parsed: {
                type: 'mint',
                info: { decimals: 6, isInitialized: true },
              },
            },
          })),
        },
      });
    },
  };
}
test('Automatic discovery scans both programs and returns only verified supported symbols', async () => {
  const fixture = discoveryMock({
    assets: [
      { mint: TOKENS[0].mint, amount: '1', program: TOKEN_PROGRAMS[0] },
      { mint: TOKENS[1].mint, amount: '1', program: TOKEN_PROGRAMS[1] },
      { mint: TOKENS[2].mint, amount: '0', program: TOKEN_PROGRAMS[1] },
      { mint: wallet, amount: '100000000', program: TOKEN_PROGRAMS[0] },
    ],
  });
  const result = await detectHoldings(
    wallet,
    'https://fixture.invalid',
    fixture.fetcher,
  );
  assert.deepEqual(
    result.map((h) => h.symbol).sort(),
    TOKENS.slice(0, 2)
      .map((t) => t.symbol)
      .sort(),
  );
  assert.equal(fixture.calls.length, 3);
  assert.deepEqual(
    fixture.calls.slice(0, 2).map((c) => c.params[1].programId),
    TOKEN_PROGRAMS,
  );
  assert.equal(fixture.calls[2].params[1].minContextSlot, 100);
  assert.deepEqual(Object.keys(result[0]).sort(), [
    'slot',
    'symbol',
    'verifiedAt',
  ]);
  assert.ok(!JSON.stringify(result).includes(wallet));
});
test('Discovery distinguishes a truly empty wallet from a failed or malformed program scan', async () => {
  const empty = discoveryMock({ assets: [] });
  assert.deepEqual(
    await detectHoldings(wallet, 'https://fixture.invalid', empty.fetcher),
    [],
  );
  assert.equal(empty.calls.length, 2);
  for (const options of [
    { failProgram: TOKEN_PROGRAMS[1] },
    { malformed: true },
  ]) {
    const fixture = discoveryMock(options);
    await assert.rejects(
      detectHoldings(wallet, 'https://fixture.invalid', fixture.fetcher),
      (e) => e.status === 503,
    );
  }
});
test('Discovery fails closed on invalid mint, malformed amount, and account ownership mismatch', async () => {
  for (const options of [
    { invalidMint: true },
    { amountOverride: '-1' },
    { amountOverride: '18446744073709551616' },
    {
      assets: [
        {
          mint: TOKENS[0].mint,
          program: TOKEN_PROGRAMS[0],
          amount: '1',
          owner: TOKENS[0].mint,
        },
      ],
    },
  ]) {
    const fixture = discoveryMock(options);
    await assert.rejects(
      detectHoldings(wallet, 'https://fixture.invalid', fixture.fetcher),
      (e) => e.status === 503,
    );
  }
});

const { validateEditorial, canonicalSource, dateValue, eventLabel } =
  await import(pathToFileURL(dir + '/editorial.mjs'));
const { STARTER_CONTENT } = await import(
  pathToFileURL(dir + '/editorial-starter.mjs')
);
test('Reviewed starter stories and events satisfy the real publishing contract', () => {
  for (const item of STARTER_CONTENT)
    assert.ok(validateEditorial(item, Date.parse('2026-09-11T00:00:00Z')));
});
test('Source normalization removes tracking and rejects unsafe links', () => {
  assert.equal(
    canonicalSource(
      'https://example.com/news/story?utm_a=1&utm_b=2&gclid=3#part',
    ),
    'https://example.com/news/story',
  );
  for (const url of [
    'javascript:alert(1)',
    'http://example.com',
    'https://user:pass@example.com',
    'https://127.0.0.1/private',
  ])
    assert.throws(() => canonicalSource(url));
});
test('Editorial rules reject invalid dates, unsupported tags and ambiguous timestamps', () => {
  for (const day of ['2026-02-30', '2026-13-01', 'yesterday'])
    assert.throws(() => dateValue(day));
  for (const changes of [
    { symbols: ['FAKE'] },
    { status: 'approved' },
    { published_date: '2099-01-01' },
    {
      kind: 'event',
      event_date: '2026-09-30',
      event_at: '2026-10-01T01:00:00Z',
    },
  ])
    assert.throws(() =>
      validateEditorial({ ...STARTER_CONTENT[0], ...changes }),
    );
});
test('Calendar times convert across days; date-only events do not shift', () => {
  const timed = {
    event_at: Date.parse('2026-09-30T20:30:00Z'),
    event_date: '2026-09-30',
  };
  assert.match(eventLabel(timed, 'Asia/Seoul'), /Oct 1/);
  assert.match(eventLabel(timed, 'America/Denver'), /Sep 30/);
  const dateOnly = { ...timed, event_at: null };
  assert.equal(
    eventLabel(dateOnly, 'Asia/Seoul'),
    eventLabel(dateOnly, 'America/Los_Angeles'),
  );
  assert.match(eventLabel(dateOnly), /Time not announced/);
});

const { fetchNewsDrafts, persistNewsDrafts } = await import(
  pathToFileURL(dir + '/news-provider.mjs')
);
test('News adapter requires credentials and a reviewed stock mapping without making requests', async () => {
  const unreachable = () => {
    throw new Error('Must not fetch');
  };
  await assert.rejects(
    fetchNewsDrafts(undefined, 'MU', unreachable),
    /not connected/,
  );
  await assert.rejects(
    fetchNewsDrafts('fixture', 'SKHY', unreachable),
    /reviewed/,
  );
});
test('News adapter keeps exact ticker matches, original links and publication dates', async () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  const story = {
    id: 123,
    title: 'Micron announces company update',
    url: 'https://www.benzinga.com/news/26/09/123/micron-update?utm_source=test',
    created: '2026-09-10T12:00:00Z',
    stocks: [{ name: 'MU' }],
  };
  const fetcher = async (url, options) => {
    assert.equal(url.searchParams.get('tickers'), 'MU');
    assert.equal(url.searchParams.get('displayOutput'), 'headline');
    assert.equal(options.redirect, 'manual');
    return Response.json([
      story,
      story,
      { ...story, id: 124, stocks: [{ name: 'NVDA' }] },
      { ...story, id: 125, url: 'https://benzinga.com/' },
      { ...story, id: 126, url: 'https://benzinga.com.evil.invalid/story' },
      { ...story, id: 127, created: '2026-09-12' },
      { ...story, id: 128, created: '2026-01-01' },
      { ...story, id: 129, created: 'invalid' },
    ]);
  };
  assert.deepEqual(await fetchNewsDrafts('fixture', 'MU', fetcher, now), [
    {
      id: 'benzinga-123',
      title: story.title,
      url: 'https://www.benzinga.com/news/26/09/123/micron-update',
      publishedAt: Date.parse(story.created),
      symbol: 'MU',
    },
  ]);
});
test('Provider failures are actionable and never expose the API key', async () => {
  await assert.rejects(
    fetchNewsDrafts('secret-fixture', 'MU', async () => {
      throw new Error('secret-fixture');
    }),
    (e) => !e.message.includes('secret-fixture') && /reached/.test(e.message),
  );
  await assert.rejects(
    fetchNewsDrafts(
      'fixture',
      'MU',
      async () => new Response('', { status: 403 }),
    ),
    /permissions/,
  );
  await assert.rejects(
    fetchNewsDrafts('fixture', 'MU', async () =>
      Response.json({ error: 'bad' }),
    ),
    /unexpected/,
  );
});
test('Editorial sources reject homepages and generic company news indexes', () => {
  for (const path of [
    '/',
    '/default.aspx',
    '/news',
    '/investor-relations',
    '/events-and-presentations/default.aspx',
  ])
    assert.throws(
      () => canonicalSource('https://investors.example.com' + path),
      /specific article/,
    );
});

test('Imported drafts persist idempotently and preserve reviewed or archived records', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(':memory:');
  database.exec(
    await readFile(
      new URL('../drizzle/0003_lumpy_emma_frost.sql', import.meta.url),
      'utf8',
    ),
  );
  database.exec(
    "ALTER TABLE editorial_items ADD coverage TEXT NOT NULL DEFAULT 'direct'",
  );
  const d1 = {
    prepare: (sql) => ({ bind: (...values) => ({ sql, values }) }),
    batch: async (statements) => {
      database.exec('BEGIN');
      try {
        const results = statements.map((s) => ({
          meta: database.prepare(s.sql).run(...s.values),
        }));
        database.exec('COMMIT');
        return results;
      } catch (e) {
        database.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const draft = {
    id: 'benzinga-123',
    title: 'Micron company announcement',
    url: 'https://www.benzinga.com/news/123/micron',
    publishedAt: 123456,
    symbol: 'MU',
  };
  assert.equal(await persistNewsDrafts(d1, [draft]), 1);
  assert.equal(
    database.prepare('SELECT status FROM editorial_items').get().status,
    'draft',
  );
  assert.equal(
    database.prepare('SELECT published_at FROM editorial_items').get()
      .published_at,
    123456,
  );
  assert.equal(
    database.prepare('SELECT symbol FROM editorial_tags').get().symbol,
    'MU',
  );
  database.exec(
    "UPDATE editorial_items SET title='Reviewed headline',status='archived'",
  );
  assert.equal(
    await persistNewsDrafts(d1, [
      { ...draft, title: 'Changed provider title', symbol: 'SKHY' },
    ]),
    0,
  );
  assert.equal(
    database.prepare('SELECT title FROM editorial_items').get().title,
    'Reviewed headline',
  );
  assert.equal(
    database.prepare('SELECT status FROM editorial_items').get().status,
    'archived',
  );
  assert.equal(
    database.prepare('SELECT count(*) n FROM editorial_tags').get().n,
    1,
  );
  assert.equal(
    await persistNewsDrafts(d1, [{ ...draft, id: 'benzinga-456' }]),
    0,
  );
  assert.equal(
    database.prepare('SELECT count(*) n FROM editorial_items').get().n,
    1,
  );
  database.close();
});

test('One-character discussions and title-only discussions are allowed', () => {
  assert.deepEqual(
    communityPostErrors({ title: '?', body: '', topic: 'general' }),
    {},
  );
  assert.deepEqual(
    communityPostErrors({ title: 'a', body: 'b', topic: 'MU' }),
    {},
  );
});
test('Exact token formatting handles issuer multipliers and future changes', () => {
  assert.equal(displayTokenAmount('25000000', 6, []), '25');
  assert.equal(
    displayTokenAmount('18446744073709551615', 6, []),
    '18446744073709.551615',
  );
  const extensions = [
    {
      extension: 'scaledUiAmountConfig',
      state: {
        multiplier: '1.25',
        newMultiplier: '2',
        newMultiplierEffectiveTimestamp: 200,
      },
    },
  ];
  assert.equal(displayTokenAmount('25000000', 6, extensions, 100000), '31.25');
  assert.equal(displayTokenAmount('25000000', 6, extensions, 200000), '50');
  assert.equal(displayTokenAmount('1', 6, extensions, 200000), '0.000002');
  assert.equal(
    displayTokenAmount('1', 6, [
      { extension: 'scaledUiAmountConfig', state: { multiplier: 'garbage' } },
    ]),
    null,
  );
});
const { parseHeadlines, fetchHeadlines, companyAliases, NEWS_WINDOW_MS } =
  await import(pathToFileURL(dir + '/holder-news.mjs'));
test('Headline parsing rejects stale, future, unrelated and unsafe stories and deduplicates links', () => {
  const now = Date.parse('2026-09-11T12:00:00Z');
  const item = (
    title,
    date,
    url = 'https://reuters.com/business/micron-update',
  ) =>
    `<item><title>${title}</title><pubDate>${new Date(date).toUTCString()}</pubDate><link>${url}</link></item>`;
  const xml =
    '<rss><channel>' +
    [
      item('Micron results', now - 1000),
      item('Micron results', now - 1000),
      item('NVIDIA results', now - 1000),
      item('Micron old', now - NEWS_WINDOW_MS - 1000),
      item('Micron future', now + 1000),
      item('Micron fake', now - 1000, 'javascript:alert(1)'),
      item('Micron private', now - 1000, 'https://127.0.0.1/a'),
    ].join('') +
    '</channel></rss>';
  const rows = parseHeadlines(xml, 'MU', now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].publisher, 'Reuters');
  assert.throws(() => parseHeadlines('<!DOCTYPE rss><rss/>', 'MU', now));
  assert.equal(
    parseHeadlines(
      '<rss><item><title>SPCX ETF news</title><pubDate>Fri, 11 Sep 2026 10:00:00 GMT</pubDate><link>https://finance.yahoo.com/news/etf-story</link></item></rss>',
      'SPCX',
      now,
    ).length,
    0,
  );
});
test('Every supported token receives an automatic company-matched feed candidate', async () => {
  for (const t of TOKENS) {
    let called = false;
    const now = Date.now();
    const rows = await fetchHeadlines(
      t.symbol,
      async (url, options) => {
        called = true;
        assert.equal(new URL(url).hostname, 'feeds.finance.yahoo.com');
        assert.equal(
          options.redirect,
          'manual',
          'Must use the Workers-supported redirect policy',
        );
        assert.equal(
          new URL(url).searchParams.get('s'),
          t.underlyingSymbol.replace('/', '-'),
        );
        return new Response(
          `<rss><item><title>${companyAliases(t.symbol)[0]} update</title><pubDate>${new Date(now - 1000).toUTCString()}</pubDate><link>https://finance.yahoo.com/news/company-update</link></item></rss>`,
        );
      },
      now,
    );
    assert.ok(called);
    assert.equal(rows.length, 1, t.symbol);
  }
});
test('Headline transport rejects redirects and upstream failures without following links', async () => {
  for (const status of [301, 302, 307, 403, 429, 503]) {
    let calls = 0;
    await assert.rejects(
      fetchHeadlines('MU', async (_url, options) => {
        calls++;
        assert.equal(options.redirect, 'manual');
        return new Response(null, {
          status,
          headers: { Location: 'https://example.com/redirect' },
        });
      }),
      new RegExp('HTTP ' + status),
    );
    assert.equal(calls, 1);
  }
});
test('Captured live feeds contain directly matched news for MU, SPCX and newly added stocks', async () => {
  for (const [symbol, file] of [
    ['MU', 'mu'],
    ['SPCX', 'SPCX'],
    ['DNUT', 'DNUT'],
    ['GRND', 'GRND'],
    ['SKHY', '000660.KS'],
  ]) {
    const xml = await readFile(
      new URL('../research/news-26/yahoo-' + file + '.xml', import.meta.url),
      'utf8',
    );
    const items = parseHeadlines(
      xml,
      symbol,
      Date.parse('2026-09-11T12:00:00Z'),
    );
    assert.ok(items.length > 0, symbol);
    assert.ok(items.every((n) => n.symbols[0] === symbol));
  }
});

test('Headline rate limits retain the provider retry delay for the shared cache', async () => {
  await assert.rejects(
    fetchHeadlines(
      'MU',
      async () =>
        new Response(null, {
          status: 429,
          headers: { 'Retry-After': '600' },
        }),
    ),
    (error) => error.retryAfterMs === 600000,
  );
});

test('Profile JPEG validation accepts a real small image and rejects fake or oversized content', async () => {
  const { validAvatarJpeg } = await import(
    pathToFileURL(dir + '/avatar-image.mjs')
  );
  const bytes = new Uint8Array(
    await readFile(new URL('./fixtures/avatar.jpg', import.meta.url)),
  );
  assert.equal(validAvatarJpeg(bytes), true);
  assert.equal(validAvatarJpeg(new TextEncoder().encode('<svg/>')), false);
  assert.equal(validAvatarJpeg(new Uint8Array(100001)), false);
  const fake = new Uint8Array(100);
  fake.set([255, 216, 255]);
  fake[98] = 255;
  fake[99] = 217;
  assert.equal(validAvatarJpeg(fake), false);
});

test('Multi-issuer registry keeps exact mints unique and existing Backpack identities stable', () => {
  assert.equal(TOKENS.length, new Set(TOKENS.map((t) => t.mint)).size);
  assert.equal(TOKENS.length, new Set(TOKENS.map((t) => t.symbol)).size);
  for (const symbol of ['MU', 'MUx', 'MUon']) {
    const t = TOKENS.find((t) => t.symbol === symbol);
    assert.ok(t, symbol);
    assert.equal(t.underlyingSymbol, 'MU');
  }
  assert.equal(
    new Set(
      ['MU', 'MUx', 'MUon'].map((s) => TOKENS.find((t) => t.symbol === s).mint),
    ).size,
    3,
  );
  assert.ok(
    TOKENS.every(
      (t) => t.issuer && t.source.startsWith('https://') && t.underlyingSymbol,
    ),
  );
});
test('Mixed-issuer wallet with over 100 holdings validates every mint in bounded RPC requests', async () => {
  const selected = [
    ...TOKENS.filter((t) => t.issuer === 'backpack').slice(0, 2),
    ...TOKENS.filter((t) => t.issuer === 'ondo').slice(0, 55),
    ...TOKENS.filter((t) => t.issuer === 'xstocks').slice(0, 60),
  ];
  const fixture = discoveryMock({
    assets: selected.map((t) => ({
      mint: t.mint,
      amount: '1',
      program: TOKEN_PROGRAMS[1],
    })),
  });
  const result = await detectHoldings(
    wallet,
    'https://fixture.invalid',
    fixture.fetcher,
  );
  assert.deepEqual(
    result.map((h) => h.symbol).sort(),
    selected.map((t) => t.symbol).sort(),
  );
  const checks = fixture.calls.filter(
    (c) => c.method === 'getMultipleAccounts',
  );
  assert.deepEqual(
    checks.map((c) => c.params[0].length),
    [100, 17],
  );
  assert.ok(result.every((h) => !('rawAmount' in h)));
});
