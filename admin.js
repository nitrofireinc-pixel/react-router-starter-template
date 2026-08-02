function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
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
  return response.json();
}

const state = { me: null, pages: [], users: [], mailRecipients: [], events: [], photos: [], sponsors: [], staff: [], contactTopics: [], contactMessages: [], site: null, utilityLinks: [], homeBodyHtml: '' };

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

function hasPermission(scope) {
  if (!state.me?.user) return false;
  if (state.me.user.role === 'admin') return true;
  return state.me.user.permissions.includes(scope) || state.me.user.permissions.includes('all');
}

function canManageAllEvents() {
  return hasPermission('events:manage');
}

function canCreateEvents() {
  return hasPermission('events') || canManageAllEvents();
}

function canMutateEvent(event) {
  if (canManageAllEvents()) return true;
  if (!hasPermission('events')) return false;
  return Number(event?.created_by) === Number(state.me?.user?.id);
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

function canEditContact() {
  return hasPermission('contact') || canEditPage('contact');
}

function canSendMail() {
  return hasPermission('mail');
}

function formControl(form, name) {
  if (!form || !name) return null;
  return form.querySelector(`[name="${CSS.escape(name)}"]`) || form.elements.namedItem?.(name) || null;
}

function fillForm(form, data) {
  if (!form) return;
  for (const [key, value] of Object.entries(data || {})) {
    const control = formControl(form, key);
    if (!control || control.type === 'file') continue;
    if (control.type === 'checkbox') control.checked = Boolean(Number(value) || value === true);
    else control.value = value ?? '';
  }
}

function formPayload(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  const active = formControl(form, 'active');
  if (active) payload.active = Boolean(active.checked);
  const homepageAd = formControl(form, 'homepage_ad');
  if (homepageAd) payload.homepage_ad = Boolean(homepageAd.checked);
  const maintenanceMode = formControl(form, 'maintenance_mode');
  if (maintenanceMode) payload.maintenance_mode = Boolean(maintenanceMode.checked);
  return payload;
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

function sanitizeRichHtml(dirty) {
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

function sanitizeInlineRichHtml(dirty) {
  let html = String(dirty || '')
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

function formatInlineRichText(value, fallback = '') {
  const raw = String(value ?? '');
  const source = raw.trim() ? raw : String(fallback || '');
  if (!source.trim()) return '';
  return looksLikeInlineRichHtml(source) ? sanitizeInlineRichHtml(source) : escapeHtml(source);
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
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractHomeFeatureCardsFromHtml(html = '') {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const root = template.content;
  const boosters = root.querySelector('[data-cms-block="home-boosters"], .accent-card');
  const launch = root.querySelector('[data-cms-block="home-launch"]')
    || boosters?.parentElement?.querySelector('article.card:not(.accent-card)');
  const textOf = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const boostersLink = boosters?.querySelector('a.btn.secondary, a.btn');
  return {
    boosters_tag: textOf(boosters?.querySelector('.tag, [data-cms-field="boosters_tag"]')) || DEFAULT_HOME_FEATURE_CARDS.boosters_tag,
    boosters_heading: textOf(boosters?.querySelector('h3, [data-cms-field="boosters_heading"]')) || DEFAULT_HOME_FEATURE_CARDS.boosters_heading,
    boosters_body: textOf(boosters?.querySelector('h3 + p, [data-cms-field="boosters_body"]')) || DEFAULT_HOME_FEATURE_CARDS.boosters_body,
    boosters_button: textOf(boostersLink || boosters?.querySelector('[data-cms-field="boosters_button"]')) || DEFAULT_HOME_FEATURE_CARDS.boosters_button,
    boosters_href: String(boostersLink?.getAttribute('href') || DEFAULT_HOME_FEATURE_CARDS.boosters_href).trim() || DEFAULT_HOME_FEATURE_CARDS.boosters_href,
    launch_tag: textOf(launch?.querySelector('.tag, [data-cms-field="launch_tag"]')) || DEFAULT_HOME_FEATURE_CARDS.launch_tag,
    launch_heading: textOf(launch?.querySelector('h3, [data-cms-field="launch_heading"]')) || DEFAULT_HOME_FEATURE_CARDS.launch_heading,
    launch_body: textOf(launch?.querySelector('h3 + p:not(.draft), [data-cms-field="launch_body"]')) || DEFAULT_HOME_FEATURE_CARDS.launch_body,
    launch_footer: textOf(launch?.querySelector('.draft, [data-cms-field="launch_footer"]')) || DEFAULT_HOME_FEATURE_CARDS.launch_footer,
  };
}

function homeFeatureCardsFromForm(payload = {}) {
  const cards = {};
  for (const key of HOME_FEATURE_CARD_KEYS) {
    const value = String(payload[key] ?? DEFAULT_HOME_FEATURE_CARDS[key] ?? '').replace(/\s+/g, ' ').trim();
    cards[key] = value || DEFAULT_HOME_FEATURE_CARDS[key];
  }
  return cards;
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
      ...extractHomeFeatureCardsFromHtml(page.body_html),
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
            : 'standard');
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
          : textFromHtml(page.body_html)),
    callout_title: inlineHtmlFromNode(calloutTitleNode) || '',
    callout_text: calloutTextNode
      ? richHtmlFromNode(calloutTextNode)
      : (callout?.querySelector('p') ? `<p>${escapeHtml(callout.querySelector('p').textContent.trim())}</p>` : paragraphsFromNode(callout)),
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
    .map(part => part.trim())
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
};

const HOME_FEATURE_SECTION_RE = /<section(?:\s+data-cms-home-cards)?[^>]*>\s*<div class="wrap grid two">\s*<article[^>]*(?:accent-card|home-boosters)[^>]*>[\s\S]*?<\/article>\s*<article[^>]*(?:home-launch|class="card")[^>]*>[\s\S]*?<\/article>\s*<\/div>\s*<\/section>/i;

function buildEditableHomeFeatureSection(cards = {}) {
  const c = homeFeatureCardsFromForm(cards);
  return `<section data-cms-home-cards>
  <div class="wrap grid two">
    <article class="card accent-card" data-cms-block="home-boosters">
      ${editableField('boosters_tag', 'span', c.boosters_tag, 'Tag', 'tag')}
      ${editableField('boosters_heading', 'h3', c.boosters_heading, 'Heading')}
      ${editableField('boosters_body', 'p', c.boosters_body, 'Body text')}
      <p style="margin-top:18px" class="cms-home-button-row">
        <a class="btn secondary cms-edit-field cms-edit-rich cms-edit-inline" href="${escapeAttr(c.boosters_href)}" data-cms-field="boosters_button" data-edit-label="Boosters button" contenteditable="true" role="textbox" spellcheck="true" aria-label="Boosters button">${escapeHtml(c.boosters_button)}</a>
      </p>
      <label class="cms-home-href-field">Button link URL<input type="text" data-home-href-input value="${escapeAttr(c.boosters_href)}" placeholder="boosters.html"></label>
    </article>
    <article class="card" data-cms-block="home-launch">
      ${editableField('launch_tag', 'span', c.launch_tag, 'Tag', 'tag')}
      ${editableField('launch_heading', 'h3', c.launch_heading, 'Heading')}
      ${editableField('launch_body', 'p', c.launch_body, 'Body text')}
      ${editableField('launch_footer', 'p', c.launch_footer, 'Footer note', 'draft')}
    </article>
  </div>
</section>`;
}

function buildEditableHomePreview(payload = {}) {
  const section = buildEditableHomeFeatureSection(payload);
  const base = String(state.homeBodyHtml || '').trim();
  if (!base) {
    return `<div class="cms-home-preview-note"><p class="kicker">Home page</p><h2>Feature cards</h2><p>Edit the Boosters and Launch note cards below. Hero copy is managed in Site Settings.</p></div>${section}`;
  }
  if (HOME_FEATURE_SECTION_RE.test(base)) return base.replace(HOME_FEATURE_SECTION_RE, section);
  if (/accent-card|home-boosters/i.test(base)) {
    return base.replace(
      /<article[^>]*(?:accent-card|home-boosters)[^>]*>[\s\S]*?<\/article>\s*<article[^>]*>[\s\S]*?<\/article>/i,
      () => {
        const inner = section.match(/<div class="wrap grid two">([\s\S]*?)<\/div>/i);
        return inner ? inner[1].trim() : section;
      }
    );
  }
  return `${base}\n${section}`;
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
  const heroClass = layout === 'sponsors' ? 'page-hero sponsor-hero' : 'page-hero';
  const hero = `<section class="${heroClass}" data-cms-layout="${escapeAttr(layout)}"><div class="page-title">${editableField('kicker', 'div', kicker, 'Small label', 'kicker')}${editableField('heading', 'h1', heading, 'Page heading')}${editableField('intro', 'p', intro, 'Short intro sentence')}</div></section>`;
  const eventsPlaceholder = layout === 'calendar'
    ? '<div class="timeline cms-events-placeholder" data-events data-limit="5"><article class="event"><div class="datebox">Aug<span>01</span></div><div><h3>Events appear here</h3><p>Manage real calendar items in the Calendar Events tab.</p></div></article></div>'
    : '';
  const sponsorsCallout = showCallout
    ? `<aside class="sponsor-cta cms-edit-block" data-cms-block="callout"><div class="cms-edit-block-bar"><span>Sponsor callout</span><button type="button" class="cms-edit-remove" data-remove-callout>Remove</button></div><div><span class="sponsor-level">Sponsor opportunities</span>${editableField('callout_title', 'h2', calloutTitle || 'Sponsor opportunities', 'Callout title')}${editableRichField('callout_text', calloutText, 'Callout details')}</div><a class="btn secondary" href="contact.html">Ask about sponsoring</a></aside>`
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
    return `${hero}<section class="content sponsor-content"><div class="wrap"><div class="sponsor-intro">${editableRichField('body_text', body || '<div class="kicker">Thank you</div><h2>Community support takes center stage.</h2><p>Our sponsors help provide instruments, instruction, travel, meals, uniforms, and unforgettable performance opportunities.</p>', 'Sponsor intro content')}<a class="btn primary" href="contact.html">Become a sponsor</a></div><div class="sponsor-directory cms-sponsors-placeholder" data-sponsors><article class="sponsor-card"><span class="sponsor-mark">★</span><div><span class="sponsor-level">Sponsor directory</span><h3>Managed in Sponsors</h3><p>Logos, names, and addresses appear here on the public page.</p></div></article></div>${sponsorsCallout}</div></section>`;
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

function pageSnapshotFromPayload(payload) {
  const keys = [
    'original_slug', 'title', 'slug', 'path', 'nav_order', 'layout', 'active',
    'kicker', 'heading', 'intro', 'body_text', 'callout_title', 'callout_text',
    ...HOME_FEATURE_CARD_KEYS,
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
    return pageSnapshotFromPayload(pagePayload(form));
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
  const hrefInput = document.querySelector('#page-preview [data-home-href-input]');
  if (hrefInput && form.elements.boosters_href) {
    form.elements.boosters_href.value = hrefInput.value.trim();
  }
  const payload = pagePayload(form);
  const original = payload.original_slug;
  delete payload.original_slug;
  const isHomeSave = original === 'home' || payload.slug === 'home' || payload.layout === 'home';
  if (!isHomeSave && !plainTextFromHtml(payload.heading)) {
    if (status) status.textContent = 'Add a page heading in the live preview before saving.';
    document.querySelector('#page-preview [data-cms-field="heading"]')?.focus();
    return false;
  }
  if (isHomeSave && !plainTextFromHtml(payload.heading)) payload.heading = 'Home';
  if (status) status.textContent = 'Saving…';
  try {
    await jsonFetch(original ? `/api/admin/pages/${original}` : '/api/admin/pages', {
      method: original ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
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
  // Toolbar stays docked above the preview while editing; highlight when a rich field is active.
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
    preview.innerHTML = buildEditablePagePreview(payload);
    const chip = document.querySelector('[data-page-layout-chip]');
    if (chip) chip.textContent = layoutChipLabel(payload.layout);
    bindPagePreviewInteractions(preview);
  } finally {
    pageEditor.rebuilding = false;
  }
}

function bindPagePreviewInteractions(preview) {
  preview.querySelectorAll('[data-cms-field]').forEach(field => {
    field.addEventListener('input', () => syncFieldFromPreview(field));
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
  const hrefInput = preview.querySelector('[data-home-href-input]');
  if (hrefInput) {
    hrefInput.addEventListener('input', () => {
      const form = document.querySelector('#page-form');
      if (form?.elements?.boosters_href) form.elements.boosters_href.value = hrefInput.value.trim();
      const button = preview.querySelector('[data-cms-field="boosters_button"]');
      if (button) button.setAttribute('href', hrefInput.value.trim() || '#');
      refreshPageDirtyState();
    });
  }
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
    if (['kicker', 'heading', 'intro', 'body_text', 'callout_title', 'callout_text', ...HOME_FEATURE_CARD_KEYS].includes(name)) {
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
    const field = event.target.closest?.('[data-cms-field]');
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
      document.execCommand('styleWithCSS', false, true);
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

  const logoutForm = document.querySelector('form[action="/admin/logout"]');
  logoutForm?.addEventListener('submit', async event => {
    if (logoutForm.dataset.forceLogout === '1') return;
    event.preventDefault();
    if (!(await confirmLeavePageEditor())) return;
    logoutForm.dataset.forceLogout = '1';
    logoutForm.submit();
  });
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
  const sourceButtons = [...document.querySelectorAll('.admin-menu button')].filter(button => !button.hidden);
  if (!menu) return;
  menu.innerHTML = sourceButtons.map((button, index) => {
    const label = button.textContent.trim();
    const tab = button.dataset.tab || '';
    const shortcut = button.dataset.editShortcut || '';
    return `<button type="button" data-mobile-index="${index}" data-tab="${escapeHtml(tab)}" data-edit-shortcut="${escapeHtml(shortcut)}">${escapeHtml(label)}</button>`;
  }).join('');
  menu.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.mobileIndex);
      const source = sourceButtons[index];
      closeAdminNav();
      source?.click();
    });
  });
}

function activateTab(name) {
  const pagesPanel = document.querySelector('#tab-pages');
  const leavingPages = Boolean(pagesPanel && !pagesPanel.hidden && name !== 'pages');
  const apply = () => {
    document.querySelectorAll('.cms-panel').forEach(panel => { panel.hidden = true; });
    document.querySelector(`#tab-${name}`)?.removeAttribute('hidden');
    document.querySelectorAll('.admin-menu button').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === name && !button.dataset.editShortcut);
    });
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
  document.querySelectorAll('.admin-menu button').forEach(button => button.classList.toggle('active', button.dataset.editShortcut === slug));
  closeAdminNav();
}

async function ensureFullPagesLoaded() {
  if (!state.pages.some(page => page.body_html !== undefined)) await loadPages();
}

function pageLabel(slug) {
  return ({ home: 'Home', directors: 'Directors & Staff', resources: 'Student Resources' }[slug]) || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function showAllowedPanels() {
  const displayName = state.me.user.display_name || state.me.user.username;
  document.querySelector('#current-user').innerHTML = `<b>${escapeHtml(displayName)}</b><span>${state.me.user.role === 'admin' ? 'Super Admin' : 'Editor'}</span>`;

  const panels = {
    dashboard: true,
    pages: state.pages.some(canEditPage),
    sponsors: canEditSponsors(),
    staff: canEditStaff(),
    contact: canEditContact(),
    site: hasPermission('site'),
    users: hasPermission('users'),
    mail: canSendMail(),
    events: canCreateEvents() || canEditPage('calendar'),
    photos: hasPermission('photos'),
  };
  document.querySelectorAll('.admin-menu > [data-tab]').forEach(button => {
    const allowed = button.dataset.tab === 'dashboard' || panels[button.dataset.tab];
    button.hidden = !allowed;
    button.onclick = () => activateTab(button.dataset.tab);
  });
  document.querySelectorAll('[data-edit-shortcut]').forEach(button => {
    const slug = button.dataset.editShortcut;
    button.hidden = !state.pages.find(page => page.slug === slug && canEditPage(page));
    button.onclick = () => editPage(slug);
  });
  const newPageButton = document.querySelector('#new-page');
  if (newPageButton) newPageButton.hidden = true;
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
  const editSponsorsPage = document.querySelector('#edit-sponsors-page');
  if (editSponsorsPage) {
    editSponsorsPage.hidden = !canEditPage('sponsors');
    editSponsorsPage.onclick = () => editPage('sponsors');
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
  state.pages = state.me.pages;
  renderPagePermissionBoxes();
  showAllowedPanels();
}

async function loadSite() {
  if (!hasPermission('site')) return;
  state.site = await jsonFetch('/api/site');
  fillForm(document.querySelector('#site-form'), state.site);
  await loadUtilityLinksEditor();
}

async function loadPages() {
  if (!state.pages.some(canEditPage)) return;
  state.pages = await jsonFetch('/api/admin/pages');
  document.querySelectorAll('[data-edit-shortcut]').forEach(button => {
    const slug = button.dataset.editShortcut;
    button.hidden = !state.pages.find(page => page.slug === slug && canEditPage(page));
  });
  renderMobileAdminMenu();
  renderPagePermissionBoxes();
}

function renderDashboard() {
  const dashboard = document.querySelector('#dashboard-cards');
  if (!dashboard) return;
  const displayName = state.me.user.display_name || state.me.user.username;
  const welcome = document.querySelector('#dashboard-welcome');
  if (welcome) welcome.textContent = `Welcome back, ${displayName}`;

  // Page edit shortcuts live in the left nav, so omit page cards here. Remaining cards respect assigned permissions.
  const cards = [
    canEditStaff() && ['Directors & Staff', 'Add staff photos, names, roles, and short descriptions.', 'staff', 'People'],
    canEditSponsors() && ['Sponsors', 'Add, edit, and reorder sponsor logos, names, and addresses.', 'sponsors', 'Community'],
    canEditContact() && ['Contact Form', 'Edit topics and the email each contact topic delivers to.', 'contact', 'Connect'],
    hasPermission('users') && ['User Management', 'Create editor accounts and assign page-level permissions.', 'users', 'Administration'],
    canSendMail() && ['Staff Email', 'Send rich-text emails with attachments to CMS users.', 'mail', 'Administration'],
    canCreateEvents() && ['Calendar Events', 'Add events you own, or manage all events if granted elevated access.', 'events', 'Program'],
  ].filter(Boolean);

  dashboard.innerHTML = cards.length
    ? cards.map(([title, text, target, kicker]) => `<button class="dash-card" type="button" data-dash-target="${target}"><span>${kicker}</span><b>${title}</b><small>${text}</small></button>`).join('')
    : '<p class="draft">No dashboard tools are available for your account. Use the page shortcuts in the left navigation.</p>';
  dashboard.querySelectorAll('[data-dash-target]').forEach(button => button.addEventListener('click', () => {
    activateTab(button.dataset.dashTarget);
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
    const contactHint = form.querySelector('[data-contact-hint]');
    if (contactHint) contactHint.hidden = page.slug !== 'contact';
    form.querySelector('[data-home-hint]').hidden = !isHomePage;
    form.elements.active.checked = Boolean(page.active);
    if (form.elements.layout) {
      form.elements.layout.value = isHomePage ? 'home' : (form.elements.layout.value || 'standard');
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
  box.innerHTML = state.pages.map(page => `<label class="checkline"><input type="checkbox" name="permissions" value="page:${escapeHtml(page.slug)}"> ${escapeHtml(page.title)}</label>`).join('');
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

function staffPreviewCard(member) {
  const photo = member.photo_url
    ? `<div class="avatar"><img src="${escapeHtml(member.photo_url)}" alt="${escapeHtml(member.name)}"></div>`
    : '<div class="avatar" aria-hidden="true"></div>';
  return `<article class="person">${photo}<div class="person-copy"><h3>${escapeHtml(member.name)}</h3>${member.role ? `<p class="person-role">${escapeHtml(member.role)}</p>` : ''}${member.bio ? `<p>${escapeHtml(member.bio)}</p>` : ''}</div></article>`;
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
      <div><b>${escapeHtml(member.name)}</b><span>${escapeHtml(member.role || 'Staff')}</span><small>${escapeHtml(member.bio || 'No description')} · ${member.active ? 'Active' : 'Hidden'}</small></div>
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
  return `<article class="sponsor-card${featured}">${mark}<div><span class="sponsor-level">${escapeHtml(sponsor.level || 'Sponsor')}</span><h3>${escapeHtml(sponsor.name)}</h3>${formatted ? `<p class="sponsor-address">${escapeHtml(formatted)}</p>` : ''}</div></article>`;
}

function resetSponsorForm(form) {
  if (!form) return;
  form.reset();
  formControl(form, 'id').value = '';
  formControl(form, 'city').value = 'Kernersville';
  setSelectValue(formControl(form, 'state'), 'NC');
  form.elements.active.checked = true;
  if (form.elements.homepage_ad) form.elements.homepage_ad.checked = false;
  form.elements.level.value = 'Community Sponsor';
  form.elements.sort_order.value = String((state.sponsors?.length || 0) + 1);
}

function renderSponsors() {
  const list = document.querySelector('#sponsors-list');
  const ordered = [...state.sponsors].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  list.innerHTML = ordered.map((sponsor, index) => `
    <article class="admin-row sponsor-admin-row">
      <span class="drag-handle">☰</span>
      <div class="mini-logo">${sponsor.logo_url ? `<img src="${escapeHtml(sponsor.logo_url)}" alt="">` : escapeHtml(sponsor.mark_text || '★')}</div>
      <div><b>${escapeHtml(sponsor.name)}</b><span>${escapeHtml(formatAdminSponsorAddress(sponsor) || 'No address')}</span><small>${escapeHtml(sponsor.level || 'Sponsor')} · order ${sponsor.sort_order} · ${sponsor.active ? 'Active' : 'Hidden'}${Number(sponsor.homepage_ad) ? ' · Homepage ad' : ''}</small></div>
      <div class="row-actions"><button data-move-sponsor="${sponsor.id}" data-direction="up" ${index === 0 ? 'disabled' : ''}>↑</button><button data-move-sponsor="${sponsor.id}" data-direction="down" ${index === ordered.length - 1 ? 'disabled' : ''}>↓</button><button data-edit-sponsor="${sponsor.id}">Edit</button><button data-delete-sponsor="${sponsor.id}">Delete</button></div>
    </article>
  `).join('');
  document.querySelector('#sponsor-preview').innerHTML = ordered.filter(s => s.active).map(sponsorPreviewCard).join('') || '<p class="draft">No active sponsors yet.</p>';
  list.querySelectorAll('[data-edit-sponsor]').forEach(button => button.addEventListener('click', () => {
    const sponsor = state.sponsors.find(item => item.id === Number(button.dataset.editSponsor));
    const form = document.querySelector('#sponsor-form');
    fillForm(form, {
      ...sponsor,
      city: sponsor.city || 'Kernersville',
      state: sponsor.state || 'NC',
    });
    setSelectValue(formControl(form, 'state'), sponsor.state || 'NC');
    form.elements.active.checked = Boolean(Number(sponsor.active));
    if (form.elements.homepage_ad) form.elements.homepage_ad.checked = Boolean(Number(sponsor.homepage_ad));
  }));
  list.querySelectorAll('[data-delete-sponsor]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this sponsor?')) return;
    await jsonFetch(`/api/admin/sponsors/${button.dataset.deleteSponsor}`, { method: 'DELETE' });
    await loadSponsors();
  }));
  list.querySelectorAll('[data-move-sponsor]').forEach(button => button.addEventListener('click', async () => moveSponsor(Number(button.dataset.moveSponsor), button.dataset.direction)));
}

async function moveSponsor(id, direction) {
  const ordered = [...state.sponsors].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const index = ordered.findIndex(sponsor => sponsor.id === id);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
  const current = ordered[index];
  const swap = ordered[swapIndex];
  await jsonFetch(`/api/admin/sponsors/${current.id}`, { method: 'PUT', body: JSON.stringify({ ...current, sort_order: swap.sort_order }) });
  await jsonFetch(`/api/admin/sponsors/${swap.id}`, { method: 'PUT', body: JSON.stringify({ ...swap, sort_order: current.sort_order }) });
  await loadSponsors();
}

async function loadMailDeliveryStatus() {
  // Only surface a warning when delivery is not ready. Do not show a "Delivering with Resend" card.
  const status = document.querySelector('#mail-status');
  if (!status || !canSendMail()) return;
  try {
    const delivery = await jsonFetch('/api/admin/mail/delivery');
    if (delivery.configured) return;
    status.textContent = delivery.detail || 'Mail delivery is not configured.';
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
      <span><b>${escapeHtml(user.display_name || user.email)}</b><small>${escapeHtml(user.email)} · ${user.role === 'admin' ? 'Super Admin' : 'Editor'}</small></span>
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
      document.execCommand('styleWithCSS', false, true);
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

async function loadUsers() {
  if (!hasPermission('users')) return;
  state.users = await jsonFetch('/api/admin/users');
  const list = document.querySelector('#users-list');
  list.innerHTML = state.users.map(user => `
    <article class="admin-row">
      <div><b>${escapeHtml(user.display_name || user.username)}</b><span>${escapeHtml(user.username)} · ${user.role === 'admin' ? 'SUPER ADMIN' : 'EDITOR'}</span><small>${user.active ? 'Active' : 'Disabled'} · ${escapeHtml(user.permissions.join(', ') || 'no permissions')}</small></div>
      <div class="row-actions"><button data-edit-user="${user.id}">Edit</button>${user.id !== state.me.user.id ? `<button data-delete-user="${user.id}">Delete</button>` : ''}</div>
    </article>
  `).join('');
  list.querySelectorAll('[data-edit-user]').forEach(button => button.addEventListener('click', () => {
    const user = state.users.find(item => item.id === Number(button.dataset.editUser));
    const form = document.querySelector('#user-form');
    fillForm(form, { ...user, password: '' });
    form.querySelectorAll('input[name="permissions"]').forEach(input => input.checked = user.permissions.includes(input.value));
    form.elements.active.checked = Boolean(user.active);
  }));
  list.querySelectorAll('[data-delete-user]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this user?')) return;
    await jsonFetch(`/api/admin/users/${button.dataset.deleteUser}`, { method: 'DELETE' });
    await loadUsers();
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
      <div><b>${escapeHtml(event.date_label)} ${escapeHtml(event.date_detail)}, ${escapeHtml(event.event_year)}${isPastEventLocal(event) ? ' · Past' : ''}${Number(event.show_on_boosters) === 1 ? ' · Boosters' : ''}</b><span>${escapeHtml(event.title)}</span><small>${escapeHtml(event.description)}</small><small>Created by ${escapeHtml(creator)}</small></div>
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
    if (status) status.textContent = `Editing “${event.title}”. Save to update.`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formControl(form, 'title')?.focus();
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
  const list = document.querySelector('#photos-list');
  list.innerHTML = state.photos.map(photo => `
    <article class="admin-row photo-row">
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt_text)}">
      <div><b>${escapeHtml(photo.caption || photo.original_name)}</b><span>${escapeHtml(photo.alt_text)}</span></div>
      <div class="row-actions"><button data-delete-photo="${photo.id}">Delete</button></div>
    </article>
  `).join('');
  list.querySelectorAll('[data-delete-photo]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this photo?')) return;
    try {
      await jsonFetch(`/api/admin/photos/${button.dataset.deletePhoto}`, { method: 'DELETE' });
      await loadPhotos();
    } catch (error) {
      alert(error.message || 'Could not delete photo.');
    }
  }));
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

async function refreshAll() {
  await loadMe();
  await Promise.all([loadSite(), loadPages(), loadSponsors(), loadStaff(), loadUsers(), loadMailRecipients(), loadEvents(), loadPhotos(), loadContactTopics()]);
}

function bindForms() {
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
        upload.set('caption', payload.role || 'Directors & Staff');
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
    formControl(form, 'staff_id').value = '';
    formControl(form, 'active').checked = true;
    document.querySelector('#staff-status').textContent = 'Creating a new staff member.';
    formControl(form, 'name')?.focus();
  });

  document.querySelector('#sponsor-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formPayload(form);
    payload.sort_order = Number(payload.sort_order || state.sponsors.length + 1);
    payload.homepage_ad = Boolean(form.elements.homepage_ad?.checked);
    payload.city = String(payload.city || 'Kernersville').trim() || 'Kernersville';
    payload.state = String(payload.state || 'NC').trim() || 'NC';
    const id = payload.id;
    delete payload.id;
    await jsonFetch(id ? `/api/admin/sponsors/${id}` : '/api/admin/sponsors', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    document.querySelector('#sponsor-status').textContent = 'Sponsor saved. The public Sponsors page updates automatically.';
    resetSponsorForm(form);
    await loadSponsors();
  });

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
      payload.event_year = Number(payload.event_year || defaultEventYear());
      payload.show_on_boosters = String(payload.show_on_boosters || '0') === '1' ? 1 : 0;
      const id = String(payload.event_id || payload.id || '').trim();
      delete payload.event_id;
      delete payload.id;
      delete payload.sort_order;
      if (!payload.title?.trim() || !payload.description?.trim()) {
        if (status) status.textContent = 'Title and description are required.';
        return;
      }
      if (!Number.isFinite(payload.event_year) || payload.event_year < 2000 || payload.event_year > 2100) {
        if (status) status.textContent = 'Enter a valid year (2000–2100).';
        return;
      }
      await jsonFetch(id ? `/api/admin/events/${id}` : '/api/admin/events', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      if (status) status.textContent = id ? 'Event updated.' : 'Event created.';
      form.reset();
      formControl(form, 'event_id').value = '';
      formControl(form, 'date_label').value = 'Aug';
      formControl(form, 'date_detail').value = '01';
      formControl(form, 'event_year').value = String(defaultEventYear());
      setEventBoosterPlacement(form, 0);
      await loadEvents();
    } catch (error) {
      if (status) status.textContent = `Could not save event: ${error.message}`;
    }
  });

  document.querySelector('#new-event')?.addEventListener('click', () => {
    const form = document.querySelector('#event-form');
    form.reset();
    formControl(form, 'event_id').value = '';
    formControl(form, 'date_label').value = 'Aug';
    formControl(form, 'date_detail').value = '01';
    formControl(form, 'event_year').value = String(defaultEventYear());
    setEventBoosterPlacement(form, 0);
    const status = document.querySelector('#event-status');
    if (status) status.textContent = 'Creating a new event.';
    formControl(form, 'title')?.focus();
  });

  document.querySelector('#photo-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#photo-status');
    status.textContent = 'Uploading...';
    try {
      await jsonFetch('/api/admin/photos', { method: 'POST', body: new FormData(form) });
      form.reset();
      await loadPhotos();
      status.textContent = 'Photo uploaded.';
    } catch (error) {
      status.textContent = 'Photo upload failed. Try a JPG, PNG, WEBP, or GIF under 1.5 MB.';
      console.error(error);
    }
  });
}

bindPageVisualEditor();
bindPageEditorResizer();
bindForms();
bindMailComposer();
refreshAll().catch(error => {
  console.error(error);
  document.body.insertAdjacentHTML('afterbegin', `<div class="admin-card error">CMS failed to load: ${escapeHtml(error.message)}</div>`);
});

/* hero-rich-formatting: 20260802-49 */
