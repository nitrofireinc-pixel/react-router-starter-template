/**
 * Join-the-Band visual editor pilot (GrapesJS).
 * Publish writes sanitized HTML onto cms_pages.body_html so the public
 * join page stays on the existing single cached page read.
 */

export const VISUAL_PILOT_SLUG = 'join';
export const VISUAL_PILOT_PATH = '/join.html';
export const VISUAL_VERSION_LIMIT = 8;
export const VISUAL_EDITOR_PATH = '/admin/visual/join';

export function isVisualPilotSlug(slug = '') {
  return String(slug || '').trim().toLowerCase() === VISUAL_PILOT_SLUG;
}

export function canEditVisualPilot(user, canEditPage) {
  if (!user) return false;
  if (typeof canEditPage === 'function') return Boolean(canEditPage(user, VISUAL_PILOT_SLUG));
  return false;
}

const ALLOWED_TAGS = new Set([
  'section', 'article', 'aside', 'div', 'p', 'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'a', 'img', 'strong', 'b', 'em', 'i', 'u', 'br',
  'span', 'details', 'summary', 'figure', 'figcaption', 'header',
  'small', 'blockquote',
]);

const VOID_TAGS = new Set(['br', 'img']);

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isSafeVisualImageSrc(src = '') {
  const value = String(src || '').trim();
  if (!value) return false;
  if (/^(javascript:|data:|blob:)/i.test(value)) return false;
  return value.startsWith('/uploads/') || value.startsWith('/assets/');
}

export function isSafeVisualHref(href = '') {
  const value = String(href || '').trim();
  if (!value || /^(javascript:|data:|blob:)/i.test(value)) return false;
  return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(value);
}

function sanitizeClassName(value = '') {
  return String(value || '')
    .split(/\s+/)
    .filter((part) => /^[a-zA-Z][a-zA-Z0-9_-]{0,60}$/.test(part))
    .filter((part) => !/^gjs-/i.test(part))
    .slice(0, 16)
    .join(' ');
}

const SAFE_LENGTH = /^[-+]?\d*\.?\d+\s*(px|em|rem|%|vh|vw)$/i;
const SAFE_BOX = /^(0|auto|[-+]?\d*\.?\d+\s*(px|em|rem|%|vh|vw))(\s+(0|auto|[-+]?\d*\.?\d+\s*(px|em|rem|%|vh|vw))){0,3}$/i;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
const STYLEABLE_TAGS = new Set([
  'section', 'article', 'aside', 'div', 'p', 'span', 'header', 'figure',
  'img', 'a', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'details',
]);

