import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { bundle } from './helpers/bundle.mjs';
const {
  readBoundedText,
  readMarketBatch,
  marketBatches,
  TOKENS,
  MARKET_BATCH_SIZE,
} = await bundle(
  "export * from './lib/request-body';export * from './lib/market-service';export {TOKENS,MARKET_BATCH_SIZE} from './lib/tokens';",
);
void test('Request limits count streamed bytes before buffering, cancel oversized streams and preserve valid Unicode', async () => {
  let pulled = 0,
    cancelled = false;
  const body = new ReadableStream({
    pull(c) {
      pulled++;
      c.enqueue(new Uint8Array(1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readBoundedText(
      new Request('https://test.local', {
        method: 'POST',
        body,
        duplex: 'half',
      }),
      2048,
    ),
    { status: 413 },
  );
  assert.ok(cancelled);
  assert.ok(pulled <= 4);
  assert.equal(
    await readBoundedText(
      new Request('https://test.local', { method: 'POST', body: '안녕' }),
      6,
    ),
    '안녕',
  );
  await assert.rejects(
    readBoundedText(
      new Request('https://test.local', { method: 'POST', body: '안녕' }),
      5,
    ),
    { status: 413 },
  );
  await assert.rejects(
    readBoundedText(
      new Request('https://test.local', {
        method: 'POST',
        headers: { 'Content-Length': '10000' },
        body: 'a',
      }),
      10,
    ),
    { status: 413 },
  );
});
void test('Canonical market cache is shared across consumers, uses one warm read and leases one refresh per source', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    'CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)',
  );
  let reads = 0,
    calls = 0;
  const db = {
    prepare(query) {
      return {
        bind(...values) {
          return {
            async all() {
              reads++;
              return { results: sql.prepare(query).all(...values) };
            },
            async first() {
              reads++;
              return sql.prepare(query).get(...values) ?? null;
            },
            async run() {
              return sql.prepare(query).run(...values);
            },
          };
        },
      };
    },
  };
  const [batch] = marketBatches(TOKENS, [TOKENS[2]]);
  assert.equal(batch.length, MARKET_BATCH_SIZE);
  assert.deepEqual(marketBatches(TOKENS, [TOKENS[0]])[0], batch);
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    assert.ok(
      (url instanceof Request ? url.url : url.toString()).startsWith(
        'https://coins.llama.fi/',
      ),
    );
    return Response.json({
      coins: {
        ['solana:' + batch[0].mint]: {
          price: 12,
          timestamp: Date.now() / 1000,
          confidence: 1,
        },
      },
    });
  };
  // Supply is already saved; this test isolates the shared price refresh path.
  const options = { pools: false, history: false };
  const { tokenBatchKey, TOKEN_REVIEW_DATE } = await bundle(
    "export {tokenBatchKey} from './lib/backpack-registry';export {TOKEN_REVIEW_DATE} from './lib/tokens';",
  );
  const key =
    'solana-supplies-v4:' +
    TOKEN_REVIEW_DATE +
    ':' +
    (await tokenBatchKey(batch));
  sql
    .prepare('INSERT INTO market_cache VALUES(?,?,?,?)')
    .run(key, '{}', Date.now(), Date.now() + 120000);
  try {
    await Promise.all(
      Array.from({ length: 20 }, () => readMarketBatch(db, batch, options)),
    );
    assert.equal(calls, 1);
    reads = 0;
    const result = await readMarketBatch(db, batch, options);
    assert.equal(result.prices.data[batch[0].symbol].price, 12);
    assert.equal(reads, 1);
    assert.equal(calls, 1);
    sql
      .prepare(
        'UPDATE market_cache SET fetched_at=?,retry_after=0 WHERE key LIKE ?',
      )
      .run(Date.now() - 500000, 'llama-prices%');
    globalThis.fetch = async () => {
      calls++;
      return new Response('', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    };
    const failed = await readMarketBatch(db, batch, options);
    assert.equal(failed.prices.stale, true);
    assert.equal(failed.prices.data[batch[0].symbol].price, 12);
    const before = calls;
    await readMarketBatch(db, batch, options);
    assert.equal(calls, before, '429 cooldown must prevent immediate retries');
  } finally {
    globalThis.fetch = original;
    sql.close();
  }
});
