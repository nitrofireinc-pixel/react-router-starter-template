import { DEFAULT_CMS_PAGES } from './default-pages.mjs';

export const DEFAULT_SITE = {
  title: 'East Forsyth Band',
  hero_title: 'Sound. Spirit. Eagle Pride.',
  hero_subtitle: 'A polished home for the East Forsyth Band program — built for students, families, alumni, sponsors, and the Kernersville community.',
  footer_note: 'Draft website for the East Forsyth High School band program. Replace placeholder copy with official program details before launch.',
  logo_url: '/assets/efhs-logo.png',
};

export const DEFAULT_EVENTS = [
  ['Aug', '01', 'Band Camp / Preseason Prep', 'Placeholder: add official summer band camp dates, times, and location.', 1],
  ['Aug', 'TBD', 'Parent Preview Night', 'Placeholder: add location and what families should bring.', 2],
  ['Sep', 'FRI', 'Football Game Performance', 'Placeholder: add football schedule and call times when available.', 3],
  ['Oct', 'TBD', 'Marching Competition', 'Placeholder: add itinerary, address, ticket info, and volunteer needs.', 4],
];

const SESSION_COOKIE = 'efband_session';
const TEXT = new TextEncoder();
const READ_TEXT = new TextDecoder();
const GLOBAL_PERMISSIONS = ['site', 'pages', 'users', 'events', 'photos'];

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function normalizeStaticPath(pathname) {
  if (pathname === '/') return '/index.html';
  if (pathname.includes('..')) return '/index.html';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function normalizePageSlug(value) {
  const raw = String(value || '').replace(/^\//, '').replace(/\.html$/i, '');
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'page';
}

export function parsePermissions(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function hasPermission(user, scope) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const permissions = parsePermissions(user.permissions);
  return permissions.includes(scope) || permissions.includes('all');
}

function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

function redirect(location) {
  return new Response(null, { status: 303, headers: { location } });
}

function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacSign(value, secret) {
  const key = await crypto.subtle.importKey('raw', TEXT.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(await crypto.subtle.sign('HMAC', key, TEXT.encode(value)));
}

async function makeSession(user, env) {
  const payload = base64Url(TEXT.encode(JSON.stringify({ uid: user.id, u: user.username, t: Math.floor(Date.now() / 1000) })));
  return `${payload}.${await hmacSign(payload, sessionSecret(env))}`;
}

async function currentUser(request, env) {
  const value = getCookie(request, SESSION_COOKIE);
  if (!value || !value.includes('.')) return null;
  const [payload, supplied] = value.split('.');
  const expected = await hmacSign(payload, sessionSecret(env));
  if (supplied !== expected) return null;
  try {
    const data = JSON.parse(READ_TEXT.decode(fromBase64Url(payload)));
    if (data.uid) return getUserById(env, Number(data.uid));
    if (data.u) return getUserByUsername(env, data.u);
  } catch {
    return null;
  }
  return null;
}

function sessionSecret(env) {
  return env.EFBAND_SECRET || 'change-me-before-launch';
}

function adminUsername(env) {
  return env.EFBAND_ADMIN_USERNAME || 'admin';
}

function initialAdminPassword(env) {
  return env.EFBAND_ADMIN_PASSWORD || 'admin123$';
}

async function hashPassword(password, salt = crypto.randomUUID().replaceAll('-', '')) {
  const iterations = 100000;
  const key = await crypto.subtle.importKey('raw', TEXT.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: TEXT.encode(salt), iterations }, key, 256);
  return `pbkdf2_sha256$${iterations}$${salt}$${base64Url(bits)}`;
}

async function verifyPassword(password, stored) {
  try {
    const [algorithm, iterationsText, salt, expected] = stored.split('$');
    if (algorithm !== 'pbkdf2_sha256') return false;
    const key = await crypto.subtle.importKey('raw', TEXT.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: TEXT.encode(salt), iterations: Number(iterationsText) }, key, 256);
    return base64Url(bits) === expected;
  } catch {
    return false;
  }
}

async function initDb(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, date_label TEXT NOT NULL, date_detail TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, original_name TEXT NOT NULL, alt_text TEXT NOT NULL, caption TEXT NOT NULL DEFAULT \'\', sort_order INTEGER NOT NULL DEFAULT 0, content_type TEXT NOT NULL DEFAULT \'application/octet-stream\', data_base64 TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS auth_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL DEFAULT \'\', password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'editor\', permissions TEXT NOT NULL DEFAULT \'[]\', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS cms_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body_html TEXT NOT NULL DEFAULT \'\', nav_order INTEGER NOT NULL DEFAULT 0, is_home INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
  ]);
  const siteRows = await env.DB.prepare('SELECT key FROM site_content').all();
  const existingKeys = new Set((siteRows.results || []).map((row) => row.key));
  for (const [key, value] of Object.entries(DEFAULT_SITE)) {
    if (!existingKeys.has(key)) await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?)').bind(key, value).run();
  }
  const eventCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM events').first();
  if (!eventCount?.count) {
    await env.DB.batch(DEFAULT_EVENTS.map((event) => env.DB.prepare('INSERT INTO events (date_label, date_detail, title, description, sort_order) VALUES (?, ?, ?, ?, ?)').bind(...event)));
  }
  const pageCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM cms_pages').first();
  if (!pageCount?.count) {
    await env.DB.batch(DEFAULT_CMS_PAGES.map((page) => env.DB.prepare('INSERT INTO cms_pages (slug, path, title, body_html, nav_order, is_home, active) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(page.slug, page.path, page.title, page.body_html, page.nav_order, page.is_home, page.active)));
  }
  const userCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  if (!userCount?.count) {
    const previousHash = await env.DB.prepare("SELECT value FROM auth_settings WHERE key = 'admin_password_hash'").first();
    const passwordHash = previousHash?.value || await hashPassword(initialAdminPassword(env));
    await env.DB.prepare('INSERT INTO users (username, display_name, password_hash, role, permissions, active) VALUES (?, ?, ?, ?, ?, 1)').bind(adminUsername(env), 'Site Administrator', passwordHash, 'admin', JSON.stringify(['all'])).run();
    await env.DB.prepare("INSERT INTO auth_settings (key, value) VALUES ('admin_password_hash', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(passwordHash).run();
  }
}

async function getSite(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM site_content').all();
  const payload = { ...DEFAULT_SITE };
  for (const row of rows.results || []) payload[row.key] = row.value;
  return payload;
}

async function getEvents(env) {
  const rows = await env.DB.prepare('SELECT id, date_label, date_detail, title, description, sort_order FROM events ORDER BY sort_order, id').all();
  return rows.results || [];
}

async function getPhotos(env) {
  const rows = await env.DB.prepare('SELECT id, filename, original_name, alt_text, caption, sort_order FROM photos ORDER BY sort_order, id').all();
  return (rows.results || []).map((photo) => ({ ...photo, url: `/uploads/${encodeURIComponent(photo.filename)}` }));
}

async function getPages(env, includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const rows = await env.DB.prepare(`SELECT id, slug, path, title, body_html, nav_order, is_home, active, updated_at FROM cms_pages ${where} ORDER BY nav_order, id`).all();
  return rows.results || [];
}

async function getPageBySlug(env, slug, includeInactive = false) {
  const sql = includeInactive ? 'SELECT * FROM cms_pages WHERE slug = ?' : 'SELECT * FROM cms_pages WHERE slug = ? AND active = 1';
  return env.DB.prepare(sql).bind(slug).first();
}

async function getPageByPath(env, path) {
  return env.DB.prepare('SELECT * FROM cms_pages WHERE path = ? AND active = 1').bind(path).first();
}

async function getUserByUsername(env, username) {
  return env.DB.prepare('SELECT id, username, display_name, password_hash, role, permissions, active FROM users WHERE username = ?').bind(username).first();
}

async function getUserById(env, id) {
  return env.DB.prepare('SELECT id, username, display_name, password_hash, role, permissions, active FROM users WHERE id = ? AND active = 1').bind(id).first();
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, display_name: user.display_name, role: user.role, permissions: parsePermissions(user.permissions), active: Boolean(user.active) };
}

function canEditPage(user, slug) {
  return hasPermission(user, 'pages') || hasPermission(user, `page:${slug}`);
}

async function requireLogin(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { response: jsonResponse({ detail: 'Login required' }, 401) };
  return { user };
}

async function requirePermission(request, env, scope) {
  const auth = await requireLogin(request, env);
  if (auth.response) return auth;
  if (!hasPermission(auth.user, scope)) return { response: jsonResponse({ detail: `Permission required: ${scope}` }, 403), user: auth.user };
  return auth;
}

async function updatePassword(env, userId, newPassword) {
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(newPassword), userId).run();
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToArrayBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function storeImageUpload(env, file, altText = '', caption = '', sortOrder = 0) {
  if (!file || typeof file === 'string') throw new Error('Photo file is required');
  const originalName = file.name || 'photo';
  const ext = (originalName.match(/\.[a-z0-9]+$/i)?.[0] || '.bin').toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) throw new Error('Upload a JPG, PNG, WEBP, GIF, or SVG image');
  if (file.size && file.size > 1_500_000) throw new Error('Upload an image under 1.5 MB');
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const dataBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const result = await env.DB.prepare('INSERT INTO photos (filename, original_name, alt_text, caption, sort_order, content_type, data_base64) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(filename, originalName, altText, caption, Number(sortOrder || 0), file.type || 'application/octet-stream', dataBase64).run();
  return { id: result.meta.last_row_id, filename, original_name: originalName, alt_text: altText, caption, sort_order: Number(sortOrder || 0), url: `/uploads/${encodeURIComponent(filename)}` };
}

function pagePathFromSlug(slug) {
  return slug === 'home' ? '/' : `/${slug}.html`;
}

function serializePagePayload(payload, existing = null) {
  const slug = normalizePageSlug(payload.slug || payload.title || existing?.slug);
  const path = payload.path ? normalizeStaticPath(payload.path) : pagePathFromSlug(slug);
  return {
    slug,
    path: slug === 'home' ? '/' : path,
    title: String(payload.title || existing?.title || 'Untitled Page').trim(),
    body_html: String(payload.body_html ?? existing?.body_html ?? '<section><div class="wrap"><h1>New Page</h1><p>Edit this page in the CMS.</p></div></section>'),
    nav_order: Number(payload.nav_order ?? existing?.nav_order ?? 99),
    is_home: slug === 'home' || payload.is_home ? 1 : 0,
    active: payload.active === false || payload.active === 0 ? 0 : 1,
  };
}

async function handleApi(request, env, url) {
  await initDb(env);
  if (url.pathname === '/health') return jsonResponse({ ok: true });
  if (url.pathname === '/api/site' && request.method === 'GET') return jsonResponse(await getSite(env));
  if (url.pathname === '/api/events' && request.method === 'GET') return jsonResponse(await getEvents(env));
  if (url.pathname === '/api/photos' && request.method === 'GET') return jsonResponse(await getPhotos(env));
  if (url.pathname === '/api/pages' && request.method === 'GET') return jsonResponse((await getPages(env)).map(({ body_html, ...page }) => page));
  const publicPageMatch = url.pathname.match(/^\/api\/pages\/([a-z0-9-]+)$/);
  if (publicPageMatch && request.method === 'GET') {
    const page = await getPageBySlug(env, publicPageMatch[1]);
    return page ? jsonResponse(page) : jsonResponse({ detail: 'Not found' }, 404);
  }

  if (url.pathname === '/api/admin/me') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    return jsonResponse({ user: publicUser(auth.user), permissions: GLOBAL_PERMISSIONS, pages: (await getPages(env, true)).map((page) => ({ slug: page.slug, title: page.title, path: page.path, active: Boolean(page.active) })) });
  }

  if (url.pathname === '/api/admin/site' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const payload = await request.json();
    for (const key of ['title', 'hero_title', 'hero_subtitle', 'footer_note', 'logo_url']) {
      if (payload[key] !== undefined) await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, String(payload[key])).run();
    }
    return jsonResponse(await getSite(env));
  }

  if (url.pathname === '/api/admin/logo' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const form = await request.formData();
    try {
      const stored = await storeImageUpload(env, form.get('file'), 'Site logo', 'Logo', -1000);
      await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('logo_url', stored.url).run();
      return jsonResponse({ ...stored, site: await getSite(env) });
    } catch (error) {
      return jsonResponse({ detail: error.message }, 400);
    }
  }

  if (url.pathname === '/api/admin/password' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const payload = await request.json();
    if (!(await verifyPassword(payload.current_password || '', auth.user.password_hash))) return jsonResponse({ detail: 'Current password is incorrect' }, 400);
    if (!payload.new_password || payload.new_password.length < 8) return jsonResponse({ detail: 'New password must be at least 8 characters' }, 422);
    await updatePassword(env, auth.user.id, payload.new_password);
    return jsonResponse({ ok: true });
  }

  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    const auth = await requirePermission(request, env, 'users');
    if (auth.response) return auth.response;
    const rows = await env.DB.prepare('SELECT id, username, display_name, role, permissions, active FROM users ORDER BY username').all();
    return jsonResponse((rows.results || []).map(publicUser));
  }
  if (url.pathname === '/api/admin/users' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'users');
    if (auth.response) return auth.response;
    const payload = await request.json();
    if (!payload.username || !payload.password) return jsonResponse({ detail: 'Username and password are required' }, 422);
    const result = await env.DB.prepare('INSERT INTO users (username, display_name, password_hash, role, permissions, active) VALUES (?, ?, ?, ?, ?, ?)').bind(String(payload.username).trim(), String(payload.display_name || payload.username), await hashPassword(payload.password), payload.role === 'admin' ? 'admin' : 'editor', JSON.stringify(parsePermissions(payload.permissions)), payload.active === false ? 0 : 1).run();
    return jsonResponse(publicUser(await getUserById(env, result.meta.last_row_id)));
  }
  const userMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch && request.method === 'PUT') {
    const auth = await requirePermission(request, env, 'users');
    if (auth.response) return auth.response;
    const id = Number(userMatch[1]);
    const payload = await request.json();
    const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!existing) return jsonResponse({ detail: 'User not found' }, 404);
    const role = payload.role === 'admin' ? 'admin' : 'editor';
    const permissions = JSON.stringify(parsePermissions(payload.permissions));
    await env.DB.prepare('UPDATE users SET username = ?, display_name = ?, role = ?, permissions = ?, active = ? WHERE id = ?').bind(String(payload.username || existing.username).trim(), String(payload.display_name || ''), role, permissions, payload.active === false ? 0 : 1, id).run();
    if (payload.password) await updatePassword(env, id, payload.password);
    return jsonResponse(publicUser(await env.DB.prepare('SELECT id, username, display_name, role, permissions, active FROM users WHERE id = ?').bind(id).first()));
  }
  if (userMatch && request.method === 'DELETE') {
    const auth = await requirePermission(request, env, 'users');
    if (auth.response) return auth.response;
    if (Number(userMatch[1]) === auth.user.id) return jsonResponse({ detail: 'You cannot delete your own account' }, 400);
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(Number(userMatch[1])).run();
    return jsonResponse({ ok: true });
  }

  if (url.pathname === '/api/admin/pages' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const pages = await getPages(env, true);
    return jsonResponse(hasPermission(auth.user, 'pages') ? pages : pages.filter((page) => canEditPage(auth.user, page.slug)));
  }
  if (url.pathname === '/api/admin/pages' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'pages');
    if (auth.response) return auth.response;
    const page = serializePagePayload(await request.json());
    const result = await env.DB.prepare('INSERT INTO cms_pages (slug, path, title, body_html, nav_order, is_home, active) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(page.slug, page.path, page.title, page.body_html, page.nav_order, page.is_home, page.active).run();
    return jsonResponse(await env.DB.prepare('SELECT * FROM cms_pages WHERE id = ?').bind(result.meta.last_row_id).first());
  }
  const pageMatch = url.pathname.match(/^\/api\/admin\/pages\/([a-z0-9-]+)$/);
  if (pageMatch && request.method === 'PUT') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const existing = await getPageBySlug(env, pageMatch[1], true);
    if (!existing) return jsonResponse({ detail: 'Page not found' }, 404);
    if (!canEditPage(auth.user, existing.slug)) return jsonResponse({ detail: `Permission required: page:${existing.slug}` }, 403);
    const page = serializePagePayload(await request.json(), existing);
    if (existing.slug === 'home') page.slug = 'home';
    if (existing.is_home) page.path = '/';
    await env.DB.prepare('UPDATE cms_pages SET slug = ?, path = ?, title = ?, body_html = ?, nav_order = ?, is_home = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(page.slug, page.path, page.title, page.body_html, page.nav_order, page.is_home, page.active, existing.id).run();
    return jsonResponse(await getPageBySlug(env, page.slug, true));
  }
  if (pageMatch && request.method === 'DELETE') {
    const auth = await requirePermission(request, env, 'pages');
    if (auth.response) return auth.response;
    const existing = await getPageBySlug(env, pageMatch[1], true);
    if (!existing) return jsonResponse({ detail: 'Page not found' }, 404);
    if (existing.is_home) return jsonResponse({ detail: 'Home page cannot be deleted' }, 400);
    await env.DB.prepare('DELETE FROM cms_pages WHERE id = ?').bind(existing.id).run();
    return jsonResponse({ ok: true });
  }

  if (url.pathname === '/api/admin/events' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'events');
    if (auth.response) return auth.response;
    const p = await request.json();
    const result = await env.DB.prepare('INSERT INTO events (date_label, date_detail, title, description, sort_order) VALUES (?, ?, ?, ?, ?)').bind(p.date_label, p.date_detail, p.title, p.description, Number(p.sort_order || 0)).run();
    return jsonResponse(await env.DB.prepare('SELECT id, date_label, date_detail, title, description, sort_order FROM events WHERE id = ?').bind(result.meta.last_row_id).first());
  }
  const eventMatch = url.pathname.match(/^\/api\/admin\/events\/(\d+)$/);
  if (eventMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requirePermission(request, env, 'events');
    if (auth.response) return auth.response;
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(Number(eventMatch[1])).run();
      return jsonResponse({ ok: true });
    }
    const id = Number(eventMatch[1]);
    const p = await request.json();
    await env.DB.prepare('UPDATE events SET date_label = ?, date_detail = ?, title = ?, description = ?, sort_order = ? WHERE id = ?').bind(p.date_label, p.date_detail, p.title, p.description, Number(p.sort_order || 0), id).run();
    return jsonResponse(await env.DB.prepare('SELECT id, date_label, date_detail, title, description, sort_order FROM events WHERE id = ?').bind(id).first());
  }

  if (url.pathname === '/api/admin/photos' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'photos');
    if (auth.response) return auth.response;
    const form = await request.formData();
    try {
      return jsonResponse(await storeImageUpload(env, form.get('file'), String(form.get('alt_text') || ''), String(form.get('caption') || ''), Number(form.get('sort_order') || 0)));
    } catch (error) {
      return jsonResponse({ detail: error.message }, 400);
    }
  }
  const photoMatch = url.pathname.match(/^\/api\/admin\/photos\/(\d+)$/);
  if (photoMatch && request.method === 'DELETE') {
    const auth = await requirePermission(request, env, 'photos');
    if (auth.response) return auth.response;
    await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(Number(photoMatch[1])).run();
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ detail: 'Not found' }, 404);
}

