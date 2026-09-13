import { rateLimit } from '@/lib/server';
export async function POST(req: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (req.headers.get('origin') !== new URL(req.url).origin)
    return new Response(null, { status: 403, headers });
  try {
    await rateLimit(
      'client-error:' + (req.headers.get('cf-connecting-ip') || 'anonymous'),
      10,
    );
    // Bound the stream rather than trusting Content-Length.
    const reader = req.body?.getReader();
    if (!reader) return new Response(null, { status: 400, headers });
    let raw = '';
    const decoder = new TextDecoder();
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      raw += decoder.decode(part.value, { stream: true });
      if (raw.length > 2048) {
        await reader.cancel();
        return new Response(null, { status: 413, headers });
      }
    }
    const value = JSON.parse(raw);
    if (
      !['Home', 'Markets', 'App'].includes(value.section) ||
      !['module', 'render'].includes(value.kind) ||
      !(
        value.code === null ||
        (typeof value.code === 'string' && /^\d{1,4}$/.test(value.code))
      ) ||
      !Array.isArray(value.assets) ||
      value.assets.length > 4 ||
      !value.assets.every(
        (p: unknown) =>
          typeof p === 'string' &&
          p.length < 240 &&
          /^\/_next\/static\/chunks\/[A-Za-z0-9_-]+\.(?:js|css)(?::\d+:\d+)?$/.test(
            p,
          ),
      )
    )
      return new Response(null, { status: 400, headers });
    console.error(
      'Client section failed',
      JSON.stringify({
        section: value.section,
        kind: value.kind,
        code: value.code,
        assets: value.assets,
      }),
    );
    return new Response(null, { status: 204, headers });
  } catch {
    return new Response(null, { status: 400, headers });
  }
}
