import { createHash, timingSafeEqual } from 'node:crypto';
import reviewedIdl from './jupiter-v6.idl.json' with { type: 'json' };
import reviewedV2Idl from './jupiter-route-v2.idl.json' with { type: 'json' };
import { BorshInstructionCoder } from '@coral-xyz/anchor/dist/cjs/coder/borsh/instruction.js';
import { AddressLookupTableAccount, AddressLookupTableProgram, ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, unpackAccount, unpackMint } from './token-codecs.mjs';
import { ed25519 } from '@noble/curves/ed25519.js';
import bs58 from 'bs58';

const JUPITER = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
const EVENT_AUTHORITY = new PublicKey('D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf');
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const U64_MAX = (1n << 64n) - 1n;
export class TradePolicyError extends Error {}
const discriminator = (name) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const instructionCoders = new Map();
function instructionCoder(v2) {
  try {
    if (!instructionCoders.has(v2)) instructionCoders.set(v2, new BorshInstructionCoder(v2 ? reviewedV2Idl : reviewedIdl));
    return instructionCoders.get(v2);
  } catch { throw Error('Reviewed Jupiter instruction codec is unavailable; signing is disabled.'); }
}
const same = (a, b) => a?.toString() === b?.toString();
function requireThat(ok, message) { if (!ok) throw new TradePolicyError(message); }
function uint(value, name) {
  requireThat(typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value), `Invalid ${name}.`);
  const n = BigInt(value); requireThat(n <= U64_MAX, `${name} exceeds u64.`); return n;
}
function decode(base64) {
  requireThat(typeof base64 === 'string' && base64.length <= 1800 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64), 'Invalid transaction encoding.');
  const bytes = Buffer.from(base64, 'base64');
  requireThat(bytes.length > 0 && bytes.length <= 1232 && bytes.toString('base64') === base64, 'Invalid transaction size or encoding.');
  const tx = VersionedTransaction.deserialize(bytes);
  requireThat(tx.version === 0, 'Only v0 transactions are supported.');
  requireThat(Buffer.from(tx.serialize()).equals(bytes), 'Noncanonical transaction.');
  return tx;
}
function accountInfo(value) {
  if (value == null) return null;
  requireThat(Array.isArray(value.data) && value.data[1] === 'base64' && typeof value.data[0] === 'string', 'Invalid RPC account data.');
  requireThat(Number.isSafeInteger(value.lamports) && value.lamports >= 0, 'Invalid RPC lamports.');
  return { ...value, owner: new PublicKey(value.owner), data: Buffer.from(value.data[0], 'base64') };
}
function tokenAccount(address, info) {
  if (!info || (!info.owner.equals(TOKEN_PROGRAM_ID) && !info.owner.equals(TOKEN_2022_PROGRAM_ID))) return null;
  // Mint accounts may also be writable in routes. Never interpret them as balances.
  if (info.data.length < 165) return null;
  return unpackAccount(address, info, info.owner);
}
function unchangedAuthority(before, after) {
  return same(before.owner, after.owner) && same(before.mint, after.mint) && same(before.delegate, after.delegate)
    && same(before.closeAuthority, after.closeAuthority) && before.delegatedAmount === after.delegatedAmount
    && before.isFrozen === after.isFrozen && before.isNative === after.isNative && Buffer.from(before.tlvData).equals(Buffer.from(after.tlvData));
}

/** Narrow mainnet ExactIn policy, not a general-purpose transaction firewall.
 * RPC returns standard JSON-RPC `result` objects, and must use a trusted fixed URL.
 * Unknown routers/instructions, missing ALTs/simulation, and economic mismatches fail closed.
 */
