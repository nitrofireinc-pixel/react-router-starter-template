// Site Studio (Phase 0): layout JSON v1, validation, publish-time rendering,
// and the additive schema that backs it. Public requests never render layouts;
// they read page_versions.html_cache written at publish time.
//
// IMPORTANT: Studio has its own schema version key. It must never bump
// DB_SCHEMA_VERSION, because that re-runs the audit-log schema code.

export const STUDIO_SCHEMA_VERSION = '2026-10-24.s2';
export const STUDIO_SCHEMA_KEY = 'studio_schema_version';
export const STUDIO_EDITORS = ['legacy', 'v2'];
export const STUDIO_HISTORY_LIMIT = 3;
export const GRID_COLUMNS = 12;
export const GRID_ROW_UNIT = 40;
export const GRID_GAP = 16;
export const MAX_LAYOUT_BYTES = 200_000;
export const BLOCK_TYPES = ['heading', 'text', 'button', 'image', 'logos', 'spacer', 'divider', 'html', 'card', 'el', 'group', 'live'];
export const CARD_CHILD_TYPES = ['heading', 'text', 'button', 'image', 'divider', 'html'];
export const SECTION_WRAPS = ['page-title', 'wrap', 'none'];
export const SECTION_ATTRS = ['data-cms-layout', 'data-cms-block', 'id'];
export const STUDIO_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
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
    `CREATE TABLE IF NOT EXISTS studio_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      r2_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'image',
      mime TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL DEFAULT '',
      original_name TEXT NOT NULL DEFAULT '',
      uploaded_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
}

/** Extra additive columns on existing non-audit tables, applied only when missing. */
export const STUDIO_EXTRA_COLUMNS = [
  ['themes', 'is_active', 'ALTER TABLE themes ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0'],
  ['booster_meeting_minutes', 'source_kind', "ALTER TABLE booster_meeting_minutes ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'html'"],
  ['booster_meeting_minutes', 'file_key', "ALTER TABLE booster_meeting_minutes ADD COLUMN file_key TEXT NOT NULL DEFAULT ''"],
  ['booster_meeting_minutes', 'file_mime', "ALTER TABLE booster_meeting_minutes ADD COLUMN file_mime TEXT NOT NULL DEFAULT ''"],
  ['booster_meeting_minutes', 'file_size', 'ALTER TABLE booster_meeting_minutes ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0'],
  ['booster_meeting_minutes', 'file_name', "ALTER TABLE booster_meeting_minutes ADD COLUMN file_name TEXT NOT NULL DEFAULT ''"],
  ['booster_meeting_minutes', 'doc_json', "ALTER TABLE booster_meeting_minutes ADD COLUMN doc_json TEXT NOT NULL DEFAULT ''"],
];

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
      const extra = [];
      let skipped = false;
      for (const table of [...new Set(STUDIO_EXTRA_COLUMNS.map(([t]) => t))]) {
        let cols;
        try { cols = new Set(((await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results || []).map((c) => c.name)); } catch { continue; }
        if (!cols.size) { skipped = true; continue; } // table not created yet (legacy schema owns it); retry next isolate
        for (const [t, name, sql] of STUDIO_EXTRA_COLUMNS) if (t === table && !cols.has(name)) extra.push(sql);
      }
      if (extra.length) await env.DB.batch(extra.map((sql) => env.DB.prepare(sql)));
      if (skipped) return;
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

const FIELD_RE = /^[a-z0-9_-]{1,40}$/i;
const CLASS_RE = /^[a-z0-9 _-]{0,120}$/i;

export const WRAP_OPEN_RE = /^<div(?: class="[a-z0-9 _-]{0,120}")?(?: data-[a-z][a-z0-9-]{0,40})*>$/;
export const LOOK_RADIUS = { square: '0', round: '14px', pill: '28px' };
export const LOOK_SHADOW = { none: 'none', soft: '0 6px 18px rgba(8,30,70,.14)', strong: '0 14px 34px rgba(8,30,70,.28)' };
const COLOR_RE = /^#[0-9a-f]{6}$/i;
export function validateLook(look, bw) {
  const errors = [];
  if (typeof look !== 'object' || Array.isArray(look)) return [`${bw}: look must be an object`];
  for (const [k, v] of Object.entries(look)) {
    if (k === 'bg' || k === 'accent') { if (!COLOR_RE.test(String(v))) errors.push(`${bw}: ${k} must be a #rrggbb colour`); }
    else if (k === 'radius') { if (!(v in LOOK_RADIUS)) errors.push(`${bw}: unknown corners ${v}`); }
    else if (k === 'shadow') { if (!(v in LOOK_SHADOW)) errors.push(`${bw}: unknown shadow ${v}`); }
    else errors.push(`${bw}: look.${k} not allowed`);
  }
  return errors;
}
function lookStyle(look) {
  if (!look) return '';
  let s = '';
  if (look.bg) s += `;background:${look.bg}`;
  if (look.accent) s += `;border-top:4px solid ${look.accent}`;
  if (look.radius) s += `;border-radius:${LOOK_RADIUS[look.radius]}`;
  if (look.shadow) s += `;box-shadow:${LOOK_SHADOW[look.shadow]}`;
  if (look.bg || look.accent || look.shadow) s += ';padding:16px';
  return s;
}

/** Collect locked html blocks (id -> html) so non-admins may keep migrated markup. */
export function lockedHtmlById(layout) {
  const map = new Map();
  const visit = (block) => {
    if (block?.type === 'html' && block.props?.locked) map.set(block.id, String(block.props.html || ''));
    if (block?.type === 'card' || block?.type === 'group') (block.props?.children || []).forEach(visit);
  };
  (layout?.sections || []).forEach((section) => (section.blocks || []).forEach(visit));
  return map;
}

function validateBlockProps(block, bw, errors, htmlOk) {
  const p = block.props || {};
  if (p.field != null && !FIELD_RE.test(String(p.field))) errors.push(`${bw}: bad field name`);
  if (p.className != null && !CLASS_RE.test(String(p.className))) errors.push(`${bw}: bad class name`);
  if (block.type === 'heading' && typeof p.text !== 'string') errors.push(`${bw}: heading text required`);
  if (block.type === 'heading' && p.level && ![1, 2, 3, 4].includes(p.level)) errors.push(`${bw}: heading level 1-4`);
  if (block.type === 'text') errors.push(...validateRichText(p.rich, bw));
  if (block.type === 'button' && (!p.label || !safeHref(p.href))) errors.push(`${bw}: button needs a label and a safe link`);
  if (block.type === 'image' && (!safeSrc(p.src) || typeof p.alt !== 'string')) errors.push(`${bw}: image needs a safe src and alt text`);
  if (block.type === 'logos' && !p.auto) {
    if (!Array.isArray(p.items) || !p.items.length) errors.push(`${bw}: logos need items`);
    else p.items.forEach((item, ii) => { if (!safeSrc(item?.src) || typeof item?.alt !== 'string') errors.push(`${bw}: logo ${ii} needs a safe src and alt`); });
  }
  if (block.type === 'html') {
    if (typeof p.html !== 'string') errors.push(`${bw}: html string required`);
    else if (!htmlOk(block)) errors.push(`${bw}: html blocks are Super Admin only`);
    if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(String(p.html || '')) && !p.locked) errors.push(`${bw}: html may not contain scripts, on* handlers or javascript: links`);
  }
}

