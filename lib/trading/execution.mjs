// Keep wire types separate from internal numeric expiry checks.
export function executionRequest(signedTransaction, order) {
  if (!Number.isSafeInteger(order.lastValidBlockHeight) || order.lastValidBlockHeight <= 0)
    throw Error('Missing validated order expiry.');
  return { signedTransaction, requestId: order.requestId, lastValidBlockHeight: String(order.lastValidBlockHeight) };
}

export async function executionResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('Missing execution response.');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw Error('Execution response too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function executionOutcome(http, data, signature) {
  const evidence = { http, code: Number.isSafeInteger(data?.code) ? data.code : null,
    status: ['Success', 'Failed'].includes(data?.status) ? data.status : null, kind: 'unconfirmed' };
  if (http === 200 && data?.status === 'Success' && data.code === 0 && data.signature === signature)
    return { state: 'confirmed', error: null, evidence: { ...evidence, kind: 'confirmed' } };
  // HTTP errors alone do not establish the chain outcome; retain the execution lock.
  return { state: 'unknown', error: 'We could not confirm the outcome. Do not place this order again.', evidence };
}
