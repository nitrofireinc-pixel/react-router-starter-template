/**
 * Content vs layout page grants and Users-form normalization.
 * page:{slug} = content only. layout:{slug} implies page:{slug}.
 * pages = layout on every page plus Add Page / settings.
 */

const FORBIDDEN = new Set(['security-log', 'security', 'audit', 'audit-log', 'admin-audit']);

export function parsePermissionList(value) {
  const filterSafe = (items) => items
    .filter((item) => typeof item === 'string')
    .map((item) => String(item).trim())
    .filter((item) => item && !FORBIDDEN.has(item.toLowerCase()));
  if (Array.isArray(value)) return filterSafe(value);
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? filterSafe(parsed) : [];
  } catch {
    return [];
  }
}

function permissionKey(item) {
  return String(item || '').trim().toLowerCase();
}

export function samePermissionList(left, right) {
  const a = parsePermissionList(left).map(permissionKey).sort();
  const b = parsePermissionList(right).map(permissionKey).sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Normalize stored/assigned grants.
 * - layout:x always adds page:x
 * - drop page:/layout: for unknown slugs when a slug list is provided
 * - minutes → minutes:edit; drop minutes:view
 */
export function normalizePageGrants(perms, slugs = []) {
  const known = new Set(
    (Array.isArray(slugs) ? slugs : [])
      .map((slug) => String(slug || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const out = [];
  const seen = new Set();
  const add = (item) => {
    const key = String(item || '').trim();
    const lower = key.toLowerCase();
    if (!key || seen.has(lower)) return;
    seen.add(lower);
    out.push(lower.includes(':') ? lower : key);
  };
  const layoutSlugs = new Set();
  for (const raw of parsePermissionList(perms)) {
    const lower = permissionKey(raw);
    if (!lower || lower === 'minutes:view') continue;
    if (lower === 'minutes') {
      add('minutes:edit');
      continue;
    }
    const page = lower.match(/^page:([a-z0-9-]+)$/);
    const layout = lower.match(/^layout:([a-z0-9-]+)$/);
    if (page) {
      if (known.size && !known.has(page[1])) continue;
      add(`page:${page[1]}`);
      continue;
    }
    if (layout) {
      if (known.size && !known.has(layout[1])) continue;
      layoutSlugs.add(layout[1]);
      add(`layout:${layout[1]}`);
      continue;
    }
    add(lower);
  }
  for (const slug of layoutSlugs) add(`page:${slug}`);
  return out;
}

export function pageSettingsChanged(page, existing, raw = null) {
  if (!page || !existing) return false;
  const requested = raw && typeof raw === 'object' ? raw : null;
  const asked = (key) => !requested || Object.prototype.hasOwnProperty.call(requested, key);
  const nextPath = existing.is_home ? '/' : existing.path;
  return (asked('slug') && String(page.slug || '') !== String(existing.slug || ''))
    || (asked('path') && String(page.path || '') !== String(nextPath || ''))
    || (asked('nav_order') && Number(page.nav_order) !== Number(existing.nav_order))
    || (asked('is_home') && Boolean(Number(page.is_home)) !== Boolean(Number(existing.is_home)))
    || (asked('active') && Number(page.active) !== Number(existing.active));
}

export function classListFromAttrs(attrs = '') {
  const raw = String(attrs || '');
  const match = raw.match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const value = match ? (match[1] || match[2] || match[3] || '') : '';
  return value.split(/\s+/).map((part) => part.trim()).filter((part) => part && part !== 'gjs-selected');
}

export function attrFromTag(attrs = '', name = '') {
  const raw = String(attrs || '');
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = raw.match(re);
  return String(match ? (match[1] || match[2] || match[3] || '') : '').trim();
}

function isRepeatableContent(tag, classes) {
  if (tag === 'li') return true;
  if (classes.includes('card') && !classes.includes('page-hero')) return true;
  return false;
}

function hasHiddenAttribute(attrs = '') {
  return /(?:^|[\s/])hidden(?:\s|=|\/|>|$)/i.test(String(attrs || ''));
}

function normalizeInlineStyle(style = '') {
  return String(style || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Inline style / hidden / aria-hidden on a block are layout, not content. */
export function visualVisibilitySignature(attrs = '') {
  const hidden = hasHiddenAttribute(attrs) ? 'hidden' : '';
  const aria = attrFromTag(attrs, 'aria-hidden').toLowerCase();
  const style = normalizeInlineStyle(attrFromTag(attrs, 'style'));
  return [hidden, aria ? `aria-hidden=${aria}` : '', style].filter(Boolean).join(';');
}

/**
 * Ordered structural fingerprint. Text, href, img src/alt, list items, and
 * cards are content. Sections / visual blocks / locked blocks are layout.
 */
export function extractVisualCss(html = '') {
  const styles = [];
  String(html || '').replace(
    /<style\b[^>]*\bdata-visual-css\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_, css) => {
      styles.push(String(css || ''));
      return '';
    },
  );
  return styles.join('\n');
}

/** Normalized CSS fingerprint. Style-block edits are layout, not content. */
export function visualStyleSignature(html = '') {
  return extractVisualCss(html).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export const CONTENT_ONLY_TEXT_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li',
]);
export const CONTENT_ONLY_HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function parseHtmlAttrMap(attrs = '') {
  const raw = String(attrs || '');
  const map = {};
  if (hasHiddenAttribute(raw)) map.hidden = '';
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = re.exec(raw))) {
    map[String(match[1] || '').toLowerCase()] = String(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return map;
}

export function scanHtmlElements(html = '') {
  const source = String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  const els = [];
  const re = /<([a-zA-Z][a-zA-Z0-9:-]*)\b([^>]*?)(\/?)>/g;
  let match;
  while ((match = re.exec(source))) {
    const tag = String(match[1] || '').toLowerCase();
    if (tag === 'script' || tag === 'style') continue;
    els.push({ tag, attrs: match[2] || '', attrMap: parseHtmlAttrMap(match[2] || '') });
  }
  return els;
}

function isSafeContentHref(value = '') {
  const href = String(value || '').trim();
  if (!href) return true;
  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
    return true;
  }
  if (/^(mailto|tel):/i.test(href)) return true;
  if (/^https?:\/\//i.test(href)) return true;
  return false;
}

function isContentOnlyContentAttr(tag, name, value) {
  if (tag === 'a' && name === 'href') return isSafeContentHref(value);
  if (tag === 'img' && (name === 'src' || name === 'alt')) return true;
  return false;
}

function contentOnlyLayoutFingerprint(el) {
  const layout = {};
  for (const [name, value] of Object.entries(el.attrMap || {})) {
    if (isContentOnlyContentAttr(el.tag, name, value)) continue;
    layout[name] = name === 'style' ? normalizeInlineStyle(value) : String(value);
  }
  const keys = Object.keys(layout).sort();
  return `${el.tag}|${keys.map((key) => `${key}=${layout[key]}`).join(';')}`;
}

function hasContentOnlyLayoutAttrs(el) {
  return Object.entries(el.attrMap || {}).some(([name, value]) => (
    !isContentOnlyContentAttr(el.tag, name, value)
  ));
}

/** Returns a reason string when content-only HTML changes layout, else null. */
export function contentOnlyHtmlViolation(baseline = '', next = '') {
  const before = scanHtmlElements(baseline);
  const after = scanHtmlElements(next);
  const baselineHeadings = new Set(
    before.filter((el) => CONTENT_ONLY_HEADING_TAGS.has(el.tag)).map((el) => el.tag),
  );
  const freelyAddable = (tag) => CONTENT_ONLY_TEXT_TAGS.has(tag) || baselineHeadings.has(tag);
  const beforeCounts = new Map();
  for (const el of before) beforeCounts.set(el.tag, (beforeCounts.get(el.tag) || 0) + 1);
  const afterCounts = new Map();
  for (const el of after) afterCounts.set(el.tag, (afterCounts.get(el.tag) || 0) + 1);
  for (const [tag, count] of afterCounts) {
    if (count > (beforeCounts.get(tag) || 0) && !freelyAddable(tag)) {
      return `new <${tag}> is not allowed for content-only editors`;
    }
  }
  const beforeByTag = new Map();
  for (const el of before) {
    const list = beforeByTag.get(el.tag) || [];
    list.push(el);
    beforeByTag.set(el.tag, list);
  }
  const afterByTag = new Map();
  for (const el of after) {
    const list = afterByTag.get(el.tag) || [];
    list.push(el);
    afterByTag.set(el.tag, list);
  }
  for (const [tag, afterEls] of afterByTag) {
    const beforeEls = beforeByTag.get(tag) || [];
    for (let i = 0; i < afterEls.length; i += 1) {
      const next = afterEls[i];
      const prev = beforeEls[i];
      const nextAttrs = next.attrMap || {};
      const prevAttrs = prev?.attrMap || {};
      for (const [name, value] of Object.entries(nextAttrs)) {
        if (isContentOnlyContentAttr(tag, name, value)) continue;
        if (!prev || String(prevAttrs[name] ?? '') !== String(value)) {
          return `${name} is not allowed on <${tag}> for content-only editors`;
        }
      }
    }
  }
  const sensitive = (els) => els
    .filter((el) => !freelyAddable(el.tag) || hasContentOnlyLayoutAttrs(el))
    .map(contentOnlyLayoutFingerprint)
    .sort();
  if (sensitive(before).join('\n') !== sensitive(after).join('\n')) {
    return 'style, class, hidden, or other non-whitelisted attributes changed';
  }
  return null;
}

export function visualStructureSignature(html = '') {
  const source = String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const nodes = [];
  const re = /<(section|article|aside|header|footer|details|div)\b([^>]*)>/gi;
  let match;
  while ((match = re.exec(source))) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const classes = classListFromAttrs(attrs);
    const block = attrFromTag(attrs, 'data-visual-block');
    const locked = /\bdata-visual-locked\b/i.test(attrs);
    if (isRepeatableContent(tag, classes) && !block && !locked) continue;
    const structural = tag === 'section'
      || tag === 'article'
      || tag === 'aside'
      || tag === 'header'
      || tag === 'footer'
      || tag === 'details'
      || Boolean(block)
      || locked;
    if (!structural) continue;
    nodes.push([
      tag,
      block || '',
      [...classes].sort().join('.'),
      visualVisibilitySignature(attrs),
    ].join('|'));
  }
  return nodes.join('>');
}

export async function migrateStoredUserPermissionGrants(env) {
  if (!env?.DB?.prepare) return { updated: 0 };
  const statement = env.DB.prepare('SELECT id, permissions FROM users');
  if (typeof statement.all !== 'function') return { updated: 0 };
  const rows = await statement.all();
  let updated = 0;
  for (const row of rows?.results || []) {
    const next = normalizePageGrants(row.permissions, []);
    if (samePermissionList(row.permissions, next)) continue;
    await env.DB.prepare('UPDATE users SET permissions = ? WHERE id = ?')
      .bind(JSON.stringify(next), row.id)
      .run();
    updated += 1;
  }
  return { updated };
}
