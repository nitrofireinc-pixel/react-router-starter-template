import {
  buildAuditDeviceMeta,
  formatAuditDeviceSummary,
} from './audit-device.mjs';

/**
 * Super-admin-only CMS security audit log.
 *
 * ISOLATION CONTRACT (do not weaken):
 * - Independent of public pages, logos, sections, and site content edits.
 * - Append-only INSERT. No UPDATE / DELETE / DROP APIs or helpers.
 * - View / print / PDF export only. Never editable, including by Super Admin.
 * - Access is Super Admin role only — never a grantable permission scope.
 * - Stored in D1 (admin_audit_log) with AES-256-GCM encryption + SHA-256 integrity.
 */

export const ADMIN_AUDIT_TABLE = 'admin_audit_log';
export const ADMIN_AUDIT_ENC_VERSION = 1;
export const ADMIN_AUDIT_ENC_VERSION_V2 = 2;
export const ADMIN_AUDIT_ENC_VERSION_UNSIGNED = 0;
export const ADMIN_AUDIT_PAGE_SIZE = 25;
export const ADMIN_AUDIT_VERIFY_BATCH = 40;
export const ADMIN_AUDIT_EXPORT_BATCH = 50;
export const ADMIN_AUDIT_CHAIN_RETRIES = 25;
export const ADMIN_AUDIT_PENDING_DRAIN = 8;
export const ADMIN_AUDIT_PENDING_TABLE = 'admin_audit_pending';
export const AUDIT_CHAIN_BREAK_EXPLAIN =
  'A break means this row’s previous-id or previous-hash does not match the sealed row immediately before it, or its stored SHA-256 does not match a fresh digest of that row. Rows cannot be edited or deleted: BEFORE UPDATE/DELETE triggers abort those statements.';
export const AUDIT_LOG_TIMEZONE = 'America/New_York';
export const AUDIT_WRITE_FAILURES_KEY = 'audit_write_failures';
export const AUDIT_LOG_KEY_ENV = 'AUDIT_LOG_KEY';
export const DEFAULT_AUDIT_KEY_ID = 'k1';
export const LOGIN_LOCK_MAX_FAILURES = 5;
export const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
export const PHOTO_QUARANTINE_SORT = -91000;
export const CONTENT_EVIDENCE_FULL_MAX = 4000;
export const CONTENT_EVIDENCE_EXCERPT = 400;
export const CONTENT_DIFF_MAX = 800;
export const ADMIN_AUDIT_KNOWN_ACTIONS = Object.freeze([
  'login',
  'login.failed',
  'login.locked',
  'logout',
  'session.expired',
  'password.change',
  'user.create',
  'user.edit',
  'user.delete',
  'page.edit.open',
  'change.pages',
  'change.admin',
  'change.users',
  'change.events',
  'change.sponsors',
  'change.ledger',
  'change.staff',
  'change.boosters',
  'change.minutes',
  'minutes.create',
  'minutes.edit',
  'minutes.edit.admin_after_window',
  'minutes.delete',
  'change.photos',
  'change.contact',
  'change.site',
  'change.maintenance',
  'change.mail',
  'change.badges',
  'change.forms',
  'mail.send',
  'mail.test',
  'security.log.view',
  'security.log.export',
  'security.log.export.start',
  'security.log.export.complete',
  'security.log.verify',
  'log.genesis',
  'access.denied',
  'access.unauthenticated',
]);
export const MUTATING_ADMIN_API_ROUTES = Object.freeze([
  { method: 'POST', path: '/api/admin/forms', logger: 'generic', action: 'change.forms' },
  { method: 'PUT', path: '/api/admin/forms', logger: 'generic', action: 'change.forms' },
  { method: 'PUT', path: '/api/admin/forms/4', logger: 'generic', action: 'change.forms' },
  { method: 'DELETE', path: '/api/admin/forms/4', logger: 'generic', action: 'change.forms' },
  { method: 'POST', path: '/api/admin/site', logger: 'generic', action: 'change.site' },
  { method: 'POST', path: '/api/admin/maintenance', logger: 'explicit', action: 'change.maintenance' },
  { method: 'PUT', path: '/api/admin/utility-links', logger: 'generic', action: 'change.site' },
  { method: 'PUT', path: '/api/admin/social-links', logger: 'generic', action: 'change.site' },
  { method: 'DELETE', path: '/api/admin/zernio/facebook', logger: 'generic', action: 'change.site' },
  { method: 'POST', path: '/api/admin/zernio/facebook/select-page', logger: 'generic', action: 'change.site' },
  { method: 'POST', path: '/api/admin/zernio/facebook/events/ignore-all', logger: 'generic', action: 'change.events' },
  { method: 'POST', path: '/api/admin/zernio/facebook/events/1/ignore', logger: 'generic', action: 'change.events' },
  { method: 'POST', path: '/api/admin/zernio/facebook/events/publish', logger: 'generic', action: 'change.events' },
  { method: 'POST', path: '/api/admin/zernio/posts', logger: 'generic', action: 'change.site' },
  { method: 'DELETE', path: '/api/admin/zernio/instagram', logger: 'generic', action: 'change.site' },
  { method: 'PUT', path: '/api/admin/zernio/instagram/settings', logger: 'generic', action: 'change.site' },
  { method: 'POST', path: '/api/admin/logo', logger: 'generic', action: 'change.site' },
  { method: 'POST', path: '/api/admin/password', logger: 'explicit', action: 'password.change' },
  { method: 'POST', path: '/api/admin/users', logger: 'explicit', action: 'user.create' },
  { method: 'PUT', path: '/api/admin/users/3', logger: 'explicit', action: 'user.edit' },
  { method: 'DELETE', path: '/api/admin/users/3', logger: 'explicit', action: 'user.delete' },
  { method: 'PUT', path: '/api/admin/visual-pages/home', logger: 'generic', action: 'change.pages' },
  { method: 'POST', path: '/api/admin/visual-pages/home/restore', logger: 'generic', action: 'change.pages' },
  { method: 'POST', path: '/api/admin/pages', logger: 'generic', action: 'change.pages' },
  { method: 'PUT', path: '/api/admin/pages/home', logger: 'generic', action: 'change.pages' },
  { method: 'DELETE', path: '/api/admin/pages/join', logger: 'generic', action: 'change.pages' },
  { method: 'PUT', path: '/api/admin/ensembles/body', logger: 'generic', action: 'change.pages' },
  { method: 'PUT', path: '/api/admin/sponsors/settings', logger: 'generic', action: 'change.sponsors' },
  { method: 'POST', path: '/api/admin/checkout/settings', logger: 'generic', action: 'change.sponsors' },
  { method: 'POST', path: '/api/admin/checkout/pay', logger: 'generic', action: 'change.sponsors' },
  { method: 'POST', path: '/api/admin/ledger', logger: 'generic', action: 'change.ledger' },
  { method: 'POST', path: '/api/admin/sponsors/payment-ledger/in-kind', logger: 'generic', action: 'change.sponsors' },
  { method: 'DELETE', path: '/api/admin/ledger/9', logger: 'generic', action: 'change.ledger' },
  { method: 'POST', path: '/api/admin/sponsors', logger: 'generic', action: 'change.sponsors' },
  { method: 'POST', path: '/api/admin/sponsors/reorder', logger: 'generic', action: 'change.sponsors' },
  { method: 'PUT', path: '/api/admin/sponsors/9', logger: 'generic', action: 'change.sponsors' },
  { method: 'DELETE', path: '/api/admin/sponsors/9', logger: 'generic', action: 'change.sponsors' },
  { method: 'POST', path: '/api/admin/staff', logger: 'generic', action: 'change.staff' },
  { method: 'POST', path: '/api/admin/staff/reorder', logger: 'generic', action: 'change.staff' },
  { method: 'PUT', path: '/api/admin/staff/2', logger: 'generic', action: 'change.staff' },
  { method: 'DELETE', path: '/api/admin/staff/2', logger: 'generic', action: 'change.staff' },
  { method: 'POST', path: '/api/admin/booster-members', logger: 'generic', action: 'change.boosters' },
  { method: 'POST', path: '/api/admin/booster-members/reorder', logger: 'generic', action: 'change.boosters' },
  { method: 'PUT', path: '/api/admin/booster-members/2', logger: 'generic', action: 'change.boosters' },
  { method: 'DELETE', path: '/api/admin/booster-members/2', logger: 'generic', action: 'change.boosters' },
  { method: 'POST', path: '/api/admin/contact/topics', logger: 'generic', action: 'change.contact' },
  { method: 'PUT', path: '/api/admin/contact/topics/2', logger: 'generic', action: 'change.contact' },
  { method: 'DELETE', path: '/api/admin/contact/topics/2', logger: 'generic', action: 'change.contact' },
  { method: 'POST', path: '/api/admin/badges', logger: 'generic', action: 'change.badges' },
  { method: 'PUT', path: '/api/admin/badges/2', logger: 'generic', action: 'change.badges' },
  { method: 'DELETE', path: '/api/admin/badges/2', logger: 'generic', action: 'change.badges' },
  { method: 'POST', path: '/api/admin/minutes', logger: 'explicit', action: 'minutes.create' },
  { method: 'POST', path: '/api/admin/minutes/upload', logger: 'explicit', action: 'minutes.create' },
  { method: 'PUT', path: '/api/admin/minutes/3', logger: 'explicit', action: 'minutes.edit' },
  { method: 'DELETE', path: '/api/admin/minutes/3', logger: 'explicit', action: 'minutes.delete' },
  { method: 'POST', path: '/api/admin/mail/test-no-reply', logger: 'explicit', action: 'mail.test' },
  { method: 'POST', path: '/api/admin/mail', logger: 'explicit', action: 'mail.send' },
  { method: 'POST', path: '/api/admin/caldev/events', logger: 'generic', action: 'change.events' },
  { method: 'POST', path: '/api/admin/caldev/seed', logger: 'generic', action: 'change.events' },
  { method: 'POST', path: '/api/admin/caldev/notify-finished', logger: 'generic', action: 'change.events' },
  { method: 'PUT', path: '/api/admin/caldev/events/8', logger: 'generic', action: 'change.events' },
  { method: 'DELETE', path: '/api/admin/caldev/events/8', logger: 'generic', action: 'change.events' },
  { method: 'POST', path: '/api/admin/events', logger: 'generic', action: 'change.events' },
  { method: 'PUT', path: '/api/admin/events/8', logger: 'generic', action: 'change.events' },
  { method: 'DELETE', path: '/api/admin/events/8', logger: 'generic', action: 'change.events' },
  { method: 'POST', path: '/api/admin/photos', logger: 'generic', action: 'change.photos' },
  { method: 'POST', path: '/api/admin/photos/reorder', logger: 'generic', action: 'change.photos' },
  { method: 'PUT', path: '/api/admin/photos/5', logger: 'generic', action: 'change.photos' },
  { method: 'DELETE', path: '/api/admin/photos/5', logger: 'generic', action: 'change.photos' },
]);
export const SECURITY_LOG_FORBIDDEN_PERMISSIONS = Object.freeze([
  'security-log',
  'security',
  'audit',
  'audit-log',
  'admin-audit',
]);

const isolateWriteFailures = { count: 0, since: '' };
const loginAttempts = new Map();

export function resetAuditWriteFailureState() {
  isolateWriteFailures.count = 0;
  isolateWriteFailures.since = '';
}

export function resetLoginLockState() {
  loginAttempts.clear();
}

export const ACCESS_DENIED_THROTTLE_MS = 10 * 60 * 1000;
const accessDeniedThrottle = new Map();
const requestAuditWrites = new WeakSet();

export function resetAccessDeniedThrottleState() {
  accessDeniedThrottle.clear();
}

export function markRequestAuditWritten(request) {
  if (request) requestAuditWrites.add(request);
}

export function requestAlreadyWroteAudit(request) {
  return Boolean(request && requestAuditWrites.has(request));
}

export function sanitizeAuditPath(pathOrUrl = '') {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).pathname || '/';
    }
  } catch {
    // fall through
  }
  const cut = raw.split('#')[0].split('?')[0].trim();
  if (!cut.startsWith('/')) return `/${cut}`.replace(/\/{2,}/g, '/');
  return cut.replace(/\/{2,}/g, '/') || '/';
}

