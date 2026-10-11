/**
 * Mixed page blocks (hero + fundraiser cards) for the visual editor.
 *
 * Per-page enable line — add a slug here to turn this on for another page:
 *   PAGE_BLOCKS_ENABLED_SLUGS
 */

export const PAGE_BLOCKS_ENABLED_SLUGS = Object.freeze(['fundraising']);
export const PAGE_BLOCK_KINDS = Object.freeze(['hero', 'fundraiser']);
export const PAGE_BLOCK_REVS = Object.freeze(['draft', 'live']);
export const SILENT_AUCTION_HELP_LINE = 'Students and parents help needed';

export const PAGE_BLOCKS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS page_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_slug TEXT NOT NULL,
  rev TEXT NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  ref_id INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  corner_tag TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  highlight TEXT NOT NULL DEFAULT '',
  button_text TEXT NOT NULL DEFAULT '',
  button_link TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER
)
`.trim();

export const PAGE_BLOCKS_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_page_blocks_page_rev ON page_blocks (page_slug, rev, sort_order, id)';

export const REPAIR_SILENT_AUCTION_DESCRIPTION_SQL = `
UPDATE fundraiser_cards
SET description = '${SILENT_AUCTION_HELP_LINE}'
WHERE title = 'Silent Auction' AND trim(coalesce(description, '')) = ''
`.trim();

export function pageBlocksSchemaStatements() {
  return [PAGE_BLOCKS_TABLE_SQL, PAGE_BLOCKS_INDEX_SQL];
}

export function pageBlocksEnabled(slug = '') {
  return PAGE_BLOCKS_ENABLED_SLUGS.includes(normalizePageBlockSlug(slug));
}

export function normalizePageBlockSlug(slug = '') {
  return String(slug || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

export function plainBlockText(value) {
  return String(value || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

export function sanitizeBlockLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^donate$/i.test(raw)) return 'donate';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw.slice(0, 500);
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') return url.toString().slice(0, 500);
  } catch {
    // ignore
  }
  return '';
}

export function defaultHeroCardFields() {
  return {
    kind: 'hero',
    ref_id: null,
    hidden: 0,
    corner_tag: 'New card',
    label: 'Fundraising goal',
    title: 'New marching uniforms',
    body: 'Every donation and fundraiser this fall goes toward new uniforms for the Blue Regiment.',
    highlight: '$4,200 of $10,000 raised',
    button_text: 'Give toward uniforms',
    button_link: 'donate',
  };
}

const HERO_FIELDS = Object.freeze([
  'corner_tag', 'label', 'title', 'body', 'highlight', 'button_text', 'button_link',
]);

export function sanitizePageBlock(raw = {}, index = 0) {
  const kind = PAGE_BLOCK_KINDS.includes(String(raw.kind || '').toLowerCase())
    ? String(raw.kind).toLowerCase()
    : '';
  if (!kind) return null;
  const refId = Number(raw.ref_id);
  return {
    id: Number(raw.id) > 0 ? Number(raw.id) : null,
    client_key: String(raw.client_key || raw.key || '').slice(0, 80),
    sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : index,
    kind,
    ref_id: kind === 'fundraiser' && Number.isFinite(refId) && refId > 0 ? refId : null,
    hidden: Number(raw.hidden) ? 1 : 0,
    corner_tag: kind === 'hero' ? plainBlockText(raw.corner_tag) : '',
    label: kind === 'hero' ? plainBlockText(raw.label) : '',
    title: kind === 'hero' ? plainBlockText(raw.title) : '',
    body: kind === 'hero' ? plainBlockText(raw.body) : '',
    highlight: kind === 'hero' ? plainBlockText(raw.highlight) : '',
    button_text: kind === 'hero' ? plainBlockText(raw.button_text) : '',
    button_link: kind === 'hero' ? sanitizeBlockLink(raw.button_link) : '',
  };
}

export function sanitizePageBlockList(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => sanitizePageBlock(item, index))
    .filter(Boolean)
    .slice(0, 40);
}

export function pageBlockIdentity(block = {}) {
  if (block.kind === 'fundraiser' && Number(block.ref_id) > 0) return `fundraiser:${Number(block.ref_id)}`;
  if (Number(block.id) > 0) return `hero:${Number(block.id)}`;
  if (block.client_key) return String(block.client_key);
  return `hero:new:${plainBlockText(block.title) || 'untitled'}`;
}

export function pageBlockLayoutChanged(before = [], after = []) {
  const left = sanitizePageBlockList(before).map(pageBlockIdentity);
  const right = sanitizePageBlockList(after).map(pageBlockIdentity);
  if (left.length !== right.length) return true;
  return left.some((key, index) => key !== right[index]);
}

export function pageBlockFieldDiffs(before = [], after = []) {
  const prev = new Map(sanitizePageBlockList(before).map((block) => [pageBlockIdentity(block), block]));
  const next = sanitizePageBlockList(after);
  const diffs = [];
  const seen = new Set();
  next.forEach((block, index) => {
    const key = pageBlockIdentity(block);
    seen.add(key);
    const older = prev.get(key);
    if (!older) {
      diffs.push({
        op: 'add',
        key,
        kind: block.kind,
        fields: block.kind === 'hero'
          ? Object.fromEntries(HERO_FIELDS.map((field) => [field, { before: '', after: block[field] }]))
          : { ref_id: { before: '', after: String(block.ref_id || '') } },
      });
      return;
    }
    const fields = {};
    if (Number(older.hidden) !== Number(block.hidden)) {
      fields.hidden = { before: String(older.hidden), after: String(block.hidden) };
    }
    if (older.sort_order !== index && older.sort_order !== block.sort_order) {
      fields.sort_order = { before: String(older.sort_order), after: String(index) };
    }
    if (block.kind === 'hero') {
      HERO_FIELDS.forEach((field) => {
        if (String(older[field] || '') !== String(block[field] || '')) {
          fields[field] = { before: String(older[field] || ''), after: String(block[field] || '') };
        }
      });
    }
    if (Object.keys(fields).length) {
      const op = fields.hidden && Object.keys(fields).length === 1
        ? 'hide'
        : (fields.sort_order && Object.keys(fields).every((name) => name === 'sort_order' || name === 'hidden')
          ? 'move'
          : 'edit');
      diffs.push({ op, key, kind: block.kind, fields });
    }
  });
  prev.forEach((block, key) => {
    if (seen.has(key)) return;
    diffs.push({
      op: 'delete',
      key,
      kind: block.kind,
      fields: block.kind === 'hero'
        ? Object.fromEntries(HERO_FIELDS.map((field) => [field, { before: block[field], after: '' }]))
        : { ref_id: { before: String(block.ref_id || ''), after: '' } },
    });
  });
  return diffs;
}

export function renderHeroCardButton(block = {}) {
  const text = plainBlockText(block.button_text) || 'Learn more';
  const link = sanitizeBlockLink(block.button_link);
  if (!text) return '';
  if (link === 'donate') {
    return `<button type="button" class="btn btn-navy" data-donate-open>${escapeHtml(text)}</button>`;
  }
  if (link) {
    return `<a class="btn btn-navy" href="${escapeAttr(link)}">${escapeHtml(text)}</a>`;
  }
  return `<span class="btn btn-navy">${escapeHtml(text)}</span>`;
}

export function renderHeroCardHtml(block = {}, { editable = false } = {}) {
  const pill = plainBlockText(block.corner_tag);
  const label = plainBlockText(block.label);
  const title = plainBlockText(block.title) || 'Hero card';
  const body = plainBlockText(block.body);
  const highlight = plainBlockText(block.highlight);
  const field = (name, tag, value, placeholder) => (
    editable
      ? `<${tag} data-hero-field="${name}" contenteditable="true" data-placeholder="${escapeAttr(placeholder)}">${escapeHtml(value)}</${tag}>`
      : (value ? `<${tag}>${escapeHtml(value)}</${tag}>` : '')
  );
  const pillHtml = editable || pill
    ? `<span class="fundraising-hero-pill${pill ? '' : ' is-empty'}"${editable ? ' data-hero-field="corner_tag" contenteditable="true" data-placeholder="Corner tag"' : ''}>${escapeHtml(pill)}</span>`
    : '';
  const highlightHtml = editable
    ? `<div class="fundraising-hero-highlight${highlight ? '' : ' is-empty'}" data-hero-field="highlight" contenteditable="true" data-placeholder="Highlight">${escapeHtml(highlight)}</div>`
    : (highlight ? `<div class="fundraising-hero-highlight">${escapeHtml(highlight)}</div>` : '');
  const button = renderHeroCardButton(block);
  const buttonWrap = editable
    ? `<div class="fundraising-hero-button" data-hero-button>
        ${button}
        <label class="fundraising-hero-link">Button link
          <input type="text" data-hero-field="button_link" value="${escapeAttr(block.button_link || '')}" placeholder="donate, /page.html, or https://">
        </label>
        <span class="fundraising-hero-button-text" data-hero-field="button_text" contenteditable="true" data-placeholder="Button text">${escapeHtml(plainBlockText(block.button_text) || 'Learn more')}</span>
      </div>`
    : button;
  return `<article class="fundraising-hero-card${Number(block.hidden) ? ' is-hidden' : ''}" data-page-block="hero">
    ${pillHtml}
    <div class="fundraising-hero-grid">
      <div class="fundraising-hero-copy">
        ${editable || label ? `<span class="fundraising-hero-label${label ? '' : ' is-empty'}"${editable ? ' data-hero-field="label" contenteditable="true" data-placeholder="Label"' : ''}>${escapeHtml(label)}</span>` : ''}
        ${field('title', 'h3', title, 'Title')}
        ${editable || body ? `<p class="fundraising-hero-text${body ? '' : ' is-empty'}"${editable ? ' data-hero-field="body" contenteditable="true" data-placeholder="Text"' : ''}>${escapeHtml(body)}</p>` : ''}
      </div>
      <div class="fundraising-hero-aside">
        ${highlightHtml}
        ${buttonWrap}
      </div>
    </div>
  </article>`;
}

export function mapPageBlockRow(row) {
  return sanitizePageBlock(row);
}

export function publicPageBlocksStatement(env, slug = 'fundraising') {
  return env.DB.prepare(`
    SELECT id, page_slug, rev, sort_order, kind, ref_id, hidden,
           corner_tag, label, title, body, highlight, button_text, button_link
    FROM page_blocks
    WHERE page_slug = ? AND rev = 'live'
    ORDER BY sort_order ASC, id ASC
  `).bind(normalizePageBlockSlug(slug));
}

export function mergePublicPageBlocks(blocks = [], cards = [], today = '') {
  const list = sanitizePageBlockList(blocks).filter((block) => !Number(block.hidden));
  const cardMap = new Map((Array.isArray(cards) ? cards : []).map((card) => [Number(card.id), card]));
  const used = new Set();
  const ordered = [];
  list.forEach((block) => {
    if (block.kind === 'hero') {
      ordered.push({ type: 'hero', block });
      return;
    }
    const card = cardMap.get(Number(block.ref_id));
    if (!card) return;
    used.add(Number(card.id));
    ordered.push({ type: 'fundraiser', block, card });
  });
  (Array.isArray(cards) ? cards : []).forEach((card) => {
    if (used.has(Number(card.id))) return;
    ordered.push({
      type: 'fundraiser',
      block: { kind: 'fundraiser', ref_id: Number(card.id), hidden: 0 },
      card,
    });
  });
  return ordered;
}

export function blocksFromFundraiserCards(cards = []) {
  return (Array.isArray(cards) ? cards : []).map((card, index) => ({
    id: null,
    kind: 'fundraiser',
    ref_id: Number(card.id) || null,
    hidden: 0,
    sort_order: index,
    corner_tag: '',
    label: '',
    title: '',
    body: '',
    highlight: '',
    button_text: '',
    button_link: '',
  })).filter((block) => block.ref_id);
}

let pageBlocksSchemaReady = false;
let pageBlocksSchemaPromise = null;

export function resetPageBlocksSchemaCache() {
  pageBlocksSchemaReady = false;
  pageBlocksSchemaPromise = null;
}

export async function ensurePageBlocksSchema(env) {
  if (pageBlocksSchemaReady) return;
  if (!pageBlocksSchemaPromise) {
    pageBlocksSchemaPromise = (async () => {
      await env.DB.prepare(PAGE_BLOCKS_TABLE_SQL).run();
      await env.DB.prepare(PAGE_BLOCKS_INDEX_SQL).run();
      pageBlocksSchemaReady = true;
    })()
      .catch((error) => {
        pageBlocksSchemaReady = false;
        throw error;
      })
      .finally(() => {
        pageBlocksSchemaPromise = null;
      });
  }
  await pageBlocksSchemaPromise;
}

export async function repairSilentAuctionDescription(env) {
  if (!env?.DB?.prepare) return { updated: false };
  try {
    const result = await env.DB.prepare(REPAIR_SILENT_AUCTION_DESCRIPTION_SQL).run();
    return { updated: Boolean(result?.meta?.changes || result?.success) };
  } catch {
    return { updated: false };
  }
}

export async function listPageBlocks(env, slug, rev = 'draft') {
  const key = normalizePageBlockSlug(slug);
  const version = PAGE_BLOCK_REVS.includes(rev) ? rev : 'draft';
  await ensurePageBlocksSchema(env);
  const result = await env.DB.prepare(`
    SELECT id, page_slug, rev, sort_order, kind, ref_id, hidden,
           corner_tag, label, title, body, highlight, button_text, button_link
    FROM page_blocks
    WHERE page_slug = ? AND rev = ?
    ORDER BY sort_order ASC, id ASC
  `).bind(key, version).all();
  return (result?.results || []).map(mapPageBlockRow).filter(Boolean);
}

async function writePageBlockRev(env, slug, rev, items, user = null) {
  const key = normalizePageBlockSlug(slug);
  const actorId = Number(user?.id) || null;
  await env.DB.prepare('DELETE FROM page_blocks WHERE page_slug = ? AND rev = ?').bind(key, rev).run();
  const rows = sanitizePageBlockList(items);
  if (!rows.length) return rows;
  const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(', ');
  const binds = [];
  rows.forEach((block, index) => {
    binds.push(
      key,
      rev,
      index,
      block.kind,
      block.ref_id,
      block.hidden,
      block.corner_tag,
      block.label,
      block.title,
      block.body,
      block.highlight,
      block.button_text,
      block.button_link,
      actorId,
    );
  });
  await env.DB.prepare(`
    INSERT INTO page_blocks (
      page_slug, rev, sort_order, kind, ref_id, hidden,
      corner_tag, label, title, body, highlight, button_text, button_link, updated_by
    ) VALUES ${placeholders}
  `).bind(...binds).run();
  return rows;
}

export async function savePageBlocks(env, {
  slug,
  items = [],
  publish = false,
  user = null,
  seedCards = [],
} = {}) {
  const key = normalizePageBlockSlug(slug);
  if (!pageBlocksEnabled(key)) {
    const error = new Error('Page blocks are not enabled for this page.');
    error.status = 409;
    throw error;
  }
  await ensurePageBlocksSchema(env);
  const incoming = sanitizePageBlockList(items);
  const payload = incoming.length ? incoming : blocksFromFundraiserCards(seedCards);
  await writePageBlockRev(env, key, 'draft', payload, user);
  if (publish) await writePageBlockRev(env, key, 'live', payload, user);
  return listPageBlocks(env, key, 'draft');
}

export async function loadPageBlocksState(env, slug, cards = []) {
  const key = normalizePageBlockSlug(slug);
  if (!pageBlocksEnabled(key)) {
    return { enabled: false, draft: [], live: [], cards };
  }
  await ensurePageBlocksSchema(env);
  await repairSilentAuctionDescription(env);
  let draft = await listPageBlocks(env, key, 'draft');
  const live = await listPageBlocks(env, key, 'live');
  if (!draft.length) draft = live.length ? live : blocksFromFundraiserCards(cards);
  const known = new Set(draft.filter((block) => block.kind === 'fundraiser').map((block) => Number(block.ref_id)));
  (Array.isArray(cards) ? cards : []).forEach((card) => {
    if (known.has(Number(card.id))) return;
    draft.push({
      ...blocksFromFundraiserCards([card])[0],
      sort_order: draft.length,
    });
    known.add(Number(card.id));
  });
  return { enabled: true, draft, live, cards };
}
