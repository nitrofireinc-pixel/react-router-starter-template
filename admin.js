function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

const SAVE_TOAST_EXCLUDE = [
  '/api/admin/mail',
  '/api/admin/zernio/facebook/events/publish',
  '/api/admin/zernio/posts',
  '/api/admin/zernio/facebook/connect',
  '/api/admin/zernio/facebook/disconnect',
  '/api/admin/zernio/facebook/pages',
];

let savedToastTimer = null;
let savedToastLeaveTimer = null;

function shouldShowSavedToast(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
  const path = String(url || '');
  if (!path.includes('/api/admin/')) return false;
  return !SAVE_TOAST_EXCLUDE.some((prefix) => path.includes(prefix));
}

function showSavedToast(message = 'Saved.') {
  let root = document.querySelector('#admin-saved-toast');
  if (!root) {
    root = document.createElement('div');
    root.id = 'admin-saved-toast';
    root.className = 'admin-saved-toast';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <div class="admin-saved-toast-backdrop" aria-hidden="true"></div>
      <div class="admin-saved-toast-panel">
        <div class="admin-saved-toast-card"><strong data-saved-toast-message>Saved.</strong></div>
      </div>`;
    document.body.appendChild(root);
  }
  const msg = root.querySelector('[data-saved-toast-message]');
  if (msg) msg.textContent = message;
  window.clearTimeout(savedToastTimer);
  window.clearTimeout(savedToastLeaveTimer);
  root.classList.remove('is-leaving');
  root.classList.remove('is-visible');
  void root.offsetWidth;
  root.classList.add('is-visible');
  savedToastTimer = window.setTimeout(() => {
    root.classList.add('is-leaving');
    root.classList.remove('is-visible');
    savedToastLeaveTimer = window.setTimeout(() => {
      root.classList.remove('is-leaving');
    }, 380);
  }, 3000);
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: options.body instanceof FormData ? { ...(options.headers || {}) } : { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.detail || data.error || text);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(text || response.statusText || 'Request failed');
      throw error;
    }
  }
  const data = await response.json();
  if (shouldShowSavedToast(url, options)) showSavedToast('Saved.');
  return data;
}

const SOCIAL_PLATFORMS = [
  { id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/…' },
  { id: 'x', label: 'X', placeholder: 'https://x.com/…' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@…' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@…' },
];

const state = { me: null, pages: [], pageCatalog: [], users: [], mailRecipients: [], events: [], photos: [], sponsors: [], staff: [], boosterMembers: [], contactTopics: [], contactMessages: [], minutes: [], selectedMinutesId: null, ensemblesBodyHtml: '', site: null, utilityLinks: [], socialLinks: [], zernioFacebook: null, zernioPages: [], zernioPosts: [], zernioEventQueue: null, homeBodyHtml: '' };

const DEFAULT_HOME_FEATURE_CARDS = {
  boosters_tag: 'Boosters',
  boosters_heading: 'Parents make the program move.',
  boosters_body: 'Add booster meeting dates, volunteer signups, concessions, uniforms, meals, transportation, and fundraising needs.',
  boosters_button: 'Booster info',
  boosters_href: 'boosters.html',
  launch_tag: 'Launch note',
  launch_heading: 'This is a first website draft.',
  launch_body: 'Because official names, dates, director bios, forms, and contact details were not provided yet, those areas are clearly marked as placeholders.',
  launch_footer: 'Ready for review, copy replacement, and GitHub publishing.',
};

const HOME_FEATURE_CARD_KEYS = Object.keys(DEFAULT_HOME_FEATURE_CARDS);

const DEFAULT_SPONSOR_TIER_FIELDS = {
  tiers_kicker: 'Sponsor packages',
  tiers_heading: 'Choose your level of support.',
  tiers_intro: 'Three clear ways to back Eagle Pride — from a website marquee feature to full game-day recognition.',
  bronze_label: 'Bronze',
  bronze_title: 'Bronze Sponsor',
  bronze_blurb: 'Put your brand in front of families online.',
  bronze_benefits: '<ul><li>Logo featured on the website sponsor marquee</li></ul>',
  silver_label: 'Silver',
  silver_title: 'Silver Sponsor',
  silver_blurb: 'Stand out across the site experience.',
  silver_benefits: '<ul><li>Logo featured on the website sponsor marquee</li><li>Homepage fly-in advert for your business</li></ul>',
  gold_label: 'Gold',
  gold_title: 'Gold Sponsor',
  gold_blurb: 'Our top package for game-day and digital impact.',
  gold_benefits: '<ul><li>Logo featured on the website sponsor marquee</li><li>Homepage fly-in advert for your business</li><li>Announcement recognition at home football games</li></ul>',
};

const SPONSOR_TIER_FIELD_KEYS = Object.keys(DEFAULT_SPONSOR_TIER_FIELDS);
const SPONSOR_TIER_BENEFIT_KEYS = ['bronze_benefits', 'silver_benefits', 'gold_benefits'];

function isSuperAdmin(user = state.me?.user) {
  return String(user?.role || '').trim().toLowerCase() === 'admin';
}

function hasPermission(scope) {
  if (!state.me?.user) return false;
  if (isSuperAdmin(state.me.user)) return true;
  return state.me.user.permissions.includes(scope) || state.me.user.permissions.includes('all');
}

function canManageAllEvents() {
  return isSuperAdmin() || hasPermission('events:manage');
}

function canCreateEvents() {
  return hasPermission('events') || canManageAllEvents();
}

function canMutateEvent(event) {
  if (canManageAllEvents()) return true;
  if (!hasPermission('events')) return false;
  const ownerId = Number(event?.created_by);
  // Legacy rows with no creator are editable by anyone who can create events.
  if (!Number.isInteger(ownerId) || ownerId <= 0) return true;
  return ownerId === Number(state.me?.user?.id);
}

function eventCreatorLabel(event) {
  if (!event) return '';
  if (Number(event.created_by) === Number(state.me?.user?.id)) return 'You';
  const name = String(event.created_by_name || '').trim();
  if (name) return name;
  const username = String(event.created_by_username || '').trim();
  if (username) return username;
  return event.created_by ? `User #${event.created_by}` : 'Unassigned';
}

function canEditPage(pageOrSlug) {
  const slug = typeof pageOrSlug === 'string' ? pageOrSlug : pageOrSlug.slug;
  return hasPermission('pages') || hasPermission(`page:${slug}`);
}

function canEditSponsors() {
  return hasPermission('sponsors') || canEditPage('sponsors');
}

function canEditStaff() {
  return hasPermission('staff') || canEditPage('directors');
}

function canEditBoosterMembers() {
  return hasPermission('boosters') || canEditPage('boosters');
}

function canEditContact() {
  return hasPermission('contact') || canEditPage('contact');
}

function canSendMail() {
  // Staff Email is available to every logged-in CMS user.
  return Boolean(state.me?.user);
}

function canManageMinutes() {
  return hasPermission('minutes');
}

function canViewMinutes() {
  // Any logged-in CMS user can view/print meeting minutes.
  return Boolean(state.me?.user);
}

function formControl(form, name) {
  if (!form || !name) return null;
  return form.querySelector(`[name="${CSS.escape(name)}"]`) || form.elements.namedItem?.(name) || null;
}

function syncFormRichEditors(form) {
  if (!form) return;
  form.querySelectorAll('[data-rich-input]').forEach((editor) => {
    const name = editor.dataset.richInput;
    const control = formControl(form, name);
    if (!control) return;
    const mode = editor.dataset.richMode || 'block';
    if (mode === 'inline') {
      const cleaned = sanitizeInlineRichHtml(editor.innerHTML || '');
      // Contenteditable serializes & and spaces as entities; store plain text when no rich tags remain.
      control.value = cleaned && !looksLikeInlineRichHtml(cleaned)
        ? decodeBasicHtmlEntities(cleaned)
        : cleaned;
      return;
    }
    control.value = sanitizeRichHtml(editor.innerHTML || '');
  });
}

function setFormRichEditorValue(form, name, value) {
  if (!form || !name) return;
  const editor = form.querySelector(`[data-rich-input="${CSS.escape(name)}"]`);
  if (!editor) return;
  const mode = editor.dataset.richMode || 'block';
  if (mode === 'inline') {
    editor.innerHTML = formatInlineRichText(value || '');
  } else {
    editor.innerHTML = formatRichText(value || '') || '';
  }
}

function clearFormRichEditors(form) {
  if (!form) return;
  form.querySelectorAll('[data-rich-input]').forEach((editor) => {
    editor.innerHTML = '';
    const control = formControl(form, editor.dataset.richInput);
    if (control) control.value = '';
  });
}

function fillForm(form, data) {
  if (!form) return;
  for (const [key, value] of Object.entries(data || {})) {
    if (Array.isArray(value)) continue;
    const controls = [...form.querySelectorAll(`[name="${CSS.escape(key)}"]`)];
    if (!controls.length) {
      setFormRichEditorValue(form, key, value ?? '');
      continue;
    }
    // Multi-checkbox groups (e.g. permissions) are handled by the caller.
    if (controls.length > 1) continue;
    const control = controls[0];
    if (!control || control.type === 'file') continue;
    if (control.type === 'checkbox' || control.type === 'radio') {
      control.checked = Boolean(Number(value) || value === true);
      continue;
    }
    control.value = value ?? '';
    setFormRichEditorValue(form, key, value ?? '');
  }
}

function formPayload(form) {
  syncFormRichEditors(form);
  const payload = Object.fromEntries(new FormData(form).entries());
  const active = formControl(form, 'active');
  if (active) payload.active = Boolean(active.checked);
  const maintenanceMode = formControl(form, 'maintenance_mode');
  if (maintenanceMode) payload.maintenance_mode = Boolean(maintenanceMode.checked);
  return payload;
}

function richTextIsEmpty(value) {
  return !String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function applyFormRichCommand(editor, command, value = null) {
  if (!editor) return;
  editor.focus();
  if (command === 'fontSize' && value) {
    applyRichStyle({ fontSize: value });
    return;
  }
  if (command === 'foreColor') {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(command, false, value);
    return;
  }
  // Prefer semantic <strong>/<em>/<u> so sanitization keeps bold/italic/underline.
  document.execCommand('styleWithCSS', false, false);
  document.execCommand(command, false, value);
}

function insertRichEditorLineBreak(editor) {
  if (!editor) return;
  editor.focus();
  // Native paragraph break keeps the caret on the next visible line.
  if (document.execCommand('insertParagraph')) return;
  // Fallback: two <br>s so Chrome does not collapse a trailing single break.
  document.execCommand('insertHTML', false, '<br><br>');
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const container = range.startContainer;
  const root = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  if (!root) return;
  const breaks = [...(root.querySelectorAll?.('br') || [])];
  if (breaks.length < 2) return;
  const last = breaks[breaks.length - 1];
  const nextRange = document.createRange();
  nextRange.setStartBefore(last);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function bindFormRichEditors() {
  if (document.documentElement.dataset.formRichBound === '1') return;
  document.documentElement.dataset.formRichBound = '1';

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-form-rich]');
    if (!button) return;
    event.preventDefault();
    const field = button.closest('.form-rich-label');
    const editor = field?.querySelector('[data-rich-input]');
    if (!editor) return;
    applyFormRichCommand(editor, button.dataset.formRich);
    syncFormRichEditors(editor.closest('form'));
  });

  document.addEventListener('input', (event) => {
    const color = event.target.closest?.('[data-form-rich-color]');
    if (!color) return;
    const field = color.closest('.form-rich-label');
    const editor = field?.querySelector('[data-rich-input]');
    if (!editor) return;
    applyFormRichCommand(editor, 'foreColor', color.value);
    syncFormRichEditors(editor.closest('form'));
  });

  document.addEventListener('change', (event) => {
    const size = event.target.closest?.('[data-form-rich-size]');
    if (!size || !size.value) return;
    const field = size.closest('.form-rich-label');
    const editor = field?.querySelector('[data-rich-input]');
    if (!editor) return;
    applyFormRichCommand(editor, 'fontSize', size.value);
    size.value = '';
    syncFormRichEditors(editor.closest('form'));
  });

  document.addEventListener('input', (event) => {
    const editor = event.target.closest?.('[data-rich-input]');
    if (!editor) return;
    syncFormRichEditors(editor.closest('form'));
  });

  document.addEventListener('keydown', (event) => {
    const editor = event.target.closest?.('[data-rich-input]');
    if (!editor || event.key !== 'Enter') return;
    const inline = editor.dataset.richMode === 'inline' || editor.classList.contains('cms-edit-inline');
    if (inline) {
      event.preventDefault();
      editor.blur();
      return;
    }

    // Multiline editors live inside <form>/<label>; stop Enter from submitting.
    // A single <br> collapses in contenteditable, so insert a paragraph/block break.
    event.preventDefault();
    event.stopPropagation();
    insertRichEditorLineBreak(editor);
    syncFormRichEditors(editor.closest('form'));
  });

  document.addEventListener('paste', (event) => {
    const editor = event.target.closest?.('[data-rich-input]');
    if (!editor) return;
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    const mode = editor.dataset.richMode || 'block';
    const clean = mode === 'inline'
      ? (html ? sanitizeInlineRichHtml(html) : formatInlineRichText(text))
      : (html ? sanitizeRichHtml(html) : formatRichText(text));
    document.execCommand('insertHTML', false, clean || escapeHtml(text));
    syncFormRichEditors(editor.closest('form'));
  });
}

function sponsorTierFromLevel(level = '') {
  const raw = String(level || '').trim().toLowerCase();
  if (/\bgold\b/.test(raw)) return 'gold';
  if (/\bsilver\b/.test(raw)) return 'silver';
  if (/\bbronze\b/.test(raw)) return 'bronze';
  return 'bronze';
}

function sponsorTierBenefitsText(level = '') {
  const tier = sponsorTierFromLevel(level);
  if (tier === 'gold') return 'Includes website marquee, homepage fly-in ad, and public advertising.';
  if (tier === 'silver') return 'Includes website marquee and homepage fly-in ad.';
  return 'Includes website marquee logo feature.';
}

function syncSponsorTierBenefits(form = document.querySelector('#sponsor-form')) {
  const hint = document.querySelector('#sponsor-tier-benefits');
  if (!hint) return;
  const level = formControl(form, 'level')?.value || 'Bronze Sponsor';
  hint.textContent = sponsorTierBenefitsText(level);
}

function textFromHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  return template.content.textContent.replace(/\s+/g, ' ').trim();
}

function paragraphsFromNode(node) {
  if (!node) return '';
  const paragraphs = [...node.querySelectorAll('p')].map(p => p.textContent.trim()).filter(Boolean);
  return paragraphs.length ? paragraphs.join('\n\n') : node.textContent.replace(/\s+/g, ' ').trim();
}

function looksLikeHtml(value) {
  return /<\/?[a-z][^>]*>/i.test(String(value || ''));
}

function looksLikeInlineRichHtml(value) {
  return /<\/?(?:span|strong|b|em|i|u|br)(?:\s|>|\/)/i.test(String(value || ''));
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
    if (prop === 'color' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(value)) parts.push(`color: ${value}`);
    if (prop === 'font-size' && /^[\d.]+\s*(px|em|rem|%)$/i.test(value)) parts.push(`font-size: ${value}`);
  }
  return parts.join('; ');
}

function normalizeCssEmphasisMarkup(dirty) {
  // Browsers often apply bold/italic/underline as CSS spans when styleWithCSS is on.
  // Convert those to semantic tags before style sanitization drops font-weight/etc.
  return String(dirty || '')
    .replace(/<span\b([^>]*)style\s*=\s*(["'])([\s\S]*?)\2([^>]*)>([\s\S]*?)<\/span>/gi, (match, pre, _q, style, post, inner) => {
      const decls = String(style || '');
      let nextInner = inner;
      let nextStyle = decls;
      if (/(?:^|;)\s*font-weight\s*:\s*(bold|[7-9]00|bolder)\s*(?:;|$)/i.test(decls)) {
        nextInner = `<strong>${nextInner}</strong>`;
        nextStyle = nextStyle.replace(/(?:^|;)\s*font-weight\s*:\s*[^;]+/ig, ';');
      }
      if (/(?:^|;)\s*font-style\s*:\s*italic\s*(?:;|$)/i.test(decls)) {
        nextInner = `<em>${nextInner}</em>`;
        nextStyle = nextStyle.replace(/(?:^|;)\s*font-style\s*:\s*[^;]+/ig, ';');
      }
      if (/(?:^|;)\s*text-decoration(?:-line)?\s*:[^;]*underline/i.test(decls)) {
        nextInner = `<u>${nextInner}</u>`;
        nextStyle = nextStyle.replace(/(?:^|;)\s*text-decoration(?:-line)?\s*:\s*[^;]+/ig, ';');
      }
      nextStyle = nextStyle.replace(/;{2,}/g, ';').replace(/^;|;$/g, '').trim();
      const attrs = `${pre || ''} style="${nextStyle}" ${post || ''}`.replace(/\s+/g, ' ').trim();
      if (!nextStyle) return nextInner;
      return `<span ${attrs}>${nextInner}</span>`;
    });
}

function sanitizeRichHtml(dirty) {
  let html = normalizeCssEmphasisMarkup(dirty)
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
  const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'ul', 'ol', 'li', 'div', 'h2', 'h3']);
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag === 'span') {
      const style = sanitizeStyleAttribute(attrs);
      return style ? `<span style="${style}">` : '<span>';
    }
    if (tag === 'div') {
      const classMatch = String(attrs || '').match(/class\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const className = String(classMatch?.[1] || classMatch?.[2] || '')
        .split(/\s+/)
        .filter((name) => ['kicker', 'tag', 'draft'].includes(name))
        .join(' ');
      return className ? `<div class="${className}">` : '<div>';
    }
    return `<${tag}>`;
  });
  html = html
    .replace(/<span(?:\s[^>]*)?>\s*(<br\s*\/?>)\s*<\/span>/gi, '$1')
    .replace(/(?:<br>\s*){3,}/gi, '<br><br>')
    .trim();
  if (!html) return '';
  if (!/<(?:p|div|h2|h3|ul|ol)[\s>]/i.test(html)) html = `<p>${html}</p>`;
  return html;
}

function sanitizeInlineRichHtml(dirty) {
  let html = normalizeCssEmphasisMarkup(dirty)
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<\/?(p|div|ul|ol|li|h[1-6]|section|article)[^>]*>/gi, ' ');
  const allowed = new Set(['br', 'strong', 'b', 'em', 'i', 'u', 'span']);
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
  return html.replace(/\s+/g, ' ').replace(/(?:<br>\s*){2,}/gi, '<br>').trim();
}

function decodeBasicHtmlEntities(value) {
  let text = String(value ?? '');
  for (let i = 0; i < 3; i += 1) {
    const next = text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/gi, "'")
      .replace(/&#x0*27;/gi, "'");
    if (next === text) break;
    text = next;
  }
  return text;
}

function formatInlineRichText(value, fallback = '') {
  const raw = String(value ?? '');
  const source = raw.trim() ? raw : String(fallback || '');
  if (!source.trim()) return '';
  return looksLikeInlineRichHtml(source)
    ? sanitizeInlineRichHtml(source)
    : escapeHtml(decodeBasicHtmlEntities(source));
}

function formatRichText(value, fallback = '') {
  const raw = String(value ?? '');
  const source = raw.trim() ? raw : String(fallback || '');
  if (!source.trim()) return '';
  return looksLikeHtml(source) ? sanitizeRichHtml(source) : paragraphsFromText(source);
}

function richHtmlFromNode(node) {
  if (!node) return '';
  const field = node.matches?.('[data-cms-field]') ? node : node.querySelector?.('[data-cms-field="body_text"], [data-cms-field="callout_text"]') || node;
  return sanitizeRichHtml(field.innerHTML || '');
}

function inlineHtmlFromNode(node) {
  if (!node) return '';
  return sanitizeInlineRichHtml(node.innerHTML || '');
}