export function isProtectedAuditPath(path = '') {
  const clean = sanitizeAuditPath(path);
  if (clean === '/admin/login' || clean.startsWith('/admin/login/')) return false;
  if (clean === '/admin' || clean.startsWith('/admin/')) return true;
  if (clean === '/api/admin' || clean.startsWith('/api/admin/')) return true;
  return false;
}

export function isPublicHttpPath(path = '') {
  const clean = sanitizeAuditPath(path);
  if (clean.startsWith('/admin') || clean.startsWith('/api/admin')) return false;
  return true;
}

export function requiredPermissionFromDetail(detail = '') {
  const text = String(detail || '').trim();
  const required = text.match(/Permission required:\s*([a-z0-9:_-]+)/i);
  if (required) return required[1].toLowerCase();
  if (/maintenance mode/i.test(text)) return 'maintenance';
  if (/band dues/i.test(text)) return 'super-admin';
  if (/security log/i.test(text)) return 'security-log';
  if (/super admin/i.test(text)) return 'super-admin';
  if (/login required/i.test(text)) return '';
  return '';
}

export function inferRequiredPermissionFromPath(path = '', request = null) {
  try {
    if (request?.url) {
      const url = new URL(request.url);
      if (url.searchParams.get('tab') === 'badge-creator') return 'badges';
    }
  } catch {
    // ignore
  }
  const clean = sanitizeAuditPath(path);
  if (clean.includes('/maintenance')) return 'maintenance';
  if (clean.includes('/security-log')) return 'security-log';
  if (clean.includes('/minutes')) return 'minutes:edit';
  if (clean.includes('/badges') || clean.includes('badge-creator')) return 'badges';
  if (clean.includes('/users')) return 'users';
  if (clean === '/api/admin/site' || clean.endsWith('/site')) return 'site';
  if (clean.includes('/ensembles')) return 'page:ensembles';
  const visual = clean.match(/\/admin\/visual\/([a-z0-9-]+)/) || clean.match(/\/visual-pages\/([a-z0-9-]+)/);
  if (visual) return `page:${visual[1]}`;
  if (clean.includes('/pages')) return 'pages';
  return '';
}

export function accessDeniedThrottleKey(ip = '', path = '', action = '', actorUserId = '') {
  const actor = actorUserId == null || actorUserId === '' ? 'anon' : String(actorUserId);
  return `${actor}|${String(ip || '').trim()}|${sanitizeAuditPath(path)}|${String(action || '').trim()}`;
}

export function decideAccessDeniedWrite(store, {
  ip = '',
  path = '',
  action = '',
  actor_user_id = '',
  now = Date.now(),
} = {}) {
  const map = store || accessDeniedThrottle;
  const key = accessDeniedThrottleKey(ip, path, action, actor_user_id);
  const rec = map.get(key);
  const ts = Number(now) || Date.now();
  if (rec && ts - rec.windowStart < ACCESS_DENIED_THROTTLE_MS) {
    rec.count += 1;
    rec.lastAt = ts;
    map.set(key, rec);
    return { write: null, key, count: rec.count, suppressed: true };
  }
  const priorCount = rec ? Number(rec.count) || 0 : 0;
  if (rec && priorCount > 1) {
    map.delete(key);
    return {
      write: 'summary',
      key,
      count: priorCount + 1,
      suppressed: false,
      prior_count: priorCount,
    };
  }
  map.set(key, { windowStart: ts, count: 1, lastAt: ts });
  return { write: 'event', key, count: 1, suppressed: false, prior_count: priorCount };
}

export function classifyAccessDenial({
  status = 0,
  method = 'GET',
  path = '',
  detail = '',
  location = '',
} = {}) {
  const code = Number(status) || 0;
  const clean = sanitizeAuditPath(path);
  const loc = sanitizeAuditPath(location);
  const verb = String(method || 'GET').toUpperCase();
  if (clean === '/admin/login' && verb === 'GET') return null;
  if (isPublicHttpPath(clean) && !clean.startsWith('/api/admin')) return null;
  if (clean === '/admin/login' && verb === 'POST' && (code === 401 || code === 429)) {
    return {
      action: code === 429 ? 'login.locked' : 'login.failed',
      category: 'auth',
      required: '',
    };
  }
  const loginRedirect = (code === 302 || code === 303)
    && (loc === '/admin/login' || loc.startsWith('/admin/login/'));
  if (loginRedirect && isProtectedAuditPath(clean)) {
    return { action: 'access.unauthenticated', category: 'security', required: '' };
  }
  if (code === 401 && isProtectedAuditPath(clean)) {
    return { action: 'access.unauthenticated', category: 'security', required: '' };
  }
  if (code === 403 && isProtectedAuditPath(clean)) {
    return {
      action: 'access.denied',
      category: 'security',
      required: requiredPermissionFromDetail(detail) || inferRequiredPermissionFromPath(clean),
    };
  }
  return null;
}

export function loginAttemptKey(username = '', ip = '') {
  return `${String(username || '').trim().toLowerCase()}|${String(ip || '').trim()}`;
}

export function inspectLoginLock(username = '', ip = '', now = Date.now()) {
  const rec = loginAttempts.get(loginAttemptKey(username, ip));
  if (!rec) return { locked: false, failures: 0, locked_until: 0 };
  if (rec.lockedUntil && now < rec.lockedUntil) {
    return { locked: true, failures: rec.count, locked_until: rec.lockedUntil };
  }
  if (now - rec.first > LOGIN_LOCK_WINDOW_MS) {
    loginAttempts.delete(loginAttemptKey(username, ip));
    return { locked: false, failures: 0, locked_until: 0 };
  }
  return { locked: false, failures: rec.count, locked_until: 0 };
}

export function registerLoginFailure(username = '', ip = '', now = Date.now()) {
  const key = loginAttemptKey(username, ip);
  let rec = loginAttempts.get(key);
  if (!rec || now - rec.first > LOGIN_LOCK_WINDOW_MS) {
    rec = { count: 0, first: now, lockedUntil: 0 };
  }
  rec.count += 1;
  if (rec.count >= LOGIN_LOCK_MAX_FAILURES) {
    rec.lockedUntil = now + LOGIN_LOCK_WINDOW_MS;
  }
  loginAttempts.set(key, rec);
  return inspectLoginLock(username, ip, now);
}

export function clearLoginFailures(username = '', ip = '') {
  loginAttempts.delete(loginAttemptKey(username, ip));
}

const TEXT = new TextEncoder();
const TEXT_DEC = new TextDecoder();
const READ_TEXT = new TextDecoder();

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'current_password',
  'new_password',
  'confirm_password',
  'token',
  'completion_token',
  'data_base64',
  'attachment_content',
  'square_access_token',
  'access_token',
  'authorization',
  'cookie',
  'secret',
  'api_key',
  'private_key',
]);

export function isSecurityLogPath(pathname = '') {
  const path = String(pathname || '');
  return path === '/api/admin/security-log'
    || path === '/api/admin/security-log.txt'
    || path === '/api/admin/security-log.pdf'
    || path === '/api/admin/security-log.csv'
    || path === '/api/admin/security-log.json'
    || path === '/api/admin/security-log/verify'
    || path.startsWith('/api/admin/security-log/');
}

/** Reject any SQL that could alter or erase sealed audit rows. */
export function assertAuditSqlIsAppendOnly(sql = '') {
  const normalized = String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized.includes(ADMIN_AUDIT_TABLE)) return true;
  if (normalized.startsWith('insert into')) return true;
  if (normalized.startsWith('select ')) return true;
  if (normalized.startsWith('create table if not exists')) return true;
  if (normalized.startsWith('create index if not exists')) return true;
  if (normalized.startsWith('create trigger if not exists')) return true;
  if (normalized.startsWith('alter table') && normalized.includes('add column')) return true;
  throw new Error('Security audit log is append-only (INSERT/SELECT only).');
}

