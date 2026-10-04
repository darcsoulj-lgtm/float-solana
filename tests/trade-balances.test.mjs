import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { tradingBalances } from '../lib/trading/balances.mjs';
import { exceedsBalance } from '../lib/trading/quantity.mjs';
import { USDC } from '../lib/trading/service.mjs';
const token = { symbol: 'TEST', mint: 'So11111111111111111111111111111111111111112', decimals: 9, program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' };
const session = { wallet: Keypair.generate().publicKey.toBase58() };
function account(mint, amount, decimals, state = 'initialized', pubkey = amount) {
  return { pubkey, account: { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', data: { parsed: { type: 'account', info: { owner: session.wallet, mint, state, tokenAmount: { amount, decimals } } } } } };
}
function provider(stock, usdc = null) {
  return {
    resolveToken: async (symbol) => { assert.equal(symbol, 'TEST'); return token; },
    rpc: async (method, params) => {
      if (method === 'getBalance') { assert.equal(params[0], session.wallet); return { value: 123456789 }; }
      assert.equal(method, 'getMultipleAccounts');
      assert.equal(params[0].length, 2);
      assert.notEqual(params[0][0], params[0][1]);
      assert.deepEqual(params[1], { encoding: 'jsonParsed', commitment: 'confirmed' });
      return { value: [stock?.account ?? null, usdc?.account ?? null] };
    },
  };
}
void test('balances use verified owner and canonical associated accounts', async () => {
  const result = await tradingBalances('TEST', session, provider(account(token.mint, '3000000001', 9), account(USDC, '12345678', 6)), () => 1000);
  assert.deepEqual(result, { symbol: 'TEST', token: '3.000000001', usdc: '12.345678', sol: '0.123456789', checkedAt: 1000 });
  assert.equal(exceedsBalance('3.000000002', result.token), true);
  assert.equal(exceedsBalance('3.000000001', result.token), false);
  assert.equal(exceedsBalance('0003', result.token), false);
});
void test('missing and frozen accounts have no trading funds; invalid accounts fail closed', async () => {
  assert.equal((await tradingBalances('TEST', session, provider(null))).token, '0.000000000');
  assert.equal((await tradingBalances('TEST', session, provider(account(token.mint, '100', 9, 'frozen')))).token, '0.000000000');
  for (const kind of ['owner', 'mint', 'decimals', 'program', 'amount']) {
    const row = account(token.mint, '100', 9), info = row.account.data.parsed.info;
    if (kind === 'owner') info.owner = 'someone-else';
    if (kind === 'mint') info.mint = 'wrong';
    if (kind === 'decimals') info.tokenAmount.decimals = 6;
    if (kind === 'program') row.account.owner = 'untrusted';
    if (kind === 'amount') info.tokenAmount.amount = '18446744073709551616';
    await assert.rejects(tradingBalances('TEST', session, provider(row)), /verified/);
  }
});
void test('balance failures remain unavailable and decimal comparisons do not round', async () => {
  await assert.rejects(tradingBalances('TEST', session, { resolveToken: async () => token, rpc: async () => { throw Error('offline'); } }), /offline/);
  assert.equal(exceedsBalance('999999999.000000001', '999999999.000000000'), true);
  assert.equal(exceedsBalance('', '0'), false);
});
