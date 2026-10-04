import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { getTokenEncoder, getMintEncoder } from '@solana-program/token-2022';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackAccount,
  unpackMint,
} from '../lib/trading/token-codecs.mjs';
const key = Keypair.fromSeed(new Uint8Array(32).fill(77)).publicKey;
const base = {
  mint: key.toBase58(),
  owner: key.toBase58(),
  amount: 19n,
  delegate: null,
  state: 1,
  isNative: null,
  delegatedAmount: 0n,
  closeAuthority: null,
};
const info = (data) => ({
  owner: TOKEN_2022_PROGRAM_ID,
  data: Buffer.from(data),
  executable: false,
});
const account = (extensions) =>
  info(getTokenEncoder().encode({ ...base, extensions }));
void test('official Token2022 codec supports unextended and variable extension accounts without losing authority fields', () => {
  for (const extensions of [
    null,
    [],
    [{ __kind: 'ImmutableOwner' }],
    [{ __kind: 'MemoTransfer', requireIncomingTransferMemos: true }],
  ]) {
    const result = unpackAccount(
      key,
      account(extensions),
      TOKEN_2022_PROGRAM_ID,
    );
    assert.equal(result.amount, 19n);
    assert.ok(result.owner.equals(key));
    assert.equal(result.delegate, null);
    assert.equal(result.closeAuthority, null);
    assert.equal(result.isFrozen, false);
    assert.equal(result.extensions.length, extensions?.length || 0);
  }
});
void test('raw Token2022 extension mutation remains visible for policy equality check', () => {
  const before = unpackAccount(
    key,
    account([{ __kind: 'MemoTransfer', requireIncomingTransferMemos: false }]),
    TOKEN_2022_PROGRAM_ID,
  );
  const after = unpackAccount(
    key,
    account([{ __kind: 'MemoTransfer', requireIncomingTransferMemos: true }]),
    TOKEN_2022_PROGRAM_ID,
  );
  assert.notDeepEqual(before.tlvData, after.tlvData);
});
void test('wrong program, uninitialized state, truncated extension and wrong account discriminator fail closed', () => {
  const good = account([
    { __kind: 'MemoTransfer', requireIncomingTransferMemos: true },
  ]);
  assert.throws(() => unpackAccount(key, good, TOKEN_PROGRAM_ID));
  assert.throws(() =>
    unpackAccount(
      key,
      info(getTokenEncoder().encode({ ...base, state: 0, extensions: null })),
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  assert.throws(() =>
    unpackAccount(
      key,
      info(good.data.subarray(0, good.data.length - 1)),
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  const badType = Buffer.from(good.data);
  badType[165] = 1;
  assert.throws(() => unpackAccount(key, info(badType), TOKEN_2022_PROGRAM_ID));
});
void test('official mint decoder handles extended Token2022 mint padding and distinguishes account type', () => {
  const data = getMintEncoder().encode({
    mintAuthority: null,
    supply: 900n,
    decimals: 6,
    isInitialized: true,
    freezeAuthority: null,
    extensions: [{ __kind: 'NonTransferable' }],
  });
  assert.ok(data.length > 165);
  const result = unpackMint(key, info(data), TOKEN_2022_PROGRAM_ID);
  assert.equal(result.supply, 900n);
  assert.equal(result.decimals, 6);
  assert.equal(result.isInitialized, true);
  assert.throws(() => unpackAccount(key, info(data), TOKEN_2022_PROGRAM_ID));
});