export function isMutatingHttpMethod(method = '') {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

export function shouldAuditAdminApiRequest(pathname = '', method = '') {
  const path = String(pathname || '');
  if (!path.startsWith('/api/admin')) return false;
  if (isSecurityLogPath(path)) return false;
  if (path === '/api/admin/me') return false;
  // Staff mail is logged with recipient/body details in the mail handler.
  if (path === '/api/admin/mail' || path === '/api/admin/mail/test-no-reply') return false;
  // Minutes mutations write minutes.create / minutes.edit / minutes.delete themselves.
  if (path === '/api/admin/minutes' || path.startsWith('/api/admin/minutes/')) return false;
  // Password and user grant changes write explicit forensic rows.
  if (path === '/api/admin/password') return false;
  if (path === '/api/admin/users' || path.startsWith('/api/admin/users/')) return false;
  if (path === '/api/admin/maintenance') return false;
  return isMutatingHttpMethod(method);
}

export function auditCategoryFromPath(pathname = '') {
  const path = String(pathname || '');
  if (path.includes('/mail')) return 'mail';
  if (path.includes('/users') || path.includes('/password')) return 'users';
  if (path.includes('/events') || path.includes('/push') || path.includes('/caldev')) return 'events';
  if (path.includes('/sponsors') || path.includes('/sponsor-applications') || path.includes('/checkout')) return 'sponsors';
  if (path.includes('/ledger')) return 'ledger';
  if (path.includes('/staff')) return 'staff';
  if (path.includes('/booster')) return 'boosters';
  if (path.includes('/minutes')) return 'minutes';
  if (path.includes('/photos')) return 'photos';
  if (path.includes('/contact')) return 'contact';
  if (path.includes('/badges')) return 'badges';
  if (path.includes('/forms')) return 'forms';
  if (
    path.includes('/pages')
    || path.includes('/visual-pages')
    || path.includes('/ensembles')
    || path.includes('/fundraising')
  ) return 'pages';
  if (path.includes('/maintenance') || path.includes('/site') || path.includes('/logo') || path.includes('/utility-links') || path.includes('/social') || path.includes('/zernio')) return 'site';
  return 'admin';
}

export function visualPageAuditFromRequest(pathname = '', requestSummary = null, method = '') {
  const path = String(pathname || '');
  const match = path.match(/\/api\/admin\/visual-pages\/([a-z0-9-]+)(\/restore)?/i);
  if (!match) return null;
  const slug = match[1];
  const verb = String(method || '').toUpperCase();
  let kind = 'draft';
  if (match[2] || /\/restore$/i.test(path) || verb === 'POST' && /restore/i.test(path)) {
    kind = 'restore';
  } else {
    const rawAction = String(requestSummary?.body?.action || requestSummary?.body?.kind || '').toLowerCase();
    kind = rawAction === 'publish' ? 'publish' : 'draft';
  }
  return {
    slug,
    kind,
    action: 'change.pages',
    category: 'pages',
    detail: `${slug} ${kind}`,
  };
}

export function requestCountry(request) {
  if (!request?.headers?.get) return '';
  return String(
    request.headers.get('cf-ipcountry')
    || request.headers.get('cf-ip-country')
    || '',
  ).trim().toUpperCase().slice(0, 8);
}

export const AUDIT_BEFORE_VISUAL_SQL = 'SELECT slug, draft_html, published_html FROM visual_pages WHERE slug = ?';
export const AUDIT_LOG_GENERATION_KEY = 'audit_log_generation';
export const AUDIT_LOG_SINCE_NOTE = 'This site has been logged since the original CMS security-log build.';

const generationCache = { key_id: '', loaded: false };

export function resetAuditGenerationCache() {
  generationCache.key_id = '';
  generationCache.loaded = false;
}

export function nextAuditKeyId(currentId = DEFAULT_AUDIT_KEY_ID) {
  const match = String(currentId || DEFAULT_AUDIT_KEY_ID).trim().match(/^k(\d+)$/i);
  const n = match ? Number(match[1]) : 1;
  return `k${n + 1}`;
}

export function auditSecretEnvName(keyId = DEFAULT_AUDIT_KEY_ID) {
  const id = String(keyId || DEFAULT_AUDIT_KEY_ID).trim().toLowerCase();
  if (!id || id === 'k1' || id === 'missing') return 'AUDIT_LOG_KEY';
  return `AUDIT_LOG_KEY_${id.toUpperCase()}`;
}

export function currentAuditKeyId(env = {}) {
  if (generationCache.loaded && generationCache.key_id) return generationCache.key_id;
  return String(env.AUDIT_LOG_KEY_ID || DEFAULT_AUDIT_KEY_ID).trim() || DEFAULT_AUDIT_KEY_ID;
}

export function auditLogKeyMaterial(env = {}, keyId = '') {
  const id = String(keyId || currentAuditKeyId(env) || DEFAULT_AUDIT_KEY_ID).trim().toLowerCase() || DEFAULT_AUDIT_KEY_ID;
  return String(env[auditSecretEnvName(id)] || (id === 'k1' ? env.AUDIT_LOG_KEY : '') || '');
}

export function hasAuditLogKey(env = {}, keyId = '') {
  return Boolean(auditLogKeyMaterial(env, keyId).trim());
}

export async function resolveAuditKeyId(env) {
  if (generationCache.loaded && generationCache.key_id) return generationCache.key_id;
  if (env?.AUDIT_LOG_KEY_ID) {
    generationCache.key_id = currentAuditKeyId(env);
    generationCache.loaded = true;
    return generationCache.key_id;
  }
  if (!env?.DB) {
    generationCache.key_id = DEFAULT_AUDIT_KEY_ID;
    generationCache.loaded = true;
    return generationCache.key_id;
  }
  try {
    const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?')
      .bind(AUDIT_LOG_GENERATION_KEY)
      .first();
    const parsed = JSON.parse(String(row?.value || '{}')) || {};
    generationCache.key_id = String(parsed.key_id || DEFAULT_AUDIT_KEY_ID).trim() || DEFAULT_AUDIT_KEY_ID;
  } catch {
    generationCache.key_id = DEFAULT_AUDIT_KEY_ID;
  }
  generationCache.loaded = true;
  return generationCache.key_id;
}

function excerptText(value = '', size = CONTENT_EVIDENCE_EXCERPT) {
  const text = String(value ?? '');
  if (text.length <= size * 2) return text;
  return `${text.slice(0, size)}…[${text.length} chars]…${text.slice(-size)}`;
}

export function cheapTextDiff(before = '', after = '') {
  const a = String(before ?? '');
  const b = String(after ?? '');
  if (a === b) return { unchanged: true, added: '', removed: '' };
  let start = 0;
  const maxStart = Math.min(a.length, b.length);
  while (start < maxStart && a.charCodeAt(start) === b.charCodeAt(start)) start += 1;
  let end = 0;
  const maxEnd = Math.min(a.length - start, b.length - start);
  while (end < maxEnd && a.charCodeAt(a.length - 1 - end) === b.charCodeAt(b.length - 1 - end)) end += 1;
  const removed = a.slice(start, a.length - end);
  const added = b.slice(start, b.length - end);
  return {
    unchanged: false,
    added: added.length > CONTENT_DIFF_MAX ? `${added.slice(0, CONTENT_DIFF_MAX)}…[truncated]` : added,
    removed: removed.length > CONTENT_DIFF_MAX ? `${removed.slice(0, CONTENT_DIFF_MAX)}…[truncated]` : removed,
    added_len: added.length,
    removed_len: removed.length,
  };
}

export function contentEvidence(before = '', after = '') {
  const prev = String(before ?? '');
  const next = String(after ?? '');
  const capped = prev.length > CONTENT_EVIDENCE_FULL_MAX || next.length > CONTENT_EVIDENCE_FULL_MAX;
  const evidence = {
    before_len: prev.length,
    after_len: next.length,
    capped,
    diff: cheapTextDiff(
      capped ? prev.slice(0, CONTENT_EVIDENCE_FULL_MAX) : prev,
      capped ? next.slice(0, CONTENT_EVIDENCE_FULL_MAX) : next,
    ),
  };
  if (capped) {
    evidence.before_excerpt = excerptText(prev);
    evidence.after_excerpt = excerptText(next);
  } else {
    evidence.before_text = prev;
    evidence.after_text = next;
  }
  return evidence;
}

export async function contentEvidenceHashed(before = '', after = '') {
  const evidence = contentEvidence(before, after);
  evidence.before_sha256 = await sha256Hex(String(before ?? ''));
  evidence.after_sha256 = await sha256Hex(String(after ?? ''));
  return evidence;
}

export function extractContentAfter(requestSummary = null) {
  if (!requestSummary || typeof requestSummary !== 'object') return '';
  const body = requestSummary.body && typeof requestSummary.body === 'object' ? requestSummary.body : {};
  const fields = requestSummary.fields && typeof requestSummary.fields === 'object' ? requestSummary.fields : {};
  const candidates = [
    body.body_html,
    body.html,
    body.text,
    body.description,
    fields.body_html,
    fields.html,
    fields.text,
    requestSummary.content_after,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

export function permissionListFromValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean).sort();
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean).sort();
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

export function parseCiphertextEnvelope(ciphertext = '') {
  const raw = String(ciphertext || '');
  const parts = raw.split('.');
  if (parts[0] === 'missing' && parts.length === 2) {
    return { kind: 'unsigned', key_id: 'missing', payload: parts[1] || '' };
  }
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return { kind: 'v2', key_id: parts[0], iv: parts[1], data: parts[2] };
  }
  if (parts.length === 2) {
    return { kind: 'legacy', key_id: '', iv: parts[0], data: parts[1] };
  }
  return { kind: 'unknown', key_id: '', raw };
}

export function canonicalChainMaterial(row = {}) {
  return JSON.stringify({
    v: 2,
    created_at: String(row.created_at || ''),
    action: String(row.action || ''),
    category: String(row.category || ''),
    actor_user_id: row.actor_user_id == null || row.actor_user_id === '' ? null : Number(row.actor_user_id),
    key_id: String(row.key_id || row.enc_key_id || parseCiphertextEnvelope(row.ciphertext).key_id || ''),
    ciphertext: String(row.ciphertext || ''),
  });
}

export async function verifyAuditRowDigest(row = {}) {
  const encVersion = Number(row.enc_version);
  if (encVersion !== ADMIN_AUDIT_ENC_VERSION_V2 && encVersion !== ADMIN_AUDIT_ENC_VERSION_UNSIGNED) {
    return { recomputed: false, ok: true, legacy: true };
  }
  const expected = String(row.payload_sha256 || '');
  const actual = await sha256Hex(canonicalChainMaterial(row));
  return {
    recomputed: true,
    ok: Boolean(expected) && expected === actual,
    legacy: false,
    actual,
  };
}

export function utcStampNow(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return sqliteUtcStamp(date.toISOString());
}

export async function enqueueAdminAudit(env, ctx, entry = {}) {
  if (entry?.request) markRequestAuditWritten(entry.request);
  const write = writeAdminAuditLog(env, entry);
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(write);
    return write;
  }
  return write;
}

function pad2(value) {
  return String(Number(value) || 0).padStart(2, '0');
}

export function currentEasternMonthYear(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: AUDIT_LOG_TIMEZONE,
      year: 'numeric',
      month: 'numeric',
    }).formatToParts(now instanceof Date ? now : new Date(now)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year) || new Date().getFullYear(),
    month: Number(parts.month) || 1,
  };
}

export function zonedLocalToUtcIso(
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = AUDIT_LOG_TIMEZONE,
) {
  const isoLocal = `${Number(year)}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
  const asUtc = Date.parse(`${isoLocal}Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(asUtc)).map((part) => [part.type, part.value]),
  );
  const asTz = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(asUtc - (asTz - asUtc)).toISOString();
}

export function sqliteUtcStamp(iso = '') {
  return String(iso || '')
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '')
    .replace(/Z$/, '');
}

export function easternMonthUtcBounds(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || y < 2000 || y > 2100 || !Number.isFinite(m) || m < 1 || m > 12) {
    return null;
  }
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const startIso = zonedLocalToUtcIso(y, m, 1, 0, 0, 0);
  const endIso = zonedLocalToUtcIso(nextYear, nextMonth, 1, 0, 0, 0);
  return {
    start: sqliteUtcStamp(startIso),
    end: sqliteUtcStamp(endIso),
    start_iso: startIso,
    end_iso: endIso,
  };
}

export function easternDayUtcBounds(dateValue = '') {
  const raw = String(dateValue || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const startIso = zonedLocalToUtcIso(year, month, day, 0, 0, 0);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const endIso = zonedLocalToUtcIso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0);
  return {
    start: sqliteUtcStamp(startIso),
    end: sqliteUtcStamp(endIso),
    start_iso: startIso,
    end_iso: endIso,
  };
}

export function parseAuditUtcDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(raw)) {
    const iso = /[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)
      ? raw.replace(' ', 'T')
      : `${raw.replace(' ', 'T')}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAuditTimestampEt(value) {
  const date = parseAuditUtcDate(value);
  if (!date) return String(value || '');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: AUDIT_LOG_TIMEZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  const month = parts.month || '';
  const day = parts.day || '';
  const year = parts.year || '';
  const hour = parts.hour || '';
  const minute = parts.minute || '00';
  const second = parts.second || '00';
  const period = parts.dayPeriod || '';
  return `${month} ${day}, ${year} ${hour}:${minute}:${second} ${period} ET`.replace(/\s+/g, ' ').trim();
}

export function auditEntryMatchesQuery(entry = {}, query = '') {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  // Viewing the log writes security.log.view; that row must not match its own search.
  if (String(entry.action || '') === 'security.log.view') return false;
  const metaText = entry?.meta && typeof entry.meta === 'object'
    ? JSON.stringify(entry.meta)
    : '';
  const hay = [
    entry.summary,
    entry.path,
    entry.action,
    entry.actor_username,
    metaText,
  ].join(' ').toLowerCase();
  return hay.includes(needle);
}

export function auditChainIdWindow(entries = []) {
  const ids = (Array.isArray(entries) ? entries : [])
    .map((row) => Number(row?.id) || 0)
    .filter((id) => id > 0);
  if (!ids.length) return null;
  return { minId: Math.min(...ids), maxId: Math.max(...ids) };
}

export function verifyAuditHashChain(entries = [], olderNeighbor = null) {
  // entries must be a contiguous id window (every stored row from min..max).
  // Comparing filtered/scattered rows to each other produces false breaks.
  const rows = [...(Array.isArray(entries) ? entries : [])]
    .filter((row) => row && Number(row.id) > 0)
    .sort((a, b) => Number(a.id) - Number(b.id));
  let prevHash = String(olderNeighbor?.payload_sha256 || '');
  for (const row of rows) {
    const prev = String(row.prev_sha256 || '');
    if (prev && prev !== prevHash) {
      return {
        chain_ok: false,
        chain_status: `Break at entry #${row.id}`,
        chain_break_id: Number(row.id),
      };
    }
    prevHash = String(row.payload_sha256 || '');
  }
  return {
    chain_ok: true,
    chain_status: 'Chain intact',
    chain_break_id: null,
  };
}

export async function fetchAuditHashChainRows(env, minId, maxId) {
  const low = Number(minId) || 0;
  const high = Number(maxId) || 0;
  if (low <= 0 || high <= 0 || high < low) {
    return { rows: [], olderNeighbor: null };
  }
  const windowSql = `SELECT id, created_at, action, category, actor_user_id, payload_sha256, prev_sha256, ciphertext, enc_version FROM ${ADMIN_AUDIT_TABLE} WHERE id >= ? AND id <= ? ORDER BY id ASC`;
  const neighborSql = `SELECT id, created_at, action, category, actor_user_id, payload_sha256, prev_sha256, ciphertext, enc_version FROM ${ADMIN_AUDIT_TABLE} WHERE id < ? ORDER BY id DESC LIMIT 1`;
  assertAuditSqlIsAppendOnly(windowSql);
  assertAuditSqlIsAppendOnly(neighborSql);
  const window = await env.DB.prepare(windowSql).bind(low, high).all();
  const olderNeighbor = await env.DB.prepare(neighborSql).bind(low).first();
  return {
    rows: window?.results || [],
    olderNeighbor: olderNeighbor || null,
  };
}

export function redactAuditValue(key, value, depth = 0) {
  if (depth > 4) return '[truncated]';
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (SENSITIVE_KEYS.has(normalizedKey) || normalizedKey.includes('password') || normalizedKey.includes('access_token') || normalizedKey.endsWith('_base64')) {
    return '[redacted]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item, index) => redactAuditValue(String(index), item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = redactAuditValue(childKey, childValue, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') {
    if (value.length > 1200) return `${value.slice(0, 1200)}…[truncated]`;
    return value;
  }
  return value;
}

export function redactAuditObject(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return redactAuditValue('root', payload);
}