/**
 * Validate a layout. Returns { ok, errors }. `allowHtml` is true only for
 * Super Admins; others may keep a locked html block exactly as it was in
 * `baseline` (migrated legacy markup) but may not add or change one.
 */
export function validateLayout(layout, { allowHtml = false, baseline = null } = {}) {
  const errors = [];
  if (!layout || typeof layout !== 'object') return { ok: false, errors: ['layout must be an object'] };
  if (layout.version !== 1) errors.push('layout.version must be 1');
  let size = 0;
  try { size = JSON.stringify(layout).length; } catch { errors.push('layout is not serializable'); }
  if (size > MAX_LAYOUT_BYTES) errors.push(`layout is too large (${size} bytes)`);
  if (!Array.isArray(layout.sections) || !layout.sections.length) errors.push('layout needs at least one section');
  if (layout.wrapOpen != null && !WRAP_OPEN_RE.test(String(layout.wrapOpen))) errors.push('layout wrapper is not allowed');
  const locked = lockedHtmlById(baseline);
  const base = treeBaseline(baseline);
  const htmlOk = (block) => allowHtml || (block.props?.locked && locked.get(block.id) === String(block.props.html || ''));
  const ids = new Set();
  const takeId = (obj, where) => {
    if (!obj || typeof obj.id !== 'string' || !obj.id) errors.push(`${where}: id required`);
    else if (ids.has(obj.id)) errors.push(`${where}: duplicate id`); else ids.add(obj.id);
  };
  (layout.sections || []).forEach((section, si) => {
    const sw = `section ${section?.id || si}`;
    takeId(section, sw);
    if (section?.variant && !SECTION_VARIANTS.includes(section.variant)) errors.push(`${sw}: unknown variant ${section.variant}`);
    if (section?.wrap != null && !SECTION_WRAPS.includes(section.wrap)) errors.push(`${sw}: unknown wrap ${section.wrap}`);
    if (section?.className != null && !CLASS_RE.test(String(section.className))) errors.push(`${sw}: bad class name`);
    if (section?.wrapClass != null && !CLASS_RE.test(String(section.wrapClass))) errors.push(`${sw}: bad wrap class`);
    for (const key of Object.keys(section?.attrs || {})) if (!SECTION_ATTRS.includes(key)) errors.push(`${sw}: attribute ${key} not allowed`);
    const blocks = Array.isArray(section?.blocks) ? section.blocks : null;
    if (!blocks) { errors.push(`${sw}: blocks array required`); return; }
    const placed = [];
    blocks.forEach((block, bi) => {
      const bw = `${sw} block ${block?.id || bi}`;
      takeId(block, bw);
      if (!BLOCK_TYPES.includes(block?.type)) { errors.push(`${bw}: unknown type ${block?.type}`); return; }
      const { x, y, w, h } = block;
      if (![x, y, w, h].every(isInt)) { errors.push(`${bw}: x, y, w, h must be integers`); return; }
      if (x < 0 || y < 0 || w < 1 || h < 1) errors.push(`${bw}: position out of range`);
      if (x + w > GRID_COLUMNS) errors.push(`${bw}: extends past column ${GRID_COLUMNS}`);
      for (const other of placed) {
        if (rectsOverlap(block, other)) errors.push(`${bw}: overlaps ${other.id}`);
      }
      placed.push(block);
      if (block.mobile && typeof block.mobile !== 'object') errors.push(`${bw}: mobile must be an object`);
      if (block.look != null) errors.push(...validateLook(block.look, bw));
      validateBlockProps(block, bw, errors, htmlOk);
      if (TREE_TYPES.has(block.type)) validateTreeBlock(block, bw, errors, { allowHtml, base, takeId });
      if (block.type === 'card') {
        const kids = block.props?.children;
        if (!Array.isArray(kids)) errors.push(`${bw}: card needs a children array`);
        else kids.forEach((kid, ki) => {
          const kw = `${bw} child ${kid?.id || ki}`;
          takeId(kid, kw);
          if (!CARD_CHILD_TYPES.includes(kid?.type)) { errors.push(`${kw}: ${kid?.type} cannot go inside a card`); return; }
          validateBlockProps(kid, kw, errors, htmlOk);
        });
      }
    });
  });
  return { ok: errors.length === 0, errors };
}

// ---------- content-only vs layout diff ----------
const CONTENT_PROP_KEYS = new Set(['text', 'rich', 'label', 'href', 'alt', 'src', 'items', 'html']);

function blockStructure(b) {
  const props = {};
  for (const [k, v] of Object.entries(b.props || {})) {
    if (CONTENT_PROP_KEYS.has(k)) continue;
    props[k] = k === 'children' && Array.isArray(v) ? v.map(blockStructure) : v;
  }
  return { id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, mobile: b.mobile || null, look: b.look || null, props };
}

function structureOf(layout) {
  return JSON.stringify([layout?.wrapOpen || null, ...(layout?.sections || []).map((s) => ({
    id: s.id, variant: s.variant || 'plain', style: s.style || null, flow: Boolean(s.flow),
    wrap: s.wrap || null, className: s.className || null, wrapClass: s.wrapClass || null, attrs: s.attrs || null,
    blocks: (s.blocks || []).map(blockStructure),
  }))]);
}

/** True when only words/links/images changed (page:{slug} is enough). */
export function isContentOnlyChange(before, after) {
  if (!before) return false;
  return structureOf(before) === structureOf(after);
}

// ---------- rendering (publish time only) ----------
const fieldAttr = (p) => (p.field ? ` data-cms-field="${escapeHtml(p.field)}"` : '');

