import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { MarketEnvironment } from '../../lib/market-overview-server';
import type { MarketJobBinding } from '../../lib/market-scheduler';
import { runMarketJob, runPoolChunk } from '../../lib/market-scheduler';
import {
  backpackRegistry,
  registryTokens,
  REGISTRY_KEY,
  tokenBatchKey,
} from '../../lib/backpack-registry';
import { TOKEN_REVIEW_DATE } from '../../lib/tokens';
import { marketPartitions } from '../../lib/market-overview-server';
import {
  prioritizePoolDiscovery,
  rememberPoolInventory,
} from '../../lib/pool-inventory';
import {
  readPoolEvidence,
  reconcilePoolCoverage,
  recoveryDiscoveryQueue,
} from '../../lib/pool-reconciliation';
import type { Pool } from '../../lib/market-data';
import { parseMarketRows } from '../../lib/market-snapshot-sync';
import { restoreCollectorState } from './state';
import { poolVenueCoverage } from '../../lib/pool-venue-coverage';

const raw = new DatabaseSync(':memory:');
raw.exec(
  'CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)',
);
const db = {
  prepare(sql: string) {
    return {
      bind(...args: (string | number | null)[]) {
        return {
          first: async () => raw.prepare(sql).get(...args) ?? null,
          all: async () => ({ results: raw.prepare(sql).all(...args) }),
          run: async () => raw.prepare(sql).run(...args),
        };
      },
    };
  },
} as unknown as D1Database;
const output = 'work/market-snapshot';
await mkdir(output + '/chunks', { recursive: true });
// A failed state read must not erase discovered pools/cooldowns. Resolve an
// immutable head rather than restoring a potentially cached branch response.
const state = await restoreCollectorState(fetch, process.env.GH_TOKEN);
for (const row of state)
  raw
    .prepare('INSERT INTO market_cache VALUES (?,?,?,?)')
    .run(row.key, row.payload, row.fetched_at, row.retry_after);
