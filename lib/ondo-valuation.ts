import { TOKENS, type StockToken } from './tokens';
import { SourceHttpError } from './market-data';
import { readBoundedText } from './request-body';

export const ONDO_VALUE_URL =
  'https://api.llama.fi/protocol/ondo-global-markets';
export const ONDO_VALUE_MAX_AGE_MS = 36 * 3600000;
export type OndoValueSnapshot = {
  observedAt: number;
  rows: Record<string, { mint: string; supply: number; valueUsd: number }>;
  excluded: string[];
  reportedTokens: number;
};
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const amount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

// The provider's Global Markets adapter values mint supplies, not free float.
// Read only its named Solana breakdown, never protocol TVL or global market cap.
// Quantities and USD values must share one timestamp. Do not multiply them by
// another provider's price or by the SPL display multiplier a second time.
export function parseOndoValues(
  raw: unknown,
  now = Date.now(),
  tokens: readonly StockToken[] = TOKENS,
): OndoValueSnapshot {
  const root = record(raw);
  if (root.name !== 'Ondo Global Markets') throw Error('Wrong issuer dataset');
  const chain = record(record(root.chainTvls).Solana);
  const values = Array.isArray(chain.tokensInUsd)
    ? chain.tokensInUsd.map(record)
    : [];
  const supplies = Array.isArray(chain.tokens) ? chain.tokens.map(record) : [];
  const latest = [...values].sort((a, b) => Number(b.date) - Number(a.date))[0];
  const observedAt = Number(latest?.date) * 1000;
  if (
    !Number.isFinite(observedAt) ||
    observedAt <= 0 ||
    observedAt > now + 60000 ||
    now - observedAt > ONDO_VALUE_MAX_AGE_MS
  )
    throw Error('Ondo valuation snapshot is missing or expired');
  const matching = supplies.filter((s) => s.date === latest.date);
  if (
    matching.length !== 1 ||
    values.filter((v) => v.date === latest.date).length !== 1
  )
    throw Error('Mismatched Ondo supply and value timestamps');
  const units = record(matching[0].tokens);
  const usd = record(latest.tokens);
  const entries = Object.entries(usd);
  if (!entries.length || entries.length > 2000)
    throw Error('Invalid Ondo coverage');
  const identities = new Map<string, StockToken>();
  for (const token of tokens.filter((t) => t.issuer === 'ondo')) {
    const key = token.symbol.toUpperCase();
    if (identities.has(key)) throw Error('Ambiguous Ondo symbol');
    identities.set(key, token);
  }
  const rows: OndoValueSnapshot['rows'] = {};
  const excluded: string[] = [];
  for (const [symbol, valueUsd] of entries) {
    const supply = units[symbol];
    if (
      !amount(valueUsd) ||
      !amount(supply) ||
      (supply === 0 && valueUsd !== 0)
    )
      throw Error('Invalid Ondo token valuation');
    const token = identities.get(symbol);
    // This endpoint has an issuer-specific asset universe, not a symbol search.
    // Unknown products and cash/yield tokens cannot silently enter our equity registry.
    if (!token || ['USDON', 'USDY', 'OUSG'].includes(symbol)) {
      excluded.push(symbol);
      continue;
    }
    rows[token.symbol] = { mint: token.mint, supply, valueUsd };
  }
  if (!Object.keys(rows).length) throw Error('No supported Ondo tokens valued');
  return { observedAt, rows, excluded, reportedTokens: entries.length };
}

export async function fetchOndoValues(fetcher: typeof fetch = fetch) {
  const response = await fetcher(ONDO_VALUE_URL, {
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new SourceHttpError('api.llama.fi', response);
  // The free endpoint includes history. Bound its payload for Worker memory,
  // then retain only the small latest Solana snapshot in the shared cache.
  return parseOndoValues(
    JSON.parse(await readBoundedText(response, 12 * 1024 * 1024)),
  );
}
