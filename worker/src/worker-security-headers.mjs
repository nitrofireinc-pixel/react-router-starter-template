/** Same security headers as repo-root `_headers`. Apply to every Worker response. */
export const WORKER_SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

export function applyWorkerSecurityHeaders(response) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(WORKER_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
