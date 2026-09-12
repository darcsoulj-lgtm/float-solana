// Offline replay of captured public sources, never a current market snapshot.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))(
  'esbuild',
);
const root = new URL('../', import.meta.url).pathname;
const { outputFiles } = await build({
  stdin: {
    contents:
      "export {TOKENS} from './lib/tokens'; export {parsePools,parsePrices,mergeMarketPages} from './lib/market-data'; export {parseSupplies} from './lib/token-supply'; export {issuedCoverage} from './lib/token-observation';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const api = await import(
  'data:text/javascript;base64,' +
    Buffer.from(outputFiles[0].text).toString('base64')
);
const audit = JSON.parse(
  fs.readFileSync(
    root + 'research/market-integrity/audit-2026-09-12.json',
    'utf8',
  ),
);
const at = Date.parse(audit.completedAt),
  checkAt = at + 130000;
const wrap = (data) => ({ data, fetchedAt: at, stale: false, error: null });
const pages = audit.records.map((page) => {
  const tokens = page.rows.map((r) =>
    api.TOKENS.find((t) => t.mint === r.mint),
  );
  return {
    supplies: wrap(api.parseSupplies(page.rpc, at, tokens)),
    pools: wrap(api.parsePools(page.dex, tokens)),
    prices: wrap(api.parsePrices(page.llama, at)),
    history: wrap(api.parsePrices(page.history, at)),
    markets: wrap({}),
    catalog: wrap([]),
  };
});
const data = api.mergeMarketPages(pages);
const baseline = structuredClone(data);
for (const [symbol, quote] of Object.entries(baseline.prices.data || {})) {
  if (checkAt - quote.timestamp > 900000) delete baseline.prices.data[symbol];
}
const before = api.issuedCoverage(baseline, checkAt, 'xstocks');
const current = api.issuedCoverage(data, checkAt, 'xstocks');
assert.equal(before.valued.length, 152);
assert.equal(current.valued.length, 410);
assert.equal(current.pricedCount, 752);
assert.equal(
  current.rows.length,
  current.valued.length +
    Object.values(current.missing).reduce((a, b) => a + b, 0),
);
assert.equal(api.issuedCoverage(data, at + 300001, 'xstocks').valued.length, 0);
const rows = current.rows.map((r) => ({
  symbol: r.symbol,
  price: r.price,
  priceTime: r.priceTime,
  dated: r.priceDelayed,
  issuedValue: r.issuedValue,
  excluded: r.valuationUnavailableReason,
  multiplier: r.supply?.multiplier,
}));
const report = {
  checkedAt: new Date().toISOString(),
  mode: 'Offline replay of captured public data; not live production coverage',
  captureCompletedAt: audit.completedAt,
  beforeValued: before.valued.length,
  afterValued: current.valued.length,
  priced: current.pricedCount,
  datedValuations: current.datedCount,
  tracked: current.rows.length,
  exclusions: current.missing,
  rows,
};
fs.writeFileSync(
  root + 'research/market-integrity/dated-price-coverage.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
