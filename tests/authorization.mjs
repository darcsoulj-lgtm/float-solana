import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const original = await readFile('.dev.vars', 'utf8'),
  originalEnv = await readFile('.env', 'utf8');
try {
  await writeFile('.dev.vars', 'ADMIN_EMAILS=\n');
  await writeFile('.env', originalEnv + '\n# Role test ' + Date.now() + '\n');
  await new Promise((r) => setTimeout(r, 3500));
  const base = 'http://localhost:3000';
  async function request(path, body, expected, auth = true) {
    const r = await fetch(base + '/api/' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(auth
          ? { Cookie: '__sites_local_auth=1' }
          : {
              'oai-authenticated-user-id': 'attacker',
              'oai-authenticated-user-email': 'seedy@sites.test',
            }),
        ...(body ? { Origin: base, 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    assert.equal(r.status, expected, JSON.stringify(d));
    return d;
  }
  assert.equal((await request('me', null, 200)).role, 'researcher');
  await request('admin', null, 403);
  await request('editorial/operations', null, 403);
  await request('editorial/items', {}, 403);
  await request('editorial/operations', null, 401, false);
  await request('me', null, 401, false);
  await request('surveys/demo-mu/status', { status: 'closed' }, 403);
  const s = await request(
    'surveys',
    {
      title: 'Authorization study ' + Date.now(),
      description:
        'Only a local authorization test, with no actual participants.',
      symbol: 'MU',
      target: 5,
      rewardCents: 0,
      questions: [
        {
          type: 'single',
          prompt: 'Test the boundary?',
          options: ['Yes', 'No'],
        },
      ],
    },
    201,
  );
  await request(`surveys/${s.id}/status`, { status: 'pending' }, 200);
  await request(`surveys/${s.id}/status`, { status: 'active' }, 400);
  await request(`surveys/${s.id}/status`, { status: 'closed' }, 200);
  console.log(
    '11 authorization checks passed: researcher role, admin/editorial denial, spoofed identity rejection, foreign ownership, no self-publication.',
  );
} finally {
  await writeFile('.dev.vars', original);
  await writeFile('.env', originalEnv);
}
