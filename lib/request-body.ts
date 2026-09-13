import { AppError } from './validation';

// Count bytes before decoding or buffering. Content-Length alone is not trusted.
export async function readBoundedText(
  req: Pick<Request, 'headers' | 'body'>,
  maxBytes: number,
) {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new AppError('Request is too large.', 413);
  const reader = req.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new AppError('Request is too large.', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
