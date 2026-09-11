import assert from 'node:assert/strict';
export async function marketFlow(base, cookie) {
  assert.equal(base, 'http://localhost:3000');
  const guest = await fetch(base + '/api/market-data');
  assert.equal(guest.status, 401);
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
      ['catalog', 'pools', 'prices'].map((k) => [
        k,
        {
          available: !!data[k].data,
          stale: data[k].stale,
          fetchedAt: data[k].fetchedAt,
        },
      ]),
    ),
  );
  for (const key of ['catalog', 'pools', 'prices']) {
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
  console.log(
    'Market API checks passed: guest rejection, invalid stock, live Backpack/DEX Screener/DefiLlama, book response and shared cache.',
  );
}
