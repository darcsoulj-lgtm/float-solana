import type { StockToken } from './tokens';
export const HOLDER_ISSUERS = ['backpack', 'xstocks', 'ondo'] as const;
export async function holderRegistry(tokens: readonly StockToken[]) {
  return Promise.all(HOLDER_ISSUERS.map(async issuer => {
    const mints = tokens.filter(token => token.issuer === issuer).map(token => token.mint).sort();
    if (!mints.length || new Set(mints).size !== mints.length) throw Error('Invalid holder registry');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(mints.join('\n')));
    const registryHash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    return { issuer, mints, registryHash };
  }));
}