export async function validateOrderTransaction(order, { wallet, inputMint, outputMint, inputAmount, minimumOutput, maximumSolDebitLamports, rpc }) {
  const taker = new PublicKey(wallet), inMint = new PublicKey(inputMint), outMint = new PublicKey(outputMint);
  const amount = uint(inputAmount, 'input amount'), minOut = uint(minimumOutput, 'minimum output');
  const maxSol = uint(String(maximumSolDebitLamports), 'SOL debit limit');
  requireThat(amount > 0n && minOut > 0n && maxSol <= 10_000_000n, 'Invalid amount or excessive SOL debit limit.');
  requireThat(inputMint !== outputMint && [inputMint, outputMint].includes(USDC), 'Only USDC-stock pairs are supported.');
  requireThat(order?.router === 'metis' && order.swapMode === 'ExactIn', 'Only Metis ExactIn is supported.');
  requireThat(order.inputMint === inputMint && order.outputMint === outputMint && order.inAmount === inputAmount, 'Order does not match intent.');
  requireThat(order.taker == null || order.taker === wallet, 'Order wallet mismatch.');
  requireThat(order.payer == null || order.payer === wallet, 'Sponsored orders are unsupported.');
  requireThat(typeof order.requestId === 'string' && order.requestId.length > 0 && order.requestId.length <= 200, 'Missing order identifier.');
  requireThat(uint(order.outAmount, 'quoted output') >= minOut && uint(order.otherAmountThreshold, 'output threshold') >= minOut, 'Order minimum output mismatch.');
  requireThat(Number.isInteger(order.feeBps) && order.feeBps >= 0 && order.feeBps <= 100 && [inputMint, outputMint].includes(order.feeMint), 'Missing or excessive fee disclosure.');
  requireThat(Number.isSafeInteger(order.lastValidBlockHeight) && order.lastValidBlockHeight > 0, 'Missing block expiry.');
  const tx = decode(order.transaction);
  requireThat(tx.message.header.numRequiredSignatures === 1 && tx.signatures.length === 1, 'Only one signer is supported.');
  requireThat(tx.message.staticAccountKeys[0].equals(taker), 'Fee payer must be the selected wallet.');
  requireThat(tx.signatures[0].every((n) => n === 0), 'Order must be unsigned.');
  const height = await rpc('getBlockHeight', [{ commitment: 'confirmed' }]);
  requireThat(Number.isSafeInteger(height) && height <= order.lastValidBlockHeight, 'Order has expired.');
  const tables = [];
  for (const lookup of tx.message.addressTableLookups) {
    const response = await rpc('getAccountInfo', [lookup.accountKey.toBase58(), { encoding: 'base64', commitment: 'confirmed' }]);
    const info = accountInfo(response?.value);
    requireThat(info && info.owner.equals(AddressLookupTableProgram.programId) && !info.executable, 'Invalid or missing lookup table.');
    const state = AddressLookupTableAccount.deserialize(info.data);
    requireThat(state.deactivationSlot === U64_MAX, 'Inactive lookup table.');
    requireThat([...lookup.writableIndexes, ...lookup.readonlyIndexes].every((i) => i < state.addresses.length), 'Invalid lookup table index.');
    tables.push(new AddressLookupTableAccount({ key: lookup.accountKey, state }));
  }
  const message = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: tables });
  const mintResponse = await rpc('getMultipleAccounts', [[inputMint, outputMint], { encoding: 'base64', commitment: 'confirmed' }]);
  requireThat(mintResponse?.value?.length === 2, 'Missing mint account data.');
  const mintInfos = mintResponse.value.map(accountInfo);
  for (let i = 0; i < mintInfos.length; i++) {
    const info = mintInfos[i];
    requireThat(info && !info.executable && [TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(info.owner.toBase58()), 'Invalid mint program.');
    requireThat(unpackMint(i === 0 ? inMint : outMint, info, info.owner).isInitialized, 'Uninitialized mint.');
  }
  const inputAta = getAssociatedTokenAddressSync(inMint, taker, false, mintInfos[0].owner);
  const outputAta = getAssociatedTokenAddressSync(outMint, taker, false, mintInfos[1].owner);
  let swapCount = 0, computeUnits = null, computePrice = null;
  for (const instruction of message.instructions) {
    const data = instruction.data, keys = instruction.keys;
    if (instruction.programId.equals(ComputeBudgetProgram.programId)) {
      requireThat(keys.length === 0, 'Unexpected compute-budget accounts.');
      if (data[0] === 2 && data.length === 5 && computeUnits == null) {
        computeUnits = data.readUInt32LE(1); requireThat(computeUnits > 0 && computeUnits <= 1_400_000, 'Invalid compute limit.');
      } else if (data[0] === 3 && data.length === 9 && computePrice == null) computePrice = data.readBigUInt64LE(1);
      else throw Error('Unsupported or duplicate compute-budget instruction.');
      continue;
    }
    if (instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      requireThat(data.length === 1 && data[0] === 1 && keys.length === 6, 'Only idempotent ATA creation is supported.');
      const mintIndex = keys[3].pubkey.equals(inMint) ? 0 : keys[3].pubkey.equals(outMint) ? 1 : -1;
      requireThat(mintIndex >= 0 && keys[0].pubkey.equals(taker) && keys[0].isSigner && keys[2].pubkey.equals(taker)
        && keys[1].pubkey.equals(mintIndex === 0 ? inputAta : outputAta)
        && keys[4].pubkey.toBase58() === '11111111111111111111111111111111' && keys[5].pubkey.equals(mintInfos[mintIndex].owner), 'Unexpected ATA creation.');
      continue;
    }
    requireThat(instruction.programId.equals(JUPITER), 'Unsupported program or transfer/authority instruction.');
    swapCount++;
    requireThat(swapCount === 1 && data.length >= 31, 'Only one supported swap instruction is allowed.');
    const isRoute = data.subarray(0, 8).equals(discriminator('route'));
    const isShared = data.subarray(0, 8).equals(discriminator('shared_accounts_route'));
    const isV2 = data.subarray(0, 8).equals(discriminator('route_v2'));
    requireThat(isRoute || isShared || isV2, 'Unsupported Jupiter instruction.');
    // Full IDL decode plus canonical re-encode prevents ignored/appended bytes from
    // masquerading as approved amounts. Unknown newer route variants fail closed.
    const coder = instructionCoder(isV2);
    const decoded = coder.decode(data);
    requireThat(decoded && ['route', 'sharedAccountsRoute', 'routeV2'].includes(decoded.name)
      && Buffer.from(coder.encode(decoded.name, decoded.data)).equals(data), 'Unsupported or noncanonical Jupiter instruction data.');
    const encodedInput = uint(decoded.data.inAmount.toString(), 'instruction input');
    const quotedOutput = uint(decoded.data.quotedOutAmount.toString(), 'instruction output');
    const slippage = decoded.data.slippageBps;
    requireThat(Number.isInteger(slippage) && slippage >= 0, 'Invalid instruction slippage.');
    requireThat(encodedInput === amount && slippage <= 500 && quotedOutput * BigInt(10_000 - slippage) / 10_000n >= minOut, 'Swap instruction does not enforce the approved amounts.');
    requireThat(Number.isInteger(decoded.data.platformFeeBps) && decoded.data.platformFeeBps >= 0 && decoded.data.platformFeeBps <= order.feeBps, 'Undisclosed platform fee.');
    if (isV2) {
      requireThat(decoded.data.positiveSlippageBps === 0, 'Positive-slippage fees are unsupported.');
      requireThat(keys.length >= 10 && keys[0].pubkey.equals(taker) && keys[0].isSigner
        && keys[1].pubkey.equals(inputAta) && keys[1].isWritable && keys[2].pubkey.equals(outputAta) && keys[2].isWritable
        && keys[3].pubkey.equals(inMint) && keys[4].pubkey.equals(outMint)
        && keys[5].pubkey.equals(mintInfos[0].owner) && keys[6].pubkey.equals(mintInfos[1].owner)
        && (keys[7].pubkey.equals(JUPITER) || keys[7].pubkey.equals(outputAta))
        && keys[8].pubkey.equals(EVENT_AUTHORITY) && keys[9].pubkey.equals(JUPITER), 'Route-v2 accounts mismatch.');
    } else if (isShared) requireThat(keys.length >= 13 && keys[2].pubkey.equals(taker) && keys[2].isSigner && keys[3].pubkey.equals(inputAta)
      && keys[6].pubkey.equals(outputAta) && keys[7].pubkey.equals(inMint) && keys[8].pubkey.equals(outMint), 'Shared-route accounts mismatch.');
    else requireThat(keys.length >= 9 && keys[1].pubkey.equals(taker) && keys[1].isSigner && keys[2].pubkey.equals(inputAta)
      && keys[3].pubkey.equals(outputAta) && keys[4].pubkey.equals(outputAta) && keys[5].pubkey.equals(outMint), 'Route accounts mismatch.');
  }
  requireThat(swapCount === 1, 'Missing swap instruction.');
  requireThat((BigInt(computeUnits ?? 1_400_000) * (computePrice ?? 0n) + 999_999n) / 1_000_000n <= maxSol, 'Priority fee exceeds approved SOL budget.');
  const accounts = tx.message.getAccountKeys({ addressLookupTableAccounts: tables });
  const writable = Array.from({ length: accounts.length }, (_, i) => i).filter((i) => tx.message.isAccountWritable(i)).map((i) => accounts.get(i));
  requireThat(writable.length <= 64 && writable.some((a) => a.equals(taker)) && writable.some((a) => a.equals(inputAta)) && writable.some((a) => a.equals(outputAta)), 'Required writable accounts missing.');
  const addresses = writable.map((a) => a.toBase58());
  const beforeResponse = await rpc('getMultipleAccounts', [addresses, { encoding: 'base64', commitment: 'confirmed' }]);
  requireThat(beforeResponse?.value?.length === addresses.length && Number.isSafeInteger(beforeResponse?.context?.slot), 'Incomplete pre-simulation accounts.');
  const simulation = await rpc('simulateTransaction', [order.transaction, { encoding: 'base64', commitment: 'confirmed', sigVerify: false,
    replaceRecentBlockhash: false, minContextSlot: beforeResponse.context.slot, innerInstructions: true, accounts: { encoding: 'base64', addresses } }]);
  requireThat(simulation?.value?.err === null && simulation?.value?.accounts?.length === addresses.length
    && Number.isSafeInteger(simulation.context?.slot) && simulation.context.slot >= beforeResponse.context.slot, 'Transaction simulation failed or incomplete.');
  const deltas = new Map(); let walletChecked = false;
  for (let i = 0; i < addresses.length; i++) {
    const before = accountInfo(beforeResponse.value[i]), after = accountInfo(simulation.value.accounts[i]);
    if (writable[i].equals(taker)) {
      requireThat(before && after && before.owner.toBase58() === '11111111111111111111111111111111' && after.owner.equals(before.owner)
        && before.data.length === 0 && after.data.length === 0 && !after.executable && BigInt(before.lamports) - BigInt(after.lamports) <= maxSol, 'Unexpected wallet SOL debit or account mutation.');
      walletChecked = true;
    }
    const preToken = tokenAccount(writable[i], before), postToken = tokenAccount(writable[i], after);
    if (preToken?.owner.equals(taker)) {
      requireThat(postToken && unchangedAuthority(preToken, postToken) && before.owner.equals(after.owner) && after.lamports >= before.lamports, 'Wallet token account authority, extension, or rent changed.');
    }
    if (!preToken?.owner.equals(taker) && postToken?.owner.equals(taker)) {
      requireThat(!before && (writable[i].equals(inputAta) || writable[i].equals(outputAta)) && !postToken.delegate && !postToken.closeAuthority && !postToken.isFrozen && postToken.delegatedAmount === 0n, 'Unexpected new wallet token account.');
    }
    if (preToken?.owner.equals(taker) || postToken?.owner.equals(taker)) {
      const mint = (preToken || postToken).mint.toBase58();
      const delta = (postToken?.owner.equals(taker) ? postToken.amount : 0n) - (preToken?.owner.equals(taker) ? preToken.amount : 0n);
      deltas.set(mint, (deltas.get(mint) || 0n) + delta);
    }
  }
  requireThat(walletChecked && deltas.get(inputMint) === -amount && (deltas.get(outputMint) || 0n) >= minOut, 'Simulated wallet amounts do not match the trade.');
  for (const [mint, delta] of deltas) requireThat([inputMint, outputMint].includes(mint) || delta === 0n, 'Unexpected third-token balance change.');
  const messageBase64 = Buffer.from(tx.message.serialize()).toString('base64');
  return Object.freeze({ messageBase64, messageHash: createHash('sha256').update(tx.message.serialize()).digest('hex'), signatureIndex: 0, expectedSignature: null,
    wallet, requestId: order.requestId, inputMint, outputMint, inputAmount, minimumOutput, lastValidBlockHeight: order.lastValidBlockHeight,
    recentBlockhash: tx.message.recentBlockhash, validatedAt: Date.now(), simulationSlot: simulation.context?.slot ?? null });
}

export function validateSignedTransaction(base64, validation) {
  requireThat(validation && typeof validation.messageBase64 === 'string' && validation.signatureIndex === 0, 'Missing transaction validation.');
  const tx = decode(base64), message = Buffer.from(tx.message.serialize()), expected = Buffer.from(validation.messageBase64, 'base64');
  requireThat(message.length === expected.length && timingSafeEqual(message, expected), 'Wallet changed the transaction message.');
  requireThat(tx.signatures.length === 1 && tx.message.header.numRequiredSignatures === 1 && tx.message.staticAccountKeys[0].toBase58() === validation.wallet, 'Signed transaction signer mismatch.');
  requireThat(ed25519.verify(tx.signatures[0], message, new PublicKey(validation.wallet).toBytes()), 'Invalid wallet signature.');
  return bs58.encode(tx.signatures[0]);
}