export async function summarizeAdminRequestForAudit(request) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  try {
    if (contentType.includes('application/json')) {
      const text = await request.clone().text();
      if (!text) return { content_type: 'application/json', body: {} };
      const parsed = JSON.parse(text);
      return {
        content_type: 'application/json',
        body: redactAuditObject(parsed),
      };
    }
    if (contentType.includes('multipart/form-data')) {
      const form = await request.clone().formData();
      const fields = {};
      const files = [];
      for (const [key, value] of form.entries()) {
        if (typeof File !== 'undefined' && value instanceof File) {
          const fileInfo = {
            field: key,
            filename: value.name || 'upload',
            size: Number(value.size) || 0,
            type: value.type || '',
          };
          try {
            const bytes = new Uint8Array(await value.arrayBuffer());
            fileInfo.size = fileInfo.size || bytes.byteLength;
            fileInfo.sha256 = await sha256BytesHex(bytes);
          } catch {
            fileInfo.sha256 = '';
          }
          files.push(fileInfo);
          continue;
        }
        fields[key] = redactAuditValue(key, String(value ?? ''));
      }
      return {
        content_type: 'multipart/form-data',
        fields,
        files,
      };
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.clone().formData();
      const fields = {};
      for (const [key, value] of form.entries()) {
        fields[key] = redactAuditValue(key, String(value ?? ''));
      }
      return {
        content_type: 'application/x-www-form-urlencoded',
        fields,
      };
    }
  } catch (error) {
    return {
      content_type: contentType || 'unknown',
      parse_error: String(error?.message || error || 'Unable to summarize request'),
    };
  }
  return { content_type: contentType || 'none' };
}

