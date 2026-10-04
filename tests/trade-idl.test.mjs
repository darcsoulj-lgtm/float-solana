import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BorshInstructionCoder } from '@coral-xyz/anchor/dist/cjs/coder/borsh/instruction.js';
import idl from '../lib/trading/jupiter-route-v2.idl.json' with { type: 'json' };

void test('route_v2 codec exactly preserves pinned on-chain schema and enum ordering', () => {
  const bytes = readFileSync(new URL('./fixtures/trading/jupiter-onchain.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '46a261b4c69f7ebe7eb789f27c5d5f1744002a9a8e1fa8047cdad06359d90dde');
  const source = JSON.parse(bytes);
  assert.equal(source.address, 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
  const ix = source.instructions.find(i => i.name === 'route_v2');
  // Only IDL schema syntax changes; no Borsh fields/widths/order are changed.
  function adapt(value) {
    if (value === 'pubkey') return 'publicKey';
    if (Array.isArray(value)) return value.map(adapt);
    if (value && typeof value === 'object') {
      if (Object.keys(value).length === 1 && value.defined) return { defined: value.defined.name };
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, adapt(v)]));
    }
    return value;
  }
  assert.deepEqual(idl, { version: source.metadata.version, name: 'jupiter', instructions: [{ name: 'routeV2', accounts: [], args: adapt(ix.args) }], types: adapt(source.types) });
  assert.deepEqual([...createHash('sha256').update('global:route_v2').digest().subarray(0, 8)], ix.discriminator);
  const raw = Buffer.alloc(39);
  Buffer.from(ix.discriminator).copy(raw);
  raw.writeBigUInt64LE(987654321012345n, 8);
  raw.writeBigUInt64LE(234567890123456n, 16);
  raw.writeUInt16LE(123, 24); raw.writeUInt16LE(256, 26); raw.writeUInt16LE(10000, 28);
  raw.writeUInt32LE(1, 30); raw.writeUInt16LE(10000, 35); raw[38] = 1;
  const coder = new BorshInstructionCoder(idl);
  const decoded = coder.decode(raw);
  assert.equal(decoded.name, 'routeV2');
  assert.equal(decoded.data.inAmount.toString(), '987654321012345');
  assert.equal(decoded.data.platformFeeBps, 256);
  assert.equal(decoded.data.positiveSlippageBps, 10000);
  assert.deepEqual(decoded.data.routePlan[0], { swap: { saber: {} }, bps: 10000, inputIndex: 0, outputIndex: 1 });
  assert.deepEqual(coder.encode(decoded.name, decoded.data), raw);
  // A newer nested variant with 4 u64s, fixed byte arrays and a boolean.
  const router = Buffer.alloc(120);
  raw.subarray(0, 34).copy(router);
  router[34] = 190; // Swap::HumidiFiRouterV3, pinned enum position
  for (const offset of [35, 43, 51, 59]) router.writeBigUInt64LE(987654321012345n, offset);
  router.fill(7, 67, 99); router.fill(9, 99, 115); router[115] = 1;
  router.writeUInt16LE(10000, 116); router[119] = 1;
  const newer = coder.decode(router);
  assert.equal(newer.data.routePlan[0].swap.humidiFiRouterV3.expiry.toString(), '987654321012345');
  assert.deepEqual(coder.encode(newer.name, newer.data), router);
});
