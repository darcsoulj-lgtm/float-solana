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
let checks = 0,
  cookie = '';
async function call(
  path,
  body,
  { auth = false, status = 200, session = cookie } = {},
) {
  const r = await fetch(base + '/api/community/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      Cookie: auth ? '__sites_local_auth=1' : session,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify({ path, d }));
  checks++;
  return { d, r };
}
try {
  await writeFile(
    '.dev.vars',
    original + '\nSOLANA_RPC_URL=http://127.0.0.1:3999\n',
  );
  await writeFile(
    '.env',
    originalEnv + '\n# Community fixture ' + Date.now() + '\n',
  );
  await new Promise((r) => setTimeout(r, 4500));
  await call('threads', undefined, { status: 401 });
  await call(
    'threads',
    { title: 'No access', body: 'Cannot post as guest', topic: 'MU' },
    { status: 401 },
  );
  await call('moderation', undefined, { status: 401 });
  const c = (await call('challenge', { wallet, symbol: 'MU' })).d;
  await call(
    'verify',
    { challengeId: c.id, signature: Array(64).fill(0), consent: true },
    { status: 403 },
  );
  const signature = Array.from(
    ed25519.sign(new TextEncoder().encode(c.message), pair.secretKey),
  );
  const v = await call('verify', {
    challengeId: c.id,
    signature,
    consent: true,
  });
  cookie = v.r.headers.get('set-cookie').split(';')[0];
  assert.ok(v.r.headers.get('set-cookie').includes('HttpOnly'));
  checks++;
  await call(
    'verify',
    { challengeId: c.id, signature, consent: true },
    { status: 401 },
  );
  const m = (await call('status')).d.member;
  assert.equal(m.show_badge, 0);
  assert.equal(m.qualifying_symbol, 'MU');
  await call('profile', { alias: 'Curious Holder', showBadge: true });
  const t = (
    await call(
      'threads',
      {
        title: 'Cross ticker test',
        body: 'An MU holder can discuss SK Hynix here.',
        topic: 'SKHY',
      },
      { status: 201 },
    )
  ).d;
  let feed = (await call('threads?topic=SKHY')).d;
  assert.ok(feed.threads.some((x) => x.id === t.id && x.badge === 'MU'));
  assert.ok(!JSON.stringify(feed).includes(wallet));
  assert.ok(!JSON.stringify(feed).includes('wallet_hash'));
  checks += 3;
  const reply = (
    await call(
      'threads/' + t.id + '/replies',
      { body: 'Here is a different perspective.' },
      { status: 201 },
    )
  ).d;
  assert.ok(
    (await call('threads/' + t.id + '/replies')).d.replies.some(
      (x) => x.id === reply.id,
    ),
  );
  checks++;
  await call('threads/' + t.id + '/replies', undefined, {
    session: '',
    status: 401,
  });
  await call('reports', {
    type: 'thread',
    id: t.id,
    reason: 'Local moderation test report',
  });
  await call('moderation', undefined, { status: 401 });
  let mod = (await call('moderation', undefined, { auth: true })).d;
  const report = mod.reports.find((x) => x.target_id === t.id);
  assert.ok(report);
  checks++;
  await call(
    'moderation',
    { action: 'hide', type: 'thread', id: t.id },
    { auth: true },
  );
  assert.ok(!(await call('threads')).d.threads.some((x) => x.id === t.id));
  checks++;
  await call('threads/' + t.id + '/replies', undefined, { status: 404 });
  await call(
    'moderation',
    { action: 'restore', type: 'thread', id: t.id },
    { auth: true },
  );
  await call(
    'moderation',
    { action: 'resolve', id: report.id },
    { auth: true },
  );
  await call('replies/' + reply.id + '/remove', {});
  assert.equal(
    (await call('threads/' + t.id + '/replies')).d.replies.length,
    0,
  );
  checks++;
  await call('moderation', { action: 'suspend', id: m.id }, { auth: true });
  await call('threads', undefined, { status: 401 });
  await call(
    'moderation',
    { action: 'restore-member', id: m.id },
    { auth: true },
  );
  await call('threads', undefined, { status: 401 });
  balance = '0';
  const z = (await call('challenge', { wallet, symbol: 'MU' })).d;
  await call(
    'verify',
    {
      challengeId: z.id,
      signature: Array.from(
        ed25519.sign(new TextEncoder().encode(z.message), pair.secretKey),
      ),
      consent: true,
    },
    { status: 403 },
  );
  balance = '25000000';
  const fresh = (await call('challenge', { wallet, symbol: 'MU' })).d;
  const login = await call('verify', {
    challengeId: fresh.id,
    signature: Array.from(
      ed25519.sign(new TextEncoder().encode(fresh.message), pair.secretKey),
    ),
    consent: true,
  });
  cookie = login.r.headers.get('set-cookie').split(';')[0];
  await call('threads/' + t.id + '/remove', {});
  await call('logout', {});
  await call('threads', undefined, { status: 401 });
  console.log(
    checks +
      ' community checks passed: real signature + mock RPC, one-token cross-topic entry, persistent posts/replies, privacy, moderation, suspension, zero holding, replay and logout.',
  );
} finally {
  await writeFile('.dev.vars', original);
  await writeFile('.env', originalEnv);
  await new Promise((r) => server.close(r));
}
