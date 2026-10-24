// Site Studio (Phase 0): layout JSON v1, validation, publish-time rendering,
// and the additive schema that backs it. Public requests never render layouts;
// they read page_versions.html_cache written at publish time.
//
// IMPORTANT: Studio has its own schema version key. It must never bump
// DB_SCHEMA_VERSION, because that re-runs the audit-log schema code.

export const STUDIO_SCHEMA_VERSION = '2026-10-24.s1';
export const STUDIO_SCHEMA_KEY = 'studio_schema_version';
export const STUDIO_EDITORS = ['legacy', 'v2'];
export const STUDIO_HISTORY_LIMIT = 3;
export const GRID_COLUMNS = 12;
export const GRID_ROW_UNIT = 40;
export const GRID_GAP = 16;
export const MAX_LAYOUT_BYTES = 200_000;
export const BLOCK_TYPES = ['heading', 'text', 'button', 'image', 'logos', 'spacer', 'divider', 'html'];
export const ADMIN_ONLY_BLOCKS = new Set(['html']);
export const SECTION_VARIANTS = ['plain', 'hero', 'content', 'band'];

/** Additive-only statements. No DROP / DELETE / RENAME / UPDATE, no audit tables. */
export function studioTableStatements() {
  return [
    `CREATE TABLE IF NOT EXISTS page_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      layout_json TEXT NOT NULL,
      html_cache TEXT NOT NULL DEFAULT '',
      theme_id INTEGER,
      kind TEXT NOT NULL DEFAULT 'publish',
      note TEXT NOT NULL DEFAULT '',
      created_by INTEGER,
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    'CREATE INDEX IF NOT EXISTS idx_page_versions_slug ON page_versions (slug, id)',
    `CREATE TABLE IF NOT EXISTS page_drafts (
      slug TEXT PRIMARY KEY,
      layout_json TEXT NOT NULL,
      base_version_id INTEGER,
      updated_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tokens_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
}

export const STUDIO_CMS_PAGE_COLUMNS = [
  ['editor', "ALTER TABLE cms_pages ADD COLUMN editor TEXT NOT NULL DEFAULT 'legacy'"],
  ['live_version_id', 'ALTER TABLE cms_pages ADD COLUMN live_version_id INTEGER'],
];

let studioSchemaPromise = null;
let studioSchemaReady = false;

export function resetStudioSchemaMemo() {
  studioSchemaPromise = null;
  studioSchemaReady = false;
}

export async function ensureStudioSchema(env) {
  if (studioSchemaReady) return;
  if (!studioSchemaPromise) {
    studioSchemaPromise = (async () => {
      const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?').bind(STUDIO_SCHEMA_KEY).first();
      if (row?.value === STUDIO_SCHEMA_VERSION) return;
      const info = await env.DB.prepare('PRAGMA table_info(cms_pages)').all();
      const have = new Set((info.results || []).map((c) => c.name));
      const stmts = [];
      for (const [name, sql] of STUDIO_CMS_PAGE_COLUMNS) if (!have.has(name)) stmts.push(sql);
      stmts.push(...studioTableStatements());
      await env.DB.batch(stmts.map((sql) => env.DB.prepare(sql)));
      await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(STUDIO_SCHEMA_KEY, STUDIO_SCHEMA_VERSION).run();
    })().then(() => { studioSchemaReady = true; }).finally(() => { studioSchemaPromise = null; });
  }
  await studioSchemaPromise;
}

// ---------- helpers ----------
export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function safeHref(value = '') {
  const href = String(value || '').trim();
  if (!href) return '';
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (href.startsWith('#')) return href;
  return '';
}

export function safeSrc(value = '') {
  const src = String(value || '').trim();
  if (/^https:\/\//i.test(src)) return src;
  if (src.startsWith('/') && !src.startsWith('//')) return src;
  return '';
}

const isInt = (n) => Number.isInteger(n);

// ---------- rich text (JSON, never raw HTML) ----------
// { paragraphs: [ [ { text, bold?, italic?, href? }, ... ], ... ] }
export function validateRichText(rich, where) {
  const errors = [];
  if (!rich || !Array.isArray(rich.paragraphs)) {
    errors.push(`${where}: rich text needs a paragraphs array`);
    return errors;
  }
  rich.paragraphs.forEach((para, pi) => {
    if (!Array.isArray(para)) { errors.push(`${where}: paragraph ${pi} must be an array of runs`); return; }
    para.forEach((run, ri) => {
      if (!run || typeof run.text !== 'string') errors.push(`${where}: paragraph ${pi} run ${ri} needs text`);
      if (run?.href && !safeHref(run.href)) errors.push(`${where}: paragraph ${pi} run ${ri} has an unsafe link`);
    });
  });
  return errors;
}

export function renderRichText(rich) {
  return (rich?.paragraphs || []).map((para) => `<p>${para.map((run) => {
    let html = escapeHtml(run.text);
    if (run.bold) html = `<strong>${html}</strong>`;
    if (run.italic) html = `<em>${html}</em>`;
    const href = safeHref(run.href);
    if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
    return html;
  }).join('')}</p>`).join('');
}

// ---------- validation ----------
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Validate a layout. Returns { ok, errors }. `allowHtml` is true only for
 * Super Admins; the html block is admin-only.
 */
export function validateLayout(layout, { allowHtml = false } = {}) {
  const errors = [];
  if (!layout || typeof layout !== 'object') return { ok: false, errors: ['layout must be an object'] };
  if (layout.version !== 1) errors.push('layout.version must be 1');
  let size = 0;
  try { size = JSON.stringify(layout).length; } catch { errors.push('layout is not serializable'); }
  if (size > MAX_LAYOUT_BYTES) errors.push(`layout is too large (${size} bytes)`);
  if (!Array.isArray(layout.sections) || !layout.sections.length) errors.push('layout needs at least one section');
  const ids = new Set();
  (layout.sections || []).forEach((section, si) => {
    const sw = `section ${section?.id || si}`;
    if (!section || typeof section.id !== 'string' || !section.id) errors.push(`${sw}: id required`);
    else if (ids.has(section.id)) errors.push(`${sw}: duplicate id`); else ids.add(section.id);
    if (section?.variant && !SECTION_VARIANTS.includes(section.variant)) errors.push(`${sw}: unknown variant ${section.variant}`);
    const blocks = Array.isArray(section?.blocks) ? section.blocks : null;
    if (!blocks) { errors.push(`${sw}: blocks array required`); return; }
    const placed = [];
    blocks.forEach((block, bi) => {
      const bw = `${sw} block ${block?.id || bi}`;
      if (!block || typeof block.id !== 'string' || !block.id) errors.push(`${bw}: id required`);
      else if (ids.has(block.id)) errors.push(`${bw}: duplicate id`); else ids.add(block.id);
      if (!BLOCK_TYPES.includes(block?.type)) { errors.push(`${bw}: unknown type ${block?.type}`); return; }
      if (ADMIN_ONLY_BLOCKS.has(block.type) && !allowHtml) errors.push(`${bw}: html blocks are Super Admin only`);
      const { x, y, w, h } = block;
      if (![x, y, w, h].every(isInt)) { errors.push(`${bw}: x, y, w, h must be integers`); return; }
      if (x < 0 || y < 0 || w < 1 || h < 1) errors.push(`${bw}: position out of range`);
      if (x + w > GRID_COLUMNS) errors.push(`${bw}: extends past column ${GRID_COLUMNS}`);
      for (const other of placed) {
        if (rectsOverlap(block, other)) errors.push(`${bw}: overlaps ${other.id}`);
      }
      placed.push(block);
      const p = block.props || {};
      if (block.mobile && typeof block.mobile !== 'object') errors.push(`${bw}: mobile must be an object`);
      if (block.type === 'heading' && typeof p.text !== 'string') errors.push(`${bw}: heading text required`);
      if (block.type === 'heading' && p.level && ![1, 2, 3, 4].includes(p.level)) errors.push(`${bw}: heading level 1-4`);
      if (block.type === 'text') errors.push(...validateRichText(p.rich, bw));
      if (block.type === 'button' && (!p.label || !safeHref(p.href))) errors.push(`${bw}: button needs a label and a safe link`);
      if (block.type === 'image' && (!safeSrc(p.src) || typeof p.alt !== 'string')) errors.push(`${bw}: image needs a safe src and alt text`);
      if (block.type === 'logos') {
        if (!Array.isArray(p.items) || !p.items.length) errors.push(`${bw}: logos need items`);
        else p.items.forEach((item, ii) => { if (!safeSrc(item?.src) || typeof item?.alt !== 'string') errors.push(`${bw}: logo ${ii} needs a safe src and alt`); });
      }
      if (block.type === 'html' && typeof p.html !== 'string') errors.push(`${bw}: html string required`);
    });
  });
  return { ok: errors.length === 0, errors };
}

// ---------- content-only vs layout diff ----------
const CONTENT_PROP_KEYS = new Set(['text', 'rich', 'label', 'href', 'alt', 'src', 'items', 'html']);

function structureOf(layout) {
  return JSON.stringify((layout?.sections || []).map((s) => ({
    id: s.id, variant: s.variant || 'plain', style: s.style || null,
    blocks: (s.blocks || []).map((b) => {
      const props = {};
      for (const [k, v] of Object.entries(b.props || {})) if (!CONTENT_PROP_KEYS.has(k)) props[k] = v;
      return { id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, mobile: b.mobile || null, props };
    }),
  })));
}

/** True when only words/links/images changed (page:{slug} is enough). */
export function isContentOnlyChange(before, after) {
  if (!before) return false;
  return structureOf(before) === structureOf(after);
}

// ---------- rendering (publish time only) ----------
function blockInner(block) {
  const p = block.props || {};
  switch (block.type) {
    case 'heading': {
      const level = [1, 2, 3, 4].includes(p.level) ? p.level : 2;
      const field = p.field ? ` data-cms-field="${escapeHtml(p.field)}"` : '';
      if (p.style === 'kicker') return `<div class="kicker"${field}>${escapeHtml(p.text)}</div>`;
      return `<h${level}${field}>${escapeHtml(p.text)}</h${level}>`;
    }
    case 'text': {
      const html = renderRichText(p.rich);
      return p.card ? `<div class="card">${html}</div>` : html;
    }
    case 'button': {
      const cls = p.style === 'secondary' ? 'btn secondary' : 'btn primary';
      return `<p><a class="${cls}" href="${escapeHtml(safeHref(p.href))}">${escapeHtml(p.label)}</a></p>`;
    }
    case 'image':
      return `<img src="${escapeHtml(safeSrc(p.src))}" alt="${escapeHtml(p.alt)}" loading="lazy">`;
    case 'logos':
      return `<div class="coming-soon-logos">${p.items.map((i) => `<img src="${escapeHtml(safeSrc(i.src))}" alt="${escapeHtml(i.alt)}">`).join('')}</div>`;
    case 'spacer':
      return '';
    case 'divider':
      return '<hr>';
    case 'html':
      return String(p.html || '');
    default:
      return '';
  }
}

const SECTION_CLASS = {
  plain: 'studio-section',
  hero: 'studio-section page-hero',
  content: 'studio-section content',
  band: 'studio-section studio-band',
};

/** Render a validated layout to the HTML saved in page_versions.html_cache. */
export function renderLayout(layout) {
  const sections = (layout.sections || []).map((section) => {
    const variant = section.variant || 'plain';
    const extra = section.className ? ` ${String(section.className).replace(/[^a-z0-9 _-]/gi, '')}` : '';
    const blocks = [...(section.blocks || [])]
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .map((block) => {
        const order = Number.isInteger(block.mobile?.order) ? block.mobile.order : null;
        const hide = block.mobile?.hidden ? ' studio-hide-mobile' : '';
        const style = `grid-column:${block.x + 1} / span ${block.w};grid-row:${block.y + 1} / span ${block.h}${order !== null ? `;--studio-order:${order}` : ''}`;
        return `<div class="studio-block studio-${block.type}${hide}" data-block="${escapeHtml(block.id)}" style="${style}">${blockInner(block)}</div>`;
      }).join('');
    const inner = `<div class="studio-grid">${blocks}</div>`;
    const wrapped = variant === 'hero' ? `<div class="page-title">${inner}</div>` : `<div class="wrap">${inner}</div>`;
    return `<section class="${SECTION_CLASS[variant]}${extra}" data-section="${escapeHtml(section.id)}">${wrapped}</section>`;
  }).join('');
  const css = `<style>.studio-grid{display:grid;grid-template-columns:repeat(${GRID_COLUMNS},minmax(0,1fr));grid-auto-rows:minmax(${GRID_ROW_UNIT}px,auto);gap:${GRID_GAP}px}.studio-block>:first-child{margin-top:0}.studio-block>:last-child{margin-bottom:0}@media (max-width:720px){.studio-grid{display:flex;flex-direction:column}.studio-block{order:var(--studio-order,0)}.studio-hide-mobile{display:none}}</style>`;
  return `${css}${sections}`;
}

// ---------- pilot: coming-soon as layout JSON ----------
export function comingSoonLayout({ heading = 'Coming soon', intro = 'This page is on the way. Check back soon, or contact the band office.', logo = '/assets/efhs-logo.png', mark = '/assets/efhs-blue-regiment-mark.png' } = {}) {
  return {
    version: 1,
    grid: { columns: GRID_COLUMNS, rowUnit: GRID_ROW_UNIT, gap: GRID_GAP },
    sections: [
      {
        id: 'hero', variant: 'hero', className: 'coming-soon-hero',
        blocks: [
          { id: 'logos', type: 'logos', x: 0, y: 0, w: 12, h: 2, props: { items: [
            { src: logo, alt: 'East Forsyth High School Eagles logo' },
            { src: mark, alt: 'East Forsyth Blue Regiment logo' },
          ] } },
          { id: 'kicker', type: 'heading', x: 0, y: 2, w: 12, h: 1, props: { style: 'kicker', text: 'Coming soon', field: 'kicker' } },
          { id: 'title', type: 'heading', x: 0, y: 3, w: 12, h: 1, props: { level: 1, text: heading, field: 'heading' } },
          { id: 'intro', type: 'text', x: 0, y: 4, w: 12, h: 1, props: { rich: { paragraphs: [[{ text: intro }]] } } },
        ],
      },
      {
        id: 'body', variant: 'content',
        blocks: [
          { id: 'office', type: 'text', x: 0, y: 0, w: 12, h: 1, props: { rich: { paragraphs: [[{ text: 'East Forsyth High School band office: (336) 703-6735.' }]] } } },
          { id: 'contact', type: 'button', x: 0, y: 1, w: 12, h: 1, props: { label: 'Contact the band', href: '/contact.html' } },
        ],
      },
    ],
  };
}

/** Plain-text skeleton used by tests and the pilot comparison. */
export function textSkeleton(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, ' [img:$1] ')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>/gi, ' [link:$1] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- data access ----------
export function parseLayoutJson(text) {
  try { return JSON.parse(String(text || '')); } catch { return null; }
}

export async function loadStudioLiveHtml(env, path) {
  try {
    const row = await env.DB.prepare(
      `SELECT v.html_cache AS html FROM cms_pages p JOIN page_versions v ON v.id = p.live_version_id
       WHERE p.path = ? AND p.editor = 'v2' AND v.slug = p.slug`,
    ).bind(path).first();
    return row?.html || '';
  } catch {
    // Studio schema not applied yet: legacy rendering.
    return '';
  }
}

export async function loadStudioState(env, slug) {
  await ensureStudioSchema(env);
  const page = await env.DB.prepare('SELECT slug, title, path, editor, live_version_id FROM cms_pages WHERE slug = ?').bind(slug).first();
  if (!page) return null;
  const draft = await env.DB.prepare('SELECT layout_json, base_version_id, updated_at FROM page_drafts WHERE slug = ?').bind(slug).first();
  const versions = await env.DB.prepare(
    'SELECT id, kind, note, created_by_name, created_at, layout_json FROM page_versions WHERE slug = ? ORDER BY id DESC LIMIT ?',
  ).bind(slug, STUDIO_HISTORY_LIMIT).all();
  const list = (versions.results || []).map((v) => ({ ...v, layout: parseLayoutJson(v.layout_json), layout_json: undefined }));
  const live = list.find((v) => v.id === page.live_version_id) || null;
  return {
    page,
    draft: draft ? { layout: parseLayoutJson(draft.layout_json), base_version_id: draft.base_version_id, updated_at: draft.updated_at } : null,
    live_layout: live?.layout || null,
    versions: list.map(({ layout, ...rest }) => rest),
  };
}

async function currentBaseline(env, slug, liveVersionId) {
  const draft = await env.DB.prepare('SELECT layout_json FROM page_drafts WHERE slug = ?').bind(slug).first();
  if (draft) return parseLayoutJson(draft.layout_json);
  if (liveVersionId) {
    const v = await env.DB.prepare('SELECT layout_json FROM page_versions WHERE id = ?').bind(liveVersionId).first();
    if (v) return parseLayoutJson(v.layout_json);
  }
  return null;
}

/**
 * Studio admin API. deps: { requireLogin, jsonResponse, canEditPageContent,
 * canEditPageLayout, isSuperAdmin, invalidate }.
 */
export async function handleStudioApi(request, env, url, deps) {
  const m = url.pathname.match(/^\/api\/admin\/studio\/pages\/([a-z0-9-]+)(?:\/(draft|publish|restore|editor|render))?$/);
  if (!m) return null;
  const { requireLogin, jsonResponse, canEditPageContent, canEditPageLayout, isSuperAdmin, invalidate } = deps;
  const [, slug, action = ''] = m;
  const auth = await requireLogin(request, env);
  if (auth.response) return auth.response;
  const user = auth.user;
  if (!canEditPageContent(user, slug)) return jsonResponse({ detail: `Permission required: page:${slug}` }, 403);
  const canLayout = canEditPageLayout(user, slug);
  const admin = isSuperAdmin(user);
  const method = request.method;

  if (!action && method === 'GET') {
    const state = await loadStudioState(env, slug);
    if (!state) return jsonResponse({ detail: 'Page not found' }, 404);
    return jsonResponse({ ...state, can_layout: canLayout, can_html: admin, can_flag: admin });
  }
  if (method !== 'POST' && !(action === 'draft' && method === 'PUT')) return jsonResponse({ detail: 'Method not allowed' }, 405);
  await ensureStudioSchema(env);
  const page = await env.DB.prepare('SELECT slug, editor, live_version_id FROM cms_pages WHERE slug = ?').bind(slug).first();
  if (!page) return jsonResponse({ detail: 'Page not found' }, 404);
  const body = await request.json().catch(() => ({}));

  const checkLayout = async (layout) => {
    const result = validateLayout(layout, { allowHtml: admin });
    if (!result.ok) return jsonResponse({ detail: 'Layout is not valid', errors: result.errors }, 422);
    if (!canLayout) {
      const baseline = await currentBaseline(env, slug, page.live_version_id);
      if (!isContentOnlyChange(baseline, layout)) {
        return jsonResponse({ detail: `Permission required: layout:${slug}`, code: 'layout_required' }, 403);
      }
    }
    return null;
  };

  if (action === 'render') {
    const result = validateLayout(body.layout, { allowHtml: admin });
    if (!result.ok) return jsonResponse({ detail: 'Layout is not valid', errors: result.errors }, 422);
    return jsonResponse({ html: renderLayout(body.layout) });
  }
  if (action === 'draft') {
    const bad = await checkLayout(body.layout);
    if (bad) return bad;
    await env.DB.prepare(
      `INSERT INTO page_drafts (slug, layout_json, base_version_id, updated_by, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(slug) DO UPDATE SET layout_json = excluded.layout_json, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
    ).bind(slug, JSON.stringify(body.layout), page.live_version_id || null, user.id ?? null).run();
    return jsonResponse({ ok: true, saved: 'draft' });
  }
  const publishVersion = async (layout, kind, note) => {
    const html = renderLayout(layout);
    const inserted = await env.DB.prepare(
      `INSERT INTO page_versions (slug, layout_json, html_cache, kind, note, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(slug, JSON.stringify(layout), html, kind, String(note || '').slice(0, 200), user.id ?? null, String(user.username || '')).first();
    const id = inserted?.id;
    await env.DB.batch([
      env.DB.prepare('UPDATE cms_pages SET live_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?').bind(id, slug),
      env.DB.prepare(
        `INSERT INTO page_drafts (slug, layout_json, base_version_id, updated_by, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(slug) DO UPDATE SET layout_json = excluded.layout_json, base_version_id = excluded.base_version_id, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
      ).bind(slug, JSON.stringify(layout), id, user.id ?? null),
    ]);
    if (invalidate) await invalidate();
    return id;
  };
  if (action === 'publish') {
    const bad = await checkLayout(body.layout);
    if (bad) return bad;
    const id = await publishVersion(body.layout, 'publish', body.note);
    return jsonResponse({ ok: true, version_id: id, live: page.editor === 'v2' });
  }
  if (action === 'restore') {
    const vid = Number(body.version_id);
    const v = await env.DB.prepare('SELECT layout_json FROM page_versions WHERE id = ? AND slug = ?').bind(vid, slug).first();
    if (!v) return jsonResponse({ detail: 'Version not found' }, 404);
    const layout = parseLayoutJson(v.layout_json);
    const bad = await checkLayout(layout);
    if (bad) return bad;
    const id = await publishVersion(layout, 'restore', `Restored version ${vid}`);
    return jsonResponse({ ok: true, version_id: id });
  }
  if (action === 'editor') {
    if (!admin) return jsonResponse({ detail: 'Only a Super Admin can switch editors' }, 403);
    const editor = String(body.editor || '');
    if (!STUDIO_EDITORS.includes(editor)) return jsonResponse({ detail: 'editor must be legacy or v2' }, 422);
    if (editor === 'v2' && !page.live_version_id) return jsonResponse({ detail: 'Publish a Studio version before switching to v2' }, 409);
    await env.DB.prepare('UPDATE cms_pages SET editor = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?').bind(editor, slug).run();
    if (invalidate) await invalidate();
    return jsonResponse({ ok: true, editor });
  }
  return jsonResponse({ detail: 'Not found' }, 404);
}