function plainTextFromHtml(value) {
  return decodeBasicHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractHomeFeatureCardsFromHtml(html = '') {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const root = template.content;
  const boosters = root.querySelector('[data-cms-block="home-boosters"], .accent-card');
  const launch = root.querySelector('[data-cms-block="home-launch"]')
    || boosters?.parentElement?.querySelector('article.card:not(.accent-card)');
  const plainOf = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const inlineOf = (node) => sanitizeInlineRichHtml(node?.innerHTML || '') || plainOf(node) || '';
  const boostersLink = boosters?.querySelector('a.btn.secondary, a.btn');
  return {
    boosters_tag: inlineOf(boosters?.querySelector('.tag, [data-cms-field="boosters_tag"]')) || DEFAULT_HOME_FEATURE_CARDS.boosters_tag,
    boosters_heading: inlineOf(boosters?.querySelector('h3, [data-cms-field="boosters_heading"]')) || DEFAULT_HOME_FEATURE_CARDS.boosters_heading,
    boosters_body: inlineOf(boosters?.querySelector('h3 + p, [data-cms-field="boosters_body"]')) || DEFAULT_HOME_FEATURE_CARDS.boosters_body,
    boosters_button: inlineOf(boostersLink || boosters?.querySelector('[data-cms-field="boosters_button"]')) || DEFAULT_HOME_FEATURE_CARDS.boosters_button,
    boosters_href: String(boostersLink?.getAttribute('href') || DEFAULT_HOME_FEATURE_CARDS.boosters_href).trim() || DEFAULT_HOME_FEATURE_CARDS.boosters_href,
    launch_tag: inlineOf(launch?.querySelector('.tag, [data-cms-field="launch_tag"]')) || DEFAULT_HOME_FEATURE_CARDS.launch_tag,
    launch_heading: inlineOf(launch?.querySelector('h3, [data-cms-field="launch_heading"]')) || DEFAULT_HOME_FEATURE_CARDS.launch_heading,
    launch_body: inlineOf(launch?.querySelector('h3 + p:not(.draft), [data-cms-field="launch_body"]')) || DEFAULT_HOME_FEATURE_CARDS.launch_body,
    launch_footer: inlineOf(launch?.querySelector('.draft, [data-cms-field="launch_footer"]')) || DEFAULT_HOME_FEATURE_CARDS.launch_footer,
  };
}

function homeFeatureCardsFromForm(payload = {}) {
  const cards = {};
  for (const key of HOME_FEATURE_CARD_KEYS) {
    if (key === 'boosters_href') {
      cards[key] = String(payload[key] ?? DEFAULT_HOME_FEATURE_CARDS[key] ?? '').trim() || DEFAULT_HOME_FEATURE_CARDS[key];
      continue;
    }
    const raw = String(payload[key] ?? DEFAULT_HOME_FEATURE_CARDS[key] ?? '').trim();
    const value = looksLikeInlineRichHtml(raw) ? sanitizeInlineRichHtml(raw) : raw.replace(/\s+/g, ' ').trim();
    cards[key] = value || DEFAULT_HOME_FEATURE_CARDS[key];
  }
  return cards;
}

function extractSponsorTierFieldsFromHtml(html = '') {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const root = template.content;
  const section = root.querySelector('[data-sponsor-tiers]') || root;
  const head = section.querySelector('.sponsor-tiers-head');
  const textOf = (node) => String(node?.innerHTML || '').trim();
  const plainOf = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const card = (id) => section.querySelector(`[data-tier="${id}"]`);
  const benefitsOf = (tierCard) => {
    const field = tierCard?.querySelector('[data-cms-field$="_benefits"]');
    if (field) return sanitizeRichHtml(field.innerHTML || '');
    const list = tierCard?.querySelector('ul');
    return list ? `<ul>${list.innerHTML}</ul>` : '';
  };
  const bronze = card('bronze');
  const silver = card('silver');
  const gold = card('gold');
  const inlineOf = (node) => sanitizeInlineRichHtml(node?.innerHTML || '') || plainOf(node) || '';
  return {
    tiers_kicker: inlineOf(head?.querySelector('[data-cms-field="tiers_kicker"], .kicker')) || DEFAULT_SPONSOR_TIER_FIELDS.tiers_kicker,
    tiers_heading: inlineOf(head?.querySelector('[data-cms-field="tiers_heading"], h2')) || DEFAULT_SPONSOR_TIER_FIELDS.tiers_heading,
    tiers_intro: inlineOf(head?.querySelector('[data-cms-field="tiers_intro"], h2 + p')) || DEFAULT_SPONSOR_TIER_FIELDS.tiers_intro,
    bronze_label: inlineOf(bronze?.querySelector('[data-cms-field="bronze_label"], .sponsor-tier-label')) || DEFAULT_SPONSOR_TIER_FIELDS.bronze_label,
    bronze_title: inlineOf(bronze?.querySelector('[data-cms-field="bronze_title"], h3')) || DEFAULT_SPONSOR_TIER_FIELDS.bronze_title,
    bronze_blurb: inlineOf(bronze?.querySelector('[data-cms-field="bronze_blurb"], h3 + p')) || DEFAULT_SPONSOR_TIER_FIELDS.bronze_blurb,
    bronze_benefits: benefitsOf(bronze) || DEFAULT_SPONSOR_TIER_FIELDS.bronze_benefits,
    silver_label: inlineOf(silver?.querySelector('[data-cms-field="silver_label"], .sponsor-tier-label')) || DEFAULT_SPONSOR_TIER_FIELDS.silver_label,
    silver_title: inlineOf(silver?.querySelector('[data-cms-field="silver_title"], h3')) || DEFAULT_SPONSOR_TIER_FIELDS.silver_title,
    silver_blurb: inlineOf(silver?.querySelector('[data-cms-field="silver_blurb"], h3 + p')) || DEFAULT_SPONSOR_TIER_FIELDS.silver_blurb,
    silver_benefits: benefitsOf(silver) || DEFAULT_SPONSOR_TIER_FIELDS.silver_benefits,
    gold_label: inlineOf(gold?.querySelector('[data-cms-field="gold_label"], .sponsor-tier-label')) || DEFAULT_SPONSOR_TIER_FIELDS.gold_label,
    gold_title: inlineOf(gold?.querySelector('[data-cms-field="gold_title"], h3')) || DEFAULT_SPONSOR_TIER_FIELDS.gold_title,
    gold_blurb: inlineOf(gold?.querySelector('[data-cms-field="gold_blurb"], h3 + p')) || DEFAULT_SPONSOR_TIER_FIELDS.gold_blurb,
    gold_benefits: benefitsOf(gold) || DEFAULT_SPONSOR_TIER_FIELDS.gold_benefits,
  };
}

function structuredPageFields(page) {
  if (page?.slug === 'home' || page?.is_home) {
    return {
      layout: 'home',
      kicker: '',
      heading: page.title || 'Home',
      intro: '',
      body_text: '',
      callout_title: '',
      callout_text: '',
    };
  }
  const template = document.createElement('template');
  template.innerHTML = page.body_html || '';
  const root = template.content;
  const pageTitle = root.querySelector('.page-title');
  const bodyNode = root.querySelector('[data-cms-field="body_text"]')
    || root.querySelector('.sponsor-intro > div')
    || (page.slug === 'calendar' ? null : root.querySelector('.content .card') || root.querySelector('.content .wrap'));
  const callout = root.querySelector('[data-cms-block="callout"], .sponsor-cta, .notice');
  const calloutTextNode = callout?.querySelector('[data-cms-field="callout_text"]') || null;
  const kickerNode = pageTitle?.querySelector('[data-cms-field="kicker"], .kicker')
    || root.querySelector('[data-cms-field="kicker"], .page-title .kicker');
  const headingNode = root.querySelector('[data-cms-field="heading"], .page-title h1');
  const introNode = pageTitle?.querySelector('[data-cms-field="intro"]')
    || pageTitle?.querySelector('p');
  const calloutTitleNode = callout?.querySelector('[data-cms-field="callout_title"], h2, h3');
  const inferredLayout = root.querySelector('[data-cms-layout]')?.dataset.cmsLayout
    || (page.slug === 'calendar' ? 'calendar'
      : page.slug === 'contact' ? 'contact'
        : page.slug === 'directors' ? 'directory'
          : page.slug === 'sponsors' ? 'sponsors'
            : (page.slug === 'become-a-sponsor' || page.slug === 'become-sponsor') ? 'become-sponsor'
              : 'standard');
  const tierFields = (inferredLayout === 'become-sponsor' || page.slug === 'become-a-sponsor')
    ? extractSponsorTierFieldsFromHtml(page.body_html || '')
    : {};
  return {
    layout: inferredLayout,
    kicker: inlineHtmlFromNode(kickerNode) || '',
    heading: inlineHtmlFromNode(headingNode) || page.title || '',
    intro: inlineHtmlFromNode(introNode) || '',
    body_text: richHtmlFromNode(bodyNode)
      || (page.slug === 'calendar'
        ? 'Add calendar events from the Calendar tab. They will appear here automatically.'
        : page.slug === 'sponsors'
          ? '<div class="kicker">Thank you</div><h2>Community support takes center stage.</h2><p>Our sponsors help provide instruments, instruction, travel, meals, uniforms, and unforgettable performance opportunities.</p>'
          : (page.slug === 'become-a-sponsor' || page.slug === 'become-sponsor')
            ? '<span class="tag">Next step</span><h3>Ready to partner with Eagle Pride?</h3><p>Pick Bronze, Silver, or Gold above, then send a sponsor inquiry. We will follow up about artwork, payment, and recognition details.</p>'
            : textFromHtml(page.body_html)),
    callout_title: inlineHtmlFromNode(calloutTitleNode) || '',
    callout_text: calloutTextNode
      ? richHtmlFromNode(calloutTextNode)
      : (callout?.querySelector('p') ? `<p>${escapeHtml(callout.querySelector('p').textContent.trim())}</p>` : paragraphsFromNode(callout)),
    ...tierFields,
  };
}

function pagePayload(form) {
  const payload = formPayload(form);
  payload.nav_order = Number(payload.nav_order || 99);
  // Disabled controls are omitted from FormData; keep home layout explicit.
  if (form?.elements?.layout?.disabled) payload.layout = form.elements.layout.value;
  return payload;
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function paragraphsFromText(value) {
  return String(value || '')
    .split(/\n\s*\n/)
    .map(part => decodeBasicHtmlEntities(part).trim())
    .filter(Boolean)
    .map(part => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function layoutChipLabel(layout) {
  return ({
    home: 'Home layout',
    standard: 'Standard layout',
    calendar: 'Calendar layout',
    contact: 'Contact layout',
    directory: 'Staff directory layout',
    sponsors: 'Sponsors layout',
    'become-sponsor': 'Become a sponsor layout',
  })[layout] || 'Standard layout';
}

const PAGE_FIELD_LABELS = {
  kicker: 'Small label',
  heading: 'Heading',
  intro: 'Intro',
  body_text: 'Body content',
  callout_title: 'Callout title',
  callout_text: 'Callout text',
  boosters_tag: 'Boosters tag',
  boosters_heading: 'Boosters heading',
  boosters_body: 'Boosters body',
  boosters_button: 'Boosters button',
  launch_tag: 'Launch tag',
  launch_heading: 'Launch heading',
  launch_body: 'Launch body',
  launch_footer: 'Launch footer note',
  tiers_kicker: 'Packages label',
  tiers_heading: 'Packages heading',
  tiers_intro: 'Packages intro',
  bronze_label: 'Bronze badge',
  bronze_title: 'Bronze title',
  bronze_blurb: 'Bronze description',
  bronze_benefits: 'Bronze benefits',
  silver_label: 'Silver badge',
  silver_title: 'Silver title',
  silver_blurb: 'Silver description',
  silver_benefits: 'Silver benefits',
  gold_label: 'Gold badge',
  gold_title: 'Gold title',
  gold_blurb: 'Gold description',
  gold_benefits: 'Gold benefits',
};

function homeFieldLabel(el) {
  if (el.matches?.('.eyebrow')) return 'Eyebrow';
  if (el.matches?.('.kicker')) return 'Section label';
  if (el.matches?.('.tag')) return 'Card tag';
  if (el.matches?.('.draft')) return 'Footer note';
  if (el.tagName === 'A') return 'Button label';
  if (el.tagName === 'LI') return 'List item';
  if (el.tagName === 'FIGCAPTION') return 'Caption';
  return ({ H1: 'Heading', H2: 'Heading', H3: 'Heading', P: 'Paragraph' })[el.tagName] || 'Text';
}

function markHomeHtmlEditable(html = '') {
  const template = document.createElement('template');
  template.innerHTML = String(html || '').trim();
  const root = template.content;
  root.querySelectorAll('[data-events]').forEach((node) => {
    node.classList.add('cms-home-dynamic');
    node.setAttribute('data-cms-dynamic-label', 'Managed in Calendar Events');
  });
  root.querySelectorAll('[data-photo-gallery]').forEach((node) => {
    node.classList.add('cms-home-dynamic');
    node.setAttribute('data-cms-dynamic-label', 'Managed in Photos');
  });

  const targets = root.querySelectorAll('.eyebrow, .kicker, .tag, h1, h2, h3, p, li, a.btn, figcaption');
  let index = 0;
  targets.forEach((el) => {
    if (el.closest('[data-events], [data-photo-gallery], .cms-home-preview-note')) return;
    if (el.closest('.cms-edit-field')) return;
    index += 1;
    const label = homeFieldLabel(el);
    const inline = !['P', 'LI'].includes(el.tagName);
    el.classList.add('cms-edit-field', 'cms-edit-rich');
    if (inline) el.classList.add('cms-edit-inline');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('role', 'textbox');
    el.setAttribute('spellcheck', 'true');
    el.setAttribute('aria-label', label);
    if (!inline) el.setAttribute('aria-multiline', 'true');
    el.dataset.editLabel = label;
    el.dataset.cmsHomeField = String(index);
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      el.dataset.cmsHref = href;
      const hrefField = document.createElement('label');
      hrefField.className = 'cms-home-href-field';
      hrefField.innerHTML = `Link URL <input type="text" data-home-link-href value="${escapeAttr(href)}" placeholder="page.html or https://…">`;
      el.insertAdjacentElement('afterend', hrefField);
    }
  });

  const note = `<div class="cms-home-preview-note"><p class="kicker">Full homepage editor</p><p>Click any text to edit. Button URLs appear under each button. Calendar events and gallery photos are managed in their own tabs.</p></div>`;
  return note + template.innerHTML;
}

function serializeHomePreviewHtml(preview) {
  if (!preview) return String(state.homeBodyHtml || '');
  preview.querySelectorAll('[data-home-link-href]').forEach((input) => {
    const field = input.closest('.cms-home-href-field');
    const link = field?.previousElementSibling?.tagName === 'A'
      ? field.previousElementSibling
      : field?.parentElement?.querySelector('a.btn');
    if (link) {
      const href = String(input.value || '').trim() || '#';
      link.setAttribute('href', href);
      link.dataset.cmsHref = href;
    }
  });
  const clone = preview.cloneNode(true);
  clone.querySelectorAll('.cms-home-preview-note, .cms-home-href-field').forEach((node) => node.remove());
  clone.querySelectorAll('[contenteditable], [data-cms-home-field], .cms-edit-field').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('role');
    el.removeAttribute('spellcheck');
    el.removeAttribute('aria-label');
    el.removeAttribute('data-placeholder');
    el.removeAttribute('data-edit-label');
    el.removeAttribute('data-cms-home-field');
    el.removeAttribute('data-cms-field');
    el.removeAttribute('data-cms-href');
    el.removeAttribute('data-cms-dynamic-label');
    el.classList.remove('cms-edit-field', 'cms-edit-rich', 'cms-edit-inline', 'is-focused', 'cms-home-dynamic');
  });
  return clone.innerHTML.trim();
}

function extractHomeSiteFields(html = '') {
  const template = document.createElement('template');
  template.innerHTML = html;
  const titleNode = template.content.querySelector('[data-site-field="hero_title"]');
  const subtitleNode = template.content.querySelector('[data-site-field="hero_subtitle"]');
  return {
    hero_title: sanitizeInlineRichHtml(titleNode?.innerHTML || '') || plainTextFromHtml(titleNode?.innerHTML || ''),
    hero_subtitle: sanitizeRichHtml(subtitleNode?.innerHTML || '') || plainTextFromHtml(subtitleNode?.innerHTML || ''),
  };
}

function buildEditableHomePreview() {
  const base = String(state.homeBodyHtml || '').trim();
  if (!base) {
    return '<div class="cms-home-preview-note"><p class="kicker">Home page</p><p>Home page HTML is missing. Refresh or restore the Home page content.</p></div>';
  }
  return markHomeHtmlEditable(base);
}

function editableField(name, tag, value, placeholder = '', extraClass = '') {
  const classes = ['cms-edit-field', 'cms-edit-rich', 'cms-edit-inline', extraClass].filter(Boolean).join(' ');
  const content = formatInlineRichText(value) || '';
  const label = PAGE_FIELD_LABELS[name] || name;
  return `<${tag} class="${classes}" data-cms-field="${escapeAttr(name)}" data-edit-label="${escapeAttr(label)}" contenteditable="true" role="textbox" spellcheck="true" aria-label="${escapeAttr(label)}" data-placeholder="${escapeAttr(placeholder)}">${content}</${tag}>`;
}

function editableRichField(name, value, placeholder = '') {
  const html = formatRichText(value) || '<p></p>';
  const label = PAGE_FIELD_LABELS[name] || name;
  return `<div class="cms-edit-field cms-edit-rich" data-cms-field="${escapeAttr(name)}" data-edit-label="${escapeAttr(label)}" contenteditable="true" role="textbox" spellcheck="true" aria-label="${escapeAttr(label)}" data-placeholder="${escapeAttr(placeholder)}">${html}</div>`;
}

function buildEditablePagePreview(payload = {}) {
  const layout = String(payload.layout || 'standard');
  if (layout === 'home' || payload.slug === 'home' || payload.original_slug === 'home') {
    return buildEditableHomePreview(payload);
  }
  const kicker = String(payload.kicker || 'Page');
  const heading = String(payload.heading || payload.title || 'Untitled Page');
  const intro = String(payload.intro || '');
  const body = String(payload.body_text || '');
  const calloutTitle = String(payload.callout_title || '').trim();
  const calloutText = String(payload.callout_text || '').trim();
  const showCallout = Boolean(calloutTitle || calloutText);
  const callout = showCallout
    ? `<aside class="notice cms-edit-block" data-cms-block="callout"><div class="cms-edit-block-bar"><span>Callout</span><button type="button" class="cms-edit-remove" data-remove-callout>Remove</button></div>${editableField('callout_title', 'h3', calloutTitle || 'Note', 'Callout title')}${editableRichField('callout_text', calloutText, 'Callout details')}</aside>`
    : `<button type="button" class="cms-add-callout" data-add-callout>+ Add callout block</button>`;
  const heroClass = (layout === 'sponsors' || layout === 'become-sponsor') ? 'page-hero sponsor-hero' : 'page-hero';
  const hero = `<section class="${heroClass}" data-cms-layout="${escapeAttr(layout)}"><div class="page-title">${editableField('kicker', 'div', kicker, 'Small label', 'kicker')}${editableField('heading', 'h1', heading, 'Page heading')}${editableField('intro', 'p', intro, 'Short intro sentence')}</div></section>`;
  const eventsPlaceholder = layout === 'calendar'
    ? '<div class="timeline cms-events-placeholder" data-events data-limit="5"><article class="event"><div class="datebox">Aug<span>01</span></div><div><h3>Events appear here</h3><p>Manage real calendar items in the Calendar Events tab.</p></div></article></div>'
    : '';
  const sponsorsCallout = showCallout
    ? `<aside class="sponsor-cta cms-edit-block" data-cms-block="callout"><div class="cms-edit-block-bar"><span>Sponsor callout</span><button type="button" class="cms-edit-remove" data-remove-callout>Remove</button></div><div><span class="sponsor-level">Sponsor opportunities</span>${editableField('callout_title', 'h2', calloutTitle || 'Sponsor opportunities', 'Callout title')}${editableRichField('callout_text', calloutText, 'Callout details')}</div><a class="btn secondary" href="become-a-sponsor.html">Become a sponsor</a></aside>`
    : `<button type="button" class="cms-add-callout" data-add-callout>+ Add sponsor callout</button>`;

  if (layout === 'calendar') {
    return `${hero}<section class="content soft"><div class="wrap">${editableRichField('body_text', body || 'Add calendar instructions here.', 'Page instructions')}${eventsPlaceholder}${callout}</div></section>`;
  }
  if (layout === 'contact') {
    return `${hero}<section class="content soft"><div class="wrap grid two"><article class="card">${editableRichField('body_text', body || 'Add contact details here.', 'Main contact content')}</article><div class="card cms-contact-placeholder" data-contact-form-slot><span class="tag">Contact form</span><h3>Send a message</h3><p>Topics and delivery emails are managed in the Contact tab.</p></div>${showCallout ? callout : ''}</div></section>`;
  }
  if (layout === 'directory') {
    return `${hero}<section class="content"><div class="wrap"><div class="card">${editableRichField('body_text', body || 'Add a short welcome note for families here.', 'Page introduction')}</div><div class="directory cms-staff-placeholder" data-staff><article class="person"><div class="avatar"></div><div class="person-copy"><h3>Staff directory</h3><p class="person-role">Managed in Directors &amp; Staff</p><p>Photos, names, and roles appear here on the public page.</p></div></article></div>${callout}</div></section>`;
  }
  if (layout === 'sponsors') {
    return `${hero}<section class="content sponsor-content"><div class="wrap"><div class="sponsor-intro">${editableRichField('body_text', body || '<div class="kicker">Thank you</div><h2>Community support takes center stage.</h2><p>Our sponsors help provide instruments, instruction, travel, meals, uniforms, and unforgettable performance opportunities.</p>', 'Sponsor intro content')}<a class="btn primary" href="become-a-sponsor.html">Become a sponsor</a></div><div class="sponsor-directory cms-sponsors-placeholder" data-sponsors><article class="sponsor-card"><span class="sponsor-mark">★</span><div><span class="sponsor-level">Sponsor directory</span><h3>Managed in Sponsors</h3><p>Logos, names, and addresses appear here on the public page.</p></div></article></div>${sponsorsCallout}</div></section>`;
  }
  if (layout === 'become-sponsor') {
    const tier = (key) => String(payload[key] || DEFAULT_SPONSOR_TIER_FIELDS[key] || '');
    const benefitsField = (key) => editableRichField(key, tier(key) || DEFAULT_SPONSOR_TIER_FIELDS[key], PAGE_FIELD_LABELS[key]);
    return `${hero}<section class="content sponsor-content"><div class="wrap"><section class="sponsor-tiers" data-sponsor-tiers aria-label="Sponsor packages"><div class="sponsor-tiers-head">${editableField('tiers_kicker', 'span', tier('tiers_kicker'), 'Packages label', 'kicker')}${editableField('tiers_heading', 'h2', tier('tiers_heading'), 'Packages heading')}${editableField('tiers_intro', 'p', tier('tiers_intro'), 'Packages intro')}</div><div class="sponsor-tiers-grid"><article class="sponsor-tier sponsor-tier-bronze" data-tier="bronze">${editableField('bronze_label', 'span', tier('bronze_label'), 'Bronze badge', 'sponsor-tier-label')}${editableField('bronze_title', 'h3', tier('bronze_title'), 'Bronze title')}${editableField('bronze_blurb', 'p', tier('bronze_blurb'), 'Bronze description')}${benefitsField('bronze_benefits')}</article><article class="sponsor-tier sponsor-tier-silver" data-tier="silver">${editableField('silver_label', 'span', tier('silver_label'), 'Silver badge', 'sponsor-tier-label')}${editableField('silver_title', 'h3', tier('silver_title'), 'Silver title')}${editableField('silver_blurb', 'p', tier('silver_blurb'), 'Silver description')}${benefitsField('silver_benefits')}</article><article class="sponsor-tier sponsor-tier-gold" data-tier="gold">${editableField('gold_label', 'span', tier('gold_label'), 'Gold badge', 'sponsor-tier-label')}${editableField('gold_title', 'h3', tier('gold_title'), 'Gold title')}${editableField('gold_blurb', 'p', tier('gold_blurb'), 'Gold description')}${benefitsField('gold_benefits')}</article></div></section><div class="become-sponsor-panel grid two"><article class="card">${editableRichField('body_text', body || '<span class="tag">Next step</span><h3>Ready to partner with Eagle Pride?</h3><p>Pick Bronze, Silver, or Gold above, then send a sponsor inquiry.</p>', 'Sponsor inquiry intro')}</article><div class="card cms-contact-placeholder" data-contact-form-slot><span class="tag">Contact form</span><h3>Send a message</h3><p>Topics and delivery emails are managed in the Contact tab. Choose Sponsor inquiry when available.</p></div></div>${showCallout ? callout : ''}</div></section>`;
  }
  return `${hero}<section class="content"><div class="wrap"><div class="card">${editableRichField('body_text', body || 'Add the page information here.', 'Main page content')}</div>${callout}</div></section>`;
}

const pageEditor = { rebuilding: false, bound: false, baseline: '', dirty: false, capturing: false };

const PAGE_SETTINGS_WIDTH_KEY = 'efband_page_settings_width';
const PAGE_SETTINGS_WIDTH_DEFAULT = 300;
const PAGE_SETTINGS_WIDTH_MIN = 240;
const PAGE_SETTINGS_WIDTH_MAX = 480;

function applyPageSettingsWidth(width) {
  const layout = document.querySelector('.page-visual-layout');
  if (!layout) return;
  const clamped = Math.round(Math.min(PAGE_SETTINGS_WIDTH_MAX, Math.max(PAGE_SETTINGS_WIDTH_MIN, Number(width) || PAGE_SETTINGS_WIDTH_DEFAULT)));
  layout.style.setProperty('--page-settings-width', `${clamped}px`);
  return clamped;
}

function restorePageSettingsWidth() {
  try {
    const saved = Number(localStorage.getItem(PAGE_SETTINGS_WIDTH_KEY));
    applyPageSettingsWidth(Number.isFinite(saved) ? saved : PAGE_SETTINGS_WIDTH_DEFAULT);
  } catch {
    applyPageSettingsWidth(PAGE_SETTINGS_WIDTH_DEFAULT);
  }
}

function bindPageEditorResizer() {
  const layout = document.querySelector('.page-visual-layout');
  const resizer = document.querySelector('#page-editor-resizer');
  const form = document.querySelector('#page-form');
  if (!layout || !resizer || !form || resizer.dataset.bound) return;
  resizer.dataset.bound = '1';
  restorePageSettingsWidth();

  const startDrag = (event) => {
    if (form.hidden || window.matchMedia('(max-width:1100px)').matches) return;
    event.preventDefault();
    const startX = event.clientX ?? event.touches?.[0]?.clientX;
    if (!Number.isFinite(startX)) return;
    const rect = layout.getBoundingClientRect();
    const startWidth = form.getBoundingClientRect().width || PAGE_SETTINGS_WIDTH_DEFAULT;
    layout.classList.add('is-resizing');

    const onMove = (moveEvent) => {
      const clientX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      if (!Number.isFinite(clientX)) return;
      // Dragging left grows the preview; dragging right grows settings.
      const next = startWidth - (clientX - startX);
      const maxForLayout = Math.max(PAGE_SETTINGS_WIDTH_MIN, Math.min(PAGE_SETTINGS_WIDTH_MAX, rect.width - 340));
      applyPageSettingsWidth(Math.min(maxForLayout, next));
      moveEvent.preventDefault?.();
    };
    const onEnd = () => {
      layout.classList.remove('is-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      try {
        const width = Number.parseFloat(getComputedStyle(layout).getPropertyValue('--page-settings-width'));
        if (Number.isFinite(width)) localStorage.setItem(PAGE_SETTINGS_WIDTH_KEY, String(Math.round(width)));
      } catch { /* ignore */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  resizer.addEventListener('pointerdown', startDrag);
  resizer.addEventListener('keydown', (event) => {
    if (form.hidden) return;
    const current = Number.parseFloat(getComputedStyle(layout).getPropertyValue('--page-settings-width')) || PAGE_SETTINGS_WIDTH_DEFAULT;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const width = applyPageSettingsWidth(current + 16);
      try { localStorage.setItem(PAGE_SETTINGS_WIDTH_KEY, String(width)); } catch { /* ignore */ }
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const width = applyPageSettingsWidth(current - 16);
      try { localStorage.setItem(PAGE_SETTINGS_WIDTH_KEY, String(width)); } catch { /* ignore */ }
    }
  });
}

function showPageEditorChrome(active) {
  document.querySelector('#page-form')?.toggleAttribute('hidden', !active);
  document.querySelector('#page-preview')?.toggleAttribute('hidden', !active);
  document.querySelector('[data-page-preview-empty]')?.toggleAttribute('hidden', active);
  document.querySelector('#page-editor-resizer')?.toggleAttribute('hidden', !active);
  const toolbar = document.querySelector('#rich-text-toolbar');
  if (toolbar) toolbar.hidden = !active;
  if (!active) {
    toolbar?.classList.remove('is-active');
    pageEditor.baseline = '';
    pageEditor.dirty = false;
    updatePageDirtyUi();
  }
}

async function loadUtilityLinksEditor() {
  const form = document.querySelector('#utility-links-form');
  if (!form || !hasPermission('site')) return;
  try {
    const result = await jsonFetch('/api/admin/utility-links');
    state.utilityLinks = Array.isArray(result.utility_links) ? result.utility_links : [];
    renderUtilityLinksEditor();
  } catch (error) {
    const status = document.querySelector('#utility-links-status');
    if (status) status.textContent = `Could not load utility links: ${error.message}`;
  }
}

function renderUtilityLinksEditor() {
  const list = document.querySelector('#utility-links-list');
  if (!list) return;
  const links = Array.isArray(state.utilityLinks) && state.utilityLinks.length
    ? state.utilityLinks
    : [
      { label: 'Upcoming Events', href: '/calendar.html', target: '_self' },
      { label: 'Student Resources', href: '/resources.html', target: '_self' },
      { label: 'Contact', href: '/contact.html', target: '_self' },
    ];
  list.innerHTML = links.map((link, index) => {
    const target = link.target === '_blank' ? '_blank' : '_self';
    return `
    <article class="utility-link-row" data-utility-index="${index}">
      <input name="utility_label" value="${escapeHtml(link.label || '')}" required maxlength="60" placeholder="Label" aria-label="Label">
      <input name="utility_href" value="${escapeHtml(link.href || '')}" required placeholder="/calendar.html" aria-label="URL">
      <select name="utility_target" aria-label="Open in">
        <option value="_self"${target === '_self' ? ' selected' : ''}>Same tab</option>
        <option value="_blank"${target === '_blank' ? ' selected' : ''}>New tab</option>
      </select>
      <div class="utility-link-actions">
        <button type="button" class="btn outline" data-utility-up ${index === 0 ? 'disabled' : ''} aria-label="Move link up">↑</button>
        <button type="button" class="btn outline" data-utility-down ${index === links.length - 1 ? 'disabled' : ''} aria-label="Move link down">↓</button>
        <button type="button" class="btn outline" data-utility-remove ${links.length <= 1 ? 'disabled' : ''} aria-label="Remove link">×</button>
      </div>
    </article>
  `;
  }).join('');
  list.querySelectorAll('[data-utility-up]').forEach((button) => button.addEventListener('click', () => moveUtilityLink(Number(button.closest('[data-utility-index]')?.dataset.utilityIndex), -1)));
  list.querySelectorAll('[data-utility-down]').forEach((button) => button.addEventListener('click', () => moveUtilityLink(Number(button.closest('[data-utility-index]')?.dataset.utilityIndex), 1)));
  list.querySelectorAll('[data-utility-remove]').forEach((button) => button.addEventListener('click', () => removeUtilityLink(Number(button.closest('[data-utility-index]')?.dataset.utilityIndex))));
}

function readUtilityLinksDraft() {
  const list = document.querySelector('#utility-links-list');
  if (!list) return [];
  return [...list.querySelectorAll('.utility-link-row')].map((row) => {
    const rawTarget = String(row.querySelector('select[name="utility_target"]')?.value || '_self').trim();
    return {
      label: String(row.querySelector('input[name="utility_label"]')?.value || '').trim(),
      href: String(row.querySelector('input[name="utility_href"]')?.value || '').trim(),
      target: rawTarget === '_blank' ? '_blank' : '_self',
    };
  }).filter((link) => link.label && link.href);
}

function moveUtilityLink(index, delta) {
  const draft = readUtilityLinksDraft();
  const next = index + delta;
  if (!Number.isInteger(index) || next < 0 || next >= draft.length) return;
  const copy = [...draft];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  state.utilityLinks = copy;
  renderUtilityLinksEditor();
}

function removeUtilityLink(index) {
  const draft = readUtilityLinksDraft();
  if (draft.length <= 1 || !Number.isInteger(index)) return;
  draft.splice(index, 1);
  state.utilityLinks = draft;
  renderUtilityLinksEditor();
}

async function loadSocialLinksEditor() {
  const form = document.querySelector('#social-links-form');
  if (!form || !hasPermission('site')) return;
  try {
    const result = await jsonFetch('/api/admin/social-links');
    state.socialLinks = Array.isArray(result.social_links) ? result.social_links : [];
    renderSocialLinksEditor();
  } catch (error) {
    const status = document.querySelector('#social-links-status');
    if (status) status.textContent = `Could not load social links: ${error.message}`;
  }
}

function renderSocialLinksEditor() {
  const list = document.querySelector('#social-links-list');
  if (!list) return;
  const byPlatform = new Map(
    (Array.isArray(state.socialLinks) ? state.socialLinks : []).map((link) => [
      String(link.platform || '').toLowerCase(),
      String(link.href || ''),
    ]),
  );
  list.innerHTML = SOCIAL_PLATFORMS.map((platform) => `
    <article class="social-link-row" data-social-platform="${escapeHtml(platform.id)}">
      <span class="social-link-label">${escapeHtml(platform.label)}</span>
      <input name="social_href" type="text" inputmode="url" autocomplete="url" value="${escapeHtml(byPlatform.get(platform.id) || '')}" placeholder="${escapeHtml(platform.placeholder)}" aria-label="${escapeHtml(platform.label)} URL">
    </article>
  `).join('');
}

function readSocialLinksDraft() {
  const list = document.querySelector('#social-links-list');
  if (!list) return SOCIAL_PLATFORMS.map((platform) => ({ platform: platform.id, href: '' }));
  return SOCIAL_PLATFORMS.map((platform) => {
    const row = list.querySelector(`[data-social-platform="${platform.id}"]`);
    return {
      platform: platform.id,
      href: String(row?.querySelector('input[name="social_href"]')?.value || '').trim(),
    };
  });
}

function pageSnapshotFromPayload(payload) {
  const keys = [
    'original_slug', 'title', 'slug', 'path', 'nav_order', 'layout', 'active',
    'kicker', 'heading', 'intro', 'body_text', 'callout_title', 'callout_text',
    ...HOME_FEATURE_CARD_KEYS,
    ...SPONSOR_TIER_FIELD_KEYS,
  ];
  const snap = {};
  for (const key of keys) {
    let value = payload?.[key];
    if (key === 'nav_order') value = Number(value || 99);
    else if (key === 'active') value = Boolean(value);
    else value = value == null ? '' : String(value);
    snap[key] = value;
  }
  return JSON.stringify(snap);
}

function currentPageSnapshot() {
  const form = document.querySelector('#page-form');
  if (!form || form.hidden) return '';
  pageEditor.capturing = true;
  try {
    document.querySelector('#page-preview')?.querySelectorAll('[data-cms-field]').forEach(syncFieldFromPreview);
    const payload = pagePayload(form);
    const base = pageSnapshotFromPayload(payload);
    if (payload.layout === 'home' || payload.original_slug === 'home' || payload.slug === 'home') {
      return JSON.stringify({
        page: JSON.parse(base),
        home_html: serializeHomePreviewHtml(document.querySelector('#page-preview')),
      });
    }
    return base;
  } finally {
    pageEditor.capturing = false;
  }
}

function updatePageDirtyUi() {
  document.querySelector('[data-page-dirty-chip]')?.classList.toggle('is-visible', Boolean(pageEditor.dirty));
}

function capturePageBaseline() {
  pageEditor.baseline = currentPageSnapshot();
  pageEditor.dirty = false;
  updatePageDirtyUi();
}

function refreshPageDirtyState() {
  const form = document.querySelector('#page-form');
  if (!form || form.hidden || !pageEditor.baseline || pageEditor.rebuilding || pageEditor.capturing) {
    if (!form || form.hidden || !pageEditor.baseline) {
      pageEditor.dirty = false;
      updatePageDirtyUi();
    }
    return;
  }
  pageEditor.dirty = currentPageSnapshot() !== pageEditor.baseline;
  updatePageDirtyUi();
}

function askUnsavedPageDialog() {
  const dialog = document.querySelector('#unsaved-page-dialog');
  if (!dialog?.showModal) return Promise.resolve('discard');
  return new Promise(resolve => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue || 'stay');
    };
    dialog.addEventListener('close', onClose);
    dialog.returnValue = '';
    dialog.showModal();
  });
}

