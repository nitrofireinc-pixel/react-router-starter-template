/**
 * Allowlist HTML sanitizer for Cloudflare Workers (no DOM).
 * Parses tags/attributes without requiring spaces, treats `/` as
 * attribute whitespace, decodes entities before URL scheme checks,
 * and drops event handlers plus iframe/object/embed/meta/base/script.
 *
 * Save-quality: safe SVG subset, relative URLs, fieldset/legend,
 * valueless attrs stay valueless, attribute encode is idempotent,
 * and style[data-visual-css] is preserved via the visual CSS sanitizer.
 */

import { sanitizeVisualCss } from './visual-page-editor.mjs';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'source', 'wbr',
]);

const DROP_WHOLE = new Set([
  'script', 'iframe', 'object', 'embed', 'meta', 'base', 'link',
  'math', 'applet', 'frame', 'frameset', 'template', 'noscript',
  'foreignobject',
]);

const SVG_TAGS = new Set([
  'svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'use', 'title',
]);

const CMS_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'blockquote',
  'br', 'button', 'caption', 'cite', 'code', 'col', 'colgroup', 'dd',
  'details', 'dfn', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr',
  'i', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'main',
  'mark', 'nav', 'ol', 'optgroup', 'option', 'p', 'picture', 'pre', 'q',
  's', 'samp', 'section', 'select', 'small', 'source', 'span', 'strong',
  'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'textarea',
  'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'video', 'wbr',
  ...SVG_TAGS,
]);

const HOME_EXTRA_DROP = new Set([
  'form', 'input', 'button', 'textarea', 'select', 'option', 'optgroup',
  'label', 'style', 'audio', 'video', 'source',
]);

const BOOLEAN_ATTRS = new Set([
  'checked', 'disabled', 'hidden', 'multiple', 'open', 'readonly',
  'required', 'selected', 'novalidate',
]);

const GLOBAL_ATTRS = new Set([
  'class', 'id', 'title', 'lang', 'dir', 'hidden', 'tabindex', 'role',
  'translate',
]);

const SVG_ATTRS = new Set([
  'viewbox', 'fill', 'stroke', 'd', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'opacity',
  'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'fill-rule', 'clip-rule', 'preserveaspectratio', 'focusable',
  'vector-effect', 'overflow', 'display', 'pointer-events',
]);

const TAG_ATTRS = {
  a: new Set(['href', 'target', 'rel', 'name', 'download']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading', 'decoding', 'srcset', 'sizes']),
  form: new Set(['action', 'method', 'enctype', 'name', 'autocomplete', 'novalidate', 'target']),
  input: new Set([
    'type', 'name', 'value', 'placeholder', 'required', 'checked', 'disabled',
    'readonly', 'min', 'max', 'step', 'maxlength', 'minlength', 'pattern',
    'autocomplete', 'inputmode', 'accept', 'size',
  ]),
  button: new Set(['type', 'name', 'value', 'disabled']),
  textarea: new Set(['name', 'rows', 'cols', 'placeholder', 'required', 'disabled', 'readonly', 'maxlength', 'minlength']),
  select: new Set(['name', 'required', 'disabled', 'multiple']),
  option: new Set(['value', 'selected', 'disabled']),
  optgroup: new Set(['label', 'disabled']),
  label: new Set(['for']),
  fieldset: new Set(['name', 'disabled']),
  legend: new Set([]),
  td: new Set(['colspan', 'rowspan', 'scope']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  time: new Set(['datetime']),
  audio: new Set(['src', 'controls', 'preload']),
  video: new Set(['src', 'controls', 'preload', 'poster', 'width', 'height']),
  source: new Set(['src', 'type', 'srcset', 'sizes', 'media']),
  details: new Set(['open']),
  ol: new Set(['start', 'type']),
  li: new Set(['value']),
  table: new Set(['cellpadding', 'cellspacing']),
  svg: new Set(['width', 'height', 'viewbox', 'preserveaspectratio', 'focusable']),
  path: new Set(['d']),
  circle: new Set(['cx', 'cy', 'r']),
  rect: new Set(['x', 'y', 'width', 'height', 'rx', 'ry']),
  line: new Set(['x1', 'y1', 'x2', 'y2']),
  polyline: new Set(['points']),
  polygon: new Set(['points']),
  use: new Set(['href', 'x', 'y', 'width', 'height']),
  g: new Set(['transform']),
  title: new Set([]),
};

const SAFE_CSS_PROP = new Set([
  'color', 'background', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat', 'font', 'font-size', 'font-weight',
  'font-family', 'font-style', 'letter-spacing', 'line-height', 'text-align',
  'text-decoration', 'text-transform', 'white-space', 'width', 'height',
  'min-width', 'min-height', 'max-width', 'max-height', 'margin', 'margin-top',
  'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top',
  'padding-right', 'padding-bottom', 'padding-left', 'border', 'border-top',
  'border-right', 'border-bottom', 'border-left', 'border-radius', 'border-color',
  'border-width', 'border-style', 'display', 'flex', 'flex-direction', 'flex-wrap',
  'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'align-items',
  'align-self', 'gap', 'row-gap', 'column-gap', 'grid-template-columns',
  'grid-template-rows', 'grid-column', 'grid-row', 'position', 'top', 'right',
  'bottom', 'left', 'z-index', 'overflow', 'overflow-x', 'overflow-y', 'opacity',
  'object-fit', 'object-position', 'box-shadow', 'box-sizing', 'cursor',
  'vertical-align', 'list-style', 'list-style-type', 'aspect-ratio', 'inset',
  'transform', 'column-count', 'columns', 'float', 'clear', 'visibility',
  'pointer-events', 'isolation', 'filter',
]);

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  colon: ':',
  tab: '\t',
  newline: '\n',
  sol: '/',
};

export function decodeHtmlEntities(value = '') {
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);?/gi, (match, body) => {
    const token = String(body || '');
    if (token[0] === '#') {
      const code = token[1] === 'x' || token[1] === 'X'
        ? Number.parseInt(token.slice(2), 16)
        : Number.parseInt(token.slice(1), 10);
      if (!Number.isFinite(code) || code < 0) return '';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    }
    return NAMED_ENTITIES[token.toLowerCase()] ?? match;
  });
}

