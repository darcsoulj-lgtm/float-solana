import { getWallets } from '@wallet-standard/app';
import { ed25519 } from '@noble/curves/ed25519.js';
import type { CommunitySignInInput } from './community-sign-in';

type RegisteredWallet = ReturnType<
  ReturnType<typeof getWallets>['get']
>[number];
type Account = RegisteredWallet['accounts'][number];
type ConnectFeature = { connect(): Promise<{ accounts: readonly Account[] }> };
type SignFeature = {
  signMessage(input: {
    account: Account;
    message: Uint8Array;
  }): Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
};
type PublicKey = { toString(): string; toBytes(): Uint8Array };
type PhantomProvider = {
  isPhantom?: boolean;
  isBackpack?: boolean;
  publicKey?: PublicKey | null;
  isConnected?: boolean;
  request(input: {
    method: 'connect' | 'signMessage';
    params?: { message: Uint8Array; display: 'utf8' };
  }): Promise<{ publicKey?: PublicKey | string; signature?: unknown }>;
  signIn?(input: CommunitySignInInput): Promise<{
    account: { address: string; publicKey: Uint8Array };
    signedMessage: Uint8Array;
    signature: Uint8Array;
    signatureType?: string;
  }>;
  on?: (event: string, listener: () => void) => void;
  removeListener?: (event: string, listener: () => void) => void;
};
export type WalletProviders = {
  phantom?: { solana?: PhantomProvider };
  backpack?: Partial<PhantomProvider>;
  solflare?: Partial<PhantomProvider>;
};
function browserProviders(): WalletProviders {
  return typeof window === 'undefined' ? {} : (window as WalletProviders);
}
function nativePhantom(providers: WalletProviders) {
  const p = providers.phantom?.solana;
  if (!p || p.isPhantom !== true || typeof p.request !== 'function')
    return undefined;
  if (
    p.isBackpack === true ||
    p === providers.backpack ||
    p === providers.solflare ||
    p.request === providers.backpack?.request ||
    p.request === providers.solflare?.request
  )
    return undefined;
  return p;
}
export const WALLET_NAMES: Record<string, string> = {
  phantom: 'Phantom',
  backpack: 'Backpack',
  solflare: 'Solflare',
};
export const walletLabel = (name: string) => WALLET_NAMES[name] || 'wallet';
const equalBytes = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  a.length === b.length && Array.from(a).every((value, i) => value === b[i]);