async function discardPageEdits() {
  const form = document.querySelector('#page-form');
  if (!form) {
    pageEditor.baseline = '';
    pageEditor.dirty = false;
    updatePageDirtyUi();
    return;
  }
  const slug = String(form.elements.original_slug?.value || '').trim();
  if (slug) {
    await ensureFullPagesLoaded();
    const page = state.pages.find(item => item.slug === slug);
    if (page) {
      const isHomePage = Boolean(page.is_home) || page.slug === 'home';
      state.homeBodyHtml = isHomePage ? String(page.body_html || '') : '';
      fillForm(form, { ...page, ...structuredPageFields(page), original_slug: page.slug });
      form.elements.active.checked = Boolean(page.active);
      syncPreviewFromForm();
      capturePageBaseline();
      return;
    }
  }
  capturePageBaseline();
}

async function saveCurrentPage({ reloadEditor = true } = {}) {
  const form = document.querySelector('#page-form');
  const status = document.querySelector('#page-status');
  if (!form) return false;
  document.querySelector('#page-preview')?.querySelectorAll('[data-cms-field]').forEach(syncFieldFromPreview);
  const payload = pagePayload(form);
  const original = payload.original_slug;
  delete payload.original_slug;
  const isHomeSave = original === 'home' || payload.slug === 'home' || payload.layout === 'home';
  if (!isHomeSave && !plainTextFromHtml(payload.heading)) {
    if (status) status.textContent = 'Add a page heading in the live preview before saving.';
    document.querySelector('#page-preview [data-cms-field="heading"]')?.focus();
    return false;
  }
  if (isHomeSave) {
    payload.heading = payload.heading || 'Home';
    payload.title = payload.title || 'Home';
    payload.slug = 'home';
    payload.body_html = serializeHomePreviewHtml(document.querySelector('#page-preview'));
    if (!payload.body_html) {
      if (status) status.textContent = 'Home page content is empty. Refresh and try again.';
      return false;
    }
  }
  if (status) status.textContent = 'Saving…';
  try {
    await jsonFetch(original ? `/api/admin/pages/${original}` : '/api/admin/pages', {
      method: original ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (isHomeSave && hasPermission('site')) {
      const siteFields = extractHomeSiteFields(payload.body_html);
      if (siteFields.hero_title || siteFields.hero_subtitle) {
        await jsonFetch('/api/admin/site', {
          method: 'POST',
          body: JSON.stringify({
            ...(state.site || {}),
            hero_title: siteFields.hero_title || state.site?.hero_title,
            hero_subtitle: siteFields.hero_subtitle || state.site?.hero_subtitle,
          }),
        }).catch(() => null);
      }
    }
    if (status) status.textContent = 'Page saved. Public site updated.';
    if (form.elements.original_slug) form.elements.original_slug.value = payload.slug || original || '';
    capturePageBaseline();
    await refreshAll();
    if (reloadEditor && payload.slug) await editPage(payload.slug, { skipGuard: true });
    else capturePageBaseline();
    return true;
  } catch (error) {
    if (status) status.textContent = `Could not save page: ${error.message}`;
    return false;
  }
}

async function confirmLeavePageEditor() {
  refreshPageDirtyState();
  if (!pageEditor.dirty) return true;
  const choice = await askUnsavedPageDialog();
  if (choice === 'stay' || choice === '') return false;
  if (choice === 'save') return saveCurrentPage({ reloadEditor: false });
  await discardPageEdits();
  return true;
}

function syncFieldFromPreview(field) {
  const form = document.querySelector('#page-form');
  if (!form || !field?.dataset.cmsField) return;
  const name = field.dataset.cmsField;
  const control = form.elements[name];
  if (!control) return;
  const value = field.classList.contains('cms-edit-rich')
    ? (field.classList.contains('cms-edit-inline')
      ? sanitizeInlineRichHtml(field.innerHTML)
      : sanitizeRichHtml(field.innerHTML))
    : field.textContent.replace(/\s+/g, ' ').trim();
  if (control.value !== value) control.value = value;
  if (!pageEditor.rebuilding && !pageEditor.capturing) refreshPageDirtyState();
}

function setRichToolbarVisible(activeField = false) {
  const toolbar = document.querySelector('#rich-text-toolbar');
  if (!toolbar) return;
  // Sticky Formatting bar stays under Live page preview; highlight while editing.
  if (activeField) toolbar.hidden = false;
  toolbar.classList.toggle('is-active', Boolean(activeField));
}

function applyRichStyle(styleMap = {}) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  document.execCommand('styleWithCSS', false, true);
  const range = selection.getRangeAt(0);
  const span = document.createElement('span');
  Object.assign(span.style, styleMap);
  try {
    range.surroundContents(span);
  } catch {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }
  selection.removeAllRanges();
  const next = document.createRange();
  next.selectNodeContents(span);
  next.collapse(false);
  selection.addRange(next);
}

function syncPreviewFromForm() {
  if (pageEditor.rebuilding) return;
  const form = document.querySelector('#page-form');
  const preview = document.querySelector('#page-preview');
  if (!form || !preview || form.hidden) return;
  pageEditor.rebuilding = true;
  try {
    const payload = pagePayload(form);
    const isHome = payload.layout === 'home' || payload.slug === 'home' || payload.original_slug === 'home';
    if (isHome && preview.querySelector('[data-cms-home-field]')) {
      state.homeBodyHtml = serializeHomePreviewHtml(preview);
    }
    preview.innerHTML = buildEditablePagePreview(payload);
    const chip = document.querySelector('[data-page-layout-chip]');
    if (chip) chip.textContent = layoutChipLabel(payload.layout);
    bindPagePreviewInteractions(preview);
  } finally {
    pageEditor.rebuilding = false;
  }
}

function bindPagePreviewInteractions(preview) {
  preview.querySelectorAll('[data-cms-field], [data-cms-home-field]').forEach(field => {
    field.addEventListener('input', () => {
      syncFieldFromPreview(field);
      if (!pageEditor.rebuilding && !pageEditor.capturing) refreshPageDirtyState();
    });
    field.addEventListener('blur', () => syncFieldFromPreview(field));
    field.addEventListener('focus', () => {
      preview.querySelectorAll('.cms-edit-field.is-focused').forEach(node => node.classList.remove('is-focused'));
      field.classList.add('is-focused');
    });
    field.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      // Block multi-line breaks in hero/title fields; body/callout rich blocks still allow Enter.
      if (field.classList.contains('cms-edit-rich') && !field.classList.contains('cms-edit-inline')) return;
      event.preventDefault();
      field.blur();
    });
    if (field.tagName === 'A') {
      field.addEventListener('click', (event) => event.preventDefault());
    }
  });
  preview.querySelectorAll('[data-home-link-href]').forEach((input) => {
    input.addEventListener('input', () => {
      const field = input.closest('.cms-home-href-field');
      const link = field?.previousElementSibling?.tagName === 'A' ? field.previousElementSibling : null;
      if (link) link.setAttribute('href', input.value.trim() || '#');
      refreshPageDirtyState();
    });
  });
  preview.querySelectorAll('[data-add-callout]').forEach(button => {
    button.addEventListener('click', () => {
      const form = document.querySelector('#page-form');
      if (!form.elements.callout_title.value) form.elements.callout_title.value = 'Note';
      if (!form.elements.callout_text.value) form.elements.callout_text.value = 'Add an important note for families here.';
      syncPreviewFromForm();
      refreshPageDirtyState();
      preview.querySelector('[data-cms-field="callout_title"]')?.focus();
    });
  });
  preview.querySelectorAll('[data-remove-callout]').forEach(button => {
    button.addEventListener('click', () => {
      const form = document.querySelector('#page-form');
      form.elements.callout_title.value = '';
      form.elements.callout_text.value = '';
      syncPreviewFromForm();
      refreshPageDirtyState();
    });
  });
}

function bindPageVisualEditor() {
  if (pageEditor.bound) return;
  const form = document.querySelector('#page-form');
  const preview = document.querySelector('#page-preview');
  if (!form || !preview) return;
  pageEditor.bound = true;

  form.addEventListener('input', event => {
    if (pageEditor.rebuilding) return;
    const name = event.target?.name;
    if (!name) return;
    if (['layout', 'title'].includes(name)) {
      syncPreviewFromForm();
      refreshPageDirtyState();
      return;
    }
    if (['kicker', 'heading', 'intro', 'body_text', 'callout_title', 'callout_text', ...HOME_FEATURE_CARD_KEYS, ...SPONSOR_TIER_FIELD_KEYS].includes(name)) {
      if (name === 'boosters_href') {
        const hrefInput = preview.querySelector('[data-home-href-input]');
        if (hrefInput) hrefInput.value = event.target.value;
        const button = preview.querySelector('[data-cms-field="boosters_button"]');
        if (button) button.setAttribute('href', event.target.value.trim() || '#');
        refreshPageDirtyState();
        return;
      }
      const field = preview.querySelector(`[data-cms-field="${name}"]`);
      if (!field) {
        syncPreviewFromForm();
        refreshPageDirtyState();
        return;
      }
      if (field.classList.contains('cms-edit-inline')) {
        field.innerHTML = formatInlineRichText(event.target.value);
      } else if (field.classList.contains('cms-edit-rich')) {
        field.innerHTML = formatRichText(event.target.value) || '<p></p>';
      } else {
        field.textContent = event.target.value;
      }
    }
    refreshPageDirtyState();
  });

  form.addEventListener('change', event => {
    if (event.target?.name === 'layout') syncPreviewFromForm();
    refreshPageDirtyState();
  });

  preview.addEventListener('focusin', event => {
    const field = event.target.closest?.('.cms-edit-rich');
    setRichToolbarVisible(Boolean(field));
  });
  preview.addEventListener('focusout', event => {
    const next = event.relatedTarget;
    if (next?.closest?.('#rich-text-toolbar')) return;
    setTimeout(() => {
      const active = preview.querySelector('.cms-edit-rich.is-focused, .cms-edit-rich:focus');
      setRichToolbarVisible(Boolean(active) || Boolean(document.activeElement?.closest?.('#rich-text-toolbar')));
    }, 0);
  });

  preview.addEventListener('paste', event => {
    const field = event.target.closest?.('[data-cms-field], [data-cms-home-field]');
    if (!field) return;
    event.preventDefault();
    if (field.classList.contains('cms-edit-rich')) {
      const html = event.clipboardData?.getData('text/html');
      const text = event.clipboardData?.getData('text/plain') || '';
      const clean = field.classList.contains('cms-edit-inline')
        ? (html ? sanitizeInlineRichHtml(html) : formatInlineRichText(text))
        : (html ? sanitizeRichHtml(html) : formatRichText(text));
      document.execCommand('insertHTML', false, clean || escapeHtml(text));
      syncFieldFromPreview(field);
    } else {
      const text = event.clipboardData?.getData('text/plain') || '';
      document.execCommand('insertText', false, text.replace(/\s+/g, ' '));
    }
  });

  const toolbar = document.querySelector('#rich-text-toolbar');
  toolbar?.querySelectorAll('[data-rich]').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => {
      const command = button.dataset.rich;
      // Semantic tags for bold/italic/underline; CSS spans are stripped by sanitization.
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(command, false, null);
      const field = preview.querySelector('.cms-edit-rich.is-focused') || preview.querySelector('.cms-edit-rich:focus');
      if (field) syncFieldFromPreview(field);
    });
  });
  document.querySelector('#rich-text-color')?.addEventListener('input', event => {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, event.target.value);
    const field = preview.querySelector('.cms-edit-rich.is-focused') || preview.querySelector('.cms-edit-rich:focus');
    if (field) syncFieldFromPreview(field);
  });
  document.querySelector('#rich-text-size')?.addEventListener('change', event => {
    if (!event.target.value) return;
    applyRichStyle({ fontSize: event.target.value });
    const field = preview.querySelector('.cms-edit-rich.is-focused') || preview.querySelector('.cms-edit-rich:focus');
    if (field) syncFieldFromPreview(field);
    event.target.value = '';
  });

  document.querySelector('#add-page-callout')?.addEventListener('click', () => {
    const title = form.elements.callout_title;
    const text = form.elements.callout_text;
    if (!title.value) title.value = 'Note';
    if (!text.value) text.value = 'Add an important note for families here.';
    syncPreviewFromForm();
    refreshPageDirtyState();
    preview.querySelector('[data-cms-field="callout_title"]')?.focus();
  });

  window.addEventListener('beforeunload', event => {
    refreshPageDirtyState();
    if (!pageEditor.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.querySelectorAll('form[action="/admin/logout"]').forEach((logoutForm) => {
    logoutForm.addEventListener('submit', async (event) => {
      if (logoutForm.dataset.forceLogout === '1') return;
      event.preventDefault();
      if (!(await confirmLeavePageEditor())) return;
      logoutForm.dataset.forceLogout = '1';
      logoutForm.submit();
    });
  });
}

async function submitAdminLogout() {
  const logoutForm = document.querySelector('#admin-mobile-logout-form:not([hidden])')
    || document.querySelector('#admin-logout-form')
    || document.querySelector('form[action="/admin/logout"]');
  if (!logoutForm) return;
  if (!(await confirmLeavePageEditor())) return;
  logoutForm.dataset.forceLogout = '1';
  logoutForm.submit();
}

function setSelectValue(select, value) {
  if (!select) return;
  if (value && ![...select.options].some(option => option.value === value)) {
    select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
  }
  select.value = value || select.value;
}

function setAdminNavOpen(open) {
  const toggle = document.querySelector('.admin-nav-toggle');
  const menu = document.querySelector('#admin-mobile-menu');
  if (!toggle || !menu) return;
  toggle.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  document.querySelector('.admin-mobile-bar')?.classList.toggle('open', open);
}

function closeAdminNav() {
  setAdminNavOpen(false);
}

function renderMobileAdminMenu() {
  const menu = document.querySelector('#admin-mobile-menu');
  const nav = document.querySelector('.admin-menu');
  if (!menu || !nav) return;

  const sourceButtons = [];
  const parts = [];

  const isVisibleButton = (button) => (
    Boolean(button)
    && !button.hidden
    && !button.closest('[hidden]')
    && !button.hasAttribute('data-sponsors-toggle')
    && !button.hasAttribute('data-boosters-toggle')
  );

  const pushButton = (button) => {
    if (!isVisibleButton(button)) return;
    const index = sourceButtons.length;
    sourceButtons.push(button);
    const label = button.textContent.trim();
    const tab = button.dataset.tab || '';
    const shortcut = button.dataset.editShortcut || '';
    const sponsorNav = button.dataset.sponsorNav || '';
    const pageNav = button.dataset.pageNav || '';
    parts.push(`<button type="button" data-mobile-index="${index}" data-tab="${escapeHtml(tab)}" data-edit-shortcut="${escapeHtml(shortcut)}" data-sponsor-nav="${escapeHtml(sponsorNav)}" data-page-nav="${escapeHtml(pageNav)}">${escapeHtml(label)}</button>`);
  };

  const pushLabel = (text) => {
    const label = String(text || '').trim();
    if (!label) return;
    parts.push(`<p class="admin-mobile-menu-label">${escapeHtml(label)}</p>`);
  };

  const sectionHasVisibleButtons = (nodes) => nodes.some((node) => {
    if (node.matches?.('button')) return isVisibleButton(node);
    return [...(node.querySelectorAll?.('button') || [])].some(isVisibleButton);
  });

  [...nav.children].forEach((child) => {
    if (child.matches('button')) {
      pushButton(child);
      return;
    }
    if (child.matches('.admin-menu-label')) {
      if (child.hidden) return;
      if (child.hasAttribute('data-page-shortcuts-label')) {
        const shortcuts = document.querySelector('#admin-page-shortcuts');
        if (!sectionHasVisibleButtons([...(shortcuts?.children || [])])) return;
      } else {
        // Manage label: only show when at least one following manage control is visible.
        const following = [];
        let sibling = child.nextElementSibling;
        while (sibling) {
          if (sibling.matches('.admin-menu-label')) break;
          following.push(sibling);
          sibling = sibling.nextElementSibling;
        }
        if (!sectionHasVisibleButtons(following)) return;
      }
      pushLabel(child.textContent);
      return;
    }
    if (child.matches('#admin-page-shortcuts, .admin-page-shortcuts')) {
      [...child.querySelectorAll('button')].forEach(pushButton);
      return;
    }
    if (child.matches('.admin-menu-group')) {
      if (child.hidden) return;
      [...child.querySelectorAll('button')].forEach(pushButton);
      return;
    }
    [...child.querySelectorAll?.('button') || []].forEach(pushButton);
  });

  menu.innerHTML = `${parts.join('')}
  <button type="button" class="admin-mobile-logout" data-mobile-logout>Log Out</button>`;
  menu.querySelectorAll('button[data-mobile-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.mobileIndex);
      const source = sourceButtons[index];
      closeAdminNav();
      source?.click();
    });
  });
  menu.querySelector('[data-mobile-logout]')?.addEventListener('click', async () => {
    closeAdminNav();
    await submitAdminLogout();
  });
}

function markAdminNavActive({ tab = '', pageSlug = '', sponsorNav = '' } = {}) {
  document.querySelectorAll('.admin-menu button').forEach((button) => {
    const isTab = Boolean(tab) && button.dataset.tab === tab
      && !button.dataset.editShortcut
      && !button.dataset.sponsorNav
      && !button.dataset.pageNav;
    const isPage = Boolean(pageSlug) && button.dataset.editShortcut === pageSlug;
    const isSponsorNav = Boolean(sponsorNav) && button.dataset.sponsorNav === sponsorNav;
    const isPageNav = Boolean(pageSlug) && button.dataset.pageNav === pageSlug;
    button.classList.toggle('active', Boolean(isTab || isPage || isSponsorNav || isPageNav));
  });
}

function activateTab(name) {
  const pagesPanel = document.querySelector('#tab-pages');
  const leavingPages = Boolean(pagesPanel && !pagesPanel.hidden && name !== 'pages');
  const apply = () => {
    if (name !== 'ensembles') closeEnsemblesBodyEditor();
    document.querySelectorAll('.cms-panel').forEach(panel => { panel.hidden = true; });
    document.querySelector(`#tab-${name}`)?.removeAttribute('hidden');
    markAdminNavActive({ tab: name });
    if (name === 'sponsors') {
      setSponsorsMenuOpen(true);
      loadSponsors().catch(() => {});
    }
    if (name === 'booster-members' || name === 'minutes') {
      setBoostersMenuOpen(true);
    }
    if (name === 'minutes') {
      loadMinutes().catch(() => {});
    }
    if (name === 'ensembles') {
      loadEnsemblesBody()
        .then(() => openEnsemblesBodyEditor())
        .catch(() => {});
    }
    if (name === 'mail') {
      loadMailRecipients().catch(() => {});
    }
    if (name === 'social') {
      loadSocialPanel().catch(() => {});
    }
    closeAdminNav();
  };
  if (!leavingPages) {
    apply();
    return Promise.resolve(true);
  }
  return confirmLeavePageEditor().then(ok => {
    if (ok) apply();
    return ok;
  });
}

