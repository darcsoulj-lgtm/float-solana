import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
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
const {
  standardWallet: selectedWallet,
  selectedWallet: routeWallet,
  walletAvailability,
} = await import(pathToFileURL(dir + '/wallet.mjs'));
const message = new TextEncoder().encode('Float test challenge');
const signInSource = await readFile(
  new URL('../lib/community-sign-in.ts', import.meta.url),
  'utf8',
);
await writeFile(
  dir + '/sign-in.mjs',
  ts.transpileModule(signInSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText,
);
const { communitySignInInput, communitySignInMessage } = await import(
  pathToFileURL(dir + '/sign-in.mjs')
);
// Independent fixed-field rendering of the SIWS protocol returned by a wallet.
function walletSignInText(i) {
  return `${i.domain} wants you to sign in with your Solana account:\n${i.address}\n\n${i.statement}\n\nURI: ${i.uri}\nVersion: ${i.version}\nChain ID: ${i.chainId}\nNonce: ${i.nonce}\nIssued At: ${i.issuedAt}\nExpiration Time: ${i.expirationTime}`;
}
function toBase58(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + Buffer.from(bytes).toString('hex')),
    out = '';
  while (n) {
    out = alphabet[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b) break;
    out = '1' + out;
  }
  return out;
}
function phantomFixture(options = {}) {
  const pair = ed25519.keygen(),
    calls = [],
    listeners = new Map();
  const key = {
    toBytes: () => new Uint8Array(pair.publicKey),
    toString: () => toBase58(pair.publicKey),
  };
  const provider = {
    isPhantom: true,
    isConnected: false,
    publicKey: null,
    async request(input) {
      assert.equal(this, provider);
      calls.push(input.method);
      if (input.method === 'connect') {
        provider.publicKey = key;
        provider.isConnected = true;
        return { publicKey: key };
      }
      assert.equal(input.method, 'signMessage');
      assert.equal(input.params.display, 'utf8');
      if (options.reject) throw new Error('User rejected the request.');
      const signed = options.wrongMessage
        ? new Uint8Array([1, 2, 3])
        : input.params.message;
      const signature = ed25519.sign(
        signed,
        options.wrongKey ? ed25519.keygen().secretKey : pair.secretKey,
      );
      options.duringSign?.(provider);
      return {
        publicKey: options.wrongAddress
          ? '11111111111111111111111111111111'
          : key.toString(),
        signature: options.base58
          ? toBase58(signature)
          : options.serialized
            ? Array.from(signature)
            : signature,
      };
    },
    on(event, listener) {
      listeners.set(event, listener);
    },
    removeListener(event, listener) {
      if (listeners.get(event) === listener) listeners.delete(event);
    },
    async signIn(input) {
      assert.equal(this, provider);
      calls.push('signIn');
      if (options.signInError) throw options.signInError;
      const signedMessage = new TextEncoder().encode(walletSignInText(input));
      const result = {
        // Native Phantom returns address as a PublicKey-like object, not WalletAccount.
        address: key,
        signedMessage,
        signature: ed25519.sign(signedMessage, pair.secretKey),
        signatureType: 'ed25519',
      };
      options.onSignIn?.(result, provider, input);
      return result;
    },
  };
  return {
    provider,
    calls,
    key,
    listeners,
    providers: { phantom: { solana: provider } },
  };
}

function signInChallenge(p) {
  const input = communitySignInInput(
    'https://holderpulse.example',
    p.key.toString(),
    '12345678-1234-4123-a123-123456789abc',
    Date.parse('2026-09-10T13:00:00Z'),
    Date.parse('2026-09-10T13:05:00Z'),
  );
  return {
    input,
    message: new TextEncoder().encode(communitySignInMessage(input)),
  };
}

void test('SIWS fields bind the server origin, account, mainnet, alphanumeric nonce and five-minute expiry', () => {
  const p = phantomFixture(),
    c = signInChallenge(p);
  assert.equal(c.input.domain, 'holderpulse.example');
  assert.equal(c.input.uri, 'https://holderpulse.example');
  assert.equal(c.input.address, p.key.toString());
  assert.equal(c.input.chainId, 'solana:mainnet');
  assert.match(c.input.nonce, /^[a-zA-Z0-9]{32}$/);
  assert.equal(
    Date.parse(c.input.expirationTime) - Date.parse(c.input.issuedAt),
    300000,
  );
  assert.equal(new TextDecoder().decode(c.message), walletSignInText(c.input));
  assert.equal(c.message.at(-1), 'Z'.charCodeAt(0));
});