function blockInner(block, ctx = {}) {
  const p = block.props || {};
  switch (block.type) {
    case 'heading': {
      const level = [1, 2, 3, 4].includes(p.level) ? p.level : 2;
      if (p.style === 'kicker') return `<div class="kicker"${fieldAttr(p)}>${escapeHtml(p.text)}</div>`;
      return `<h${level}${fieldAttr(p)}>${escapeHtml(p.text)}</h${level}>`;
    }
    case 'text': {
      // A single-paragraph text block with a field tag keeps the tag on its <p>
      // (legacy pages read data-cms-field="intro" from it).
      if (p.field && (p.rich?.paragraphs || []).length === 1) {
        return renderRichText(p.rich).replace(/^<p>/, `<p${fieldAttr(p)}>`);
      }
      const html = renderRichText(p.rich);
      return p.card ? `<div class="card">${html}</div>` : html;
    }
    case 'button': {
      const cls = p.style === 'secondary' ? 'btn secondary' : p.style === 'outline' ? 'btn outline' : 'btn primary';
      return `<p><a class="${cls}" href="${escapeHtml(safeHref(p.href))}">${escapeHtml(p.label)}</a></p>`;
    }
    case 'image':
      return `<img src="${escapeHtml(safeSrc(p.src))}" alt="${escapeHtml(p.alt)}" loading="lazy">`;
    case 'logos': {
      const items = p.auto
        ? [{ src: ctx.logo || '/assets/efhs-logo.png', alt: 'East Forsyth High School Eagles logo' },
          { src: ctx.mark || '/assets/efhs-blue-regiment-mark.png', alt: 'East Forsyth Blue Regiment logo' }]
        : p.items;
      return `<div class="coming-soon-logos">${items.map((i) => `<img src="${escapeHtml(safeSrc(i.src) || i.src)}" alt="${escapeHtml(i.alt)}">`).join('')}</div>`;
    }
    case 'spacer':
      return '';
    case 'divider':
      return '<hr>';
    case 'html':
      return String(p.html || '');
    case 'el':
    case 'group':
    case 'live':
      return renderTree(block, ctx);
    case 'card': {
      const cls = p.className ? escapeHtml(p.className) : 'card';
      const tag = p.tag === 'article' ? 'article' : 'div';
      return `<${tag} class="${cls}"${fieldAttr(p)}>${(p.children || []).map((kid) => (ctx.annotate ? `<!--sk:${escapeHtml(kid.id)}-->${blockInner(kid, ctx)}<!--/sk-->` : blockInner(kid, ctx))).join('')}</${tag}>`;
    }
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

const sortBlocks = (blocks) => [...(blocks || [])].sort((a, b) => (a.y - b.y) || (a.x - b.x));

function sectionAttrs(section) {
  return Object.entries(section.attrs || {})
    .filter(([k]) => SECTION_ATTRS.includes(k))
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');
}

function wrapInner(section, inner) {
  const wrap = section.wrap || (section.variant === 'hero' ? 'page-title' : 'wrap');
  if (wrap === 'none') return inner;
  const cls = section.wrapClass ? escapeHtml(section.wrapClass) : wrap;
  return `<div class="${cls}">${inner}</div>`;
}

/**
 * Render a validated layout to the HTML saved in page_versions.html_cache.
 * Flow sections render exactly like legacy markup (no grid wrapper) so a
 * migrated page matches the old page byte for byte. Grid sections use the
 * 12-column Studio grid.
 */
export function renderLayout(layout, ctx = {}) {
  let usesGrid = false;
  // ctx.annotate (editor canvas only, never published): comment markers around
  // every block/section so the editor can map rendered nodes back to blocks.
  const mark = (block, html) => (ctx.annotate ? `<!--sb:${escapeHtml(block.id)}-->${html}<!--/sb-->` : html);
  const sections = (layout.sections || []).map((section) => {
    const out = renderSection(section);
    return ctx.annotate ? `<!--ss:${escapeHtml(section.id)}-->${out}<!--/ss-->` : out;
  }).join('');
  function renderSection(section) {
    if (section.raw) return sortBlocks(section.blocks).map((block) => mark(block, blockInner(block, ctx))).join('');
    if (section.flow) {
      const inner = sortBlocks(section.blocks).map((block) => mark(block, blockInner(block, ctx))).join('');
      const cls = section.className != null ? ` class="${escapeHtml(section.className)}"` : '';
      return `<section${cls}${sectionAttrs(section)}>${wrapInner(section, inner)}</section>`;
    }
    usesGrid = true;
    const variant = section.variant || 'plain';
    const extra = section.className ? ` ${String(section.className).replace(/[^a-z0-9 _-]/gi, '')}` : '';
    const blocks = sortBlocks(section.blocks)
      .map((block) => {
        const order = Number.isInteger(block.mobile?.order) ? block.mobile.order : null;
        const hide = block.mobile?.hidden ? ' studio-hide-mobile' : '';
        const style = `grid-column:${block.x + 1} / span ${block.w};grid-row:${block.y + 1} / span ${block.h}${order !== null ? `;--studio-order:${order}` : ''}${lookStyle(block.look)}`;
        return mark(block, `<div class="studio-block studio-${block.type}${hide}" data-block="${escapeHtml(block.id)}" style="${style}">${blockInner(block, ctx)}</div>`);
      }).join('');
    const inner = `<div class="studio-grid">${blocks}</div>`;
    return `<section class="${SECTION_CLASS[variant]}${extra}" data-section="${escapeHtml(section.id)}"${sectionAttrs(section)}>${wrapInner(section, inner)}</section>`;
  }
  const body = layout.wrapOpen && WRAP_OPEN_RE.test(String(layout.wrapOpen)) ? `${layout.wrapOpen}${sections}</div>` : sections;
  if (!usesGrid) return body;
  const css = `<style>.studio-grid{display:grid;grid-template-columns:repeat(${GRID_COLUMNS},minmax(0,1fr));grid-auto-rows:minmax(${GRID_ROW_UNIT}px,auto);gap:${GRID_GAP}px}.studio-block>:first-child{margin-top:0}.studio-block>:last-child{margin-bottom:0}@media (max-width:720px){.studio-grid{display:flex;flex-direction:column}.studio-block{order:var(--studio-order,0)}.studio-hide-mobile{display:none}}</style>`;
  return `${css}${body}`;
}

// ---------- pilot: coming-soon as layout JSON ----------
export function comingSoonLayout({ heading = 'Coming soon', intro = 'This page is on the way. Check back soon, or contact the band office.' } = {}) {
  return {
    version: 1,
    grid: { columns: GRID_COLUMNS, rowUnit: GRID_ROW_UNIT, gap: GRID_GAP },
    sections: [
      {
        id: 'hero', variant: 'hero', flow: true, wrap: 'page-title',
        className: 'page-hero coming-soon-hero', attrs: { 'data-cms-layout': 'standard' },
        blocks: [
          { id: 'logos', type: 'logos', x: 0, y: 0, w: 12, h: 2, props: { auto: true } },
          { id: 'kicker', type: 'heading', x: 0, y: 2, w: 12, h: 1, props: { style: 'kicker', text: 'Coming soon', field: 'kicker' } },
          { id: 'title', type: 'heading', x: 0, y: 3, w: 12, h: 1, props: { level: 1, text: heading, field: 'heading' } },
          { id: 'intro', type: 'text', x: 0, y: 4, w: 12, h: 1, props: { field: 'intro', rich: { paragraphs: [[{ text: intro }]] } } },
        ],
      },
      {
        id: 'body', variant: 'content', flow: true, wrap: 'wrap', className: 'content',
        blocks: [
          { id: 'card', type: 'card', x: 0, y: 0, w: 12, h: 2, props: { field: 'body_text', children: [
            { id: 'office', type: 'text', props: { rich: { paragraphs: [[{ text: 'East Forsyth High School band office: (336) 703-6735.' }]] } } },
            { id: 'contact', type: 'button', props: { label: 'Contact the band', href: '/contact.html' } },
          ] } },
        ],
      },
    ],
  };
}

// ---------- legacy HTML -> layout (page migration) ----------
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Split an HTML fragment into top-level nodes: [{ tag, open, html }] (text nodes have tag ''). */
export function splitTopLevel(html = '') {
  const src = String(html);
  const out = [];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  let depth = 0; let start = 0; let topTag = ''; let topOpen = ''; let m; let textStart = 0;
  while ((m = re.exec(src))) {
    const token = m[0];
    if (token.startsWith('<!--')) continue;
    const name = (m[1] || '').toLowerCase();
    const closing = token.startsWith('</');
    const selfClose = VOID_TAGS.has(name) || /\/>$/.test(token);
    if (!closing) {
      if (depth === 0) {
        if (m.index > textStart) out.push({ tag: '', open: '', html: src.slice(textStart, m.index) });
        start = m.index; topTag = name; topOpen = token;
      }
      if (name === 'script' || name === 'style' || name === 'textarea') {
        const endIdx = src.toLowerCase().indexOf(`</${name}`, re.lastIndex);
        if (endIdx >= 0) re.lastIndex = endIdx;
      }
      if (selfClose) {
        if (depth === 0) { out.push({ tag: topTag, open: topOpen, html: src.slice(start, re.lastIndex) }); textStart = re.lastIndex; }
      } else depth += 1;
    } else {
      depth -= 1;
      if (depth < 0) return null; // malformed
      if (depth === 0) { out.push({ tag: topTag, open: topOpen, html: src.slice(start, re.lastIndex) }); textStart = re.lastIndex; }
    }
  }
  if (depth !== 0) return null;
  if (textStart < src.length) out.push({ tag: '', open: '', html: src.slice(textStart) });
  return out;
}

function attrsOf(openTag = '') {
  const attrs = {};
  const re = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  const body = openTag.replace(/^<[a-zA-Z0-9-]+/, '').replace(/\/?>$/, '');
  while ((m = re.exec(` ${body}`))) attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}

const decodeEntities = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// ---------- tree blocks: editable legacy markup + live data ----------
/**
 * Live data sources. A live block keeps its original slot markup; the public
 * renderer fills it from the source on every request, so it is never hand-edited.
 */
export const LIVE_SOURCES = {
  'next-fund': { label: 'Calendar (next fundraiser)', admin: '/admin?tab=caldev', limit: false },
  'featured-fund': { label: 'Calendar (next fundraiser)', admin: '/admin?tab=caldev', limit: false },
  'other-funds': { label: 'Calendar (upcoming fundraisers)', admin: '/admin?tab=caldev', limit: true },
  events: { label: 'Calendar', admin: '/admin?tab=caldev', limit: true },
  'sponsor-tiers': { label: 'Become a Sponsor page', admin: '/admin/studio/become-a-sponsor', limit: false },
  'sponsor-thanks': { label: 'Sponsors', admin: '/admin?tab=sponsors', limit: true },
  officers: { label: 'Booster Members', admin: '/admin?tab=booster-members', limit: false },
  gallery: { label: 'Photos', admin: '/admin?tab=photos', limit: true },
  'site:hero_title': { label: 'Site Settings (hero headline)', admin: '/admin?tab=site', limit: false },
  'site:hero_subtitle': { label: 'Site Settings (hero subtitle)', admin: '/admin?tab=site', limit: false },
  instagram: { label: 'Site Settings (social links)', admin: '/admin?tab=site', limit: false },
  'fundraising-cards': { label: 'Fundraiser cards', admin: '/admin?tab=fundraiser-cards', limit: false },
  'booster-meetings': { label: 'Calendar (booster meetings)', admin: '/admin?tab=caldev', limit: false },
  'booster-members': { label: 'Booster Members', admin: '/admin?tab=booster-members', limit: false },
  sponsors: { label: 'Sponsors', admin: '/admin?tab=sponsors', limit: false },
  staff: { label: 'Directors & Staff', admin: '/admin?tab=staff', limit: false },
  'contact-form': { label: 'Contact forms', admin: '/admin?tab=contact', limit: false },
  // Whole web apps: one locked block, never split into parts.
  'calendar-app': { label: 'Calendar', admin: '/admin?tab=caldev', limit: false, app: true, manage: 'Manage events' },
  donate: { label: 'Donations (Square checkout)', admin: '/admin?tab=site', limit: false },
  'email-list': { label: 'Email list signup', admin: '/admin?tab=mail', limit: false },
};
const LIVE_ATTRS = { 'data-fundraising-cards': 'fundraising-cards', 'data-booster-meetings': 'booster-meetings', 'data-booster-members': 'booster-members', 'data-sponsors': 'sponsors', 'data-staff': 'staff', 'data-contact-form-slot': 'contact-form' };
const EMBED = (inner) => `<div class="home-redesign studio-live-embed">${inner}</div>`;
/** Palette templates for live blocks on any page (styled by home-redesign.css). */
export const LIVE_TEMPLATES = {
  events: EMBED('<section class="studio-live-events"><div class="events" data-home-slot="events" data-home-dynamic><p class="note">Upcoming events appear here from the Calendar.</p></div></section>'),
  'sponsor-thanks': EMBED('<div class="thanks"><div class="thanks-logos" data-home-slot="sponsor-thanks" data-home-dynamic><p class="note">Sponsor logos appear here from Sponsors.</p></div></div>'),
  'next-fund': EMBED('<aside class="next-fund" data-home-slot="next-fund" data-home-dynamic><div class="nf-top"><span class="nf-kicker">Next fundraiser</span></div><h3>Coming soon</h3><p>The next fundraiser on the Calendar appears here.</p></aside>'),
};

const LEAF_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'li', 'figcaption', 'dt', 'dd', 'label', 'blockquote', 'svg', 'img', 'span', 'strong', 'em', 'b', 'i', 'small', 'time', 'summary', 'td', 'th', 'caption', 'select', 'textarea', 'form', 'iframe', 'video', 'picture', 'table', 'script', 'style', 'noscript']);