function activatePageShortcut(slug) {
  const sponsorNav = slug === 'sponsors' ? 'sponsors-page' : (slug === 'become-a-sponsor' ? 'become-a-sponsor' : '');
  if (sponsorNav) setSponsorsMenuOpen(true);
  markAdminNavActive({ pageSlug: slug, sponsorNav });
  closeAdminNav();
}

async function ensureFullPagesLoaded() {
  if (!state.pages.some(page => page.body_html !== undefined)) await loadPages();
}

function pageLabel(slug) {
  return ({
    home: 'Home',
    directors: 'Directors & Staff',
    resources: 'Student Resources',
    'become-a-sponsor': 'Become a Sponsor',
  }[slug]) || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function pageShortcutLabel(page) {
  const title = String(page?.title || '').replace(/\s*\|\s*East Forsyth Band$/i, '').trim();
  return title || pageLabel(page?.slug || '');
}

const SPONSOR_PAGE_SHORTCUT_EXCLUDES = new Set(['sponsors', 'become-a-sponsor']);

function canManageSitePages() {
  // Pages nav is for site admins (global `pages` permission / Super Admin).
  // Editors with only page:{slug} use Manage shortcuts instead.
  return hasPermission('pages');
}

function syncPageSettingsAccess() {
  const siteAdmin = canManageSitePages();
  document.querySelectorAll('.page-meta-grid, .page-active-line, #add-page-callout').forEach((node) => {
    node.hidden = !siteAdmin;
  });
  const settingsTitle = document.querySelector('#page-form h2');
  if (settingsTitle) settingsTitle.textContent = siteAdmin ? 'Page settings' : 'Publish';
}

function editablePages() {
  if (!canManageSitePages()) return [];
  return (state.pages || [])
    .filter((page) => canEditPage(page) && !SPONSOR_PAGE_SHORTCUT_EXCLUDES.has(page.slug))
    .slice()
    .sort((a, b) => {
      const orderA = Number(a.nav_order ?? 99);
      const orderB = Number(b.nav_order ?? 99);
      if (orderA !== orderB) return orderA - orderB;
      return pageShortcutLabel(a).localeCompare(pageShortcutLabel(b));
    });
}

function canAccessSponsorsMenu() {
  return canEditSponsors() || canEditPage('sponsors') || canEditPage('become-a-sponsor');
}

function canAccessBoostersMenu() {
  return canEditBoosterMembers() || canViewMinutes();
}

function setSponsorsMenuOpen(open) {
  document.querySelectorAll('[data-sponsors-menu]').forEach((menu) => {
    const toggle = menu.querySelector('[data-sponsors-toggle]');
    const sub = menu.querySelector('[data-sponsors-sub]');
    if (toggle) toggle.setAttribute('aria-expanded', String(Boolean(open)));
    if (sub) sub.hidden = !open;
  });
}

function setBoostersMenuOpen(open) {
  document.querySelectorAll('[data-boosters-menu]').forEach((menu) => {
    const toggle = menu.querySelector('[data-boosters-toggle]');
    const sub = menu.querySelector('[data-boosters-sub]');
    if (toggle) toggle.setAttribute('aria-expanded', String(Boolean(open)));
    if (sub) sub.hidden = !open;
  });
}

function bindSponsorsMenu() {
  const menu = document.querySelector('[data-sponsors-menu]');
  const toggle = menu?.querySelector('[data-sponsors-toggle]');
  if (!menu || !toggle || toggle.dataset.bound === '1') return;
  toggle.dataset.bound = '1';
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setSponsorsMenuOpen(open);
  });
  menu.querySelectorAll('[data-sponsor-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sponsorNav;
      setSponsorsMenuOpen(true);
      if (key === 'sponsors-page') editPage('sponsors');
      else if (key === 'become-a-sponsor') editPage('become-a-sponsor');
    });
  });
}

function bindBoostersMenu() {
  const menu = document.querySelector('[data-boosters-menu]');
  const toggle = menu?.querySelector('[data-boosters-toggle]');
  if (!menu || !toggle || toggle.dataset.bound === '1') return;
  toggle.dataset.bound = '1';
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setBoostersMenuOpen(open);
  });
}

function renderPageShortcuts() {
  const mount = document.querySelector('#admin-page-shortcuts');
  const label = document.querySelector('[data-page-shortcuts-label]');
  if (!mount) return;
  const pages = editablePages();
  if (label) label.hidden = !pages.length;
  mount.innerHTML = pages.map((page) => (
    `<button type="button" data-edit-shortcut="${escapeAttr(page.slug)}">${escapeHtml(pageShortcutLabel(page))}</button>`
  )).join('');
  mount.querySelectorAll('[data-edit-shortcut]').forEach((button) => {
    button.onclick = () => editPage(button.dataset.editShortcut);
  });
}

function showAllowedPanels() {
  const displayName = state.me.user.display_name || state.me.user.username;
  document.querySelector('#current-user').innerHTML = `<b>${escapeHtml(displayName)}</b><span>${isSuperAdmin() ? 'Super Admin' : 'Editor'}</span>`;

  const panels = {
    dashboard: true,
    mail: true,
    // Page editor panel stays available for Manage page-body shortcuts (e.g. Ensembles).
    pages: state.pages.some(canEditPage),
    sponsors: canEditSponsors(),
    staff: canEditStaff(),
    ensembles: canEditPage('ensembles'),
    'booster-members': canEditBoosterMembers(),
    minutes: canViewMinutes(),
    contact: canEditContact(),
    site: hasPermission('site'),
    social: hasPermission('site'),
    users: hasPermission('users'),
    events: canCreateEvents() || canEditPage('calendar'),
    photos: hasPermission('photos'),
  };
  let manageVisible = false;
  document.querySelectorAll('.admin-menu [data-tab]').forEach(button => {
    const allowed = button.dataset.tab === 'dashboard' || button.dataset.tab === 'mail' || panels[button.dataset.tab];
    button.hidden = !allowed;
    button.onclick = () => activateTab(button.dataset.tab);
    if (allowed && button.dataset.tab !== 'dashboard' && button.dataset.tab !== 'mail') manageVisible = true;
  });
  const boostersMenu = document.querySelector('[data-boosters-menu]');
  const boostersAccess = canAccessBoostersMenu();
  if (boostersMenu) {
    boostersMenu.hidden = !boostersAccess;
    if (boostersAccess) manageVisible = true;
    const boostersToggle = boostersMenu.querySelector('[data-boosters-toggle]');
    if (boostersToggle) boostersToggle.hidden = !boostersAccess;
    const boosterMembersBtn = boostersMenu.querySelector('[data-tab="booster-members"]');
    if (boosterMembersBtn) boosterMembersBtn.hidden = !canEditBoosterMembers();
    const minutesBtn = boostersMenu.querySelector('[data-tab="minutes"]');
    if (minutesBtn) minutesBtn.hidden = !canViewMinutes();
  }
  bindBoostersMenu();
  const sponsorsMenu = document.querySelector('[data-sponsors-menu]');
  const sponsorsAccess = canAccessSponsorsMenu();
  if (sponsorsMenu) {
    sponsorsMenu.hidden = !sponsorsAccess;
    if (sponsorsAccess) manageVisible = true;
    const sponsorsToggle = sponsorsMenu.querySelector('[data-sponsors-toggle]');
    if (sponsorsToggle) sponsorsToggle.hidden = !sponsorsAccess;
    const manageSponsorsBtn = sponsorsMenu.querySelector('[data-tab="sponsors"]');
    if (manageSponsorsBtn) manageSponsorsBtn.hidden = !canEditSponsors();
    const sponsorsPageBtn = sponsorsMenu.querySelector('[data-sponsor-nav="sponsors-page"]');
    if (sponsorsPageBtn) sponsorsPageBtn.hidden = !canEditPage('sponsors');
    const becomeBtn = sponsorsMenu.querySelector('[data-sponsor-nav="become-a-sponsor"]');
    if (becomeBtn) becomeBtn.hidden = !canEditPage('become-a-sponsor');
  }
  bindSponsorsMenu();
  const manageLabel = [...document.querySelectorAll('.admin-menu-label')].find((node) => !node.hasAttribute('data-page-shortcuts-label'));
  if (manageLabel) manageLabel.hidden = !manageVisible;
  renderPageShortcuts();
  const newPageButton = document.querySelector('#new-page');
  if (newPageButton) newPageButton.hidden = !canManageSitePages();
  syncPageSettingsAccess();
  const editCalendarPage = document.querySelector('#edit-calendar-page');
  if (editCalendarPage) {
    editCalendarPage.hidden = !canEditPage('calendar');
    editCalendarPage.onclick = () => editPage('calendar');
  }
  const editDirectorsPage = document.querySelector('#edit-directors-page');
  if (editDirectorsPage) {
    editDirectorsPage.hidden = !canEditPage('directors');
    editDirectorsPage.onclick = () => editPage('directors');
  }
  const editBoostersPage = document.querySelector('#edit-boosters-page');
  if (editBoostersPage) {
    editBoostersPage.hidden = !canEditPage('boosters');
    editBoostersPage.onclick = () => editPage('boosters');
  }
  const editContactPage = document.querySelector('#edit-contact-page');
  if (editContactPage) {
    editContactPage.hidden = !canEditPage('contact');
    editContactPage.onclick = () => editPage('contact');
  }
  const newEventButton = document.querySelector('#new-event');
  const eventForm = document.querySelector('#event-form');
  const eventsList = document.querySelector('#events-list');
  const canUseEvents = canCreateEvents();
  if (newEventButton) newEventButton.hidden = !canUseEvents;
  if (eventForm) eventForm.hidden = !canUseEvents;
  if (eventsList) eventsList.hidden = !canUseEvents && !canEditPage('calendar');
  Object.entries(panels).forEach(([name, allowed]) => {
    const panel = document.querySelector(`#tab-${name}`);
    if (panel) panel.hidden = !allowed;
  });
  syncMinutesPanelMode();
  renderMobileAdminMenu();
  bindAdminNavToggle();
  renderDashboard();
  activateTab('dashboard');
}

function bindAdminNavToggle() {
  const toggle = document.querySelector('.admin-nav-toggle');
  if (!toggle || toggle.dataset.bound === '1') return;
  toggle.dataset.bound = '1';
  toggle.addEventListener('click', event => {
    event.stopPropagation();
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    if (open) renderMobileAdminMenu();
    setAdminNavOpen(open);
  });
  document.addEventListener('click', event => {
    const bar = document.querySelector('.admin-mobile-bar');
    if (!bar || bar.hidden || !bar.classList.contains('open')) return;
    if (!bar.contains(event.target)) closeAdminNav();
  });
}

async function loadMe() {
  state.me = await jsonFetch('/api/admin/me');
  state.pageCatalog = Array.isArray(state.me.pages) ? state.me.pages : [];
  state.pages = state.pageCatalog;
  renderPagePermissionBoxes();
  showAllowedPanels();
}

function syncZernioPublishModeUi() {
  const form = document.querySelector('#zernio-post-form');
  const scheduleFields = document.querySelector('#zernio-schedule-fields');
  if (!form || !scheduleFields) return;
  const mode = String(form.querySelector('input[name="publish_mode"]:checked')?.value || 'now');
  const scheduled = mode === 'schedule';
  scheduleFields.hidden = !scheduled;
  const input = form.elements.scheduled_for;
  if (input) input.required = scheduled;
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.textContent = scheduled ? 'Schedule Facebook post' : 'Publish to Facebook';
}

function renderZernioFacebookPages() {
  const card = document.querySelector('#zernio-facebook-pages-card');
  const list = document.querySelector('#zernio-facebook-pages-list');
  if (!card || !list) return;
  const needsSelect = Boolean(state.zernioFacebook?.needsPageSelection);
  card.hidden = !needsSelect;
  if (!needsSelect) {
    list.innerHTML = '';
    return;
  }
  const pages = Array.isArray(state.zernioPages) ? state.zernioPages : [];
  if (!pages.length) {
    list.innerHTML = '<p class="muted">No Pages found yet. Make sure you selected the Page in Meta, then connect again.</p>';
    return;
  }
  list.innerHTML = pages.map((page) => {
    const label = page.name || page.username || page.id;
    const meta = [page.username, page.category].filter(Boolean).join(' · ');
    return `<article class="admin-row zernio-page-row"><div><b>${escapeHtml(label)}</b>${meta ? `<small>${escapeHtml(meta)}</small>` : ''}</div><div class="row-actions"><button type="button" class="btn primary" data-zernio-page-id="${escapeAttr(page.id)}">Use this Page</button></div></article>`;
  }).join('');
  list.querySelectorAll('[data-zernio-page-id]').forEach((button) => {
    button.addEventListener('click', () => selectZernioFacebookPage(button.dataset.zernioPageId));
  });
}

function renderZernioFacebookStatus(status) {
  state.zernioFacebook = status || null;
  const statusEl = document.querySelector('#zernio-facebook-status');
  const siteStatusEl = document.querySelector('#zernio-facebook-status-site');
  const connectBtn = document.querySelector('#zernio-facebook-connect');
  const refreshBtn = document.querySelector('#zernio-facebook-refresh');
  const disconnectBtn = document.querySelector('#zernio-facebook-disconnect');
  const postForm = document.querySelector('#zernio-post-form');
  const detail = status?.detail || (status?.connected ? 'Facebook connected.' : 'Facebook not connected.');
  if (statusEl) {
    const debugNote = (!status?.connected && status?.debug?.note)
      ? ` Last connect note: ${status.debug.note}${status.debug.keys?.length ? ` [${status.debug.keys.join(', ')}]` : ''}.`
      : '';
    statusEl.textContent = `${detail}${debugNote}`;
    statusEl.classList.toggle('ok', Boolean(status?.connected));
  }
  if (siteStatusEl) {
    siteStatusEl.textContent = detail;
    siteStatusEl.classList.toggle('ok', Boolean(status?.connected));
  }
  if (connectBtn) {
    connectBtn.hidden = !status?.configured;
    connectBtn.textContent = status?.connected
      ? 'Reconnect Facebook'
      : (status?.needsPageSelection ? 'Restart Facebook connect' : 'Connect Facebook');
    // Always start OAuth from the custom domain so the callback keeps the CMS session.
    if (status?.configured) {
      connectBtn.setAttribute('href', 'https://efhsband.org/admin/zernio/facebook/connect');
    }
  }
  if (refreshBtn) refreshBtn.hidden = !status?.configured;
  if (disconnectBtn) disconnectBtn.hidden = !status?.connected;
  if (postForm) postForm.hidden = !status?.connected;
  const eventsCard = document.querySelector('#zernio-facebook-events-card');
  if (eventsCard) eventsCard.hidden = !status?.connected;
  if (!status?.needsPageSelection) state.zernioPages = [];
  renderZernioFacebookPages();
  syncZernioPublishModeUi();
}

async function loadZernioFacebookPages() {
  const statusEl = document.querySelector('#zernio-facebook-pages-status');
  if (!hasPermission('site') || !state.zernioFacebook?.needsPageSelection) {
    state.zernioPages = [];
    renderZernioFacebookPages();
    return;
  }
  if (statusEl) statusEl.textContent = 'Loading Facebook Pages…';
  try {
    const result = await jsonFetch('/api/admin/zernio/facebook/pages');
    state.zernioPages = Array.isArray(result.pages) ? result.pages : [];
    renderZernioFacebookPages();
    if (statusEl) {
      statusEl.textContent = state.zernioPages.length
        ? `Select 1 of ${state.zernioPages.length} Page${state.zernioPages.length === 1 ? '' : 's'}.`
        : (result.detail || 'No Pages available.');
    }
  } catch (error) {
    state.zernioPages = [];
    renderZernioFacebookPages();
    if (statusEl) statusEl.textContent = error.message || 'Could not load Facebook Pages.';
  }
}

async function selectZernioFacebookPage(pageId) {
  const statusEl = document.querySelector('#zernio-facebook-pages-status');
  const messageEl = document.querySelector('#zernio-facebook-message');
  if (!pageId) return;
  if (statusEl) statusEl.textContent = 'Connecting Page…';
  try {
    await jsonFetch('/api/admin/zernio/facebook/select-page', {
      method: 'POST',
      body: JSON.stringify({ pageId }),
    });
    if (messageEl) messageEl.textContent = 'Facebook Page connected successfully.';
    await loadSocialPanel({ sync: true });
    if (statusEl) statusEl.textContent = '';
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || 'Could not connect that Page.';
  }
}

async function loadZernioFacebookStatus({ sync = false } = {}) {
  if (!hasPermission('site')) return null;
  const statusEl = document.querySelector('#zernio-facebook-status');
  try {
    const path = sync ? '/api/admin/zernio/facebook?sync=1' : '/api/admin/zernio/facebook';
    const status = await jsonFetch(path);
    renderZernioFacebookStatus(status);
    return status;
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || 'Could not check Facebook connection.';
    renderZernioFacebookStatus({ configured: false, connected: false, detail: error.message || 'Could not check Facebook connection.' });
    return null;
  }
}

function formatZernioPostWhen(post) {
  const raw = post?.publishedAt || post?.scheduledFor || post?.createdAt || post?.created_at || '';
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
}

function renderZernioPosts() {
  const list = document.querySelector('#zernio-posts-list');
  if (!list) return;
  const posts = Array.isArray(state.zernioPosts) ? state.zernioPosts : [];
  if (!posts.length) {
    list.innerHTML = '<p class="muted">No posts yet. Connect Facebook and publish your first update.</p>';
    return;
  }
  list.innerHTML = posts.map((post) => {
    const content = String(post?.content || post?.text || '').trim() || '(no text)';
    const status = String(post?.status || (post?.publishedAt ? 'published' : (post?.scheduledFor ? 'scheduled' : 'draft'))).trim();
    const when = formatZernioPostWhen(post);
    return `<article class="admin-list-item zernio-post-row"><div><b>${escapeHtml(status)}</b>${when ? `<small>${escapeHtml(when)} ET</small>` : ''}<p>${escapeHtml(content.slice(0, 280))}${content.length > 280 ? '…' : ''}</p></div></article>`;
  }).join('');
}

async function loadZernioPosts() {
  const statusEl = document.querySelector('#zernio-posts-status');
  if (!hasPermission('site')) return;
  if (!state.zernioFacebook?.configured) {
    state.zernioPosts = [];
    renderZernioPosts();
    if (statusEl) statusEl.textContent = '';
    return;
  }
  if (statusEl) statusEl.textContent = 'Loading posts…';
  try {
    const result = await jsonFetch('/api/admin/zernio/posts');
    state.zernioPosts = Array.isArray(result.posts) ? result.posts : [];
    renderZernioPosts();
    if (statusEl) statusEl.textContent = state.zernioPosts.length ? `${state.zernioPosts.length} recent post${state.zernioPosts.length === 1 ? '' : 's'}.` : '';
  } catch (error) {
    state.zernioPosts = [];
    renderZernioPosts();
    if (statusEl) statusEl.textContent = error.message || 'Could not load posts.';
  }
}

function renderZernioEventQueue() {
  const list = document.querySelector('#zernio-facebook-events-list');
  const summary = document.querySelector('#zernio-facebook-events-summary');
  const publishBtn = document.querySelector('#zernio-facebook-events-publish');
  const queue = state.zernioEventQueue;
  const events = Array.isArray(queue?.pending_events) ? queue.pending_events : [];
  if (summary) {
    if (!state.zernioFacebook?.connected) {
      summary.textContent = 'Connect Facebook to queue and post calendar updates.';
    } else if (!events.length) {
      summary.textContent = queue?.last_published_at
        ? `No new calendar updates waiting. Last posted ${new Date(queue.last_published_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET.`
        : 'No upcoming calendar events are waiting to post.';
    } else {
      summary.textContent = `${events.length} calendar event${events.length === 1 ? '' : 's'} waiting to post to Facebook.`;
    }
  }
  if (list) {
    list.innerHTML = events.length
      ? events.map((event) => {
        const title = plainTextFromHtml(event.title || 'Untitled event') || 'Untitled event';
        const when = Number(event.repeat_enabled)
          ? (event.repeat_summary || 'Repeating event')
          : `${event.date_label || ''} ${event.date_detail || ''} ${event.event_year || ''}`.trim();
        const reason = event.queue_reason === 'updated' ? 'Updated' : (event.queue_reason === 'seed' ? 'Current' : 'New');
        return `<article class="admin-row"><div><b>${escapeHtml(title)}</b><small>${escapeHtml(when)} · ${escapeHtml(reason)}</small></div></article>`;
      }).join('')
      : '<p class="muted">Queue is empty.</p>';
  }
  if (publishBtn) {
    publishBtn.hidden = !state.zernioFacebook?.connected || !events.length;
    publishBtn.disabled = !events.length;
  }
}

async function loadZernioEventQueue() {
  const statusEl = document.querySelector('#zernio-facebook-events-status');
  if (!hasPermission('site') || !state.zernioFacebook?.connected) {
    state.zernioEventQueue = null;
    renderZernioEventQueue();
    return;
  }
  if (statusEl) statusEl.textContent = 'Loading calendar queue…';
  try {
    state.zernioEventQueue = await jsonFetch('/api/admin/zernio/facebook/events');
    renderZernioEventQueue();
    if (statusEl) statusEl.textContent = '';
  } catch (error) {
    state.zernioEventQueue = { pending_events: [], pending_count: 0 };
    renderZernioEventQueue();
    if (statusEl) statusEl.textContent = error.message || 'Could not load calendar queue.';
  }
}

async function loadSocialPanel({ sync = false } = {}) {
  if (!hasPermission('site')) return;
  // Sync from Zernio when opening Social so dashboard-connected Pages appear in CMS.
  await loadZernioFacebookStatus({ sync: sync || !state.zernioFacebook?.connected });
  if (state.zernioFacebook?.needsPageSelection) await loadZernioFacebookPages();
  if (state.zernioFacebook?.connected) await loadZernioEventQueue();
  else {
    state.zernioEventQueue = null;
    renderZernioEventQueue();
  }
  await loadZernioPosts();
}

