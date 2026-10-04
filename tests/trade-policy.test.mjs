import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import { getTokenEncoder, getMintEncoder } from '@solana-program/token';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '../lib/trading/token-codecs.mjs';
import bs58 from 'bs58';
import {
  validateOrderTransaction,
  validateSignedTransaction,
} from '../lib/trading/policy.mjs';

// Ephemeral, deterministic fixture keys only. Never funded or used on a network.
const key = (n) => Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => n));
const signer = key(1),
  outsider = key(2),
  stock = key(3).publicKey;
const usdc = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const jupiter = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
const inputAta = getAssociatedTokenAddressSync(usdc, signer.publicKey),
  outputAta = getAssociatedTokenAddressSync(stock, signer.publicKey);
function info(owner, data, lamports = 2_039_280) {
  return {
    owner: owner.toBase58(),
    data: [Buffer.from(data).toString('base64'), 'base64'],
    lamports,
    executable: false,
    rentEpoch: 0,
  };
}
function token(mint, amount, delegate = null) {
  const bytes = getTokenEncoder().encode({
    mint: mint.toBase58(),
    owner: signer.publicKey.toBase58(),
    amount: BigInt(amount),
    delegate: delegate?.toBase58() || null,
    state: 1,
    isNative: null,
    delegatedAmount: delegate ? 1n : 0n,
    closeAuthority: null,
  });
  return info(TOKEN_PROGRAM_ID, bytes);
}
function mintInfo() {
  const bytes = getMintEncoder().encode({
    mintAuthority: null,
    supply: 1000000000n,
    decimals: 6,
    isInitialized: true,
    freezeAuthority: null,
  });
  return info(TOKEN_PROGRAM_ID, bytes);
}
function fixture(options = {}) {
  let data = Buffer.alloc(31);
  createHash('sha256').update('global:route').digest().copy(data, 0, 0, 8);
  data.writeBigUInt64LE(options.encodedInput ?? 100000000n, 12);
  data.writeBigUInt64LE(1000000n, 20);
  data.writeUInt16LE(100, 28);
  data[30] = 0;
  let metas = [
    [TOKEN_PROGRAM_ID, false, false],
    [signer.publicKey, true, true],
    [inputAta, false, true],
    [options.recipient || outputAta, false, true],
    [options.recipient || outputAta, false, true],
    [stock, false, false],
    [jupiter, false, false],
    [key(4).publicKey, false, false],
    [jupiter, false, false],
  ];
  if (options.v2) {
    // Independent byte fixture from on-chain route_v2 schema. One Saber hop.
    data = Buffer.alloc(39);
    Buffer.from('bb64facc31c4af14', 'hex').copy(data);
    data.writeBigUInt64LE(options.encodedInput ?? 100000000n, 8);
    data.writeBigUInt64LE(1000000n, 16);
    data.writeUInt16LE(options.slippage ?? 100, 24);
    data.writeUInt16LE(options.platformFee ?? 0, 26);
    data.writeUInt16LE(options.positiveSlippage ?? 0, 28);
    data.writeUInt32LE(1, 30); // vector length
    data[34] = options.variant ?? 0; // Swap::Saber
    data.writeUInt16LE(10000, 35);
    data[37] = 0; data[38] = 1;
    metas = [
      [signer.publicKey, true, true], [inputAta, false, true],
      [options.recipient || outputAta, false, true], [usdc, false, false],
      [stock, false, false], [TOKEN_PROGRAM_ID, false, false],
      [TOKEN_PROGRAM_ID, false, false], [options.destination || jupiter, false, false],
      [new PublicKey('D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf'), false, false],
      [jupiter, false, false],
    ];
    if (options.wrongMeta != null) metas[options.wrongMeta] = [outsider.publicKey, false, false];
  }
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    new TransactionInstruction({
      programId: jupiter,
      keys: metas.map(([pubkey, isSigner, isWritable]) => ({
        pubkey,
        isSigner,
        isWritable,
      })),
      data: options.appended ? Buffer.concat([data, Buffer.from([0])]) : data,
    }),
    ...(options.extra || []),
  ];
  const lookups = options.lookups || [];
  const message = new TransactionMessage({
    payerKey: options.payer || signer.publicKey,
    recentBlockhash: key(9).publicKey.toBase58(),
    instructions,
  }).compileToV0Message(lookups);
  const tx = new VersionedTransaction(message);
  const order = {
    router: 'metis',
    swapMode: 'ExactIn',
    taker: signer.publicKey.toBase58(),
    inputMint: usdc.toBase58(),
    outputMint: stock.toBase58(),
    inAmount: '100000000',
    outAmount: '1000000',
    otherAmountThreshold: '990000',
    requestId: 'fixture-order',
    feeBps: 10,
    feeMint: usdc.toBase58(),
    lastValidBlockHeight: 200,
    transaction: Buffer.from(tx.serialize()).toString('base64'),
    ...options.order,
  };
  const before = new Map([
    [
      signer.publicKey.toBase58(),
      info(SystemProgram.programId, Buffer.alloc(0), 100000000),
    ],
    [inputAta.toBase58(), token(usdc, 200000000)],
    [outputAta.toBase58(), token(stock, 0)],
  ]);
  const after = new Map([
    [
      signer.publicKey.toBase58(),
      info(
        SystemProgram.programId,
        Buffer.alloc(0),
        options.solAfter ?? 99995000,
      ),
    ],
    [
      inputAta.toBase58(),
      token(usdc, options.inputAfter ?? 100000000, options.delegate),
    ],
    [outputAta.toBase58(), token(stock, options.outputAfter ?? 1000000)],
  ]);
  const rpc = async (method, params) => {
    if (method === 'getBlockHeight') return options.height ?? 100;
    if (method === 'getAccountInfo')
      return { context: { slot: 10 }, value: null };
    if (method === 'getMultipleAccounts') {
      if (params[0][0] === usdc.toBase58())
        return { context: { slot: 10 }, value: [mintInfo(), mintInfo()] };
      return {
        context: { slot: 10 },
        value: params[0].map((address) => before.get(address) || null),
      };
    }
    if (method === 'simulateTransaction') {
      assert.equal(params[1].sigVerify, false);
      assert.equal(params[1].replaceRecentBlockhash, false);
      return {
        context: { slot: 10 },
        value: {
          err: options.simulationError ?? null,
          accounts: params[1].accounts.addresses.map(
            (address) => after.get(address) || null,
          ),
        },
      };
    }
    throw Error(`Unexpected RPC ${method}`);
  };
  return {
    order,
    tx,
    intent: {
      wallet: signer.publicKey.toBase58(),
      inputMint: usdc.toBase58(),
      outputMint: stock.toBase58(),
      inputAmount: '100000000',
      minimumOutput: '990000',
      maximumSolDebitLamports: '1000000',
      rpc,
    },
  };
}
void test('validated exact-input intent binds exact bytes; fixture wallet signature passes', async () => {
  const { order, tx, intent } = fixture();
  const validation = await validateOrderTransaction(order, intent);
  tx.sign([signer]);
  assert.equal(
    validateSignedTransaction(
      Buffer.from(tx.serialize()).toString('base64'),
      validation,
    ),
    bs58.encode(tx.signatures[0]),
  );
  assert.equal(validation.expectedSignature, null);
  assert.equal(validation.signatureIndex, 0);
});
for (const [name, options, pattern] of [
  ['wrong payer', { payer: outsider.publicKey }, /signer|payer/],
  ['wrong receiver', { recipient: outsider.publicKey }, /accounts mismatch/],
  ['encoded amount tamper', { encodedInput: 200000000n }, /approved amounts/],
  ['appended Jupiter instruction bytes', { appended: true }, /noncanonical/],
  [
    'unrelated SOL transfer',
    {
      extra: [
        SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: outsider.publicKey,
          lamports: 1,
        }),
      ],
    },
    /Unsupported program/,
  ],
  [
    'token authority change in simulation',
    { delegate: outsider.publicKey },
    /authority/,
  ],
  ['excessive input debit', { inputAfter: 99999999 }, /wallet amounts/],
  ['insufficient minimum output', { outputAfter: 989999 }, /wallet amounts/],
  ['excessive SOL debit', { solAfter: 98000000 }, /SOL debit/],
  ['expired block height', { height: 201 }, /expired/],
  [
    'simulation failure',
    { simulationError: { InstructionError: [1, 'Custom'] } },
    /simulation failed/,
  ],
  ['RFQ unsupported', { order: { router: 'jupiterz' } }, /Metis/],
  ['unknown fee', { order: { feeBps: null } }, /fee disclosure/],
  [
    'wrong order direction',
    { order: { inputMint: stock.toBase58() } },
    /intent/,
  ],
  [
    'excessive compute unit price',
    {
      extra: [
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1000000000n,
        }),
      ],
    },
    /Priority fee/,
  ],
])
  void test(`rejects ${typeof name === 'string' ? name : 'invalid fixture'}`, async () => {
    const f = fixture(options);
    await assert.rejects(validateOrderTransaction(f.order, f.intent), pattern);
  });
