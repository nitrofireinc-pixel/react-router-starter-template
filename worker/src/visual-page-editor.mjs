/**
 * Generic CMS visual editor (GrapesJS).
 * Publish writes sanitized HTML onto cms_pages.body_html so public pages
 * stay on the existing single cached page read.
 */

import {
  renderAdminChromeBar,
  renderAdminSidebarBackdrop,
  renderAdminSidebarHtml,
} from './admin-chrome.mjs';
import {
  contentOnlyForbiddenHtmlViolation,
  contentOnlyHtmlViolation,
  visualStructureSignature,
  visualStyleSignature,
} from './page-permissions.mjs';

export { visualStructureSignature, visualStyleSignature };

export const VISUAL_PILOT_SLUG = 'join';
export const VISUAL_PILOT_PATH = '/join.html';
export const VISUAL_VERSION_LIMIT = 20;
export const VISUAL_EDITOR_PATH_PREFIX = '/admin/visual';
export const VISUAL_EDITOR_PATH = '/admin/visual/join';
export const VISUAL_EDITOR_NOT_YET_SLUGS = Object.freeze(['home', 'in-kind', 'letterman-jacket']);
export const CODE_RENDERED_EMPTY_BODY_SLUGS = Object.freeze(['in-kind', 'letterman-jacket']);

export function normalizeVisualSlug(slug = '') {
  return String(slug || '').trim().toLowerCase();
}

export function isVisualEditorSlug(slug = '') {
  const key = normalizeVisualSlug(slug);
  if (!key || !/^[a-z0-9-]+$/.test(key)) return false;
  return !VISUAL_EDITOR_NOT_YET_SLUGS.includes(key);
}

export function isVisualPilotSlug(slug = '') {
  return isVisualEditorSlug(slug);
}

export function visualEditorPath(slug = '') {
  return `${VISUAL_EDITOR_PATH_PREFIX}/${normalizeVisualSlug(slug)}`;
}

export function canEditVisualPage(user, slug, canEditPage) {
  if (!user || !isVisualEditorSlug(slug)) return false;
  if (typeof canEditPage === 'function') return Boolean(canEditPage(user, normalizeVisualSlug(slug)));
  return false;
}

export function canEditVisualLayout(user, slug, canEditPageLayout) {
  if (!user || !isVisualEditorSlug(slug)) return false;
  if (typeof canEditPageLayout === 'function') return Boolean(canEditPageLayout(user, normalizeVisualSlug(slug)));
  return false;
}

function layoutRequiredError(slug, detail = '') {
  const error = new Error(detail || `Permission required: layout:${normalizeVisualSlug(slug)}`);
  error.status = 403;
  error.code = 'layout_required';
  return error;
}

export function canEditVisualPilot(user, canEditPage) {
  return canEditVisualPage(user, VISUAL_PILOT_SLUG, canEditPage);
}

export function isVisualPublishedRow(row) {
  return Boolean(String(row?.published_at || '').trim());
}

const ALLOWED_TAGS = new Set([
  'section', 'article', 'aside', 'div', 'p', 'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'a', 'img', 'strong', 'b', 'em', 'i', 'u', 'br',
  'span', 'details', 'summary', 'figure', 'figcaption', 'header',
  'small', 'blockquote',
]);

const VOID_TAGS = new Set(['br', 'img']);