function applyZernioQueryFeedback() {
  const params = new URLSearchParams(window.location.search);
  const tab = String(params.get('tab') || '').trim();
  if (tab) activateTab(tab);
  const zernio = String(params.get('zernio') || '').trim();
  if (!zernio) return;
  const messageEl = document.querySelector('#zernio-facebook-message');
  if (messageEl) {
    if (zernio === 'facebook_connected') {
      messageEl.textContent = 'Facebook Page connected successfully.';
    } else if (zernio === 'facebook_select') {
      messageEl.textContent = 'Facebook login finished. Choose the Page below to complete the connection.';
    } else if (zernio === 'facebook_pending') {
      messageEl.textContent = params.get('detail') || 'Facebook OAuth finished, but no Page was attached yet. Click Connect Facebook again and select the Page in Meta.';
    } else if (zernio === 'facebook_error') {
      const detail = params.get('detail') || 'Facebook connect failed.';
      messageEl.textContent = detail;
      const statusEl = document.querySelector('#zernio-facebook-status');
      if (statusEl && /no_facebook_pages|did not share any Pages/i.test(detail)) {
        statusEl.textContent = detail;
        statusEl.classList.remove('ok');
      }
    }
  }
  if (zernio === 'facebook_connected' || zernio === 'facebook_pending' || zernio === 'facebook_select') {
    loadSocialPanel({ sync: true }).catch(() => {});
  }
  params.delete('zernio');
  params.delete('detail');
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || ''}`;
  window.history.replaceState({}, '', next);
}

async function loadSite() {
  if (!hasPermission('site')) return;
  state.site = await jsonFetch('/api/site');
  fillForm(document.querySelector('#site-form'), state.site);
  await loadUtilityLinksEditor();
  await loadSocialLinksEditor();
  await loadZernioFacebookStatus();
}

async function loadPages() {
  if (!state.pages.some(canEditPage) && !hasPermission('users')) return;
  state.pages = await jsonFetch('/api/admin/pages');
  renderPageShortcuts();
  renderMobileAdminMenu();
  // Keep the full page catalog for User Management checkboxes; /api/admin/pages may be filtered.
  renderPagePermissionBoxes();
}

function renderDashboard() {
  const dashboard = document.querySelector('#dashboard-cards');
  if (!dashboard) return;
  const displayName = state.me.user.display_name || state.me.user.username;
  const welcome = document.querySelector('#dashboard-welcome');
  if (welcome) welcome.textContent = `Welcome back, ${displayName}`;

  const cards = [
    ['Staff Email', 'Send rich-text emails with attachments to CMS users.', 'mail', 'Administration', 'tab'],
    canManageMinutes() && ['Meeting Minutes', 'Add and review booster meeting minutes by date.', 'minutes', 'Boosters', 'tab'],
    canViewMinutes() && !canManageMinutes() && ['Meeting Minutes', 'Open and print booster meeting minutes by date.', 'minutes', 'Boosters', 'tab'],
    canEditSponsors() && ['Manage sponsors', 'Add, edit, reorder, or remove sponsor businesses and logos.', 'sponsors', 'Community', 'tab'],
    state.pages.some((page) => page.slug === 'sponsors' && canEditPage(page)) && ['Sponsors page', 'Edit the public Sponsors page header, intro, and callout copy.', 'sponsors', 'Community', 'page'],
    state.pages.some((page) => page.slug === 'become-a-sponsor' && canEditPage(page)) && ['Become a Sponsor', 'Edit package cards and the inquiry form on the Become a Sponsor page.', 'become-a-sponsor', 'Community', 'page'],
    canEditStaff() && ['Directors & Staff', 'Add staff photos, names, roles, and short descriptions.', 'staff', 'People', 'tab'],
    canEditPage('ensembles') && ['Ensemble Body', 'Edit ensemble cards and body copy in a floating editor.', 'ensembles', 'Program', 'tab'],
    canEditBoosterMembers() && ['Booster Members', 'Add booster officer photos, names, roles, and short descriptions.', 'booster-members', 'Families', 'tab'],
    canEditContact() && ['Contact Form', 'Edit topics and the email each contact topic delivers to.', 'contact', 'Connect', 'tab'],
    hasPermission('users') && ['User Management', 'Create editor accounts and assign page-level permissions.', 'users', 'Administration', 'tab'],
    hasPermission('site') && ['Social / Facebook', 'Connect the band Facebook Page and publish or schedule posts.', 'social', 'Publish', 'tab'],
    canCreateEvents() && ['Calendar Events', 'Add events you own, or manage all events if granted elevated access.', 'events', 'Program', 'tab'],
  ].filter(Boolean);

  const passwordForm = dashboard.querySelector('#password-form');
  passwordForm?.remove();
  dashboard.innerHTML = cards.length
    ? cards.map(([title, text, target, kicker, kind]) => {
      const attr = kind === 'page' ? `data-dash-page="${escapeAttr(target)}"` : `data-dash-target="${escapeAttr(target)}"`;
      return `<button class="dash-card" type="button" ${attr}><span>${escapeHtml(kicker)}</span><b>${escapeHtml(title)}</b><small>${escapeHtml(text)}</small></button>`;
    }).join('')
    : '<p class="draft dashboard-empty">No dashboard tools are available for your account. Use Manage in the left navigation when permissions are assigned.</p>';
  if (passwordForm) dashboard.appendChild(passwordForm);
  dashboard.querySelectorAll('[data-dash-target]').forEach(button => button.addEventListener('click', () => {
    activateTab(button.dataset.dashTarget);
  }));
  dashboard.querySelectorAll('[data-dash-page]').forEach(button => button.addEventListener('click', () => {
    editPage(button.dataset.dashPage);
  }));
}

function editPage(slug, { skipGuard = false } = {}) {
  return (async () => {
    const form = document.querySelector('#page-form');
    const currentSlug = String(form?.elements?.original_slug?.value || '').trim();
    const alreadyEditing = Boolean(form && !form.hidden && currentSlug);
    if (!skipGuard && alreadyEditing) {
      if (currentSlug === slug) {
        await activateTab('pages');
        activatePageShortcut(slug);
        return;
      }
      if (!(await confirmLeavePageEditor())) return;
    }
    await ensureFullPagesLoaded();
    const page = state.pages.find(item => item.slug === slug);
    if (!page) return;
    const isHomePage = Boolean(page.is_home) || page.slug === 'home';
    state.homeBodyHtml = isHomePage ? String(page.body_html || '') : '';
    fillForm(form, { ...page, ...structuredPageFields(page), original_slug: page.slug });
    document.querySelector('[data-page-editor-title]').textContent = `Edit ${page.title}`;
    form.querySelector('[data-calendar-hint]').hidden = page.slug !== 'calendar';
    const sponsorsHint = form.querySelector('[data-sponsors-hint]');
    if (sponsorsHint) sponsorsHint.hidden = page.slug !== 'sponsors';
    const becomeSponsorHint = form.querySelector('[data-become-sponsor-hint]');
    if (becomeSponsorHint) becomeSponsorHint.hidden = page.slug !== 'become-a-sponsor';
    const contactHint = form.querySelector('[data-contact-hint]');
    if (contactHint) contactHint.hidden = page.slug !== 'contact';
    const ensemblesHint = form.querySelector('[data-ensembles-hint]');
    if (ensemblesHint) ensemblesHint.hidden = page.slug !== 'ensembles';
    form.querySelector('[data-home-hint]').hidden = !isHomePage;
    form.elements.active.checked = Boolean(page.active);
    syncPageSettingsAccess();
    if (form.elements.layout) {
      const fields = structuredPageFields(page);
      form.elements.layout.value = isHomePage ? 'home' : (fields.layout || form.elements.layout.value || 'standard');
      form.elements.layout.closest('label')?.classList.toggle('is-home-locked', isHomePage);
      form.elements.layout.disabled = isHomePage;
    }
    showPageEditorChrome(true);
    syncPreviewFromForm();
    await activateTab('pages');
    activatePageShortcut(slug);
    capturePageBaseline();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  })().catch(error => {
    console.error(error);
    showPageEditorChrome(true);
    document.querySelector('#page-status').textContent = `Could not open ${pageLabel(slug)}: ${error.message}`;
  });
}

function renderPagePermissionBoxes() {
  const box = document.querySelector('#page-permission-boxes');
  if (!box) return;
  const pages = (state.pageCatalog?.length ? state.pageCatalog : state.pages) || [];
  box.innerHTML = pages.map(page => `<label class="checkline"><input type="checkbox" name="permissions" value="page:${escapeHtml(page.slug)}"> ${escapeHtml(page.title)}</label>`).join('');
}

async function loadSponsorAdSettings() {
  if (!canEditSponsors()) return;
  const form = document.querySelector('#sponsor-ad-settings-form');
  if (!form) return;
  try {
    const settings = await jsonFetch('/api/admin/sponsors/settings');
    const input = formControl(form, 'sponsor_ad_seconds');
    if (input) input.value = String(settings.sponsor_ad_seconds ?? 6);
  } catch (error) {
    const status = document.querySelector('#sponsor-ad-settings-status');
    if (status) status.textContent = `Could not load ad timing: ${error.message}`;
  }
}

async function loadSponsors() {
  if (!canEditSponsors()) return;
  state.sponsors = await jsonFetch('/api/admin/sponsors');
  renderSponsors();
  await loadSponsorAdSettings();
}

async function loadStaff() {
  if (!canEditStaff()) return;
  state.staff = await jsonFetch('/api/admin/staff');
  renderStaff();
}

async function loadBoosterMembers() {
  if (!canEditBoosterMembers()) return;
  state.boosterMembers = await jsonFetch('/api/admin/booster-members');
  renderBoosterMembers();
}

function staffPreviewCard(member) {
  const photo = member.photo_url
    ? `<div class="avatar"><img src="${escapeHtml(member.photo_url)}" alt="${escapeHtml(member.name)}"></div>`
    : '<div class="avatar" aria-hidden="true"></div>';
  const role = member.role ? `<p class="person-role">${formatInlineRichText(member.role)}</p>` : '';
  const bio = member.bio ? `<div class="person-bio">${formatRichText(member.bio)}</div>` : '';
  return `<article class="person">${photo}<div class="person-copy"><h3>${escapeHtml(member.name)}</h3>${role}${bio}</div></article>`;
}

function orderedStaff() {
  return [...state.staff].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

function renderStaff() {
  const list = document.querySelector('#staff-list');
  const preview = document.querySelector('#staff-preview');
  if (!list || !preview) return;
  const ordered = orderedStaff();
  list.innerHTML = ordered.map((member) => `
    <article class="admin-row staff-admin-row" data-staff-id="${member.id}" draggable="true">
      <button type="button" class="drag-handle" aria-label="Drag to reorder ${escapeHtml(member.name || 'staff member')}" title="Drag to reorder">⋮⋮</button>
      <div class="mini-logo staff-mini-photo">${member.photo_url ? `<img src="${escapeHtml(member.photo_url)}" alt="">` : escapeHtml((member.name || 'S').trim().charAt(0).toUpperCase())}</div>
      <div><b>${escapeHtml(member.name)}</b><span>${escapeHtml(plainTextFromHtml(member.role) || 'Staff')}</span><small>${escapeHtml(plainTextFromHtml(member.bio) || 'No description')} · ${member.active ? 'Active' : 'Hidden'}</small></div>
      <div class="row-actions"><button type="button" data-edit-staff="${member.id}">Edit</button><button type="button" data-delete-staff="${member.id}">Delete</button></div>
    </article>
  `).join('') || '<p class="draft">No staff members yet.</p>';
  preview.innerHTML = ordered.filter(member => member.active).map(staffPreviewCard).join('') || '<p class="draft">No active staff yet.</p>';
  list.querySelectorAll('[data-edit-staff]').forEach(button => button.addEventListener('click', () => {
    const member = state.staff.find(item => item.id === Number(button.dataset.editStaff));
    if (!member) return;
    const form = document.querySelector('#staff-form');
    const status = document.querySelector('#staff-status');
    form.reset();
    fillForm(form, {
      staff_id: member.id,
      name: member.name,
      role: member.role,
      bio: member.bio,
      photo_url: member.photo_url,
      active: member.active,
    });
    formControl(form, 'staff_id').value = String(member.id);
    formControl(form, 'active').checked = Boolean(Number(member.active));
    const photoFile = formControl(form, 'photo_file');
    if (photoFile) photoFile.value = '';
    if (status) status.textContent = `Editing ${member.name || 'staff member'}. Save to update.`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formControl(form, 'name')?.focus();
  }));
  list.querySelectorAll('[data-delete-staff]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this staff member?')) return;
    await jsonFetch(`/api/admin/staff/${button.dataset.deleteStaff}`, { method: 'DELETE' });
    await loadStaff();
  }));
  bindStaffDragAndDrop(list);
}

async function saveStaffOrder(ids) {
  state.staff = await jsonFetch('/api/admin/staff/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  renderStaff();
}

function bindStaffDragAndDrop(list) {
  if (!list) return;
  let dragId = null;
  let allowRowDrag = false;

  list.querySelectorAll('[data-staff-id]').forEach((row) => {
    const handle = row.querySelector('.drag-handle');
    handle?.addEventListener('mousedown', () => { allowRowDrag = true; });
    handle?.addEventListener('touchstart', () => { allowRowDrag = true; }, { passive: true });
    handle?.addEventListener('click', (event) => event.preventDefault());

    row.addEventListener('dragstart', (event) => {
      if (!allowRowDrag && !event.target.closest?.('.drag-handle')) {
        event.preventDefault();
        return;
      }
      dragId = Number(row.dataset.staffId);
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(dragId));
      try { event.dataTransfer.setDragImage(row, 24, 24); } catch { /* older browsers */ }
    });
    row.addEventListener('dragend', () => {
      allowRowDrag = false;
      row.classList.remove('is-dragging');
      list.querySelectorAll('.is-drop-target').forEach((item) => item.classList.remove('is-drop-target'));
      dragId = null;
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (Number(row.dataset.staffId) !== dragId) row.classList.add('is-drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', async (event) => {
      event.preventDefault();
      allowRowDrag = false;
      row.classList.remove('is-drop-target');
      const fromId = Number(event.dataTransfer.getData('text/plain') || dragId);
      const toId = Number(row.dataset.staffId);
      if (!fromId || !toId || fromId === toId) return;
      const ordered = orderedStaff();
      const fromIndex = ordered.findIndex((member) => member.id === fromId);
      const toIndex = ordered.findIndex((member) => member.id === toId);
      if (fromIndex < 0 || toIndex < 0) return;
      const next = [...ordered];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const ids = next.map((member) => member.id);
      state.staff = next.map((member, index) => ({ ...member, sort_order: index + 1 }));
      renderStaff();
      try {
        await saveStaffOrder(ids);
      } catch (error) {
        console.error(error);
        await loadStaff();
        const status = document.querySelector('#staff-status');
        if (status) status.textContent = 'Could not save the new staff order.';
      }
    });
  });
}

function orderedBoosterMembers() {
  return [...state.boosterMembers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

function renderBoosterMembers() {
  const list = document.querySelector('#booster-members-list');
  const preview = document.querySelector('#booster-members-preview');
  if (!list || !preview) return;
  const ordered = orderedBoosterMembers();
  list.innerHTML = ordered.map((member) => `
    <article class="admin-row staff-admin-row" data-booster-member-id="${member.id}" draggable="true">
      <button type="button" class="drag-handle" aria-label="Drag to reorder ${escapeHtml(member.name || 'booster member')}" title="Drag to reorder">⋮⋮</button>
      <div class="mini-logo staff-mini-photo">${member.photo_url ? `<img src="${escapeHtml(member.photo_url)}" alt="">` : escapeHtml((member.name || 'B').trim().charAt(0).toUpperCase())}</div>
      <div><b>${escapeHtml(member.name)}</b><span>${escapeHtml(plainTextFromHtml(member.role) || 'Booster member')}</span><small>${escapeHtml(plainTextFromHtml(member.bio) || 'No description')} · ${member.active ? 'Active' : 'Hidden'}</small></div>
      <div class="row-actions"><button type="button" data-edit-booster-member="${member.id}">Edit</button><button type="button" data-delete-booster-member="${member.id}">Delete</button></div>
    </article>
  `).join('') || '<p class="draft">No booster members yet.</p>';
  preview.innerHTML = ordered.filter((member) => member.active).map(staffPreviewCard).join('') || '<p class="draft">No active booster members yet.</p>';
  list.querySelectorAll('[data-edit-booster-member]').forEach((button) => button.addEventListener('click', () => {
    const member = state.boosterMembers.find((item) => item.id === Number(button.dataset.editBoosterMember));
    if (!member) return;
    const form = document.querySelector('#booster-member-form');
    const status = document.querySelector('#booster-member-status');
    form.reset();
    fillForm(form, {
      booster_member_id: member.id,
      name: member.name,
      role: member.role,
      bio: member.bio,
      photo_url: member.photo_url,
      active: member.active,
    });
    formControl(form, 'booster_member_id').value = String(member.id);
    formControl(form, 'active').checked = Boolean(Number(member.active));
    const photoFile = formControl(form, 'photo_file');
    if (photoFile) photoFile.value = '';
    if (status) status.textContent = `Editing ${member.name || 'booster member'}. Save to update.`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formControl(form, 'name')?.focus();
  }));
  list.querySelectorAll('[data-delete-booster-member]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Delete this booster member?')) return;
    await jsonFetch(`/api/admin/booster-members/${button.dataset.deleteBoosterMember}`, { method: 'DELETE' });
    await loadBoosterMembers();
  }));
  bindBoosterMemberDragAndDrop(list);
}

async function saveBoosterMemberOrder(ids) {
  state.boosterMembers = await jsonFetch('/api/admin/booster-members/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  renderBoosterMembers();
}

function bindBoosterMemberDragAndDrop(list) {
  if (!list) return;
  let dragId = null;
  let allowRowDrag = false;

  list.querySelectorAll('[data-booster-member-id]').forEach((row) => {
    const handle = row.querySelector('.drag-handle');
    handle?.addEventListener('mousedown', () => { allowRowDrag = true; });
    handle?.addEventListener('touchstart', () => { allowRowDrag = true; }, { passive: true });
    handle?.addEventListener('click', (event) => event.preventDefault());

    row.addEventListener('dragstart', (event) => {
      if (!allowRowDrag && !event.target.closest?.('.drag-handle')) {
        event.preventDefault();
        return;
      }
      dragId = Number(row.dataset.boosterMemberId);
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(dragId));
      try { event.dataTransfer.setDragImage(row, 24, 24); } catch { /* older browsers */ }
    });
    row.addEventListener('dragend', () => {
      allowRowDrag = false;
      row.classList.remove('is-dragging');
      list.querySelectorAll('.is-drop-target').forEach((item) => item.classList.remove('is-drop-target'));
      dragId = null;
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (Number(row.dataset.boosterMemberId) !== dragId) row.classList.add('is-drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', async (event) => {
      event.preventDefault();
      allowRowDrag = false;
      row.classList.remove('is-drop-target');
      const fromId = Number(event.dataTransfer.getData('text/plain') || dragId);
      const toId = Number(row.dataset.boosterMemberId);
      if (!fromId || !toId || fromId === toId) return;
      const ordered = orderedBoosterMembers();
      const fromIndex = ordered.findIndex((member) => member.id === fromId);
      const toIndex = ordered.findIndex((member) => member.id === toId);
      if (fromIndex < 0 || toIndex < 0) return;
      const next = [...ordered];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const ids = next.map((member) => member.id);
      state.boosterMembers = next.map((member, index) => ({ ...member, sort_order: index + 1 }));
      renderBoosterMembers();
      try {
        await saveBoosterMemberOrder(ids);
      } catch (error) {
        console.error(error);
        await loadBoosterMembers();
        const status = document.querySelector('#booster-member-status');
        if (status) status.textContent = 'Could not save the new booster member order.';
      }
    });
  });
}

function formatAdminSponsorAddress(sponsor = {}) {
  if (sponsor.formatted_address) return sponsor.formatted_address;
  const street = String(sponsor.address || '').trim();
  const city = String(sponsor.city || '').trim();
  const state = String(sponsor.state || '').trim().toUpperCase();
  return [street, city, state].filter(Boolean).join(', ');
}

function sponsorPreviewCard(sponsor, index = 0) {
  const featured = index === 0 ? ' sponsor-featured' : '';
  const mark = sponsor.logo_url ? `<span class="sponsor-logo"><img src="${escapeHtml(sponsor.logo_url)}" alt="${escapeHtml(sponsor.name)} logo"></span>` : `<span class="sponsor-mark">${escapeHtml(sponsor.mark_text || '★')}</span>`;
  const formatted = formatAdminSponsorAddress(sponsor);
  const tier = sponsor.tier || sponsorTierFromLevel(sponsor.level);
  const tierLabel = sponsor.tier_label || (tier === 'gold' ? 'Gold' : tier === 'silver' ? 'Silver' : 'Bronze');
  return `<article class="sponsor-card${featured}">${mark}<div><span class="sponsor-level sponsor-tier-badge tier-${escapeHtml(tier)}">${escapeHtml(tierLabel)} Sponsor</span><h3>${escapeHtml(sponsor.name)}</h3>${formatted ? `<p class="sponsor-address">${escapeHtml(formatted)}</p>` : ''}</div></article>`;
}

function syncSponsorLogoPreview(form, url = '') {
  const preview = form?.querySelector?.('[data-sponsor-logo-preview]') || document.querySelector('[data-sponsor-logo-preview]');
  const img = preview?.querySelector('img');
  if (!preview || !img) return;
  const src = String(url || formControl(form, 'logo_url')?.value || '').trim();
  if (!src) {
    preview.hidden = true;
    img.removeAttribute('src');
    return;
  }
  img.src = src;
  preview.hidden = false;
}

function orderedSponsors() {
  return [...state.sponsors].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

function resetSponsorForm(form) {
  if (!form) return;
  form.reset();
  formControl(form, 'id').value = '';
  formControl(form, 'city').value = 'Kernersville';
  setSelectValue(formControl(form, 'state'), 'NC');
  form.elements.active.checked = true;
  form.elements.level.value = 'Bronze Sponsor';
  const file = formControl(form, 'logo_file');
  if (file) file.value = '';
  syncSponsorLogoPreview(form, '');
  syncSponsorTierBenefits(form);
}

function goldPrintSponsors() {
  return orderedSponsors().filter((sponsor) => (
    Number(sponsor.active) !== 0
    && (sponsor.show_game_announcement || sponsorTierFromLevel(sponsor.level) === 'gold')
  ));
}

function renderGoldSponsorsPrintPreview() {
  const preview = document.querySelector('#gold-sponsors-print-preview');
  if (!preview) return;
  const gold = goldPrintSponsors();
  if (!gold.length) {
    preview.innerHTML = '<p class="draft">No active Gold sponsors yet. Assign the Gold tier to include a business on advertising materials.</p>';
    return;
  }
  preview.innerHTML = gold.map((sponsor) => {
    const mark = escapeHtml(sponsor.mark_text || (sponsor.name || '?').slice(0, 3).toUpperCase());
    const logo = sponsor.logo_url
      ? `<img src="${escapeHtml(sponsor.logo_url)}" alt="">`
      : `<span class="gold-sponsor-print-mark">${mark}</span>`;
    return `
      <article class="gold-sponsor-print-row">
        <div class="gold-sponsor-print-logo">${logo}</div>
        <b>${escapeHtml(sponsor.name)}</b>
      </article>
    `;
  }).join('');
}

function adminAssetVersion() {
  const src = document.querySelector('script[src*="/admin.js"]')?.getAttribute('src') || '';
  const match = src.match(/[?&]v=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : String(Date.now());
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.dynamicSrc = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = '1';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureJsPdf() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await loadScriptOnce(`/vendor/jspdf.umd.min.js?v=${encodeURIComponent(adminAssetVersion())}`);
  if (!window.jspdf?.jsPDF) throw new Error('PDF library failed to initialize.');
  return window.jspdf.jsPDF;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

async function logoDataUrlForPdf(url) {
  if (!url) return null;
  let objectUrl = null;
  try {
    const absolute = new URL(url, window.location.origin).href;
    try {
      const response = await fetch(absolute, { credentials: 'same-origin' });
      if (response.ok) {
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
      }
    } catch {
      // Fall back to direct image load.
    }
    const img = await loadImageElement(objectUrl || absolute);
    const maxW = 320;
    const maxH = 160;
    let width = img.naturalWidth || img.width || maxW;
    let height = img.naturalHeight || img.height || maxH;
    const scale = Math.min(maxW / width, maxH / height, 1);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/png'), width, height };
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function buildGoldSponsorsPdfBlob(sponsors) {
  const jsPDF = await ensureJsPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(16, 35, 60);
  doc.text('East Forsyth Band — Gold Sponsors', margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(91, 111, 136);
  doc.text(`For programs, flyers, and promotional materials · ${new Date().toLocaleDateString()}`, margin, y);
  y += 28;

  if (!sponsors.length) {
    doc.setTextColor(51, 65, 85);
    doc.text('No active Gold sponsors yet.', margin, y);
  }

  for (const sponsor of sponsors) {
    const logo = await logoDataUrlForPdf(sponsor.logo_url || '');
    const nameX = margin + 12 + 96 + 16;
    const textWidth = contentWidth - 96 - 40;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const nameLines = doc.splitTextToSize(String(sponsor.name || 'Sponsor'), textWidth);
    const address = formatAdminSponsorAddress(sponsor) || 'No address on file';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const addressLines = doc.splitTextToSize(address, textWidth);
    const textBlockHeight = nameLines.length * 18 + 4 + addressLines.length * 14;
    const logoBasedHeight = logo ? Math.max(56, Math.round((logo.height / logo.width) * 96) + 16) : 56;
    const rowHeight = Math.max(64, logoBasedHeight, textBlockHeight + 24);
    ensureSpace(rowHeight + 12);

    doc.setDrawColor(216, 226, 239);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, rowHeight, 6, 6, 'FD');

    const logoBoxX = margin + 12;
    const logoBoxY = y + 8;
    const logoBoxW = 96;
    const logoBoxH = rowHeight - 16;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 4, 4, 'FD');

    if (logo) {
      const fit = Math.min(logoBoxW - 12, logoBoxH - 12) / Math.max(logo.width, logo.height);
      const drawW = Math.max(1, logo.width * fit);
      const drawH = Math.max(1, logo.height * fit);
      const drawX = logoBoxX + (logoBoxW - drawW) / 2;
      const drawY = logoBoxY + (logoBoxH - drawH) / 2;
      doc.addImage(logo.dataUrl, 'PNG', drawX, drawY, drawW, drawH);
    } else {
      const mark = String(sponsor.mark_text || (sponsor.name || '?').slice(0, 3)).toUpperCase();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(1, 73, 144);
      doc.text(mark, logoBoxX + logoBoxW / 2, logoBoxY + logoBoxH / 2 + 4, { align: 'center' });
    }

    const textTop = y + (rowHeight - textBlockHeight) / 2 + 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(16, 35, 60);
    doc.text(nameLines, nameX, textTop);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(91, 111, 136);
    doc.text(addressLines, nameX, textTop + nameLines.length * 18 + 2);

    y += rowHeight + 10;
  }

  return doc.output('blob');
}

function createGoldSponsorsPrintFrame(title = 'Gold sponsors print') {
  const previous = document.getElementById('gold-sponsors-print-frame');
  if (previous) {
    try { previous.src = 'about:blank'; } catch { /* ignore */ }
    previous.remove();
  }
  const frame = document.createElement('iframe');
  frame.id = 'gold-sponsors-print-frame';
  frame.setAttribute('title', title);
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);
  return frame;
}

function printPdfBlobInPage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const frame = createGoldSponsorsPrintFrame('Gold sponsors PDF print');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (error) reject(error);
      else resolve();
    };
    const timeoutId = window.setTimeout(() => {
      finish(new Error('Timed out waiting for the print dialog.'));
    }, 12000);

    const triggerPrint = () => {
      window.setTimeout(() => {
        try {
          const win = frame.contentWindow;
          if (!win) throw new Error('Print frame unavailable');
          win.focus();
          win.print();
          finish();
        } catch (error) {
          finish(error);
        }
      }, 250);
    };

    frame.addEventListener('load', triggerPrint, { once: true });
    frame.addEventListener('error', () => finish(new Error('Could not load the PDF for printing.')), { once: true });
    // Assign after listeners so the first load is never missed.
    frame.src = url;
  });
}

function printGoldSponsorsHtmlFallback(sponsors) {
  const rows = sponsors.length
    ? sponsors.map((sponsor) => {
      const mark = escapeHtml(sponsor.mark_text || (sponsor.name || '?').slice(0, 3).toUpperCase());
      const logo = sponsor.logo_url
        ? `<img src="${escapeHtml(sponsor.logo_url)}" alt="">`
        : `<span class="mark">${mark}</span>`;
      return `<li><div class="logo">${logo}</div><strong>${escapeHtml(sponsor.name)}</strong></li>`;
    }).join('')
    : '<li><strong>No active Gold sponsors yet.</strong></li>';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Gold Sponsors | East Forsyth Band</title>
  <style>
    body{font-family:Georgia,"Times New Roman",serif;color:#111;margin:32px;line-height:1.35}
    h1{font-size:1.7rem;margin:0 0 .25rem}
    .meta{color:#444;margin:0 0 1.25rem}
    ul{list-style:none;margin:0;padding:0;display:grid;gap:14px}
    li{display:grid;grid-template-columns:110px 1fr;gap:16px;align-items:center;border:1px solid #ccc;padding:12px;border-radius:8px}
    .logo{width:110px;height:64px;display:grid;place-items:center;background:#fff;border:1px solid #ddd;border-radius:6px;overflow:hidden}
    .logo img{max-width:100%;max-height:100%;object-fit:contain}
    .mark{font:700 .85rem/1.2 Helvetica,Arial,sans-serif;color:#014990;text-align:center}
    strong{font-size:1.15rem}
    @media print{body{margin:.55in} li{break-inside:avoid}}
  </style>
</head>
<body>
  <h1>East Forsyth Band — Gold Sponsors</h1>
  <p class="meta">For programs, flyers, and promotional materials · ${escapeHtml(new Date().toLocaleDateString())}</p>
  <ul>${rows}</ul>
</body>
</html>`;

  return new Promise((resolve, reject) => {
    const frame = createGoldSponsorsPrintFrame('Gold sponsors print');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };
    const timeoutId = window.setTimeout(() => {
      finish(new Error('Timed out waiting for the print dialog.'));
    }, 12000);

    frame.addEventListener('load', () => {
      try {
        const win = frame.contentWindow;
        if (!win) throw new Error('Print frame unavailable');
        win.focus();
        win.print();
        finish();
      } catch (error) {
        finish(error);
      }
    }, { once: true });
    frame.srcdoc = html;
  });
}

