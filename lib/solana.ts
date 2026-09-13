type ParsedInfo = {
  decimals: number;
  isInitialized?: boolean;
  extensions?: { extension: string; state?: Record<string, unknown> }[];
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
  value: RpcAccount | { pubkey?: string; account: RpcAccount }[] | null;
};
import { ed25519 } from '@noble/curves/ed25519.js';
import { AppError, cohortFor } from './validation';
import { TOKEN_PROGRAMS, TOKENS, type StockToken } from './tokens';
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
  const rpc = rpcClient(rpcUrl, fetcher);
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

function rpcClient(rpcUrl: string, fetcher: typeof fetch) {
  return async (method: string, params: unknown[]): Promise<RpcResult> => {
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
}

/** Detect only registry-approved assets. Unrelated tokens never leave this function. */
export async function detectHoldings(
  wallet: string,
  rpcUrl = 'https://api.mainnet-beta.solana.com',
  fetcher: typeof fetch = fetch,
  includeAmounts = false,
  tokens: readonly StockToken[] = TOKENS,
) {
  validWallet(wallet);
  const rpc = rpcClient(rpcUrl, fetcher);
  const scans = await Promise.all(
    TOKEN_PROGRAMS.map((program) =>
      rpc('getTokenAccountsByOwner', [
        wallet,
        { programId: program },
        { encoding: 'jsonParsed', commitment: 'finalized' },
      ]),
    ),
  );
  const byMint = new Map(tokens.map((t) => [t.mint, t]));
  const candidates = new Map<
    string,
    {
      symbol: string;
      program: string;
      decimals: number;
      amount: bigint;
      slot: number;
    }
  >();
  const seen = new Set<string>();
  for (const [index, scan] of scans.entries()) {
    if (
      !Array.isArray(scan.value) ||
      !Number.isSafeInteger(scan.context?.slot) ||
      scan.context.slot < 0
    )
      throw new AppError(
        'The balance service returned an incomplete holdings check. Please try again.',
        503,
      );
    for (const entry of scan.value) {
      const parsed = entry.account?.data?.parsed;
      const token = byMint.get(parsed?.info?.mint || '');
      if (!token) continue;
      const info = parsed!.info;
      if (
        entry.account.owner !== TOKEN_PROGRAMS[index] ||
        parsed?.type !== 'account' ||
        info.owner !== wallet ||
        !['initialized', 'frozen'].includes(info.state || '')
      )
        throw new AppError(
          'A supported token account could not be validated. Please try again.',
          503,
        );
      const amount = info.tokenAmount?.amount,
        decimals = info.tokenAmount?.decimals;
      if (
        typeof amount !== 'string' ||
        !/^\d{1,20}$/.test(amount) ||
        BigInt(amount) > 18446744073709551615n ||
        !Number.isInteger(decimals) ||
        decimals! < 0 ||
        decimals! > 18
      )
        throw new AppError(
          'The balance service returned an invalid token balance.',
          503,
        );
      if (entry.pubkey && seen.has(entry.pubkey)) continue;
      if (entry.pubkey) seen.add(entry.pubkey);
      if (BigInt(amount) === 0n) continue;
      const previous = candidates.get(token.mint);
      if (
        previous &&
        (previous.program !== entry.account.owner ||
          previous.decimals !== decimals)
      )
        throw new AppError(
          'The balance service returned inconsistent token accounts.',
          503,
        );
      candidates.set(token.mint, {
        symbol: token.symbol,
        program: entry.account.owner,
        decimals: decimals!,
        amount: (previous?.amount || 0n) + BigInt(amount),
        slot: scan.context.slot,
      });
    }
  }
  if (!candidates.size) return [];
  const mints = [...candidates.keys()];
  const values: (RpcAccount | null)[] = [];
  const minContextSlot = Math.max(...scans.map((s) => s.context.slot));
  for (let offset = 0; offset < mints.length; offset += 100) {
    const batch = mints.slice(offset, offset + 100);
    const result = await rpc('getMultipleAccounts', [
      batch,
      {
        encoding: 'jsonParsed',
        commitment: 'finalized',
        minContextSlot,
      },
    ]);
    const checked = result.value as unknown as (RpcAccount | null)[];
    if (
      !Array.isArray(checked) ||
      checked.length !== batch.length ||
      !Number.isSafeInteger(result.context?.slot) ||
      result.context.slot < minContextSlot
    )
      throw new AppError(
        'The balance service returned an incomplete mint check.',
        503,
      );
    values.push(...checked);
  }
  const verifiedAt = Date.now();
  const holdings = mints.map((mint, index) => {
    const candidate = candidates.get(mint)!,
      value = values[index],
      parsed = value?.data?.parsed;
    if (
      value?.owner !== candidate.program ||
      parsed?.type !== 'mint' ||
      parsed.info.isInitialized !== true ||
      parsed.info.decimals !== candidate.decimals
    )
      throw new AppError(
        'A supported mint did not pass onchain validation.',
        503,
      );
    return {
      symbol: candidate.symbol,
      verifiedAt,
      slot: candidate.slot,
      ...(includeAmounts
        ? {
            rawAmount: candidate.amount.toString(),
            decimals: candidate.decimals,
            uiAmount: displayTokenAmount(
              candidate.amount.toString(),
              candidate.decimals,
              parsed.info.extensions,
              verifiedAt,
            ),
          }
        : {}),
    };
  });
  return holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

// Exact integer arithmetic, including the issuer's active Scaled UI Amount multiplier.
export function displayTokenAmount(
  amount: string,
  decimals: number,
  extensions: ParsedInfo['extensions'],
  now = Date.now(),
) {
  const config = extensions?.find(
    (e) => e.extension === 'scaledUiAmountConfig',
  )?.state;
  if (extensions?.some((e) => e.extension === 'interestBearingConfig'))
    return null;
  let multiplier = '1';
  if (config) {
    const effective = Number(config.newMultiplierEffectiveTimestamp);
    const active =
      Number.isFinite(effective) && effective <= now / 1000
        ? config.newMultiplier
        : config.multiplier;
    if (typeof active !== 'string' || !/^\d{1,18}(\.\d{1,24})?$/.test(active))
      return null;
    multiplier = active;
  }
  const [whole, fraction = ''] = multiplier.split('.');
  const scaled =
    (BigInt(amount) * BigInt(whole + fraction)) /
    10n ** BigInt(fraction.length);
  const digits = scaled.toString().padStart(decimals + 1, '0');
  return decimals
    ? (digits.slice(0, -decimals) + '.' + digits.slice(-decimals)).replace(
        /\.?0+$/,
        '',
      ) || '0'
    : digits;
}
