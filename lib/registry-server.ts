import { waitUntil } from 'cloudflare:workers';
import { backpackRegistry } from './backpack-registry';
import { registryTokens } from './token-registry';
import { db, runtime } from './server';

// This is the only registry entry point for eligibility/news/community consumers.
// Its additions come from issuer + onchain verification, never the request body.
export async function verifiedRegistry() {
  const registry = await backpackRegistry(
    db(),
    waitUntil,
    runtime().SOLANA_RPC_URL,
  );
  return { registry, tokens: registryTokens(registry) };
}