void test('Phantom membership uses the distinct signIn operation even when generic signing fails', async () => {
  const p = phantomFixture({ reject: true }),
    c = signInChallenge(p);
  const connection = routeWallet(
    'phantom',
    [fixture().wallet, fixture('Backpack').wallet],
    p.providers,
  );
  connection.requireSignIn();
  await connection.connect();
  assert.equal((await connection.signIn(c.input, c.message)).length, 64);
  assert.deepEqual(p.calls, ['connect', 'signIn']);
});

void test('Native Phantom SIWS accepts the SDK string-address response without an account field', async () => {
  const p = phantomFixture({
      onSignIn(result) {
        assert.equal(result.account, undefined);
        result.address = result.address.toString();
        delete result.signatureType;
      },
    }),
    c = signInChallenge(p);
  const connection = routeWallet('phantom', [], p.providers);
  await connection.connect();
  assert.equal((await connection.signIn(c.input, c.message)).length, 64);
  assert.deepEqual(p.calls, ['connect', 'signIn']);
});

for (const value of [undefined, null, 123, [], {}]) {
  void test(`Native Phantom SIWS rejects malformed address ${JSON.stringify(value)}`, async () => {
    const p = phantomFixture({
        onSignIn(result) {
          result.address = value;
        },
      }),
      c = signInChallenge(p);
    const connection = routeWallet('phantom', [], p.providers);
    await connection.connect();
    await assert.rejects(
      connection.signIn(c.input, c.message),
      /different account or message/,
    );
    assert.deepEqual(p.calls, ['connect', 'signIn']);
  });
}

void test('A Wallet Standard account cannot substitute for the native Phantom address field', async () => {
  const p = phantomFixture({
      onSignIn(result) {
        result.account = { address: result.address.toString() };
        delete result.address;
      },
    }),
    c = signInChallenge(p);
  const connection = routeWallet('phantom', [], p.providers);
  await connection.connect();
  await assert.rejects(
    connection.signIn(c.input, c.message),
    /different account or message/,
  );
});

void test('Missing or shared Phantom signIn stops before requesting another operation', async () => {
  for (const kind of ['missing', 'shared']) {
    const p = phantomFixture();
    if (kind === 'missing') delete p.provider.signIn;
    else p.providers.backpack = { signIn: Reflect.get(p.provider, 'signIn') };
    const connection = routeWallet('phantom', [], p.providers);
    assert.throws(() => connection.requireSignIn());
    assert.deepEqual(p.calls, []);
  }
});

void test('Rejected SIWS never retries generic signing or another wallet', async () => {
  const p = phantomFixture({
      signInError: new Error('User rejected the request.'),
    }),
    c = signInChallenge(p);
  const connection = routeWallet('phantom', [], p.providers);
  await connection.connect();
  await assert.rejects(connection.signIn(c.input, c.message), /rejected/);
  assert.deepEqual(p.calls, ['connect', 'signIn']);
});

for (const field of ['domain', 'nonce', 'expirationTime', 'address']) {
  void test(`SIWS rejects a changed ${field} rather than granting membership`, async () => {
    const p = phantomFixture(),
      c = signInChallenge(p);
    const connection = routeWallet('phantom', [], p.providers);
    await connection.connect();
    await assert.rejects(
      connection.signIn({ ...c.input, [field]: 'changed' }, c.message),
      /changed|different account or message/,
    );
  });
}

for (const kind of [
  'address',
  'key',
  'signature',
  'message',
  'type',
  'connection',
  'method',
]) {
  void test(`SIWS rejects a changed response ${kind}`, async () => {
    const p = phantomFixture({
        onSignIn(result, provider) {
          if (kind === 'address')
            result.address = '11111111111111111111111111111111';
          if (kind === 'key')
            result.signature = ed25519.sign(
              result.signedMessage,
              ed25519.keygen().secretKey,
            );
          if (kind === 'signature') result.signature = new Uint8Array(64);
          if (kind === 'message') result.signedMessage = new Uint8Array([1]);
          if (kind === 'type') result.signatureType = 'other';
          if (kind === 'connection') provider.publicKey = null;
          if (kind === 'method') provider.signIn = async () => result;
        },
      }),
      c = signInChallenge(p);
    const connection = routeWallet('phantom', [], p.providers);
    await connection.connect();
    await assert.rejects(
      connection.signIn(c.input, c.message),
      /changed|different account or message/,
    );
    assert.deepEqual(p.calls, ['connect', 'signIn']);
  });
}

