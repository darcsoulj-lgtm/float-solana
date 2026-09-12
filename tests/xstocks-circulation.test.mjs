import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))(
  'esbuild',
);
const root = new URL('../', import.meta.url).pathname;
const { outputFiles } = await build({
  stdin: {
    contents:
      "export {TOKENS} from './lib/tokens'; export * from './lib/xstocks-circulation'; export {circulatingCoverage,tokenObservation,issuerValuation,tokenValuation} from './lib/token-observation'; export {mergeMarketPages} from './lib/market-data';",
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
const pages = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      root +
        'research/market-integrity/xstocks-issuer-circulation-2026-09-12.json.gz',
    ),
  ),
);
const xml = fs.readFileSync(
  root + 'research/market-integrity/ecb-2026-09-11.xml',
  'utf8',
);
const now = Date.parse('2026-09-12T12:40:00Z');
const fx = api.parseReferenceFx(xml, now);
const parsed = api.parseCirculationPages(pages, fx);
const wrap = (data) => ({ data, fetchedAt: now, stale: false, error: null });
const data = {
  circulation: wrap(parsed),
  supplies: wrap({}),
  prices: wrap({}),
  pools: wrap({}),
  markets: wrap({}),
  catalog: wrap([]),
};

test('Captured issuer circulation reconciles Solana separately from pre-mints and other chains', () => {
  const c = api.circulatingCoverage(data, now, 'xstocks');
  assert.ok(c.valued.length > 800);
  assert.ok(Math.abs(c.total - 518557759.6) < 1);
  assert.equal(c.issuerCount, 1);
  assert.ok(parsed.AAOIx.circulatingSupply < parsed.AAOIx.totalSupply / 30);
  assert.equal(parsed.NFLXx.circulatingSupply, 14352.4035065);
  assert.equal(parsed.NFLXx.referencePriceUsd, 77.295);
  assert.ok(parsed.NFLXx.valueUsd < 1200000); // No second application of the 10x multiplier.
  assert.equal(parsed.XIAOx.currency, 'HKD');
  assert.ok(parsed.XIAOx.referencePriceUsd < 4);
  assert.equal(parsed.XIAOx.fxDate, '2026-09-11');
});
test('Gross mint values and global CMC metrics cannot leak into circulating totals', () => {
  const mixed = structuredClone(data);
  mixed.supplies.data.MU = { supply: 1e12, valuationSafe: true };
  mixed.prices.data.MU = { price: 1000, confidence: 1, timestamp: now };
  assert.equal(api.tokenObservation(mixed, 'MU', now).issuedValue, 1e15);
  assert.equal(api.tokenObservation(mixed, 'MU', now).circulatingValue, null);
  assert.equal(
    api.circulatingCoverage(mixed, now).total,
    api.circulatingCoverage(data, now).total,
  );
  assert.equal(api.circulatingCoverage(mixed, now, 'backpack').total, null);
});
test('Incomplete pages, duplicate symbols and GraphQL errors fail closed', () => {
  assert.throws(() => api.parseCirculationPages(pages.slice(1), fx));
  const duplicate = structuredClone(pages);
  duplicate[1].data.tokens.nodes[0] = duplicate[0].data.tokens.nodes[0];
  assert.throws(() => api.parseCirculationPages(duplicate, fx));
  const errors = structuredClone(pages);
  errors[0].errors = [{ message: 'source unavailable' }];
  assert.throws(() => api.parseCirculationPages(errors, fx));
});
test('Mismatched mint, negative supply and unknown currency cannot manufacture a value', () => {
  for (const mutate of [
    (n) =>
      (n.deployments.find((d) => d.network === 'Solana').address = 'svm:wrong'),
    (n) =>
      (n.deployments.find((d) => d.network === 'Solana').circulatingSupply =
        '-1'),
  ]) {
    const bad = structuredClone(pages),
      n = bad
        .flatMap((p) => p.data.tokens.nodes)
        .find((n) => n.symbol === 'AAOIx');
    mutate(n);
    assert.equal(api.parseCirculationPages(bad, fx).AAOIx, undefined);
  }
  const bad = structuredClone(pages),
    n = bad
      .flatMap((p) => p.data.tokens.nodes)
      .find((n) => n.symbol === 'AAOIx');
  n.tokenCollaterals[0].collateral.priceCurrency = 'INVALID';
  assert.equal(api.parseCirculationPages(bad, fx).AAOIx.valueUsd, null);
  assert.equal(api.parseCirculationPages(pages, null).XIAOx.valueUsd, null);
  assert.ok(api.parseCirculationPages(pages, null).AAOIx.valueUsd > 0);
});
test('Expired FX and expired circulation remain unavailable, without renewed timestamps', () => {
  assert.throws(() => api.parseReferenceFx(xml, now + 96 * 3600000));
  assert.throws(() => api.parseReferenceFx(xml, Date.parse('2026-09-10')));
  assert.equal(api.circulatingCoverage(data, now + 900000).total, null);
  const expired = structuredClone(data);
  expired.circulation.stale = true;
  assert.equal(api.circulatingCoverage(expired, now).total, null);
  const merged = api.mergeMarketPages([
    data,
    { ...data, circulation: undefined },
  ]);
  assert.equal(merged.circulation.asOf.AAOIx, now);
  assert.equal(
    api.circulatingCoverage(merged, now).total,
    api.circulatingCoverage(data, now).total,
  );
});
test('Transport fetches bounded complete pages without credentials and honors failures', async () => {
  let active = 0,
    max = 0,
    calls = 0;
  const out = await api.fetchXstocksCirculation(async (url, options) => {
    assert.equal(options.redirect, 'manual');
    if (String(url).includes('ecb.europa.eu')) return new Response(xml);
    assert.equal(url, 'https://api.backed.fi/graphql');
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    assert.equal(body.variables.where.businessLine.equals, 'xStocks');
    assert.equal(body.variables.maxAge, 259200);
    calls++;
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 1));
    active--;
    return Response.json(pages[body.variables.page]);
  }, now);
  assert.equal(calls, 9);
  assert.ok(max <= 3);
  assert.ok(out.AAOIx.valueUsd > 0);
  await assert.rejects(
    () =>
      api.fetchXstocksCirculation(
        async () =>
          new Response('', { status: 429, headers: { 'Retry-After': '600' } }),
      ),
    { status: 429, retryAfterMs: 600000 },
  );
});

