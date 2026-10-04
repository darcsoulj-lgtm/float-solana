import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
import { tradeFixture } from './helpers/trade-db.mjs';
const { tradeProvider } = await bundle(
  "export * from './lib/trading/provider';",
);
void test('block expiry uses a fresh matched block header, never the provider slot-as-height response', async (t) => {
  const f = tradeFixture(); t.after(() => f.sql.close());
  let time = 100000, kind = 'valid';
  const methods = [];
  const p = tradeProvider(f.db, 'https://fixed-rpc.example', async (_url, options) => {
    const { method, params } = JSON.parse(options.body); methods.push(method);
    if (method === 'getLatestBlockhash') return Response.json({ result: { context: { slot: 450 }, value: { blockhash: 'block-a' } } });
    assert.equal(method, 'getBlock'); assert.equal(params[0], 450);
    return Response.json({ result: { blockhash: kind === 'mismatch' ? 'block-b' : 'block-a', blockHeight: kind === 'height' ? 451 : 430, blockTime: kind === 'stale' ? 1 : kind === 'future' ? 999999 : Math.floor(time / 1000) } });
  }, () => time);
  assert.equal(await p.rpc('getBlockHeight', []), 430);
  assert.equal(await p.rpc('getBlockHeight', []), 430);
  assert.deepEqual(methods, ['getLatestBlockhash', 'getBlock']);
  for (const params of [[{ commitment: 'processed' }], [{ commitment: 'finalized' }], [{ commitment: 'confirmed', minContextSlot: 999 }]])
    await assert.rejects(p.rpc('getBlockHeight', params), /Only confirmed/);
  for (const value of ['mismatch', 'height', 'stale', 'future']) {
    time += 3000; kind = value;
    await assert.rejects(p.rpc('getBlockHeight', []), /validity/);
  }
});
void test('RPC uses Workers-compatible manual redirects and no-store; redirects fail closed', async (t) => {
  const f = tradeFixture();
  t.after(() => f.sql.close());
  let calls = 0;
  const provider = tradeProvider(
    f.db,
    'https://fixed-rpc.example',
    async (url, init) => {
      calls++;
      assert.equal(url, 'https://fixed-rpc.example');
      assert.equal(init.redirect, 'manual');
      assert.equal(init.cache, 'no-store');
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://attacker.example' },
      });
    },
  );
  await assert.rejects(provider.rpc('getBlockHeight', []), /unavailable/);
  assert.equal(calls, 1);
});
void test('shared provider budget survives independent service instances', async (t) => {
  const f = tradeFixture();
  t.after(() => f.sql.close());
  let now = 10000;
  const a = tradeProvider(f.db, undefined, fetch, () => now),
    b = tradeProvider(f.db, undefined, fetch, () => now);
  await a.providerSlot();
  await assert.rejects(b.providerSlot(), /wait/);
  now += 2600;
  await b.providerSlot();
});
void test('successful HTTP with RPC error is never accepted as data', async (t) => {
  const f = tradeFixture();
  t.after(() => f.sql.close());
  const provider = tradeProvider(f.db, undefined, async () =>
    Response.json({ error: { code: 429 } }),
  );
  await assert.rejects(provider.rpc('getBlockHeight', []), /could not verify/);
});
