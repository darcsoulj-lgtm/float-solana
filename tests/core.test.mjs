import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dir = await mkdtemp(tmpdir() + '/holderpulse-test-');
for (const file of ['tokens', 'validation', 'solana']) {
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
    .outputText.replace(/from '\.\/(tokens|validation)'/g, "from './$1.mjs'");
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
const { decodeBase58, validWallet, verifySignature, verifyHolding } =
  await import(pathToFileURL(dir + '/solana.mjs'));
const { TOKENS, TOKEN_PROGRAMS } = await import(
  pathToFileURL(dir + '/tokens.mjs')
);
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