let goldSponsorsPrintBusy = false;

async function printGoldSponsorsPdf() {
  if (goldSponsorsPrintBusy) return;
  goldSponsorsPrintBusy = true;
  const button = document.querySelector('#print-gold-sponsors');
  const status = document.querySelector('#gold-sponsors-print-status');
  const sponsors = goldPrintSponsors();
  const originalLabel = 'Print Gold sponsors PDF';
  if (button) {
    button.disabled = true;
    button.textContent = 'Preparing PDF…';
  }
  if (status) status.textContent = 'Building PDF with logos…';
  try {
    const blob = await buildGoldSponsorsPdfBlob(sponsors);
    if (status) status.textContent = 'Opening print dialog…';
    await printPdfBlobInPage(blob);
    if (status) status.textContent = 'Print dialog opened. Choose your printer or Save as PDF.';
  } catch (error) {
    console.error(error);
    try {
      if (status) status.textContent = 'PDF unavailable; printing on-page list instead…';
      await printGoldSponsorsHtmlFallback(sponsors);
      if (status) status.textContent = 'Print dialog opened from on-page list.';
    } catch (fallbackError) {
      console.error(fallbackError);
      if (status) status.textContent = `Could not print Gold sponsors: ${error.message || 'Unknown error'}`;
    }
  } finally {
    goldSponsorsPrintBusy = false;
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

function renderSponsors() {
  const list = document.querySelector('#sponsors-list');
  if (!list) return;
  const ordered = orderedSponsors();
  list.innerHTML = ordered.map((sponsor) => {
    const tier = sponsor.tier || sponsorTierFromLevel(sponsor.level);
    const tierLabel = sponsor.tier_label || (tier === 'gold' ? 'Gold' : tier === 'silver' ? 'Silver' : 'Bronze');
    const benefits = [];
    if (sponsor.show_marquee !== false) benefits.push('Marquee');
    if (sponsor.show_flyin || tier === 'silver' || tier === 'gold') benefits.push('Fly-in');
    if (sponsor.show_game_announcement || tier === 'gold') benefits.push('Public advert');
    return `
    <article class="admin-row sponsor-admin-row" data-sponsor-id="${sponsor.id}" draggable="true">
      <button type="button" class="drag-handle" aria-label="Drag to reorder ${escapeHtml(sponsor.name || 'sponsor')}" title="Drag to reorder">⋮⋮</button>
      <div class="mini-logo">${sponsor.logo_url ? `<img src="${escapeHtml(sponsor.logo_url)}" alt="">` : escapeHtml(sponsor.mark_text || '★')}</div>
      <div>
        <b>${escapeHtml(sponsor.name)}</b>
        <span>${escapeHtml(formatAdminSponsorAddress(sponsor) || 'No address')}</span>
        <small><span class="sponsor-tier-badge tier-${escapeHtml(tier)}">${escapeHtml(tierLabel)}</span> · ${sponsor.active ? 'Active' : 'Hidden'} · ${escapeHtml(benefits.join(' · '))}</small>
      </div>
      <div class="row-actions"><button type="button" data-edit-sponsor="${sponsor.id}">Edit</button><button type="button" data-delete-sponsor="${sponsor.id}">Delete</button></div>
    </article>
  `;
  }).join('') || '<p class="draft">No sponsors yet. Drag handles appear after you add one.</p>';
  const preview = document.querySelector('#sponsor-preview');
  if (preview) preview.innerHTML = ordered.filter(s => s.active).map(sponsorPreviewCard).join('') || '<p class="draft">No active sponsors yet.</p>';
  renderGoldSponsorsPrintPreview();
  list.querySelectorAll('[data-edit-sponsor]').forEach(button => button.addEventListener('click', () => {
    const sponsor = state.sponsors.find(item => item.id === Number(button.dataset.editSponsor));
    const form = document.querySelector('#sponsor-form');
    fillForm(form, {
      ...sponsor,
      city: sponsor.city || 'Kernersville',
      state: sponsor.state || 'NC',
    });
    setSelectValue(formControl(form, 'state'), sponsor.state || 'NC');
    const levelSelect = formControl(form, 'level');
    if (levelSelect) {
      const level = String(sponsor.level || 'Bronze Sponsor').trim() || 'Bronze Sponsor';
      if (![...levelSelect.options].some((option) => option.value === level)) {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = level;
        levelSelect.appendChild(option);
      }
      setSelectValue(levelSelect, level);
    }
    form.elements.active.checked = Boolean(Number(sponsor.active));
    const file = formControl(form, 'logo_file');
    if (file) file.value = '';
    syncSponsorLogoPreview(form, sponsor.logo_url || '');
    syncSponsorTierBenefits(form);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  list.querySelectorAll('[data-delete-sponsor]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this sponsor?')) return;
    await jsonFetch(`/api/admin/sponsors/${button.dataset.deleteSponsor}`, { method: 'DELETE' });
    await loadSponsors();
  }));
  bindSponsorDragAndDrop(list);
}

async function saveSponsorOrder(ids) {
  state.sponsors = await jsonFetch('/api/admin/sponsors/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  renderSponsors();
}

function bindSponsorDragAndDrop(list) {
  if (!list) return;
  let dragId = null;
  let allowRowDrag = false;

  list.querySelectorAll('[data-sponsor-id]').forEach((row) => {
    const handle = row.querySelector('.drag-handle');
    handle?.addEventListener('mousedown', () => { allowRowDrag = true; });
    handle?.addEventListener('touchstart', () => { allowRowDrag = true; }, { passive: true });
    handle?.addEventListener('click', (event) => event.preventDefault());

    row.addEventListener('dragstart', (event) => {
      if (!allowRowDrag && !event.target.closest?.('.drag-handle')) {
        event.preventDefault();
        return;
      }
      dragId = Number(row.dataset.sponsorId);
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(dragId));
      try { event.dataTransfer.setDragImage(row, 24, 24); } catch { /* older browsers */ }
    });
    row.addEventListener('dragend', () => {
      allowRowDrag = false;
      row.classList.remove('is-dragging');
      list.querySelectorAll('.is-drop-target').forEach((item) => item.classList.remove('is-drop-target'));
      dragId = null;
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (Number(row.dataset.sponsorId) !== dragId) row.classList.add('is-drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', async (event) => {
      event.preventDefault();
      allowRowDrag = false;
      row.classList.remove('is-drop-target');
      const fromId = Number(event.dataTransfer.getData('text/plain') || dragId);
      const toId = Number(row.dataset.sponsorId);
      if (!fromId || !toId || fromId === toId) return;
      const ordered = orderedSponsors();
      const fromIndex = ordered.findIndex((sponsor) => sponsor.id === fromId);
      const toIndex = ordered.findIndex((sponsor) => sponsor.id === toId);
      if (fromIndex < 0 || toIndex < 0) return;
      const next = [...ordered];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const ids = next.map((sponsor) => sponsor.id);
      state.sponsors = next.map((sponsor, index) => ({ ...sponsor, sort_order: index + 1 }));
      renderSponsors();
      try {
        await saveSponsorOrder(ids);
      } catch (error) {
        console.error(error);
        await loadSponsors();
        const status = document.querySelector('#sponsor-status');
        if (status) status.textContent = 'Could not save the new sponsor order.';
      }
    });
  });
}

async function loadMailDeliveryStatus() {
  const status = document.querySelector('#mail-status');
  if (!status || !canSendMail()) return;
  try {
    const delivery = await jsonFetch('/api/admin/mail/delivery');
    if (!delivery.configured) {
      status.textContent = delivery.detail || 'Mail delivery is not configured.';
      return;
    }
    const replyTo = String(delivery.reply_to || state.me?.user?.username || '').trim();
    status.textContent = replyTo
      ? `Ready to send. Replies will go to ${replyTo}.`
      : (delivery.detail || 'Ready to send.');
  } catch (error) {
    status.textContent = `Could not check mail delivery: ${error.message}`;
  }
}

function renderMailRecipients() {
  const list = document.querySelector('#mail-recipients-list');
  if (!list) return;
  if (!state.mailRecipients.length) {
    list.innerHTML = '<p class="draft">No active users with email-style usernames are available.</p>';
    return;
  }
  list.innerHTML = state.mailRecipients.map((user) => `
    <label class="mail-recipient checkline">
      <input type="checkbox" name="user_ids" value="${user.id}">
      <span><b>${escapeHtml(user.display_name || user.email)}</b><small>${escapeHtml(user.email)} · ${isSuperAdmin(user) ? 'Super Admin' : 'Editor'}</small></span>
    </label>
  `).join('');
}

async function loadMailRecipients() {
  if (!canSendMail()) return;
  state.mailRecipients = await jsonFetch('/api/admin/mail/recipients');
  renderMailRecipients();
  await loadMailDeliveryStatus();
}

function selectedMailUserIds(form) {
  return [...(form?.querySelectorAll('input[name="user_ids"]:checked') || [])].map((input) => Number(input.value)).filter(Boolean);
}

function bindMailComposer() {
  const form = document.querySelector('#mail-form');
  const editor = document.querySelector('#mail-body');
  const toolbar = document.querySelector('#mail-rich-toolbar');
  if (!form || !editor || form.dataset.bound === '1') return;
  form.dataset.bound = '1';

  toolbar?.querySelectorAll('[data-mail-rich]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      editor.focus();
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(button.dataset.mailRich, false, null);
    });
  });
  document.querySelector('#mail-rich-color')?.addEventListener('input', (event) => {
    editor.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, event.target.value);
  });

  document.querySelector('#mail-select-all')?.addEventListener('click', () => {
    form.querySelectorAll('input[name="user_ids"]').forEach((input) => { input.checked = true; });
  });
  document.querySelector('#mail-clear-all')?.addEventListener('click', () => {
    form.querySelectorAll('input[name="user_ids"]').forEach((input) => { input.checked = false; });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#mail-status');
    const subject = String(form.elements.subject?.value || '').trim();
    const html = sanitizeRichHtml(editor.innerHTML || '');
    const userIds = selectedMailUserIds(form);
    if (!userIds.length) {
      if (status) status.textContent = 'Select at least one recipient.';
      return;
    }
    if (!subject) {
      if (status) status.textContent = 'Subject is required.';
      return;
    }
    if (!html.replace(/<[^>]+>/g, '').trim()) {
      if (status) status.textContent = 'Message body is required.';
      return;
    }

    const payload = new FormData();
    payload.set('subject', subject);
    payload.set('html', html);
    userIds.forEach((id) => payload.append('user_ids', String(id)));
    [...(form.elements.attachments?.files || [])].forEach((file) => payload.append('attachments', file));

    if (status) status.textContent = 'Sending…';
    try {
      const result = await jsonFetch('/api/admin/mail', { method: 'POST', body: payload });
      if (status) status.textContent = result.detail || 'Email sent.';
      if (result.ok) {
        editor.innerHTML = '';
        form.elements.attachments.value = '';
      }
    } catch (error) {
      let message = error.message || 'Could not send email.';
      try {
        const parsed = JSON.parse(message);
        if (parsed?.detail) message = parsed.detail;
      } catch {
        // Keep raw error text when the API did not return JSON.
      }
      if (status) status.textContent = message;
    }
  });
}

function canEditManagedUser(user) {
  if (!user || !hasPermission('users')) return false;
  if (isSuperAdmin()) return true;
  // Editors with the users permission can manage other editors, not Super Admins.
  return !isSuperAdmin(user);
}

async function loadUsers() {
  if (!hasPermission('users')) return;
  state.users = await jsonFetch('/api/admin/users');
  const list = document.querySelector('#users-list');
  const roleSelect = document.querySelector('#user-form [name="role"]');
  if (roleSelect) {
    [...roleSelect.options].forEach((option) => {
      if (option.value === 'admin') option.hidden = !isSuperAdmin();
    });
    if (!isSuperAdmin() && roleSelect.value === 'admin') roleSelect.value = 'editor';
  }
  list.innerHTML = state.users.length
    ? state.users.map(user => {
      const editable = canEditManagedUser(user);
      const actions = editable
        ? `<div class="row-actions"><button type="button" data-edit-user="${user.id}">Edit</button>${Number(user.id) !== Number(state.me.user.id) ? `<button type="button" data-delete-user="${user.id}">Delete</button>` : ''}</div>`
        : '<div class="row-actions"><span class="muted">View only</span></div>';
      return `
    <article class="admin-row user-admin-row">
      <div><b>${escapeHtml(user.display_name || user.username)}</b><span>${escapeHtml(user.username)} · ${isSuperAdmin(user) ? 'SUPER ADMIN' : 'EDITOR'}</span><small>${user.active ? 'Active' : 'Disabled'} · ${escapeHtml((user.permissions || []).join(', ') || (isSuperAdmin(user) ? 'all permissions' : 'no permissions'))}</small></div>
      ${actions}
    </article>`;
    }).join('')
    : '<p class="draft">No users found.</p>';
  list.querySelectorAll('[data-edit-user]').forEach(button => button.addEventListener('click', () => {
    const user = state.users.find(item => item.id === Number(button.dataset.editUser));
    if (!user || !canEditManagedUser(user)) return;
    const form = document.querySelector('#user-form');
    fillForm(form, {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      password: '',
    });
    form.querySelectorAll('input[name="permissions"]').forEach((input) => {
      input.checked = Array.isArray(user.permissions) && user.permissions.includes(input.value);
    });
    form.elements.active.checked = Boolean(user.active);
    const status = document.querySelector('#user-status');
    if (status) status.textContent = `Editing ${user.display_name || user.username}.`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formControl(form, 'display_name')?.focus();
  }));
  list.querySelectorAll('[data-delete-user]').forEach(button => button.addEventListener('click', async () => {
    const user = state.users.find(item => item.id === Number(button.dataset.deleteUser));
    if (!user || !canEditManagedUser(user)) return;
    if (!confirm('Delete this user?')) return;
    try {
      await jsonFetch(`/api/admin/users/${button.dataset.deleteUser}`, { method: 'DELETE' });
      await loadUsers();
    } catch (error) {
      alert(error.message || 'Could not delete user.');
    }
  }));
}

function defaultEventYear() {
  return new Date().getFullYear();
}

function setEventBoosterPlacement(form, value) {
  if (!form) return;
  const selected = Number(value) === 1 ? '1' : '0';
  form.querySelectorAll('input[name="show_on_boosters"]').forEach((input) => {
    input.checked = input.value === selected;
  });
}

let eventExceptionDates = [];

function syncEventRepeatUi(form = document.querySelector('#event-form')) {
  if (!form) return;
  const enabled = Boolean(form.querySelector('[data-repeat-enabled]')?.checked);
  const options = form.querySelector('[data-repeat-options]');
  if (options) options.hidden = !enabled;
  const month = formControl(form, 'date_label');
  const day = formControl(form, 'date_detail');
  if (month) month.required = !enabled;
  if (day) day.required = !enabled;
  const booster = form.querySelector('[data-booster-placement]');
  const note = form.querySelector('[data-repeat-booster-note]');
  if (booster) {
    booster.disabled = enabled;
    if (enabled) {
      setEventBoosterPlacement(form, 0);
    }
  }
  if (note) note.hidden = !enabled;
  renderEventExceptionsList();
}

function renderEventExceptionsList() {
  const list = document.querySelector('#event-exceptions-list');
  if (!list) return;
  const dates = [...eventExceptionDates].sort();
  list.innerHTML = dates.length
    ? dates.map((date) => `
      <li>
        <span>${escapeHtml(date)}</span>
        <button type="button" data-remove-exception="${escapeHtml(date)}">Remove</button>
      </li>
    `).join('')
    : '<li class="draft">No skipped dates yet.</li>';
  list.querySelectorAll('[data-remove-exception]').forEach((button) => {
    button.addEventListener('click', () => {
      eventExceptionDates = eventExceptionDates.filter((date) => date !== button.dataset.removeException);
      renderEventExceptionsList();
    });
  });
}

function setEventRepeatFields(form, event = {}) {
  if (!form) return;
  const enabled = Number(event.repeat_enabled) === 1;
  const enabledInput = form.querySelector('[data-repeat-enabled]');
  if (enabledInput) enabledInput.checked = enabled;
  const days = new Set((event.repeat_days || []).map(Number));
  form.querySelectorAll('input[name="repeat_day"]').forEach((input) => {
    input.checked = days.has(Number(input.value));
  });
  const months = new Set((event.repeat_months || []).map(Number));
  form.querySelectorAll('input[name="repeat_month"]').forEach((input) => {
    input.checked = months.has(Number(input.value));
  });
  eventExceptionDates = Array.isArray(event.repeat_exceptions) ? [...event.repeat_exceptions] : [];
  syncEventRepeatUi(form);
}

function collectEventRepeatPayload(form) {
  const repeat_enabled = form.querySelector('[data-repeat-enabled]')?.checked ? 1 : 0;
  return {
    repeat_enabled,
    repeat_days: [...form.querySelectorAll('input[name="repeat_day"]:checked')].map((input) => Number(input.value)),
    repeat_months: [...form.querySelectorAll('input[name="repeat_month"]:checked')].map((input) => Number(input.value)),
    repeat_exceptions: [...eventExceptionDates],
  };
}

function resetEventRepeatFields(form) {
  setEventRepeatFields(form, {
    repeat_enabled: 0,
    repeat_days: [],
    repeat_months: [],
    repeat_exceptions: [],
  });
}

function isPastEventLocal(event) {
  const year = Number(event.event_year) || new Date().getFullYear();
  const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12, Spring: 3, Summer: 6, Fall: 9, Autumn: 9, Winter: 12 };
  const month = months[event.date_label] || 12;
  const detail = String(event.date_detail || '').trim();
  const day = /^\d{1,2}$/.test(detail) ? Number(detail) : new Date(year, month, 0).getDate();
  const end = new Date(year, month - 1, day, 23, 59, 59);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return end < today;
}

async function loadEvents() {
  if (!canCreateEvents() && !canEditPage('calendar')) return;
  state.events = await jsonFetch('/api/admin/events');
  const list = document.querySelector('#events-list');
  const count = document.querySelector('#events-count');
  if (!list) return;
  // API already returns events ordered by year → month → day.
  const ordered = [...state.events];
  const pastCount = ordered.filter(isPastEventLocal).length;
  if (count) count.textContent = pastCount ? `${ordered.length} total · ${pastCount} past (hidden publicly)` : `${ordered.length} total`;
  list.innerHTML = ordered.length
    ? ordered.map(event => {
      const mutable = canMutateEvent(event);
      const creator = eventCreatorLabel(event);
      const actions = mutable
        ? `<div class="row-actions"><button type="button" data-edit-event="${event.id}">Edit</button><button type="button" data-delete-event="${event.id}">Delete</button></div>`
        : '<div class="row-actions"><span class="muted">View only</span></div>';
      return `
    <article class="admin-row">
      <div>
        <b>${Number(event.repeat_enabled) === 1
          ? escapeHtml(event.repeat_summary || `Repeats ${event.event_year}`)
          : `${escapeHtml(event.date_label)} ${escapeHtml(event.date_detail)}, ${escapeHtml(event.event_year)}`}${isPastEventLocal(event) && Number(event.repeat_enabled) !== 1 ? ' · Past' : ''}${Number(event.show_on_boosters) === 1 ? ' · Boosters' : ''}${Number(event.repeat_enabled) === 1 && event.repeat_exceptions?.length ? ` · ${event.repeat_exceptions.length} exception${event.repeat_exceptions.length === 1 ? '' : 's'}` : ''}</b>
        <span class="event-admin-title">${formatInlineRichText(event.title)}</span>
        <div class="event-admin-description">${formatRichText(event.description)}</div>
        <small>Created by ${escapeHtml(creator)}</small>
      </div>
      ${actions}
    </article>`;
    }).join('')
    : '<p class="draft">No calendar events yet. Use the form to add one.</p>';
  list.querySelectorAll('[data-edit-event]').forEach(button => button.addEventListener('click', () => {
    const event = state.events.find(item => item.id === Number(button.dataset.editEvent));
    if (!event || !canMutateEvent(event)) return;
    const form = document.querySelector('#event-form');
    const status = document.querySelector('#event-status');
    form.reset();
    fillForm(form, {
      event_id: event.id,
      date_label: event.date_label,
      date_detail: event.date_detail,
      event_year: event.event_year || defaultEventYear(),
      title: event.title,
      description: event.description,
    });
    formControl(form, 'event_id').value = String(event.id);
    setSelectValue(formControl(form, 'date_label'), event.date_label);
    setSelectValue(formControl(form, 'date_detail'), event.date_detail);
    formControl(form, 'event_year').value = String(event.event_year || defaultEventYear());
    setEventBoosterPlacement(form, event.show_on_boosters);
    setEventRepeatFields(form, event);
    if (status) status.textContent = `Editing “${plainTextFromHtml(event.title) || 'event'}”. Save to update.`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.querySelector('[data-rich-input="title"]')?.focus();
  }));
  list.querySelectorAll('[data-delete-event]').forEach(button => button.addEventListener('click', async () => {
    const event = state.events.find(item => item.id === Number(button.dataset.deleteEvent));
    if (!event || !canMutateEvent(event)) return;
    if (!confirm('Delete this event?')) return;
    try {
      await jsonFetch(`/api/admin/events/${button.dataset.deleteEvent}`, { method: 'DELETE' });
      await loadEvents();
    } catch (error) {
      alert(error.message || 'Could not delete event.');
    }
  }));
}

async function loadPhotos() {
  if (!hasPermission('photos')) return;
  state.photos = await jsonFetch('/api/photos');
  renderPhotos();
}

function orderedPhotos() {
  return [...state.photos].sort((a, b) => (
    Number(a.sort_order || 0) - Number(b.sort_order || 0)
    || String(b.created_at || '').localeCompare(String(a.created_at || ''))
    || Number(b.id || 0) - Number(a.id || 0)
  ));
}

function renderPhotos() {
  const list = document.querySelector('#photos-list');
  if (!list) return;
  const ordered = orderedPhotos();
  list.innerHTML = ordered.length
    ? ordered.map((photo) => {
      const uploaded = photo.created_at
        ? new Date(photo.created_at).toLocaleString()
        : '';
      const title = plainTextFromHtml(photo.caption) || photo.original_name || 'Photo';
      return `
    <article class="admin-row photo-row photo-admin-row" data-photo-id="${photo.id}" draggable="true">
      <button type="button" class="drag-handle" aria-label="Drag to reorder ${escapeHtml(title)}" title="Drag to reorder">⋮⋮</button>
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt_text)}">
      <div><b>${escapeHtml(title)}</b><span>${escapeHtml(photo.alt_text)}</span>${uploaded ? `<small>Uploaded ${escapeHtml(uploaded)}</small>` : ''}</div>
      <div class="row-actions"><button type="button" data-edit-photo="${photo.id}">Edit</button><button type="button" data-delete-photo="${photo.id}">Delete</button></div>
    </article>`;
    }).join('')
    : '<p class="draft">No gallery photos yet. Upload one above.</p>';
  list.querySelectorAll('[data-edit-photo]').forEach((button) => button.addEventListener('click', () => {
    const photo = state.photos.find((item) => item.id === Number(button.dataset.editPhoto));
    if (!photo) return;
    editPhoto(photo);
  }));
  list.querySelectorAll('[data-delete-photo]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Delete this photo?')) return;
    try {
      await jsonFetch(`/api/admin/photos/${button.dataset.deletePhoto}`, { method: 'DELETE' });
      await loadPhotos();
      const editingId = String(document.querySelector('#photo-form [name="photo_id"]')?.value || '');
      if (editingId && editingId === String(button.dataset.deletePhoto)) resetPhotoForm();
    } catch (error) {
      alert(error.message || 'Could not delete photo.');
    }
  }));
  bindPhotoDragAndDrop(list);
}