/** Which live source an element belongs to, or ''. */
export function liveSourceOf(tag, open, html = '') {
  const a = attrsOf(open);
  if (a['data-home-slot']) return a['data-home-slot'];
  if (a['data-photo-gallery'] != null) return 'gallery';
  if (a['data-site-field']) return `site:${a['data-site-field']}`;
  if (tag === 'a' && a.href === '#instagram') return 'instagram';
  if (a.id === 'caldev-app' || /(?:^|\s)caldev-app(?:\s|$)/.test(a.class || '')) return 'calendar-app';
  for (const [attr, src] of Object.entries(LIVE_ATTRS)) if (a[attr] != null) return src;
  if (a['data-visual-locked'] === 'donate' || (a['data-donate-open'] != null && /visual-locked-slot/.test(a.class || ''))) return 'donate';
  if (a['data-visual-locked'] === 'email-list') return 'email-list';
  if (a['data-email-list-signup'] != null && !/<[a-z]/i.test(html.slice(open.length))) return 'email-list';
  if (LEAF_TAGS.has(tag)) {
    const m = html.match(/data-home-slot="([^"]+)"|(data-photo-gallery)|data-site-field="([^"]+)"|href="#instagram"/);
    if (m) return m[1] || (m[2] ? 'gallery' : m[3] ? `site:${m[3]}` : 'instagram');
  }
  return '';
}

