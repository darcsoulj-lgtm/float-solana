import assert from 'node:assert/strict';
export async function marketFlow(base, cookie) {
  assert.equal(base, 'http://localhost:3000');
  const guest = await fetch(base + '/api/market-data');
  assert.equal(guest.status, 200);
  const invalid = await fetch(base + '/api/market-data?symbol=FAKE', {
    headers: { Cookie: cookie },
  });
  assert.equal(invalid.status, 400);
  const response = await fetch(base + '/api/market-data', {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  console.log(
    'Market source status',
    Object.fromEntries(
      ['catalog', 'pools', 'prices', 'markets', 'supplies'].map((k) => [
        k,
        {
          available: !!data[k].data,
          stale: data[k].stale,
          fetchedAt: data[k].fetchedAt,
        },
      ]),
    ),
  );
  for (const key of ['catalog', 'pools', 'prices', 'markets', 'supplies']) {
    assert.equal(typeof data[key].stale, 'boolean');
    assert.ok('fetchedAt' in data[key]);
  }
  assert.ok(
    data.catalog.data?.find(
      (t) => t.symbol === 'MU' && t.spot === 'MU.US_USDC',
    ),
    'Live Backpack registry must connect',
  );
  assert.ok(
    data.pools.data?.MU?.length > 0,
    'Live DEX Screener MU pools must connect',
  );
  assert.ok(
    data.prices.data?.MU?.price > 0,
    'Live DefiLlama MU price must connect',
  );
  assert.ok(
    data.markets.data?.MU?.marketCap > 0,
    'Live CoinMarketCap token value must connect',
  );
  assert.equal(data.markets.data.MU.id, 40817);
  assert.ok(data.markets.data.MU.timestamp <= Date.now());
  assert.equal(Object.keys(data.supplies.data).length, 90);
  assert.ok(
    data.supplies.data.TTWO.supply > 0,
    'Mint supply available even without CMC',
  );
  assert.ok(
    data.pools.data.TTWO?.[0]?.price > 0,
    'TTWO live pool price available',
  );
  const book = await fetch(base + '/api/market-data?symbol=MU', {
    headers: { Cookie: cookie },
  });
  assert.equal(book.status, 200);
  const detail = await book.json();
  assert.ok(detail.book);
  if (detail.book.data && !detail.book.stale)
    assert.ok(detail.book.data.ask > detail.book.data.bid);
  const cached = await (
    await fetch(base + '/api/market-data', { headers: { Cookie: cookie } })
  ).json();
  assert.equal(cached.pools.fetchedAt, data.pools.fetchedAt);
  assert.equal(cached.markets.fetchedAt, data.markets.fetchedAt);
  console.log(
    'Market API checks passed: public access, invalid stock, live Backpack/DEX Screener/DefiLlama/CoinMarketCap, book response and shared cache.',
  );
}
