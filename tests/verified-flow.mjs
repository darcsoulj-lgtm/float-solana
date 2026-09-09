// Local integration fixture only: never configure this RPC in a hosted environment.
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { ed25519 } from '@noble/curves/ed25519.js';
const base = 'http://localhost:3000',
  mint = 'MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1',
  program = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const pair = ed25519.keygen();
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n = BigInt('0x' + Buffer.from(pair.publicKey).toString('hex')),
  wallet = '';
while (n) {
  wallet = alphabet[Number(n % 58n)] + wallet;
  n /= 58n;
}
for (const b of pair.publicKey) {
  if (b !== 0) break;
  wallet = '1' + wallet;
}
let balance = '25000000',
  rpcCalls = 0;
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const b = JSON.parse(raw);
  rpcCalls++;
  let result;
  if (b.method === 'getAccountInfo')
    result = {
      context: { slot: 100 },
      value: {
        owner: program,
        data: {
          parsed: { type: 'mint', info: { decimals: 6, isInitialized: true } },
        },
      },
    };
  else
    result = {
      context: { slot: 102 },
      value:
        b.params[0] === wallet
          ? [
              {
                account: {
                  owner: program,
                  data: {
                    parsed: {
                      type: 'account',
                      info: {
                        owner: wallet,
                        mint,
                        state: 'initialized',
                        tokenAmount: { amount: balance, decimals: 6 },
                      },
                    },
                  },
                },
              },
            ]
          : [],
    };
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ jsonrpc: '2.0', id: b.id, result }));
});
await new Promise((r) => server.listen(3999, '127.0.0.1', r));
const original = await readFile('.dev.vars', 'utf8'),
  originalEnv = await readFile('.env', 'utf8');
let assertions = 0;
async function call(path, body, { auth = false, status = 200 } = {}) {
  const r = await fetch(base + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(auth ? { Cookie: '__sites_local_auth=1' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify({ path, d }));
  assertions++;
  return d;
}
try {
  await writeFile(
    '.dev.vars',
    original + '\nSOLANA_RPC_URL=http://127.0.0.1:3999\n',
  );
  await writeFile('.env', originalEnv + '\n# RPC fixture ' + Date.now() + '\n');
  await new Promise((r) => setTimeout(r, 4000));
  const s = await call(
    'surveys',
    {
      title: 'Verified flow local fixture ' + Date.now(),
      description:
        'A local fixture with mock Solana RPC and real wallet cryptography.',
      symbol: 'MU',
      target: 5,
      rewardCents: 100,
      questions: [
        {
          prompt: 'What matters most?',
          type: 'single',
          options: ['Earnings', 'Valuation'],
        },
      ],
    },
    { auth: true, status: 201 },
  );
  const id = s.id;
  await call(
    `surveys/${id}/edit`,
    {
      title: 'Edited fixture ' + Date.now(),
      description:
        'A local fixture with mock Solana RPC and real wallet cryptography.',
      symbol: 'MU',
      target: 5,
      rewardCents: 100,
      questions: [
        {
          prompt: 'What matters most?',
          type: 'single',
          options: ['Earnings', 'Valuation'],
        },
      ],
    },
    { auth: true },
  );
  await call(`surveys/${id}/status`, { status: 'pending' }, { auth: true });
  await call(`surveys/${id}/status`, { status: 'active' }, { auth: true });
  async function proof() {
    const c = await call(`surveys/${id}/challenge`, { wallet });
    const signature = Array.from(
      ed25519.sign(new TextEncoder().encode(c.message), pair.secretKey),
    );
    const p = await call(`surveys/${id}/verify`, {
      challengeId: c.id,
      signature,
    });
    await call(
      `surveys/${id}/verify`,
      { challengeId: c.id, signature },
      { status: 401 },
    );
    return p.proof;
  }
  const first = await proof();
  balance = '0';
  await call(
    `surveys/${id}/respond`,
    { proof: first, answers: { q1: 'Earnings' }, consent: true },
    { status: 403 },
  );
  balance = '25000000';
  const saved = await call(
    `surveys/${id}/respond`,
    { proof: first, answers: { q1: 'Earnings' }, consent: true },
    { status: 201 },
  );
  assert.equal(saved.claimStatus, 'unfunded');
  await call(
    `surveys/${id}/respond`,
    { proof: first, answers: { q1: 'Earnings' }, consent: true },
    { status: 401 },
  );
  const c = await call(`surveys/${id}/challenge`, { wallet });
  await call(
    `surveys/${id}/verify`,
    {
      challengeId: c.id,
      signature: Array.from(
        ed25519.sign(new TextEncoder().encode(c.message), pair.secretKey),
      ),
    },
    { status: 409 },
  );
  const a = await call(`surveys/${id}/analytics`, undefined, { auth: true });
  assert.equal(a.count, 1);
  assert.equal(a.questions[0].distribution[0].count, 1);
  assert.equal(a.cohortsSuppressed, true);
  assert.ok(!JSON.stringify(a).includes(wallet));
  assert.ok(!JSON.stringify(a).includes('wallet_hash'));
  assert.ok(rpcCalls >= 8);
  await call(`surveys/${id}/claim`, { responseId: saved.id }, { status: 503 });
  await call(`surveys/${id}/status`, { status: 'closed' }, { auth: true });
  console.log(
    `${assertions} verified-flow requests passed: real signatures, mocked holdings, replay rejection, balance recheck, duplicate-wallet rejection, persisted analytics, and no unfunded payout.`,
  );
} finally {
  await writeFile('.dev.vars', original);
  await writeFile('.env', originalEnv);
  await new Promise((r) => server.close(r));
}