test('Other issuer estimates remain available with minted labels and never enter circulation totals', () => {
  const mixed = structuredClone(data);
  const examples = ['backpack', 'ondo', 'prestocks', 'tessera'].map(
    (issuer) => [issuer, api.TOKENS.find((t) => t.issuer === issuer).symbol],
  );
  for (const [, symbol] of examples) {
    mixed.supplies.data[symbol] = { supply: 840, valuationSafe: true };
    mixed.prices.data[symbol] = { price: 100, confidence: 1, timestamp: now };
  }
  for (const [issuer, symbol] of examples) {
    const c = api.issuerValuation(mixed, now, issuer);
    assert.equal(c.total, 84000);
    assert.equal(c.label, 'Minted value');
    assert.equal(c.basis, 'minted');
    assert.equal(
      api.tokenValuation(api.tokenObservation(mixed, symbol, now), issuer)
        .value,
      84000,
    );
  }
  assert.equal(
    api.circulatingCoverage(mixed, now).total,
    api.circulatingCoverage(data, now).total,
  );
  assert.equal(
    api.issuerValuation(mixed, now, 'xstocks').label,
    'Circulating value',
  );
  mixed.circulation.stale = true;
  // There is still a gross AAOIx estimate, but an expired xStocks net source must not use it.
  mixed.supplies.data.AAOIx = { supply: 1000000, valuationSafe: true };
  mixed.prices.data.AAOIx = { price: 100, confidence: 1, timestamp: now };
  assert.equal(
    api.tokenObservation(mixed, 'AAOIx', now).issuedValue,
    100000000,
  );
  assert.equal(api.issuerValuation(mixed, now, 'xstocks').total, null);
  assert.equal(
    api.tokenValuation(api.tokenObservation(mixed, 'AAOIx', now), 'xstocks')
      .value,
    null,
  );
  // A feed error is not zero issuance, and stale snapshots cannot resurrect the estimate.
  mixed.supplies.stale = true;
  assert.equal(api.issuerValuation(mixed, now, 'backpack').total, null);
});

test('Captured Solana observations restore all four non-xStocks issuer estimates', () => {
  const capture = JSON.parse(
    fs.readFileSync(
      root + 'research/market-integrity/audit-2026-09-12.json',
      'utf8',
    ),
  );
  const rows = capture.records.flatMap((batch) => batch.rows);
  const at = Math.max(...rows.map((r) => r.supply?.timestamp || 0));
  const snapshot = (value) => ({
    data: value,
    fetchedAt: at,
    stale: false,
    error: null,
  });
  const historical = {
    supplies: snapshot({}),
    prices: snapshot({}),
    pools: snapshot({}),
    markets: snapshot({}),
    catalog: snapshot([]),
  };
  for (const row of rows) {
    if (row.supply) historical.supplies.data[row.symbol] = row.supply;
    if (row.llama) historical.prices.data[row.symbol] = row.llama;
  }
  for (const issuer of ['backpack', 'ondo', 'prestocks', 'tessera']) {
    const c = api.issuerValuation(historical, at, issuer);
    assert.ok(c.total > 0, issuer + ' retains a captured minted estimate');
    assert.equal(c.label, 'Minted value');
    assert.equal(
      c.valued.every((r) => r.issuedValue !== null),
      true,
    );
  }
  assert.equal(api.circulatingCoverage(historical, at).total, null);
  assert.equal(api.issuerValuation(historical, at, 'xstocks').total, null);
});