void test('Phantom uses its dedicated request transport even when its standard signing wrapper routes to Backpack', async () => {
  const p = phantomFixture(),
    standard = fixture(),
    backpack = fixture('Backpack');
  standard.wallet.features['solana:signMessage'] =
    backpack.wallet.features['solana:signMessage'];
  const c = routeWallet(
    'phantom',
    [standard.wallet, backpack.wallet],
    p.providers,
  );
  assert.equal((await c.connect()).publicKey.toString(), p.key.toString());
  assert.equal((await c.signMessage(message)).length, 64);
  assert.deepEqual(p.calls, ['connect', 'signMessage']);
  assert.deepEqual(standard.calls, []);
  assert.deepEqual(backpack.calls, []);
});

void test('Missing native Phantom never falls back to a named registration or shared Backpack provider', () => {
  const b = phantomFixture();
  assert.throws(
    () =>
      routeWallet('phantom', [fixture().wallet], {
        backpack: b.provider,
        solana: b.provider,
      }),
    /dedicated Solana connection/,
  );
  assert.deepEqual(b.calls, []);
});

for (const collision of ['isBackpack', 'sameObject', 'sameRequest']) {
  void test(`Phantom rejects ${collision} conflicts before opening a wallet`, () => {
    const p = phantomFixture();
    if (collision === 'isBackpack') p.provider.isBackpack = true;
    if (collision === 'sameObject') p.providers.backpack = p.provider;
    if (collision === 'sameRequest')
      p.providers.backpack = { request: Reflect.get(p.provider, 'request') };
    assert.throws(() => routeWallet('phantom', [], p.providers), /conflicts/);
    assert.deepEqual(p.calls, []);
  });
}

for (const representation of ['base58', 'serialized']) {
  void test(`Phantom validates a ${representation} JSON-RPC signature`, async () => {
    const p = phantomFixture({ [representation]: true }),
      c = routeWallet('phantom', [], p.providers);
    await c.connect();
    assert.equal((await c.signMessage(message)).length, 64);
  });
}

for (const invalid of ['wrongMessage', 'wrongKey', 'wrongAddress']) {
  void test(`Phantom rejects ${invalid} from its dedicated request transport`, async () => {
    const p = phantomFixture({ [invalid]: true }),
      c = routeWallet('phantom', [], p.providers);
    await c.connect();
    await assert.rejects(
      c.signMessage(message),
      /different account or message/,
    );
  });
}

void test('Phantom rejection never opens another wallet or retries another signing API', async () => {
  const p = phantomFixture({ reject: true }),
    c = routeWallet('phantom', [], p.providers);
  await c.connect();
  await assert.rejects(c.signMessage(message), /User rejected/);
  assert.deepEqual(p.calls, ['connect', 'signMessage']);
});

for (const change of ['account', 'request', 'namespace']) {
  void test(`Phantom ${change} replacement after connect prevents signing`, async () => {
    const p = phantomFixture(),
      c = routeWallet('phantom', [], p.providers);
    await c.connect();
    if (change === 'account') p.provider.publicKey = phantomFixture().key;
    if (change === 'request')
      p.provider.request = Reflect.get(phantomFixture().provider, 'request');
    if (change === 'namespace')
      p.providers.phantom.solana = phantomFixture().provider;
    assert.equal(c.accountUnchanged(), false);
    await assert.rejects(c.signMessage(message), /connection changed/);
    assert.deepEqual(p.calls, ['connect']);
  });
}

void test('Phantom account changes during signing reject the result', async () => {
  const p = phantomFixture({
    duringSign(provider) {
      provider.publicKey = null;
    },
  });
  const c = routeWallet('phantom', [], p.providers);
  await c.connect();
  await assert.rejects(c.signMessage(message), /connection changed/);
});

void test('Native Phantom detection works without a Wallet Standard registration', () => {
  const p = phantomFixture();
  assert.equal(
    walletAvailability([], p.providers).find((w) => w.id === 'phantom').state,
    'detected',
  );
});

