// Called only from the existing local synthetic-member integration fixture.
import assert from 'node:assert/strict';
export async function editorialFlow(base, cookie) {
  assert.ok(base.startsWith('http://localhost:3000'));
  let checks = 0;
  async function call(
    path,
    body,
    { status = 200, admin = false, guest = false, origin = base } = {},
  ) {
    const r = await fetch(base + '/api/editorial/' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Cookie: guest ? '' : admin ? '__sites_local_auth=1' : cookie,
        ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await r.text();
    let d;
    try {
      d = JSON.parse(raw);
    } catch {
      d = { error: raw };
    }
    assert.equal(r.status, status, JSON.stringify({ path, d }));
    checks++;
    return d;
  }
  await call('brief', undefined, { guest: true, status: 401 });
  await call('operations', undefined, { status: 401 });
  await call('initialize', {}, { guest: true, status: 401 });
  await call('initialize', { title: 'Injected content' }, { status: 400 });
  await call('initialize', {}, { origin: 'https://evil.invalid', status: 403 });
  await call('initialize', {});
  const initial = await call('operations', undefined, { admin: true });
  const seed = initial.items.find((i) => i.id === 'skhy-future-forum-2026');
  assert.ok(seed);
  assert.ok(
    initial.operations.some(
      (o) => o.operation === 'post' && o.outcome === 'success',
    ),
  );
  await call('initialize', {});
  assert.equal(
    (await call('operations', undefined, { admin: true })).items.length,
    initial.items.length,
  );
  const stamp = crypto.randomUUID(),
    today = new Date().toISOString().slice(0, 10);
  const input = {
    kind: 'news',
    title: 'A locally tested editorial story',
    summary: 'This content exists only in the local test database.',
    publisher: 'Local fixture',
    url: 'https://example.com/' + stamp + '?utm_source=fixture',
    published_date: today,
    event_date: null,
    event_at: null,
    certainty: 'confirmed',
    status: 'draft',
    featured: false,
    symbols: ['MU', 'SKHY'],
  };
  await call('items', input, { status: 401 });
  const { id } = await call('items', input, { admin: true, status: 201 });
  assert.ok(!(await call('brief?scope=all')).items.some((i) => i.id === id));
  await call(
    'items',
    {
      ...input,
      status: 'published',
      url: 'https://example.com/' + stamp + '?utm_campaign=test',
    },
    { admin: true, status: 409 },
  );
  const existing = (
    await call('operations', undefined, { admin: true })
  ).items.find((i) => i.id === id);
  await call(
    'items',
    {
      ...input,
      id,
      status: 'published',
      expected_updated_at: existing.updated_at,
    },
    { admin: true },
  );
  const personal = await call('brief?scope=personal');
  assert.equal(
    personal.items.filter((i) => i.id === id).length,
    1,
    'Multi-stock stories are not duplicated',
  );
  assert.deepEqual(personal.items.find((i) => i.id === id).symbols.sort(), [
    'MU',
    'SKHY',
  ]);
  assert.ok(personal.items.every((i) => !('edit_token' in i)));
  assert.ok(
    !(await call('brief?scope=all&symbol=BA')).items.some((i) => i.id === id),
  );
  await call(
    'items',
    {
      ...input,
      id,
      status: 'archived',
      expected_updated_at: existing.updated_at,
    },
    { admin: true, status: 409 },
  );
  const current = (
    await call('operations', undefined, { admin: true })
  ).items.find((i) => i.id === id);
  const simultaneous = await Promise.all([
    call(
      'items',
      {
        ...input,
        id,
        title: 'Editor one wins or loses',
        symbols: ['MU'],
        status: 'published',
        expected_updated_at: current.updated_at,
      },
      { admin: true },
    )
      .then(() => true)
      .catch((e) => {
        assert.match(e.message, /409/);
        return false;
      }),
    call(
      'items',
      {
        ...input,
        id,
        title: 'Editor two wins or loses',
        symbols: ['SKHY'],
        status: 'published',
        expected_updated_at: current.updated_at,
      },
      { admin: true },
    )
      .then(() => true)
      .catch((e) => {
        assert.match(e.message, /409/);
        return false;
      }),
  ]);
  assert.equal(simultaneous.filter(Boolean).length, 1);
  const winner = (
    await call('operations', undefined, { admin: true })
  ).items.find((i) => i.id === id);
  assert.deepEqual(winner.symbols, [
    winner.title.includes('one') ? 'MU' : 'SKHY',
  ]);
  await call(
    'items',
    {
      ...input,
      id,
      status: 'archived',
      expected_updated_at: winner.updated_at,
    },
    { admin: true },
  );
  assert.ok(!(await call('brief?scope=all')).items.some((i) => i.id === id));
  const future = new Date(Date.now() + 5 * 86400000).toISOString();
  const event = {
    ...input,
    kind: 'event',
    status: 'published',
    url: 'https://example.com/event-' + stamp,
    event_date: future.slice(0, 10),
    event_at: future,
    certainty: 'confirmed',
  };
  const eventResult = await call('items', event, { admin: true, status: 201 });
  assert.ok(
    (await call('brief?kind=event')).items.some((i) => i.id === eventResult.id),
  );
  const dateOnly = {
    ...event,
    url: 'https://example.com/day-' + stamp,
    event_at: null,
    certainty: 'estimated',
  };
  const day = await call('items', dateOnly, { admin: true, status: 201 });
  assert.equal(
    (await call('brief?kind=event')).items.find((i) => i.id === day.id)
      .event_at,
    null,
  );
  const tomorrow = new Date(Date.now() + 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  assert.ok(
    !(await call('brief?kind=event&today=' + tomorrow)).items.some(
      (i) => i.id === day.id,
    ),
  );
  await call('brief?symbol=FAKE', undefined, { status: 400 });
  await call('brief?offset=-1', undefined, { status: 400 });
  await call('brief?kind=event&today=2026-02-30', undefined, { status: 400 });
  await call(
    'items',
    { ...input, url: 'javascript:alert(1)' },
    { admin: true, status: 400 },
  );
  await call(
    'items',
    { ...input, symbols: ['FAKE'] },
    { admin: true, status: 400 },
  );
  // Archiving an initialized source must survive initialization again.
  const seedInput = {
    ...seed,
    published_date: new Date(seed.published_at).toISOString().slice(0, 10),
    event_at: null,
    featured: !!seed.featured,
    status: 'archived',
    expected_updated_at: seed.updated_at,
  };
  await call('items', seedInput, { admin: true });
  await call('initialize', {});
  assert.ok(
    !(await call('brief?scope=all')).items.some((i) => i.id === seed.id),
  );
  const archived = (
    await call('operations', undefined, { admin: true })
  ).items.find((i) => i.id === seed.id);
  await call(
    'items',
    {
      ...seedInput,
      status: 'published',
      expected_updated_at: archived.updated_at,
    },
    { admin: true },
  );
  console.log(
    checks +
      ' editorial API checks passed: access, deduplication, publishing, archival, persistence, concurrency and calendar filtering.',
  );
}
