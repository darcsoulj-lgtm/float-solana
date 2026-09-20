import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileFunction } from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../lib/admin-wallet.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture() {
  const challenges = new Map();
  const sessions = new Map();
  let allowlist = 'AdminWallet';
  const database = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.startsWith('SELECT wallet,message FROM admin_wallet_challenges')) {
            const row = challenges.get(values[0]);
            return row?.expires_at > values[1] ? row : null;
          }
          if (sql.startsWith('DELETE FROM admin_wallet_challenges WHERE id=')) {
            const row = challenges.get(values[0]);
            challenges.delete(values[0]);
            return row ? { id: values[0] } : null;
          }
          if (sql.startsWith('SELECT wallet FROM admin_wallet_sessions')) {
            const row = sessions.get(values[0]);
            return row?.expires_at > values[1] ? row : null;
          }
          throw new Error('Unexpected query: ' + sql);
        },
        async run() {
          if (sql.startsWith('DELETE FROM admin_wallet_challenges WHERE expires_at')) {
            for (const [id, row] of challenges) if (row.expires_at < values[0]) challenges.delete(id);
          } else if (sql.startsWith('INSERT INTO admin_wallet_challenges')) {
            challenges.set(values[0], { wallet: values[1], message: values[2], expires_at: values[3] });
          } else if (sql.startsWith('INSERT INTO admin_wallet_sessions')) {
            sessions.set(values[0], { wallet: values[1], expires_at: values[2] });
          } else if (sql.startsWith('DELETE FROM admin_wallet_sessions')) {
            sessions.delete(values[0]);
          } else throw new Error('Unexpected query: ' + sql);
        },
      };
    },
  };
  class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const compiled = { exports: {} };
  compileFunction(code, ['require', 'module', 'exports'])(
    (id) => ({
      './server': { db: () => database, digest: async (value) => value, rateLimit: async () => {}, runtime: () => ({ ADMIN_WALLETS: allowlist }) },
      './solana': { validWallet: (value) => value, verifySignature: async (_wallet, _message, signature) => {
        if (signature !== 'valid') throw new AppError('Invalid signature', 403);
      } },
      './validation': { AppError, textValue: (value) => value },
    })[id], compiled, compiled.exports,
  );
  const request = (cookie = '') => new Request('https://float.example/api/community/admin-auth/verify', { headers: { cookie } });
  return { ...compiled.exports, challenges, sessions, setAllowlist: (value) => { allowlist = value; }, request };
}

void test('admin sign-in rejects unlisted wallets, invalid signatures and replay', async () => {
  const f = fixture();
  await assert.rejects(f.adminChallenge(f.request(), 'OtherWallet'), { status: 403 });
  const challenge = await f.adminChallenge(f.request(), 'AdminWallet');
  assert.match(challenge.message, /Origin: https:\/\/float\.example/);
  assert.match(challenge.message, /Float administrator sign-in/);
  await assert.rejects(f.adminVerify(f.request(), challenge.id, 'invalid'), { status: 403 });
  const cookie = await f.adminVerify(f.request(), challenge.id, 'valid');
  assert.match(cookie, /HttpOnly; SameSite=Strict; Max-Age=7200; Secure/);
  await assert.rejects(f.adminVerify(f.request(), challenge.id, 'valid'), { status: 401 });
  assert.equal(await f.adminWallet(f.request(cookie.split(';')[0])), 'AdminWallet');
});

void test('admin sessions expire, revoke on allowlist removal, and sign out', async () => {
  const f = fixture();
  const challenge = await f.adminChallenge(f.request(), 'AdminWallet');
  const cookie = await f.adminVerify(f.request(), challenge.id, 'valid');
  const req = f.request(cookie.split(';')[0]);
  f.setAllowlist('');
  await assert.rejects(f.adminWallet(req), { status: 401 });
  f.setAllowlist('AdminWallet');
  assert.equal(await f.adminWallet(req), 'AdminWallet');
  const token = cookie.split(';')[0].slice('float_admin='.length);
  const session = f.sessions.get(token);
  session.expires_at = Date.now() - 1;
  await assert.rejects(f.adminWallet(req), { status: 401 });
  session.expires_at = Date.now() + 1000;
  await f.adminLogout(req);
  await assert.rejects(f.adminWallet(req), { status: 401 });
});