async function handleUploadGet(env, url) {
  await initDb(env);
  const key = decodeURIComponent(url.pathname.replace('/uploads/', ''));
  const row = await env.DB.prepare('SELECT content_type, data_base64 FROM photos WHERE filename = ?').bind(key).first();
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(base64ToArrayBuffer(row.data_base64), { headers: { 'content-type': row.content_type || 'application/octet-stream', 'cache-control': 'public, max-age=3600' } });
}

async function handleLogin(request, env) {
  await initDb(env);
  if (request.method === 'GET') return htmlResponse(LOGIN_HTML);
  const form = await request.formData();
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  const user = await getUserByUsername(env, username);
  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) {
    return htmlResponse(LOGIN_HTML.replace('</form>', "<p class='error'>Invalid username or password.</p></form>"), 401);
  }
  const response = redirect('/admin');
  response.headers.set('set-cookie', `${SESSION_COOKIE}=${await makeSession(user, env)}; HttpOnly; Secure; SameSite=Lax; Path=/`);
  return response;
}

async function handleAdmin(request, env) {
  await initDb(env);
  if (!(await currentUser(request, env))) return redirect('/admin/login');
  return htmlResponse(ADMIN_HTML);
}

function logout() {
  const response = redirect('/admin/login');
  response.headers.set('set-cookie', `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  return response;
}

function renderNav(pages) {
  return pages.map((page) => `<a href="${escapeAttr(page.path)}">${escapeHtml(page.title.replace(/\s*\|\s*East Forsyth Band$/, ''))}</a>`).join('');
}

function renderCmsPage(page, site, pages) {
  const title = page.is_home ? `Home | ${site.title}` : `${page.title} | ${site.title}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttr(site.title)} website.">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="${escapeAttr(site.logo_url || '/assets/efhs-icon.png')}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="utility"><div class="wrap"><a href="/calendar.html">Upcoming Events</a><a href="/resources.html">Student Resources</a><a href="/contact.html">Contact</a></div></div>
<header class="site-header"><div class="header-inner"><a class="brand" href="/"><img src="${escapeAttr(site.logo_url || '/assets/efhs-logo.png')}" alt="${escapeAttr(site.title)} logo"><span data-site-field="title">${escapeHtml(site.title)}</span></a><button class="menu-button" aria-expanded="false" aria-controls="site-nav">Menu</button><nav id="site-nav" aria-label="Main navigation">${renderNav(pages)}</nav></div></header>
<main id="main">${page.body_html}</main>
<footer class="footer"><div class="wrap"><div><h3 data-site-field="title">${escapeHtml(site.title)}</h3><p data-site-field="footer_note">${escapeHtml(site.footer_note)}</p><small>School colors and imagery sourced from East Forsyth High School assets provided with permission.</small></div><div><h3>Program</h3>${pages.slice(1,4).map((p) => `<a href="${escapeAttr(p.path)}">${escapeHtml(p.title)}</a>`).join('')}</div><div><h3>Families</h3>${pages.slice(4,7).map((p) => `<a href="${escapeAttr(p.path)}">${escapeHtml(p.title)}</a>`).join('')}</div><div><h3>Community</h3><a href="/sponsors.html">Sponsors</a><a href="/contact.html">Contact</a><a href="https://www.wsfcs.k12.nc.us/o/efhs">EFHS Website</a></div></div></footer>
<script src="/script.js"></script><script src="/site-content.js"></script>
</body></html>`;
}

async function serveStaticOrCms(request, env, url) {
  await initDb(env);
  const path = url.pathname === '/' ? '/' : normalizeStaticPath(url.pathname);
  if (path === '/' || path.endsWith('.html')) {
    const page = await getPageByPath(env, path);
    if (page) return htmlResponse(renderCmsPage(page, await getSite(env), await getPages(env)));
  }
  if (url.pathname === '/') return env.ASSETS.fetch(request);
  const assetUrl = new URL(request.url);
  assetUrl.pathname = normalizeStaticPath(url.pathname);
  return env.ASSETS.fetch(new Request(assetUrl, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname.startsWith('/api/')) return handleApi(request, env, url);
    if (url.pathname === '/admin/login') return handleLogin(request, env);
    if (url.pathname === '/admin/logout' && request.method === 'POST') return logout();
    if (url.pathname === '/admin') return handleAdmin(request, env);
    if (url.pathname.startsWith('/uploads/')) return handleUploadGet(env, url);
    return serveStaticOrCms(request, env, url);
  },
};

const LOGIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login | East Forsyth Band</title><link rel="stylesheet" href="/styles.css"></head><body class="admin-body"><main class="admin-shell small"><h1>East Forsyth Band Admin</h1><p>Log in to edit assigned CMS areas.</p><form class="admin-card" method="post" action="/admin/login"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button class="btn primary" type="submit">Log in</button></form></main></body></html>`;

const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CMS Admin | East Forsyth Band</title><link rel="stylesheet" href="/styles.css"></head><body class="admin-body"><main class="admin-shell cms-shell"><div class="admin-top"><div><p class="kicker">Full CMS</p><h1>Website Admin</h1><p>Edit pages, users, calendar, photos, logo, and site settings based on your permissions.</p><p id="current-user" class="status"></p></div><form method="post" action="/admin/logout"><button class="btn secondary">Log out</button></form></div>
<nav class="admin-tabs"><button data-tab="pages">Pages</button><button data-tab="site">Site settings</button><button data-tab="users">Users & permissions</button><button data-tab="events">Calendar</button><button data-tab="photos">Photos</button></nav>
<section id="tab-pages" class="admin-card cms-panel"><h2>Editable pages</h2><p>Every page has its own permission scope. Admins can add/remove pages; editors can edit only checked pages.</p><div class="grid two"><form id="page-form" class="stack"><input type="hidden" name="original_slug"><label>Page title<input name="title" required></label><label>Slug<input name="slug" placeholder="booster-info" required></label><label>Path<input name="path" placeholder="/booster-info.html"></label><label>Navigation order<input name="nav_order" type="number" value="99"></label><label class="checkline"><input name="active" type="checkbox" checked> Active / visible</label><label>Page HTML<textarea name="body_html" rows="18" class="code-editor" required></textarea></label><button class="btn primary">Save page</button><button class="btn outline" type="button" id="new-page">New page</button><p class="status" id="page-status"></p></form><div id="pages-list" class="admin-list"></div></div></section>
<section id="tab-site" class="admin-card cms-panel"><h2>Home, title, logo, footer</h2><form id="site-form" class="stack"><label>Site title<input name="title" required></label><label>Hero title<input name="hero_title" required></label><label>Hero subtitle<textarea name="hero_subtitle" required rows="4"></textarea></label><label>Footer note<textarea name="footer_note" required rows="3"></textarea></label><label>Logo URL<input name="logo_url" required></label><button class="btn primary">Save site settings</button><p class="status" id="site-status"></p></form><form id="logo-form" class="stack"><h3>Upload new logo</h3><label>Logo file<input name="file" type="file" accept="image/*,.svg" required></label><button class="btn secondary">Upload logo</button><p class="status" id="logo-status"></p></form></section>
<section id="tab-users" class="admin-card cms-panel"><h2>Users and permissions</h2><div class="grid two"><form id="user-form" class="stack"><input type="hidden" name="id"><label>Username<input name="username" required></label><label>Display name<input name="display_name"></label><label>Password <small>required for new users, optional when editing</small><input name="password" type="password"></label><label>Role<select name="role"><option value="editor">Editor</option><option value="admin">Admin - all permissions</option></select></label><label class="checkline"><input name="active" type="checkbox" checked> Active</label><fieldset><legend>Global permissions</legend><label class="checkline"><input type="checkbox" name="permissions" value="site"> Site settings, home text, logo</label><label class="checkline"><input type="checkbox" name="permissions" value="pages"> Add/remove/manage all pages</label><label class="checkline"><input type="checkbox" name="permissions" value="users"> Manage users</label><label class="checkline"><input type="checkbox" name="permissions" value="events"> Add/edit calendar events only</label><label class="checkline"><input type="checkbox" name="permissions" value="photos"> Upload/delete photos</label></fieldset><fieldset><legend>Page edit permissions</legend><div id="page-permission-boxes"></div></fieldset><button class="btn primary">Save user</button><button class="btn outline" type="button" id="new-user">New user</button><p class="status" id="user-status"></p></form><div id="users-list" class="admin-list"></div></div></section>
<section id="tab-events" class="admin-card cms-panel"><h2>Calendar events</h2><form id="event-form" class="stack"><input type="hidden" name="id"><label>Month / label<input name="date_label" placeholder="Aug" required></label><label>Day / detail<input name="date_detail" placeholder="01 or TBD" required></label><label>Event title<input name="title" required></label><label>Description<textarea name="description" rows="3" required></textarea></label><label>Sort order<input name="sort_order" type="number" value="0"></label><button class="btn primary">Save event</button><button class="btn outline" type="button" id="new-event">New event</button></form><div id="events-list" class="admin-list"></div></section>
<section id="tab-photos" class="admin-card cms-panel"><h2>Photo gallery</h2><form id="photo-form" class="stack"><label>Photo<input name="file" type="file" accept="image/*" required></label><label>Alt text<input name="alt_text" required placeholder="Students performing on the field"></label><label>Caption<input name="caption"></label><label>Sort order<input name="sort_order" type="number" value="0"></label><button class="btn primary">Upload photo</button><p class="status" id="photo-status"></p></form><div id="photos-list" class="admin-list"></div></section>
</main><script src="/admin.js"></script></body></html>`;
