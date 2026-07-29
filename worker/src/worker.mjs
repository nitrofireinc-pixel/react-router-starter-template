export const DEFAULT_SITE = {
  title: 'East Forsyth Band',
  hero_title: 'Sound. Spirit. Eagle Pride.',
  hero_subtitle: 'A polished home for the East Forsyth Band program — built for students, families, alumni, sponsors, and the Kernersville community.',
  footer_note: 'Draft website for the East Forsyth High School band program. Replace placeholder copy with official program details before launch.',
};

export const DEFAULT_EVENTS = [
  ['Aug', '01', 'Band Camp / Preseason Prep', 'Placeholder: add official summer band camp dates, times, and location.', 1],
  ['Aug', 'TBD', 'Parent Preview Night', 'Placeholder: add location and what families should bring.', 2],
  ['Sep', 'FRI', 'Football Game Performance', 'Placeholder: add football schedule and call times when available.', 3],
  ['Oct', 'TBD', 'Marching Competition', 'Placeholder: add itinerary, address, ticket info, and volunteer needs.', 4],
];

const SESSION_COOKIE = 'efband_session';
const TEXT = new TextEncoder();

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function normalizeStaticPath(pathname) {
  if (pathname === '/') return '/index.html';
  if (pathname.includes('..')) return '/index.html';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
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

async function makeSession(username, env) {
  const payload = base64Url(TEXT.encode(JSON.stringify({ u: username, t: Math.floor(Date.now() / 1000) })));
  return `${payload}.${await hmacSign(payload, sessionSecret(env))}`;
}

async function verifySession(request, env) {
  const value = getCookie(request, SESSION_COOKIE);
  if (!value || !value.includes('.')) return false;
  const [payload, supplied] = value.split('.');
  const expected = await hmacSign(payload, sessionSecret(env));
  if (supplied !== expected) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return data.u === adminUsername(env);
  } catch {
    return false;
  }
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
  const iterations = 260000;
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
  ]);
  const siteCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM site_content').first();
  if (!siteCount?.count) {
    const inserts = Object.entries(DEFAULT_SITE).map(([key, value]) => env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?)').bind(key, value));
    await env.DB.batch(inserts);
  }
  const eventCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM events').first();
  if (!eventCount?.count) {
    await env.DB.batch(DEFAULT_EVENTS.map((event) => env.DB.prepare('INSERT INTO events (date_label, date_detail, title, description, sort_order) VALUES (?, ?, ?, ?, ?)').bind(...event)));
  }
  const passwordCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_settings WHERE key = 'admin_password_hash'").first();
  if (!passwordCount?.count) {
    await env.DB.prepare("INSERT INTO auth_settings (key, value) VALUES ('admin_password_hash', ?)").bind(await hashPassword(initialAdminPassword(env))).run();
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

async function verifyAdminPassword(env, password) {
  const row = await env.DB.prepare("SELECT value FROM auth_settings WHERE key = 'admin_password_hash'").first();
  return row ? verifyPassword(password, row.value) : false;
}

async function requireAdmin(request, env) {
  if (!(await verifySession(request, env))) return jsonResponse({ detail: 'Admin login required' }, 401);
  return null;
}

async function updatePassword(env, newPassword) {
  await env.DB.prepare("INSERT INTO auth_settings (key, value) VALUES ('admin_password_hash', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(await hashPassword(newPassword)).run();
}

async function handleApi(request, env, url) {
  await initDb(env);
  if (url.pathname === '/health') return jsonResponse({ ok: true });
  if (url.pathname === '/api/site' && request.method === 'GET') return jsonResponse(await getSite(env));
  if (url.pathname === '/api/events' && request.method === 'GET') return jsonResponse(await getEvents(env));
  if (url.pathname === '/api/photos' && request.method === 'GET') return jsonResponse(await getPhotos(env));

  if (url.pathname.startsWith('/api/admin/')) {
    const denied = await requireAdmin(request, env);
    if (denied) return denied;
  }

  if (url.pathname === '/api/admin/site' && request.method === 'POST') {
    const payload = await request.json();
    for (const key of ['title', 'hero_title', 'hero_subtitle', 'footer_note']) {
      if (typeof payload[key] !== 'string' || !payload[key].trim()) return jsonResponse({ detail: `${key} is required` }, 422);
      await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, payload[key]).run();
    }
    return jsonResponse(await getSite(env));
  }

  if (url.pathname === '/api/admin/password' && request.method === 'POST') {
    const payload = await request.json();
    if (!(await verifyAdminPassword(env, payload.current_password || ''))) return jsonResponse({ detail: 'Current password is incorrect' }, 400);
    if (!payload.new_password || payload.new_password.length < 8) return jsonResponse({ detail: 'New password must be at least 8 characters' }, 422);
    await updatePassword(env, payload.new_password);
    return jsonResponse({ ok: true });
  }

  if (url.pathname === '/api/admin/events' && request.method === 'POST') {
    const p = await request.json();
    const result = await env.DB.prepare('INSERT INTO events (date_label, date_detail, title, description, sort_order) VALUES (?, ?, ?, ?, ?)').bind(p.date_label, p.date_detail, p.title, p.description, Number(p.sort_order || 0)).run();
    return jsonResponse(await env.DB.prepare('SELECT id, date_label, date_detail, title, description, sort_order FROM events WHERE id = ?').bind(result.meta.last_row_id).first());
  }

  const eventMatch = url.pathname.match(/^\/api\/admin\/events\/(\d+)$/);
  if (eventMatch && request.method === 'PUT') {
    const id = Number(eventMatch[1]);
    const p = await request.json();
    await env.DB.prepare('UPDATE events SET date_label = ?, date_detail = ?, title = ?, description = ?, sort_order = ? WHERE id = ?').bind(p.date_label, p.date_detail, p.title, p.description, Number(p.sort_order || 0), id).run();
    return jsonResponse(await env.DB.prepare('SELECT id, date_label, date_detail, title, description, sort_order FROM events WHERE id = ?').bind(id).first());
  }
  if (eventMatch && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(Number(eventMatch[1])).run();
    return jsonResponse({ ok: true });
  }

  if (url.pathname === '/api/admin/photos' && request.method === 'POST') {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return jsonResponse({ detail: 'Photo file is required' }, 400);
    const originalName = file.name || 'photo';
    const ext = (originalName.match(/\.[a-z0-9]+$/i)?.[0] || '.bin').toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return jsonResponse({ detail: 'Upload a JPG, PNG, WEBP, or GIF image' }, 400);
    const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const dataBase64 = arrayBufferToBase64(await file.arrayBuffer());
    const result = await env.DB.prepare('INSERT INTO photos (filename, original_name, alt_text, caption, sort_order, content_type, data_base64) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(filename, originalName, String(form.get('alt_text') || ''), String(form.get('caption') || ''), Number(form.get('sort_order') || 0), file.type || 'application/octet-stream', dataBase64).run();
    return jsonResponse({ id: result.meta.last_row_id, filename, original_name: originalName, alt_text: String(form.get('alt_text') || ''), caption: String(form.get('caption') || ''), sort_order: Number(form.get('sort_order') || 0), url: `/uploads/${encodeURIComponent(filename)}` });
  }

  const photoMatch = url.pathname.match(/^\/api\/admin\/photos\/(\d+)$/);
  if (photoMatch && request.method === 'DELETE') {
    const row = await env.DB.prepare('SELECT filename FROM photos WHERE id = ?').bind(Number(photoMatch[1])).first();
    await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(Number(photoMatch[1])).run();
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ detail: 'Not found' }, 404);
}

async function handleUploadGet(env, url) {
  const key = decodeURIComponent(url.pathname.replace('/uploads/', ''));
  const row = await env.DB.prepare('SELECT content_type, data_base64 FROM photos WHERE filename = ?').bind(key).first();
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(base64ToArrayBuffer(row.data_base64), { headers: { 'content-type': row.content_type || 'application/octet-stream', 'cache-control': 'public, max-age=3600' } });
}

async function handleLogin(request, env) {
  await initDb(env);
  if (request.method === 'GET') return htmlResponse(LOGIN_HTML);
  const form = await request.formData();
  const username = String(form.get('username') || '');
  const password = String(form.get('password') || '');
  if (username !== adminUsername(env) || !(await verifyAdminPassword(env, password))) {
    return htmlResponse(LOGIN_HTML.replace('</form>', "<p class='error'>Invalid username or password.</p></form>"), 401);
  }
  const response = redirect('/admin');
  response.headers.set('set-cookie', `${SESSION_COOKIE}=${await makeSession(username, env)}; HttpOnly; Secure; SameSite=Lax; Path=/`);
  return response;
}

async function handleAdmin(request, env) {
  await initDb(env);
  if (!(await verifySession(request, env))) return redirect('/admin/login');
  return htmlResponse(ADMIN_HTML);
}

function logout() {
  const response = redirect('/admin/login');
  response.headers.set('set-cookie', `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  return response;
}

async function serveStatic(request, env, url) {
  const path = normalizeStaticPath(url.pathname);
  const assetUrl = new URL(request.url);
  assetUrl.pathname = path;
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
    return serveStatic(request, env, url);
  },
};

const LOGIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login | East Forsyth Band</title><link rel="stylesheet" href="/styles.css"></head>
<body class="admin-body"><main class="admin-shell small"><h1>East Forsyth Band Admin</h1><p>Log in to edit website information, events, and photos.</p><form class="admin-card" method="post" action="/admin/login"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button class="btn primary" type="submit">Log in</button></form></main></body></html>`;

const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website Admin | East Forsyth Band</title><link rel="stylesheet" href="/styles.css"></head>
<body class="admin-body"><main class="admin-shell"><div class="admin-top"><div><p class="kicker">Custom backend</p><h1>Website Admin</h1><p>Edit the public site without touching code.</p></div><form method="post" action="/admin/logout"><button class="btn secondary">Log out</button></form></div>
<section class="admin-grid"><form id="site-form" class="admin-card"><h2>Site text</h2><label>Site title<input name="title" required></label><label>Hero title<input name="hero_title" required></label><label>Hero subtitle<textarea name="hero_subtitle" required rows="4"></textarea></label><label>Footer note<textarea name="footer_note" required rows="3"></textarea></label><button class="btn primary">Save site text</button><p class="status" id="site-status"></p></form>
<form id="password-form" class="admin-card"><h2>Change password</h2><p>Use this after logging in to replace the temporary password.</p><label>Current password<input name="current_password" type="password" required autocomplete="current-password"></label><label>New password<input name="new_password" type="password" required minlength="8" autocomplete="new-password"></label><button class="btn primary">Update password</button><p class="status" id="password-status"></p></form>
<div class="admin-card"><h2>Events</h2><form id="event-form" class="stack"><input type="hidden" name="id"><label>Month / label<input name="date_label" placeholder="Aug" required></label><label>Day / detail<input name="date_detail" placeholder="01 or TBD" required></label><label>Event title<input name="title" required></label><label>Description<textarea name="description" rows="3" required></textarea></label><label>Sort order<input name="sort_order" type="number" value="0"></label><button class="btn primary">Save event</button><button class="btn outline" type="button" id="new-event">New event</button></form><div id="events-list" class="admin-list"></div></div>
<div class="admin-card"><h2>Photos</h2><form id="photo-form" class="stack"><label>Photo<input name="file" type="file" accept="image/*" required></label><label>Alt text<input name="alt_text" required placeholder="Students performing on the field"></label><label>Caption<input name="caption"></label><label>Sort order<input name="sort_order" type="number" value="0"></label><button class="btn primary">Upload photo</button></form><div id="photos-list" class="admin-list"></div></div></section></main><script src="/admin.js"></script></body></html>`;