function compactForScheme(value = '') {
  return decodeHtmlEntities(value)
    .replace(/[\u0000-\u0020\u007f\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]+/g, '')
    .toLowerCase();
}

function hasDangerousScheme(value = '') {
  const compact = compactForScheme(value);
  return /^(javascript|vbscript|data|blob|mhtml):/.test(compact)
    || compact.includes('javascript:')
    || compact.includes('vbscript:');
}

function isSafeLocalUrl(decoded = '', { allowMailto = false } = {}) {
  const value = String(decoded || '').trim();
  if (!value || hasDangerousScheme(value)) return false;
  if (/^(https?:\/\/|\/|#)/i.test(value)) return true;
  if (allowMailto && /^(mailto:|tel:)/i.test(value)) return true;
  if (value.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  return true;
}

export function isSafeHref(value = '') {
  const raw = String(value || '').trim();
  if (!raw || hasDangerousScheme(raw)) return false;
  return isSafeLocalUrl(decodeHtmlEntities(raw).trim(), { allowMailto: true });
}

export function isSafeSrc(value = '') {
  const raw = String(value || '').trim();
  if (!raw || hasDangerousScheme(raw)) return false;
  return isSafeLocalUrl(decodeHtmlEntities(raw).trim(), { allowMailto: false });
}

export function isSafeFormAction(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return true;
  if (hasDangerousScheme(raw)) return false;
  const decoded = decodeHtmlEntities(raw).trim();
  return decoded.startsWith('/') || decoded.startsWith('#');
}

function isSafeSvgUseHref(value = '') {
  const decoded = decodeHtmlEntities(value).trim();
  return /^#[A-Za-z_][\w:.-]*$/.test(decoded) ? decoded : null;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function sanitizeCssText(css = '', { allowUrls = false } = {}) {
  const source = String(css || '');
  if (/expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:|@import/i.test(source)) {
    return '';
  }
  const parts = [];
  for (const declaration of source.split(';')) {
    const split = declaration.split(':');
    if (split.length < 2) continue;
    const prop = split[0].trim().toLowerCase();
    const next = split.slice(1).join(':').trim();
    if (!prop || !next || !SAFE_CSS_PROP.has(prop)) continue;
    if (/expression|javascript:|vbscript:|-moz-binding|behavior/i.test(next)) continue;
    if (/url\s*\(/i.test(next)) {
      if (!allowUrls) continue;
      const urlMatch = next.match(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/i);
      if (!urlMatch || !isSafeSrc(urlMatch[1])) continue;
    }
    parts.push(`${prop}: ${next}`);
  }
  return parts.join('; ');
}

function allowedTagsFor(profile) {
  if (profile === 'home' || profile === 'section') {
    return new Set([...CMS_TAGS].filter((tag) => !HOME_EXTRA_DROP.has(tag)));
  }
  return CMS_TAGS;
}

function isAllowedAttrName(tag, name) {
  if (!name) return false;
  if (name.startsWith('on')) return false;
  if (name === 'srcdoc' || name === 'formaction') return false;
  if (name === 'xlink:href' || name === 'xmlns') return false;
  if (GLOBAL_ATTRS.has(name)) return true;
  if (name.startsWith('aria-') && /^aria-[a-z0-9-]+$/.test(name)) return true;
  if (name.startsWith('data-') && /^data-[a-z0-9-]+$/.test(name)) return true;
  if (name === 'style') return true;
  if (SVG_TAGS.has(tag) && SVG_ATTRS.has(name)) return true;
  return Boolean(TAG_ATTRS[tag]?.has(name));
}

function sanitizeAttrValue(tag, name, value) {
  const raw = String(value ?? '');
  if (tag === 'use' && name === 'href') return isSafeSvgUseHref(raw);
  if (name === 'href' || name === 'poster') return isSafeHref(raw) ? decodeHtmlEntities(raw).trim() : null;
  if (name === 'src' || name === 'srcset') {
    if (name === 'srcset') {
      const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
      const kept = parts.filter((part) => isSafeSrc(part.split(/\s+/)[0] || ''));
      return kept.length ? kept.join(', ') : null;
    }
    return isSafeSrc(raw) ? decodeHtmlEntities(raw).trim() : null;
  }
  if (name === 'action') return isSafeFormAction(raw) ? decodeHtmlEntities(raw).trim() : null;
  if (name === 'style') {
    const css = sanitizeCssText(raw, { allowUrls: false });
    return css || null;
  }
  if (name === 'target') {
    const next = raw.trim().toLowerCase();
    return next === '_blank' || next === '_self' ? next : null;
  }
  if (name === 'method') {
    const next = raw.trim().toLowerCase();
    return next === 'get' || next === 'post' ? next : null;
  }
  if (name === 'tabindex') {
    return /^-?\d{1,3}$/.test(raw.trim()) ? raw.trim() : null;
  }
  if (hasDangerousScheme(raw)) return null;
  return decodeHtmlEntities(raw);
}

function skipAttrSep(source, index) {
  let i = index;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] !== '>') {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

function parseAttributes(source, start) {
  const attrs = [];
  let i = start;
  while (i < source.length) {
    i = skipAttrSep(source, i);
    if (i >= source.length) break;
    if (source[i] === '>') {
      return { attrs, end: i + 1, selfClosing: false };
    }
    if (source.startsWith('/>', i)) {
      return { attrs, end: i + 2, selfClosing: true };
    }
    const nameMatch = source.slice(i).match(/^([^\s/>=]+)/);
    if (!nameMatch) {
      i += 1;
      continue;
    }
    const name = nameMatch[1];
    i += name.length;
    i = skipAttrSep(source, i);
    let value = '';
    let valueless = true;
    if (source[i] === '=') {
      valueless = false;
      i += 1;
      i = skipAttrSep(source, i);
      if (source[i] === '"' || source[i] === "'") {
        const quote = source[i];
        i += 1;
        let end = source.indexOf(quote, i);
        if (end === -1) end = source.length;
        value = source.slice(i, end);
        i = end === source.length ? end : end + 1;
      } else {
        const unquoted = source.slice(i).match(/^([^\s>/]+)/);
        value = unquoted ? unquoted[1] : '';
        i += value.length;
      }
    }
    attrs.push({ name, value, valueless });
  }
  return { attrs, end: source.length, selfClosing: false };
}

function parseOpenTag(source, start) {
  if (source[start] !== '<') return null;
  const rest = source.slice(start + 1);
  const nameMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9:-]*)/);
  if (!nameMatch) return null;
  const tag = nameMatch[1].toLowerCase();
  const afterName = start + 1 + nameMatch[1].length;
  const parsed = parseAttributes(source, afterName);
  return {
    tag,
    attrs: parsed.attrs,
    end: parsed.end,
    selfClosing: parsed.selfClosing || VOID_TAGS.has(tag),
  };
}

function rewriteOpenTag(tag, attrs, profile) {
  const kept = [];
  let rel = '';
  let target = '';
  for (const attr of attrs) {
    const name = String(attr.name || '').trim().toLowerCase();
    if (!isAllowedAttrName(tag, name)) continue;
    if (BOOLEAN_ATTRS.has(name) || attr.valueless) {
      kept.push(name);
      continue;
    }
    const value = sanitizeAttrValue(tag, name, attr.value);
    if (value == null) continue;
    if (name === 'rel') rel = value;
    if (name === 'target') target = value;
    kept.push(`${name}="${escapeAttr(value)}"`);
  }
  if (tag === 'a' && target === '_blank' && !/\bnoopener\b/i.test(rel)) {
    const nextRel = [rel, 'noopener', 'noreferrer'].filter(Boolean).join(' ').trim();
    const idx = kept.findIndex((item) => item.startsWith('rel='));
    const relAttr = `rel="${escapeAttr(nextRel)}"`;
    if (idx >= 0) kept[idx] = relAttr;
    else kept.push(relAttr);
  }
  if (profile === 'home' && tag === 'style') return '';
  return `<${tag}${kept.length ? ` ${kept.join(' ')}` : ''}>`;
}

function hasVisualCssFlag(attrs = []) {
  return attrs.some((attr) => String(attr.name || '').trim().toLowerCase() === 'data-visual-css');
}

export function sanitizeAllowlistHtml(dirty = '', options = {}) {
  const profile = options.profile === 'home' || options.profile === 'section' ? options.profile : 'cms';
  const allowed = allowedTagsFor(profile);
  const source = String(dirty || '');
  let i = 0;
  let out = '';
  const skip = [];

  while (i < source.length) {
    if (source[i] !== '<') {
      const next = source.indexOf('<', i);
      const text = next === -1 ? source.slice(i) : source.slice(i, next);
      if (!skip.length) out += text;
      i = next === -1 ? source.length : next;
      continue;
    }
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<![', i) || source.startsWith('<!', i)) {
      const end = source.indexOf('>', i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('</', i)) {
      const closeMatch = source.slice(i).match(/^<\/([a-zA-Z][a-zA-Z0-9:-]*)[^>]*>/);
      if (!closeMatch) {
        if (!skip.length) out += '&lt;';
        i += 1;
        continue;
      }
      const tag = closeMatch[1].toLowerCase();
      i += closeMatch[0].length;
      if (skip.length) {
        if (skip[skip.length - 1] === tag) skip.pop();
        continue;
      }
      if (allowed.has(tag) && !VOID_TAGS.has(tag)) out += `</${tag}>`;
      continue;
    }

    const parsed = parseOpenTag(source, i);
    if (!parsed) {
      if (!skip.length) out += '&lt;';
      i += 1;
      continue;
    }

    if (skip.length) {
      if (!parsed.selfClosing && (DROP_WHOLE.has(parsed.tag) || parsed.tag === skip[skip.length - 1])) {
        skip.push(parsed.tag);
      }
      i = parsed.end;
      continue;
    }

    if (DROP_WHOLE.has(parsed.tag) || (profile !== 'cms' && parsed.tag === 'style')) {
      if (!parsed.selfClosing) skip.push(parsed.tag);
      i = parsed.end;
      continue;
    }

    if (!allowed.has(parsed.tag)) {
      i = parsed.end;
      continue;
    }

    if (parsed.tag === 'style' && profile === 'cms') {
      const closeTag = source.toLowerCase().indexOf('</style', parsed.end);
      const rawCss = closeTag === -1 ? '' : source.slice(parsed.end, closeTag);
      const visual = hasVisualCssFlag(parsed.attrs);
      const css = visual ? sanitizeVisualCss(rawCss) : sanitizeCssText(rawCss, { allowUrls: false });
      if (css) out += visual ? `<style data-visual-css>${css}</style>` : `<style>${css}</style>`;
      if (closeTag === -1) {
        i = source.length;
      } else {
        const closeEnd = source.indexOf('>', closeTag);
        i = closeEnd === -1 ? source.length : closeEnd + 1;
      }
      continue;
    }

    out += rewriteOpenTag(parsed.tag, parsed.attrs, profile);
    if (parsed.selfClosing && !VOID_TAGS.has(parsed.tag) && allowed.has(parsed.tag)) {
      out += `</${parsed.tag}>`;
    }
    i = parsed.end;
  }

  return out.trim();
}

export function sanitizeCmsPageHtml(dirty = '') {
  return sanitizeAllowlistHtml(dirty, { profile: 'cms' });
}

export function sanitizePageSectionHtml(dirty = '') {
  return sanitizeAllowlistHtml(dirty, { profile: 'section' });
}

export function sanitizeHomeAllowlistHtml(dirty = '') {
  return sanitizeAllowlistHtml(dirty, { profile: 'home' });
}
