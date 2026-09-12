import { TOKENS, TOKEN_PROGRAMS, type StockToken } from './tokens';

export type MintSupply = {
  supply: number;
  valuationSafe?: boolean;
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
  tokens: readonly StockToken[] = TOKENS,
): Record<string, MintSupply> {
  const root = record(raw),
    result = record(root.result),
    slot = record(result.context).slot;
  if (
    root.error ||
    !Array.isArray(result?.value) ||
    result.value.length !== tokens.length ||
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
    out[tokens[index].symbol] = {
      // Non-unit display multipliers need a documented quote-unit basis.
      // Retain raw supply but exclude ambiguous valuations instead of mixing units.
      valuationSafe:
        tokens[index].issuer === 'backpack' ||
        !Array.isArray(info.extensions) ||
        !info.extensions.some((entry: unknown) => {
          const e = record(entry),
            state = record(e.state);
          if (e.extension === 'interestBearingConfig') return true;
          if (e.extension !== 'scaledUiAmountConfig') return false;
          const effective = Number(state.newMultiplierEffectiveTimestamp);
          return (
            Number(
              Number.isFinite(effective) && effective <= now / 1000
                ? state.newMultiplier
                : state.multiplier,
            ) !== 1
          );
        }),
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
  tokens: readonly StockToken[] = TOKENS,
) {
  if (tokens.length > 100) {
    const out: Record<string, MintSupply> = {};
    for (let i = 0; i < tokens.length; i += 100)
      Object.assign(
        out,
        await fetchSupplies(rpcUrl, fetcher, tokens.slice(i, i + 100)),
      );
    return out;
  }
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
        tokens.map((t) => t.mint),
        { encoding: 'jsonParsed', commitment: 'finalized' },
      ],
    }),
  });
  if (!response.ok)
    throw new Error(
      'Solana supply service unavailable: HTTP ' + response.status,
    );
  return parseSupplies(await response.json(), Date.now(), tokens);
}
