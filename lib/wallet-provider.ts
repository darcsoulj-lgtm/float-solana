export type WalletProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey?: { toString(): string } }>;
  signMessage(
    message: Uint8Array,
    encoding: string,
  ): Promise<Uint8Array | { signature: Uint8Array }>;
};
export type WalletWindow = {
  backpack?: WalletProvider;
  phantom?: { solana?: WalletProvider };
  solflare?: WalletProvider;
};

// Never use window.solana: another extension can own that shared namespace.
// Phantom detection follows https://docs.phantom.com/solana/detecting-the-provider.
export function selectedWallet(name: string, w: WalletWindow): WalletProvider {
  const p =
    name === 'phantom'
      ? w.phantom?.solana?.isPhantom === true
        ? w.phantom.solana
        : undefined
      : name === 'backpack'
        ? w.backpack
        : name === 'solflare'
          ? w.solflare
          : undefined;
  const label = (
    {
      phantom: 'Phantom',
      backpack: 'Backpack',
      solflare: 'Solflare',
    } as Record<string, string>
  )[name];
  if (!label) throw new Error('Choose a supported wallet.');
  if (
    typeof p?.connect !== 'function' ||
    typeof p?.signMessage !== 'function'
  ) {
    throw new Error(
      `${label} is not available in this browser. Open this page in a browser with the ${label} extension enabled, or inside the ${label} mobile app, then try again.`,
    );
  }
  return p;
}
