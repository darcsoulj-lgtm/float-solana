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
  const stillSelected = () =>
    account &&
    wallet.accounts.some(
      (a) =>
        a === account &&
        a.address === address &&
        equalBytes(a.publicKey, publicKey),
    );
  return {
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
        account,
        message: new Uint8Array(requested),
      });
      const output = result[0];
      if (!stillSelected())
        throw new Error(
          'The wallet account changed during signing. Connect again.',
        );
      if (
        result.length !== 1 ||
        !output ||
        !equalBytes(output.signedMessage, requested) ||
        output.signature.length !== 64 ||
        !ed25519.verify(output.signature, requested, publicKey, {
          zip215: false,
        })
      ) {
        throw new Error(
          `${label} returned a signature for a different account or message. Verification was stopped. Reconnect the selected wallet and try again.`,
        );
      }
      return new Uint8Array(output.signature);
    },
  };
}
