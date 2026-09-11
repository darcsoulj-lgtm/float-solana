import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
export async function profileNewsFlow(base, cookie, memberId) {
  const guest = await fetch(base + '/api/avatar?member=' + memberId);
  assert.equal(guest.status, 401);
  assert.equal((await fetch(base + '/api/holder-news')).status, 401);
  const avatar = await readFile(
    new URL('./fixtures/avatar.jpg', import.meta.url),
  );
  const upload = await fetch(base + '/api/avatar', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'Content-Type': 'image/jpeg' },
    body: avatar,
  });
  assert.equal(upload.status, 200, await upload.text());
  const status = await (
    await fetch(base + '/api/community/status', { headers: { Cookie: cookie } })
  ).json();
  assert.ok(status.member.avatar_key);
  const photo = await fetch(base + '/api/avatar?member=' + memberId, {
    headers: { Cookie: cookie },
  });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), avatar);
  const invalid = await fetch(base + '/api/avatar', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'Content-Type': 'image/jpeg' },
    body: '<svg onload="alert(1)"/>',
  });
  assert.equal(invalid.status, 400);
  const csrf = await fetch(base + '/api/avatar', {
    method: 'DELETE',
    headers: { Cookie: cookie, Origin: 'https://other.invalid' },
  });
  assert.equal(csrf.status, 403);
  const deleted = await fetch(base + '/api/avatar', {
    method: 'DELETE',
    headers: { Cookie: cookie, Origin: base },
  });
  assert.equal(deleted.status, 200);
  assert.equal(
    (
      await fetch(base + '/api/avatar?member=' + memberId, {
        headers: { Cookie: cookie },
      })
    ).status,
    404,
  );
  const wrongStock = await fetch(base + '/api/holder-news?symbol=SPCX', {
    headers: { Cookie: cookie },
  });
  assert.equal(wrongStock.status, 403);
  const refresh = await fetch(base + '/api/holder-news', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: base,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ symbol: 'all' }),
  });
  assert.equal(refresh.status, 200, await refresh.text());
  const feed = await (
    await fetch(base + '/api/holder-news', { headers: { Cookie: cookie } })
  ).json();
  assert.ok(Array.isArray(feed.items));
  assert.ok(
    feed.items.length > 0,
    'Live company headlines must be available for the test holdings',
  );
  for (const item of feed.items) {
    assert.ok(item.published_at >= Date.now() - 7 * 86400000);
    assert.ok(item.symbols.some((s) => ['MU', 'SKHY'].includes(s)));
    assert.ok(item.url.startsWith('https://'));
    assert.ok(item.title);
  }
  const refreshed = await fetch(base + '/api/holder-news', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: base,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ symbol: 'all' }),
  });
  assert.equal(refreshed.status, 200);
  const second = await (
    await fetch(base + '/api/holder-news', { headers: { Cookie: cookie } })
  ).json();
  assert.equal(second.lastReviewed, feed.lastReviewed);
  console.log(
    'Profile/news API checks passed: authenticated photo persistence, invalid-file rejection, deletion, private holdings scope, live headlines, seven-day filtering and shared cache.',
  );
}