/** Turn one element node into an editable tree block (group / el / live). */
export function treeBlock(node, id) {
  const live = liveSourceOf(node.tag, node.open, node.html);
  if (live) return { id, type: 'live', props: { source: live, html: node.html } };
  const close = VOID_TAGS.has(node.tag) || /\/>$/.test(node.open) ? '' : `</${node.tag}>`;
  if (LEAF_TAGS.has(node.tag) || !close || !node.html.endsWith(close)) return { id, type: 'el', props: { html: node.html } };
  const inner = node.html.slice(node.open.length, node.html.length - close.length);
  if (/data-home-slot=|data-photo-gallery|data-site-field=|href="#instagram"/.test(inner) === false && !/<[a-z]/i.test(inner)) {
    return { id, type: 'el', props: { html: node.html } };
  }
  const kids = splitTopLevel(inner);
  if (!kids || kids.some((k) => !k.tag && k.html.trim()) || !kids.some((k) => k.tag)) {
    // Direct text mixed with tags (or unparsable): one editable element, unless it hides live data.
    return /data-home-slot=|data-photo-gallery|data-site-field=/.test(inner)
      ? { id, type: 'html', props: { html: node.html, locked: true } }
      : { id, type: 'el', props: { html: node.html } };
  }
  const children = [];
  let lead = '';
  kids.forEach((k) => {
    if (!k.tag) { lead += k.html; return; }
    const child = treeBlock(k, `${id}-${children.length + 1}`);
    if (lead) child.props.lead = lead;
    lead = '';
    children.push(child);
  });
  return { id, type: 'group', props: { open: node.open, close, ...(lead ? { tail: lead } : {}), children } };
}

