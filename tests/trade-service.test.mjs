import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradeService, USDC } from '../lib/trading/service.mjs';
import { tradeFixture } from './helpers/trade-db.mjs';
const owner = {
    wallet: '11111111111111111111111111111111',
    walletKey: 'owner',
  },
  body = { symbol: 'TEST', side: 'buy', amount: '100' };
const mint = 'So11111111111111111111111111111111111111112';
function fixture(t) {
  const f = tradeFixture();
  t.after(() => f.sql.close());
  let sends = 0,
    mode = 'success',
    chain = null,
    clock = 100000;
  const config = {
    store: f.store(),
    resolveToken: async (s) => {
      if (s !== 'TEST') throw Error('Unknown token');
      return { symbol: s, mint, decimals: 6 };
    },
    now: () => clock,
    rpc: async (method) =>
      method === 'getBlockHeight' ? 100 : { value: [chain] },
    validate: async () => ({ fixture: true, recentBlockhash: 'fixture-blockhash', messageHash: 'fixture-hash', simulationSlot: 99 }),
    validateSigned: (signed) => {
      if (signed !== 'signed-fixture') throw Error('signature mismatch');
      return 'fixture-signature';
    },
    fetcher: async (url, options) => {
      if (url.includes('/order?'))
        return Response.json({
          router: 'metis',
          taker: owner.wallet,
          inputMint: USDC,
          outputMint: mint,
          inAmount: '100000000',
          outAmount: '1000',
          otherAmountThreshold: '990',
          transaction: 'fixture-only',
          feeBps: 10,
          priceImpact: 0.1,
          signatureFeeLamports: 5000,
          prioritizationFeeLamports: 0,
          rentFeeLamports: 0,
          lastValidBlockHeight: 900,
          requestId: 'fixture-id',
        });
      assert.equal(
        JSON.parse(options.body).signedTransaction,
        'signed-fixture',
      );
      assert.equal(JSON.parse(options.body).lastValidBlockHeight, '900');
      sends++;
      if (mode === 'timeout') throw Error('network lost');
      if (mode === 'schema-rejected') return Response.json({ success: false, error: { name: 'ZodError', issues: [{ code: 'invalid_type', expected: 'string', received: 'number', path: ['lastValidBlockHeight'] }] } }, { status: 400 });
      return Response.json({
        status: 'Success',
        code: 0,
        signature:
          mode === 'wrong-signature' ? 'different' : 'fixture-signature',
      });
    },
  };
  return {
    ...f,
    config,
    service: () => createTradeService({ ...config, store: f.store() }),
    sends: () => sends,
    setMode: (v) => (mode = v),
    setChain: (v) => (chain = v),
    setTime: (v) => (clock = v),
  };
}
void test('independent services race to submit one order: only one executes', async (t) => {
  const f = fixture(t),
    a = f.service(),
    b = f.service(),
    order = await a.prepare(body, owner);
  await Promise.all([
    a.execute({ id: order.id, signedTransaction: 'signed-fixture' }, owner),
    b.execute({ id: order.id, signedTransaction: 'signed-fixture' }, owner),
  ]);
  assert.equal(f.sends(), 1);
  assert.equal((await b.status({ id: order.id }, owner)).state, 'confirmed');
});
void test('contradictory schema rejection preserves evidence and the execution lock', async (t) => {
  const f = fixture(t); f.setMode('schema-rejected');
  const order = await f.service().prepare(body, owner);
  const context = { recentBlockhash: 'fixture-blockhash', messageHash: 'fixture-hash', simulationSlot: 99, lastValidBlockHeight: 900 };
  assert.deepEqual((await f.store().get(order.id, owner.walletKey)).payload.receiptContext, context);
  const result = await f.service().execute({ id: order.id, signedTransaction: 'signed-fixture' }, owner);
  assert.equal(result.state, 'unknown');
  assert.match(result.error, /could not confirm/);
  const saved = await f.store().get(order.id, owner.walletKey);
  assert.equal(saved.payload.executionEvidence.kind, 'unconfirmed');
  assert.equal(saved.payload.executionEvidence.http, 400);
  assert.deepEqual(saved.payload.receiptContext, context);
  assert.equal(saved.payload.transaction, undefined);
  assert.equal(saved.payload.validation, undefined);
  await f.service().execute({ id: order.id, signedTransaction: 'signed-fixture' }, owner);
  assert.equal(f.sends(), 1);
  assert.equal((await f.store().active(owner.walletKey)).id, order.id);
  await assert.rejects(f.service().prepare(body, owner));
});
void test('live decimal-string block heights normalize safely; malformed or unsafe heights cannot prepare', async (t) => {
  const f = fixture(t), fetcher = f.config.fetcher;
  let height = '900';
  f.config.fetcher = async (...args) => {
    const data = await (await fetcher(...args)).json();
    return Response.json({ ...data, lastValidBlockHeight: height });
  };
  const prepared = await f.service().prepare(body, owner);
  assert.equal(prepared.state, 'ready');
  for (const invalid of ['900.5', '9e2', ' 900', '-1', '0', '9007199254740992', '']) {
    height = invalid;
    await assert.rejects(f.service().prepare(body, owner), /validity/);
  }
  assert.equal(f.sends(), 0);
});
void test('provider outages and limits release the order lease without blaming balance or amount', async (t) => {
  const f = fixture(t);
  for (const status of [429, 500, 503]) {
    f.config.fetcher = async () => new Response('upstream unavailable', { status });
    await assert.rejects(f.service().prepare(body, owner), status === 429 ? /Please wait/ : /Unable to prepare/);
    assert.equal(await f.service().status({}, owner), null);
  }
  assert.equal(f.sends(), 0);
});
void test('unknown transmission survives new service and blocks wallet-wide duplicate', async (t) => {
  const f = fixture(t);
  f.setMode('timeout');
  const order = await f.service().prepare(body, owner);
  assert.equal(
    (
      await f
        .service()
        .execute({ id: order.id, signedTransaction: 'signed-fixture' }, owner)
    ).state,
    'unknown',
  );
  await assert.rejects(f.service().prepare(body, owner), /pending/);
  assert.equal((await f.service().status({}, owner)).id, order.id);
  await f
    .service()
    .execute({ id: order.id, signedTransaction: 'signed-fixture' }, owner);
  assert.equal(f.sends(), 1);
  f.setChain({ err: null, confirmationStatus: 'confirmed' });
  assert.equal((await f.service().status({}, owner)).state, 'confirmed');
});
void test('foreign wallet, modified signature and expired order never submit', async (t) => {
  const f = fixture(t),
    order = await f.service().prepare(body, owner);
  await assert.rejects(
    f
      .service()
      .execute(
        { id: order.id, signedTransaction: 'signed-fixture' },
        { ...owner, walletKey: 'other' },
      ),
    /not found/,
  );
  await assert.rejects(
    f.service().execute({ id: order.id, signedTransaction: 'changed' }, owner),
    /signature/,
  );
  f.setTime(200000);
  await assert.rejects(
    f
      .service()
      .execute({ id: order.id, signedTransaction: 'signed-fixture' }, owner),
    /expired/,
  );
  assert.equal(f.sends(), 0);
});
void test('lost CAS acknowledgement cannot call provider even if database committed', async (t) => {
  const f = fixture(t),
    order = await f.service().prepare(body, owner),
    store = f.store(),
    claim = store.claim;
  store.claim = async (...args) => {
    await claim(...args);
    throw Error('lost acknowledgement');
  };
  await assert.rejects(
    createTradeService({ ...f.config, store }).execute(
      { id: order.id, signedTransaction: 'signed-fixture' },
      owner,
    ),
    /acknowledgement/,
  );
  assert.equal(f.sends(), 0);
  assert.equal((await f.service().status({}, owner)).state, 'unknown');
});
void test('identity is server-derived; request wallet cannot redirect prepared transaction', async (t) => {
  const f = fixture(t);
  const order = await f
    .service()
    .prepare({ ...body, wallet: 'attacker' }, owner);
  assert.equal(order.wallet, owner.wallet);
});
void test('unknown pending after expired block and null chain history remains blocked', async (t) => {
  const f = fixture(t);
  f.setMode('timeout');
  const o = await f.service().prepare(body, owner);
  await f
    .service()
    .execute({ id: o.id, signedTransaction: 'signed-fixture' }, owner);
  f.setTime(9000000);
  f.advance(9000000);
  assert.equal((await f.service().status({}, owner)).state, 'unknown');
  await assert.rejects(f.service().prepare(body, owner), /pending/);
});
void test('failed preparation releases its lease without changing pending orders', async (t) => {
  const f = fixture(t);
  f.config.validate = async () => {
    throw Error('simulation failed');
  };
  await assert.rejects(f.service().prepare(body, owner), /simulation/);
  assert.equal(await f.store().active(owner.walletKey), null);
});
void test('provider wrong signature stays unknown, actual received never comes from quote', async (t) => {
  const f = fixture(t);
  f.setMode('wrong-signature');
  const o = await f.service().prepare(body, owner);
  const result = await f
    .service()
    .execute({ id: o.id, signedTransaction: 'signed-fixture' }, owner);
  assert.equal(result.state, 'unknown');
  assert.equal(result.actualOutput, null);
});
void test('confirmed receipt can be enriched later without regressing terminal state', async (t) => {
  const f = fixture(t),
    o = await f.service().prepare(body, owner);
  const sent = await f
    .service()
    .execute({ id: o.id, signedTransaction: 'signed-fixture' }, owner);
  assert.equal(sent.actualOutput, null);
  const balance = (mint, amount) => ({
    mint,
    owner: owner.wallet,
    uiTokenAmount: { amount, decimals: 6 },
  });
  f.config.rpc = async () => ({
    transaction: { signatures: ['fixture-signature'] },
    meta: {
      err: null,
      preTokenBalances: [balance(USDC, '100000000')],
      postTokenBalances: [balance(mint, '999')],
    },
  });
  const result = await f.service().status({ id: o.id }, owner);
  assert.equal(result.state, 'confirmed');
  assert.equal(result.actualOutput, 0.000999);
  assert.equal(f.sends(), 1);
});
void test('preparing recovery is bounded and never masquerades as a quote', async (t) => {
  const f = fixture(t);
  await f.store().reserve('preparing', owner.walletKey);
  const r = await f.service().status({}, owner);
  assert.equal(r.state, 'preparing');
  assert.equal(r.wallet, owner.wallet);
  assert.equal(r.transaction, undefined);
  f.advance(60001);
  f.setTime(160001);
  assert.equal(await f.service().status({}, owner), null);
});
