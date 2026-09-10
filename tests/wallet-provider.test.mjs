import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { ed25519 } from '@noble/curves/ed25519.js';
const require = createRequire(import.meta.url);
const dir = await mkdtemp(tmpdir() + '/hp-wallet-');
const source = await readFile(
  new URL('../lib/wallet-provider.ts', import.meta.url),
  'utf8',
);
let output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
for (const name of ['@wallet-standard/app', '@noble/curves/ed25519.js'])
  output = output.replace(
    "'" + name + "'",
    JSON.stringify(pathToFileURL(require.resolve(name)).href),
  );
await writeFile(dir + '/wallet.mjs', output);
const { selectedWallet } = await import(pathToFileURL(dir + '/wallet.mjs'));
const message = new TextEncoder().encode('HolderPulse test challenge');
function fixture(name = 'Phantom', options = {}) {
  const calls = [];
  const key = ed25519.utils.randomSecretKey();
  const account = {
    address: name + '-address',
    publicKey: ed25519.getPublicKey(key),
    chains: ['solana:mainnet'],
    features: ['solana:signMessage'],
  };
  const wallet = {
    name,
    chains: ['solana:mainnet'],
    accounts: [account],
    features: {
      'standard:connect': {
        connect: async () => {
          calls.push('connect');
          return { accounts: [account] };
        },
      },
      'solana:signMessage': {
        signMessage: async (input) => {
          calls.push('sign');
          assert.equal(input.account, account);
          if (options.changeAccount) wallet.accounts = [];
          const signedMessage = options.wrongMessage
            ? new Uint8Array([1, 2])
            : input.message;
          return [
            {
              signedMessage,
              signature: ed25519.sign(
                signedMessage,
                options.wrongKey ? ed25519.utils.randomSecretKey() : key,
              ),
            },
          ];
        },
      },
    },
  };
  return { wallet, account, calls };
}
test('Phantom connect and signing use only the named Solana wallet when Backpack and Phantom Sui coexist', async () => {
  const p = fixture(),
    b = fixture('Backpack'),
    s = fixture();
  s.wallet.chains = ['sui:mainnet'];
  const c = selectedWallet('phantom', [b.wallet, s.wallet, p.wallet]);
  assert.equal((await c.connect()).publicKey.toString(), 'Phantom-address');
  assert.equal((await c.signMessage(message)).length, 64);
  assert.deepEqual(p.calls, ['connect', 'sign']);
  assert.deepEqual(b.calls, []);
  assert.deepEqual(s.calls, []);
});
test('Every supported wallet connects and signs through its own account', async () => {
  for (const name of ['Phantom', 'Backpack', 'Solflare']) {
    const f = fixture(name);
    const c = selectedWallet(name.toLowerCase(), [f.wallet]);
    await c.connect();
    await c.signMessage(message);
    assert.deepEqual(f.calls, ['connect', 'sign']);
  }
});
test('Missing Phantom never opens Backpack', () => {
  const b = fixture('Backpack');
  assert.throws(
    () => selectedWallet('phantom', [b.wallet]),
    /Phantom is not available/,
  );
  assert.deepEqual(b.calls, []);
});
test('Duplicate Solana wallet names fail closed', () =>
  assert.throws(
    () => selectedWallet('phantom', [fixture().wallet, fixture().wallet]),
    /More than one Phantom/,
  ));
test('Unsupported wallet name and missing signing capability fail closed', () => {
  assert.throws(() => selectedWallet('unknown', []), /Choose/);
  const p = fixture();
  delete p.wallet.features['solana:signMessage'];
  assert.throws(() => selectedWallet('phantom', [p.wallet]), /not available/);
});
test('Account switch before signing is caught before a request is sent', async () => {
  const p = fixture(),
    c = selectedWallet('phantom', [p.wallet]);
  await c.connect();
  p.wallet.accounts = [];
  await assert.rejects(c.signMessage(message), /account changed/);
  assert.deepEqual(p.calls, ['connect']);
});
test('Account switch while signing is rejected', async () => {
  const p = fixture('Phantom', { changeAccount: true }),
    c = selectedWallet('phantom', [p.wallet]);
  await c.connect();
  await assert.rejects(c.signMessage(message), /account changed/);
});
for (const mode of ['wrongMessage', 'wrongKey'])
  test('Rejects ' + mode + ' before submitting verification', async () => {
    const p = fixture('Phantom', { [mode]: true }),
      c = selectedWallet('phantom', [p.wallet]);
    await c.connect();
    await assert.rejects(
      c.signMessage(message),
      /different account or message/,
    );
  });
test('User rejection propagates without falling through to a second wallet', async () => {
  const p = fixture(),
    b = fixture('Backpack');
  p.wallet.features['standard:connect'].connect = async () => {
    throw new Error('User rejected connection');
  };
  await assert.rejects(
    selectedWallet('phantom', [p.wallet, b.wallet]).connect(),
    /User rejected/,
  );
  assert.deepEqual(b.calls, []);
});
test('Provider feature replacement after connecting cannot reroute signing', async () => {
  const p = fixture(),
    b = fixture('Backpack'),
    c = selectedWallet('phantom', [p.wallet, b.wallet]);
  await c.connect();
  p.wallet.features['solana:signMessage'] =
    b.wallet.features['solana:signMessage'];
  await c.signMessage(message);
  assert.deepEqual(b.calls, []);
});
test('Both entry points use named-wallet selection without shared injected globals', async () => {
  for (const name of ['community', 'participant']) {
    const s = await readFile(
      new URL('../components/' + name + '.tsx', import.meta.url),
      'utf8',
    );
    assert.match(s, /selectedWallet\(provider\)/);
    assert.doesNotMatch(s, /window\.solana|w\.solana|\bphantom\?\.solana/);
  }
});

test('Wallet account-change subscriptions invalidate the captured account and can be removed', async () => {
  const p = fixture();
  let onChange,
    changed = 0,
    cleaned = false;
  p.wallet.features['standard:events'] = {
    on(event, callback) {
      assert.equal(event, 'change');
      onChange = callback;
      return () => {
        cleaned = true;
      };
    },
  };
  const c = selectedWallet('phantom', [p.wallet]);
  await c.connect();
  const unsubscribe = c.onAccountChange(() => changed++);
  onChange();
  assert.equal(changed, 0);
  assert.equal(c.accountUnchanged(), true);
  p.wallet.accounts = [];
  onChange();
  assert.equal(changed, 1);
  assert.equal(c.accountUnchanged(), false);
  unsubscribe();
  assert.equal(cleaned, true);
});
