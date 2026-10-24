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
export const BLOCK_TYPES = ['heading', 'text', 'button', 'image', 'logos', 'spacer', 'divider', 'html', 'card'];
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

/** Collect locked html blocks (id -> html) so non-admins may keep migrated markup. */
export function lockedHtmlById(layout) {
  const map = new Map();
  const visit = (block) => {
    if (block?.type === 'html' && block.props?.locked) map.set(block.id, String(block.props.html || ''));
    if (block?.type === 'card') (block.props?.children || []).forEach(visit);
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
  const locked = lockedHtmlById(baseline);
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
      validateBlockProps(block, bw, errors, htmlOk);
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
  return { id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, mobile: b.mobile || null, props };
}

function structureOf(layout) {
  return JSON.stringify((layout?.sections || []).map((s) => ({
    id: s.id, variant: s.variant || 'plain', style: s.style || null, flow: Boolean(s.flow),
    wrap: s.wrap || null, className: s.className || null, wrapClass: s.wrapClass || null, attrs: s.attrs || null,
    blocks: (s.blocks || []).map(blockStructure),
  })));
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
    case 'card': {
      const cls = p.className ? escapeHtml(p.className) : 'card';
      const tag = p.tag === 'article' ? 'article' : 'div';
      return `<${tag} class="${cls}"${fieldAttr(p)}>${(p.children || []).map((kid) => blockInner(kid, ctx)).join('')}</${tag}>`;
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
  const sections = (layout.sections || []).map((section) => {
    if (section.raw) return sortBlocks(section.blocks).map((block) => blockInner(block, ctx)).join('');
    if (section.flow) {
      const inner = sortBlocks(section.blocks).map((block) => blockInner(block, ctx)).join('');
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
        const style = `grid-column:${block.x + 1} / span ${block.w};grid-row:${block.y + 1} / span ${block.h}${order !== null ? `;--studio-order:${order}` : ''}`;
        return `<div class="studio-block studio-${block.type}${hide}" data-block="${escapeHtml(block.id)}" style="${style}">${blockInner(block, ctx)}</div>`;
      }).join('');
    const inner = `<div class="studio-grid">${blocks}</div>`;
    return `<section class="${SECTION_CLASS[variant]}${extra}" data-section="${escapeHtml(section.id)}"${sectionAttrs(section)}>${wrapInner(section, inner)}</section>`;
  }).join('');
  if (!usesGrid) return sections;
  const css = `<style>.studio-grid{display:grid;grid-template-columns:repeat(${GRID_COLUMNS},minmax(0,1fr));grid-auto-rows:minmax(${GRID_ROW_UNIT}px,auto);gap:${GRID_GAP}px}.studio-block>:first-child{margin-top:0}.studio-block>:last-child{margin-bottom:0}@media (max-width:720px){.studio-grid{display:flex;flex-direction:column}.studio-block{order:var(--studio-order,0)}.studio-hide-mobile{display:none}}</style>`;
  return `${css}${sections}`;
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

function nodesToBlocks(nodes, prefix) {
  const blocks = [];
  let y = 0;
  nodes.forEach((node, i) => {
    const id = `${prefix}-${i + 1}`;
    const structured = node.tag ? structuredBlock(node, id) : null;
    const block = structured || { id, type: 'html', props: { html: node.html, locked: true } };
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
          section.blocks = nodesToBlocks(leaves, sid).map((b) => {
            const auto = blockInner({ type: 'logos', props: { auto: true } }, ctx);
            return b.type === 'html' && b.props.html === auto ? { ...b, type: 'logos', props: { auto: true } } : b;
          });
        } else section.blocks = nodesToBlocks([{ tag: 'x', open: '', html: wrapInnerHtml }], sid);
      }
    }
    if (!section.blocks.length) {
      section.blocks = kids ? nodesToBlocks(kids, sid) : nodesToBlocks([{ tag: 'x', open: '', html: inner }], sid);
    }
    sections.push(section);
  }
  if (!sections.length || sections.includes(null)) return fallback();
  const layout = { version: 1, grid: { columns: GRID_COLUMNS, rowUnit: GRID_ROW_UNIT, gap: GRID_GAP }, sections };
  return renderLayout(layout, ctx) === src ? layout : fallback();
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
    return jsonResponse({ ...state, can_layout: canLayout, can_html: admin, can_flag: admin });
  }
  if (method !== 'POST' && !(action === 'draft' && method === 'PUT')) return jsonResponse({ detail: 'Method not allowed' }, 405);
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
    return jsonResponse({ html: renderLayout(body.layout, renderCtx) });
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
