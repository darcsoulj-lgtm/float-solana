import { TradeError, USDC } from './service.mjs';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from './token-codecs.mjs';

function decimal(raw, decimals) {
  const digits = raw.toString().padStart(decimals + 1, '0');
  return decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits;
}
function balance(account, wallet, mint, decimals, program) {
  if (account === null) return decimal(0n, decimals);
  const parsed = account?.data?.parsed, info = parsed?.info;
  if (account?.owner !== program || parsed?.type !== 'account' ||
    info?.owner !== wallet || info?.mint !== mint ||
    !['initialized', 'frozen'].includes(info?.state) ||
    info?.tokenAmount?.decimals !== decimals ||
    typeof info?.tokenAmount?.amount !== 'string' ||
    !/^(0|[1-9]\d{0,19})$/.test(info.tokenAmount.amount))
    throw new TradeError('Balance could not be verified. Try again.');
  const raw = BigInt(info.tokenAmount.amount);
  if (raw > (1n << 64n) - 1n) throw new TradeError('Balance could not be verified. Try again.');
  return decimal(info.state === 'initialized' ? raw : 0n, decimals);
}

// Only the associated accounts used by this trade; not a whole-wallet portfolio.
// Preparation still checks current funds and simulates the actual transaction.
export async function tradingBalances(symbol, session, { resolveToken, rpc }, now = Date.now) {
  const token = await resolveToken(symbol);
  if (![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(token.program))
    throw new TradeError('Token account could not be verified.');
  const owner = new PublicKey(session.wallet);
  const addresses = [
    getAssociatedTokenAddressSync(new PublicKey(token.mint), owner, false, new PublicKey(token.program)).toBase58(),
    getAssociatedTokenAddressSync(new PublicKey(USDC), owner).toBase58(),
  ];
  const [accounts, sol] = await Promise.all([
    rpc('getMultipleAccounts', [addresses, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
    rpc('getBalance', [session.wallet, { commitment: 'confirmed' }]),
  ]);
  if (!Array.isArray(accounts?.value) || accounts.value.length !== 2)
    throw new TradeError('Balance unavailable. Try again.');
  if (!Number.isSafeInteger(sol?.value) || sol.value < 0) throw new TradeError('SOL balance unavailable. Try again.');
  return { symbol: token.symbol, token: balance(accounts.value[0], session.wallet, token.mint, token.decimals, token.program), usdc: balance(accounts.value[1], session.wallet, USDC, 6, TOKEN_PROGRAM_ID.toBase58()), sol: decimal(BigInt(sol.value), 9), checkedAt: now() };
}
