/**
 * Paths that must invoke the Worker before static assets.
 * CSS/JS/images/fonts are intentionally omitted so the assets layer
 * can serve them without a Worker invocation (Free plan request cap).
 */
export const WORKER_FIRST_ROUTES = Object.freeze([
  '/',
  '/*.html',
  '/admin',
  '/admin/*',
  '/api/*',
  '/uploads/*',
  '/health',
  '/subscribe',
  '/subscribe/',
  '/caldev',
  '/caldev/',
  '/calendar',
  '/calendar/',
  '/sponsor',
  '/sponsor/',
  '/in-kind',
  '/in-kind/',
  '/letterman-jacket',
  '/letterman-jacket/',
  '/donate',
  '/donate/',
  '/assets/downloads/*',
]);