export function walletAvailability(
  wallets: readonly RegisteredWallet[] = getWallets().get(),
  providers: WalletProviders = browserProviders(),
) {
  return Object.keys(WALLET_NAMES).map((id) => {
    if (id === 'phantom')
      return {
        id,
        label: WALLET_NAMES[id],
        state: nativePhantom(providers)
          ? ('detected' as const)
          : ('missing' as const),
      };
    const matches = wallets.filter(
      (w) =>
        w.name === WALLET_NAMES[id] &&
        w.chains.includes('solana:mainnet') &&
        typeof (w.features['standard:connect'] as ConnectFeature)?.connect ===
          'function' &&
        typeof (w.features['solana:signMessage'] as SignFeature)
          ?.signMessage === 'function',
    );
    return {
      id,
      label: WALLET_NAMES[id],
      state:
        matches.length === 1
          ? ('detected' as const)
          : matches.length > 1
            ? ('ambiguous' as const)
            : ('missing' as const),
    };
  });
}
export function subscribeWallets(callback: () => void) {
  const registry = getWallets();
  const unregister = registry.on('register', callback),
    unregistered = registry.on('unregister', callback);
  return () => {
    unregister();
    unregistered();
  };
}
function bytes(value: unknown, description: string) {
  // Extension bridges may return another realm's typed array or a serialized byte array.
  if (!Array.isArray(value) && !ArrayBuffer.isView(value))
    throw new Error(`The wallet returned an invalid ${description}.`);
  const input = value as ArrayLike<number>;
  if (
    !Number.isSafeInteger(input.length) ||
    input.length < 0 ||
    input.length > 16000 ||
    Array.from(input).some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    throw new Error(`The wallet returned an invalid ${description}.`);
  return Uint8Array.from(input);
}
// Discover exact named Solana wallets. A browser's shared injected provider may
// route to another wallet. Never use it as a substitute for the user's choice.
export function standardWallet(
  name: string,
  wallets: readonly RegisteredWallet[] = getWallets().get(),
) {
  const label = WALLET_NAMES[name];
  if (!label) throw new Error('Choose a supported wallet.');
  const matches = wallets.filter(
    (w) =>
      w.name === label &&
      w.chains.includes('solana:mainnet') &&
      'standard:connect' in w.features &&
      'solana:signMessage' in w.features,
  );
  if (matches.length !== 1)
    throw new Error(
      matches.length > 1
        ? `More than one ${label} Solana provider was detected. Open ${label}'s own browser to continue.`
        : `${label} is not available in this browser. Open this page in a browser with the ${label} extension enabled, or inside the ${label} mobile app, then try again.`,
    );
  const wallet = matches[0];
  // Capture both features from the same registered object before any async work.
  const connectFeature = wallet.features['standard:connect'] as ConnectFeature;
  const signFeature = wallet.features['solana:signMessage'] as SignFeature;
  if (
    typeof connectFeature?.connect !== 'function' ||
    typeof signFeature?.signMessage !== 'function'
  )
    throw new Error(
      `${label} does not expose a compatible Solana signing interface.`,
    );
  const connect = connectFeature.connect.bind(connectFeature);
  const sign = signFeature.signMessage.bind(signFeature);
  let account: Account | undefined;
  let address = '';
  let publicKey: Uint8Array;
  // Account identity is its address + key + capabilities, not JS object identity.
  // Some extensions refresh read-only account objects while a request is pending.
  const currentAccount = () =>
    account &&
    wallet.accounts.find(
      (a) =>
        a.address === address &&
        equalBytes(a.publicKey, publicKey) &&
        a.chains.includes('solana:mainnet') &&
        a.features.includes('solana:signMessage'),
    );
  const stillSelected = () => !!currentAccount();
  return {
    accountUnchanged() {
      return !!stillSelected();
    },
    onAccountChange(callback: () => void) {
      const events = wallet.features['standard:events'] as
        | { on?: (event: 'change', callback: () => void) => () => void }
        | undefined;
      return (
        events?.on?.('change', () => {
          if (account && !stillSelected()) callback();
        }) || (() => {})
      );
    },
    async connect() {
      const response = await connect();
      account = response.accounts.find(
        (a) =>
          a.chains.includes('solana:mainnet') &&
          a.features.includes('solana:signMessage'),
      );
      if (!account || account.publicKey.length !== 32)
        throw new Error(`${label} did not provide a Solana account.`);
      address = account.address;
      publicKey = new Uint8Array(account.publicKey);
      if (!stillSelected())
        throw new Error('The wallet account changed. Connect again.');
      return { publicKey: { toString: () => address } };
    },
    async signMessage(message: Uint8Array) {
      if (!account || !stillSelected())
        throw new Error('The wallet account changed. Connect again.');
      const requested = new Uint8Array(message);
      const result = await sign({
        account: currentAccount()!,
        message: new Uint8Array(requested),
      });
      const output = result?.[0];
      if (!stillSelected())
        throw new Error(
          'The wallet account changed during signing. Connect again.',
        );
      if (!Array.isArray(result) || result.length !== 1 || !output)
        throw new Error(
          `${label} returned an invalid signing response. Reconnect and try again.`,
        );
      const signedMessage = bytes(output.signedMessage, 'signed message');
      const signature = bytes(output.signature, 'signature');
      if (
        !equalBytes(signedMessage, requested) ||
        signature.length !== 64 ||
        !ed25519.verify(signature, requested, publicKey, { zip215: false })
      ) {
        throw new Error(
          `${label} returned a signature for a different account or message. Verification was stopped. Reconnect the selected wallet and try again.`,
        );
      }
      return signature;
    },
  };
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(input: Uint8Array) {
  let value = 0n;
  for (const byte of input) value = value * 256n + BigInt(byte);
  let encoded = '';
  while (value) {
    encoded = BASE58[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of input) {
    if (byte !== 0) break;
    encoded = '1' + encoded;
  }
  return encoded;
}
function phantomSignature(input: unknown) {
  if (typeof input !== 'string') return bytes(input, 'signature');
  // Phantom's JSON-RPC interface may serialize the signature as base58.
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(input))
    throw new Error('Phantom returned an invalid signature.');
  let value = 0n;
  for (const char of input) value = value * 58n + BigInt(BASE58.indexOf(char));
  const decoded: number[] = [];
  while (value) {
    decoded.unshift(Number(value % 256n));
    value /= 256n;
  }
  for (const char of input) {
    if (char !== '1') break;
    decoded.unshift(0);
  }
  return Uint8Array.from(decoded);
}

export function phantomWallet(providers: WalletProviders = browserProviders()) {
  const p = nativePhantom(providers);
  if (!p)
    throw new Error(
      'Phantom’s dedicated Solana connection is unavailable or conflicts with another extension. No other wallet was opened. Reload this page with Phantom enabled.',
    );
  // Do not call the registered wallet's signing wrapper or a shared provider.
  // Capture native transports; community authentication uses the separate SIWS method.
  // oxlint-disable-next-line typescript/unbound-method -- Identity check only; calls use the explicitly bound function below.
  const requestMethod = p.request;
  const request = requestMethod.bind(p);
  // Capture the separate authentication method before any asynchronous work.
  // oxlint-disable-next-line typescript/unbound-method -- Compared by identity; invoked only via its bound copy.
  const signInMethod = p.signIn;
  const signIn =
    typeof signInMethod === 'function' ? signInMethod.bind(p) : undefined;
  let address = '';
  let publicKey: Uint8Array | undefined;
  const sameProvider = () =>
    nativePhantom(providers) === p && p.request === requestMethod;
  const key = () => {
    const current = p.publicKey;
    if (!current || typeof current.toBytes !== 'function') return undefined;
    const data = bytes(current.toBytes(), 'account');
    if (data.length !== 32 || current.toString() !== base58(data))
      return undefined;
    return { address: current.toString(), bytes: data };
  };
  const unchanged = () => {
    try {
      if (!publicKey || !sameProvider() || p.isConnected === false)
        return false;
      const current = key();
      return (
        !!current &&
        current.address === address &&
        equalBytes(current.bytes, publicKey)
      );
    } catch {
      return false;
    }
  };
  const requireUnchanged = () => {
    if (!unchanged())
      throw new Error(
        'The Phantom account or connection changed. Reload and connect again.',
      );
  };
  const requireSignIn = () => {
    if (!signIn || !signInMethod)
      throw new Error(
        'This Phantom connection does not support Sign In with Solana. Update Phantom and reload this page. No other wallet was opened.',
      );
    if (
      !sameProvider() ||
      p.signIn !== signInMethod ||
      signInMethod === providers.backpack?.signIn ||
      signInMethod === providers.solflare?.signIn
    )
      throw new Error(
        'The Phantom sign-in connection changed or conflicts with another wallet. Reload and connect again.',
      );
  };
  return {
    accountUnchanged: unchanged,
    requireSignIn,
    onAccountChange(callback: () => void) {
      const listener = () => {
        if (!unchanged()) callback();
      };
      p.on?.('accountChanged', listener);
      p.on?.('disconnect', listener);
      return () => {
        p.removeListener?.('accountChanged', listener);
        p.removeListener?.('disconnect', listener);
      };
    },
    async connect() {
      if (!sameProvider())
        throw new Error('The Phantom connection changed. Reload this page.');
      const result = await request({ method: 'connect' });
      const current = key();
      if (
        !sameProvider() ||
        !current ||
        result?.publicKey?.toString() !== current.address
      )
        throw new Error(
          'Phantom returned an inconsistent Solana account. Reload and connect again.',
        );
      address = current.address;
      publicKey = new Uint8Array(current.bytes);
      requireUnchanged();
      return { publicKey: { toString: () => address } };
    },
    async signMessage(message: Uint8Array) {
      requireUnchanged();
      const expected = new Uint8Array(message);
      const result = await request({
        method: 'signMessage',
        params: { message: new Uint8Array(expected), display: 'utf8' },
      });
      requireUnchanged();
      const signature = phantomSignature(result?.signature);
      if (
        (result?.publicKey !== undefined &&
          result.publicKey.toString() !== address) ||
        signature.length !== 64 ||
        !ed25519.verify(signature, expected, publicKey!, { zip215: false })
      )
        throw new Error(
          'Phantom returned a signature for a different account or message. Verification was stopped.',
        );
      return signature;
    },
    async signIn(input: CommunitySignInInput, message: Uint8Array) {
      requireSignIn();
      requireUnchanged();
      if (input.address !== address)
        throw new Error('The Phantom account changed. Connect again.');
      const expected = new Uint8Array(message);
      // SIWS uses its own provider operation. Never fall back to signMessage.
      const result = await signIn!({ ...input });
      requireSignIn();
      requireUnchanged();
      const signature = bytes(result?.signature, 'signature');
      const signedMessage = bytes(result?.signedMessage, 'signed message');
      const accountKey = bytes(result?.account?.publicKey, 'account');
      if (
        (result.signatureType !== undefined &&
          result.signatureType !== 'ed25519') ||
        result.account.address !== address ||
        !equalBytes(accountKey, publicKey!) ||
        !equalBytes(signedMessage, expected) ||
        signature.length !== 64 ||
        !ed25519.verify(signature, expected, publicKey!, { zip215: false })
      )
        throw new Error(
          'Phantom returned a signature for a different account or message. Verification was stopped.',
        );
      return signature;
    },
  };
}

export function selectedWallet(
  name: string,
  wallets: readonly RegisteredWallet[] = getWallets().get(),
  providers: WalletProviders = browserProviders(),
): ReturnType<typeof phantomWallet> | ReturnType<typeof standardWallet> {
  return name === 'phantom'
    ? phantomWallet(providers)
    : standardWallet(name, wallets);
}
