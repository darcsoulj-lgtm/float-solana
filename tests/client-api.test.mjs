import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const { api, ApiError } = await bundle("export * from './lib/client';");

void test('No-holdings errors preserve a machine-readable reason without ending a valid session', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async () =>
    Response.json(
      { error: 'No supported holdings', code: 'NO_SUPPORTED_HOLDINGS' },
      { status: 403 },
    );
  try {
    await assert.rejects(
      api('community/challenge', { wallet: 'fixture' }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 403);
        assert.equal(error.code, 'NO_SUPPORTED_HOLDINGS');
        assert.equal(error.message, 'No supported holdings');
        return true;
      },
    );
    assert.deepEqual(events, []);
    globalThis.fetch = async () =>
      Response.json({ error: 'Expired' }, { status: 401 });
    await assert.rejects(api('community/home'), /Expired/);
    assert.deepEqual(events, ['hp-session-expired']);
    globalThis.fetch = async () =>
      Response.json({ error: 'Provider unavailable' }, { status: 503 });
    await assert.rejects(
      api('community/challenge', {}),
      (error) => error.code === undefined && error.status === 503,
    );
    assert.deepEqual(events, ['hp-session-expired']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
