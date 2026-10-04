import { runtime, rateLimit } from '@/lib/server';
import { readBoundedText } from '@/lib/request-body';
import { AppError } from '@/lib/validation';
import { tradeAuth, tradeCookie } from '@/lib/trading/auth';
import { orderStore } from '@/lib/trading/order-store';
import { createTradeService, TradeError } from '@/lib/trading/service.mjs';
import { tradeProvider } from '@/lib/trading/provider';
import { tradingBalances } from '@/lib/trading/balances.mjs';
export const dynamic = 'force-dynamic';
const reply = (
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
const allowedOrigin = (req: Request) => {
  const url = new URL(req.url);
  return (
    req.headers.get('origin') === url.origin &&
    (url.origin === 'https://joinfloat.xyz' ||
      (url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname)))
  );
};
export async function GET(req: Request) {
  if (new URL(req.url).pathname === '/api/trade/config')
    return reply({ enabled: runtime().TRADING_ENABLED === 'true' });
  return reply({ error: 'Not found.' }, 404);
}
export async function POST(req: Request) {
  try {
    const env = runtime();
    if (
      !allowedOrigin(req) ||
      req.headers.get('content-type')?.split(';')[0] !== 'application/json'
    )
      return reply({ error: 'Request rejected.' }, 403);
    const action = new URL(req.url).pathname.slice('/api/trade/'.length);
    if (
      ![
        'challenge',
        'verify',
        'session',
        'balances',
        'quote',
        'prepare',
        'execute',
        'status',
        'disconnect',
      ].includes(action)
    )
      return reply({ error: 'Not found.' }, 404);
    if (env.TRADING_ENABLED !== 'true' && ['quote', 'prepare', 'execute'].includes(action))
      return reply({ error: 'New trades are paused. You can still check an existing order.' }, 503);
    await rateLimit(
      'trade:' + (req.headers.get('cf-connecting-ip') || 'local'),
      60,
    );
    let body;
    try {
      body = JSON.parse(await readBoundedText(req, 8000));
    } catch {
      return reply({ error: 'Invalid request.' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return reply({ error: 'Invalid request.' }, 400);
    const auth = tradeAuth(env.DB),
      origin = new URL(req.url).origin;
    if (action === 'challenge') {
      await rateLimit(
        'trade-auth:' + (req.headers.get('cf-connecting-ip') || 'local'),
        8,
      );
      return reply(await auth.challenge(body.wallet, origin));
    }
    if (action === 'verify') {
      if (typeof body.id !== 'string' || body.id.length > 64)
        return reply({ error: 'Invalid sign-in.' }, 400);
      const session = await auth.verify(body.id, body.signature, origin);
      return reply({ wallet: session.wallet }, 200, {
        'Set-Cookie': tradeCookie(session.token, req),
      });
    }
    if (action === 'disconnect') {
      await auth.disconnect(req);
      return reply({ ok: true }, 200, {
        'Set-Cookie': tradeCookie('', req).replace(
          'Max-Age=86400',
          'Max-Age=0',
        ),
      });
    }
    const provider = tradeProvider(
        env.DB,
        env.TRADING_RPC_URL || env.SOLANA_RPC_URL,
      ),
      store = orderStore(env.DB);
    const service = createTradeService({ store, ...provider });
    if (action === 'quote') {
      await rateLimit(
        'trade-quotes:' + (req.headers.get('cf-connecting-ip') || 'local'),
        20,
      );
      return reply(await service.quote(body));
    }
    const session = await auth.session(req);
    if (!session)
      return reply({ error: 'Connect your wallet to continue.' }, 401);
    if (action === 'session') return reply({ wallet: session.wallet });
    await rateLimit('trade-wallet:' + session.walletKey, 30);
    if (action === 'balances')
      return reply(await tradingBalances(body.symbol, session, provider));
    if (action === 'prepare')
      return reply(await service.prepare(body, session));
    if (action === 'execute') {
      if (
        typeof body.id !== 'string' ||
        body.id.length > 64 ||
        typeof body.signedTransaction !== 'string' ||
        body.signedTransaction.length > 1800
      )
        return reply({ error: 'Invalid order.' }, 400);
      return reply(await service.execute(body, session));
    }
    if (
      body.id !== undefined &&
      (typeof body.id !== 'string' || body.id.length > 64)
    )
      return reply({ error: 'Invalid order.' }, 400);
    return reply(await service.status(body, session));
  } catch (error) {
    // Never expose database/provider internals, keys or raw transactions.
    if (error instanceof AppError)
      return reply({ error: error.message }, error.status);
    if (error instanceof TradeError)
      return reply({ error: error.message }, 422);
    return reply(
      {
        error:
          'The request could not be completed. If you approved an order, check its status before trying again.',
      },
      422,
    );
  }
}
