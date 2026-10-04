import { NextResponse } from 'next/server';
import { securePublicResponse } from './lib/security-headers';
export function proxy(request?: Request) {
  return securePublicResponse(NextResponse.next(), !!request && new URL(request.url).pathname === '/api/stock-logo');
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
