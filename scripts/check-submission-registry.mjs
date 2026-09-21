// Read-only comparison. Does not change seeds, runtime entries, or review dates.
import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(
  new URL('../lib/tokens.ts', import.meta.url),
  'utf8',
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { BACKPACK_TOKENS: seeds } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);
const issuerUrl = 'https://api.backpack.exchange/api/v1/assets';
const runtimeUrl =
  'https://joinfloat.xyz/api/market-data?batch=0';
async function read(url) {
  const r = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error('Public registry unavailable: ' + r.status);
  return r.json();
}
const [assets, market] = await Promise.all([read(issuerUrl), read(runtimeUrl)]);
if (
  !Array.isArray(assets) ||
  !assets.length ||
  !Array.isArray(market.registry?.additions)
)
  throw Error('Invalid registry response');
const live = assets.flatMap((a) =>
  a.symbol.endsWith('.US')
    ? a.tokens
        .filter(
          (t) =>
            t.blockchain === 'Solana' &&
            (t.depositEnabled || t.withdrawEnabled),
        )
        .map((t) => ({
          symbol: a.symbol.slice(0, -3),
          mint: t.contractAddress,
        }))
    : [],
);
const key = (t) => `${t.symbol}:${t.mint}`;
const runtime = [...seeds, ...market.registry.additions];
const published = new Set(runtime.map(key));
const official = new Set(live.map(key));
const missing = live.filter((t) => !published.has(key(t)));
const extra = runtime.filter((t) => !official.has(key(t)));
const checkedAt = market.registry.checkedAt;
const fresh =
  Number.isFinite(checkedAt) &&
  checkedAt <= Date.now() + 1000 &&
  Date.now() - checkedAt < 600000 &&
  !market.registry.delayed;
const duplicates =
  official.size !== live.length ||
  published.size !== runtime.length ||
  new Set(runtime.map((t) => t.symbol)).size !== runtime.length;
const report = {
  checkedAt: new Date().toISOString(),
  scope:
    'Backpack enabled Solana assets compared with Float seeds plus live verified additions; no new independent onchain audit or other issuer review',
  sources: [issuerUrl, runtimeUrl],
  baseReviewDateUnchanged: '2026-09-13',
  seedCount: seeds.length,
  officialCount: live.length,
  runtimeCount: runtime.length,
  runtimeCheckedAt: new Date(checkedAt).toISOString(),
  fresh,
  duplicates,
  missing,
  extra,
  additions: market.registry.additions.map(({ symbol, mint }) => ({
    symbol,
    mint,
  })),
  passed:
    !!live.length && fresh && !duplicates && !missing.length && !extra.length,
};
await writeFile(
  new URL('../docs/hackathon/registry-review.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
