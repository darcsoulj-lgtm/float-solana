import { waitUntil } from 'cloudflare:workers';
import { db, rateLimit } from '@/lib/server';
import { publicJson } from '@/lib/market-data';
import { marketSnapshot } from '@/lib/market-cache';
import { TOKENS } from '@/lib/tokens';
import { parseTesseraContext } from '@/lib/tessera-data';
export async function GET(req: Request) {
  try {
    await rateLimit(
      'tessera-context:' + (req.headers.get('cf-connecting-ip') || 'anonymous'),
      60,
    );
    const result = await marketSnapshot(
      db(),
      'tessera-context-v1',
      300000,
      async () =>
        parseTesseraContext(
          await publicJson(
            'https://rest-api.tessera.pe/v1/public/token-details',
          ),
          TOKENS,
        ),
      waitUntil,
    );
    return Response.json(result, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json(
      {
        data: null,
        stale: true,
        fetchedAt: null,
        error: 'Issuer context unavailable.',
      },
      { status: 503 },
    );
  }
}
