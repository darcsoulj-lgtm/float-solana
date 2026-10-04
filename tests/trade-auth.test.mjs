import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeFixture } from './helpers/trade-db.mjs';
import { bundle } from './helpers/bundle.mjs';
const { tradeAuth, tradeCookie } = await bundle(
  "export * from './lib/trading/auth';",
);
const wallet = '11111111111111111111111111111111',
  origin = 'https://joinfloat.xyz';
void test('trade sign-in is origin-bound, expiring, and consumed only once', async (t) => {
  const f = tradeFixture();
  t.after(() => f.sql.close());
  let time = 100000;
  const auth = tradeAuth(
      f.db,
      () => time,
      async () => {},
    ),
    challenge = await auth.challenge(wallet, origin);
  await assert.rejects(
    auth.verify(challenge.id, [], 'https://evil.example'),
    /expired/,
  );
  const results = await Promise.allSettled([
    auth.verify(challenge.id, [], origin),
    auth.verify(challenge.id, [], origin),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const expired = await auth.challenge(wallet, origin);
  time += 300001;
  await assert.rejects(auth.verify(expired.id, [], origin), /expired/);
});
void test('session is private, rejects duplicate cookies and supports revocation', async (t) => {
  const f = tradeFixture();
  t.after(() => f.sql.close());
  const auth = tradeAuth(
      f.db,
      () => 100000,
      async () => {},
    ),
    c = await auth.challenge(wallet, origin),
    s = await auth.verify(c.id, [], origin);
  const cookie = 'float_trade=' + s.token,
    req = new Request(origin + '/api/trade/status', { headers: { cookie } });
  assert.deepEqual(
    { ...(await auth.session(req)) },
    { wallet, walletKey: s.walletKey },
  );
  assert.equal(
    await auth.session(
      new Request(origin, { headers: { cookie: cookie + '; ' + cookie } }),
    ),
    null,
  );
  assert.match(tradeCookie(s.token, req), /HttpOnly; SameSite=Strict/);
  assert.match(tradeCookie(s.token, req), /Secure/);
  await auth.disconnect(req);
  assert.equal(await auth.session(req), null);
});
void test('invalid wallet signature does not create a session', async (t) => {
  const f = tradeFixture();
  t.after(() => f.sql.close());
  const auth = tradeAuth(
      f.db,
      () => 100000,
      async () => {
        throw Error('invalid signature');
      },
    ),
    c = await auth.challenge(wallet, origin);
  await assert.rejects(auth.verify(c.id, [], origin), /invalid signature/);
  assert.equal(
    f.sql.prepare('SELECT count(*) AS count FROM trade_sessions').get().count,
    0,
  );
});
