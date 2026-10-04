import {runtime} from '@/lib/server';
import {backpackRegistry,registryTokens} from '@/lib/backpack-registry';
import {fetchStockLogo} from '@/lib/stock-logo';
export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get('symbol');
  const missing = () => new Response(null,{status:404,headers:{'Cache-Control':'public, max-age=300'}});
  if (!symbol || !/^[A-Z][A-Z0-9.-]{0,15}$/.test(symbol)) return missing();
  const cache = await caches.open('float-stock-logos-v3');
  const key = new Request(new URL('/api/stock-logo?symbol='+encodeURIComponent(symbol),req.url));
  const hit = await cache.match(key); if(hit) return hit;
  try {
    const env=runtime();
    const registry=await backpackRegistry(env.DB,()=>{},env.SOLANA_RPC_URL,fetch,Date.now(),true);
    if(!registryTokens(registry).some(t=>t.issuer==='backpack'&&t.symbol===symbol)) return missing();
    const response=await fetchStockLogo(symbol) ?? missing();
    await cache.put(key,response.clone());
    return response;
  } catch (error) { console.warn('Stock logo fetch failed', error instanceof Error ? error.message : 'Unknown error'); return missing(); }
}
