// Local integration fixture only: never configure this RPC in a hosted environment.
import http from 'node:http';
import { profileNewsFlow } from './profile-news-flow.mjs';
import { marketFlow } from './market-flow.mjs';
import { editorialFlow } from './editorial-flow.mjs';
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
const secondPair = ed25519.keygen();
let secondNumber = BigInt(
    '0x' + Buffer.from(secondPair.publicKey).toString('hex'),
  ),
  secondWallet = '';
while (secondNumber) {
  secondWallet = alphabet[Number(secondNumber % 58n)] + secondWallet;
  secondNumber /= 58n;
}
for (const byte of secondPair.publicKey) {
  if (byte !== 0) break;
  secondWallet = '1' + secondWallet;
}
let spcxHeld = false,
  rpcFailure = false;
let balance = '25000000',
  rpcCalls = 0;
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const b = JSON.parse(raw);
  rpcCalls++;
  if (rpcFailure) {
    res.writeHead(503);
    res.end('unavailable');
    return;
  }
  let result;
  if (b.method === 'getAccountInfo' || b.method === 'getMultipleAccounts')
    result = {
      context: { slot: 100 },
      value: {
        owner: program,
        executable: false,
        data: {
          parsed: {
            type: 'mint',
            info: { decimals: 6, isInitialized: true, supply: '12345000000' },
          },
        },
      },
    };
  else
    result = {
      context: { slot: 102 },
      value:
        [wallet, secondWallet].includes(b.params[0]) &&
        b.params[1].programId === program
          ? [
              {
                account: {
                  owner: program,
                  data: {
                    parsed: {
                      type: 'account',
                      info: {
                        owner: b.params[0],
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
  if (b.method === 'getMultipleAccounts') {
    result.value = b.params[0].map(() => result.value);
    result.context.slot = 103;
  }
  if (b.method === 'getTokenAccountsByOwner' && result.value.length) {
    const extra = structuredClone(result.value[0]);
    extra.account.data.parsed.info.mint =
      'SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3';
    result.value.push(extra);
    if (spcxHeld) {
      const spcx = structuredClone(extra);
      spcx.account.data.parsed.info.mint =
        'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb';
      result.value.push(spcx);
    }
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ jsonrpc: '2.0', id: b.id, result }));
});
await new Promise((r) => server.listen(3999, '127.0.0.1', r));
const original = await readFile('.dev.vars', 'utf8'),
  originalEnv = await readFile('.env', 'utf8');
let checks = 0,
  cookie = '';
let postWindow = Math.floor(Date.now() / 60000),
  postCount = 0;
async function call(
  path,
  body,
  { auth = false, status = 200, session = cookie } = {},
) {
  // Keep the functional suite below the real shared IP limit of 60 POSTs/minute.
  // Do not weaken production limits or silently retry a failed assertion.
  if (body) {
    const currentWindow = Math.floor(Date.now() / 60000);
    if (currentWindow !== postWindow) {
      postWindow = currentWindow;
      postCount = 0;
    }
    if (postCount >= 45) {
      console.log('Pacing local requests into the next rate-limit window.');
      await new Promise((resolve) =>
        setTimeout(resolve, 60000 - (Date.now() % 60000) + 20),
      );
      postWindow = Math.floor(Date.now() / 60000);
      postCount = 0;
    }
    postCount++;
  }
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
  const diagnostic = {
    provider: 'phantom',
    phase: 'sign',
    code: 'requested',
    flowId: crypto.randomUUID(),
    clientVersion: 12,
    method: 'signIn',
  };
  await call('wallet-diagnostic', diagnostic);
  await call(
    'wallet-diagnostic',
    { ...diagnostic, clientVersion: 'private data' },
    { status: 400 },
  );
  await call(
    'wallet-diagnostic',
    { ...diagnostic, method: 'unknown' },
    { status: 400 },
  );
  await call(
    'wallet-diagnostic',
    { ...diagnostic, provider: 'unknown' },
    { status: 400 },
  );
  await call(
    'wallet-diagnostic',
    { ...diagnostic, code: 'Arbitrary free-form private detail' },
    { status: 400 },
  );
  await call(
    'wallet-diagnostic',
    { ...diagnostic, flowId: 'invalid' },
    { status: 400 },
  );
  await call('threads', undefined, { status: 401 });
  await call(
    'threads',
    { title: 'No access', body: 'Cannot post as guest', topic: 'MU' },
    { status: 401 },
  );
  await call('moderation', undefined, { status: 401 });
  await call('home', undefined, { status: 401 });
  await call('holdings-refresh', {}, { status: 401 });
  await call('save', { type: 'thread', id: 'x', save: true }, { status: 401 });
  await call('challenge', { wallet, authMethod: 'unknown' }, { status: 400 });
  const c = (await call('challenge', { wallet, authMethod: 'signIn' })).d;
  assert.equal(c.signInInput.domain, new URL(base).host);
  assert.equal(c.signInInput.uri, base);
  assert.equal(c.signInInput.address, wallet);
  assert.equal(c.signInInput.chainId, 'solana:mainnet');
  assert.equal(c.signInInput.nonce, c.id.replaceAll('-', ''));
  assert.equal(Date.parse(c.signInInput.expirationTime), c.expiresAt);
  assert.ok(
    c.message.startsWith(
      new URL(base).host +
        ' wants you to sign in with your Solana account:\n' +
        wallet,
    ),
  );
  assert.ok(c.message.includes('Nonce: ' + c.signInInput.nonce));
  checks += 8;
  assert.equal(c.holdingCount, 2);
  assert.ok(!c.message.includes('Token: MU'));
  checks += 2;
  const alteredMessage = c.message.replace(
    c.signInInput.domain,
    'wrong.example',
  );
  await call(
    'verify',
    {
      challengeId: c.id,
      signature: Array.from(
        ed25519.sign(new TextEncoder().encode(alteredMessage), pair.secretKey),
      ),
      message: alteredMessage,
      consent: true,
    },
    { status: 403 },
  );
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
  const home = (await call('home')).d;
  assert.deepEqual(
    home.holdings.map((h) => h.symbol),
    ['MU', 'SKHY'],
  );
  assert.equal(
    home.holdings.find((h) => h.symbol === 'MU').raw_amount,
    '25000000',
  );
  assert.equal(home.holdings.find((h) => h.symbol === 'MU').ui_amount, '25');
  assert.ok(!JSON.stringify((await call('status')).d).includes('25000000'));
  checks += 2;
  await call('follow', { symbol: 'SPCX', follow: true });
  assert.ok((await call('home')).d.follows.includes('SPCX'));
  await call('follow', { symbol: 'FAKE', follow: true }, { status: 400 });
  await call(
    'profile',
    { alias: 'Curious Holder', showBadge: true, badgeSymbol: 'SPCX' },
    { status: 400 },
  );
  await call('profile', {
    alias: 'Curious Holder',
    bio: 'I follow semiconductors.',
    showBadge: true,
    notifyReplies: false,
  });
  assert.equal((await call('status')).d.member.notify_replies, 0);
  assert.equal((await call('status')).d.member.bio, 'I follow semiconductors.');
  await call('save', { type: 'source', id: home.sources[0].id, save: true });
  assert.equal(
    (await call('home')).d.sources.find((s) => s.id === home.sources[0].id)
      .saved,
    1,
  );
  await call('save', { type: 'source', id: home.sources[0].id, save: false });
  await call(
    'save',
    { type: 'source', id: 'missing', save: true },
    { status: 404 },
  );

  // Invalid drafts must return useful validation errors without spending the
  // three-post allowance. The next valid submission must still be accepted.
  for (const title of ['', '   ', null, 'x'.repeat(141)]) {
    const invalid = await call(
      'threads',
      {
        title,
        body: 'A valid perspective.',
        topic: 'general',
      },
      { status: 400 },
    );
    assert.match(invalid.d.error, /title|Title/);
  }
  const t = (
    await call(
      'threads',
      {
        title: '?',
        body: '',
        topic: 'SPCX',
      },
      { status: 201 },
    )
  ).d;
  const posted = (await call('threads?feed=all&topic=SPCX&thread=' + t.id)).d
    .threads;
  assert.equal(posted.length, 1);
  assert.equal(posted[0].id, t.id);
  assert.equal(posted[0].title, '?');
  assert.equal(posted[0].body, '');
  assert.ok(!JSON.stringify(posted).includes('raw_amount'));
  assert.ok(!JSON.stringify(posted).includes('ui_amount'));
  await editorialFlow(base, cookie);
  await profileNewsFlow(base, cookie, m.id);
  if (process.env.TEST_LIVE_MARKETS === '1') await marketFlow(base, cookie);
  const roomName = 'Memory club ' + crypto.randomUUID();
  await call(
    'rooms',
    { name: roomName, description: 'Member-created room for local testing.' },
    { session: '', status: 401 },
  );
  const room = (
    await call(
      'rooms',
      { name: roomName, description: 'Member-created room for local testing.' },
      { status: 201 },
    )
  ).d;
  const roomHome = (await call('home')).d;
  assert.ok(
    roomHome.rooms.some((r) => r.id === room.id && r.thread_count === 0),
  );
  assert.ok(
    roomHome.rooms.every((r) => r.id.startsWith('room-') || r.thread_count > 0),
    'No empty auto-generated stock rooms',
  );
  assert.ok(roomHome.follows.includes(room.id));
  await call(
    'rooms',
    {
      name: roomName.toUpperCase(),
      description: 'Duplicate room should be rejected.',
    },
    { status: 409 },
  );
  const roomPost = (
    await call(
      'threads',
      {
        topic: room.id,
        title: 'First room discussion',
        body: 'A persistent discussion in a member-created room.',
      },
      { status: 201 },
    )
  ).d;
  const roomFeed = (await call('threads?topic=' + room.id)).d;
  assert.equal(roomFeed.threads[0].room_name, roomName);
  assert.ok(
    (await call('threads?feed=personal')).d.threads.some(
      (t) => t.id === roomPost.id,
    ),
  );
  await call('threads/' + roomPost.id + '/remove', {});
  await call('follow', { symbol: room.id, follow: false });

  await call('save', { type: 'thread', id: t.id, save: true });
  assert.ok(
    (await call('threads?feed=saved')).d.threads.some(
      (x) => x.id === t.id && x.saved,
    ),
  );
  assert.ok(
    (await call('threads?feed=personal')).d.threads.some((x) => x.id === t.id),
  );
  await call('follow', { symbol: 'SPCX', follow: false });
  assert.ok(
    !(await call('threads?feed=personal')).d.threads.some((x) => x.id === t.id),
  );
  let feed = (await call('threads?topic=SPCX')).d;

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
  // Separate member: bookmarks and preferences must not leak across sessions.
  const secondChallenge = (await call('challenge', { wallet: secondWallet })).d;
  assert.equal(secondChallenge.signInInput, undefined);
  assert.ok(
    secondChallenge.message.startsWith('Float community membership\n'),
  );
  checks += 2;
  const secondLogin = await call('verify', {
    challengeId: secondChallenge.id,
    signature: Array.from(
      ed25519.sign(
        new TextEncoder().encode(secondChallenge.message),
        secondPair.secretKey,
      ),
    ),
    consent: true,
  });
  const secondCookie = secondLogin.r.headers.get('set-cookie').split(';')[0];
  const secondHome = (await call('home', undefined, { session: secondCookie }))
    .d;
  assert.equal(secondHome.follows.length, 0);
  assert.ok(secondHome.sources.every((s) => !s.saved));
  assert.equal(
    (await call('threads?feed=saved', undefined, { session: secondCookie })).d
      .threads.length,
    0,
  );
  await call(
    'threads/' + t.id + '/remove',
    {},
    { session: secondCookie, status: 403 },
  );
  await call(
    'threads/' + t.id + '/replies',
    { body: 'Notification should be disabled for this reply.' },
    { session: secondCookie, status: 201 },
  );
  assert.equal((await call('home')).d.notifications.length, 0);
  await call('profile', {
    alias: 'Curious Holder',
    showBadge: true,
    notifyReplies: true,
    badgeSymbol: 'SKHY',
  });
  const noticeReply = (
    await call(
      'threads/' + t.id + '/replies',
      { body: 'A useful second perspective from another holder.' },
      { session: secondCookie, status: 201 },
    )
  ).d;
  const notices = (await call('home')).d.notifications;
  assert.equal(notices.length, 1);
  assert.equal(notices[0].read, 0);
  await call('notifications', {});
  assert.equal((await call('home')).d.notifications[0].read, 1);
  assert.equal(
    (await call('home', undefined, { session: secondCookie })).d.notifications
      .length,
    0,
  );
  await call(
    'replies/' + noticeReply.id + '/remove',
    {},
    { session: secondCookie },
  );
  assert.equal((await call('home')).d.notifications.length, 0);
  await call('logout', {}, { session: secondCookie });
  checks += 8;
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
  assert.ok(
    !(await call('threads/' + t.id + '/replies')).d.replies.some(
      (r) => r.id === reply.id,
    ),
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
  const z = (await call('challenge', { wallet, authMethod: 'signIn' })).d;
  balance = '0';
  await call('challenge', { wallet }, { status: 403 });
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
  // Buy SPCX after signing in: a holdings check must add it without another signature.
  const oldExpiry = (await call('status')).d.member.verified_until;
  assert.ok(!(await call('home')).d.holdings.some((h) => h.symbol === 'SPCX'));
  spcxHeld = true;
  const sync = (await call('holdings-refresh', { force: true })).d;
  assert.equal(sync.checked, true);
  const purchased = (await call('home')).d;
  assert.ok(purchased.holdings.some((h) => h.symbol === 'SPCX'));
  assert.equal(purchased.holdingsRefreshAvailable, true);
  assert.ok(!JSON.stringify(purchased).includes(wallet));
  assert.equal((await call('status')).d.member.verified_until, oldExpiry);
  const callsBefore = rpcCalls;
  await call('holdings-refresh', { force: true });
  assert.equal(
    rpcCalls,
    callsBefore,
    'Immediate repeated checks must be throttled',
  );
  await new Promise((r) => setTimeout(r, 11000));
  rpcFailure = true;
  await call('holdings-refresh', { force: true }, { status: 503 });
  assert.ok(
    (await call('home')).d.holdings.some((h) => h.symbol === 'SPCX'),
    'Outage must preserve last good holdings',
  );
  rpcFailure = false;
  await new Promise((r) => setTimeout(r, 11000));
  spcxHeld = false;
  await call('holdings-refresh', { force: true });
  assert.ok(
    !(await call('home')).d.holdings.some((h) => h.symbol === 'SPCX'),
    'Sold token must disappear',
  );
  checks += 9;
  await call('threads/' + t.id + '/remove', {});
  await new Promise((r) => setTimeout(r, 11000));
  balance = '0';
  await call('holdings-refresh', { force: true }, { status: 401 });
  await call('home', undefined, { status: 401 });
  await call('logout', {});
  await call('threads', undefined, { status: 401 });
  console.log(
    checks +
      ' community checks passed: real signature + mock RPC, automatic multi-holding discovery and cross-topic entry, persistent posts/replies, privacy, moderation, suspension, zero holding, replay and logout.',
  );
} finally {
  await writeFile('.dev.vars', original);
  await writeFile('.env', originalEnv);
  await new Promise((r) => server.close(r));
}
