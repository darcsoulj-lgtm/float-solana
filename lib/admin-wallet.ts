import { db, digest, rateLimit, runtime } from './server';
import { validWallet, verifySignature } from './solana';
import { AppError, textValue } from './validation';

const SESSION_MS = 2 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;

function allowed(wallet: string) {
  return (runtime().ADMIN_WALLETS || '')
    .split(',')
    .map((value) => value.trim())
    .includes(wallet);
}

function cookieValue(req: Request) {
  const matches = (req.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('float_admin='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice('float_admin='.length);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function adminCookie(token: string, req: Request, clear = false) {
  return `float_admin=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_MS / 1000}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}

// Moderation API is outside /admin, so the cookie must reach /api/community too.
export function adminApiCookie(token: string, req: Request, clear = false) {
  return adminCookie(token, req, clear).replace('Path=/admin;', 'Path=/;');
}

export function adminWallet(req: Request, required: false): Promise<string | null>;
export function adminWallet(req: Request, required?: true): Promise<string>;
export async function adminWallet(req: Request, required = true): Promise<string | null> {
  const token = cookieValue(req);
  const row = token
    ? await db()
        .prepare('SELECT wallet FROM admin_wallet_sessions WHERE hash=? AND expires_at>?')
        .bind(await digest(token), Date.now())
        .first<{ wallet: string }>()
    : null;
  if (row && allowed(row.wallet)) return row.wallet;
  if (required) throw new AppError('Connect your administrator wallet.', 401);
  return null;
}

export async function adminChallenge(req: Request, input: unknown) {
  const wallet = validWallet(textValue(input, 32, 44, 'Wallet'));
  await rateLimit('admin-wallet:' + wallet, 5);
  // Do not reveal which public addresses are administrators.
  if (!allowed(wallet)) throw new AppError('Administrator access is required.', 403);
  const now = Date.now();
  await db().prepare('DELETE FROM admin_wallet_challenges WHERE expires_at<?').bind(now).run();
  const id = crypto.randomUUID();
  const expiresAt = now + CHALLENGE_MS;
  const message = `Float administrator sign-in\nOrigin: ${new URL(req.url).origin}\nWallet: ${wallet}\nNonce: ${id}\nExpires: ${new Date(expiresAt).toISOString()}\nThis signature grants temporary access to Float community moderation. No transaction or asset transfer is authorized.`;
  await db().prepare('INSERT INTO admin_wallet_challenges (id,wallet,message,expires_at) VALUES (?,?,?,?)')
    .bind(id, wallet, message, expiresAt).run();
  return { id, message, expiresAt };
}

export async function adminVerify(req: Request, challengeId: unknown, signature: unknown) {
  const id = textValue(challengeId, 36, 36, 'Challenge');
  const challenge = await db().prepare('SELECT wallet,message FROM admin_wallet_challenges WHERE id=? AND expires_at>?')
    .bind(id, Date.now()).first<{ wallet: string; message: string }>();
  if (!challenge || !allowed(challenge.wallet)) throw new AppError('The admin sign-in expired. Try again.', 401);
  await rateLimit('admin-verify:' + id, 5);
  await verifySignature(challenge.wallet, challenge.message, signature);
  const consumed = await db().prepare('DELETE FROM admin_wallet_challenges WHERE id=? RETURNING id').bind(id).first();
  if (!consumed) throw new AppError('This sign-in was already used.', 409);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  await db().prepare('INSERT INTO admin_wallet_sessions (hash,wallet,expires_at) VALUES (?,?,?)')
    .bind(await digest(token), challenge.wallet, Date.now() + SESSION_MS).run();
  return adminApiCookie(token, req);
}

export async function adminLogout(req: Request) {
  const token = cookieValue(req);
  if (token) await db().prepare('DELETE FROM admin_wallet_sessions WHERE hash=?').bind(await digest(token)).run();
  return adminApiCookie('', req, true);
}
