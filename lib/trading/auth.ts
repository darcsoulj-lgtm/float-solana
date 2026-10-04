import { validWallet, verifySignature } from '../solana';
import { solanaSignInInput, communitySignInMessage } from '../community-sign-in';
const SESSION_MS = 24 * 3600000;
const hash = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
export function tradeAuth(
  database: D1Database,
  now = Date.now,
  verify = verifySignature,
) {
  const db = database.withSession('first-primary');
  return {
    async challenge(wallet: string, origin: string) {
      validWallet(wallet);
      await db.batch([
        db
          .prepare('DELETE FROM trade_challenges WHERE expires_at<=?')
          .bind(now()),
        db
          .prepare('DELETE FROM trade_sessions WHERE expires_at<=?')
          .bind(now()),
        db
          .prepare(
            "DELETE FROM trade_orders WHERE state IN ('confirmed','failed','superseded','expired') AND updated_at<?",
          )
          .bind(now() - 30 * 86400000),
      ]);
      const id = crypto.randomUUID(),
        issuedAt = now(),
        expiresAt = issuedAt + 300000;
      const input = solanaSignInInput(origin, wallet, id, issuedAt, expiresAt,
        'Sign in to Float trading for 24 hours. Float stores your wallet address and private order records for order recovery. This message does not authorize a trade or transfer.');
      const message = communitySignInMessage(input);
      await db
        .prepare(
          'INSERT INTO trade_challenges (id,wallet,message,origin,expires_at) VALUES (?,?,?,?,?)',
        )
        .bind(id, wallet, message, origin, expiresAt)
        .run();
      return { id, input, message, expiresAt };
    },
    async verify(id: string, signature: unknown, origin: string) {
      const row = await db
        .prepare(
          'SELECT wallet,message,origin,expires_at FROM trade_challenges WHERE id=?',
        )
        .bind(id)
        .first<{
          wallet: string;
          message: string;
          origin: string;
          expires_at: number;
        }>();
      if (!row || row.origin !== origin || row.expires_at <= now())
        throw Error('Sign-in expired. Connect your wallet again.');
      await verify(row.wallet, row.message, signature);
      const walletKey = await hash('float-trading:' + row.wallet);
      const token = crypto.randomUUID() + crypto.randomUUID(),
        tokenHash = await hash(token);
      // DELETE RETURNING is one-use across simultaneous verification requests.
      const consumed = await db
        .prepare(
          'DELETE FROM trade_challenges WHERE id=? AND origin=? AND expires_at>? RETURNING id',
        )
        .bind(id, origin, now())
        .first();
      if (!consumed)
        throw Error('This sign-in was already used. Connect again.');
      await db
        .prepare(
          'INSERT INTO trade_sessions (hash,wallet,wallet_key,expires_at) VALUES (?,?,?,?)',
        )
        .bind(tokenHash, row.wallet, walletKey, now() + SESSION_MS)
        .run();
      return { token, wallet: row.wallet, walletKey };
    },
    async disconnect(req: Request) {
      const token = (req.headers.get('cookie') || '')
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith('float_trade='))
        ?.slice(12);
      if (token)
        await db
          .prepare('DELETE FROM trade_sessions WHERE hash=?')
          .bind(await hash(token))
          .run();
    },
    async session(req: Request) {
      const values = (req.headers.get('cookie') || '')
        .split(';')
        .map((v) => v.trim())
        .filter((v) => v.startsWith('float_trade='));
      if (values.length !== 1) return null;
      const token = values[0].slice('float_trade='.length);
      if (!/^[a-f0-9-]{72}$/.test(token)) return null;
      return db
        .prepare(
          'SELECT wallet,wallet_key AS walletKey FROM trade_sessions WHERE hash=? AND expires_at>?',
        )
        .bind(await hash(token), now())
        .first<{ wallet: string; walletKey: string }>();
    },
  };
}
export const tradeCookie = (token: string, req: Request) =>
  `float_trade=${token}; Path=/api/trade; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
