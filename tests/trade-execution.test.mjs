import test from 'node:test';
import assert from 'node:assert/strict';
import { executionRequest, executionResponse, executionOutcome } from '../lib/trading/execution.mjs';
const rejection = { success: false, error: { name: 'ZodError', issues: [{ code: 'invalid_type', expected: 'string', received: 'number', path: ['lastValidBlockHeight'], message: 'Expected string, received number' }] } };
void test('Jupiter v2 execute wire format uses a decimal string while internal expiry remains numeric', () => {
  const order = { requestId: 'test', lastValidBlockHeight: 430010032 };
  assert.deepEqual(executionRequest('fixture-only', order), { signedTransaction: 'fixture-only', requestId: 'test', lastValidBlockHeight: '430010032' });
  assert.equal(order.lastValidBlockHeight, 430010032);
  for (const height of [0, NaN, 1.2, Infinity, '430010032', Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => executionRequest('fixture-only', { ...order, lastValidBlockHeight: height }));
});
void test('matching success is terminal; contradictory schema errors remain unconfirmed', () => {
  assert.equal(executionOutcome(400, rejection, 'sig').state, 'unknown');
  assert.equal(executionOutcome(200, { status: 'Success', code: 0, signature: 'sig' }, 'sig').state, 'confirmed');
  for (const [http, data] of [
    [500, rejection], [400, { ...rejection, signature: 'sig' }],
    [400, { error: 'unknown error', code: -2 }], [400, { ...rejection, success: true }],
    [400, { success: false, error: { name: 'ZodError', issues: [] } }],
    [200, { status: 'Success', code: 0, signature: 'other' }],
    [200, { status: 'Failed', code: -1001, signature: 'sig' }],
    [429, {}], [503, null],
  ]) assert.equal(executionOutcome(http, data, 'sig').state, 'unknown');
  const evidence = executionOutcome(400, { ...rejection, signedTransaction: 'SECRET', wallet: 'PRIVATE' }, 'sig').evidence;
  assert.equal(JSON.stringify(evidence).includes('SECRET'), false);
  assert.equal(JSON.stringify(evidence).includes('PRIVATE'), false);
});
void test('execution response reads are bounded and malformed responses stay errors', async () => {
  assert.deepEqual(await executionResponse(Response.json(rejection)), rejection);
  await assert.rejects(executionResponse(new Response('x'.repeat(65537))), /too large/);
  await assert.rejects(executionResponse(new Response('<html>Bad Gateway</html>')));
});
