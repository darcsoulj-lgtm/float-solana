import assert from 'node:assert/strict';
const base = 'http://localhost:3000';
let count = 0;
async function request(
  path,
  body,
  { auth = true, origin = base, expected = 200 } = {},
) {
  const r = await fetch(base + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(auth ? { Cookie: '__sites_local_auth=1' } : {}),
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
  assert.equal(r.status, expected, JSON.stringify({ path, d }));
  count++;
  return d;
}
await request('health');
await request('me', undefined, { auth: false, expected: 401 });
await request('admin', undefined, { auth: false, expected: 401 });
await request('surveys', {}, { auth: false, expected: 401 });
await request(
  'surveys',
  {},
  { origin: 'https://attacker.test', expected: 403 },
);
const input = {
  title: 'Integration study ' + Date.now(),
  description:
    'An automated local integration test. This is not a production survey.',
  symbol: 'MU',
  target: 10,
  rewardCents: 0,
  questions: [
    {
      prompt: 'Which factor matters most?',
      type: 'single',
      options: ['Earnings', 'Valuation'],
    },
  ],
};
const { id } = await request('surveys', input, { expected: 201 });
const mine = await request('surveys?mine=1');
assert.ok(mine.some((s) => s.id === id));
assert.ok(!('salt' in mine[0]));
await request('surveys/' + id, undefined, { auth: false, expected: 401 });
await request('surveys/' + id + '/analytics', undefined, {
  auth: false,
  expected: 401,
});
await request(
  'surveys/' + id + '/status',
  { status: 'active' },
  { expected: 400 },
);
await request('surveys/' + id + '/status', { status: 'pending' });
await request('surveys/' + id + '/status', { status: 'active' });
await request('surveys/' + id, undefined, { auth: false });
await request(
  'surveys/' + id + '/challenge',
  { wallet: 'invalid' },
  { auth: false, expected: 400 },
);
const c = await request(
  'surveys/' + id + '/challenge',
  { wallet: '11111111111111111111111111111111' },
  { auth: false },
);
await request(
  'surveys/' + id + '/verify',
  { challengeId: c.id, signature: Array(64).fill(0) },
  { auth: false, expected: 403 },
);
await request(
  'surveys/' + id + '/respond',
  { proof: 'x'.repeat(72), answers: { q1: 'Earnings' }, consent: true },
  { auth: false, expected: 401 },
);
await request(
  'surveys/' + id + '/respond',
  { proof: 'x'.repeat(72), answers: { q1: 'not a choice' }, consent: true },
  { auth: false, expected: 400 },
);
await request('surveys/' + id + '/status', { status: 'paused' });
await request(
  'surveys/' + id + '/challenge',
  { wallet: '11111111111111111111111111111111' },
  { auth: false, expected: 400 },
);
await request('surveys/' + id + '/status', { status: 'closed' });
await request(
  'surveys/' + id + '/status',
  { status: 'active' },
  { expected: 400 },
);
const demos = await request('admin/seed', {});
assert.equal(demos.seeded, 3);
const a = await request('surveys/demo-mu/analytics', undefined, {
  auth: false,
});
assert.equal(a.count, 24);
assert.equal(a.survey.demo, 1);
assert.equal(a.latestVerifiedAt, null);
await request(
  'surveys/demo-mu/challenge',
  { wallet: '11111111111111111111111111111111' },
  { auth: false, expected: 400 },
);
const o = await request(
  'orders',
  {
    plan: 'enterprise',
    organization: 'Local Test Lab',
    notes: 'Automated test only.',
  },
  { expected: 201 },
);
await request('admin/orders', { id: o.id, status: 'contacted' });
const orders = await request('orders');
assert.equal(orders.find((x) => x.id === o.id).status, 'contacted');
for (const path of [
  '/',
  '/surveys',
  '/pricing',
  '/enterprise',
  '/about',
  '/docs',
  '/trust',
  '/methodology',
  '/surveys/demo-mu',
  '/dashboard',
  '/dashboard/new',
  '/dashboard/' + id,
  '/admin',
]) {
  const r = await fetch(base + path, {
    headers: { Cookie: '__sites_local_auth=1' },
  });
  assert.equal(r.status, 200, path);
  const text = await r.text();
  assert.ok(text.includes('HolderPulse'), path);
  count++;
}
console.log(
  `${count} local integration assertions passed: auth, CSRF, persistence, lifecycle, invalid signatures, demo isolation, orders, rendered routes.`,
);
