export function securePublicResponse(response: Response, logo = false): Response {
  response.headers.set('Content-Security-Policy', logo
    ? "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
    : ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
      "form-action 'self'", "img-src 'self' data: blob:", "font-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com/beacon.min.js",
      "connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum", 'upgrade-insecure-requests'].join('; '));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  return response;
}
