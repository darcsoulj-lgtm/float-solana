// Fixed SIWS field set, following Phantom's Sign In with Solana specification.
// Store the exact expected message server-side; never trust a client-supplied message.
export type CommunitySignInInput = {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: '1';
  chainId: 'solana:mainnet';
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};

export function communitySignInInput(
  origin: string,
  address: string,
  challengeId: string,
  issuedAt: number,
  expiresAt: number,
): CommunitySignInInput {
  return solanaSignInInput(origin, address, challengeId, issuedAt, expiresAt,
    'Sign in to Float for 24-hour community access. Keep this wallet address for this session and store Backpack token balances privately to show your portfolio and verify access. No transaction or transfer is authorized.');
}

export function solanaSignInInput(
  origin: string,
  address: string,
  challengeId: string,
  issuedAt: number,
  expiresAt: number,
  statement: string,
): CommunitySignInInput {
  const url = new URL(origin);
  return {
    domain: url.host,
    address,
    statement,
    uri: url.origin,
    version: '1',
    chainId: 'solana:mainnet',
    nonce: challengeId.replaceAll('-', ''),
    issuedAt: new Date(issuedAt).toISOString(),
    expirationTime: new Date(expiresAt).toISOString(),
  };
}

export function communitySignInMessage(input: CommunitySignInInput): string {
  return [
    `${input.domain} wants you to sign in with your Solana account:`,
    input.address,
    '',
    input.statement,
    '',
    `URI: ${input.uri}`,
    `Version: ${input.version}`,
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expirationTime}`,
  ].join('\n');
}