if (
  !raw.prepare('SELECT key FROM market_cache WHERE key=?').get(REGISTRY_KEY)
) {
  const r = await fetch('https://joinfloat.xyz/api/backpack-market', {
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error('Bootstrap registry unavailable');
  const market = (await r.json()) as {
    registry: { additions: unknown[]; checkedAt: number };
  };
  raw
    .prepare('INSERT INTO market_cache VALUES (?,?,?,0)')
    .run(
      REGISTRY_KEY,
      JSON.stringify(market.registry.additions),
      market.registry.checkedAt,
    );
}
// Expire the registry refresh lease only; provider cooldowns survive every run.
raw
  .prepare('UPDATE market_cache SET retry_after=0 WHERE key=?')
  .run(REGISTRY_KEY);
const env: MarketEnvironment & { MARKET_REFRESH: MarketJobBinding } = {
  DB: db,
  SOLANA_RPC_URL: 'https://api.mainnet.solana.com',
  MARKET_REFRESH: {
    run: async (job: Parameters<typeof runMarketJob>[1]) =>
      runMarketJob(env, job),
    pools: async (mints: string[]) => runPoolChunk(env, mints),
  },
};
await runMarketJob(env, { kind: 'registry' });
const registry = await backpackRegistry(
  db,
  () => {},
  env.SOLANA_RPC_URL,
  fetch,
  Date.now(),
  true,
);
const tokens = registryTokens(registry),
  mints = tokens.filter((t) => t.issuer === 'backpack').map((t) => t.mint);
const bootstrap = await fetch('https://joinfloat.xyz/api/backpack-market', {
  signal: AbortSignal.timeout(15000),
});
if (bootstrap.ok) {
  const market = (await bootstrap.json()) as Record<
    string,
    {
      data: Record<string, unknown>;
      fetchedAt: number;
      asOf?: Record<string, number>;
    }
  >;
  for (const batch of marketPartitions(tokens)) {
    const active = batch.filter((t) => t.issuer === 'backpack');
    if (!active.length) continue;
    const suffix = TOKEN_REVIEW_DATE + ':' + (await tokenBatchKey(batch));
    for (const [source, prefix] of [
      ['prices', 'llama-prices-v3:'],
      ['history', 'llama-history-v1:'],
      ['supplies', 'solana-supplies-v4:'],
    ]) {
      if (
        raw
          .prepare('SELECT payload FROM market_cache WHERE key=?')
          .get(prefix + suffix)?.payload
      )
        continue;
      const saved = market[source];
      if (!saved?.data || !saved.fetchedAt) continue;
      const data = Object.fromEntries(
        active
          .filter((t) => saved.data[t.symbol] != null)
          .map((t) => [t.symbol, saved.data[t.symbol]]),
      );
      if (Object.keys(data).length)
        raw
          .prepare(
            'INSERT INTO market_cache VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at',
          )
          .run(prefix + suffix, JSON.stringify(data), saved.fetchedAt);
    }
  }
}
const start = Date.now();
let failures = 0;
const canonical = (mint: string): Pool[] => {
  const row = raw
    .prepare('SELECT payload FROM market_cache WHERE key=?')
    .get('pool-token-stonkfun-v2:' + mint);
  return row?.payload ? JSON.parse(row.payload as string) : [];
};
async function health() {
  return Promise.all(
    tokens
      .filter((t) => t.issuer === 'backpack')
      .map(async (token) =>
        reconcilePoolCoverage(
          token,
          canonical(token.mint),
          await readPoolEvidence(db, token),
          Date.now(),
        ),
      ),
  );
}
const initialHealth = await health();
// Restore independently witnessed identities before retrying a canonical gap.
for (const token of tokens.filter((t) => t.issuer === 'backpack'))
  await rememberPoolInventory(
    db,
    token,
    await readPoolEvidence(db, token),
    Date.now(),
  );
// Persisted success times prevent a throttled provider from repeatedly checking
// the same early symbols while later/new listings starve.
const checkedAt = new Map(
  mints.map((mint) => [
    mint,
    (raw
      .prepare('SELECT fetched_at FROM market_cache WHERE key=?')
      .get('pool-discovery:geckoterminal:' + mint)?.fetched_at as
      | number
      | undefined) ?? 0,
  ]),
);
const activity = new Map(
  mints.map((mint) => {
    const row = raw
      .prepare('SELECT payload FROM market_cache WHERE key=?')
      .get('pool-token-stonkfun-v2:' + mint);
    const pools = row?.payload
      ? (JSON.parse(row.payload as string) as { volume24h: number | null }[])
      : [];
    return [mint, pools.reduce((n, p) => n + (p.volume24h ?? 0), 0)] as const;
  }),
);
// A conservative free-provider budget; oldest successful checks win, with
// higher observed activity breaking ties. Known values refresh for all tokens.
const attempted = new Map(
  mints.map((mint) => [
    mint,
    (raw
      .prepare('SELECT fetched_at FROM market_cache WHERE key=?')
      .get('pool-repair-attempt:' + mint)?.fetched_at as number | undefined) ??
      0,
  ]),
);
const discoveryMints = recoveryDiscoveryQueue(
  prioritizePoolDiscovery(mints, checkedAt, activity),
  initialHealth,
  attempted,
  Date.now(),
  8,
);
const priority = new Map(initialHealth.map((h) => [h.mint, h.repairPriority]));
for (const mint of discoveryMints)
  if ((priority.get(mint) ?? 0) > 0)
    raw
      .prepare(
        'INSERT INTO market_cache VALUES (?,NULL,?,0) ON CONFLICT(key) DO UPDATE SET fetched_at=excluded.fetched_at',
      )
      .run('pool-repair-attempt:' + mint, Date.now());
// Spend the free indexer budget on missing known values before new discovery.
// Active markets lead the queue; no symbol is hardcoded or excluded.
const refreshMints = [...mints].sort(
  (a, b) =>
    (priority.get(b) ?? 0) - (priority.get(a) ?? 0) ||
    (activity.get(b) ?? 0) - (activity.get(a) ?? 0),
);
try {
  await runMarketJob(env, {
    kind: 'pool-refresh',
    mints: refreshMints.slice(0, 10),
  });
} catch {
  failures++;
}
for (let i = 0; i < discoveryMints.length; i += 2)
  try {
    await runMarketJob(env, {
      kind: 'discovery',
      mints: discoveryMints.slice(i, i + 2),
    });
  } catch {
    failures++;
  }
for (let i = 10; i < refreshMints.length; i += 10)
  try {
    await runMarketJob(env, {
      kind: 'pool-refresh',
      mints: refreshMints.slice(i, i + 10),
    });
  } catch {
    failures++;
  }
for (let i = 0; i < discoveryMints.length; i += 10)
  try {
    await runMarketJob(env, {
      kind: 'pool-refresh',
      mints: discoveryMints.slice(i, i + 10),
    });
  } catch {
    failures++;
  }
for (const [batch, rows] of marketPartitions(tokens).entries())
  if (rows.some((t) => t.issuer === 'backpack'))
    await runMarketJob(env, { kind: 'batch', batch });
await runMarketJob(env, { kind: 'globals' });
const finalHealth = await health();
const generatedAt = Date.now();
const venueCoverage = poolVenueCoverage(
  tokens
    .filter((t) => t.issuer === 'backpack')
    .flatMap((t) => canonical(t.mint)),
  generatedAt,
);
const verification = {
  version: 1,
  generatedAt,
  tokens: tokens
    .filter((t) => t.issuer === 'backpack')
    .map((t) => ({
      symbol: t.symbol,
      mint: t.mint,
      pools: canonical(t.mint).map((p) => ({
        address: p.address,
        volume24h: p.volume24h,
        source: p.source,
        observedAt: p.observedAt,
        unavailable: p.unavailable,
        volumeDisputed: p.volumeDisputed,
        delayed: p.delayed,
      })),
    })),
  health: finalHealth,
  venueCoverage,
};
await writeFile(output + '/verification.json', JSON.stringify(verification));
const summary = {
  tokens: mints.length,
  healthy: finalHealth.filter((h) => h.status === 'healthy').length,
  delayed: finalHealth.filter((h) => h.status === 'delayed').length,
  unavailable: finalHealth.filter(
    (h) => h.status === 'unavailable' || h.status === 'pending',
  ).length,
  repairQueue: discoveryMints.filter((m) => priority.get(m)),
  missingPools: finalHealth.reduce((n, h) => n + h.missing.length, 0),
  retainedPools: finalHealth.reduce((n, h) => n + h.retained.length, 0),
};
console.log('Pool reconciliation', JSON.stringify(summary));
console.log('Venue coverage', JSON.stringify(venueCoverage));
// Keep capability gaps visible in the existing collection run, without
// blocking valid publication or adding paid services/another monitor.
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    '### Venue coverage\n\n| Venue | Pools | Direct source | Indexer source | Unresolved | Delayed |\n|---|---:|---:|---:|---:|---:|\n' +
      venueCoverage.venues
        .map(
          (r) =>
            `| ${r.venue.replace(/[|\r\n]/g, '')} | ${r.pools} | ${r.direct} | ${r.indexed} | ${r.unresolved} | ${r.delayed} |`,
        )
        .join('\n') +
      '\n\nIndexer-only venues: ' +
      (venueCoverage.indexerOnlyVenues.join(', ') || 'none observed') +
      '. This inventory does not establish complete coverage.\n',
  );
}
const all = raw.prepare('SELECT * FROM market_cache').all();
await writeFile(output + '/state.json', JSON.stringify(all));
const rows = all.filter(
  (row) =>
    row.payload &&
    /^(backpack-verified-listings-v1|pool-token-|llama-prices-v3:|llama-history-v1:|solana-supplies-v4:|backpack-catalog-v2:|backpack-tickers-v1:)/.test(
      row.key as string,
    ),
);
const chunks: string[] = [];
let group: unknown[] = [];
async function flush() {
  if (!group.length) return;
  const text = JSON.stringify(group);
  parseMarketRows(text);
  const hash = createHash('sha256').update(text).digest('hex');
  await writeFile(output + '/chunks/' + hash + '.json', text);
  chunks.push(hash);
  group = [];
}
for (const row of rows) {
  if (group.length >= 10 || JSON.stringify([...group, row]).length > 24000)
    await flush();
  group.push(row);
}
await flush();
if (!chunks.length) throw Error('No publishable market observations');
await writeFile(
  output + '/pending.json',
  JSON.stringify({ version: 1, generatedAt, chunks }),
);
console.log(
  JSON.stringify({
    tokens: mints.length,
    failures,
    seconds: Math.round((Date.now() - start) / 1000),
    chunks: chunks.length,
  }),
);
raw.close();
