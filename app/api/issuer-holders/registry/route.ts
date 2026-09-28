import { runtime } from '@/lib/server';
import { backpackRegistry, registryTokens } from '@/lib/backpack-registry';
import { holderRegistry } from '@/lib/issuer-holder-registry';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const env = runtime();
    const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, Date.now(), true);
    // The collector must not silently miss recently listed Backpack tokens.
    if (!registry.checkedAt || Date.now() - registry.checkedAt > 3600000) throw Error('Registry not fresh');
    return Response.json({version:1, issuers:await holderRegistry(registryTokens(registry))}, {headers:{'Cache-Control':'public, max-age=60'}});
  } catch { return Response.json({error:'Verified registry unavailable'}, {status:503,headers:{'Cache-Control':'no-store'}}); }
}
