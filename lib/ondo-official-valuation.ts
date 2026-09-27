import { TOKENS, type StockToken } from './tokens';
import { fetchSupplies, type MintSupply } from './token-supply';
import { SourceHttpError } from './market-data';
import { readBoundedText } from './request-body';
import type { OndoValueSnapshot } from './ondo-valuation';

export const ONDO_PUBLIC_ASSETS_URL = 'https://app.ondo.finance/api/v2/assets';
// Same maximum as dated equity references elsewhere; never a live/executable quote.
export const ONDO_REFERENCE_MAX_AGE_MS = 96 * 3600000;
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const recent = (time: number, now: number, age: number) =>
  Number.isFinite(time) && time > 0 && time <= now + 60000 && now - time <= age;

// Primary-market history is priced per unscaled token. Ondo documents that
// scaling changes balance AND unit price reciprocally. Use raw mint supply,
// never multiply this token price by the display multiplier again.
// https://docs.ondo.finance/ondo-stocks/token-and-quote-pricing
export function parseOfficialOndoValues(
  raw: unknown,
  supplies: Record<string, MintSupply>,
  now = Date.now(),
  tokens: readonly StockToken[] = TOKENS,
): OndoValueSnapshot {
  const root = record(raw);
  if (
    !recent(Date.parse(String(root.lastUpdatedAt)), now, 3600000) ||
    !Array.isArray(root.assets) ||
    !root.assets.length ||
    root.assets.length > 2000
  )
    throw Error('Ondo asset catalog missing or expired');
  const identities = new Map(
    tokens.filter((t) => t.issuer === 'ondo').map((t) => [t.symbol, t]),
  );
  const seen = new Set<string>();
  const rows: OndoValueSnapshot['rows'] = {};
  const excluded: string[] = [];
  for (const rawAsset of root.assets) {
    const asset = record(rawAsset);
    const symbol = String(asset.symbol);
    if (seen.has(symbol)) throw Error('Duplicate Ondo asset');
    seen.add(symbol);
    const token = identities.get(symbol);
    const primary = record(asset.primaryMarket);
    const supply = supplies[symbol];
    if (
      !token ||
      primary.symbol !== symbol ||
      !supply ||
      !recent(supply.timestamp, now, 300000) ||
      !Number.isFinite(supply.supply) ||
      supply.supply < 0 ||
      !Number.isFinite(supply.multiplier) ||
      supply.multiplier! <= 0
    ) {
      excluded.push(symbol);
      continue;
    }
    const points = Array.isArray(primary.priceHistory24h)
      ? primary.priceHistory24h.map(record)
      : [];
    const latest = points.sort(
      (a, b) => Number(b.timestamp) - Number(a.timestamp),
    )[0];
    const priceAt = Number(latest?.timestamp);
    const price =
      typeof latest?.price === 'string' && /^\d+(\.\d+)?$/.test(latest.price)
        ? Number(latest.price)
        : NaN;
    // A post-quote corporate action requires a newer quote; a recent download
    // does not refresh a historical price. Reject ambiguous duplicate points.
    const valueUsd = supply.supply * price;
    if (
      !recent(priceAt, now, ONDO_REFERENCE_MAX_AGE_MS) ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(valueUsd) ||
      (supply.adjustmentAt ?? 0) > priceAt ||
      points.filter((p) => p.timestamp === priceAt).length !== 1
    ) {
      excluded.push(symbol);
      continue;
    }
    rows[symbol] = {
      mint: token.mint,
      supply: supply.supply,
      valueUsd,
      priceAt,
      supplyAt: supply.timestamp,
      slot: supply.slot,
    };
  }
  if (!Object.keys(rows).length) throw Error('No verified Ondo valuations');
  return {
    observedAt: Math.min(...Object.values(rows).map((r) => r.supplyAt!)),
    source: 'Ondo · historical token price × Solana supply',
    rows,
    excluded,
    reportedTokens: root.assets.length,
  };
}

export async function fetchOfficialOndoValues(
  rpcUrl?: string,
  fetcher: typeof fetch = fetch,
  tokens: readonly StockToken[] = TOKENS,
) {
  const response = await fetcher(ONDO_PUBLIC_ASSETS_URL, {
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new SourceHttpError('app.ondo.finance', response);
  const raw: unknown = JSON.parse(
    await readBoundedText(response, 6 * 1024 * 1024),
  );
  const supplies = await fetchSupplies(
    rpcUrl,
    fetcher,
    tokens.filter((t) => t.issuer === 'ondo'),
  );
  return parseOfficialOndoValues(raw, supplies, Date.now(), tokens);
}
