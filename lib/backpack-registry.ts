import { TOKENS, TOKEN_PROGRAMS, type StockToken } from './tokens';
import { publicJson } from './market-data';
import { marketSnapshot } from './market-cache';
import { registryTokens, type RegistryStatus } from './token-registry';

export const REGISTRY_REFRESH_MS = 5 * 60000;
export const REGISTRY_KEY = 'backpack-verified-listings-v1';
export const BACKPACK_METADATA_AUTHORITY =
  '2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a';
const REGISTRY_URL = 'https://api.backpack.exchange/api/v1/assets';
const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const symbolPattern = /^[A-Z][A-Z0-9.-]{0,15}$/;
type Candidate = { symbol: string; mint: string; decimals: number };
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};

export function backpackCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 20000)
    throw Error('Invalid Backpack registry');
  const rows: Candidate[] = [];
  for (const value of raw) {
    const a = object(value);
    if (typeof a.symbol !== 'string' || !Array.isArray(a.tokens))
      throw Error('Incomplete Backpack registry');
    if (!a.symbol.endsWith('.US')) continue;
    const symbol = a.symbol.slice(0, -3);
    if (!symbolPattern.test(symbol)) continue;
    for (const value of a.tokens) {
      const t = object(value);
      if (
        t.blockchain !== 'Solana' ||
        !(t.depositEnabled === true || t.withdrawEnabled === true)
      )
        continue;
      if (
        typeof t.contractAddress !== 'string' ||
        !mintPattern.test(t.contractAddress) ||
        typeof t.nativeDecimals !== 'number' ||
        !Number.isInteger(t.nativeDecimals) ||
        t.nativeDecimals < 0 ||
        t.nativeDecimals > 18
      )
        continue;
      rows.push({
        symbol,
        mint: t.contractAddress,
        decimals: t.nativeDecimals,
      });
    }
  }
  // Ambiguous symbols/mints fail closed, rather than selecting one arbitrarily.
  return rows.filter(
    (t) =>
      rows.filter((r) => r.symbol === t.symbol || r.mint === t.mint).length ===
      1,
  );
}

export function verifiedBackpackMints(
  candidates: Candidate[],
  raw: unknown,
): StockToken[] {
  const root = object(raw),
    result = object(root.result);
  if (
    root.error ||
    !Number.isSafeInteger(object(result.context).slot) ||
    !Array.isArray(result.value) ||
    result.value.length !== candidates.length
  )
    throw Error('Incomplete mint verification');
  const values = result.value;
  return candidates.flatMap((t, i) => {
    const account = object(values[i]);
    const parsed = object(object(account.data).parsed),
      info = object(parsed.info);
    const extensions = Array.isArray(info.extensions)
      ? info.extensions.map(object)
      : [];
    const metadata = extensions.filter((e) => e.extension === 'tokenMetadata');
    const m = object(metadata[0]?.state);
    if (
      typeof account.owner !== 'string' ||
      !TOKEN_PROGRAMS.includes(account.owner) ||
      account.executable !== false ||
      parsed.type !== 'mint' ||
      info.isInitialized !== true ||
      info.decimals !== t.decimals ||
      metadata.length !== 1 ||
      m.mint !== t.mint ||
      m.symbol !== t.symbol ||
      m.updateAuthority !== BACKPACK_METADATA_AUTHORITY ||
      typeof m.name !== 'string' ||
      m.name.length > 180 ||
      !m.name.endsWith(' - Backpack Securities') ||
      Array.from(m.name).some(
        (c) => c.charCodeAt(0) < 32 || c === '<' || c === '>',
      )
    )
      return [];
    const name = m.name.slice(0, -' - Backpack Securities'.length).trim();
    if (!name) return [];
    return [
      {
        symbol: t.symbol,
        mint: t.mint,
        name,
        shortName: name,
        underlyingSymbol: t.symbol,
        issuer: 'backpack' as const,
        source: REGISTRY_URL,
      },
    ];
  });
}

export async function discoverBackpackListings(
  previous: StockToken[],
  rpc = 'https://api.mainnet-beta.solana.com',
  fetcher: typeof fetch = fetch,
  seeds: readonly StockToken[] = TOKENS,
): Promise<StockToken[]> {
  // One whole job finishes before the cache's 20-second lease expires.
  const signal = AbortSignal.timeout(16000);
  const bounded: typeof fetch = (url, init) =>
    fetcher(url, { ...init, signal });
  const candidates = backpackCandidates(
    await publicJson(REGISTRY_URL, bounded),
  );
  if (!candidates.length) throw Error('Empty Backpack registry');
  const known = [...seeds, ...previous];
  const unseen = candidates
    .filter(
      (t) => !known.some((k) => k.symbol === t.symbol || k.mint === t.mint),
    )
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  // Bounded discovery. Subsequent refreshes continue any large listing backlog.
  const page =
    Math.floor(Date.now() / REGISTRY_REFRESH_MS) %
    Math.max(1, Math.ceil(unseen.length / 80));
  const batch = unseen.slice(page * 80, (page + 1) * 80);
  if (!batch.length) return previous;
  const response = await bounded(rpc, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getMultipleAccounts',
      params: [
        batch.map((t) => t.mint),
        { encoding: 'jsonParsed', commitment: 'finalized' },
      ],
    }),
  });
  if (!response.ok) throw Error('Mint verification unavailable');
  const additions = verifiedBackpackMints(batch, await response.json());
  return [...previous, ...additions];
}

export async function backpackRegistry(
  database: D1Database,
  defer: (work: Promise<unknown>) => void,
  rpc?: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<RegistryStatus> {
  // Durable last-good additions survive provider outages, deployments and idle periods.
  const state = await marketSnapshot(
    database,
    REGISTRY_KEY,
    REGISTRY_REFRESH_MS,
    async () => {
      const saved = await database
        .prepare('SELECT payload FROM market_cache WHERE key=?')
        .bind(REGISTRY_KEY)
        .first<{ payload: string | null }>();
      let previous: StockToken[] = [];
      try {
        const raw = JSON.parse(saved?.payload || '[]');
        if (Array.isArray(raw)) previous = raw;
      } catch {
        /* Corrupt cache falls back to the reviewed seed list. */
      }
      return discoverBackpackListings(previous, rpc, fetcher);
    },
    defer,
    now,
    Number.MAX_SAFE_INTEGER,
  );
  return {
    additions: Array.isArray(state.data) ? state.data : [],
    checkedAt: state.fetchedAt,
    refreshing: !!state.refreshing,
    delayed:
      !!state.error ||
      (!state.refreshing &&
        (!state.fetchedAt || now - state.fetchedAt >= REGISTRY_REFRESH_MS)),
  };
}

export async function tokenBatchKey(tokens: readonly StockToken[]) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(tokens.map((t) => t.mint).join(',')),
  );
  return Array.from(new Uint8Array(hash))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export { registryTokens };