/** Tokenise markup into tags and text. */
export function tokenizeHtml(html = '') {
  const out = [];
  const re = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;
  let last = 0; let m;
  const s = String(html);
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ tag: m[0] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

const EDITABLE_ATTRS = new Set(['href', 'src', 'alt', 'title', 'aria-label']);
/** True when `next` only changes text, links, image src/alt versus `base`. */
export function sameSkeleton(base, next) {
  const a = tokenizeHtml(base); const b = tokenizeHtml(next);
  const tagsA = a.filter((t) => t.tag); const tagsB = b.filter((t) => t.tag);
  if (tagsA.length !== tagsB.length) return false;
  if (b.some((t) => t.text && /[<>]/.test(t.text))) return false;
  return tagsA.every((ta, i) => {
    const tb = tagsB[i].tag;
    if (ta.tag === tb) return true;
    const na = ta.tag.match(/^<\/?([a-zA-Z0-9-]+)/)?.[1]; const nb = tb.match(/^<\/?([a-zA-Z0-9-]+)/)?.[1];
    if (na !== nb || ta.tag.startsWith('</') || tb.startsWith('</')) return false;
    const aa = attrsOf(ta.tag); const ab = attrsOf(tb);
    const keys = new Set([...Object.keys(aa), ...Object.keys(ab)]);
    for (const k of keys) {
      if (aa[k] === ab[k]) continue;
      if (!EDITABLE_ATTRS.has(k) || ab[k] == null) return false;
      if (k === 'href' && !safeHref(decodeEntities(ab[k]))) return false;
      if (k === 'src' && !safeSrc(decodeEntities(ab[k]))) return false;
      if (/[<>"]/.test(ab[k])) return false;
    }
    return true;
  });
}

/** Add Studio-only presentation (width, item limit) to an element's open tag; untouched when unset. */
export function tweakOpen(html, p = {}) {
  let out = String(html || '');
  if (Number.isInteger(p.limit)) {
    const slotRe = /<[a-zA-Z0-9-]+\b[^>]*?(?:data-home-slot="[^"]*"|data-photo-gallery)[^>]*>/;
    out = out.replace(slotRe, (tag) => (/\sdata-limit="[^"]*"/.test(tag)
      ? tag.replace(/\sdata-limit="[^"]*"/, ` data-limit="${p.limit}"`)
      : tag.replace(/(\/?>)$/, ` data-limit="${p.limit}"$1`)));
  }
  if (Number.isInteger(p.span) && p.span >= 1 && p.span < GRID_COLUMNS) {
    const width = `width:${+((p.span / GRID_COLUMNS) * 100).toFixed(3)}%;max-width:100%`;
    out = out.replace(/^(<[a-zA-Z0-9-]+)([^>]*?)(\/?>)/, (all, t, rest, end) => (
      /\sstyle="/.test(rest) ? `${t}${rest.replace(/\sstyle="([^"]*)"/, (s, v) => ` style="${v}${v && !/;\s*$/.test(v) ? ';' : ''}${width}"`)}${end}` : `${t}${rest} style="${width}"${end}`
    ));
  }
  return out;
}

export const TREE_TYPES = new Set(['el', 'group', 'live']);

function treeBaseline(baseline) {
  const map = new Map();
  const visit = (b) => {
    if (!b) return;
    if (TREE_TYPES.has(b.type)) map.set(b.id, b);
    (b.props?.children || []).forEach(visit);
  };
  (baseline?.sections || []).forEach((s) => (s.blocks || []).forEach(visit));
  return map;
}

function validateTreeBlock(block, bw, errors, { allowHtml, base, takeId }) {
  const p = block.props || {};
  if (p.lead != null && (typeof p.lead !== 'string' || p.lead.trim())) errors.push(`${bw}: lead must be whitespace`);
  if (p.span != null && !(isInt(p.span) && p.span >= 1 && p.span <= GRID_COLUMNS)) errors.push(`${bw}: width must be 1-${GRID_COLUMNS} columns`);
  if (p.hidden != null && typeof p.hidden !== 'boolean') errors.push(`${bw}: hidden must be true/false`);
  const old = base.get(block.id);
  const unsafe = (h) => /<script\b|\son[a-z]+\s*=|javascript:/i.test(String(h || ''));
  if (block.type === 'el') {
    if (typeof p.html !== 'string' || !/^<[a-zA-Z]/.test(p.html)) { errors.push(`${bw}: element html required`); return; }
    if (!allowHtml) {
      if (!old || old.type !== 'el') errors.push(`${bw}: new markup elements are Super Admin only`);
      else if (!sameSkeleton(old.props.html, p.html)) errors.push(`${bw}: only words, links and images can change here`);
      else if (unsafe(p.html) && !unsafe(old.props.html)) errors.push(`${bw}: scripts are not allowed`);
    }
  } else if (block.type === 'live') {
    if (!LIVE_SOURCES[p.source]) errors.push(`${bw}: unknown live source ${p.source}`);
    if (typeof p.html !== 'string') errors.push(`${bw}: live html required`);
    if (p.limit != null && !(isInt(p.limit) && p.limit >= 1 && p.limit <= 24)) errors.push(`${bw}: number of items must be 1-24`);
    const template = Object.values(LIVE_TEMPLATES).includes(p.html);
    if (!allowHtml && !template && !(old && old.type === 'live' && old.props.html === p.html && old.props.source === p.source)) {
      errors.push(`${bw}: live data blocks can't be hand-edited`);
    }
  } else if (block.type === 'group') {
    if (typeof p.open !== 'string' || !/^<[a-zA-Z]/.test(p.open) || typeof p.close !== 'string') { errors.push(`${bw}: group open/close required`); return; }
    if (!Array.isArray(p.children)) { errors.push(`${bw}: group needs children`); return; }
    if (p.tail != null && (typeof p.tail !== 'string' || p.tail.trim())) errors.push(`${bw}: tail must be whitespace`);
    if (!allowHtml) {
      if (!old || old.type !== 'group' || old.props.open !== p.open || old.props.close !== p.close) errors.push(`${bw}: this container's markup is Super Admin only`);
      else {
        const allowedKids = new Set((old.props.children || []).map((c) => c.id));
        p.children.forEach((c) => { if (!allowedKids.has(c?.id) && !(c?.type === 'live' && Object.values(LIVE_TEMPLATES).includes(c?.props?.html))) errors.push(`${bw}: ${c?.id} can only move inside its own container`); });
      }
    }
    p.children.forEach((kid, ki) => {
      const kw = `${bw} > ${kid?.id || ki}`;
      takeId(kid, kw);
      if (!TREE_TYPES.has(kid?.type) && kid?.type !== 'html') { errors.push(`${kw}: ${kid?.type} cannot go inside a container`); return; }
      if (kid.type === 'html') {
        if (!allowHtml && !(old && (old.props.children || []).some((c) => c.id === kid.id && c.type === 'html' && c.props?.html === kid.props?.html))) errors.push(`${kw}: html blocks are Super Admin only`);
        return;
      }
      validateTreeBlock(kid, kw, errors, { allowHtml, base, takeId });
    });
  }
}

function renderTree(block, ctx) {
  const p = block.props || {};
  if (block.type === 'el') return tweakOpen(p.html, p);
  if (block.type === 'live') {
    if (p.hidden) return ctx.annotate ? `<div class="studio-live-hidden">Hidden: live data from ${escapeHtml(LIVE_SOURCES[p.source]?.label || p.source)}</div>` : '';
    return tweakOpen(p.html, p);
  }
  if (block.type === 'html') return String(p.html || '');
  if (block.type === 'group') {
    const kids = (p.children || []).map((kid) => {
      const inner = renderTree(kid, ctx);
      return `${kid.props?.lead || ''}${ctx.annotate ? `<!--sb:${escapeHtml(kid.id)}-->${inner}<!--/sb-->` : inner}`;
    }).join('');
    return `${tweakOpen(p.open, p)}${kids}${p.tail || ''}${p.close}`;
  }
  return '';
}


/** Replace the contents of every element whose open tag matches `test` (editor canvas live preview). */
export function replaceElementInner(html, test, innerFor) {
  const src = String(html || '');
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  let out = ''; let last = 0; let m;
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (tok.startsWith('<!--') || tok.startsWith('</') || !test(tok)) continue;
    const name = m[1].toLowerCase();
    if (VOID_TAGS.has(name)) continue;
    const start = re.lastIndex;
    const inner = new RegExp(`<!--[\\s\\S]*?-->|<\\/?${name}\\b[^>]*>`, 'gi');
    inner.lastIndex = start;
    let depth = 1; let t;
    while ((t = inner.exec(src))) {
      if (t[0].startsWith('<!--')) continue;
      depth += t[0].startsWith('</') ? -1 : 1;
      if (depth === 0) break;
    }
    if (!t) break;
    const next = innerFor(tok, src.slice(start, t.index));
    out += src.slice(last, start) + (next == null ? src.slice(start, t.index) : next);
    last = t.index;
    re.lastIndex = t.index;
  }
  return out + src.slice(last);
}

/** Try to express one legacy element as a structured block; null if it would not round-trip. */
function structuredBlock(node, id) {
  const a = attrsOf(node.open);
  const inner = node.html.slice(node.open.length, node.html.length - `</${node.tag}>`.length);
  if (/<|&(?!amp;|lt;|gt;|quot;|#39;)/.test(inner)) return null;
  const text = decodeEntities(inner);
  const keys = Object.keys(a);
  let block = null;
  if (/^h[1-4]$/.test(node.tag) && keys.every((k) => k === 'data-cms-field')) {
    block = { id, type: 'heading', props: { level: Number(node.tag[1]), text, ...(a['data-cms-field'] ? { field: a['data-cms-field'] } : {}) } };
  } else if (node.tag === 'div' && a.class === 'kicker' && keys.every((k) => k === 'class' || k === 'data-cms-field')) {
    block = { id, type: 'heading', props: { style: 'kicker', text, ...(a['data-cms-field'] ? { field: a['data-cms-field'] } : {}) } };
  } else if (node.tag === 'p' && keys.every((k) => k === 'data-cms-field')) {
    block = { id, type: 'text', props: { rich: { paragraphs: [[{ text }]] }, ...(a['data-cms-field'] ? { field: a['data-cms-field'] } : {}) } };
  }
  if (!block) return null;
  return blockInner(block) === node.html ? block : null;
}

function nodesToBlocks(nodes, prefix, ctx = {}) {
  const blocks = [];
  let y = 0;
  nodes.forEach((node, i) => {
    const id = `${prefix}-${i + 1}`;
    const structured = node.tag ? structuredBlock(node, id) : null;
    const tree = !structured && node.tag && node.tag !== 'x' && !ctx.noTree ? treeBlock(node, id) : null;
    const block = structured || tree || { id, type: 'html', props: { html: node.html, locked: true } };
    blocks.push({ ...block, x: 0, y, w: 12, h: 1 });
    y += 1;
  });
  return blocks;
}

/**
 * Convert legacy page HTML into a layout whose render is byte-identical.
 * Each top-level <section> becomes a flow section; its single wrapper div
 * (page-title / wrap) becomes the section wrap; the children become blocks.
 * Anything that would not round-trip is kept as a locked html block.
 */
export function htmlToLayout(html = '', ctx = {}) {
  const src = String(html || '');
  const top = splitTopLevel(src);
  const sections = [];
  const fallback = () => ({ version: 1, grid: { columns: GRID_COLUMNS, rowUnit: GRID_ROW_UNIT, gap: GRID_GAP }, sections: [
    { id: 's1', variant: 'plain', flow: true, wrap: 'none', raw: true, blocks: [{ id: 's1-1', type: 'html', x: 0, y: 0, w: 12, h: 1, props: { html: src, locked: true } }] },
  ] });
  if (!top) return fallback();
  let n = 0;
  for (const node of top) {
    n += 1;
    const sid = `s${n}`;
    if (node.tag !== 'section') { sections.push(null); break; }
    const a = attrsOf(node.open);
    const allowed = Object.keys(a).every((k) => k === 'class' || SECTION_ATTRS.includes(k));
    const rebuiltOpen = `<section${a.class != null ? ` class="${a.class}"` : ''}${Object.entries(a).filter(([k]) => k !== 'class').map(([k, v]) => ` ${k}="${v}"`).join('')}>`;
    if (!allowed || rebuiltOpen !== node.open || /[<>&"]/.test(Object.values(a).join(''))) { sections.push(null); break; }
    const inner = node.html.slice(node.open.length, node.html.length - '</section>'.length);
    const kids = splitTopLevel(inner);
    const attrs = {}; for (const [k, v] of Object.entries(a)) if (k !== 'class') attrs[k] = v;
    const section = { id: sid, variant: /page-hero/.test(a.class || '') ? 'hero' : 'content', flow: true, className: a.class ?? null, attrs, wrap: 'none', blocks: [] };
    if (kids && kids.length === 1 && kids[0].tag === 'div') {
      const wa = attrsOf(kids[0].open);
      if (Object.keys(wa).length === 1 && wa.class && kids[0].open === `<div class="${wa.class}">` && CLASS_RE.test(wa.class)) {
        section.wrap = wa.class === 'page-title' ? 'page-title' : 'wrap';
        if (wa.class !== section.wrap) section.wrapClass = wa.class;
        const wrapInnerHtml = kids[0].html.slice(kids[0].open.length, kids[0].html.length - '</div>'.length);
        const leaves = splitTopLevel(wrapInnerHtml);
        if (leaves) {
          // Coming-soon logos become the auto logos block.
          section.blocks = nodesToBlocks(leaves, sid, ctx).map((b) => {
            const auto = blockInner({ type: 'logos', props: { auto: true } }, ctx);
            return (b.type === 'html' || b.type === 'el' || b.type === 'group') && blockInner(b, ctx) === auto ? { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, type: 'logos', props: { auto: true } } : b;
          });
        } else section.blocks = nodesToBlocks([{ tag: 'x', open: '', html: wrapInnerHtml }], sid);
      }
    }
    if (!section.blocks.length) {
      section.blocks = kids ? nodesToBlocks(kids, sid, ctx) : nodesToBlocks([{ tag: 'x', open: '', html: inner }], sid);
    }
    sections.push(section);
  }
  const split = () => {
    if (ctx.noSplit) return fallback();
    const out = splitLayout(src, ctx);
    return out && renderLayout(out, ctx) === src ? out : fallback();
  };
  if (!sections.length || sections.includes(null)) return split();
  const layout = { version: 1, grid: { columns: GRID_COLUMNS, rowUnit: GRID_ROW_UNIT, gap: GRID_GAP }, sections };
  return renderLayout(layout, ctx) === src ? layout : split();
}

/**
 * Fallback migration that still splits a page into separately selectable
 * pieces: an optional outer <div> wrapper, then each top-level node becomes
 * its own section (a structured flow section when it round-trips, otherwise
 * a locked html block). Render stays byte-identical or the caller falls back.
 */
function splitLayout(src, ctx) {
  let top = splitTopLevel(src);
  if (!top) return null;
  let wrapOpen = null;
  if (top.length === 1 && top[0].tag === 'div' && WRAP_OPEN_RE.test(top[0].open)) {
    wrapOpen = top[0].open;
    top = splitTopLevel(top[0].html.slice(top[0].open.length, top[0].html.length - '</div>'.length));
    if (!top) return null;
  }
  const sections = [];
  let raw = null; let n = 0;
  for (const node of top) {
    const isWs = !node.tag && !node.html.trim();
    if (isWs && raw) {
      const last = raw.blocks[raw.blocks.length - 1];
      if (last.type === 'html') last.props.html += node.html;
      else raw.blocks.push({ id: `${raw.id}-${raw.blocks.length + 1}`, type: 'html', x: 0, y: raw.blocks.length, w: 12, h: 1, props: { html: node.html, locked: true, spacing: true } });
      continue;
    }
    let sec = null;
    if (node.tag === 'section') {
      const tryLayout = htmlToLayoutSections(node.html, `s${n + 1}`, ctx);
      if (tryLayout) sec = tryLayout;
    }
    n += 1;
    if (sec) { sections.push(sec); raw = null; continue; }
    if (!raw) { raw = { id: `s${n}`, variant: 'plain', flow: true, wrap: 'none', raw: true, blocks: [] }; sections.push(raw); }
    const bid = `${raw.id}-${raw.blocks.length + 1}`;
    const tree = node.tag && !ctx.noTree ? treeBlock(node, bid) : null;
    raw.blocks.push({ ...(tree || { id: bid, type: 'html', props: { html: node.html, locked: true } }), x: 0, y: raw.blocks.length, w: 12, h: 1 });
  }
  if (!sections.length) return null;
  return { version: 1, grid: { columns: GRID_COLUMNS, rowUnit: GRID_ROW_UNIT, gap: GRID_GAP }, ...(wrapOpen ? { wrapOpen } : {}), sections };
}

function htmlToLayoutSections(html, sid, ctx) {
  const one = htmlToLayout(html, { ...ctx, noSplit: true });
  if (!one || one.sections.length !== 1 || one.sections[0].raw) return null;
  const sec = one.sections[0];
  sec.id = sid;
  sec.blocks.forEach((b, i) => { b.id = `${sid}-${i + 1}`; });
  return renderLayout({ version: 1, sections: [sec] }, ctx) === html ? sec : null;
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
  const m = url.pathname.match(/^\/api\/admin\/studio\/pages\/([a-z0-9-]+)(?:\/(draft|publish|restore|editor|render|migrate|upload))?$/);
  if (!m) return null;
  const { requireLogin, jsonResponse, canEditPageContent, canEditPageLayout, isSuperAdmin } = deps;
  const renderCtx = deps.renderCtx ? await deps.renderCtx() : {};
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
    return jsonResponse({ ...state, can_layout: canLayout, can_html: admin, can_flag: admin, editor_uid: user?.id ?? null, live_sources: LIVE_SOURCES, live_templates: LIVE_TEMPLATES });
  }
  if (action === 'draft' && method === 'DELETE') {
    // Discard all unpublished changes: drop the draft row only. Live page untouched.
    await ensureStudioSchema(env);
    await env.DB.prepare('DELETE FROM page_drafts WHERE slug = ?').bind(slug).run();
    return jsonResponse({ ok: true, discarded: 'draft' });
  }
  if (method !== 'POST' && !(action === 'draft' && (method === 'PUT'))) return jsonResponse({ detail: 'Method not allowed' }, 405);
  await ensureStudioSchema(env);
  const page = await env.DB.prepare('SELECT slug, path, editor, live_version_id FROM cms_pages WHERE slug = ?').bind(slug).first();
  if (!page) return jsonResponse({ detail: 'Page not found' }, 404);
  const invalidate = async () => { if (deps.invalidate) await deps.invalidate(page.path); };
  if (action === 'upload') return handleStudioUpload(request, env, slug, user, jsonResponse);
  const body = action === 'upload' ? {} : await request.json().catch(() => ({}));
  const baselineP = currentBaseline(env, slug, page.live_version_id);

  const checkLayout = async (layout) => {
    const result = validateLayout(layout, { allowHtml: admin, baseline: await baselineP });
    if (!result.ok) return jsonResponse({ detail: 'Layout is not valid', errors: result.errors }, 422);
    if (!canLayout) {
      const baseline = await baselineP;
      if (!isContentOnlyChange(baseline, layout)) {
        return jsonResponse({ detail: `Permission required: layout:${slug}`, code: 'layout_required' }, 403);
      }
    }
    return null;
  };

  if (action === 'render') {
    const result = validateLayout(body.layout, { allowHtml: admin, baseline: await baselineP });
    if (!result.ok) return jsonResponse({ detail: 'Layout is not valid', errors: result.errors }, 422);
    let html = renderLayout(body.layout, { ...renderCtx, annotate: Boolean(body.annotate) });
    // Editor canvas: show live data blocks filled with today's data.
    if (body.annotate && deps.decorateLive) html = await deps.decorateLive(html, slug).catch(() => html);
    return jsonResponse({ html });
  }
  if (action === 'migrate') {
    // Super Admin: build a draft from the page's legacy HTML (byte-identical render).
    if (!admin) return jsonResponse({ detail: 'Only a Super Admin can migrate pages' }, 403);
    const legacy = deps.legacyBodyHtml ? await deps.legacyBodyHtml(slug) : '';
    const layout = htmlToLayout(legacy, renderCtx);
    const html = renderLayout(layout, renderCtx);
    return jsonResponse({ layout, identical: html === legacy, legacy_bytes: legacy.length });
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
    const html = renderLayout(layout, renderCtx);
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
    await invalidate();
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
    await invalidate();
    return jsonResponse({ ok: true, editor });
  }
  return jsonResponse({ detail: 'Not found' }, 404);
}

// ---------- R2 image upload (10 MB cap) ----------
const IMAGE_TYPES = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};
export function sniffImageType(bytes) {
  for (const [type, sigs] of Object.entries(IMAGE_TYPES)) {
    if (sigs.some((sig) => sig.every((b, i) => bytes[i] === b))) {
      if (type === 'image/webp' && String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP') continue;
      return type;
    }
  }
  return '';
}

async function handleStudioUpload(request, env, slug, user, jsonResponse) {
  if (request.method !== 'POST') return jsonResponse({ detail: 'Method not allowed' }, 405);
  if (!env.FILES) return jsonResponse({ detail: 'File storage is not configured' }, 503);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > STUDIO_UPLOAD_MAX_BYTES + 64 * 1024) return jsonResponse({ detail: 'Images must be 10 MB or smaller' }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return jsonResponse({ detail: 'Choose an image to upload' }, 422);
  if (file.size > STUDIO_UPLOAD_MAX_BYTES) return jsonResponse({ detail: 'Images must be 10 MB or smaller' }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return jsonResponse({ detail: 'Only PNG, JPEG, GIF or WebP images can be uploaded' }, 415);
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[type];
  const key = `studio/${slug}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  try {
    await env.DB.prepare('INSERT INTO studio_files (r2_key, kind, mime, size, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(key, 'image', type, bytes.length, String(file.name || '').slice(0, 200), user.id ?? null).run();
  } catch { /* index row is best effort */ }
  return jsonResponse({ ok: true, src: `/uploads/${key}`, size: bytes.length, mime: type });
}

/** Serve /uploads/studio/<slug>/<file> from R2. */
export async function serveStudioUpload(env, path) {
  const key = path.replace(/^\/uploads\//, '');
  if (!/^studio\/[a-z0-9-]+\/[a-z0-9-]+\.(png|jpg|gif|webp)$/.test(key) || !env.FILES) return null;
  const obj = await env.FILES.get(key);
  if (!obj) return null;
  return new Response(obj.body, { headers: {
    'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  } });
}

/** Block delete rules shared with the Studio editor (admin-studio.js mirrors these). */
export function isDeletableBlock(block, { canLayout = false, isAdmin = false } = {}) {
  if (!block || !canLayout || block.type === 'live') return false;
  if (block.type === 'html' && block.props?.locked && !isAdmin) return false;
  if (block.type === 'group' && !isAdmin) return false;
  return true;
}
export function countInnerBlocks(block) {
  return (block?.props?.children || []).reduce((n, k) => n + 1 + countInnerBlocks(k), 0);
}
/** Returns a new layout without the block (and everything inside it). */
export function removeBlockById(layout, id) {
  const next = structuredClone(layout); let removed = null;
  const strip = (list) => list.filter((b) => { if (b.id === id) { removed = b; return false; } if (b.props?.children) b.props.children = strip(b.props.children); return true; });
  next.sections.forEach((s) => { s.blocks = strip(s.blocks); });
  return { layout: next, removed, inner: removed ? countInnerBlocks(removed) : 0 };
}