function sanitizeStyle(value = '') {
  const parts = [];
  for (const declaration of String(value || '').split(';')) {
    const [rawProp, ...rest] = declaration.split(':');
    if (!rawProp || !rest.length) continue;
    const prop = rawProp.trim().toLowerCase();
    const next = rest.join(':').trim();
    if (!next || /expression|javascript:|url\s*\(/i.test(next)) continue;
    if (prop === 'color' && SAFE_COLOR.test(next)) parts.push(`color: ${next}`);
    if (prop === 'background-color' && SAFE_COLOR.test(next)) parts.push(`background-color: ${next}`);
    if (prop === 'font-size' && SAFE_LENGTH.test(next)) parts.push(`font-size: ${next}`);
    if (prop === 'font-weight' && /^(normal|bold|[1-9]00)$/i.test(next)) parts.push(`font-weight: ${next}`);
    if (prop === 'text-align' && /^(left|right|center|justify)$/i.test(next)) parts.push(`text-align: ${next}`);
    if (['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height'].includes(prop)
      && (SAFE_LENGTH.test(next) || next === 'auto')) {
      parts.push(`${prop}: ${next}`);
    }
    if (['margin', 'padding'].includes(prop) && SAFE_BOX.test(next)) parts.push(`${prop}: ${next}`);
    if (/^(margin|padding)-(top|right|bottom|left)$/.test(prop)
      && (SAFE_LENGTH.test(next) || next === 'auto' || next === '0')) {
      parts.push(`${prop}: ${next}`);
    }
    if (['top', 'right', 'bottom', 'left'].includes(prop)
      && (SAFE_LENGTH.test(next) || next === 'auto')) {
      parts.push(`${prop}: ${next}`);
    }
    if (prop === 'position' && /^(static|relative|absolute)$/i.test(next)) parts.push(`position: ${next}`);
    if (prop === 'display' && /^(block|inline|inline-block|flex|none)$/i.test(next)) parts.push(`display: ${next}`);
    if (prop === 'flex-direction' && /^(row|column)$/i.test(next)) parts.push(`flex-direction: ${next}`);
    if (prop === 'justify-content' && /^(flex-start|flex-end|center|space-between|space-around)$/i.test(next)) {
      parts.push(`justify-content: ${next}`);
    }
    if (prop === 'align-items' && /^(stretch|flex-start|flex-end|center)$/i.test(next)) parts.push(`align-items: ${next}`);
    if (prop === 'gap' && SAFE_LENGTH.test(next)) parts.push(`gap: ${next}`);
    if (prop === 'object-fit' && /^(contain|cover|fill|none)$/i.test(next)) parts.push(`object-fit: ${next}`);
    if (prop === 'border-radius' && SAFE_BOX.test(next)) parts.push(`border-radius: ${next}`);
    if (prop === 'transform' && /^translate\(\s*[-+]?\d*\.?\d+(px|%)\s*,\s*[-+]?\d*\.?\d+(px|%)\s*\)$/i.test(next)) {
      parts.push(`transform: ${next}`);
    }
  }
  return parts.join('; ');
}

function attr(name, value) {
  return ` ${name}="${escapeAttr(value)}"`;
}

function rewriteOpenTag(tag, rawAttrs) {
  const attrs = String(rawAttrs || '');
  if (tag === 'br') return '<br>';
  if (tag === 'img') {
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const src = srcMatch?.[1] || srcMatch?.[2] || '';
    if (!isSafeVisualImageSrc(src)) return '';
    const altMatch = attrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const alt = altMatch?.[1] || altMatch?.[2] || 'Photo';
    const className = sanitizeClassName((attrs.match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || [])[1] || '');
    const style = sanitizeStyle((attrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || [])[1] || '');
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${className ? attr('class', className) : ''}${style ? attr('style', style) : ''}>`;
  }
  let open = `<${tag}`;
  const className = sanitizeClassName((attrs.match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || [])[1] || '');
  if (className) open += attr('class', className);
  const block = String((attrs.match(/\bdata-visual-block\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || [])[1] || '');
  if (block && /^[a-z0-9-]{1,32}$/i.test(block)) open += attr('data-visual-block', block);
  if (tag === 'a') {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const href = hrefMatch?.[1] || hrefMatch?.[2] || '';
    if (!isSafeVisualHref(href)) return '';
    open += attr('href', href);
    const targetMatch = attrs.match(/\btarget\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const target = targetMatch?.[1] || targetMatch?.[2] || '';
    if (target === '_blank') open += ' target="_blank" rel="noopener noreferrer"';
  }
  const style = sanitizeStyle((attrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || [])[1] || '');
  if (style && STYLEABLE_TAGS.has(tag)) {
    open += attr('style', style);
  }
  if (tag === 'details' && /\bopen\b/i.test(attrs)) open += ' open';
  return `${open}>`;
}

export function sanitizeVisualPageHtml(dirty = '') {
  let html = String(dirty || '')
    .replace(/<(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select|svg)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select|svg)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (match.startsWith('</')) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;
    return rewriteOpenTag(tag, attrs);
  });
  html = html
    .replace(/(?:<br>\s*){3,}/gi, '<br><br>')
    .replace(/\u0000/g, '')
    .trim();
  return html;
}

export function defaultJoinVisualHtml() {
  return `<section class="page-hero" data-visual-block="hero"><div class="page-title"><div class="coming-soon-logos"><img src="/assets/efhs-logo.png" alt="East Forsyth High School Eagles logo"><img src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment logo"></div><div class="kicker">Join</div><h1>Join the Band</h1><p>New students and families start here. Interest forms, handbook, and fee details will live on this page.</p></div></section><section class="content"><div class="wrap visual-join-wrap"><aside class="hero-card" data-visual-block="hero-card"><img src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment"><h2>What to bring</h2><ul><li>Student name and grade</li><li>Instrument experience, if any</li><li>A parent or guardian contact</li></ul></aside><div class="card" data-visual-block="text"><h2>How to get started</h2><p>Call the band office at <a href="tel:3367036735">(336) 703-6735</a> or send a message through the contact form. We will help you find the right ensemble.</p><p><a class="btn gold" href="/contact.html">Contact the band</a></p></div><details class="visual-accordion" data-visual-block="accordion"><summary>Do I need my own instrument?</summary><div class="visual-accordion-body"><p>Ask the directors. The program can often help with school-owned instruments.</p></div></details></div></section>`;
}

export function extractEditableJoinHtml(html = '') {
  const source = String(html || '');
  const mainMatch = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[1];
  return source
    .replace(/<header\b[^>]*class="[^"]*\bsite-header\b[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[^>]*class="[^"]*\bfooter\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<div\b[^>]*class="[^"]*\butility\b[\s\S]*?<\/div>/gi, '');
}

export function normalizeVisualSavePayload(raw = {}, existingHtml = '') {
  const action = String(raw.action || raw.kind || 'draft').toLowerCase() === 'publish' ? 'publish' : 'draft';
  const html = sanitizeVisualPageHtml(extractEditableJoinHtml(raw.html ?? raw.body_html ?? existingHtml));
  if (!html) return { ok: false, status: 422, detail: 'Page content is required' };
  return { ok: true, action, html };
}

export function trimVisualVersions(rows = [], limit = VISUAL_VERSION_LIMIT) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length <= limit) return { keep: list, dropIds: [] };
  const keep = list.slice(0, limit);
  const dropIds = list.slice(limit).map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  return { keep, dropIds };
}

let visualSchemaReady = false;
let visualSchemaPromise = null;

export function resetVisualPagesSchemaCache() {
  visualSchemaReady = false;
  visualSchemaPromise = null;
}

export async function ensureVisualPagesSchema(env) {
  if (visualSchemaReady) return;
  if (!visualSchemaPromise) {
    visualSchemaPromise = (async () => {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS visual_pages (
          slug TEXT PRIMARY KEY,
          draft_html TEXT NOT NULL DEFAULT '',
          published_html TEXT NOT NULL DEFAULT '',
          published_at TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_by INTEGER
        )
      `).run();
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS visual_page_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'draft',
          html TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_by INTEGER,
          created_by_name TEXT NOT NULL DEFAULT ''
        )
      `).run();
      await env.DB.prepare(
        'CREATE INDEX IF NOT EXISTS idx_visual_page_versions_slug ON visual_page_versions (slug, id)',
      ).run();
      visualSchemaReady = true;
    })()
      .catch((error) => {
        visualSchemaReady = false;
        throw error;
      })
      .finally(() => {
        visualSchemaPromise = null;
      });
  }
  await visualSchemaPromise;
}

export async function loadVisualPageState(env, slug = VISUAL_PILOT_SLUG) {
  if (!isVisualPilotSlug(slug)) return null;
  await ensureVisualPagesSchema(env);
  const page = await env.DB.prepare(
    'SELECT slug, draft_html, published_html, published_at, updated_at FROM visual_pages WHERE slug = ?',
  ).bind(VISUAL_PILOT_SLUG).first();
  const cms = await env.DB.prepare(
    'SELECT title, body_html FROM cms_pages WHERE slug = ?',
  ).bind(VISUAL_PILOT_SLUG).first();
  const versions = await env.DB.prepare(
    'SELECT id, kind, created_at, created_by_name FROM visual_page_versions WHERE slug = ? ORDER BY id DESC LIMIT 20',
  ).bind(VISUAL_PILOT_SLUG).all();
  const starter = defaultJoinVisualHtml();
  const draft = sanitizeVisualPageHtml(page?.draft_html || cms?.body_html || starter) || starter;
  const published = sanitizeVisualPageHtml(page?.published_html || '') || '';
  return {
    slug: VISUAL_PILOT_SLUG,
    path: VISUAL_PILOT_PATH,
    title: cms?.title || 'Join the Band',
    draft_html: draft,
    published_html: published,
    published_at: page?.published_at || null,
    updated_at: page?.updated_at || null,
    versions: (versions?.results || []).map((row) => ({
      id: row.id,
      kind: row.kind,
      created_at: row.created_at,
      created_by_name: row.created_by_name || '',
    })),
  };
}

export async function saveVisualPage(env, {
  html,
  action = 'draft',
  user = null,
} = {}) {
  await ensureVisualPagesSchema(env);
  const clean = sanitizeVisualPageHtml(html);
  if (!clean) throw new Error('Page content is required');
  const kind = action === 'publish' ? 'publish' : 'draft';
  const actorId = Number(user?.id) || null;
  const actorName = String(user?.display_name || user?.username || '').trim();
  const existing = await env.DB.prepare('SELECT slug FROM visual_pages WHERE slug = ?').bind(VISUAL_PILOT_SLUG).first();
  if (existing) {
    if (kind === 'publish') {
      await env.DB.prepare(`
        UPDATE visual_pages
        SET draft_html = ?, published_html = ?, published_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE slug = ?
      `).bind(clean, clean, actorId, VISUAL_PILOT_SLUG).run();
    } else {
      await env.DB.prepare(`
        UPDATE visual_pages
        SET draft_html = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE slug = ?
      `).bind(clean, actorId, VISUAL_PILOT_SLUG).run();
    }
  } else {
    await env.DB.prepare(`
      INSERT INTO visual_pages (slug, draft_html, published_html, published_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      VISUAL_PILOT_SLUG,
      clean,
      kind === 'publish' ? clean : '',
      kind === 'publish' ? new Date().toISOString() : null,
      actorId,
    ).run();
  }
  await env.DB.prepare(`
    INSERT INTO visual_page_versions (slug, kind, html, created_by, created_by_name)
    VALUES (?, ?, ?, ?, ?)
  `).bind(VISUAL_PILOT_SLUG, kind, clean, actorId, actorName).run();
  const rows = await env.DB.prepare(
    'SELECT id FROM visual_page_versions WHERE slug = ? ORDER BY id DESC',
  ).bind(VISUAL_PILOT_SLUG).all();
  const { dropIds } = trimVisualVersions(rows?.results || [], VISUAL_VERSION_LIMIT);
  for (const id of dropIds) {
    await env.DB.prepare('DELETE FROM visual_page_versions WHERE id = ?').bind(id).run();
  }
  if (kind === 'publish') {
    await env.DB.prepare(
      'UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?',
    ).bind(clean, VISUAL_PILOT_SLUG).run();
  }
  return loadVisualPageState(env);
}