void test('missing lookup tables cannot bypass account inspection', async () => {
  const lookup = new AddressLookupTableAccount({
    key: key(8).publicKey,
    state: {
      deactivationSlot: (1n << 64n) - 1n,
      lastExtendedSlot: 1,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses: [inputAta, outputAta],
    },
  });
  const f = fixture({ lookups: [lookup] });
  assert.ok(f.tx.message.addressTableLookups.length > 0);
  await assert.rejects(
    validateOrderTransaction(f.order, f.intent),
    /lookup table/,
  );
});
void test('wallet output with changed blockhash is rejected even with a valid signature', async () => {
  const f = fixture(),
    validation = await validateOrderTransaction(f.order, f.intent);
  f.tx.message.recentBlockhash = key(10).publicKey.toBase58();
  f.tx.sign([signer]);
  assert.throws(
    () =>
      validateSignedTransaction(
        Buffer.from(f.tx.serialize()).toString('base64'),
        validation,
      ),
    /changed the transaction/,
  );
});
void test('zero or tampered signature is rejected', async () => {
  const f = fixture(),
    validation = await validateOrderTransaction(f.order, f.intent);
  assert.throws(
    () => validateSignedTransaction(f.order.transaction, validation),
    /Invalid wallet signature/,
  );
  f.tx.sign([signer]);
  f.tx.signatures[0][20] ^= 1;
  assert.throws(
    () =>
      validateSignedTransaction(
        Buffer.from(f.tx.serialize()).toString('base64'),
        validation,
      ),
    /Invalid wallet signature/,
  );
});
void test('trailing bytes, malformed base64, and unsupported message versions fail closed', async () => {
  for (const transaction of [
    '@bad',
    Buffer.concat([
      Buffer.from(fixture().order.transaction, 'base64'),
      Buffer.from([0]),
    ]).toString('base64'),
  ]) {
    const f = fixture({ order: { transaction } });
    await assert.rejects(validateOrderTransaction(f.order, f.intent));
  }
});
void test('patched jayson preserves web3 JSON-RPC request/response behavior without networking', async () => {
  let called = false;
  const connection = new Connection('http://127.0.0.1:8899', {
    fetch: async (_url, request) => {
      called = true;
      const input = JSON.parse(request.body);
      assert.equal(input.jsonrpc, '2.0');
      assert.equal(input.method, 'getBlockHeight');
      assert.equal(typeof input.id, 'string');
      assert.ok(input.id.length > 0);
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: input.id, result: 123 }),
        { status: 200 },
      );
    },
  });
  assert.equal(await connection.getBlockHeight('confirmed'), 123);
  assert.ok(called);
});
void test('patched TOML preserves Anchor buffer parsing and rejects prototype mutation input', () => {
  const fromHere = createRequire(import.meta.url);
  const fromAnchor = createRequire(fromHere.resolve('@coral-xyz/anchor'));
  const toml = fromAnchor('toml');
  const parsed = toml.parse(
    Buffer.from(
      '[provider]\ncluster = "localnet"\nwallet = "fixture-only.json"\n',
    ),
  );
  assert.equal(parsed.provider.cluster, 'localnet');
  assert.equal(parsed.provider.wallet, 'fixture-only.json');
  try {
    toml.parse('[__proto__]\nfloatAuditFixture = "bad"\n');
  } catch {
    /* rejection is also acceptable */
  }
  assert.equal(Object.prototype.floatAuditFixture, undefined);
});
void test('bundled Jupiter instruction schema matches reviewed hash', async () => {
  const { readFile } = await import('node:fs/promises');
  const idl = await readFile(
    new URL('../lib/trading/jupiter-v6.idl.json', import.meta.url),
  );
  assert.equal(
    createHash('sha256').update(idl).digest('hex'),
    '06971c16444a35fa89c7d272a8fce155b2321b67f16b1ca4f2bc3195cabac3cb',
  );
});

void test('route_v2 binds canonical bytes, exact accounts and simulated wallet deltas', async () => {
  for (const destination of [undefined, outputAta]) {
    const { order, tx, intent } = fixture({ v2: true, destination });
    const validation = await validateOrderTransaction(order, intent);
    tx.sign([signer]);
    assert.equal(validateSignedTransaction(Buffer.from(tx.serialize()).toString('base64'), validation), bs58.encode(tx.signatures[0]));
  }
});
void test('route_v2 rejects all mismatched fixed accounts, fees, amount tampering and malformed data', async () => {
  for (const wrongMeta of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const { order, intent } = fixture({ v2: true, wrongMeta });
    await assert.rejects(validateOrderTransaction(order, intent), /accounts mismatch/);
  }
  for (const options of [
    { positiveSlippage: 1 }, { positiveSlippage: 10000 }, { platformFee: 256 },
    { encodedInput: 100000001n }, { slippage: 501 }, { variant: 255 },
    { appended: true }, { inputAfter: 99999999 }, { outputAfter: 1 },
    { simulationError: 'failed' },
  ]) {
    const { order, intent } = fixture({ v2: true, ...options });
    await assert.rejects(validateOrderTransaction(order, intent));
  }
});
