import assets from './stock-logo-assets.json';
import type { StockToken } from './tokens';

// Presentation follows the verified listing registry; never guess company domains.
export function stockLogo(token: StockToken): string | null | undefined {
  if (token.issuer !== 'backpack') return undefined;
  return (assets as Record<string, string>)[token.symbol] ??
    '/api/stock-logo?symbol=' + encodeURIComponent(token.symbol) + '&v=1';
}
export async function fetchStockLogo(symbol: string, fetcher: typeof fetch = fetch) {
  if (!/^[A-Z][A-Z0-9.-]{0,15}$/.test(symbol)) return null;
  const response = await fetcher('https://backpack.exchange/api/stock-logo/' + encodeURIComponent(symbol), {
    headers: {'User-Agent':'Mozilla/5.0 (compatible; FloatLogo/1.0; +https://joinfloat.xyz)', 'Accept':'image/avif,image/webp,image/png,image/svg+xml,image/*'}, redirect: 'manual', signal: AbortSignal.timeout(8000),
  });
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!response.ok) console.warn('Stock logo upstream status',symbol,response.status);
  if (!response.ok || !type || !['image/png','image/jpeg','image/webp','image/avif','image/svg+xml'].includes(type)) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const {done,value} = await reader.read(); if(done) break;
    size += value.byteLength;
    if(size > 256000) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  if (!size) return null;
  const bytes = new Uint8Array(size); let offset=0;
  for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  return new Response(bytes, {headers:{'Content-Type':type,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'"}});
}