export async function restoreVisualVersion(env, versionId, user = null) {
  await ensureVisualPagesSchema(env);
  const id = Number(versionId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Version not found');
    error.status = 404;
    throw error;
  }
  const row = await env.DB.prepare(
    'SELECT id, slug, html FROM visual_page_versions WHERE id = ? AND slug = ?',
  ).bind(id, VISUAL_PILOT_SLUG).first();
  if (!row) {
    const error = new Error('Version not found');
    error.status = 404;
    throw error;
  }
  return saveVisualPage(env, { html: row.html, action: 'draft', user });
}

export function renderVisualEditorHtml(assetVersion = 'dev') {
  const v = escapeAttr(assetVersion);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Editing Join the Band</title>
  <link rel="stylesheet" href="/vendor/grapesjs/grapes.min.css?v=${v}">
  <link rel="stylesheet" href="/admin-visual.css?v=${v}">
</head>
<body class="visual-editor-body">
  <header class="visual-edit-banner" data-visual-banner>
    <p class="visual-edit-banner-label">This page is being edited</p>
    <div class="visual-edit-banner-title">
      <strong>Join the Band</strong>
      <small>Preview Worker only · visitors still see the published page until you publish</small>
    </div>
    <div class="visual-edit-banner-tools">
      <button type="button" class="visual-banner-btn" data-visual-add>Add section</button>
      <button type="button" class="visual-banner-btn" data-visual-undo>Undo</button>
      <button type="button" class="visual-banner-btn" data-visual-redo>Redo</button>
      <div class="visual-edit-devices" data-visual-devices>
        <button type="button" data-device="Desktop">1920</button>
        <button type="button" data-device="Laptop">1280</button>
        <button type="button" data-device="Tablet">768</button>
        <button type="button" data-device="Phone">390</button>
        <button type="button" data-device="Small">320</button>
      </div>
      <button type="button" class="visual-banner-btn" data-visual-history>History</button>
      <button type="button" class="visual-banner-btn" data-visual-draft>Save draft</button>
      <button type="button" class="visual-banner-btn visual-banner-btn-primary" data-visual-publish>Publish</button>
      <a class="visual-banner-btn" href="/admin">Exit</a>
    </div>
  </header>
  <p class="visual-editor-status" data-visual-status hidden></p>
  <div class="visual-editor-stage">
    <div id="gjs"></div>
  </div>
  <div id="visual-gjs-sink" hidden></div>
  <aside class="visual-add-drawer" data-visual-add-drawer hidden>
    <div class="visual-add-drawer-head">
      <h2>Add a section</h2>
      <button type="button" data-visual-add-close>Close</button>
    </div>
    <div class="visual-add-grid" data-visual-add-grid></div>
  </aside>
  <aside class="visual-history-drawer" data-visual-versions hidden></aside>
  <div class="visual-modal" data-visual-image-modal hidden>
    <div class="visual-modal-card">
      <h2>Change image</h2>
      <div class="visual-photo-grid" data-visual-photo-grid></div>
      <label class="visual-upload-label">Upload a site photo
        <input type="file" accept="image/*" data-visual-upload hidden>
      </label>
      <button type="button" data-visual-image-close>Cancel</button>
    </div>
  </div>
  <div class="visual-modal" data-visual-link-modal hidden>
    <form class="visual-modal-card" data-visual-link-form>
      <h2>Add a link</h2>
      <label>Address
        <input type="url" name="href" placeholder="https:// or /page.html" required>
      </label>
      <div class="visual-modal-actions">
        <button type="submit">Apply</button>
        <button type="button" data-visual-link-close>Cancel</button>
      </div>
    </form>
  </div>
  <script src="/vendor/grapesjs/grapes.min.js?v=${v}"></script>
  <script src="/admin-visual.js?v=${v}"></script>
</body>
</html>`;
}
