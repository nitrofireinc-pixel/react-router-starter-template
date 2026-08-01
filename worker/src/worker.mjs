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

export const DEFAULT_SPONSORS = [
  { name: 'ABC Company', address: '123 Main Street, Kernersville, NC', logo_url: '', level: 'Community Sponsor', mark_text: 'ABC', sort_order: 1, active: 1 },
  { name: 'Kernersville Music & Arts', address: 'Kernersville, NC', logo_url: '', level: 'Gold Sponsor', mark_text: 'KMA', sort_order: 2, active: 1 },
  { name: 'Eagle Financial Partners', address: 'Kernersville, NC', logo_url: '', level: 'Navy Sponsor', mark_text: 'EFP', sort_order: 3, active: 1 },
];

const SESSION_COOKIE = 'efband_session';
const TEXT = new TextEncoder();
const READ_TEXT = new TextDecoder();
const GLOBAL_PERMISSIONS = ['site', 'pages', 'sponsors', 'staff', 'users', 'events', 'photos'];
const ASSET_VERSION = 'admin-cms-20260801-19';

export const DEFAULT_STAFF = [
  { name: 'Name TBD', role: 'Band Director', bio: 'Add bio, email, or preferred contact notes here.', photo_url: '', sort_order: 1, active: 1 },
  { name: 'Name TBD', role: 'Assistant Director', bio: 'Add bio, email, or preferred contact notes here.', photo_url: '', sort_order: 2, active: 1 },
  { name: 'Name TBD', role: 'Color Guard Staff', bio: 'Add bio, email, or preferred contact notes here.', photo_url: '', sort_order: 3, active: 1 },
  { name: 'Name TBD', role: 'Percussion Staff', bio: 'Add bio, email, or preferred contact notes here.', photo_url: '', sort_order: 4, active: 1 },
];

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
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sponsors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT \'\', logo_url TEXT NOT NULL DEFAULT \'\', level TEXT NOT NULL DEFAULT \'Sponsor\', mark_text TEXT NOT NULL DEFAULT \'★\', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS staff_members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'\', bio TEXT NOT NULL DEFAULT \'\', photo_url TEXT NOT NULL DEFAULT \'\', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
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
  const sponsorCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM sponsors').first();
  if (!sponsorCount?.count) {
    await env.DB.batch(DEFAULT_SPONSORS.map((sponsor) => env.DB.prepare('INSERT INTO sponsors (name, address, logo_url, level, mark_text, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(sponsor.name, sponsor.address, sponsor.logo_url, sponsor.level, sponsor.mark_text, sponsor.sort_order, sponsor.active)));
  }
  const staffCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM staff_members').first();
  if (!staffCount?.count) {
    await env.DB.batch(DEFAULT_STAFF.map((member) => env.DB.prepare('INSERT INTO staff_members (name, role, bio, photo_url, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)').bind(member.name, member.role, member.bio, member.photo_url, member.sort_order, member.active)));
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

async function getSponsors(env, includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const rows = await env.DB.prepare(`SELECT id, name, address, logo_url, level, mark_text, sort_order, active FROM sponsors ${where} ORDER BY sort_order, id`).all();
  return rows.results || [];
}

export function normalizeSponsorPayload(payload = {}, existing = null) {
  const name = String(payload.name || existing?.name || '').trim();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word.match(/[a-z0-9]/i)?.[0]?.toUpperCase()).filter(Boolean).join('') || '★';
  return {
    name,
    address: String(payload.address ?? existing?.address ?? '').trim(),
    logo_url: String(payload.logo_url ?? existing?.logo_url ?? '').trim(),
    level: String(payload.level ?? existing?.level ?? 'Sponsor').trim() || 'Sponsor',
    mark_text: String(payload.mark_text ?? existing?.mark_text ?? initials).trim() || initials,
    sort_order: Number(payload.sort_order ?? existing?.sort_order ?? 0),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
  };
}

export function renderSponsorsDirectory(sponsors = []) {
  if (!sponsors.length) {
    return '<div class="sponsor-empty"><h3>Sponsor spots are available.</h3><p>Use the admin Sponsors page to add businesses, logos, and addresses.</p></div>';
  }
  return sponsors.map((sponsor, index) => {
    const featured = index === 0 ? ' sponsor-featured' : '';
    const logo = sponsor.logo_url
      ? `<span class="sponsor-logo"><img src="${escapeAttr(sponsor.logo_url)}" alt="${escapeAttr(sponsor.name)} logo"></span>`
      : `<span class="sponsor-mark">${escapeHtml(sponsor.mark_text || '★')}</span>`;
    return `<article class="sponsor-card${featured}" data-sponsor-id="${escapeAttr(sponsor.id || '')}">${logo}<div><span class="sponsor-level">${escapeHtml(sponsor.level || 'Sponsor')}</span><h3>${escapeHtml(sponsor.name)}</h3>${sponsor.address ? `<p>${escapeHtml(sponsor.address)}</p>` : ''}</div></article>`;
  }).join('');
}

function renderSponsorPageBody(page, sponsors) {
  const directory = `<div class="sponsor-directory" data-sponsors>${renderSponsorsDirectory(sponsors)}</div>`;
  const html = page.body_html || '';
  if (html.includes('data-sponsors')) {
    return html.replace(/<div class=\"sponsor-directory\" data-sponsors>[\s\S]*?<\/div>/, directory);
  }
  if (html.includes('class="sponsor-directory"')) {
    return html.replace(/<div class=\"sponsor-directory\">[\s\S]*?<\/div><aside class=\"sponsor-cta\">/, `${directory}<aside class="sponsor-cta">`);
  }
  return `<section class="page-hero sponsor-hero"><div class="page-title"><div class="kicker">Community Partners</div><h1>${escapeHtml(page.title || 'Sponsors')}</h1><p>Local businesses, alumni, and families make opportunities possible for every East Forsyth Band student.</p></div></section><section class="content sponsor-content"><div class="wrap"><div class="sponsor-intro"><div><div class="kicker">Thank you</div><h2>Community support takes center stage.</h2><p>Our sponsors help provide instruments, instruction, travel, meals, uniforms, and unforgettable performance opportunities.</p></div><a class="btn primary" href="contact.html">Become a sponsor</a></div>${directory}<aside class="sponsor-cta"><div><span class="sponsor-level">Sponsor opportunities</span><h2>Put your support in the spotlight.</h2><p>Ask us about sponsor levels, benefits, artwork requirements, payment instructions, and how your business can support the band.</p></div><a class="btn secondary" href="contact.html">Ask about sponsoring</a></aside></div></section>`;
}

async function getStaff(env, includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const rows = await env.DB.prepare(`SELECT id, name, role, bio, photo_url, sort_order, active FROM staff_members ${where} ORDER BY sort_order, id`).all();
  return rows.results || [];
}

export function normalizeStaffPayload(payload = {}, existing = null) {
  return {
    name: String(payload.name || existing?.name || '').trim(),
    role: String(payload.role ?? existing?.role ?? '').trim(),
    bio: String(payload.bio ?? existing?.bio ?? '').trim(),
    photo_url: String(payload.photo_url ?? existing?.photo_url ?? '').trim(),
    sort_order: Number(payload.sort_order ?? existing?.sort_order ?? 0),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
  };
}

export function renderStaffDirectory(staff = []) {
  if (!staff.length) {
    return '<div class="staff-empty"><h3>No staff listed yet.</h3><p>Use the admin Directors &amp; Staff page to add photos, names, and roles.</p></div>';
  }
  return staff.map((member) => {
    const photo = member.photo_url
      ? `<div class="avatar"><img src="${escapeAttr(member.photo_url)}" alt="${escapeAttr(member.name)}"></div>`
      : '<div class="avatar" aria-hidden="true"></div>';
    return `<article class="person" data-staff-id="${escapeAttr(member.id || '')}">${photo}<div class="person-copy"><h3>${escapeHtml(member.name)}</h3>${member.role ? `<p class="person-role">${escapeHtml(member.role)}</p>` : ''}${member.bio ? `<p>${escapeHtml(member.bio)}</p>` : ''}</div></article>`;
  }).join('');
}

function replaceMarkedDirectory(html, markerAttr, replacement) {
  const pattern = new RegExp(`<div\\b[^>]*\\b${markerAttr}\\b[^>]*>`, 'i');
  const match = pattern.exec(html);
  if (!match) return null;
  const start = match.index;
  let index = start + match[0].length;
  let depth = 1;
  while (index < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', index);
    const nextClose = html.indexOf('</div>', index);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      index = nextOpen + 4;
      continue;
    }
    depth -= 1;
    index = nextClose + 6;
    if (depth === 0) {
      return `${html.slice(0, start)}${replacement}${html.slice(index)}`;
    }
  }
  return null;
}

function renderDirectorsPageBody(page, staff) {
  const directory = `<div class="directory" data-staff>${renderStaffDirectory(staff)}</div>`;
  const html = page.body_html || '';
  if (html.includes('data-staff')) {
    return replaceMarkedDirectory(html, 'data-staff', directory) || `${html}${directory}`;
  }
  return `<section class="page-hero" data-cms-layout="directory"><div class="page-title"><div class="kicker" data-cms-field="kicker">People</div><h1 data-cms-field="heading">${escapeHtml(page.title || 'Directors & Staff')}</h1><p data-cms-field="intro">Meet the directors and staff who lead the East Forsyth Band program.</p></div></section><section class="content"><div class="wrap"><div class="card" data-cms-field="body_text"><p>Add a short welcome note for families here.</p></div>${directory}</div></section>`;
}

function renderPageBody(page, sponsors = [], staff = []) {
  if (page.slug === 'sponsors') return renderSponsorPageBody(page, sponsors);
  if (page.slug === 'directors') return renderDirectorsPageBody(page, staff);
  return page.body_html;
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

function paragraphsFromText(value) {
  return String(value || '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function looksLikeHtml(value) {
  return /<\/?[a-z][^>]*>/i.test(String(value || ''));
}

function sanitizeStyleAttribute(attrs) {
  const match = String(attrs || '').match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  if (!match) return '';
  const parts = [];
  for (const declaration of String(match[1] || match[2] || '').split(';')) {
    const [rawProp, ...rest] = declaration.split(':');
    if (!rawProp || !rest.length) continue;
    const prop = rawProp.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (prop === 'color' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(value)) {
      parts.push(`color: ${value}`);
    }
    if (prop === 'font-size' && /^[\d.]+\s*(px|em|rem|%)$/i.test(value)) {
      parts.push(`font-size: ${value}`);
    }
  }
  return parts.join('; ');
}

export function sanitizeRichHtml(dirty) {
  let html = String(dirty || '')
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

  const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'ul', 'ol', 'li']);
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag === 'span') {
      const style = sanitizeStyleAttribute(attrs);
      return style ? `<span style="${style}">` : '<span>';
    }
    return `<${tag}>`;
  });

  html = html.replace(/(?:<br>\s*){3,}/gi, '<br><br>').trim();
  if (!html) return '';
  if (!/<p[\s>]/i.test(html)) html = `<p>${html}</p>`;
  return html;
}

export function formatRichText(value, fallback = '') {
  const raw = String(value ?? '');
  const source = raw.trim() ? raw : String(fallback || '');
  if (!source.trim()) return '';
  return looksLikeHtml(source) ? sanitizeRichHtml(source) : paragraphsFromText(source);
}

function hasStructuredPageFields(payload) {
  return ['layout', 'kicker', 'heading', 'intro', 'body_text', 'callout_title', 'callout_text'].some((key) => payload[key] !== undefined);
}

export function generateStructuredPageHtml(payload = {}) {
  const layout = String(payload.layout || 'standard');
  const kicker = String(payload.kicker || 'Page');
  const heading = String(payload.heading || payload.title || 'Untitled Page');
  const intro = String(payload.intro || '');
  const body = formatRichText(payload.body_text || 'Add page information here.');
  const calloutTitle = String(payload.callout_title || '').trim();
  const calloutText = String(payload.callout_text || '').trim();
  const callout = calloutTitle || calloutText
    ? `<aside class="notice" data-cms-block="callout"><h3 data-cms-field="callout_title">${escapeHtml(calloutTitle || 'Note')}</h3><div data-cms-field="callout_text">${formatRichText(calloutText)}</div></aside>`
    : '';
  const hero = `<section class="page-hero" data-cms-layout="${escapeAttr(layout)}"><div class="page-title"><div class="kicker" data-cms-field="kicker">${escapeHtml(kicker)}</div><h1 data-cms-field="heading">${escapeHtml(heading)}</h1>${intro ? `<p data-cms-field="intro">${escapeHtml(intro)}</p>` : ''}</div></section>`;

  if (layout === 'calendar') {
    return `${hero}<section class="content soft"><div class="wrap"><div data-cms-field="body_text">${body}</div><div class="timeline" data-events></div>${callout}</div></section>`;
  }

  if (layout === 'contact') {
    return `${hero}<section class="content"><div class="wrap grid two"><article class="card" data-cms-field="body_text">${body}</article>${callout || '<article class="card accent-card"><h3>Contact details</h3><p>Add email, phone, office hours, or form instructions here.</p></article>'}</div></section>`;
  }

  if (layout === 'directory') {
    return `${hero}<section class="content"><div class="wrap"><div class="card" data-cms-field="body_text">${body}</div><div class="directory" data-staff></div>${callout}</div></section>`;
  }

  return `${hero}<section class="content"><div class="wrap"><div class="card" data-cms-field="body_text">${body}</div>${callout}</div></section>`;
}

export function serializePagePayload(payload, existing = null) {
  const slug = normalizePageSlug(payload.slug || payload.title || existing?.slug);
  const path = payload.path ? normalizeStaticPath(payload.path) : pagePathFromSlug(slug);
  const defaultHtml = '<section><div class="wrap"><h1>New Page</h1><p>Edit this page in the CMS.</p></div></section>';
  return {
    slug,
    path: slug === 'home' ? '/' : path,
    title: String(payload.title || existing?.title || 'Untitled Page').trim(),
    body_html: hasStructuredPageFields(payload) ? generateStructuredPageHtml({ title: payload.title || existing?.title, ...payload }) : String(payload.body_html ?? existing?.body_html ?? defaultHtml),
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
  if (url.pathname === '/api/sponsors' && request.method === 'GET') return jsonResponse(await getSponsors(env));
  if (url.pathname === '/api/staff' && request.method === 'GET') return jsonResponse(await getStaff(env));
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
    const username = String(payload.username || '').trim();
    const password = String(payload.password || '');
    if (!username || !password) return jsonResponse({ detail: 'Username and password are required' }, 422);
    if (password.length < 8) return jsonResponse({ detail: 'Password must be at least 8 characters' }, 422);
    const displayName = String(payload.display_name || '').trim();
    if (!displayName) return jsonResponse({ detail: 'Display name is required' }, 422);
    try {
      const result = await env.DB.prepare('INSERT INTO users (username, display_name, password_hash, role, permissions, active) VALUES (?, ?, ?, ?, ?, ?)').bind(username, displayName, await hashPassword(password), payload.role === 'admin' ? 'admin' : 'editor', JSON.stringify(parsePermissions(payload.permissions)), payload.active === false ? 0 : 1).run();
      const created = await env.DB.prepare('SELECT id, username, display_name, role, permissions, active FROM users WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(publicUser(created));
    } catch (error) {
      const message = String(error?.message || error || '');
      if (message.includes('UNIQUE') || message.includes('unique')) {
        return jsonResponse({ detail: 'A user with that username already exists' }, 409);
      }
      throw error;
    }
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
    const displayName = String(payload.display_name || '').trim();
    if (!displayName) return jsonResponse({ detail: 'Display name is required' }, 422);
    await env.DB.prepare('UPDATE users SET username = ?, display_name = ?, role = ?, permissions = ?, active = ? WHERE id = ?').bind(String(payload.username || existing.username).trim(), displayName, role, permissions, payload.active === false ? 0 : 1, id).run();
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


  if (url.pathname === '/api/admin/sponsors' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'sponsors') && !canEditPage(auth.user, 'sponsors')) return jsonResponse({ detail: 'Permission required: sponsors' }, 403);
    return jsonResponse(await getSponsors(env, true));
  }
  if (url.pathname === '/api/admin/sponsors' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'sponsors') && !canEditPage(auth.user, 'sponsors')) return jsonResponse({ detail: 'Permission required: sponsors' }, 403);
    const sponsor = normalizeSponsorPayload(await request.json());
    if (!sponsor.name) return jsonResponse({ detail: 'Sponsor name is required' }, 422);
    const result = await env.DB.prepare('INSERT INTO sponsors (name, address, logo_url, level, mark_text, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(sponsor.name, sponsor.address, sponsor.logo_url, sponsor.level, sponsor.mark_text, sponsor.sort_order, sponsor.active).run();
    return jsonResponse(await env.DB.prepare('SELECT id, name, address, logo_url, level, mark_text, sort_order, active FROM sponsors WHERE id = ?').bind(result.meta.last_row_id).first());
  }
  const sponsorMatch = url.pathname.match(/^\/api\/admin\/sponsors\/(\d+)$/);
  if (sponsorMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'sponsors') && !canEditPage(auth.user, 'sponsors')) return jsonResponse({ detail: 'Permission required: sponsors' }, 403);
    const id = Number(sponsorMatch[1]);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM sponsors WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }
    const existing = await env.DB.prepare('SELECT * FROM sponsors WHERE id = ?').bind(id).first();
    if (!existing) return jsonResponse({ detail: 'Sponsor not found' }, 404);
    const sponsor = normalizeSponsorPayload(await request.json(), existing);
    if (!sponsor.name) return jsonResponse({ detail: 'Sponsor name is required' }, 422);
    await env.DB.prepare('UPDATE sponsors SET name = ?, address = ?, logo_url = ?, level = ?, mark_text = ?, sort_order = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(sponsor.name, sponsor.address, sponsor.logo_url, sponsor.level, sponsor.mark_text, sponsor.sort_order, sponsor.active, id).run();
    return jsonResponse(await env.DB.prepare('SELECT id, name, address, logo_url, level, mark_text, sort_order, active FROM sponsors WHERE id = ?').bind(id).first());
  }

  if (url.pathname === '/api/admin/staff' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'staff') && !canEditPage(auth.user, 'directors')) return jsonResponse({ detail: 'Permission required: staff' }, 403);
    return jsonResponse(await getStaff(env, true));
  }
  if (url.pathname === '/api/admin/staff' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'staff') && !canEditPage(auth.user, 'directors')) return jsonResponse({ detail: 'Permission required: staff' }, 403);
    const member = normalizeStaffPayload(await request.json());
    if (!member.name) return jsonResponse({ detail: 'Staff name is required' }, 422);
    const result = await env.DB.prepare('INSERT INTO staff_members (name, role, bio, photo_url, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)').bind(member.name, member.role, member.bio, member.photo_url, member.sort_order, member.active).run();
    return jsonResponse(await env.DB.prepare('SELECT id, name, role, bio, photo_url, sort_order, active FROM staff_members WHERE id = ?').bind(result.meta.last_row_id).first());
  }
  const staffMatch = url.pathname.match(/^\/api\/admin\/staff\/(\d+)$/);
  if (staffMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'staff') && !canEditPage(auth.user, 'directors')) return jsonResponse({ detail: 'Permission required: staff' }, 403);
    const id = Number(staffMatch[1]);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM staff_members WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }
    const existing = await env.DB.prepare('SELECT * FROM staff_members WHERE id = ?').bind(id).first();
    if (!existing) return jsonResponse({ detail: 'Staff member not found' }, 404);
    const member = normalizeStaffPayload(await request.json(), existing);
    if (!member.name) return jsonResponse({ detail: 'Staff name is required' }, 422);
    await env.DB.prepare('UPDATE staff_members SET name = ?, role = ?, bio = ?, photo_url = ?, sort_order = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(member.name, member.role, member.bio, member.photo_url, member.sort_order, member.active, id).run();
    return jsonResponse(await env.DB.prepare('SELECT id, name, role, bio, photo_url, sort_order, active FROM staff_members WHERE id = ?').bind(id).first());
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
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const canUpload = hasPermission(auth.user, 'photos')
      || hasPermission(auth.user, 'staff')
      || canEditPage(auth.user, 'directors')
      || hasPermission(auth.user, 'site');
    if (!canUpload) return jsonResponse({ detail: 'Permission required: photos' }, 403);
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

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

async function handleLogin(request, env) {
  await initDb(env);
  if (request.method === 'GET') {
    // Already authenticated users should not stay on the login form with a live session.
    if (await currentUser(request, env)) return redirect('/admin');
    return htmlResponse(LOGIN_HTML);
  }
  const form = await request.formData();
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  const user = await getUserByUsername(env, username);
  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) {
    // Always clear any existing session on failed login so a stale cookie cannot
    // keep granting access after an invalid password attempt.
    return htmlResponse(
      LOGIN_HTML.replace('</form>', "<p class='error'>Invalid username or password.</p></form>"),
      401,
      { 'set-cookie': clearSessionCookie() },
    );
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
  response.headers.set('set-cookie', clearSessionCookie());
  return response;
}

function renderNav(pages) {
  return pages.map((page) => `<a href="${escapeAttr(page.path)}">${escapeHtml(page.title.replace(/\s*\|\s*East Forsyth Band$/, ''))}</a>`).join('');
}

function renderCmsPage(page, site, pages, sponsors = [], staff = []) {
  const title = page.is_home ? `Home | ${site.title}` : `${page.title} | ${site.title}`;
  const bodyHtml = renderPageBody(page, sponsors, staff);
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
  <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="utility"><div class="wrap"><a href="/calendar.html">Upcoming Events</a><a href="/resources.html">Student Resources</a><a href="/contact.html">Contact</a></div></div>
<header class="site-header"><div class="header-inner"><a class="brand" href="/"><img src="${escapeAttr(site.logo_url || '/assets/efhs-logo.png')}" alt="${escapeAttr(site.title)} logo"><span data-site-field="title">${escapeHtml(site.title)}</span></a><button class="menu-button" aria-expanded="false" aria-controls="site-nav">Menu</button><nav id="site-nav" aria-label="Main navigation">${renderNav(pages)}</nav></div></header>
<main id="main">${bodyHtml}</main>
<footer class="footer"><div class="wrap"><div><h3 data-site-field="title">${escapeHtml(site.title)}</h3><p data-site-field="footer_note">${escapeHtml(site.footer_note)}</p><small>School colors and imagery sourced from East Forsyth High School assets provided with permission.</small></div><div><h3>Program</h3>${pages.slice(1,4).map((p) => `<a href="${escapeAttr(p.path)}">${escapeHtml(p.title)}</a>`).join('')}</div><div><h3>Families</h3>${pages.slice(4,7).map((p) => `<a href="${escapeAttr(p.path)}">${escapeHtml(p.title)}</a>`).join('')}</div><div><h3>Community</h3><a href="/sponsors.html">Sponsors</a><a href="/contact.html">Contact</a><a href="https://www.wsfcs.k12.nc.us/o/efhs">EFHS Website</a></div></div></footer>
<script src="/script.js?v=${ASSET_VERSION}"></script><script src="/site-content.js?v=${ASSET_VERSION}"></script>
</body></html>`;
}

async function serveStaticOrCms(request, env, url) {
  await initDb(env);
  const path = url.pathname === '/' ? '/' : normalizeStaticPath(url.pathname);
  if (path === '/' || path.endsWith('.html')) {
    const page = await getPageByPath(env, path);
    if (page) {
      const sponsors = page.slug === 'sponsors' ? await getSponsors(env) : [];
      const staff = page.slug === 'directors' ? await getStaff(env) : [];
      return htmlResponse(renderCmsPage(page, await getSite(env), await getPages(env), sponsors, staff));
    }
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

const LOGIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login | East Forsyth Band</title><link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}"></head><body class="admin-body"><main class="admin-shell small"><h1>East Forsyth Band Admin</h1><p>Log in to edit assigned CMS areas.</p><form class="admin-card" method="post" action="/admin/login"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button class="btn primary" type="submit">Log in</button></form></main></body></html>`;

const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EFHS Band Admin CMS</title><link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}"></head><body class="admin-body"><main class="admin-shell cms-shell image-admin-shell">
<div class="admin-mobile-bar">
<button type="button" class="admin-nav-toggle" aria-expanded="false" aria-controls="admin-mobile-menu">Menu</button>
<nav id="admin-mobile-menu" class="admin-mobile-menu" hidden aria-label="CMS mobile navigation"></nav>
</div>
<aside id="admin-sidebar" class="admin-sidebar"><div class="admin-brand"><span class="brand-dot">EF</span><div><b>EFHS Band</b><small>Admin CMS</small></div></div><div id="current-user" class="admin-user"></div><nav class="admin-tabs admin-menu" aria-label="CMS navigation"><button type="button" data-tab="dashboard">Dashboard</button><button type="button" data-edit-shortcut="home">Home</button><button type="button" data-edit-shortcut="ensembles">Ensembles</button><button type="button" data-tab="staff">Directors & Staff</button><button type="button" data-tab="events">Calendar Events</button><button type="button" data-tab="sponsors">Sponsors</button><button type="button" data-edit-shortcut="fundraising">Fundraising</button><button type="button" data-edit-shortcut="resources">Student Resources</button><button type="button" data-edit-shortcut="boosters">Boosters</button><button type="button" data-edit-shortcut="contact">Contact</button><button type="button" data-tab="users">Users</button><button type="button" data-tab="site">Site Settings</button><button type="button" data-tab="photos">Photos</button></nav><form method="post" action="/admin/logout"><button class="admin-logout" type="submit">Log Out</button></form></aside>
<section class="admin-workspace">
<section id="tab-dashboard" class="cms-panel dashboard-panel"><div class="panel-head"><div><p class="kicker">Administration</p><h1 id="dashboard-welcome">Welcome back</h1><p>Changes save to the shared CMS database and publish to the public East Forsyth Band website.</p></div><a class="btn primary" href="/" target="_blank" rel="noreferrer">View Site</a></div><div id="dashboard-cards" class="dashboard-cards"></div></section>
<section id="tab-pages" class="cms-panel editor-panel"><div class="panel-head"><div><p class="kicker">Website Pages</p><h1 data-page-editor-title>Select a page to edit</h1><p>Click text in the live preview to edit it in place, then save to publish.</p></div><button class="btn outline" type="button" id="new-page" hidden>Add Page</button></div><div class="editor-layout page-visual-layout"><div class="page-canvas-shell"><div class="page-canvas-toolbar"><div><strong>Live page preview</strong><small>Click a text block to edit · Tab between blocks · Save publishes to the site</small></div><span class="page-canvas-chip" data-page-layout-chip>Standard layout</span></div><div id="rich-text-toolbar" class="rich-text-toolbar" hidden><button type="button" data-rich="bold" title="Bold"><b>B</b></button><button type="button" data-rich="italic" title="Italic"><i>I</i></button><button type="button" data-rich="underline" title="Underline"><u>U</u></button><label class="rich-color" title="Text color"><span>Color</span><input type="color" id="rich-text-color" value="#002142"></label><label class="rich-size" title="Font size"><span>Size</span><select id="rich-text-size"><option value="">Normal</option><option value="14px">Small</option><option value="18px">Medium</option><option value="22px">Large</option><option value="28px">Extra large</option></select></label></div><div id="page-preview" class="page-preview" hidden aria-label="Editable page preview"></div><div class="page-preview-empty" data-page-preview-empty><p class="kicker">Visual editor</p><h2>Choose a page to begin</h2><p>Open any page from the left menu. The preview matches the public layout and stays editable like Squarespace or Drupal.</p></div></div><form id="page-form" class="admin-card stack page-settings-card" hidden><h2>Page settings</h2><p class="notice" data-calendar-hint hidden>The Calendar page text controls the header/instructions. Events are managed in the Calendar Events tab.</p><p class="notice" data-home-hint hidden>The homepage hero headline is in Site Settings. These fields control the rest of the homepage content.</p><input type="hidden" name="original_slug"><div class="form-grid page-meta-grid"><label>Page title<input name="title" required></label><label>Slug<input name="slug" placeholder="booster-info" required></label><label>Path<input name="path" placeholder="/booster-info.html"></label><label>Navigation order<input name="nav_order" type="number" value="99"></label><label class="full">Page layout<select name="layout"><option value="standard">Standard information page</option><option value="calendar">Calendar page with event list</option><option value="contact">Contact/details page</option><option value="directory">Directors &amp; staff directory</option></select></label></div><label class="checkline page-active-line"><input name="active" type="checkbox" checked> Active / visible on the public site</label><details class="page-text-fields"><summary>Text fields (advanced)</summary><div class="form-grid"><label>Small label above heading<input name="kicker" placeholder="Families"></label><label>Page heading<input name="heading" required placeholder="Sound. Spirit. Eagle Pride."></label><label class="full">Intro sentence<textarea name="intro" rows="3" placeholder="Short summary shown under the page heading."></textarea></label><label class="full">Content<textarea name="body_text" rows="8" placeholder="Use normal text. Blank lines become separate paragraphs."></textarea></label><label>Optional callout title<input name="callout_title" placeholder="Need forms?"></label><label class="full">Optional callout text<textarea name="callout_text" rows="4" placeholder="Important note, contact instructions, deadlines, etc."></textarea></label></div></details><div class="page-settings-actions"><button class="btn primary" type="submit">Save Changes</button><button class="btn outline" type="button" id="add-page-callout">Add callout</button></div><p class="status" id="page-status"></p></form></div></section>
<section id="tab-staff" class="cms-panel staff-panel"><div class="panel-head"><div><p class="kicker">People</p><h1>Directors &amp; Staff</h1><p>Add a photo, name, role, and short description for each staff member.</p></div><div class="panel-actions"><button class="btn outline" type="button" id="edit-directors-page">Edit page text</button><button class="btn primary" type="button" id="new-staff">Add Staff Member</button></div></div><div class="editor-layout"><form id="staff-form" class="admin-card stack"><input type="hidden" name="staff_id" value=""><div class="form-grid"><label>Name<input name="name" required placeholder="Jordan Smith"></label><label>Role / title<input name="role" placeholder="Band Director"></label><label class="full">Short description<textarea name="bio" rows="3" placeholder="Email, office hours, or a short bio."></textarea></label><label class="full">Photo URL<input name="photo_url" placeholder="/uploads/director.jpg or https://..."></label><label class="full">Upload photo<input name="photo_file" type="file" accept="image/*"></label><label>Sort order<input name="sort_order" type="number" value="1"></label><label class="checkline"><input name="active" type="checkbox" checked> Show on Directors &amp; Staff page</label></div><button class="btn primary">Save Staff Member</button><p class="status" id="staff-status"></p></form><div><div id="staff-list" class="admin-list staff-list"></div><div class="live-preview staff-live-preview"><span>Live Preview</span><div id="staff-preview" class="directory"></div></div></div></div></section>
<section id="tab-sponsors" class="cms-panel sponsors-panel"><div class="panel-head"><div><p class="kicker">Community</p><h1>Sponsors</h1><p>Add sponsors with a logo, name, and address. Use arrows to reorder rows.</p></div><button class="btn primary" type="button" id="new-sponsor">Add Sponsor</button></div><div class="editor-layout"><form id="sponsor-form" class="admin-card stack"><input type="hidden" name="id"><div class="form-grid"><label>Sponsor name<input name="name" required placeholder="ABC Company"></label><label>Sponsor level<input name="level" value="Community Sponsor"></label><label class="full">Address<input name="address" placeholder="Kernersville, NC"></label><label class="full">Logo URL<input name="logo_url" placeholder="https://example.com/logo.png or /uploads/logo.png"></label><label>Fallback logo text<input name="mark_text" placeholder="ABC"></label><label>Sort order<input name="sort_order" type="number" value="1"></label><label class="checkline"><input name="active" type="checkbox" checked> Show on public Sponsors page</label></div><button class="btn primary">Save Sponsor</button><p class="status" id="sponsor-status"></p></form><div><div id="sponsors-list" class="admin-list sponsor-list"></div><div class="live-preview"><span>Live Preview</span><div id="sponsor-preview" class="sponsor-directory"></div></div></div></div></section>
<section id="tab-site" class="cms-panel"><div class="panel-head"><div><p class="kicker">Site Settings</p><h1>Home, title, logo, footer</h1></div></div><div class="editor-layout"><form id="site-form" class="admin-card stack"><label>Site title<input name="title" required></label><label>Hero title<input name="hero_title" required></label><label>Hero subtitle<textarea name="hero_subtitle" required rows="4"></textarea></label><label>Footer note<textarea name="footer_note" required rows="3"></textarea></label><label>Logo URL<input name="logo_url" required></label><button class="btn primary">Save site settings</button><p class="status" id="site-status"></p></form><form id="logo-form" class="admin-card stack"><h2>Upload new logo</h2><label>Logo file<input name="file" type="file" accept="image/*,.svg" required></label><button class="btn secondary">Upload logo</button><p class="status" id="logo-status"></p></form></div></section>
<section id="tab-users" class="cms-panel"><div class="panel-head"><div><p class="kicker">Administration</p><h1>User Management</h1><p>Invite a new editor, then assign global and page-level permissions.</p></div></div><div class="editor-layout"><form id="user-form" class="admin-card stack"><h2>Invite New User</h2><input type="hidden" name="id"><label>Email / Username<input name="username" type="text" required autocomplete="username" placeholder="editor@example.com"></label><label>Display name<input name="display_name" required placeholder="Full name"></label><label>Temporary password <small>required for new users (min 8 chars), optional when editing</small><input name="password" type="password" autocomplete="new-password" minlength="8"></label><label>Role<select name="role"><option value="editor">Editor</option><option value="admin">Super Admin - all permissions</option></select></label><label class="checkline"><input name="active" type="checkbox" checked> Active</label><fieldset><legend>Global permissions</legend><label class="checkline"><input type="checkbox" name="permissions" value="site"> Site settings, home text, logo</label><label class="checkline"><input type="checkbox" name="permissions" value="pages"> Add/remove/manage all pages</label><label class="checkline"><input type="checkbox" name="permissions" value="sponsors"> Manage sponsors</label><label class="checkline"><input type="checkbox" name="permissions" value="staff"> Manage directors &amp; staff</label><label class="checkline"><input type="checkbox" name="permissions" value="users"> Manage users</label><label class="checkline"><input type="checkbox" name="permissions" value="events"> Add/edit calendar events only</label><label class="checkline"><input type="checkbox" name="permissions" value="photos"> Upload/delete photos</label></fieldset><fieldset><legend>Page edit permissions</legend><div id="page-permission-boxes"></div></fieldset><button class="btn primary">Send Invite / Save User</button><button class="btn outline" type="button" id="new-user">New user</button><p class="status" id="user-status"></p></form><div class="admin-card"><h2>Team Members</h2><div id="users-list" class="admin-list"></div></div></div></section>
<section id="tab-events" class="cms-panel"><div class="panel-head"><div><p class="kicker">Program</p><h1>Calendar Events</h1><p>Add calendar items with dropdowns for month and day.</p></div><div class="panel-actions"><button class="btn outline" type="button" id="edit-calendar-page" hidden>Edit Calendar page</button><button class="btn outline" type="button" id="new-event">New event</button></div></div><div class="editor-layout"><form id="event-form" class="admin-card stack"><input type="hidden" name="id"><label>Month<select name="date_label" required><option value="Jan">Jan</option><option value="Feb">Feb</option><option value="Mar">Mar</option><option value="Apr">Apr</option><option value="May">May</option><option value="Jun">Jun</option><option value="Jul">Jul</option><option value="Aug" selected>Aug</option><option value="Sep">Sep</option><option value="Oct">Oct</option><option value="Nov">Nov</option><option value="Dec">Dec</option><option value="Spring">Spring</option><option value="Summer">Summer</option><option value="Fall">Fall</option><option value="Winter">Winter</option><option value="TBD">TBD</option></select></label><label>Day / detail<select name="date_detail" required><option value="TBD">TBD</option><option value="01" selected>01</option><option value="02">02</option><option value="03">03</option><option value="04">04</option><option value="05">05</option><option value="06">06</option><option value="07">07</option><option value="08">08</option><option value="09">09</option><option value="10">10</option><option value="11">11</option><option value="12">12</option><option value="13">13</option><option value="14">14</option><option value="15">15</option><option value="16">16</option><option value="17">17</option><option value="18">18</option><option value="19">19</option><option value="20">20</option><option value="21">21</option><option value="22">22</option><option value="23">23</option><option value="24">24</option><option value="25">25</option><option value="26">26</option><option value="27">27</option><option value="28">28</option><option value="29">29</option><option value="30">30</option><option value="31">31</option><option value="MON">MON</option><option value="TUE">TUE</option><option value="WED">WED</option><option value="THU">THU</option><option value="FRI">FRI</option><option value="SAT">SAT</option><option value="SUN">SUN</option></select></label><label>Title<input name="title" required></label><label>Description<textarea name="description" rows="4" required></textarea></label><label>Sort order<input name="sort_order" type="number" value="0"></label><button class="btn primary">Save event</button></form><div id="events-list" class="admin-list"></div></div></section>
<section id="tab-photos" class="cms-panel"><div class="panel-head"><div><p class="kicker">Media</p><h1>Photo gallery</h1></div></div><form id="photo-form" class="admin-card stack"><label>Photo<input name="file" type="file" accept="image/*" required></label><label>Alt text<input name="alt_text" required placeholder="Students performing on the field"></label><label>Caption<input name="caption"></label><label>Sort order<input name="sort_order" type="number" value="0"></label><button class="btn primary">Upload photo</button><p class="status" id="photo-status"></p></form><div id="photos-list" class="admin-list"></div></section>
</section></main><script src="/admin.js?v=${ASSET_VERSION}"></script></body></html>`;
