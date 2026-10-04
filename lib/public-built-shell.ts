import { securePublicResponse } from './security-headers';

export const PUBLIC_SHELL_ROUTES = ['/', '/markets', '/about', '/docs', '/methodology', '/trust', '/data-methodology', '/install'] as const;
export function publicShellPath(request: Request): string | null {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !request.headers.get('accept')?.includes('text/html') ||
    !PUBLIC_SHELL_ROUTES.some(path => path === url.pathname) ||
    [...request.headers.keys()].some(name => name === 'rsc' || name === 'next-url' ||
      name.startsWith('next-router-') || name.startsWith('x-vinext-') || name.startsWith('oai-authenticated-user-'))) return null;
  if (url.search && !(url.pathname === '/' && [...url.searchParams].every(([key, value]) =>
    (key === 'view' && value === 'home') || (key === 'thread' && /^[\w-]{1,100}$/.test(value))))) return null;
  return '/__float-shells/' + (url.pathname === '/' ? 'home' : url.pathname.slice(1)) + '.html';
}

// These files are generated offline without a database or provider access.
// Cookies never reach their renderer or the asset service. Membership and
// live observations still load through their existing protected APIs.
export async function publicBuiltShell(request: Request, assets?: { fetch(request: Request): Promise<Response> }): Promise<Response | null> {
  const path = publicShellPath(request);
  if (!assets || !path) return null;
  let stored: Response;
  try { stored = await assets.fetch(new Request(new URL(path, request.url), {headers: {accept: 'text/html'}})); }
  catch { return null; }
  if (stored.status !== 200 || !stored.headers.get('content-type')?.startsWith('text/html') || stored.headers.has('set-cookie')) return null;
  const response = securePublicResponse(new Response(stored.body, stored));
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Float-Page-Cache', 'BUILT');
  return response;
}
