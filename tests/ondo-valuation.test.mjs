import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bundle } from './helpers/bundle.mjs';
const {
  parseOndoValues,
  fetchOndoValues,
  ONDO_VALUE_MAX_AGE_MS,
  tokenObservation,
  issuerDashboard,
  trackedValuation,
  TOKENS,
} = await bundle(
  `export * from './lib/ondo-valuation'; export {tokenObservation, trackedValuation} from './lib/token-observation'; export {issuerDashboard} from './lib/issuer-dashboard'; export {TOKENS} from './lib/tokens';`,
);
const fixture = JSON.parse(
  await readFile(
    new URL(
      '../research/market-data/ondo-solana-2026-09-13.json',
      import.meta.url,
    ),
  ),
);
const time = 1789296575000;
const source = (data) => ({ data, fetchedAt: time, stale: false, error: null });
const overview = () => ({
  catalog: source([]),
  markets: source({}),
  pools: source({}),
  prices: source({}),
  supplies: source({}),
  valuations: source(parseOndoValues(fixture, time)),
});
void test('Ondo uses only the dated Solana breakdown, reconciles every included dollar and never global TVL', () => {
  const parsed = parseOndoValues(fixture, time);
  assert.equal(Object.keys(parsed.rows).length, 202);
  assert.deepEqual(parsed.excluded, []);
  assert.ok(
    Math.abs(
      Object.values(parsed.rows).reduce((sum, row) => sum + row.valueUsd, 0) -
        25483537.78152,
    ) < 0.01,
  );
  assert.equal(parsed.rows.GOOGLon.supply, 840.92529);
  assert.equal(parsed.rows.GOOGLon.valueUsd, 284346.17337);
  assert.equal(
    parsed.rows.GOOGLon.mint,
    TOKENS.find((t) => t.symbol === 'GOOGLon').mint,
  );
  assert.equal(parsed.observedAt, time);
  const changed = structuredClone(fixture);
  changed.currentChainTvls.Solana = 1e12;
  changed.chainTvls.Ethereum = changed.chainTvls.Solana;
  assert.deepEqual(parseOndoValues(changed, time), parsed);
});
void test('Ondo rejects mismatched timestamps, malformed values, expired snapshots and a wrong protocol', () => {
  for (const change of [
    (f) => {
      f.name = 'Ondo USDY';
    },
    (f) => {
      f.chainTvls.Solana.tokens[0].date--;
    },
    (f) => {
      f.chainTvls.Solana.tokensInUsd[0].tokens.GOOGLON = -1;
    },
    (f) => {
      delete f.chainTvls.Solana.tokens[0].tokens.GOOGLON;
    },
    (f) => {
      f.chainTvls.Solana.tokensInUsd.push(f.chainTvls.Solana.tokensInUsd[0]);
    },
  ]) {
    const f = structuredClone(fixture);
    change(f);
    assert.throws(() => parseOndoValues(f, time));
  }
  assert.throws(() =>
    parseOndoValues(fixture, time + ONDO_VALUE_MAX_AGE_MS + 1),
  );
  assert.throws(() => parseOndoValues(fixture, time - 61000));
});
void test('Unknown products and cash tokens cannot enter equity totals', () => {
  const f = structuredClone(fixture);
  for (const key of ['USDON', 'UNKNOWNON']) {
    f.chainTvls.Solana.tokens[0].tokens[key] = 1;
    f.chainTvls.Solana.tokensInUsd[0].tokens[key] = 1e9;
  }
  const parsed = parseOndoValues(f, time);
  assert.deepEqual(parsed.excluded, ['USDON', 'UNKNOWNON']);
  assert.equal(parsed.reportedTokens, 204);
  assert.equal(Object.keys(parsed.rows).length, 202);
});
void test('Paired Ondo valuation repairs missing unit-safe values without multiplying by an unrelated price', () => {
  const d = overview();
  d.supplies.data.GOOGLon = {
    supply: 840.92529,
    multiplier: 1.00246,
    valuationSafe: false,
  };
  d.prices.data.GOOGLon = { price: 100000, timestamp: time, confidence: 1 };
  const value = tokenObservation(d, 'GOOGLon', time);
  assert.equal(value.issuedValue, 284346.17337);
  assert.equal(value.valuationUnavailableReason, null);
  assert.equal(
    value.price,
    100000,
    'Market price selection is a separate observation',
  );
  assert.equal(value.valuationTime, time);
  assert.equal(issuerDashboard(d, 'ondo', time).valued, 202);
  assert.ok(Math.abs(trackedValuation(d, time).total - 25483537.78152) < 0.01);
});
void test('Stale, future, wrong-mint and cross-issuer valuations cannot enter issuer totals', () => {
  for (const mutate of [
    (d) => {
      d.valuations.stale = true;
    },
    (d) => {
      d.valuations.data.observedAt = time + 61000;
    },
    (d) => {
      d.valuations.data.observedAt = time - ONDO_VALUE_MAX_AGE_MS - 1;
    },
    (d) => {
      d.valuations.data.rows.GOOGLon.mint = 'wrong';
    },
  ]) {
    const d = overview();
    mutate(d);
    assert.equal(tokenObservation(d, 'GOOGLon', time).issuedValue, null);
  }
  const d = overview();
  d.valuations.data.rows.MU = d.valuations.data.rows.GOOGLon;
  assert.equal(tokenObservation(d, 'MU', time).issuedValue, null);
});
void test('Free adapter uses a fixed destination, rejects redirects and limits payload size', async () => {
  await assert.rejects(
    fetchOndoValues(async (url, options) => {
      assert.equal(url, 'https://api.llama.fi/protocol/ondo-global-markets');
      assert.equal(options.redirect, 'manual');
      return new Response('', { status: 429 });
    }),
    /429/,
  );
  await assert.rejects(
    fetchOndoValues(
      async () =>
        new Response('large', {
          headers: { 'Content-Length': String(13 * 1024 * 1024) },
        }),
    ),
    /too large/,
  );
});

void test('Added Ondo listings replay finalized issuer-authority and metadata verification', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../research/market-data/ondo-added-mints-2026-09-13.json',
        import.meta.url,
      ),
    ),
  );
  const entries = Object.entries(audit.mints);
  assert.equal(
    entries.length,
    23,
    '22 additions and the established GOOGLon issuer anchor',
  );
  const authority = '9foMHsSDq7nMg4WPusSz9eY7tyxyukqborA8GyU5cUxD';
  entries.forEach(([symbol, mint], index) => {
    const account = audit.rpc.result.value[index];
    assert.equal(account.owner, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    assert.equal(account.data.parsed.type, 'mint');
    const info = account.data.parsed.info;
    assert.equal(info.isInitialized, true);
    assert.equal(info.mintAuthority, authority);
    const metadata = info.extensions.find(
      (e) => e.extension === 'tokenMetadata',
    ).state;
    assert.equal(metadata.mint, mint);
    assert.equal(metadata.symbol, symbol);
    assert.equal(metadata.updateAuthority, authority);
    assert.equal(
      metadata.uri,
      `https://app.ondo.finance/api/v2/assets/${symbol}/sol_metadata.json`,
    );
    const token = TOKENS.find(
      (t) => t.issuer === 'ondo' && t.symbol === symbol,
    );
    assert.equal(token?.mint, mint);
    assert.equal(info.decimals, 9);
  });
});