function syncPhotoFormMode(editing = false) {
  const form = document.querySelector('#photo-form');
  if (!form) return;
  const fileInput = formControl(form, 'file');
  const hint = form.querySelector('[data-photo-file-hint]');
  const submit = form.querySelector('[data-photo-submit]');
  if (fileInput) fileInput.required = !editing;
  if (hint) hint.textContent = editing ? 'Leave empty to keep the current image' : 'Required for new uploads';
  if (submit) submit.textContent = editing ? 'Save photo' : 'Upload photo';
}

function resetPhotoForm() {
  const form = document.querySelector('#photo-form');
  if (!form) return;
  form.reset();
  clearFormRichEditors(form);
  formControl(form, 'photo_id').value = '';
  syncPhotoFormMode(false);
  const status = document.querySelector('#photo-status');
  if (status) status.textContent = 'Upload a new gallery photo.';
}

function editPhoto(photo) {
  const form = document.querySelector('#photo-form');
  if (!form || !photo) return;
  form.reset();
  formControl(form, 'photo_id').value = String(photo.id);
  formControl(form, 'alt_text').value = photo.alt_text || '';
  const captionHidden = formControl(form, 'caption');
  if (captionHidden) captionHidden.value = photo.caption || '';
  const captionEditor = form.querySelector('[data-rich-input="caption"]');
  if (captionEditor) captionEditor.innerHTML = photo.caption || '';
  syncPhotoFormMode(true);
  const status = document.querySelector('#photo-status');
  const label = plainTextFromHtml(photo.caption) || photo.original_name || 'photo';
  if (status) status.textContent = `Editing “${label}”. Save to update the title.`;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  formControl(form, 'alt_text')?.focus();
}

async function savePhotoOrder(ids) {
  state.photos = await jsonFetch('/api/admin/photos/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  renderPhotos();
}

function bindPhotoDragAndDrop(list) {
  if (!list) return;
  let dragId = null;
  let allowRowDrag = false;

  list.querySelectorAll('[data-photo-id]').forEach((row) => {
    const handle = row.querySelector('.drag-handle');
    handle?.addEventListener('mousedown', () => { allowRowDrag = true; });
    handle?.addEventListener('touchstart', () => { allowRowDrag = true; }, { passive: true });
    handle?.addEventListener('click', (event) => event.preventDefault());

    row.addEventListener('dragstart', (event) => {
      if (!allowRowDrag && !event.target.closest?.('.drag-handle')) {
        event.preventDefault();
        return;
      }
      dragId = Number(row.dataset.photoId);
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(dragId));
      try { event.dataTransfer.setDragImage(row, 24, 24); } catch { /* older browsers */ }
    });
    row.addEventListener('dragend', () => {
      allowRowDrag = false;
      row.classList.remove('is-dragging');
      list.querySelectorAll('.is-drop-target').forEach((item) => item.classList.remove('is-drop-target'));
      dragId = null;
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (Number(row.dataset.photoId) !== dragId) row.classList.add('is-drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', async (event) => {
      event.preventDefault();
      allowRowDrag = false;
      row.classList.remove('is-drop-target');
      const fromId = Number(event.dataTransfer.getData('text/plain') || dragId);
      const toId = Number(row.dataset.photoId);
      if (!fromId || !toId || fromId === toId) return;
      const ordered = orderedPhotos();
      const fromIndex = ordered.findIndex((photo) => photo.id === fromId);
      const toIndex = ordered.findIndex((photo) => photo.id === toId);
      if (fromIndex < 0 || toIndex < 0) return;
      const next = [...ordered];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const ids = next.map((photo) => photo.id);
      state.photos = next.map((photo, index) => ({ ...photo, sort_order: index + 1 }));
      renderPhotos();
      try {
        await savePhotoOrder(ids);
        const status = document.querySelector('#photo-status');
        if (status) status.textContent = 'Photo order saved.';
      } catch (error) {
        console.error(error);
        await loadPhotos();
        const status = document.querySelector('#photo-status');
        if (status) status.textContent = 'Could not save the new photo order.';
      }
    });
  });
}

function renderContactTopics() {
  const list = document.querySelector('#contact-topics-list');
  if (!list) return;
  const ordered = [...state.contactTopics].sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' }) || a.id - b.id);
  list.innerHTML = ordered.length
    ? ordered.map((topic) => `
    <article class="admin-row">
      <div><b>${escapeHtml(topic.label)}</b><span>${escapeHtml(topic.email || 'No delivery email')}</span><small>${topic.active ? 'Active' : 'Hidden'}</small></div>
      <div class="row-actions"><button type="button" data-edit-contact-topic="${topic.id}">Edit</button><button type="button" data-delete-contact-topic="${topic.id}">Delete</button></div>
    </article>
  `).join('')
    : '<p class="draft">No contact topics yet. Add one to enable the public form.</p>';

  list.querySelectorAll('[data-edit-contact-topic]').forEach((button) => button.addEventListener('click', () => {
    const topic = state.contactTopics.find((item) => item.id === Number(button.dataset.editContactTopic));
    if (!topic) return;
    const form = document.querySelector('#contact-topic-form');
    fillForm(form, topic);
    form.elements.active.checked = Boolean(Number(topic.active));
    document.querySelector('#contact-topic-status').textContent = `Editing “${topic.label}”. Save to update.`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  list.querySelectorAll('[data-delete-contact-topic]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Delete this contact topic?')) return;
    await jsonFetch(`/api/admin/contact/topics/${button.dataset.deleteContactTopic}`, { method: 'DELETE' });
    await loadContactTopics();
  }));
}

function renderContactMessages() {
  const list = document.querySelector('#contact-messages-list');
  if (!list) return;
  list.innerHTML = state.contactMessages.length
    ? state.contactMessages.map((item) => `
    <article class="admin-row">
      <div>
        <b>${escapeHtml(item.topic_label || 'Topic')} → ${escapeHtml(item.to_email || 'unassigned')}</b>
        <span>${escapeHtml(item.name)} &lt;${escapeHtml(item.email)}&gt;</span>
        <small>${escapeHtml(item.message)} · ${item.delivered ? 'Delivered' : `Not delivered${item.delivery_error ? `: ${item.delivery_error}` : ''}`} · ${escapeHtml(item.created_at || '')}</small>
      </div>
    </article>
  `).join('')
    : '<p class="draft">No contact messages yet.</p>';
}

async function loadContactDeliveryStatus() {
  const status = document.querySelector('#contact-delivery-status');
  if (!status || !canEditContact()) return;
  try {
    const info = await jsonFetch('/api/admin/contact/delivery');
    state.contactDelivery = info;
    status.textContent = info.configured
      ? `Email delivery: ${info.detail}`
      : `Email delivery offline: ${info.detail}`;
    status.classList.toggle('error', !info.configured);
  } catch (error) {
    status.textContent = `Could not check email delivery: ${error.message}`;
    status.classList.add('error');
  }
}

async function loadContactTopics() {
  if (!canEditContact()) return;
  state.contactTopics = await jsonFetch('/api/admin/contact/topics');
  state.contactMessages = await jsonFetch('/api/admin/contact/messages').catch(() => []);
  renderContactTopics();
  renderContactMessages();
  await loadContactDeliveryStatus();
}

function selectedMinutes() {
  return state.minutes.find((item) => Number(item.id) === Number(state.selectedMinutesId)) || null;
}

function todayMeetingDateDisplay(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear());
  return `${month}/${day}/${year}`;
}

function formatMinutesDateMask(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isValidMinutesDateInput(value) {
  const raw = String(value || '').trim();
  if (/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(raw)) return true;
  if (/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{4}$/.test(raw)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return true;
  return false;
}

function minutesDateFieldValue(item) {
  const display = String(item?.meeting_date_display || '').trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(display)) return formatMinutesDateMask(display);
  const iso = String(item?.meeting_date || '').trim();
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return todayMeetingDateDisplay();
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function readMinutesBodyHtml(form) {
  syncFormRichEditors(form);
  const control = formControl(form, 'body_html');
  let html = String(control?.value || '').trim();
  if (!html.replace(/<[^>]+>/g, '').trim()) {
    const editor = form?.querySelector('[data-rich-input="body_html"]');
    const fromEditor = sanitizeRichHtml(editor?.innerHTML || '');
    if (fromEditor.replace(/<[^>]+>/g, '').trim()) {
      html = fromEditor;
      if (control) control.value = fromEditor;
    }
  }
  return html;
}

function syncMinutesPanelMode() {
  const newBtn = document.querySelector('#new-minutes');
  if (newBtn) {
    newBtn.hidden = !canManageMinutes();
    newBtn.textContent = 'Add Minutes';
  }
}

function setMinutesEmptyVisible(visible) {
  const empty = document.querySelector('#minutes-empty');
  if (empty) empty.toggleAttribute('hidden', !visible);
}

function syncMinutesFrameBodyLock() {
  const open = isMinutesViewOpen() || isMinutesEditorOpen() || isEnsemblesBodyEditorOpen();
  document.body.classList.toggle('minutes-frame-open', open);
}

function isMinutesViewOpen() {
  const modal = document.querySelector('#minutes-view-modal');
  return Boolean(modal && !modal.hasAttribute('hidden'));
}

function isMinutesEditorOpen() {
  const modal = document.querySelector('#minutes-editor-modal');
  return Boolean(modal && !modal.hasAttribute('hidden'));
}

function closeMinutesView() {
  const modal = document.querySelector('#minutes-view-modal');
  if (modal) modal.toggleAttribute('hidden', true);
  syncMinutesFrameBodyLock();
}

function closeMinutesEditor() {
  const modal = document.querySelector('#minutes-editor-modal');
  if (modal) modal.toggleAttribute('hidden', true);
  syncMinutesFrameBodyLock();
}

function openMinutesEditor({ editing = false, statusText = '' } = {}) {
  if (!canManageMinutes()) return;
  const modal = document.querySelector('#minutes-editor-modal');
  const form = document.querySelector('#minutes-form');
  const title = document.querySelector('#minutes-editor-title');
  if (!modal || !form) return;
  closeMinutesView();
  modal.toggleAttribute('hidden', false);
  syncMinutesFrameBodyLock();
  if (title) title.textContent = editing ? 'Edit Minutes' : 'Add Minutes';
  const submit = document.querySelector('[data-minutes-submit]');
  if (submit) submit.textContent = editing ? 'Save changes' : 'Save minutes';
  const status = document.querySelector('#minutes-status');
  if (status) {
    status.textContent = statusText
      || (editing ? 'Update the minutes, then save to close the editor.' : 'Today is filled in. Enter the minutes, then save to close the editor.');
  }
  window.setTimeout(() => {
    form.querySelector('[name="meeting_date"]')?.focus();
  }, 30);
}

function showMinutesView() {
  closeMinutesEditor();
  const modal = document.querySelector('#minutes-view-modal');
  setMinutesEmptyVisible(true);
  if (modal) modal.toggleAttribute('hidden', false);
  syncMinutesFrameBodyLock();
}

function showMinutesIdle(statusText = '') {
  closeMinutesEditor();
  closeMinutesView();
  clearMinutesDocumentFrame();
  setMinutesEmptyVisible(true);
  const empty = document.querySelector('#minutes-empty');
  if (empty && statusText) {
    const muted = empty.querySelector('.muted');
    if (muted) muted.textContent = statusText;
  }
}

function prepareNewMinutesForm() {
  const form = document.querySelector('#minutes-form');
  if (!form) return;
  form.reset();
  clearFormRichEditors(form);
  formControl(form, 'minutes_id').value = '';
  const dateControl = formControl(form, 'meeting_date');
  if (dateControl) dateControl.value = todayMeetingDateDisplay();
}

function clearMinutesDocumentFrame() {
  const frame = document.querySelector('#minutes-document-frame');
  const body = document.querySelector('[data-minutes-view-body]');
  if (frame) {
    frame.toggleAttribute('hidden', true);
    frame.removeAttribute('src');
  }
  if (body) body.toggleAttribute('hidden', true);
}

function resetMinutesForm(statusText = '') {
  syncMinutesPanelMode();
  state.selectedMinutesId = null;
  prepareNewMinutesForm();
  showMinutesIdle(statusText || (canManageMinutes()
    ? 'Choose a meeting date from the list to open it in a floating frame, or click Add Minutes to create a new entry.'
    : 'Choose a meeting date from the list to open it in a floating frame.'));
  renderMinutesList();
}

function minutesListMarkup() {
  if (!state.minutes.length) return '<p class="draft">No minutes submitted yet.</p>';
  return state.minutes.map((item) => {
    const active = Number(item.id) === Number(state.selectedMinutesId);
    return `<button type="button" class="minutes-nav-item${active ? ' active' : ''}" data-minutes-id="${item.id}">
      <b>${escapeHtml(item.meeting_date_display || item.meeting_date)}</b>
      <small>${escapeHtml(item.created_by_name || 'Secretary')}</small>
    </button>`;
  }).join('');
}

function bindMinutesListClicks(root) {
  root?.querySelectorAll('[data-minutes-id]').forEach((button) => {
    button.addEventListener('click', () => {
      openMinutesView(Number(button.dataset.minutesId));
      setMinutesNavOpen(false);
    });
  });
}

function syncMinutesNavToggleLabel() {
  const toggle = document.querySelector('.minutes-nav-toggle');
  if (!toggle) return;
  const selected = selectedMinutes();
  toggle.textContent = selected
    ? (selected.meeting_date_display || selected.meeting_date || 'Minutes')
    : 'Minutes';
}

function setMinutesNavOpen(open) {
  const toggle = document.querySelector('.minutes-nav-toggle');
  const menu = document.querySelector('#minutes-mobile-menu');
  if (!toggle || !menu) return;
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  menu.hidden = !open;
}

function renderMinutesList() {
  const list = document.querySelector('#minutes-list');
  const mobileMenu = document.querySelector('#minutes-mobile-menu');
  const markup = minutesListMarkup();
  if (list) {
    list.innerHTML = markup;
    bindMinutesListClicks(list);
  }
  if (mobileMenu) {
    mobileMenu.innerHTML = markup;
    bindMinutesListClicks(mobileMenu);
  }
  syncMinutesNavToggleLabel();
}

function renderMinutesView(item) {
  const view = document.querySelector('#minutes-view');
  if (!view || !item) return;
  view.querySelector('[data-minutes-view-date]').textContent = item.meeting_date_display || item.meeting_date;
  const meta = [];
  if (item.created_by_name) meta.push(`Recorded by ${item.created_by_name}`);
  if (item.created_at) meta.push(`Submitted ${new Date(item.created_at).toLocaleString()}`);
  if (item.can_edit && item.editable_until) {
    meta.push(`Editable until ${new Date(item.editable_until).toLocaleDateString()}`);
  } else if (!item.can_edit) {
    meta.push('View only');
  }
  view.querySelector('[data-minutes-view-meta]').textContent = meta.join(' · ');
  const frame = document.querySelector('#minutes-document-frame');
  const body = document.querySelector('[data-minutes-view-body]');
  const documentUrl = item.document_url || `/api/admin/minutes/${item.id}/document`;
  if (frame) {
    frame.toggleAttribute('hidden', false);
    if (frame.getAttribute('src') !== documentUrl) frame.setAttribute('src', documentUrl);
  }
  if (body) {
    body.toggleAttribute('hidden', true);
    body.innerHTML = '';
  }
  const printBtn = document.querySelector('#print-minutes');
  const editBtn = document.querySelector('#edit-minutes');
  const deleteBtn = document.querySelector('#delete-minutes');
  if (printBtn) printBtn.toggleAttribute('hidden', false);
  if (editBtn) editBtn.toggleAttribute('hidden', !item.can_edit);
  // Delete is Super Admin only — never show the control for secretaries/viewers.
  if (deleteBtn) deleteBtn.toggleAttribute('hidden', !(isSuperAdmin() && item.can_delete));
  showMinutesView();
  renderMinutesList();
}

function openMinutesView(id) {
  const item = state.minutes.find((row) => Number(row.id) === Number(id));
  if (!item) return;
  state.selectedMinutesId = item.id;
  renderMinutesView(item);
}

function editSelectedMinutes() {
  const item = selectedMinutes();
  const form = document.querySelector('#minutes-form');
  if (!item || !form || !item.can_edit) return;
  formControl(form, 'minutes_id').value = String(item.id);
  formControl(form, 'meeting_date').value = minutesDateFieldValue(item);
  setFormRichEditorValue(form, 'body_html', item.body_html || '');
  openMinutesEditor({
    editing: true,
    statusText: `Editing minutes for ${item.meeting_date_display || item.meeting_date}. Save to close the editor.`,
  });
}

async function saveMinutesForm(form) {
  const status = document.querySelector('#minutes-status');
  if (!canManageMinutes()) {
    if (status) status.textContent = 'You have view-only access to Meeting Minutes.';
    return;
  }
  if (!form) return;
  const id = String(formControl(form, 'minutes_id')?.value || '').trim();
  const dateControl = formControl(form, 'meeting_date');
  if (dateControl) dateControl.value = formatMinutesDateMask(dateControl.value);
  const meetingDate = String(dateControl?.value || '').trim();
  const bodyHtml = readMinutesBodyHtml(form);
  if (!isValidMinutesDateInput(meetingDate)) {
    if (status) status.textContent = 'Enter a meeting date as MM/DD/YYYY.';
    dateControl?.focus();
    return;
  }
  if (!bodyHtml.replace(/<[^>]+>/g, '').trim()) {
    if (status) status.textContent = 'Minutes content is required.';
    form.querySelector('[data-rich-input="body_html"]')?.focus();
    return;
  }
  if (status) status.textContent = 'Saving minutes…';
  try {
    const saved = await jsonFetch(id ? `/api/admin/minutes/${id}` : '/api/admin/minutes', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({ meeting_date: meetingDate, body_html: bodyHtml }),
    });
    if (!saved?.id) throw new Error('Save succeeded but no minutes id was returned.');
    state.minutes = await jsonFetch('/api/admin/minutes');
    closeMinutesEditor();
    prepareNewMinutesForm();
    state.selectedMinutesId = saved.id;
    renderMinutesList();
    openMinutesView(saved.id);
    const empty = document.querySelector('#minutes-empty .muted');
    if (empty) {
      empty.textContent = canManageMinutes()
        ? 'Choose a meeting date from the list to open it in a floating frame, or click Add Minutes to create a new entry.'
        : 'Choose a meeting date from the list to open it in a floating frame.';
    }
  } catch (error) {
    if (status) status.textContent = error.message || 'Could not save minutes.';
  }
}

async function loadMinutes() {
  if (!canViewMinutes()) return;
  syncMinutesPanelMode();
  state.minutes = await jsonFetch('/api/admin/minutes');
  // Never auto-open a document on visit/reload — only open when the user selects one.
  state.selectedMinutesId = null;
  renderMinutesList();
  prepareNewMinutesForm();
  showMinutesIdle();
}

function canEditEnsemblesBody() {
  return canEditPage('ensembles');
}

function isEnsemblesBodyEditorOpen() {
  const modal = document.querySelector('#ensembles-editor-modal');
  return Boolean(modal && !modal.hasAttribute('hidden'));
}

function syncEnsemblesFrameBodyLock() {
  document.body.classList.toggle('minutes-frame-open', isEnsemblesBodyEditorOpen() || isMinutesViewOpen() || isMinutesEditorOpen());
}

function closeEnsemblesBodyEditor() {
  const modal = document.querySelector('#ensembles-editor-modal');
  if (modal) modal.toggleAttribute('hidden', true);
  syncEnsemblesFrameBodyLock();
  syncMinutesFrameBodyLock();
}

function renderEnsemblesBodyPreview() {
  const preview = document.querySelector('#ensembles-body-preview');
  if (!preview) return;
  const html = String(state.ensemblesBodyHtml || '').trim();
  preview.innerHTML = html || '<p class="draft">No ensemble body content yet. Click Edit Body to create it.</p>';
}

function populateEnsemblesBodyForm() {
  const form = document.querySelector('#ensembles-body-form');
  if (!form) return;
  setFormRichEditorValue(form, 'body_html', state.ensemblesBodyHtml || '');
}

function openEnsemblesBodyEditor({ statusText = '' } = {}) {
  if (!canEditEnsemblesBody()) return;
  const modal = document.querySelector('#ensembles-editor-modal');
  const form = document.querySelector('#ensembles-body-form');
  if (!modal || !form) return;
  populateEnsemblesBodyForm();
  modal.toggleAttribute('hidden', false);
  syncEnsemblesFrameBodyLock();
  const status = document.querySelector('#ensembles-body-status');
  if (status) {
    status.textContent = statusText || 'Edit the Ensembles page body only. Save to close the editor.';
  }
  window.setTimeout(() => {
    form.querySelector('[data-rich-input="body_html"]')?.focus();
  }, 30);
}

function readEnsemblesBodyHtml(form) {
  syncFormRichEditors(form);
  const control = formControl(form, 'body_html');
  let html = String(control?.value || '').trim();
  if (!html.replace(/<[^>]+>/g, '').trim()) {
    const editor = form?.querySelector('[data-rich-input="body_html"]');
    const fromEditor = String(editor?.innerHTML || '').trim();
    if (fromEditor.replace(/<[^>]+>/g, '').trim()) {
      html = fromEditor;
      if (control) control.value = fromEditor;
    }
  }
  return html;
}

async function saveEnsemblesBodyForm(form) {
  const status = document.querySelector('#ensembles-body-status');
  if (!canEditEnsemblesBody()) {
    if (status) status.textContent = 'You do not have permission to edit Ensemble Body.';
    return;
  }
  const bodyHtml = readEnsemblesBodyHtml(form);
  if (!bodyHtml.replace(/<[^>]+>/g, '').trim()) {
    if (status) status.textContent = 'Ensemble body content is required.';
    form.querySelector('[data-rich-input="body_html"]')?.focus();
    return;
  }
  if (status) status.textContent = 'Saving ensemble body…';
  try {
    const saved = await jsonFetch('/api/admin/ensembles/body', {
      method: 'PUT',
      body: JSON.stringify({ body_html: bodyHtml }),
    });
    state.ensemblesBodyHtml = String(saved?.body_html || bodyHtml);
    renderEnsemblesBodyPreview();
    closeEnsemblesBodyEditor();
    const panelStatus = document.querySelector('#ensembles-body-panel-status');
    if (panelStatus) panelStatus.textContent = 'Ensemble body saved.';
  } catch (error) {
    if (status) status.textContent = error.message || 'Could not save ensemble body.';
  }
}

async function loadEnsemblesBody() {
  if (!canEditEnsemblesBody()) return;
  try {
    const result = await jsonFetch('/api/admin/ensembles/body');
    state.ensemblesBodyHtml = String(result?.body_html || '');
    renderEnsemblesBodyPreview();
    const panelStatus = document.querySelector('#ensembles-body-panel-status');
    if (panelStatus) panelStatus.textContent = '';
  } catch (error) {
    const panelStatus = document.querySelector('#ensembles-body-panel-status');
    if (panelStatus) panelStatus.textContent = error.message || 'Could not load ensemble body.';
  }
}

function bindEnsemblesBodyPanel() {
  document.querySelector('#edit-ensembles-body')?.addEventListener('click', () => {
    if (!canEditEnsemblesBody()) return;
    openEnsemblesBodyEditor();
  });
  document.querySelectorAll('[data-ensembles-editor-dismiss], #cancel-ensembles-edit').forEach((button) => {
    button.addEventListener('click', () => closeEnsemblesBodyEditor());
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isEnsemblesBodyEditorOpen()) return;
    closeEnsemblesBodyEditor();
  });
  document.querySelector('#ensembles-body-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveEnsemblesBodyForm(event.currentTarget);
  });
}

function bindMinutesPanel() {
  const toggle = document.querySelector('.minutes-nav-toggle');
  if (toggle && toggle.dataset.bound !== '1') {
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      setMinutesNavOpen(open);
    });
    document.addEventListener('click', (event) => {
      const card = document.querySelector('.minutes-nav-card');
      if (!card || card.contains(event.target)) return;
      setMinutesNavOpen(false);
    });
  }
  document.querySelector('#new-minutes')?.addEventListener('click', () => {
    if (!canManageMinutes()) return;
    setMinutesNavOpen(false);
    prepareNewMinutesForm();
    openMinutesEditor({ editing: false });
  });
  document.querySelectorAll('[data-minutes-view-dismiss]').forEach((button) => {
    button.addEventListener('click', () => {
      closeMinutesView();
      clearMinutesDocumentFrame();
      state.selectedMinutesId = null;
      renderMinutesList();
      showMinutesIdle();
    });
  });
  document.querySelectorAll('[data-minutes-editor-dismiss], #cancel-minutes-edit').forEach((button) => {
    button.addEventListener('click', () => {
      closeMinutesEditor();
      const selected = selectedMinutes();
      if (selected) openMinutesView(selected.id);
      else showMinutesIdle();
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isMinutesEditorOpen()) {
      closeMinutesEditor();
      const selected = selectedMinutes();
      if (selected) openMinutesView(selected.id);
      else showMinutesIdle();
      return;
    }
    if (isMinutesViewOpen()) {
      closeMinutesView();
      clearMinutesDocumentFrame();
      state.selectedMinutesId = null;
      renderMinutesList();
      showMinutesIdle();
    }
  });
  document.querySelector('#print-minutes')?.addEventListener('click', () => {
    const frame = document.querySelector('#minutes-document-frame');
    try {
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print();
    } catch {
      const item = selectedMinutes();
      if (item?.document_url) window.open(item.document_url, '_blank', 'noopener');
    }
  });
  document.querySelector('#edit-minutes')?.addEventListener('click', () => editSelectedMinutes());
  document.querySelector('#delete-minutes')?.addEventListener('click', async () => {
    const item = selectedMinutes();
    if (!isSuperAdmin() || !item?.can_delete) {
      alert('Only Super Admins can delete meeting minutes.');
      return;
    }
    if (!confirm(`Delete minutes for ${item.meeting_date_display || item.meeting_date}? This cannot be undone.`)) return;
    try {
      await jsonFetch(`/api/admin/minutes/${item.id}`, { method: 'DELETE' });
      state.minutes = await jsonFetch('/api/admin/minutes');
      resetMinutesForm('Minutes deleted.');
    } catch (error) {
      alert(error.message || 'Could not delete minutes.');
    }
  });
  const meetingDateInput = document.querySelector('#minutes-form [name="meeting_date"]');
  if (meetingDateInput && meetingDateInput.dataset.dateMaskBound !== '1') {
    meetingDateInput.dataset.dateMaskBound = '1';
    meetingDateInput.addEventListener('input', () => {
      const next = formatMinutesDateMask(meetingDateInput.value);
      if (meetingDateInput.value !== next) meetingDateInput.value = next;
    });
    meetingDateInput.addEventListener('blur', () => {
      const raw = String(meetingDateInput.value || '').trim();
      if (!raw) return;
      meetingDateInput.value = formatMinutesDateMask(raw);
    });
  }
  document.querySelector('#minutes-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveMinutesForm(event.currentTarget);
  });
}

