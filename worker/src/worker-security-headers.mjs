import {
  ADMIN_CLIENT_HINT_ACCEPT,
  shouldRequestAdminClientHints,
} from './audit-device.mjs';

/** Same security headers as repo-root `_headers`. Apply to every Worker response. */
export const WORKER_SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

export { shouldRequestAdminClientHints, ADMIN_CLIENT_HINT_ACCEPT };

export function applyWorkerSecurityHeaders(response, pathname = '') {
  if (!response) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(WORKER_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (shouldRequestAdminClientHints(pathname)) {
    headers.set('Accept-CH', ADMIN_CLIENT_HINT_ACCEPT);
    headers.set('Critical-CH', ADMIN_CLIENT_HINT_ACCEPT);
    const existing = headers.get('Permissions-Policy') || '';
    const hints = 'ch-ua=(self), ch-ua-mobile=(self), ch-ua-platform=(self)';
    headers.set('Permissions-Policy', existing ? `${existing}, ${hints}` : hints);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
