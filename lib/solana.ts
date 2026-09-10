type ParsedInfo = {
  decimals: number;
  isInitialized?: boolean;
  owner?: string;
  mint?: string;
  state?: string;
  tokenAmount?: { amount: string; decimals: number };
};
type RpcAccount = {
  owner: string;
  data?: { parsed?: { type: string; info: ParsedInfo } };
};
type RpcResult = {
  context: { slot: number };
  value: RpcAccount | { account: RpcAccount }[] | null;
};
import { ed25519 } from '@noble/curves/ed25519.js';
import { AppError, cohortFor } from './validation';
import { TOKEN_PROGRAMS, TOKENS } from './tokens';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function decodeBase58(value: string) {
  if (typeof value !== 'string' || value.length > 100)
    throw new AppError('Invalid wallet address.');
  let n = 0n;
  for (const c of value) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new AppError('Invalid wallet address.');
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of value) {
    if (c !== '1') break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}
export function validWallet(wallet: string) {
  if (decodeBase58(wallet).length !== 32)
    throw new AppError('Invalid Solana wallet address.');
  return wallet;
}
export async function verifySignature(
  wallet: string,
  message: string,
  signature: unknown,
) {
  if (
    !Array.isArray(signature) ||
    signature.length !== 64 ||
    signature.some((x) => !Number.isInteger(x) || x < 0 || x > 255)
  )
    throw new AppError('Invalid wallet signature.');
  if (
    !ed25519.verify(
      new Uint8Array(signature),
      new TextEncoder().encode(message),
      decodeBase58(validWallet(wallet)),
      { zip215: false },
    )
  )
    throw new AppError('The wallet signature could not be verified.', 403);
}
export async function verifyHolding(
  wallet: string,
  symbol: string,
  rpcUrl = 'https://api.mainnet-beta.solana.com',
  fetcher: typeof fetch = fetch,
) {
  validWallet(wallet);
  const token = TOKENS.find((t) => t.symbol === symbol);
  if (!token?.mint)
    throw new AppError('This token is not enabled for live verification.', 503);
  const rpc = async (method: string, params: unknown[]) => {
    let r: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        r = await fetcher(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        r = undefined;
      }
      if (r && r.status !== 429 && r.status < 500) break;
      if (attempt === 0)
        await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (!r)
      throw new AppError(
        'The balance service could not be reached. Please try verification again.',
        503,
      );
    if (!r.ok) {
      // Status only: never log an RPC URL, API key, wallet, or provider response body.
      console.warn('Solana RPC HTTP failure', r.status);
      const message =
        r.status === 401 || r.status === 403
          ? 'Our balance service connection was rejected. Please contact support; this is not a problem with your holdings.'
          : r.status === 429
            ? 'The balance service has reached its request limit. Please wait a moment and verify again.'
            : 'The balance service is temporarily unavailable. Please try verification again.';
      throw new AppError(message, 503);
    }
    let data: { error?: unknown; result?: RpcResult };
    try {
      data = await r.json();
    } catch {
      throw new AppError(
        'The balance service returned an unreadable response. Please try verification again.',
        503,
      );
    }
    if (data.error || !data.result)
      throw new AppError(
        'The balance service could not complete the check. Please try verification again.',
        503,
      );
    return data.result;
  };
  const info = await rpc('getAccountInfo', [
    token.mint,
    { encoding: 'jsonParsed', commitment: 'finalized' },
  ]);
  if (Array.isArray(info.value))
    throw new AppError('Invalid mint response.', 503);
  if (
    !info.value ||
    !TOKEN_PROGRAMS.includes(info.value.owner) ||
    info.value.data?.parsed?.type !== 'mint' ||
    info.value.data?.parsed?.info?.isInitialized !== true
  )
    throw new AppError(
      'The configured mint did not pass onchain validation.',
      503,
    );
  const decimals = info.value.data!.parsed!.info.decimals;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new AppError('Unsupported mint precision.', 503);
  const result = await rpc('getTokenAccountsByOwner', [
    wallet,
    { mint: token.mint },
    {
      encoding: 'jsonParsed',
      commitment: 'finalized',
      minContextSlot: info.context.slot,
    },
  ]);
  let amount = 0n;
  if (
    !Array.isArray(result.value) ||
    !Number.isSafeInteger(result.context?.slot)
  )
    throw new AppError('Invalid ownership response.', 503);
  for (const account of result.value) {
    const parsed = account.account?.data?.parsed;
    if (
      account.account?.owner !== info.value.owner ||
      parsed?.type !== 'account'
    )
      continue;
    const a = parsed!.info;
    if (
      a.owner !== wallet ||
      a.mint !== token.mint ||
      !['initialized', 'frozen'].includes(a.state || '') ||
      a.tokenAmount?.decimals !== decimals
    )
      continue;
    if (!/^\d+$/.test(a.tokenAmount!.amount))
      throw new AppError('Invalid token balance response.', 503);
    amount += BigInt(a.tokenAmount!.amount);
  }
  return {
    cohort: cohortFor(amount, decimals),
    slot: result.context.slot,
    verifiedAt: Date.now(),
    mint: token.mint,
  };
}
