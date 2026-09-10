import { getWallets } from '@wallet-standard/app';
import { ed25519 } from '@noble/curves/ed25519.js';

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
) {
  return Object.keys(WALLET_NAMES).map((id) => {
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
export function selectedWallet(
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