export const LIVE_DATA_LOCK_KINDS = Object.freeze([
  { test: /\bid\s*=\s*["']caldev-app["']|\bclass=["'][^"']*\bcaldev-app\b/i, kind: 'calendar' },
  { test: /\bdata-events\b/i, kind: 'events' },
  { test: /\bdata-photo-gallery\b/i, kind: 'gallery' },
  { test: /\bdata-sponsors\b/i, kind: 'sponsors' },
  { test: /\bdata-staff\b/i, kind: 'staff' },
  { test: /\bdata-booster-meetings\b/i, kind: 'booster-meetings' },
  { test: /\bdata-booster-members\b/i, kind: 'booster-members' },
  { test: /\bdata-boosters-dues\b/i, kind: 'dues' },
  { test: /\bdata-contact-form-slot\b/i, kind: 'contact-form' },
  { test: /\bdata-contact-form\b/i, kind: 'contact-form' },
  { test: /\bdata-cms-form\b/i, kind: 'form' },
  { test: /\bdata-email-list-signup\b/i, kind: 'email-list' },
  { test: /\bdata-sponsor-tiers\b/i, kind: 'sponsor-tiers' },
  { test: /\bdata-fundraising-cards\b/i, kind: 'fundraiser' },
  { test: /\bdata-donate-open\b/i, kind: 'donate' },
  { test: /\bdata-dues-open\b/i, kind: 'dues' },
  { test: /\bdata-sponsor-choice-open\b/i, kind: 'sponsor-form' },
]);

export function liveDataLockKind(attrs = '') {
  const text = String(attrs || '');
  for (const item of LIVE_DATA_LOCK_KINDS) {
    if (item.test.test(text)) return item.kind;
  }
  return '';
}

export function wrapLiveDataAsLocked(html = '') {
  return String(html || '').replace(/<([a-z0-9]+)([^>]*)>/gi, (match, tag, attrs) => {
    if (/\bdata-visual-locked\b/i.test(attrs)) return match;
    const kind = liveDataLockKind(attrs);
    if (!kind) return match;
    return `<${tag}${attrs} data-visual-locked="${kind}">`;
  });
}

function findHtmlElementRange(html, start) {
  const open = String(html || '').slice(start).match(/^<([a-z0-9]+)([^>]*)>/i);
  if (!open) return null;
  const tag = open[1].toLowerCase();
  const openLen = open[0].length;
  if (VOID_TAGS.has(tag) || /\/\s*>$/.test(open[0])) {
    return { start, end: start + openLen };
  }
  const re = new RegExp(`</?${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start + openLen;
  let depth = 1;
  let match;
  while ((match = re.exec(html))) {
    if (match[0].startsWith('</')) depth -= 1;
    else if (!/\/\s*>$/.test(match[0])) depth += 1;
    if (depth === 0) return { start, end: match.index + match[0].length };
  }
  return { start, end: start + openLen };
}

export function extractLockedVisualRegions(html = '') {
  const source = String(html || '');
  const blocks = [];
  let out = '';
  let last = 0;
  const openRe = /<([a-z0-9]+)([^>]*\bdata-visual-locked\b[^>]*)>/gi;
  let match;
  while ((match = openRe.exec(source))) {
    const range = findHtmlElementRange(source, match.index);
    if (!range) continue;
    out += source.slice(last, range.start);
    out += `<!--visual-locked-${blocks.length}-->`;
    blocks.push(source.slice(range.start, range.end));
    last = range.end;
    openRe.lastIndex = range.end;
  }
  out += source.slice(last);
  return { html: out, blocks };
}

export function lockedKindFromHtml(html = '') {
  const source = String(html || '');
  const named = source.match(/\bdata-visual-locked\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/i);
  const value = String(named?.[1] || named?.[2] || named?.[3] || '').trim().toLowerCase();
  if (value && /^[a-z0-9-]{1,32}$/.test(value)) return value;
  return liveDataLockKind(source) || 'widget';
}

export function canonicalLockedPlaceholder(kind = '') {
  const key = String(kind || '').trim().toLowerCase() || 'widget';
  const lock = ` data-visual-locked="${key}"`;
  switch (key) {
    case 'calendar':
      return `<div id="caldev-app" class="caldev-app visual-locked-slot"${lock} aria-live="polite"></div>`;
    case 'events':
      return `<div class="timeline visual-locked-slot"${lock} data-events></div>`;
    case 'gallery':
      return `<div class="photo-gallery visual-locked-slot"${lock} data-photo-gallery></div>`;
    case 'sponsors':
      return `<div class="sponsor-directory visual-locked-slot"${lock} data-sponsors></div>`;
    case 'staff':
      return `<div class="directory visual-locked-slot"${lock} data-staff></div>`;
    case 'booster-meetings':
      return `<div class="timeline booster-meetings visual-locked-slot"${lock} data-booster-meetings></div>`;
    case 'booster-members':
      return `<div class="directory visual-locked-slot"${lock} data-booster-members></div>`;
    case 'dues':
      return `<div class="card accent-card boosters-dues-card visual-locked-slot"${lock} data-boosters-dues><span class="tag">Band dues</span><h3>Pay band dues</h3><p class="visual-locked-label">Pay dues (locked)</p><span class="btn primary" data-dues-open>Pay dues</span></div>`;
    case 'contact-form':
      return `<div class="visual-locked-slot"${lock} data-contact-form-slot><p class="visual-locked-label">Contact form (locked)</p></div>`;
    case 'form':
      return `<div class="visual-locked-slot"${lock} data-cms-form><p class="visual-locked-label">Form (locked)</p></div>`;
    case 'email-list':
      return `<div class="visual-locked-slot"${lock} data-email-list-signup><p class="visual-locked-label">Email signup (locked)</p></div>`;
    case 'sponsor-tiers':
      return `<section class="sponsor-tiers visual-locked-slot"${lock} data-sponsor-tiers><p class="visual-locked-label">Sponsor packages (locked)</p></section>`;
    case 'fundraiser':
      return `<div class="visual-locked-slot"${lock} data-fundraising-cards><p class="visual-locked-label">Fundraiser cards (locked)</p></div>`;
    case 'donate':
      return `<span class="btn outline visual-locked-slot"${lock} data-donate-open>Donate</span>`;
    case 'sponsor-form':
      return `<span class="btn primary visual-locked-slot"${lock} data-sponsor-choice-open>Sponsor/In-Kind</span>`;
    default:
      return `<div class="visual-locked-slot"${lock}><p class="visual-locked-label">Live section (locked)</p></div>`;
  }
}

export function replaceLockedVisualBlocks(html = '') {
  const pulled = extractLockedVisualRegions(String(html || ''));
  let out = pulled.html;
  pulled.blocks.forEach((block, index) => {
    out = out.replace(`<!--visual-locked-${index}-->`, canonicalLockedPlaceholder(lockedKindFromHtml(block)));
  });
  return out;
}

export function stripVisualLockedLabels(html = '') {
  return String(html || '').replace(
    /<([a-z0-9]+)\b[^>]*\bvisual-locked-label\b[^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );
}

export function htmlForPublicVisualPublish(html = '') {
  return stripVisualLockedLabels(String(html || ''));
}

export function sanitizeLockedVisualHtml(html = '') {
  return canonicalLockedPlaceholder(lockedKindFromHtml(html));
}

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

export function isGrapesJsAutoId(value = '') {
  return /^i[a-z0-9]{2,8}$/i.test(String(value || '').trim());
}

function sanitizeVisualId(value = '') {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,60}$/.test(id)) return '';
  if (isGrapesJsAutoId(id)) return '';
  return id;
}

function isSafeVisualSelector(selector = '') {
  const value = String(selector || '').trim();
  if (!value || value.length > 180) return false;
  if (/#i[a-z0-9]{2,8}\b/i.test(value)) return false;
  if (/[>:@*[\]=+"'`\\]|url\s*\(|expression|javascript:/i.test(value)) return false;
  return /^[#.]?[a-zA-Z][a-zA-Z0-9#.\s_-]*$/.test(value);
}

const SAFE_LENGTH = /^[-+]?\d*\.?\d+\s*(px|em|rem|%|vh|vw)$/i;
const SAFE_BOX = /^(0|auto|[-+]?\d*\.?\d+\s*(px|em|rem|%|vh|vw))(\s+(0|auto|[-+]?\d*\.?\d+\s*(px|em|rem|%|vh|vw))){0,3}$/i;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
const STYLEABLE_TAGS = new Set([
  'section', 'article', 'aside', 'div', 'p', 'span', 'header', 'figure',
  'img', 'a', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'details',
]);

function sanitizeStyle(value = '', tag = '') {
  const parts = [];
  let sawMaxWidth = false;
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
    if (prop === 'width' && (SAFE_LENGTH.test(next) || next === 'auto')) {
      if (/px$/i.test(next) && next !== 'auto') {
        if (!sawMaxWidth) {
          parts.push(`max-width: ${next}`);
          sawMaxWidth = true;
        }
        parts.push(tag === 'img' ? 'width: auto' : 'width: 100%');
      } else {
        parts.push(`width: ${next}`);
      }
    } else if (['height', 'min-width', 'min-height', 'max-width', 'max-height'].includes(prop)
      && (SAFE_LENGTH.test(next) || next === 'auto')) {
      if (prop === 'max-width') sawMaxWidth = true;
      parts.push(`${prop}: ${next}`);
    }
    if (['margin', 'padding'].includes(prop) && SAFE_BOX.test(next)) parts.push(`${prop}: ${next}`);
    if (/^(margin|padding)-(top|right|bottom|left)$/.test(prop)
      && (SAFE_LENGTH.test(next) || next === 'auto' || next === '0')) {
      parts.push(`${prop}: ${next}`);
    }
    if (prop === 'position' && /^(static|relative)$/i.test(next)) parts.push(`position: ${next}`);
    if (prop === 'display' && /^(block|inline|inline-block|flex|none)$/i.test(next)) parts.push(`display: ${next}`);
    if (prop === 'flex-direction' && /^(row|column)$/i.test(next)) parts.push(`flex-direction: ${next}`);
    if (prop === 'justify-content' && /^(flex-start|flex-end|center|space-between|space-around)$/i.test(next)) {
      parts.push(`justify-content: ${next}`);
    }
    if (prop === 'align-items' && /^(stretch|flex-start|flex-end|center)$/i.test(next)) parts.push(`align-items: ${next}`);
    if (prop === 'gap' && SAFE_LENGTH.test(next)) parts.push(`gap: ${next}`);
    if (prop === 'object-fit' && /^(contain|cover|fill|none)$/i.test(next)) parts.push(`object-fit: ${next}`);
    if (prop === 'border-radius' && SAFE_BOX.test(next)) parts.push(`border-radius: ${next}`);
  }
  return parts.join('; ');
}

export function sanitizeVisualCss(css = '') {
  const source = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
  let index = 0;
  const out = [];

  function skipSpace() {
    while (index < source.length && /\s/.test(source[index])) index += 1;
  }

  function readUntil(char) {
    const start = index;
    while (index < source.length && source[index] !== char) index += 1;
    return source.slice(start, index);
  }

  function readBlock() {
    if (source[index] !== '{') return '';
    index += 1;
    let depth = 1;
    const start = index;
    while (index < source.length && depth) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') depth -= 1;
      if (depth) index += 1;
    }
    const body = source.slice(start, index);
    if (source[index] === '}') index += 1;
    return body;
  }

  function sanitizeRuleList(body = '') {
    const rules = [];
    let cursor = 0;
    const text = String(body || '');
    while (cursor < text.length) {
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
      if (cursor >= text.length) break;
      const selStart = cursor;
      while (cursor < text.length && text[cursor] !== '{') cursor += 1;
      const selector = text.slice(selStart, cursor).trim();
      if (text[cursor] !== '{') break;
      cursor += 1;
      const bodyStart = cursor;
      let depth = 1;
      while (cursor < text.length && depth) {
        if (text[cursor] === '{') depth += 1;
        else if (text[cursor] === '}') depth -= 1;
        if (depth) cursor += 1;
      }
      const decls = text.slice(bodyStart, cursor);
      if (text[cursor] === '}') cursor += 1;
      if (!isSafeVisualSelector(selector)) continue;
      const tag = (selector.match(/(?:^|\s)([a-z][a-z0-9-]{0,16})(?:$|[#.\s])/i) || [])[1] || '';
      const clean = sanitizeStyle(decls.replace(/[{}]/g, ''), tag);
      if (clean) rules.push(`${selector}{${clean}}`);
    }
    return uniqueVisualCssRules(rules).join('');
  }

  while (index < source.length) {
    skipSpace();
    if (index >= source.length) break;
    if (source.slice(index, index + 6).toLowerCase() === '@media') {
      const header = readUntil('{');
      const max = header.match(/max-width\s*:\s*(\d{2,4})\s*px/i);
      const body = readBlock();
      if (!max) continue;
      const rules = sanitizeRuleList(body);
      if (rules) out.push(`@media (max-width: ${max[1]}px){${rules}}`);
      continue;
    }
    if (source[index] === '@') {
      readUntil('{');
      readBlock();
      continue;
    }
    const selector = readUntil('{').trim();
    const body = readBlock();
    if (!isSafeVisualSelector(selector)) continue;
    const tag = (selector.match(/(?:^|\s)([a-z][a-z0-9-]{0,16})(?:$|[#.\s])/i) || [])[1] || '';
    const clean = sanitizeStyle(body.replace(/[{}]/g, ''), tag);
    if (clean) out.push(`${selector}{${clean}}`);
  }
  return uniqueVisualCssRules(out).join('');
}

function uniqueVisualCssRules(rules = []) {
  const seen = new Set();
  const unique = [];
  for (const rule of rules) {
    if (!rule || seen.has(rule)) continue;
    seen.add(rule);
    unique.push(rule);
  }
  return unique;
}

function attr(name, value) {
  return ` ${name}="${escapeAttr(value)}"`;
}

function quotedAttr(attrs, name) {
  const match = String(attrs || '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match?.[1] || match?.[2] || '';
}

const VISUAL_DATA_ATTRS = Object.freeze([
  'data-visual-block',
  'data-visual-locked',
  'data-contact-form-slot',
  'data-contact-form',
  'data-photo-gallery',
  'data-sponsors',
  'data-staff',
  'data-booster-meetings',
  'data-booster-members',
  'data-boosters-dues',
  'data-cms-form',
  'data-email-list-signup',
  'data-sponsor-tiers',
  'data-fundraising-cards',
  'data-donate-open',
  'data-dues-open',
  'data-sponsor-choice-open',
  'data-events',
  'data-limit',
  'data-sort',
]);

function appendVisualDataAttrs(open, rawAttrs) {
  let next = open;
  for (const name of VISUAL_DATA_ATTRS) {
    const match = String(rawAttrs || '').match(new RegExp(
      `\\b${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s/>]+)))?`,
      'i',
    ));
    if (!match) continue;
    const value = String(match[1] || match[2] || match[3] || '').trim();
    if (!value) {
      next += ` ${name}`;
      continue;
    }
    if (!/^[a-z0-9,-]{1,64}$/i.test(value)) continue;
    next += attr(name, value.toLowerCase() === value || name === 'data-visual-locked' || name === 'data-visual-block' || name === 'data-cms-form'
      ? value
      : value);
  }
  return next;
}

function rewriteOpenTag(tag, rawAttrs) {
  const attrs = String(rawAttrs || '').replace(/(?:^|[/\s])on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s/>]+)/gi, ' ');
  if (tag === 'br') return '<br>';
  if (tag === 'img') {
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/i);
    const src = srcMatch?.[1] || srcMatch?.[2] || srcMatch?.[3] || '';
    if (!isSafeVisualImageSrc(src)) return '';
    const altMatch = attrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const alt = altMatch?.[1] || altMatch?.[2] || 'Photo';
    const className = sanitizeClassName(quotedAttr(attrs, 'class'));
    const id = sanitizeVisualId(quotedAttr(attrs, 'id'));
    const style = sanitizeStyle(quotedAttr(attrs, 'style'), 'img');
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${id ? attr('id', id) : ''}${className ? attr('class', className) : ''}${style ? attr('style', style) : ''}>`;
  }
  let open = `<${tag}`;
  const id = sanitizeVisualId(quotedAttr(attrs, 'id'));
  if (id) open += attr('id', id);
  const className = sanitizeClassName((attrs.match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || [])[1] || '');
  if (className) open += attr('class', className);
  open = appendVisualDataAttrs(open, attrs);
  if (tag === 'a') {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/i);
    const href = hrefMatch?.[1] || hrefMatch?.[2] || hrefMatch?.[3] || '';
    if (!isSafeVisualHref(href)) return '';
    open += attr('href', href);
    const targetMatch = attrs.match(/\btarget\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const target = targetMatch?.[1] || targetMatch?.[2] || '';
    if (target === '_blank') open += ' target="_blank" rel="noopener noreferrer"';
  }
  const style = sanitizeStyle((attrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || [])[1] || '', tag);
  if (style && STYLEABLE_TAGS.has(tag)) {
    open += attr('style', style);
  }
  if (/(?:^|[\s/])hidden(?:\s|=|\/|>|$)/i.test(attrs)) open += ' hidden';
  const ariaHidden = quotedAttr(attrs, 'aria-hidden');
  if (ariaHidden === 'true' || ariaHidden === 'false') open += attr('aria-hidden', ariaHidden);
  if (tag === 'details' && /\bopen\b/i.test(attrs)) open += ' open';
  return `${open}>`;
}

export function sanitizeVisualPageHtml(dirty = '') {
  const replaced = replaceLockedVisualBlocks(String(dirty || ''));
  const styles = [];
  let html = replaced.replace(
    /<style\b[^>]*\bdata-visual-css\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_, css) => {
      const clean = sanitizeVisualCss(css);
      if (clean) styles.push(clean);
      return '';
    },
  );
  html = html
    .replace(/<(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|svg)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|svg)[^>]*>/gi, '')
    .replace(/(?:^|[/\s])on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s/>]+)/gi, ' ')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '');
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
  const css = sanitizeVisualCss(styles.join('\n'));
  return css ? `<style data-visual-css>${css}</style>${html}` : html;
}

export function defaultJoinVisualHtml() {
  return `<section class="page-hero" data-visual-block="hero"><div class="page-title"><div class="coming-soon-logos"><img src="/assets/efhs-logo.png" alt="East Forsyth High School Eagles logo"><img src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment logo"></div><div class="kicker">Join</div><h1>Join the Band</h1><p>New students and families start here. Interest forms, handbook, and fee details will live on this page.</p></div></section><section class="content"><div class="wrap visual-join-wrap"><aside class="hero-card" data-visual-block="hero-card"><img src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment"><h2>What to bring</h2><ul><li>Student name and grade</li><li>Instrument experience, if any</li><li>A parent or guardian contact</li></ul></aside><div class="card" data-visual-block="text"><h2>How to get started</h2><p>Call the band office at <a href="tel:3367036735">(336) 703-6735</a> or send a message through the contact form. We will help you find the right ensemble.</p><p><a class="btn gold" href="/contact.html">Contact the band</a></p></div><details class="visual-accordion" data-visual-block="accordion"><summary>Do I need my own instrument?</summary><div class="visual-accordion-body"><p>Ask the directors. The program can often help with school-owned instruments.</p></div></details></div></section>`;
}

export function formatVisualHistoryTime(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = /Z|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
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

export const extractEditablePageHtml = extractEditableJoinHtml;

export function defaultVisualHtml(slug = '') {
  if (normalizeVisualSlug(slug) === VISUAL_PILOT_SLUG) return defaultJoinVisualHtml();
  return `<section class="page-hero" data-visual-block="hero"><div class="page-title"><h1>Page</h1><p>Add the page heading and intro.</p></div></section><section class="content"><div class="wrap"><div class="card" data-visual-block="text"><h2>Content</h2><p>Add page content here.</p></div></div></section>`;
}

export function importCmsBodyToVisual(html = '', slug = '') {
  const extracted = extractEditablePageHtml(html);
  const wrapped = wrapLiveDataAsLocked(extracted);
  const clean = sanitizeVisualPageHtml(wrapped);
  if (clean && !isNearEmptyVisualHtml(clean)) return clean;
  return defaultVisualHtml(slug);
}

export function overflowClassName(className = '') {
  return String(className || '')
    .split(/\s+/)
    .filter((part) => part && part !== 'gjs-selected')
    [0] || '';
}

export function overflowElementLabel({
  tag = '',
  className = '',
  text = '',
} = {}) {
  const name = String(tag || 'element').toLowerCase() || 'element';
  const cls = overflowClassName(className);
  const snippet = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  if (cls && snippet) return `${name}.${cls} (“${snippet}”)`;
  if (cls) return `${name}.${cls}`;
  if (snippet) return `${name} (“${snippet}”)`;
  return name;
}

export function formatNarrowOverflowWarning(issues = []) {
  const rows = (Array.isArray(issues) ? issues : []).filter(Boolean);
  if (!rows.length) return '';
  return rows.map((item) => {
    const width = Number(item.width) || 0;
    const viewport = Number(item.viewportWidth) || 0;
    const name = overflowElementLabel(item);
    return `At ${viewport}px, “${name}” is ${width}px wide and overflows the screen.`;
  }).join(' ');
}

export function visibleVisualText(html = '') {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNearEmptyVisualHtml(html = '') {
  return !/[a-z0-9]/i.test(visibleVisualText(html));
}

export function normalizeVisualSavePayload(raw = {}, existingHtml = '') {
  const action = String(raw.action || raw.kind || 'draft').toLowerCase() === 'publish' ? 'publish' : 'draft';
  const rawHtml = extractEditableJoinHtml(raw.html ?? raw.body_html ?? existingHtml);
  const html = sanitizeVisualPageHtml(rawHtml);
  if (!html || isNearEmptyVisualHtml(html)) {
    return { ok: false, status: 422, detail: 'Add some page content before saving.', action, rawHtml };
  }
  return { ok: true, action, html, rawHtml };
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

export async function pageHasVisualPublish(env, slug) {
  const key = normalizeVisualSlug(slug);
  if (!key) return false;
  await ensureVisualPagesSchema(env);
  const row = await env.DB.prepare(
    'SELECT published_at FROM visual_pages WHERE slug = ?',
  ).bind(key).first();
  return isVisualPublishedRow(row);
}

export async function loadVisualPageState(env, slug = VISUAL_PILOT_SLUG) {
  const key = normalizeVisualSlug(slug);
  if (!isVisualEditorSlug(key)) return null;
  await ensureVisualPagesSchema(env);
  const cms = await env.DB.prepare(
    'SELECT title, path, body_html, active FROM cms_pages WHERE slug = ?',
  ).bind(key).first();
  if (!cms) return null;
  const page = await env.DB.prepare(
    'SELECT slug, draft_html, published_html, published_at, updated_at FROM visual_pages WHERE slug = ?',
  ).bind(key).first();
  const versions = await env.DB.prepare(
    'SELECT id, kind, created_at, created_by_name FROM visual_page_versions WHERE slug = ? ORDER BY id DESC LIMIT 20',
  ).bind(key).all();
  const starter = defaultVisualHtml(key);
  const rawDraft = String(page?.draft_html || '').trim();
  const imported = rawDraft ? '' : importCmsBodyToVisual(cms.body_html || '', key);
  const draft = sanitizeVisualPageHtml(rawDraft || imported || starter) || starter;
  const published = sanitizeVisualPageHtml(page?.published_html || '') || '';
  return {
    slug: key,
    path: cms.path || (key === VISUAL_PILOT_SLUG ? VISUAL_PILOT_PATH : `/${key}.html`),
    title: cms.title || key,
    active: Number(cms.active) === 1 ? 1 : 0,
    visual_editor: true,
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
  slug = VISUAL_PILOT_SLUG,
  html,
  action = 'draft',
  user = null,
  allowStructure = true,
} = {}) {
  const key = normalizeVisualSlug(slug);
  if (!isVisualEditorSlug(key)) {
    const error = new Error('This page is not yet available in the visual editor.');
    error.status = 409;
    throw error;
  }
  await ensureVisualPagesSchema(env);
  const cms = await env.DB.prepare('SELECT slug, body_html FROM cms_pages WHERE slug = ?').bind(key).first();
  if (!cms) {
    const error = new Error('Page not found');
    error.status = 404;
    throw error;
  }
  const stored = await env.DB.prepare(
    'SELECT slug, draft_html, published_html FROM visual_pages WHERE slug = ?',
  ).bind(key).first();
  const incoming = String(html || '');
  let baseline = '';
  if (allowStructure === false) {
    baseline = sanitizeVisualPageHtml(
      stored?.draft_html || stored?.published_html || importCmsBodyToVisual(cms.body_html || '', key),
    );
    const forbidden = contentOnlyForbiddenHtmlViolation(baseline, incoming);
    if (forbidden) throw layoutRequiredError(key, forbidden);
    const incomingViolation = contentOnlyHtmlViolation(baseline, incoming);
    if (incomingViolation) throw layoutRequiredError(key, incomingViolation);
  }
  const clean = sanitizeVisualPageHtml(incoming);
  if (!clean || isNearEmptyVisualHtml(clean)) {
    const error = new Error('Add some page content before saving.');
    error.status = 422;
    throw error;
  }
  if (allowStructure === false) {
    const cleanViolation = contentOnlyHtmlViolation(baseline, clean);
    if (
      visualStructureSignature(clean) !== visualStructureSignature(baseline)
      || visualStyleSignature(clean) !== visualStyleSignature(baseline)
      || cleanViolation
    ) {
      throw layoutRequiredError(key, cleanViolation || `Permission required: layout:${key}`);
    }
  }
  const kind = action === 'publish' ? 'publish' : 'draft';
  const actorId = Number(user?.id) || null;
  const actorName = String(user?.display_name || user?.username || '').trim();
  const existing = stored;
  if (existing) {
    if (kind === 'publish') {
      await env.DB.prepare(`
        UPDATE visual_pages
        SET draft_html = ?, published_html = ?, published_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE slug = ?
      `).bind(clean, clean, actorId, key).run();
    } else {
      await env.DB.prepare(`
        UPDATE visual_pages
        SET draft_html = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE slug = ?
      `).bind(clean, actorId, key).run();
    }
  } else {
    await env.DB.prepare(`
      INSERT INTO visual_pages (slug, draft_html, published_html, published_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      key,
      clean,
      kind === 'publish' ? clean : '',
      kind === 'publish' ? new Date().toISOString() : null,
      actorId,
    ).run();
  }
  await env.DB.prepare(`
    INSERT INTO visual_page_versions (slug, kind, html, created_by, created_by_name)
    VALUES (?, ?, ?, ?, ?)
  `).bind(key, kind, clean, actorId, actorName).run();
  const rows = await env.DB.prepare(
    'SELECT id FROM visual_page_versions WHERE slug = ? ORDER BY id DESC',
  ).bind(key).all();
  const { dropIds } = trimVisualVersions(rows?.results || [], VISUAL_VERSION_LIMIT);
  for (const id of dropIds) {
    await env.DB.prepare('DELETE FROM visual_page_versions WHERE id = ?').bind(id).run();
  }
  if (kind === 'publish') {
    await env.DB.prepare(
      'UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?',
    ).bind(htmlForPublicVisualPublish(clean), key).run();
  }
  return loadVisualPageState(env, key);
}

export async function restoreVisualVersion(env, versionId, user = null, slug = VISUAL_PILOT_SLUG, options = {}) {
  const key = normalizeVisualSlug(slug);
  await ensureVisualPagesSchema(env);
  const id = Number(versionId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Version not found');
    error.status = 404;
    throw error;
  }
  const row = await env.DB.prepare(
    'SELECT id, slug, html FROM visual_page_versions WHERE id = ? AND slug = ?',
  ).bind(id, key).first();
  if (!row) {
    const error = new Error('Version not found');
    error.status = 404;
    throw error;
  }
  return saveVisualPage(env, {
    slug: key,
    html: row.html,
    action: 'draft',
    user,
    allowStructure: options.allowStructure !== false,
  });
}

export function renderVisualEditorHtml(assetVersion = 'dev', options = {}) {
  const v = escapeAttr(assetVersion);
  const slug = normalizeVisualSlug(options.slug || VISUAL_PILOT_SLUG) || VISUAL_PILOT_SLUG;
  const title = String(options.title || (slug === VISUAL_PILOT_SLUG ? 'Join the Band' : slug)).trim() || slug;
  const path = String(options.path || (slug === VISUAL_PILOT_SLUG ? VISUAL_PILOT_PATH : `/${slug}.html`)).trim()
    || `/${slug}.html`;
  const pageActive = Number(options.active) !== 0;
  const canLayout = options.canLayout !== false;
  const canSettings = options.canSettings !== false;
  const bannerLabel = pageActive ? 'This page is being edited' : 'Coming Soon (inactive)';
  const inactiveNote = pageActive
    ? ''
    : '<p class="visual-inactive-banner">Coming Soon (inactive) — visitors don\'t see this content until the page is turned on in Settings</p>';
  const layoutTools = canLayout
    ? `<button type="button" class="visual-banner-btn" data-visual-add>Add section</button>${
      slug === 'fundraising'
        ? `<button type="button" class="visual-banner-btn" data-visual-add-callout>+ Add callout</button><button type="button" class="visual-banner-btn" data-visual-add-hero>+ Add hero card</button>`
        : ''
    }`
    : '';
  const historyTool = canLayout
    ? `<button type="button" class="visual-banner-btn" data-visual-history>History</button>`
    : '';
  const addDrawer = canLayout
    ? `<aside class="visual-add-drawer" data-visual-add-drawer hidden>
    <div class="visual-add-drawer-head">
      <h2>Add a section</h2>
      <button type="button" data-visual-add-close>Close</button>
    </div>
    <div class="visual-add-grid" data-visual-add-grid></div>
  </aside>
  <aside class="visual-history-drawer" data-visual-versions hidden></aside>`
    : '';
  const styleSink = canLayout
    ? '<div id="visual-gjs-sink" data-visual-style-editor hidden></div>'
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Editing ${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/vendor/grapesjs/grapes.min.css?v=${v}">
  <link rel="stylesheet" href="/admin-nav.css?v=${v}">
  <link rel="stylesheet" href="/admin-visual.css?v=${v}">
</head>
<body class="visual-editor-body${canLayout ? '' : ' visual-content-only'}" data-visual-slug="${escapeAttr(slug)}" data-visual-path="${escapeAttr(path)}" data-visual-active="${pageActive ? '1' : '0'}" data-can-layout="${canLayout ? '1' : '0'}" data-can-settings="${canSettings ? '1' : '0'}">
  ${renderAdminChromeBar()}
  ${renderAdminSidebarBackdrop()}
  ${renderAdminSidebarHtml(v, { user: options.user, allow: options.allow })}
  <div class="visual-phone-gate" data-visual-phone-gate>
    <div class="visual-phone-gate-card">
      <h1>Please edit pages on a computer or tablet.</h1>
      <p>Phones are too small for the editor.</p>
      <div class="visual-phone-gate-actions">
        <a class="visual-banner-btn visual-banner-btn-primary" href="${escapeAttr(path)}" data-visual-view-live>View live page</a>
        <a class="visual-banner-btn" href="/admin" data-visual-back-cms>Back to CMS</a>
      </div>
    </div>
  </div>
  <div class="visual-editor-main">
  <header class="visual-edit-banner" data-visual-banner>
    <p class="visual-edit-banner-label">${escapeHtml(bannerLabel)}</p>
    <div class="visual-edit-banner-title">
      <strong>${escapeHtml(title)}</strong>
      <small>${pageActive ? 'Visitors still see the published page until you publish' : 'Coming Soon (inactive) — visitors don\'t see this content until the page is turned on in Settings'}</small>
    </div>
    ${inactiveNote}
    <div class="visual-edit-banner-tools">
      ${layoutTools}
      <button type="button" class="visual-banner-btn" data-visual-undo>Undo</button>
      <button type="button" class="visual-banner-btn" data-visual-redo>Redo</button>
      <label class="visual-device-select">Width
        <select data-visual-device-select>
          <option value="Desktop">1920</option>
          <option value="Laptop">1280</option>
          <option value="Tablet">768</option>
          <option value="Phone">390</option>
          <option value="Small">320</option>
        </select>
      </label>
      ${historyTool}
      <button type="button" class="visual-banner-btn" data-visual-draft>Save draft</button>
      <button type="button" class="visual-banner-btn visual-banner-btn-primary" data-visual-publish>Publish</button>
      <a class="visual-banner-btn" href="/admin" data-visual-exit>Exit</a>
    </div>
  </header>
  <p class="visual-editor-status" data-visual-status hidden></p>
  <div class="visual-editor-stage">
    <div id="gjs"></div>
    ${addDrawer}
  </div>
  </div>
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
        <input type="text" name="href" placeholder="/contact.html or https://" required>
      </label>
      <div class="visual-modal-actions">
        <button type="submit">Apply</button>
        <button type="button" data-visual-link-close>Cancel</button>
      </div>
    </form>
  </div>
  <div class="visual-modal" data-visual-overflow-modal hidden>
    <div class="visual-modal-card" role="dialog" aria-labelledby="visual-overflow-title">
      <h2 id="visual-overflow-title">This layout is too wide for phones</h2>
      <p data-visual-overflow-detail></p>
      <div class="visual-modal-actions">
        <button type="button" class="visual-banner-btn visual-banner-btn-primary" data-visual-overflow-continue>Publish anyway</button>
        <button type="button" class="visual-banner-btn" data-visual-overflow-back>Go back</button>
      </div>
    </div>
  </div>
  ${styleSink}
  <script src="/admin-nav.js?v=${v}"></script>
  <script src="/vendor/grapesjs/grapes.min.js?v=${v}"></script>
  <script src="/admin-visual.js?v=${v}"></script>
</body>
</html>`;
}