void test('Native Phantom disconnect events invalidate the session and remove listeners on cleanup', async () => {
  const p = phantomFixture(),
    c = routeWallet('phantom', [], p.providers);
  await c.connect();
  let changes = 0;
  const cleanup = c.onAccountChange(() => changes++);
  p.listeners.get('accountChanged')();
  assert.equal(changes, 0);
  p.provider.isConnected = false;
  p.listeners.get('disconnect')();
  assert.equal(changes, 1);
  cleanup();
  assert.equal(p.listeners.size, 0);
});
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
          assert.equal(input.account, wallet.accounts[0]);
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
void test('Wallet Standard adapter separates named Solana accounts from other wallets and Sui', async () => {
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
void test('Every supported wallet connects and signs through its own account', async () => {
  for (const name of ['Phantom', 'Backpack', 'Solflare']) {
    const f = fixture(name);
    const c = selectedWallet(name.toLowerCase(), [f.wallet]);
    await c.connect();
    await c.signMessage(message);
    assert.deepEqual(f.calls, ['connect', 'sign']);
  }
});
void test('Missing Phantom never opens Backpack', () => {
  const b = fixture('Backpack');
  assert.throws(
    () => selectedWallet('phantom', [b.wallet]),
    /Phantom is not available/,
  );
  assert.deepEqual(b.calls, []);
});
void test('Duplicate Solana wallet names fail closed', () =>
  assert.throws(
    () => selectedWallet('phantom', [fixture().wallet, fixture().wallet]),
    /More than one Phantom/,
  ));
void test('Unsupported wallet name and missing signing capability fail closed', () => {
  assert.throws(() => selectedWallet('unknown', []), /Choose/);
  const p = fixture();
  delete p.wallet.features['solana:signMessage'];
  assert.throws(() => selectedWallet('phantom', [p.wallet]), /not available/);
});
void test('Account switch before signing is caught before a request is sent', async () => {
  const p = fixture(),
    c = selectedWallet('phantom', [p.wallet]);
  await c.connect();
  p.wallet.accounts = [];
  await assert.rejects(c.signMessage(message), /account changed/);
  assert.deepEqual(p.calls, ['connect']);
});
void test('Account switch while signing is rejected', async () => {
  const p = fixture('Phantom', { changeAccount: true }),
    c = selectedWallet('phantom', [p.wallet]);
  await c.connect();
  await assert.rejects(c.signMessage(message), /account changed/);
});
for (const mode of ['wrongMessage', 'wrongKey'])
  void test('Rejects ' + mode + ' before submitting verification', async () => {
    const p = fixture('Phantom', { [mode]: true }),
      c = selectedWallet('phantom', [p.wallet]);
    await c.connect();
    await assert.rejects(
      c.signMessage(message),
      /different account or message/,
    );
  });
void test('User rejection propagates without falling through to a second wallet', async () => {
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
void test('Provider feature replacement after connecting cannot reroute signing', async () => {
  const p = fixture(),
    b = fixture('Backpack'),
    c = selectedWallet('phantom', [p.wallet, b.wallet]);
  await c.connect();
  p.wallet.features['solana:signMessage'] =
    b.wallet.features['solana:signMessage'];
  await c.signMessage(message);
  assert.deepEqual(b.calls, []);
});
void test('Both entry points use named-wallet selection without shared injected globals', async () => {
  for (const name of ['community', 'participant']) {
    const s = await readFile(
      new URL('../components/' + name + '.tsx', import.meta.url),
      'utf8',
    );
    assert.match(s, /selectedWallet\(provider(?:Name)?\)/);
    assert.doesNotMatch(s, /window\.solana|w\.solana|\bphantom\?\.solana/);
  }
});

void test('Equivalent refreshed account objects stay connected and use the current account for signing', async () => {
  const p = fixture(),
    c = selectedWallet('phantom', [p.wallet]);
  // A connect result can be an equivalent data object, not the same reference.
  p.wallet.accounts = [structuredClone(p.account)];
  await c.connect();
  p.wallet.accounts = [structuredClone(p.account)];
  assert.equal(c.accountUnchanged(), true);
  assert.equal((await c.signMessage(message)).length, 64);
});

void test('Same address with a changed public key is rejected before signing', async () => {
  const p = fixture(),
    c = selectedWallet('phantom', [p.wallet]);
  await c.connect();
  p.wallet.accounts = [{ ...p.account, publicKey: ed25519.keygen().publicKey }];
  assert.equal(c.accountUnchanged(), false);
  await assert.rejects(c.signMessage(message), /account changed/);
  assert.deepEqual(p.calls, ['connect']);
});

for (const shape of ['serialized', 'cross-realm']) {
  void test(`Accepts cryptographically valid ${shape} signature bytes`, async () => {
    const p = fixture();
    const feature = p.wallet.features['solana:signMessage'];
    const original = feature.signMessage;
    const convert = (bytes) =>
      shape === 'serialized'
        ? Array.from(bytes)
        : runInNewContext('new Uint8Array(values)', {
            values: Array.from(bytes),
          });
    feature.signMessage = async (input) => {
      const [result] = await original(input);
      return [
        {
          signedMessage: convert(result.signedMessage),
          signature: convert(result.signature),
        },
      ];
    };
    const c = selectedWallet('phantom', [p.wallet]);
    await c.connect();
    assert.equal((await c.signMessage(message)).length, 64);
  });
}

for (const bad of [-1, 256, 1.5, '1', null]) {
  void test(`Rejects malformed signature byte ${JSON.stringify(bad)}`, async () => {
    const p = fixture();
    p.wallet.features['solana:signMessage'].signMessage = async () => [
      { signedMessage: message, signature: [bad, ...Array(63).fill(0)] },
    ];
    const c = selectedWallet('phantom', [p.wallet]);
    await c.connect();
    await assert.rejects(c.signMessage(message), /invalid signature/);
  });
}

void test('Wallet picker requires native Phantom and detects missing capabilities on other wallets', () => {
  const phantom = fixture(),
    backpack = fixture('Backpack'),
    solflare = fixture('Solflare');
  delete solflare.wallet.features['solana:signMessage'];
  const result = walletAvailability([
    phantom.wallet,
    fixture().wallet,
    backpack.wallet,
    solflare.wallet,
  ]);
  assert.deepEqual(
    result.map((w) => [w.id, w.state]),
    [
      ['phantom', 'missing'],
      ['backpack', 'detected'],
      ['solflare', 'missing'],
    ],
  );
  assert.deepEqual(backpack.calls, []);
});

function namedNativeFixture(name, options = {}) {
  const pair = ed25519.keygen();
  const key = {
    toBytes: () => new Uint8Array(pair.publicKey),
    toString: () => toBase58(pair.publicKey),
  };
  const calls = [];
  const provider = {
    [name === 'backpack' ? 'isBackpack' : 'isSolflare']: true,
    publicKey: null,
    isConnected: false,
    async connect() {
      calls.push('connect');
      this.publicKey = key;
      this.isConnected = true;
      return { publicKey: key };
    },
    async signMessage(input) {
      calls.push('sign');
      return { signature: ed25519.sign(input, options.wrongKey ? ed25519.keygen().secretKey : pair.secretKey) };
    },
  };
  return { provider, calls };
}
for (const name of ['backpack', 'solflare']) {
  void test(`Native ${name} connects and signs when Wallet Standard is absent`, async () => {
    const f = namedNativeFixture(name);
    const providers = { [name]: f.provider };
    assert.equal(walletAvailability([], providers).find((w) => w.id === name).state, 'detected');
    const connection = routeWallet(name, [], providers);
    await connection.connect();
    assert.equal(connection.accountUnchanged(), true);
    assert.equal((await connection.signMessage(message)).length, 64);
    assert.deepEqual(f.calls, ['connect', 'sign']);
  });
  void test(`Native ${name} rejects a signature from another key`, async () => {
    const f = namedNativeFixture(name, { wrongKey: true });
    const connection = routeWallet(name, [], { [name]: f.provider });
    await connection.connect();
    await assert.rejects(connection.signMessage(message), /different account or message/);
  });
  void test(`Native ${name} refuses an account switch before signing`, async () => {
    const f = namedNativeFixture(name);
    const connection = routeWallet(name, [], { [name]: f.provider });
    await connection.connect();
    f.provider.publicKey = null;
    await assert.rejects(connection.signMessage(message), /account changed/);
    assert.deepEqual(f.calls, ['connect']);
  });
}
void test('Named native wallets never substitute for each other or Phantom', () => {
  const backpack = namedNativeFixture('backpack');
  const providers = { backpack: backpack.provider, solflare: backpack.provider, phantom: { solana: backpack.provider } };
  assert.equal(walletAvailability([], providers).find((w) => w.id === 'backpack').state, 'missing');
  assert.equal(walletAvailability([], providers).find((w) => w.id === 'solflare').state, 'missing');
  assert.throws(() => routeWallet('solflare', [], providers), /not available/);
  assert.throws(() => routeWallet('phantom', [], providers), /unavailable/);
  assert.deepEqual(backpack.calls, []);
});

void test('Wallet account-change subscriptions invalidate the captured account and can be removed', async () => {
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
