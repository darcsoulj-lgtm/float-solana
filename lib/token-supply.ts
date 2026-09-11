import { TOKENS, TOKEN_PROGRAMS } from './tokens';

export type MintSupply = {
  supply: number;
  amount: string;
  decimals: number;
  slot: number;
  timestamp: number;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function parseSupplies(
  raw: unknown,
  now = Date.now(),
): Record<string, MintSupply> {
  const root = record(raw),
    result = record(root.result),
    slot = record(result.context).slot;
  if (
    root.error ||
    !Array.isArray(result?.value) ||
    result.value.length !== TOKENS.length ||
    typeof slot !== 'number' ||
    !Number.isSafeInteger(slot) ||
    slot < 0
  )
    throw new Error('Incomplete Solana supply response');
  const out: Record<string, MintSupply> = {};
  result.value.forEach((value: unknown, index: number) => {
    const account = record(value),
      parsed = record(record(account.data).parsed),
      info = record(parsed.info);
    if (
      typeof account.owner !== 'string' ||
      !TOKEN_PROGRAMS.includes(account.owner) ||
      account.executable !== false ||
      parsed?.type !== 'mint' ||
      info?.isInitialized !== true ||
      typeof info.decimals !== 'number' ||
      !Number.isInteger(info.decimals) ||
      info.decimals < 0 ||
      info.decimals > 18 ||
      typeof info.supply !== 'string' ||
      !/^\d{1,20}$/.test(info.supply) ||
      BigInt(info.supply) > 18446744073709551615n
    )
      return;
    out[TOKENS[index].symbol] = {
      supply: Number(info.supply) / 10 ** info.decimals,
      amount: info.supply,
      decimals: info.decimals,
      slot,
      timestamp: now,
    };
  });
  if (!Object.keys(out).length) throw new Error('No validated Solana supplies');
  return out;
}
export async function fetchSupplies(
  rpcUrl = 'https://api.mainnet-beta.solana.com',
  fetcher: typeof fetch = fetch,
) {
  // Fixed allowlisted mints only. No wallet addresses or client-supplied endpoints.
  const response = await fetcher(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getMultipleAccounts',
      params: [
        TOKENS.map((t) => t.mint),
        { encoding: 'jsonParsed', commitment: 'finalized' },
      ],
    }),
  });
  if (!response.ok) throw new Error('Solana supply service unavailable');
  return parseSupplies(await response.json());
}