export function buildAuditSummary({
  action = '',
  method = '',
  path = '',
  status = null,
  actorUsername = '',
  detail = '',
} = {}) {
  const who = String(actorUsername || 'unknown').trim() || 'unknown';
  const verb = String(action || 'change').trim() || 'change';
  const route = `${String(method || '').toUpperCase()} ${String(path || '')}`.trim();
  const statusPart = status == null ? '' : ` → ${status}`;
  const extra = String(detail || '').trim();
  return [
    `${who}: ${verb}`,
    route ? `(${route}${statusPart})` : '',
    extra,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function bytesToBase64(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function auditLogSecretMaterial(env = {}) {
  return String(env.EFBAND_SECRET || env.AUDIT_LOG_SECRET || 'change-me-before-launch');
}

/** SHA-256 digest as lowercase hex (integrity fingerprint). */
export async function sha256Hex(value = '') {
  const digest = await crypto.subtle.digest('SHA-256', TEXT.encode(String(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256BytesHex(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const digest = await crypto.subtle.digest('SHA-256', view);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Legacy AES key for rows written before AUDIT_LOG_KEY (do not use for new rows). */
export async function deriveAuditAesKey(env) {
  const material = `${auditLogSecretMaterial(env)}:admin-audit-log:v${ADMIN_AUDIT_ENC_VERSION}`;
  const digest = await crypto.subtle.digest('SHA-256', TEXT.encode(material));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function deriveAuditLogAesKey(env, keyId = '') {
  const id = String(keyId || currentAuditKeyId(env));
  const secret = auditLogKeyMaterial(env, id);
  if (!secret) throw new Error('AUDIT_LOG_KEY is not set');
  const material = `${secret}:admin-audit-log:v${ADMIN_AUDIT_ENC_VERSION_V2}:${id}`;
  const digest = await crypto.subtle.digest('SHA-256', TEXT.encode(material));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function canonicalAuditPayload(entry = {}) {
  const meta = entry.meta && typeof entry.meta === 'object' ? entry.meta : {};
  return JSON.stringify({
    action: String(entry.action || ''),
    category: String(entry.category || ''),
    method: String(entry.method || ''),
    path: String(entry.path || ''),
    status: entry.status == null ? null : Number(entry.status),
    actor_user_id: entry.actor_user_id == null ? null : Number(entry.actor_user_id),
    actor_username: String(entry.actor_username || ''),
    ip: String(entry.ip || ''),
    country: String(entry.country || ''),
    user_agent: String(entry.user_agent || ''),
    session_id_hash: String(entry.session_id_hash || ''),
    created_at: String(entry.created_at || ''),
    summary: String(entry.summary || ''),
    meta,
  });
}

export async function encryptAuditPayload(env, plaintext = '') {
  const key = await deriveAuditAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, TEXT.encode(String(plaintext)));
  return `${bytesToBase64(iv)}.${bytesToBase64(encrypted)}`;
}

export async function encryptAuditPayloadV2(env, plaintext = '', keyId = '') {
  const id = String(keyId || currentAuditKeyId(env));
  const key = await deriveAuditLogAesKey(env, id);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, TEXT.encode(String(plaintext)));
  return `${id}.${bytesToBase64(iv)}.${bytesToBase64(encrypted)}`;
}

export async function decryptAuditPayload(env, ciphertext = '') {
  const envelope = parseCiphertextEnvelope(ciphertext);
  if (envelope.kind === 'unsigned') {
    return READ_TEXT.decode(base64ToBytes(envelope.payload));
  }
  if (envelope.kind === 'v2') {
    const key = await deriveAuditLogAesKey(env, envelope.key_id);
    const iv = base64ToBytes(envelope.iv);
    const data = base64ToBytes(envelope.data);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return READ_TEXT.decode(decrypted);
  }
  if (envelope.kind !== 'legacy') throw new Error('Invalid ciphertext');
  const key = await deriveAuditAesKey(env);
  const iv = base64ToBytes(envelope.iv);
  const data = base64ToBytes(envelope.data);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return READ_TEXT.decode(decrypted);
}

export async function signAuditChainHead(env, material = '') {
  const secret = String(env.AUDIT_LOG_KEY || env.EFBAND_SECRET || 'change-me-before-launch');
  const key = await crypto.subtle.importKey('raw', TEXT.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, TEXT.encode(String(material)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function writeAdminAuditLog(env, entry = {}) {
  if (!env?.DB) return null;
  const action = String(entry.action || 'change').trim().slice(0, 80) || 'change';
  const category = String(entry.category || auditCategoryFromPath(entry.path || '')).trim().slice(0, 40) || 'admin';
  const method = String(entry.method || '').trim().toUpperCase().slice(0, 12);
  const path = String(entry.path || '').trim().slice(0, 300);
  const status = entry.status == null || entry.status === '' ? null : Number(entry.status);
  const actorUserId = entry.actor_user_id == null || entry.actor_user_id === ''
    ? null
    : Number(entry.actor_user_id);
  const actorUsername = String(entry.actor_username || '').trim().slice(0, 190);
  const ip = String(entry.ip || '').trim().slice(0, 80);
  const country = String(entry.country || '').trim().toUpperCase().slice(0, 8);
  const userAgent = String(entry.user_agent || '').trim().slice(0, 400);
  const sessionIdHash = String(entry.session_id_hash || '').trim().slice(0, 64);
  const createdAt = String(entry.created_at || utcStampNow()).trim() || utcStampNow();
  const summary = String(entry.summary || buildAuditSummary({
    action,
    method,
    path,
    status,
    actorUsername,
  })).trim().slice(0, 700);
  let meta = {};
  try {
    meta = entry.meta && typeof entry.meta === 'object' ? redactAuditObject(entry.meta) : {};
  } catch {
    meta = {};
  }
  try {
    const device = buildAuditDeviceMeta({
      request: entry.request,
      userAgent,
      client: entry.device_client,
      includeClient: Boolean(entry.include_device_client),
      sessionIdHash,
    });
    if (device && (device.os || device.browser || device.user_agent || device.client)) {
      meta.device = device;
    }
  } catch {
    // Device parsing must never block an audit write.
  }
  const record = {
    action,
    category,
    method,
    path,
    status: Number.isFinite(status) ? status : null,
    actor_user_id: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
    actor_username: actorUsername,
    ip,
    country,
    user_agent: userAgent,
    session_id_hash: sessionIdHash,
    created_at: createdAt,
    summary,
    meta,
  };
  const canonical = canonicalAuditPayload(record);
  const keyId = String(entry.key_id || await resolveAuditKeyId(env) || DEFAULT_AUDIT_KEY_ID);
  const keyed = hasAuditLogKey(env, keyId);
  let ciphertext = '';
  let encVersion = ADMIN_AUDIT_ENC_VERSION_UNSIGNED;
  let usedKeyId = 'missing';
  try {
    if (keyed) {
      ciphertext = await encryptAuditPayloadV2(env, canonical, keyId);
      encVersion = ADMIN_AUDIT_ENC_VERSION_V2;
      usedKeyId = keyId;
    } else {
      // Never drop a CMS action if AUDIT_LOG_KEY is missing. Index stays
      // non-sensitive; payload is unsigned until the secret is set at deploy.
      ciphertext = `missing.${bytesToBase64(TEXT.encode(canonical))}`;
      encVersion = ADMIN_AUDIT_ENC_VERSION_UNSIGNED;
      usedKeyId = 'missing';
      console.error('admin_audit_key_missing_unsigned_fallback');
    }
  } catch (error) {
    console.error('admin audit log encrypt failed; writing unsigned fallback', error?.message || error);
    ciphertext = `missing.${bytesToBase64(TEXT.encode(canonical))}`;
    encVersion = ADMIN_AUDIT_ENC_VERSION_UNSIGNED;
    usedKeyId = 'missing';
    await recordAuditWriteFailure(env, error);
  }
  const chainRow = {
    created_at: createdAt,
    action,
    category,
    actor_user_id: record.actor_user_id,
    key_id: usedKeyId,
    ciphertext,
  };
  const payloadSha256 = await sha256Hex(canonicalChainMaterial(chainRow));
  return insertAuditChainRow(env, {
    createdAt,
    action,
    category,
    actorUserId: record.actor_user_id,
    actorUsername,
    payloadSha256,
    ciphertext,
    encVersion,
    usedKeyId,
    keyed,
  });
}

function isAuditChainConflict(error) {
  const msg = String(error?.message || error || '');
  return ((/unique/i.test(msg) && /prev_id/i.test(msg))
    || /audit-chain-fork/i.test(msg));
}

function isSourcePendingConflict(error) {
  const msg = String(error?.message || error || '');
  return /unique/i.test(msg) && /source_pending/i.test(msg);
}

async function auditChainRetryWait(attempt = 1) {
  const ms = 1 + Math.floor(Math.random() * Math.min(4, Math.max(1, attempt)));
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readAuditChainHead(env) {
  const prevSql = `SELECT id, payload_sha256 FROM ${ADMIN_AUDIT_TABLE} ORDER BY id DESC LIMIT 1`;
  assertAuditSqlIsAppendOnly(prevSql);
  const previous = await env.DB.prepare(prevSql).first();
  return {
    id: Number(previous?.id) || 0,
    payload_sha256: String(previous?.payload_sha256 || ''),
  };
}

async function insertAuditRowOnce(env, {
  createdAt,
  action,
  category,
  actorUserId,
  actorUsername,
  payloadSha256,
  ciphertext,
  encVersion,
  prevSha256,
  prevId,
  sourcePendingId = null,
}) {
  const withPending = `INSERT INTO ${ADMIN_AUDIT_TABLE}
      (created_at, action, category, method, path, status, actor_user_id, actor_username, ip, user_agent, summary, meta_json, payload_sha256, ciphertext, enc_version, prev_sha256, prev_id, source_pending_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const withoutPending = `INSERT INTO ${ADMIN_AUDIT_TABLE}
      (created_at, action, category, method, path, status, actor_user_id, actor_username, ip, user_agent, summary, meta_json, payload_sha256, ciphertext, enc_version, prev_sha256, prev_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  assertAuditSqlIsAppendOnly(withPending);
  assertAuditSqlIsAppendOnly(withoutPending);
  const binds = [
    createdAt,
    action,
    category,
    '',
    '',
    null,
    actorUserId,
    actorUsername,
    '',
    '',
    '',
    '{}',
    payloadSha256,
    ciphertext,
    encVersion,
    prevSha256,
    prevId,
  ];
  try {
    return await env.DB.prepare(withPending).bind(...binds, sourcePendingId).run();
  } catch (error) {
    if (!/no such column:\s*source_pending_id/i.test(String(error?.message || error || ''))) {
      throw error;
    }
    return env.DB.prepare(withoutPending).bind(...binds).run();
  }
}

async function listUndrainedPending(env, limit = ADMIN_AUDIT_PENDING_DRAIN) {
  const sql = `SELECT p.id, p.created_at, p.action, p.category, p.actor_user_id, p.actor_username,
      p.payload_sha256, p.ciphertext, p.enc_version, p.key_id
     FROM ${ADMIN_AUDIT_PENDING_TABLE} p
     WHERE NOT EXISTS (
       SELECT 1 FROM ${ADMIN_AUDIT_TABLE} a WHERE a.source_pending_id = p.id
     )
     ORDER BY p.id ASC
     LIMIT ?`;
  try {
    const fetched = await env.DB.prepare(sql).bind(Math.max(1, Number(limit) || ADMIN_AUDIT_PENDING_DRAIN)).all();
    return fetched?.results || [];
  } catch {
    return [];
  }
}

async function insertPendingAuditRow(env, row = {}) {
  const sql = `INSERT INTO ${ADMIN_AUDIT_PENDING_TABLE}
    (created_at, action, category, actor_user_id, actor_username, payload_sha256, ciphertext, enc_version, key_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  return env.DB.prepare(sql).bind(
    row.createdAt,
    row.action,
    row.category,
    row.actorUserId,
    row.actorUsername,
    row.payloadSha256,
    row.ciphertext,
    row.encVersion,
    row.usedKeyId || '',
  ).run();
}

async function drainPendingAuditRows(env) {
  const pending = await listUndrainedPending(env);
  let drained = 0;
  for (const row of pending) {
    let placed = false;
    for (let attempt = 1; attempt <= ADMIN_AUDIT_CHAIN_RETRIES; attempt += 1) {
      try {
        const head = await readAuditChainHead(env);
        await insertAuditRowOnce(env, {
          createdAt: row.created_at,
          action: row.action,
          category: row.category,
          actorUserId: row.actor_user_id,
          actorUsername: row.actor_username,
          payloadSha256: row.payload_sha256,
          ciphertext: row.ciphertext,
          encVersion: row.enc_version,
          prevSha256: head.payload_sha256,
          prevId: head.id > 0 ? head.id : 0,
          sourcePendingId: Number(row.id) || null,
        });
        placed = true;
        drained += 1;
        break;
      } catch (error) {
        if (isSourcePendingConflict(error)) {
          placed = true;
          break;
        }
        if (isAuditChainConflict(error) && attempt < ADMIN_AUDIT_CHAIN_RETRIES) {
          await auditChainRetryWait(attempt);
          continue;
        }
        return { drained, complete: false };
      }
    }
    if (!placed) return { drained, complete: false };
  }
  return { drained, complete: true };
}

async function insertAuditChainRow(env, {
  createdAt,
  action,
  category,
  actorUserId,
  actorUsername,
  payloadSha256,
  ciphertext,
  encVersion,
  usedKeyId,
  keyed,
}) {
  let lastError = null;
  await drainPendingAuditRows(env);
  for (let attempt = 1; attempt <= ADMIN_AUDIT_CHAIN_RETRIES; attempt += 1) {
    try {
      if (attempt > 1) await drainPendingAuditRows(env);
      const head = await readAuditChainHead(env);
      const prevSha256 = head.payload_sha256;
      const prevId = head.id > 0 ? head.id : 0;
      const result = await insertAuditRowOnce(env, {
        createdAt,
        action,
        category,
        actorUserId,
        actorUsername,
        payloadSha256,
        ciphertext,
        encVersion,
        prevSha256,
        prevId,
      });
      return {
        id: result?.meta?.last_row_id || null,
        payload_sha256: payloadSha256,
        prev_sha256: prevSha256,
        prev_id: prevId,
        enc_version: encVersion,
        key_id: usedKeyId,
        key_missing: !keyed,
        chain_retries: attempt - 1,
      };
    } catch (error) {
      lastError = error;
      if (isAuditChainConflict(error) && attempt < ADMIN_AUDIT_CHAIN_RETRIES) {
        await auditChainRetryWait(attempt);
        continue;
      }
      break;
    }
  }
  try {
    const queued = await insertPendingAuditRow(env, {
      createdAt,
      action,
      category,
      actorUserId,
      actorUsername,
      payloadSha256,
      ciphertext,
      encVersion,
      usedKeyId,
    });
    return {
      id: null,
      pending_id: queued?.meta?.last_row_id || null,
      payload_sha256: payloadSha256,
      prev_sha256: '',
      prev_id: null,
      enc_version: encVersion,
      key_id: usedKeyId,
      key_missing: !keyed,
      queued: true,
    };
  } catch (error) {
    console.error('admin audit log write failed', error?.message || lastError?.message || error);
    await recordAuditWriteFailure(env, error || lastError);
    return null;
  }
}

export async function startNewAuditLogGeneration(env, {
  reason = '',
  authorizedBy = 'Trevor',
  actor = null,
  request = null,
  sessionIdHash = '',
} = {}) {
  const currentId = await resolveAuditKeyId(env);
  const nextId = nextAuditKeyId(currentId);
  const nextSecretName = auditSecretEnvName(nextId);
  if (!hasAuditLogKey(env, nextId)) {
    return {
      ok: false,
      status: 409,
      detail: `The next generation secret is not in Cloudflare yet. An authorized deploy step must pipe a fresh CSPRNG value into wrangler secret put ${nextSecretName} without printing it. Then start the new log again.`,
      next_key_id: nextId,
      next_secret_name: nextSecretName,
    };
  }
  const prevSql = `SELECT id, payload_sha256 FROM ${ADMIN_AUDIT_TABLE} ORDER BY id DESC LIMIT 1`;
  const countSql = `SELECT COUNT(*) AS total FROM ${ADMIN_AUDIT_TABLE}`;
  assertAuditSqlIsAppendOnly(prevSql);
  assertAuditSqlIsAppendOnly(countSql);
  const previous = await env.DB.prepare(prevSql).first();
  const countRow = await env.DB.prepare(countSql).first();
  let generation = 2;
  try {
    const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?')
      .bind(AUDIT_LOG_GENERATION_KEY)
      .first();
    const parsed = JSON.parse(String(row?.value || '{}')) || {};
    generation = Number(parsed.generation || 1) + 1;
  } catch {
    generation = 2;
  }
  const startedAt = new Date().toISOString();
  const meta = {
    reason: String(reason || '').trim(),
    authorized_by: String(authorizedBy || 'Trevor').trim(),
    previous_key_id: currentId,
    new_key_id: nextId,
    generation,
    previous_chain_head: String(previous?.payload_sha256 || ''),
    previous_row_count: Number(countRow?.total || 0),
    previous_last_id: previous?.id || null,
    started_at_utc: startedAt,
    site_logged_since_original_build: true,
    note: AUDIT_LOG_SINCE_NOTE,
  };
  const written = await writeAdminAuditLog(env, {
    action: 'log.genesis',
    category: 'security',
    method: 'POST',
    path: '/api/admin/security-log/genesis',
    status: 201,
    key_id: nextId,
    actor_user_id: actor?.id,
    actor_username: actor?.username,
    ip: request ? requestClientIp(request) : '',
    country: request ? requestCountry(request) : '',
    user_agent: request?.headers?.get?.('user-agent') || '',
    session_id_hash: sessionIdHash,
    summary: buildAuditSummary({
      action: 'log.genesis',
      method: 'POST',
      path: '/api/admin/security-log/genesis',
      status: 201,
      actorUsername: actor?.username || 'unknown',
      detail: `generation ${generation} key ${nextId}`,
    }),
    meta,
  });
  generationCache.key_id = nextId;
  generationCache.loaded = true;
  await env.DB.prepare(
    'INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).bind(AUDIT_LOG_GENERATION_KEY, JSON.stringify({
    key_id: nextId,
    generation,
    started_at: startedAt,
    previous_head: meta.previous_chain_head,
    previous_count: meta.previous_row_count,
    genesis_id: written?.id || null,
    authorized_by: meta.authorized_by,
    reason: meta.reason,
  })).run();
  return {
    ok: true,
    status: 201,
    ...meta,
    genesis: written,
    next_secret_name: nextSecretName,
  };
}

export async function recordAuditWriteFailure(env, error) {
  const now = new Date().toISOString();
  isolateWriteFailures.count += 1;
  isolateWriteFailures.since = isolateWriteFailures.since || now;
  console.error('admin_audit_write_failed', {
    count: isolateWriteFailures.count,
    since: isolateWriteFailures.since,
    error: String(error?.message || error || 'write failed'),
  });
  if (!env?.DB) return { ...isolateWriteFailures };
  try {
    const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?')
      .bind(AUDIT_WRITE_FAILURES_KEY)
      .first();
    let stored = { count: 0, since: isolateWriteFailures.since };
    try {
      stored = JSON.parse(String(row?.value || '{}')) || stored;
    } catch {
      stored = { count: 0, since: isolateWriteFailures.since };
    }
    const next = {
      count: Number(stored.count || 0) + 1,
      since: String(stored.since || isolateWriteFailures.since || now),
      updated_at: now,
    };
    await env.DB.prepare(
      'INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).bind(AUDIT_WRITE_FAILURES_KEY, JSON.stringify(next)).run();
    return next;
  } catch (persistError) {
    console.error('admin_audit_write_failed_persist', persistError?.message || persistError);
    return { ...isolateWriteFailures };
  }
}

export async function readAuditWriteFailures(env) {
  let stored = { count: 0, since: '' };
  if (env?.DB) {
    try {
      const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?')
        .bind(AUDIT_WRITE_FAILURES_KEY)
        .first();
      stored = JSON.parse(String(row?.value || '{}')) || stored;
    } catch {
      stored = { count: 0, since: '' };
    }
  }
  return {
    count: Math.max(Number(stored.count || 0), isolateWriteFailures.count),
    since: String(stored.since || isolateWriteFailures.since || ''),
  };
}

export function requestClientIp(request) {
  return String(
    request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || '',
  ).split(',')[0].trim();
}

export async function maybeAuditAdminApiResponse(env, {
  request,
  url,
  response,
  actor = null,
  requestSummary = null,
  beforeSnapshot = null,
  sessionIdHash = '',
  ctx = null,
} = {}) {
  if (!shouldAuditAdminApiRequest(url?.pathname, request?.method)) return;
  const path = String(url?.pathname || '');
  const method = String(request?.method || '').toUpperCase();
  const status = Number(response?.status) || 0;
  if (status === 401 || status === 403) return;
  const visual = visualPageAuditFromRequest(path, requestSummary, method);
  const category = visual?.category || auditCategoryFromPath(path);
  const action = visual?.action
    || (category === 'mail' && path.endsWith('/mail') ? 'mail.send' : `change.${category}`);
  const detail = status >= 400
    ? `failed (${status})`
    : (visual?.detail || 'saved');
  const afterText = extractContentAfter(requestSummary);
  const beforeText = beforeSnapshot && typeof beforeSnapshot.content_before === 'string'
    ? beforeSnapshot.content_before
    : '';
  let content = null;
  if (beforeText || afterText) {
    content = await contentEvidenceHashed(beforeText, afterText);
  }
  const write = writeAdminAuditLog(env, {
    request,
    action,
    category,
    method,
    path,
    status,
    actor_user_id: actor?.id,
    actor_username: actor?.username || actor?.display_name || '',
    ip: requestClientIp(request),
    country: requestCountry(request),
    user_agent: request.headers.get('user-agent') || '',
    session_id_hash: sessionIdHash,
    summary: buildAuditSummary({
      action,
      method,
      path,
      status,
      actorUsername: actor?.username || actor?.display_name || '',
      detail,
    }),
    meta: {
      request: requestSummary || null,
      actor_role: actor?.role || '',
      target: beforeSnapshot?.target || visual?.slug || path,
      content,
      files: requestSummary?.files || beforeSnapshot?.files || null,
      grants: beforeSnapshot?.grants || null,
      ...(visual ? { slug: visual.slug, kind: visual.kind } : {}),
      ...(beforeSnapshot?.photo ? { photo: beforeSnapshot.photo } : {}),
    },
  });
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(write);
    return;
  }
  await write;
}

async function peekDenialDetail(response) {
  if (!response?.clone) return '';
  const type = String(response.headers?.get?.('content-type') || '');
  const json = type.includes('json');
  const html = type.includes('html');
  if (!json && !html) return '';
  try {
    const text = await response.clone().text();
    const slice = String(text || '').slice(0, html ? 2500 : 800);
    if (!slice) return '';
    if (json) {
      const data = JSON.parse(slice);
      return String(data?.detail || '');
    }
    const required = slice.match(/Permission required:\s*([a-z0-9:_-]+)/i);
    return required ? `Permission required: ${required[1]}` : '';
  } catch {
    return '';
  }
}

export async function maybeLogAccessDenial(env, {
  request,
  url,
  response,
  actor = null,
  session = null,
  ctx = null,
  now = Date.now(),
  forcedAction = '',
  forcedDetail = '',
  deviceClient = null,
} = {}) {
  if (!response || requestAlreadyWroteAudit(request)) return null;
  const status = Number(response.status) || 0;
  if (![401, 403, 429, 302, 303].includes(status)) return null;
  const path = sanitizeAuditPath(url?.pathname || request?.url || '');
  const method = String(request?.method || 'GET').toUpperCase();
  const location = response.headers?.get?.('location') || '';
  if (isPublicHttpPath(path) && status === 404) return null;
  const detail = forcedDetail || (status === 403 ? await peekDenialDetail(response) : '');
  const classified = classifyAccessDenial({
    status,
    method,
    path,
    detail,
    location,
  });
  if (!classified && !forcedAction) return null;
  const action = forcedAction || classified.action;
  const category = forcedAction && forcedAction.startsWith('login.')
    ? 'auth'
    : (classified?.category || 'security');
  const required = classified?.required
    || requiredPermissionFromDetail(detail)
    || inferRequiredPermissionFromPath(path, request);
  const ip = requestClientIp(request);
  const actorUserId = actor?.id ?? session?.uid ?? '';
  const decision = decideAccessDeniedWrite(accessDeniedThrottle, {
    ip,
    path,
    action,
    actor_user_id: actorUserId,
    now,
  });
  if (!decision.write) {
    markRequestAuditWritten(request);
    return { wrote: false, suppressed: true, count: decision.count, action };
  }
  const collapsed = decision.write === 'summary';
  const write = enqueueAdminAudit(env, ctx, {
    request,
    action,
    category,
    method,
    path,
    status,
    actor_user_id: actor?.id ?? session?.uid ?? null,
    actor_username: actor?.username || session?.username || '',
    ip,
    country: requestCountry(request),
    user_agent: request.headers.get('user-agent') || '',
    session_id_hash: session?.session_id_hash || '',
    summary: buildAuditSummary({
      action,
      method,
      path,
      status,
      actorUsername: actor?.username || session?.username || '',
      detail: collapsed
        ? `${decision.count} ${action} from same IP+path in 10 minutes`
        : (required ? `required ${required}` : (detail || action)),
    }),
    include_device_client: action.startsWith('login.'),
    device_client: deviceClient || session?.device_client || null,
    meta: {
      required: required || '',
      count: decision.count,
      collapsed,
      prior_count: decision.prior_count || 0,
    },
  });
  markRequestAuditWritten(request);
  await write;
  return { wrote: true, suppressed: false, count: decision.count, action, collapsed };
}

export async function deserializeEncryptedAuditRow(env, row = {}, { verifyDigest = true } = {}) {
  const base = {
    id: Number(row.id) || 0,
    created_at: String(row.created_at || ''),
    created_at_et: formatAuditTimestampEt(row.created_at),
    action: String(row.action || ''),
    category: String(row.category || ''),
    method: String(row.method || ''),
    path: String(row.path || ''),
    status: row.status == null ? null : Number(row.status),
    actor_user_id: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actor_username: String(row.actor_username || ''),
    ip: String(row.ip || ''),
    country: '',
    user_agent: String(row.user_agent || ''),
    session_id_hash: '',
    summary: String(row.summary || ''),
    meta: {},
    payload_sha256: String(row.payload_sha256 || ''),
    prev_sha256: String(row.prev_sha256 || ''),
    enc_version: row.enc_version == null ? null : Number(row.enc_version),
    key_id: parseCiphertextEnvelope(row.ciphertext).key_id || '',
    integrity_ok: false,
    encrypted: Boolean(row.ciphertext) && Number(row.enc_version) !== ADMIN_AUDIT_ENC_VERSION_UNSIGNED,
  };

  if (row.ciphertext) {
    try {
      const plaintext = await decryptAuditPayload(env, row.ciphertext);
      const encVersion = Number(row.enc_version);
      const digest = verifyDigest
        ? ((encVersion === ADMIN_AUDIT_ENC_VERSION_V2 || encVersion === ADMIN_AUDIT_ENC_VERSION_UNSIGNED)
          ? await verifyAuditRowDigest(row)
          : { ok: String(row.payload_sha256 || '') === await sha256Hex(plaintext), recomputed: true, legacy: encVersion === ADMIN_AUDIT_ENC_VERSION })
        : { ok: true, recomputed: false };
      if (digest.ok === false) {
        return {
          ...base,
          summary: '[integrity check failed — entry sealed]',
          integrity_ok: false,
          integrity_error: 'sha256_mismatch',
        };
      }
      const parsed = JSON.parse(plaintext);
      return {
        ...base,
        action: String(parsed.action || base.action),
        category: String(parsed.category || base.category),
        method: String(parsed.method || ''),
        path: String(parsed.path || ''),
        status: parsed.status == null ? null : Number(parsed.status),
        actor_user_id: parsed.actor_user_id == null ? null : Number(parsed.actor_user_id),
        actor_username: String(parsed.actor_username || base.actor_username),
        ip: String(parsed.ip || ''),
        country: String(parsed.country || ''),
        user_agent: String(parsed.user_agent || ''),
        session_id_hash: String(parsed.session_id_hash || ''),
        summary: String(parsed.summary || ''),
        meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
        integrity_ok: true,
      };
    } catch (error) {
      return {
        ...base,
        summary: '[unable to decrypt sealed entry]',
        integrity_ok: false,
        integrity_error: String(error?.message || error || 'decrypt_failed'),
      };
    }
  }

  // Legacy plaintext rows (if any) — still viewable.
  let meta = {};
  try {
    meta = JSON.parse(String(row.meta_json || '{}'));
  } catch {
    meta = {};
  }
  return {
    ...base,
    meta,
    integrity_ok: !row.payload_sha256,
    encrypted: false,
  };
}

export function serializeAuditRow(row = {}) {
  let meta = {};
  try {
    meta = JSON.parse(String(row.meta_json || '{}'));
  } catch {
    meta = {};
  }
  return {
    id: Number(row.id) || 0,
    created_at: String(row.created_at || ''),
    created_at_et: formatAuditTimestampEt(row.created_at),
    action: String(row.action || ''),
    category: String(row.category || ''),
    method: String(row.method || ''),
    path: String(row.path || ''),
    status: row.status == null ? null : Number(row.status),
    actor_user_id: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actor_username: String(row.actor_username || ''),
    ip: String(row.ip || ''),
    user_agent: String(row.user_agent || ''),
    summary: String(row.summary || ''),
    meta,
    payload_sha256: String(row.payload_sha256 || ''),
    prev_sha256: String(row.prev_sha256 || ''),
    integrity_ok: true,
    encrypted: Boolean(row.ciphertext),
  };
}

export function resolveAuditLogTimeRange({
  year,
  month,
  from = '',
  to = '',
  now = new Date(),
} = {}) {
  const current = currentEasternMonthYear(now);
  const y = Number(year);
  const m = Number(month);
  const useMonth = Number.isFinite(y) && y >= 2000 && Number.isFinite(m) && m >= 1 && m <= 12;
  const monthBounds = easternMonthUtcBounds(useMonth ? y : current.year, useMonth ? m : current.month);
  const fromBounds = easternDayUtcBounds(from);
  const toBounds = easternDayUtcBounds(to);
  let start = monthBounds?.start || '';
  let end = monthBounds?.end || '';
  if (fromBounds && fromBounds.start > start) start = fromBounds.start;
  if (toBounds && toBounds.end < end) end = toBounds.end;
  return {
    year: useMonth ? y : current.year,
    month: useMonth ? m : current.month,
    start,
    end,
  };
}

export async function recordAuditActorName(env, user = {}) {
  const userId = Number(user?.id);
  if (!env?.DB?.prepare || !Number.isInteger(userId) || userId <= 0) return null;
  try {
    await env.DB.prepare(
      'INSERT INTO admin_audit_actor_names (user_id, username, display_name) VALUES (?, ?, ?)',
    ).bind(
      userId,
      String(user.username || '').trim().slice(0, 190),
      String(user.display_name || '').trim().slice(0, 190),
    ).run();
  } catch {
    return null;
  }
  return userId;
}

export async function resolveAuditActorSqlFilter(env, actor = '') {
  const actorFilter = String(actor || '').trim();
  if (!actorFilter) return { clauses: [], binds: [] };
  if (/^\d+$/.test(actorFilter)) {
    return { clauses: ['actor_user_id = ?'], binds: [Number(actorFilter)] };
  }
  const like = `%${actorFilter.toLowerCase()}%`;
  const ids = [];
  const addId = (value) => {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  };
  try {
    const usersSql = 'SELECT id FROM users WHERE LOWER(username) LIKE ? OR LOWER(display_name) LIKE ? LIMIT 50';
    assertAuditSqlIsAppendOnly(usersSql);
    const found = await env.DB.prepare(usersSql).bind(like, like).all();
    for (const row of found?.results || []) addId(row.id);
  } catch {
    // users table is optional in unit mocks
  }
  try {
    const namesSql = 'SELECT DISTINCT user_id AS id FROM admin_audit_actor_names WHERE LOWER(username) LIKE ? OR LOWER(display_name) LIKE ? LIMIT 50';
    const found = await env.DB.prepare(namesSql).bind(like, like).all();
    for (const row of found?.results || []) addId(row.id);
  } catch {
    // name map is optional until schema 2026-10-04.5
  }
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(', ');
    return {
      clauses: [`(actor_user_id IN (${placeholders}) OR LOWER(COALESCE(actor_username, '')) LIKE ?)`],
      binds: [...ids, like],
    };
  }
  return {
    clauses: ["LOWER(COALESCE(actor_username, '')) LIKE ?"],
    binds: [like],
  };
}

export async function listAdminAuditLogs(env, {
  limit = ADMIN_AUDIT_PAGE_SIZE,
  offset = 0,
  action = '',
  actor = '',
  year,
  month,
  from = '',
  to = '',
  q = '',
  now = new Date(),
  after_id = 0,
  order = 'desc',
} = {}) {
  const started = Date.now();
  const safeLimit = Math.min(Math.max(Number(limit) || ADMIN_AUDIT_PAGE_SIZE, 1), 2000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const afterId = Math.max(Number(after_id) || 0, 0);
  const clauses = [];
  const binds = [];
  const actionFilter = String(action || '').trim();
  const query = String(q || '').trim();
  const range = resolveAuditLogTimeRange({ year, month, from, to, now });
  if (actionFilter) {
    clauses.push('action = ?');
    binds.push(actionFilter);
  }
  const actorSql = await resolveAuditActorSqlFilter(env, actor);
  clauses.push(...actorSql.clauses);
  binds.push(...actorSql.binds);
  if (range.start) {
    clauses.push('created_at >= ?');
    binds.push(range.start);
  }
  if (range.end) {
    clauses.push('created_at < ?');
    binds.push(range.end);
  }
  const countClauses = clauses.slice();
  const countBinds = binds.slice();
  if (afterId) {
    clauses.push('id > ?');
    binds.push(afterId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const countWhere = countClauses.length ? `WHERE ${countClauses.join(' AND ')}` : '';
  const orderSql = order === 'asc' ? 'ORDER BY id ASC' : 'ORDER BY created_at DESC, id DESC';
  const countSql = `SELECT COUNT(*) AS total FROM ${ADMIN_AUDIT_TABLE} ${countWhere}`;
  const listSql = afterId || order === 'asc'
    ? `SELECT id, created_at, action, category, method, path, status, actor_user_id, actor_username,
            ip, user_agent, summary, meta_json, payload_sha256, prev_sha256, ciphertext, enc_version
     FROM ${ADMIN_AUDIT_TABLE}
     ${where}
     ${orderSql}
     LIMIT ?`
    : `SELECT id, created_at, action, category, method, path, status, actor_user_id, actor_username,
            ip, user_agent, summary, meta_json, payload_sha256, prev_sha256, ciphertext, enc_version
     FROM ${ADMIN_AUDIT_TABLE}
     ${where}
     ${orderSql}
     LIMIT ? OFFSET ?`;
  assertAuditSqlIsAppendOnly(countSql);
  assertAuditSqlIsAppendOnly(listSql);
  const countRow = await env.DB.prepare(countSql).bind(...countBinds).first();
  const rows = afterId || order === 'asc'
    ? await env.DB.prepare(listSql).bind(...binds, safeLimit).all()
    : await env.DB.prepare(listSql).bind(...binds, safeLimit, safeOffset).all();
  const rawRows = rows.results || [];
  const decrypted = [];
  for (const row of rawRows) {
    decrypted.push(await deserializeEncryptedAuditRow(env, row, { verifyDigest: false }));
  }
  let entries = decrypted;
  if (query) {
    entries = entries.filter((entry) => auditEntryMatchesQuery(entry, query));
  }
  const writeFailures = await readAuditWriteFailures(env);
  return {
    total: Number(countRow?.total) || 0,
    limit: safeLimit,
    offset: safeOffset,
    after_id: afterId,
    year: range.year,
    month: range.month,
    from: String(from || '').trim(),
    to: String(to || '').trim(),
    q: query,
    entries,
    fetched: decrypted.length,
    matched: entries.length,
    chain_ok: null,
    chain_scope: 'page',
    chain_status: 'This page — not a full-chain verify',
    chain_break_id: null,
    elapsed_ms: Date.now() - started,
    write_failures: writeFailures,
    known_actions: [...ADMIN_AUDIT_KNOWN_ACTIONS],
    storage: 'encrypted-d1',
    integrity: 'sha-256',
    encryption: hasAuditLogKey(env) ? 'aes-256-gcm' : 'unsigned-fallback',
    key_configured: hasAuditLogKey(env),
    access: 'super_admin_only',
    mode: 'view_print_only',
    editable: false,
  };
}

export async function readAuditChainCutover(env) {
  try {
    const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?')
      .bind('audit_chain_cutover_id')
      .first();
    if (row?.value == null || String(row.value).trim() === '') return 0;
    return Number(row.value) || 0;
  } catch {
    return 0;
  }
}

export async function loadAuditGenerations(env) {
  const sql = `SELECT id, created_at, action, category, actor_user_id, actor_username,
      ciphertext, enc_version, payload_sha256
     FROM ${ADMIN_AUDIT_TABLE}
     WHERE action = 'log.genesis'
     ORDER BY id ASC`;
  assertAuditSqlIsAppendOnly(sql);
  let rows = [];
  try {
    const fetched = await env.DB.prepare(sql).all();
    rows = fetched?.results || [];
  } catch {
    rows = [];
  }
  const gens = [];
  for (const row of rows) {
    const decoded = await deserializeEncryptedAuditRow(env, row, { verifyDigest: false });
    const meta = decoded?.meta && typeof decoded.meta === 'object' ? decoded.meta : {};
    gens.push({
      id: Number(row.id) || 0,
      created_at: String(row.created_at || decoded?.created_at || ''),
      actor_username: String(decoded?.actor_username || row.actor_username || ''),
      generation: Number(meta.generation) || gens.length + 2,
      new_key_id: String(meta.new_key_id || row.key_id || ''),
      authorized_by: String(meta.authorized_by || decoded?.actor_username || row.actor_username || ''),
      reason: String(meta.reason || ''),
    });
  }
  return gens;
}

export function buildAuditGenerationCatalog({ genesisRows = [], minId = 1, maxId = 0 } = {}) {
  const startMin = Number(minId) || 1;
  const endMax = Number(maxId) || startMin;
  const rows = Array.isArray(genesisRows) ? genesisRows : [];
  if (!rows.length) {
    return [{
      generation: 1,
      key_id: 'historical',
      start_id: startMin,
      end_id: endMax,
      historical: false,
      current: true,
    }];
  }
  const catalog = [];
  const first = rows[0];
  const firstId = Number(first.id) || startMin;
  if (firstId > startMin) {
    catalog.push({
      generation: 1,
      key_id: 'historical',
      start_id: startMin,
      end_id: firstId - 1,
      historical: true,
      closed_by: firstId,
      close_reason: first.reason || '',
    });
  }
  rows.forEach((row, index) => {
    const next = rows[index + 1];
    catalog.push({
      generation: Number(row.generation) || (index + 2),
      key_id: row.new_key_id || row.key_id || '',
      start_id: Number(row.id) || startMin,
      end_id: next ? Number(next.id) - 1 : endMax,
      started_at: row.created_at,
      started_at_et: formatAuditTimestampEt(row.created_at),
      started_by: row.authorized_by || row.actor_username || '',
      reason: row.reason || '',
    });
  });
  return catalog;
}

export function formatAuditGenerationReport(catalog = [], breaks = []) {
  return (Array.isArray(catalog) ? catalog : []).map((gen) => {
    const genBreaks = (Array.isArray(breaks) ? breaks : []).filter((item) => {
      const id = Number(item.id);
      return id >= Number(gen.start_id) && id <= Number(gen.end_id);
    });
    const ids = genBreaks.map((item) => `#${item.id}`).join(', ');
    if (gen.historical) {
      return `Generation 1 (historical, closed by genesis #${gen.closed_by}): ${genBreaks.length} break${genBreaks.length === 1 ? '' : 's'}${ids ? ` at ${ids}` : ''}, reason recorded in genesis row`;
    }
    const status = genBreaks.length
      ? `${genBreaks.length} break${genBreaks.length === 1 ? '' : 's'} at ${ids}`
      : 'INTACT';
    return `Generation ${gen.generation} (${gen.key_id || 'k1'}), started ${gen.started_at_et || 'at original build'} by ${gen.started_by || 'unknown'}, rows #${gen.start_id}-#${gen.end_id}: ${status}`;
  });
}

export async function createAuditExportSession(env, {
  actorId = 0,
  format = 'csv',
  filters = {},
} = {}) {
  const session = {
    v: 1,
    sid: crypto.randomUUID(),
    actor_id: Number(actorId) || 0,
    format: String(format || 'csv'),
    filters: filters && typeof filters === 'object' ? filters : {},
    iat: Date.now(),
    exp: Date.now() + (45 * 60 * 1000),
  };
  const payload = JSON.stringify(session);
  const sig = await signAuditChainHead(env, payload);
  return {
    session_id: `${bytesToBase64(TEXT.encode(payload))}.${sig}`,
    session,
  };
}

export async function readAuditExportSession(env, sessionId = '') {
  const raw = String(sessionId || '').trim();
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return { ok: false, status: 400, detail: 'Export session required' };
  let payload = '';
  try {
    payload = TEXT_DEC.decode(base64ToBytes(raw.slice(0, dot)));
  } catch {
    return { ok: false, status: 400, detail: 'Export session is invalid' };
  }
  const sig = raw.slice(dot + 1);
  const expected = await signAuditChainHead(env, payload);
  if (sig !== expected) return { ok: false, status: 403, detail: 'Export session is invalid' };
  let session = null;
  try {
    session = JSON.parse(payload);
  } catch {
    return { ok: false, status: 400, detail: 'Export session is invalid' };
  }
  if (Date.now() > Number(session?.exp || 0)) {
    return { ok: false, status: 403, detail: 'Export session expired' };
  }
  return { ok: true, session };
}

export async function nextAuditExportRunningHash(prev = '', entries = []) {
  let acc = String(prev || '');
  for (const entry of Array.isArray(entries) ? entries : []) {
    acc = await sha256Hex(`${acc}|${entry.id}|${entry.payload_sha256 || ''}`);
  }
  return acc;
}

export async function buildAuditExportManifest(env, extra = {}) {
  const head = await readAuditChainHead(env);
  const genesis = await loadAuditGenerations(env);
  const minId = extra.min_id != null ? Number(extra.min_id) : 1;
  const maxId = extra.max_id != null ? Number(extra.max_id) : head.id;
  const catalog = buildAuditGenerationCatalog({
    genesisRows: genesis,
    minId,
    maxId: maxId || head.id,
  });
  const material = [
    String(head.id || 0),
    String(head.payload_sha256 || ''),
    String(extra.count || 0),
    String(extra.running_hash || ''),
    String(minId || 0),
    String(maxId || 0),
  ].join('|');
  const signed = await signAuditChainHead(env, material);
  return {
    chain_head_id: head.id,
    chain_head: head.payload_sha256,
    generations: catalog,
    generation_report: formatAuditGenerationReport(catalog, extra.breaks || []),
    signed_manifest: signed,
    signed_chain: signed,
    count: extra.count || 0,
    running_hash: extra.running_hash || '',
    min_id: minId,
    max_id: maxId,
  };
}

export async function verifyAdminAuditBatch(env, {
  after_id = 0,
  expected_prev = '',
  limit = ADMIN_AUDIT_VERIFY_BATCH,
} = {}) {
  const started = Date.now();
  const safeLimit = Math.min(Math.max(Number(limit) || ADMIN_AUDIT_VERIFY_BATCH, 1), 200);
  const afterId = Math.max(Number(after_id) || 0, 0);
  const batchSql = `SELECT id, created_at, action, category, actor_user_id, ciphertext, enc_version,
      payload_sha256, prev_sha256, prev_id
     FROM ${ADMIN_AUDIT_TABLE} WHERE id > ? ORDER BY id ASC LIMIT ?`;
  assertAuditSqlIsAppendOnly(batchSql);
  const fetched = await env.DB.prepare(batchSql).bind(afterId, safeLimit).all();
  const rows = fetched?.results || [];
  let prevHash = String(expected_prev || '');
  let prevId = afterId;
  if (afterId > 0 && (!prevHash || !prevId)) {
    const neighborSql = `SELECT id, payload_sha256 FROM ${ADMIN_AUDIT_TABLE} WHERE id = ?`;
    assertAuditSqlIsAppendOnly(neighborSql);
    const neighbor = await env.DB.prepare(neighborSql).bind(afterId).first();
    if (!prevHash) prevHash = String(neighbor?.payload_sha256 || '');
    if (neighbor?.id) prevId = Number(neighbor.id) || afterId;
  }
  const cutover = await readAuditChainCutover(env);
  const breaks = [];
  const digestFailures = [];
  const legacy = [];
  for (const row of rows) {
    const id = Number(row.id) || 0;
    const prev = String(row.prev_sha256 || '');
    const linkedId = row.prev_id == null || row.prev_id === '' ? null : Number(row.prev_id);
    const afterCutover = cutover > 0 && id > cutover;
    const blankLink = !prev && (linkedId == null || linkedId === 0);
    if (!afterCutover && (blankLink || linkedId == null) && (!prev || prev === prevHash)) {
      if (blankLink || linkedId == null) {
        legacy.push({ id, kind: 'legacy', reason: 'legacy, pre-chain' });
      }
    }
    if (prev && prev !== prevHash) {
      breaks.push({
        id,
        kind: 'link',
        reason: `previous hash does not match row #${prevId || afterId}`,
      });
    } else if (afterCutover && (linkedId == null || (prevId && linkedId !== prevId) || (!prev && prevHash))) {
      breaks.push({
        id,
        kind: 'link',
        reason: linkedId == null
          ? 'prev_id is NULL after cutover'
          : `prev_id ${linkedId} does not follow #${prevId}`,
      });
    }
    const digest = await verifyAuditRowDigest(row);
    if (digest.recomputed && !digest.ok) {
      digestFailures.push({ id, kind: 'digest', reason: 'recomputed digest does not match stored SHA-256' });
      breaks.push({ id, kind: 'digest', reason: 'recomputed digest does not match stored SHA-256' });
    }
    prevHash = String(row.payload_sha256 || '');
    prevId = id;
  }
  const last = rows.length ? rows[rows.length - 1] : null;
  const first = rows.length ? rows[0] : null;
  const done = rows.length < safeLimit;
  const trueHead = await readAuditChainHead(env);
  const genesis = await loadAuditGenerations(env);
  const catalog = buildAuditGenerationCatalog({
    genesisRows: genesis,
    minId: first ? Number(first.id) : afterId || 1,
    maxId: trueHead.id || (last ? Number(last.id) : afterId),
  });
  const chainOk = breaks.length === 0;
  const breakIds = breaks.map((item) => item.id);
  return {
    chain_ok: chainOk,
    chain_status: chainOk
      ? (done ? 'Whole chain intact' : 'Batch intact')
      : `Breaks at ${breakIds.map((id) => `#${id}`).join(', ')}`,
    chain_break_id: breakIds[0] || null,
    chain_break_ids: breakIds,
    breaks,
    digest_failures: digestFailures,
    legacy,
    checked: rows.length,
    after_id: afterId,
    next_after_id: last ? Number(last.id) : afterId,
    next_expected_prev: last ? String(last.payload_sha256 || '') : prevHash,
    done,
    min_id: first ? Number(first.id) : null,
    max_id: last ? Number(last.id) : null,
    chain_head: trueHead.payload_sha256,
    chain_head_id: trueHead.id,
    generations: catalog,
    generation_report: formatAuditGenerationReport(catalog, breaks),
    explanation: AUDIT_CHAIN_BREAK_EXPLAIN,
    scope: 'whole_chain',
    elapsed_ms: Date.now() - started,
    key_configured: hasAuditLogKey(env),
  };
}

export async function verifyAdminAuditRange(env, options = {}) {
  if (options.batch || options.after_id != null) {
    return verifyAdminAuditBatch(env, options);
  }
  let afterId = 0;
  let expectedPrev = '';
  let checked = 0;
  let chainOk = true;
  let status = 'Whole chain intact';
  let breakId = null;
  const breaks = [];
  const digestFailures = [];
  let minId = null;
  let maxId = null;
  let head = '';
  let headId = null;
  let tail = '';
  let generations = [];
  let generationReport = [];
  let explanation = AUDIT_CHAIN_BREAK_EXPLAIN;
  while (true) {
    const batch = await verifyAdminAuditBatch(env, {
      after_id: afterId,
      expected_prev: expectedPrev,
      limit: options.limit || ADMIN_AUDIT_VERIFY_BATCH,
    });
    if (minId == null) minId = batch.min_id;
    if (batch.max_id) maxId = batch.max_id;
    if (!tail && batch.min_id) tail = String(batch.next_expected_prev || '');
    checked += Number(batch.checked) || 0;
    if (batch.chain_head) head = batch.chain_head;
    if (batch.chain_head_id) headId = batch.chain_head_id;
    if (Array.isArray(batch.breaks)) breaks.push(...batch.breaks);
    if (Array.isArray(batch.digest_failures)) digestFailures.push(...batch.digest_failures);
    if (Array.isArray(batch.generations)) generations = batch.generations;
    if (batch.explanation) explanation = batch.explanation;
    if (batch.chain_ok === false) {
      chainOk = false;
      breakId = breakId || batch.chain_break_id;
    }
    if (batch.done) {
      generationReport = formatAuditGenerationReport(generations, breaks);
      status = chainOk
        ? (generationReport[generationReport.length - 1] || 'Whole chain intact')
        : `Breaks at ${breaks.map((item) => `#${item.id}`).join(', ')}`;
      break;
    }
    afterId = batch.next_after_id;
    expectedPrev = batch.next_expected_prev;
  }
  const material = [
    String(minId || 0),
    String(maxId || 0),
    String(checked),
    String(head || ''),
    String(tail || ''),
  ].join('|');
  const signature = await signAuditChainHead(env, material);
  return {
    chain_ok: chainOk,
    chain_status: status,
    chain_break_id: breakId,
    chain_break_ids: breaks.map((item) => item.id),
    breaks,
    checked,
    digest_failures: digestFailures,
    min_id: minId,
    max_id: maxId,
    chain_head: head,
    chain_head_id: headId,
    chain_tail: tail,
    signed_chain: signature,
    generations,
    generation_report: generationReport,
    explanation,
    key_configured: hasAuditLogKey(env),
    scope: 'whole_chain',
  };
}

function csvEscape(value) {
  const raw = String(value ?? '');
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function buildAdminAuditExportCsv(entries = [], verify = null) {
  const header = [
    'id',
    'created_at_utc',
    'created_at_et',
    'action',
    'category',
    'actor_user_id',
    'actor_username',
    'ip',
    'country',
    'session_id_hash',
    'method',
    'path',
    'status',
    'summary',
    'os',
    'os_version',
    'browser',
    'browser_version',
    'device_type',
    'user_agent',
    'client_ref',
    'client_screen',
    'client_viewport',
    'client_dpr',
    'client_tz',
    'client_language',
    'client_platform',
    'payload_sha256',
    'prev_sha256',
    'integrity_ok',
  ];
  const lines = [header.join(',')];
  for (const entry of entries) {
    const device = entry.meta?.device || {};
    const client = device.client || {};
    lines.push([
      entry.id,
      entry.created_at,
      entry.created_at_et || formatAuditTimestampEt(entry.created_at),
      entry.action,
      entry.category,
      entry.actor_user_id,
      entry.actor_username,
      entry.ip,
      entry.country,
      entry.session_id_hash,
      entry.method,
      entry.path,
      entry.status,
      entry.summary,
      device.os || '',
      device.os_version || '',
      device.browser || '',
      device.browser_version || '',
      device.device_type || '',
      device.user_agent || entry.user_agent || '',
      client.ref || '',
      client.screen || '',
      client.viewport || '',
      client.dpr ?? '',
      client.tz || '',
      client.language || '',
      client.platform || '',
      entry.payload_sha256,
      entry.prev_sha256,
      entry.integrity_ok,
    ].map(csvEscape).join(','));
  }
  if (verify) {
    lines.push('');
    lines.push(`chain_ok,${csvEscape(verify.chain_ok)}`);
    lines.push(`chain_head,${csvEscape(verify.chain_head)}`);
    lines.push(`chain_head_id,${csvEscape(verify.chain_head_id)}`);
    lines.push(`signed_chain,${csvEscape(verify.signed_chain || verify.signed_manifest)}`);
    lines.push(`signed_manifest,${csvEscape(verify.signed_manifest || verify.signed_chain)}`);
    if (Array.isArray(verify.generation_report)) {
      for (const line of verify.generation_report) {
        lines.push(`generation,${csvEscape(line)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

export function buildAdminAuditExportJson(entries = [], verify = null) {
  return `${JSON.stringify({
    generated_at: new Date().toISOString(),
    access: 'super_admin_only',
    editable: false,
    encryption: 'aes-256-gcm',
    integrity: 'sha-256-hash-chain',
    verify: verify || null,
    entries,
  }, null, 2)}\n`;
}

export function buildAdminAuditExportText(entries = []) {
  const lines = [
    'EFHS Band CMS Security Audit Log',
    `Generated: ${new Date().toISOString()}`,
    'Access: Super Admin only — encrypted server-side database (AES-256-GCM + SHA-256 integrity).',
    'Mode: View / print only. Not editable.',
    `Hash chain: ${entries.find((entry) => entry.chain_status)?.chain_status || 'checked on screen'}`,
    '',
  ];
  for (const entry of entries) {
    lines.push('='.repeat(72));
    lines.push(`When: ${entry.created_at_et || formatAuditTimestampEt(entry.created_at)}`);
    lines.push(`Action: ${entry.action || ''}`);
    lines.push(`Category: ${entry.category || ''}`);
    lines.push(`User: ${entry.actor_username || 'unknown'}${entry.actor_user_id ? ` (#${entry.actor_user_id})` : ''}`);
    lines.push(`Request: ${entry.method || ''} ${entry.path || ''}`.trim());
    lines.push(`Status: ${entry.status == null ? '' : entry.status}`);
    lines.push(`IP: ${entry.ip || ''}`);
    lines.push(`Summary: ${entry.summary || ''}`);
    if (entry.payload_sha256) lines.push(`SHA-256: ${entry.payload_sha256}`);
    if (entry.integrity_ok === false) lines.push('Integrity: FAILED');
    if (entry.user_agent) lines.push(`User-Agent: ${entry.user_agent}`);
    const deviceLine = formatAuditDeviceSummary(entry.meta?.device || entry.device);
    if (deviceLine) lines.push(`Device: ${deviceLine}`);
    if (entry.meta && Object.keys(entry.meta).length) {
      lines.push('Details:');
      lines.push(JSON.stringify(entry.meta, null, 2));
    }
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

export function enrichMailAuditMeta({
  subject = '',
  html = '',
  text = '',
  recipients = [],
  attachments = [],
  replyTo = '',
  results = [],
} = {}) {
  const bodyText = String(text || '').trim()
    || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    subject: String(subject || '').trim(),
    reply_to: String(replyTo || '').trim(),
    body_excerpt: bodyText.slice(0, 1500),
    body_length: bodyText.length,
    recipients: (Array.isArray(recipients) ? recipients : []).map((item) => ({
      user_id: item?.user_id ?? null,
      email: String(item?.email || '').trim().toLowerCase(),
    })),
    attachments: (Array.isArray(attachments) ? attachments : []).map((file) => ({
      filename: String(file?.filename || file?.name || 'attachment'),
      size: Number(file?.size) || 0,
      type: String(file?.type || file?.content_type || ''),
    })),
    results: (Array.isArray(results) ? results : []).map((item) => ({
      user_id: item?.user_id ?? null,
      email: String(item?.email || '').trim().toLowerCase(),
      ok: Boolean(item?.ok),
      error: item?.error ? String(item.error) : '',
    })),
  };
}

/* ---- PDF export helpers (kept inside this module so site/page work cannot alter them) ---- */

export function pdfSafeText(value = '') {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function assemblePdfBase64(objects = []) {
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  let binary = '';
  for (let i = 0; i < pdf.length; i += 1) binary += String.fromCharCode(pdf.charCodeAt(i) & 0xff);
  return btoa(binary);
}

export function wrapPdfLine(text = '', maxChars = 96) {
  const raw = String(text ?? '');
  if (!raw) return [''];
  if (raw.length <= maxChars) return [raw];
  const out = [];
  let remaining = raw;
  while (remaining.length > maxChars) {
    let breakAt = remaining.lastIndexOf(' ', maxChars);
    if (breakAt < Math.floor(maxChars * 0.45)) breakAt = maxChars;
    out.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).replace(/^\s+/, '');
  }
  if (remaining) out.push(remaining);
  return out;
}

export function buildMultiPageTextPdfBase64(lines = [], { title = 'Document' } = {}) {
  const topY = 742;
  const bottomY = 48;
  const lineHeight = 11;
  const titleSize = 16;
  const bodySize = 9;
  const maxChars = 96;
  const wrapped = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    for (const part of String(line ?? '').split('\n')) {
      wrapped.push(...wrapPdfLine(part, maxChars));
    }
  }

  const pages = [];
  let bucket = [];
  let y = topY - 28;
  const pushPage = () => {
    pages.push(bucket);
    bucket = [];
    y = topY;
  };

  for (const line of wrapped) {
    if (y - lineHeight < bottomY) pushPage();
    bucket.push(line);
    y -= lineHeight;
  }
  if (bucket.length || !pages.length) pages.push(bucket);

  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageObjNumbers = pages.map((_, index) => 3 + index * 2);
  const fontObjNum = 3 + pages.length * 2;
  objects.push(`<< /Type /Pages /Kids [${pageObjNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);

  pages.forEach((pageLines, pageIndex) => {
    const contentOps = [];
    if (pageIndex === 0) {
      contentOps.push(`BT /F1 ${titleSize} Tf 48 ${topY} Td (${pdfSafeText(title)}) Tj ET`);
    } else {
      contentOps.push(`BT /F1 10 Tf 48 ${topY} Td (${pdfSafeText(`${title} (continued)`)}) Tj ET`);
    }
    let cursorY = topY - 28;
    for (const line of pageLines) {
      contentOps.push(`BT /F1 ${bodySize} Tf 48 ${cursorY} Td (${pdfSafeText(line)}) Tj ET`);
      cursorY -= lineHeight;
    }
    const stream = `${contentOps.join('\n')}\n`;
    const pageObjNum = pageObjNumbers[pageIndex];
    const contentObjNum = pageObjNum + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources<< /Font<< /F1 ${fontObjNum} 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${stream.length} >>stream\n${stream}endstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const numbered = objects.map((body, index) => `${index + 1} 0 obj${body}endobj\n`);
  return assemblePdfBase64(numbered);
}

export function buildAdminAuditExportPdfBase64(entries = []) {
  const text = buildAdminAuditExportText(entries);
  const lines = String(text || '')
    .split('\n')
    .filter((line, index) => !(index === 0 && /security audit log/i.test(line)));
  return buildMultiPageTextPdfBase64(lines, { title: 'EFHS Band CMS Security Audit Log' });
}