async function refreshAll() {
  await loadMe();
  await Promise.all([loadSite(), loadPages(), loadSponsors(), loadStaff(), loadBoosterMembers(), loadUsers(), loadMailRecipients(), loadEvents(), loadPhotos(), loadContactTopics(), loadMinutes(), loadEnsemblesBody()]);
}

function bindForms() {
  document.querySelector('#password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#password-status');
    const currentPassword = String(form.elements.current_password?.value || '');
    const newPassword = String(form.elements.new_password?.value || '');
    const confirmPassword = String(form.elements.confirm_password?.value || '');
    if (!currentPassword) {
      if (status) status.textContent = 'Enter your current password.';
      return;
    }
    if (newPassword.length < 8) {
      if (status) status.textContent = 'New password must be at least 8 characters.';
      return;
    }
    if (newPassword !== confirmPassword) {
      if (status) status.textContent = 'New password and confirmation do not match.';
      return;
    }
    if (status) status.textContent = 'Updating password…';
    try {
      await jsonFetch('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      form.reset();
      if (status) status.textContent = 'Password updated. Use your new password the next time you log in.';
    } catch (error) {
      if (status) status.textContent = error?.message || 'Could not update password.';
    }
  });

  document.querySelector('#site-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#site-status');
    const payload = formPayload(form);
    payload.maintenance_mode = Boolean(form.elements.maintenance_mode?.checked);
    const saved = await jsonFetch('/api/admin/site', { method: 'POST', body: JSON.stringify(payload) });
    state.site = saved;
    fillForm(form, saved);
    if (status) {
      status.textContent = saved.maintenance_mode
        ? 'Saved. All public pages now redirect to maintenance.html.'
        : 'Saved. The public site is live again.';
    }
  });

  document.querySelector('#logo-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#logo-status');
    status.textContent = 'Uploading...';
    const result = await jsonFetch('/api/admin/logo', { method: 'POST', body: new FormData(form) });
    form.reset();
    fillForm(document.querySelector('#site-form'), result.site);
    status.textContent = 'Logo uploaded and saved.';
  });

  document.querySelector('#page-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    await saveCurrentPage({ reloadEditor: true });
  });

  document.querySelector('#utility-links-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#utility-links-status');
    const links = readUtilityLinksDraft();
    if (!links.length) {
      if (status) status.textContent = 'Add at least one utility link.';
      return;
    }
    if (status) status.textContent = 'Saving…';
    try {
      const saved = await jsonFetch('/api/admin/utility-links', {
        method: 'PUT',
        body: JSON.stringify({ utility_links: links }),
      });
      state.utilityLinks = saved.utility_links || links;
      renderUtilityLinksEditor();
      if (status) status.textContent = 'Top utility links saved. They appear on every public page.';
    } catch (error) {
      if (status) status.textContent = `Could not save utility links: ${error.message}`;
    }
  });

  document.querySelector('#utility-link-add')?.addEventListener('click', () => {
    const draft = readUtilityLinksDraft();
    if (draft.length >= 6) {
      const status = document.querySelector('#utility-links-status');
      if (status) status.textContent = 'You can add up to 6 utility links.';
      return;
    }
    state.utilityLinks = [...draft, { label: 'New link', href: '/', target: '_self' }];
    renderUtilityLinksEditor();
  });

  document.querySelector('#social-links-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#social-links-status');
    const links = readSocialLinksDraft();
    if (status) status.textContent = 'Saving…';
    try {
      const saved = await jsonFetch('/api/admin/social-links', {
        method: 'PUT',
        body: JSON.stringify({ social_links: links }),
      });
      state.socialLinks = saved.social_links || links;
      renderSocialLinksEditor();
      if (status) status.textContent = 'Footer social links saved. Icons appear on every public page when a URL is set.';
    } catch (error) {
      if (status) status.textContent = `Could not save social links: ${error.message}`;
    }
  });

  document.querySelectorAll('[data-open-social-tab]').forEach((button) => {
    button.addEventListener('click', () => activateTab('social'));
  });

  document.querySelector('#zernio-facebook-refresh')?.addEventListener('click', async () => {
    const messageEl = document.querySelector('#zernio-facebook-message');
    if (messageEl) messageEl.textContent = 'Refreshing…';
    try {
      await loadSocialPanel({ sync: true });
      if (messageEl) messageEl.textContent = state.zernioFacebook?.connected
        ? 'Facebook connection refreshed.'
        : 'No Facebook Page connected yet. Use Connect Facebook to finish OAuth.';
    } catch (error) {
      if (messageEl) messageEl.textContent = error.message || 'Could not refresh Facebook status.';
    }
  });

  document.querySelector('#zernio-facebook-events-publish')?.addEventListener('click', async () => {
    const statusEl = document.querySelector('#zernio-facebook-events-status');
    const count = Number(state.zernioEventQueue?.pending_count || 0);
    if (!count) return;
    if (!confirm(`Post ${count} calendar event${count === 1 ? '' : 's'} to the Facebook Page now?`)) return;
    if (statusEl) statusEl.textContent = 'Posting calendar updates…';
    try {
      const result = await jsonFetch('/api/admin/zernio/facebook/events/publish', { method: 'POST', body: '{}' });
      state.zernioEventQueue = result;
      renderZernioEventQueue();
      if (statusEl) statusEl.textContent = `Posted ${result.published_count || count} event${(result.published_count || count) === 1 ? '' : 's'} to Facebook.`;
      await loadZernioPosts();
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || 'Could not post calendar updates.';
    }
  });

  document.querySelector('#zernio-facebook-disconnect')?.addEventListener('click', async () => {
    const messageEl = document.querySelector('#zernio-facebook-message');
    if (!confirm('Disconnect the Facebook Page from Zernio?')) return;
    if (messageEl) messageEl.textContent = 'Disconnecting…';
    try {
      await jsonFetch('/api/admin/zernio/facebook', { method: 'DELETE' });
      await loadSocialPanel();
      if (messageEl) messageEl.textContent = 'Facebook Page disconnected.';
    } catch (error) {
      if (messageEl) messageEl.textContent = error.message || 'Could not disconnect Facebook.';
    }
  });

  document.querySelectorAll('#zernio-post-form input[name="publish_mode"]').forEach((input) => {
    input.addEventListener('change', syncZernioPublishModeUi);
  });

  document.querySelector('#zernio-post-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const statusEl = document.querySelector('#zernio-post-status');
    const mode = String(form.querySelector('input[name="publish_mode"]:checked')?.value || 'now');
    const payload = {
      content: String(form.elements.content?.value || '').trim(),
      media_url: String(form.elements.media_url?.value || '').trim(),
      publish_now: mode === 'now',
      scheduled_for: mode === 'schedule' ? String(form.elements.scheduled_for?.value || '').trim() : '',
      timezone: 'America/New_York',
    };
    if (statusEl) statusEl.textContent = mode === 'schedule' ? 'Scheduling…' : 'Publishing…';
    try {
      await jsonFetch('/api/admin/zernio/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      form.reset();
      const nowRadio = form.querySelector('input[name="publish_mode"][value="now"]');
      if (nowRadio) nowRadio.checked = true;
      syncZernioPublishModeUi();
      if (statusEl) statusEl.textContent = mode === 'schedule' ? 'Post scheduled.' : 'Post published.';
      await loadZernioPosts();
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || 'Could not create post.';
    }
  });

  document.querySelector('#new-page')?.addEventListener('click', async () => {
    if (!(await confirmLeavePageEditor())) return;
    const form = document.querySelector('#page-form');
    form.reset();
    state.homeBodyHtml = '';
    form.elements.original_slug.value = '';
    if (form.elements.layout) {
      form.elements.layout.disabled = false;
      form.elements.layout.closest('label')?.classList.remove('is-home-locked');
      form.elements.layout.value = 'standard';
    }
    form.elements.kicker.value = 'New page';
    form.elements.heading.value = 'New Page';
    form.elements.intro.value = 'Short introduction for this page.';
    form.elements.body_text.value = 'Add the page information here. Use blank lines to make separate paragraphs.';
    form.elements.callout_title.value = '';
    form.elements.callout_text.value = '';
    for (const key of HOME_FEATURE_CARD_KEYS) {
      if (form.elements[key]) form.elements[key].value = '';
    }
    for (const key of SPONSOR_TIER_FIELD_KEYS) {
      if (form.elements[key]) form.elements[key].value = DEFAULT_SPONSOR_TIER_FIELDS[key] || '';
    }
    form.elements.active.checked = true;
    document.querySelector('[data-page-editor-title]').textContent = 'Create a new page';
    showPageEditorChrome(true);
    syncPreviewFromForm();
    await activateTab('pages');
    capturePageBaseline();
  });

  document.querySelector('#staff-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#staff-status');
    status.textContent = 'Saving…';
    try {
      const payload = formPayload(form);
      const id = String(payload.staff_id || payload.id || '').trim();
      delete payload.staff_id;
      delete payload.id;
      delete payload.photo_file;
      delete payload.sort_order;
      const file = formControl(form, 'photo_file')?.files?.[0];
      if (file) {
        const upload = new FormData();
        upload.set('file', file);
        upload.set('alt_text', payload.name || 'Staff photo');
        upload.set('caption', plainTextFromHtml(payload.role) || 'Directors & Staff');
        // Negative sort keeps staff photos out of the public Photo gallery listing.
        upload.set('sort_order', '-500');
        const stored = await jsonFetch('/api/admin/photos', { method: 'POST', body: upload });
        payload.photo_url = stored.url;
        formControl(form, 'photo_url').value = stored.url;
      }
      if (!payload.name?.trim()) {
        status.textContent = 'Name is required.';
        return;
      }
      await jsonFetch(id ? `/api/admin/staff/${id}` : '/api/admin/staff', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      status.textContent = id ? 'Staff member updated.' : 'Staff member created.';
      form.reset();
      clearFormRichEditors(form);
      formControl(form, 'staff_id').value = '';
      formControl(form, 'active').checked = true;
      await loadStaff();
    } catch (error) {
      status.textContent = `Could not save staff member: ${error.message}`;
    }
  });

  document.querySelector('#new-staff')?.addEventListener('click', () => {
    const form = document.querySelector('#staff-form');
    form.reset();
    clearFormRichEditors(form);
    formControl(form, 'staff_id').value = '';
    formControl(form, 'active').checked = true;
    document.querySelector('#staff-status').textContent = 'Creating a new staff member.';
    formControl(form, 'name')?.focus();
  });

  document.querySelector('#booster-member-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#booster-member-status');
    status.textContent = 'Saving…';
    try {
      const payload = formPayload(form);
      const id = String(payload.booster_member_id || payload.id || '').trim();
      delete payload.booster_member_id;
      delete payload.id;
      delete payload.photo_file;
      delete payload.sort_order;
      const file = formControl(form, 'photo_file')?.files?.[0];
      if (file) {
        const upload = new FormData();
        upload.set('file', file);
        upload.set('alt_text', payload.name || 'Booster member photo');
        upload.set('caption', plainTextFromHtml(payload.role) || 'Booster Members');
        upload.set('sort_order', '-500');
        const stored = await jsonFetch('/api/admin/photos', { method: 'POST', body: upload });
        payload.photo_url = stored.url;
        formControl(form, 'photo_url').value = stored.url;
      }
      if (!payload.name?.trim()) {
        status.textContent = 'Name is required.';
        return;
      }
      await jsonFetch(id ? `/api/admin/booster-members/${id}` : '/api/admin/booster-members', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      status.textContent = id ? 'Booster member updated.' : 'Booster member created.';
      form.reset();
      clearFormRichEditors(form);
      formControl(form, 'booster_member_id').value = '';
      formControl(form, 'active').checked = true;
      await loadBoosterMembers();
    } catch (error) {
      status.textContent = `Could not save booster member: ${error.message}`;
    }
  });

  document.querySelector('#new-booster-member')?.addEventListener('click', () => {
    const form = document.querySelector('#booster-member-form');
    form.reset();
    clearFormRichEditors(form);
    formControl(form, 'booster_member_id').value = '';
    formControl(form, 'active').checked = true;
    document.querySelector('#booster-member-status').textContent = 'Creating a new booster member.';
    formControl(form, 'name')?.focus();
  });

  document.querySelector('#sponsor-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#sponsor-status');
    const payload = formPayload(form);
    delete payload.homepage_ad;
    payload.city = String(payload.city || 'Kernersville').trim() || 'Kernersville';
    payload.state = String(payload.state || 'NC').trim() || 'NC';
    const id = payload.id;
    delete payload.id;
    delete payload.logo_file;
    delete payload.sort_order;
    if (status) status.textContent = 'Saving…';
    try {
      const file = formControl(form, 'logo_file')?.files?.[0];
      if (file) {
        const upload = new FormData();
        upload.set('file', file);
        upload.set('alt_text', payload.name || 'Sponsor logo');
        upload.set('caption', payload.level || 'Sponsor');
        // Negative sort keeps sponsor logos out of the public Photo gallery listing.
        upload.set('sort_order', '-400');
        const stored = await jsonFetch('/api/admin/photos', { method: 'POST', body: upload });
        payload.logo_url = stored.url;
        formControl(form, 'logo_url').value = stored.url;
        syncSponsorLogoPreview(form, stored.url);
      }
      await jsonFetch(id ? `/api/admin/sponsors/${id}` : '/api/admin/sponsors', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      if (status) status.textContent = 'Sponsor saved. The public Sponsors page updates automatically.';
      resetSponsorForm(form);
      await loadSponsors();
    } catch (error) {
      if (status) status.textContent = `Could not save sponsor: ${error.message}`;
    }
  });

  document.querySelector('#sponsor-form [name="logo_url"]')?.addEventListener('input', (event) => {
    syncSponsorLogoPreview(event.currentTarget.form, event.currentTarget.value);
  });
  document.querySelector('#sponsor-form [name="logo_file"]')?.addEventListener('change', (event) => {
    const form = event.currentTarget.form;
    const file = event.currentTarget.files?.[0];
    if (!file) {
      syncSponsorLogoPreview(form);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    syncSponsorLogoPreview(form, objectUrl);
  });
  document.querySelector('#sponsor-form [name="level"]')?.addEventListener('change', (event) => {
    syncSponsorTierBenefits(event.currentTarget.form);
  });
  document.querySelector('#print-gold-sponsors')?.addEventListener('click', () => {
    printGoldSponsorsPdf();
  });
  syncSponsorTierBenefits();

  document.querySelector('#sponsor-ad-settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#sponsor-ad-settings-status');
    const seconds = Number(formControl(form, 'sponsor_ad_seconds')?.value);
    if (!Number.isFinite(seconds)) {
      if (status) status.textContent = 'Enter a valid number of seconds.';
      return;
    }
    if (status) status.textContent = 'Saving…';
    try {
      const saved = await jsonFetch('/api/admin/sponsors/settings', {
        method: 'PUT',
        body: JSON.stringify({ sponsor_ad_seconds: seconds }),
      });
      formControl(form, 'sponsor_ad_seconds').value = String(saved.sponsor_ad_seconds);
      if (status) status.textContent = `Homepage fly-in will close after ${saved.sponsor_ad_seconds} seconds.`;
    } catch (error) {
      if (status) status.textContent = `Could not save ad timing: ${error.message}`;
    }
  });

  document.querySelector('#new-sponsor')?.addEventListener('click', () => {
    resetSponsorForm(document.querySelector('#sponsor-form'));
    document.querySelector('#sponsor-status').textContent = 'Creating a new sponsor.';
    formControl(document.querySelector('#sponsor-form'), 'name')?.focus();
  });

  document.querySelector('#contact-topic-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#contact-topic-status');
    const payload = formPayload(form);
    payload.active = Boolean(form.elements.active?.checked);
    const id = String(payload.id || '').trim();
    delete payload.id;
    delete payload.sort_order;
    if (!payload.label?.trim()) {
      if (status) status.textContent = 'Topic label is required.';
      return;
    }
    if (!payload.email?.trim()) {
      if (status) status.textContent = 'Delivery email is required.';
      return;
    }
    try {
      await jsonFetch(id ? `/api/admin/contact/topics/${id}` : '/api/admin/contact/topics', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      if (status) status.textContent = id ? 'Topic updated.' : 'Topic created.';
      form.reset();
      formControl(form, 'id').value = '';
      form.elements.active.checked = true;
      await loadContactTopics();
    } catch (error) {
      if (status) status.textContent = `Could not save topic: ${error.message}`;
    }
  });

  document.querySelector('#new-contact-topic')?.addEventListener('click', () => {
    const form = document.querySelector('#contact-topic-form');
    form.reset();
    formControl(form, 'id').value = '';
    form.elements.active.checked = true;
    document.querySelector('#contact-topic-status').textContent = 'Creating a new contact topic.';
    formControl(form, 'label')?.focus();
  });

  document.querySelector('#user-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#user-status');
    const payload = formPayload(form);
    payload.username = String(payload.username || '').trim();
    payload.display_name = String(payload.display_name || '').trim();
    payload.password = String(payload.password || '');
    if (!payload.username) {
      status.textContent = 'Username is required.';
      return;
    }
    if (!payload.display_name) {
      status.textContent = 'Display name is required.';
      return;
    }
    const id = payload.id;
    if (!id && !payload.password) {
      status.textContent = 'Password is required for new users.';
      return;
    }
    if (payload.password && payload.password.length < 8) {
      status.textContent = 'Password must be at least 8 characters.';
      return;
    }
    payload.permissions = [...form.querySelectorAll('input[name="permissions"]:checked')].map(input => input.value);
    delete payload.id;
    if (!payload.password) delete payload.password;
    status.textContent = 'Saving…';
    try {
      await jsonFetch(id ? `/api/admin/users/${id}` : '/api/admin/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      status.textContent = 'User saved.';
      form.reset();
      form.elements.active.checked = true;
      form.querySelectorAll('input[name="permissions"]').forEach(input => { input.checked = false; });
      await loadUsers();
    } catch (error) {
      let message = 'Could not save user.';
      try {
        const parsed = JSON.parse(String(error.message || ''));
        if (parsed?.detail) message = parsed.detail;
      } catch {
        if (error?.message) message = error.message;
      }
      status.textContent = message;
    }
  });

  document.querySelector('#new-user')?.addEventListener('click', () => {
    const form = document.querySelector('#user-form');
    form.reset();
    form.elements.active.checked = true;
    form.querySelectorAll('input[name="permissions"]').forEach(input => input.checked = false);
  });

  document.querySelector('#event-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#event-status');
    if (status) status.textContent = 'Saving…';
    try {
      const payload = formPayload(form);
      Object.assign(payload, collectEventRepeatPayload(form));
      payload.event_year = Number(payload.event_year || defaultEventYear());
      payload.show_on_boosters = payload.repeat_enabled ? 0 : (String(payload.show_on_boosters || '0') === '1' ? 1 : 0);
      const id = String(payload.event_id || payload.id || '').trim();
      delete payload.event_id;
      delete payload.id;
      delete payload.sort_order;
      delete payload.repeat_day;
      delete payload.repeat_month;
      if (richTextIsEmpty(payload.title) || richTextIsEmpty(payload.description)) {
        if (status) status.textContent = 'Title and description are required.';
        return;
      }
      if (!Number.isFinite(payload.event_year) || payload.event_year < 2000 || payload.event_year > 2100) {
        if (status) status.textContent = 'Enter a valid year (2000–2100).';
        return;
      }
      if (payload.repeat_enabled) {
        if (!payload.repeat_days.length || !payload.repeat_months.length) {
          if (status) status.textContent = 'Choose at least one weekday and one month for repeating events.';
          return;
        }
      } else if (!payload.date_label || !payload.date_detail) {
        if (status) status.textContent = 'Month and day are required.';
        return;
      }
      await jsonFetch(id ? `/api/admin/events/${id}` : '/api/admin/events', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      if (status) status.textContent = id ? 'Event updated.' : 'Event created.';
      form.reset();
      clearFormRichEditors(form);
      formControl(form, 'event_id').value = '';
      formControl(form, 'date_label').value = 'Aug';
      formControl(form, 'date_detail').value = '01';
      formControl(form, 'event_year').value = String(defaultEventYear());
      setEventBoosterPlacement(form, 0);
      resetEventRepeatFields(form);
      await loadEvents();
    } catch (error) {
      if (status) status.textContent = `Could not save event: ${error.message}`;
    }
  });

  document.querySelector('#event-form [data-repeat-enabled]')?.addEventListener('change', (event) => {
    syncEventRepeatUi(event.currentTarget.form);
  });
  syncEventRepeatUi(document.querySelector('#event-form'));
  document.querySelector('#event-exception-add')?.addEventListener('click', () => {
    const input = document.querySelector('[data-exception-date]');
    const value = String(input?.value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const status = document.querySelector('#event-status');
      if (status) status.textContent = 'Choose a valid exception date.';
      return;
    }
    if (!eventExceptionDates.includes(value)) eventExceptionDates.push(value);
    if (input) input.value = '';
    renderEventExceptionsList();
  });

  document.querySelector('#new-event')?.addEventListener('click', () => {
    const form = document.querySelector('#event-form');
    form.reset();
    clearFormRichEditors(form);
    formControl(form, 'event_id').value = '';
    formControl(form, 'date_label').value = 'Aug';
    formControl(form, 'date_detail').value = '01';
    formControl(form, 'event_year').value = String(defaultEventYear());
    setEventBoosterPlacement(form, 0);
    resetEventRepeatFields(form);
    const status = document.querySelector('#event-status');
    if (status) status.textContent = 'Creating a new event.';
    form.querySelector('[data-rich-input="title"]')?.focus();
  });

  document.querySelector('#photo-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#photo-status');
    syncFormRichEditors(form);
    const photoId = String(formControl(form, 'photo_id')?.value || '').trim();
    const altText = String(formControl(form, 'alt_text')?.value || '').trim();
    const caption = String(formControl(form, 'caption')?.value || '').trim();
    const file = form.elements.file?.files?.[0];
    if (!altText) {
      status.textContent = 'Alt text is required.';
      return;
    }
    if (photoId) {
      status.textContent = 'Saving photo…';
      try {
        await jsonFetch(`/api/admin/photos/${photoId}`, {
          method: 'PUT',
          body: JSON.stringify({ alt_text: altText, caption }),
        });
        resetPhotoForm();
        await loadPhotos();
        status.textContent = 'Photo updated.';
      } catch (error) {
        status.textContent = `Could not save photo: ${error.message || 'Unknown error'}`;
      }
      return;
    }
    if (!file) {
      status.textContent = 'Choose a photo file first.';
      return;
    }
    const sizeKb = Math.max(1, Math.round(Number(file.size || 0) / 1024));
    status.textContent = `Uploading ${file.name || 'photo'} (${sizeKb} KB)…`;
    try {
      await jsonFetch('/api/admin/photos', { method: 'POST', body: new FormData(form) });
      resetPhotoForm();
      await loadPhotos();
      status.textContent = 'Photo uploaded.';
    } catch (error) {
      const detail = String(error?.message || '').trim() || 'Unknown error';
      status.textContent = `Photo upload failed: ${detail}`;
      console.error('Photo upload failed', { name: file.name, type: file.type, size: file.size, error });
    }
  });

  document.querySelector('#new-photo')?.addEventListener('click', () => {
    resetPhotoForm();
    document.querySelector('#photo-form [data-rich-input="caption"]')?.focus();
  });
}

bindFormRichEditors();
bindPageVisualEditor();
bindPageEditorResizer();
bindForms();
bindMailComposer();
bindMinutesPanel();
bindEnsemblesBodyPanel();
refreshAll()
  .then(() => {
    applyZernioQueryFeedback();
  })
  .catch(error => {
  console.error(error);
  document.body.insertAdjacentHTML('afterbegin', `<div class="admin-card error">CMS failed to load: ${escapeHtml(error.message)}</div>`);
});

/* hero-rich-formatting: 20260802-49 */
