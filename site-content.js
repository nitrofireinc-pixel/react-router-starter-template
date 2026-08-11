function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}


function showTransientToast(message, { className = 'sponsor-signup-toast', ms = 4200, leaveMs = 280 } = {}) {
  const toast = document.createElement('div');
  toast.className = className;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), leaveMs);
  }, ms);
}

function loadSquareWebSdk(environment = 'production') {
  const existing = document.querySelector('script[data-square-web-sdk]');
  if (existing && window.Square) return Promise.resolve(window.Square);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.squareWebSdk = '1';
    script.src = environment === 'sandbox'
      ? 'https://sandbox.web.squarecdn.com/v1/square.js'
      : 'https://web.squarecdn.com/v1/square.js';
    script.onload = () => (window.Square ? resolve(window.Square) : reject(new Error('Square.js failed to load')));
    script.onerror = () => reject(new Error('Could not load Square payment form'));
    document.head.appendChild(script);
  });
}

function playOverlayEnter(root) {
  if (!root) return;
  root.classList.remove('is-leaving');
  root.classList.remove('is-visible');
  void root.offsetWidth;
  root.classList.add('is-visible');
}

function playOverlayLeave(root, { ms = 280, hide = false, onDone } = {}) {
  if (!root) return null;
  root.classList.add('is-leaving');
  root.classList.remove('is-visible');
  return window.setTimeout(() => {
    root.classList.remove('is-leaving');
    if (hide) root.hidden = true;
    onDone?.(root);
  }, ms);
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

function paragraphsFromText(value) {
  return String(value || '')
    .split(/\n\s*\n/)
    .map((part) => decodeBasicHtmlEntities(part).trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join('') || (String(value || '').trim() ? `<p>${escapeHtml(decodeBasicHtmlEntities(String(value).trim()))}</p>` : '');
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

function isHomePage() {
  const path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  return path === '/' || path.endsWith('/index.html') || /(^|\/)index\.html$/i.test(path);
}

function pickRandomSponsor(sponsors) {
  if (!Array.isArray(sponsors) || !sponsors.length) return null;
  return sponsors[Math.floor(Math.random() * sponsors.length)];
}

function dismissSponsorAd(root) {
  if (!root) return;
  root.classList.add('is-leaving');
  root.classList.remove('is-visible');
  document.body.classList.remove('sponsor-flyin-open');
  window.setTimeout(() => root.remove(), 420);
}

function normalizeSponsorAdSeconds(value, fallback = 6) {
  const raw = Number(value);
  const base = Number.isFinite(raw) ? raw : Number(fallback);
  const seconds = Math.round(Number.isFinite(base) ? base : 6);
  return Math.min(30, Math.max(2, seconds));
}

function resolveSponsorTierKey(sponsor = {}) {
  const raw = String(sponsor.tier || sponsor.level || sponsor.tier_label || '').toLowerCase();
  if (/\bgold\b/.test(raw)) return 'gold';
  if (/\bsilver\b/.test(raw)) return 'silver';
  if (/\bbronze\b/.test(raw)) return 'bronze';
  return '';
}

function showHomepageSponsorAd(sponsor, durationSeconds = 6) {
  if (!sponsor || document.querySelector('.sponsor-flyin')) return;

  const tier = resolveSponsorTierKey(sponsor);
  const tierClass = tier ? ` tier-${tier}` : '';
  const logo = sponsor.logo_url
    ? `<span class="sponsor-flyin-logo"><img src="${escapeHtml(sponsor.logo_url)}" alt="${escapeHtml(sponsor.name)} logo"></span>`
    : `<span class="sponsor-flyin-mark" aria-hidden="true">${escapeHtml(sponsor.mark_text || '★')}</span>`;

  const root = document.createElement('aside');
  root.className = `sponsor-flyin${tierClass}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Featured sponsor');
  if (tier) root.dataset.sponsorTier = tier;
  root.innerHTML = `
    <button type="button" class="sponsor-flyin-backdrop" aria-label="Dismiss sponsor ad"></button>
    <div class="sponsor-flyin-panel">
      <button type="button" class="sponsor-flyin-close" aria-label="Close sponsor ad">×</button>
      <a class="sponsor-flyin-card" href="/sponsors.html">
        ${logo}
        <div class="sponsor-flyin-copy">
          <span class="sponsor-flyin-kicker">${escapeHtml(sponsor.tier_label || 'Community')} Partner</span>
          <strong>${escapeHtml(sponsor.name)}</strong>
          <span class="sponsor-flyin-tier">${escapeHtml(sponsor.level || 'Sponsor')}</span>
          <em>View all sponsors</em>
        </div>
      </a>
    </div>
  `;

  document.body.appendChild(root);
  document.body.classList.add('sponsor-flyin-open');
  requestAnimationFrame(() => root.classList.add('is-visible'));

  const close = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    dismissSponsorAd(root);
  };
  root.querySelector('.sponsor-flyin-close')?.addEventListener('click', close);
  root.querySelector('.sponsor-flyin-backdrop')?.addEventListener('click', close);

  const durationMs = normalizeSponsorAdSeconds(durationSeconds, 6) * 1000;
  window.setTimeout(() => {
    if (document.body.contains(root)) dismissSponsorAd(root);
  }, durationMs);
}

function sponsorShowsFlyin(sponsor = {}) {
  if (Number(sponsor.active) === 0) return false;
  if (sponsor.show_flyin === true || sponsor.show_flyin === 1) return true;
  const tier = String(sponsor.tier || sponsor.level || '').toLowerCase();
  return /\b(silver|gold)\b/.test(tier) || Number(sponsor.homepage_ad) === 1;
}

function sponsorShowsMarquee(sponsor = {}) {
  if (Number(sponsor.active) === 0) return false;
  if (sponsor.show_marquee === false || sponsor.show_marquee === 0) return false;
  const tier = String(sponsor.tier || sponsor.level || '').toLowerCase();
  return /\b(bronze|silver|gold)\b/.test(tier) || sponsor.show_marquee === true || sponsor.show_marquee === 1;
}

const MARQUEE_CACHE_KEY = 'efhs-sponsor-marquee-v2';

function readMarqueeCache() {
  try {
    const raw = sessionStorage.getItem(MARQUEE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeMarqueeCache(sponsors = []) {
  try {
    sessionStorage.setItem(MARQUEE_CACHE_KEY, JSON.stringify(sponsors));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function buildSponsorMarqueeMarkup(sponsors = []) {
  const items = (Array.isArray(sponsors) ? sponsors : []).filter(sponsorShowsMarquee);
  if (!items.length) return '';
  const logos = items.map((sponsor) => {
    const tier = resolveSponsorTierKey(sponsor);
    const tierClass = tier ? ` tier-${tier}` : '';
    const visual = sponsor.logo_url
      ? `<img src="${escapeHtml(sponsor.logo_url)}" alt="${escapeHtml(sponsor.name)} logo">`
      : `<span class="sponsor-marquee-mark" aria-hidden="true">${escapeHtml(sponsor.mark_text || '★')}</span>`;
    return `<a class="sponsor-marquee-item${tierClass}" href="/sponsors.html" title="${escapeHtml(sponsor.name)}" data-sponsor-tier="${escapeHtml(tier)}">${visual}<span>${escapeHtml(sponsor.name)}</span></a>`;
  }).join('');
  return `
    <div class="wrap sponsor-marquee-bar">
      <span class="sponsor-marquee-label">Sponsors</span>
      <div class="sponsor-marquee" data-marquee-track>
        <div class="sponsor-marquee-track">${logos}${logos}</div>
      </div>
    </div>
  `;
}

async function maybeShowHomepageSponsorAd() {
  if (!isHomePage()) return;
  try {
    const [sponsors, site] = await Promise.all([
      fetch('/api/sponsors', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : [])),
      fetch('/api/site', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : {})),
    ]);
    const eligible = (Array.isArray(sponsors) ? sponsors : []).filter(sponsorShowsFlyin);
    if (!eligible.length) return;
    const picked = pickRandomSponsor(eligible);
    if (picked) showHomepageSponsorAd(picked, site?.sponsor_ad_seconds);
  } catch {
    // Bypass the ad entirely if sponsors cannot be loaded.
  }
}

function ensureSiteChrome(header, mount) {
  if (!header) return null;
  let chrome = document.querySelector('[data-site-chrome]');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'site-chrome';
    chrome.setAttribute('data-site-chrome', '');
    header.parentNode?.insertBefore(chrome, header);
  }
  if (header.parentElement !== chrome) chrome.appendChild(header);
  if (mount && mount.parentElement !== chrome) chrome.appendChild(mount);
  // Keep header above the marquee inside the sticky chrome.
  if (mount && mount.previousElementSibling !== header) chrome.appendChild(mount);
  return chrome;
}

function ensureSponsorMarqueeMount() {
  const header = document.querySelector('header.site-header');
  if (!header) return document.querySelector('[data-sponsor-marquee]') || null;

  let mount = document.querySelector('[data-sponsor-marquee]');
  if (!mount) {
    mount = document.createElement('section');
    mount.className = 'sponsor-marquee-section';
    mount.setAttribute('data-sponsor-marquee', '');
    mount.setAttribute('aria-label', 'Sponsor marquee');
    mount.hidden = true;
  }
  ensureSiteChrome(header, mount);
  document.querySelectorAll('[data-sponsor-marquee]').forEach((node) => {
    if (node !== mount) node.remove();
  });
  return mount;
}

function renderSponsorMarquee(sponsors = []) {
  const mount = ensureSponsorMarqueeMount();
  if (!mount) return;
  const markup = buildSponsorMarqueeMarkup(sponsors);
  if (!markup) {
    // Keep any server-rendered strip visible unless we know there are no sponsors.
    if (!mount.dataset.marqueeReady) return;
    mount.hidden = true;
    mount.innerHTML = '';
    return;
  }
  const nextHtml = markup.trim();
  if (mount.dataset.marqueeHtml === nextHtml) {
    mount.hidden = false;
    mount.dataset.marqueeReady = '1';
    return;
  }
  mount.hidden = false;
  mount.dataset.marqueeReady = '1';
  mount.dataset.marqueeHtml = nextHtml;
  mount.innerHTML = nextHtml;
}

function hydrateMarqueeFromCache() {
  const mount = ensureSponsorMarqueeMount();
  if (mount && !mount.hidden && mount.querySelector('.sponsor-marquee-track')) {
    mount.dataset.marqueeReady = '1';
    mount.dataset.marqueeHtml = mount.innerHTML.trim();
  }
  const cached = readMarqueeCache();
  if (cached?.length) renderSponsorMarquee(cached);
}

async function loadSponsorMarquee() {
  try {
    const sponsors = await fetch('/api/sponsors', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : []));
    const list = Array.isArray(sponsors) ? sponsors : [];
    writeMarqueeCache(list);
    renderSponsorMarquee(list);
  } catch {
    // Keep any already-visible SSR/cache marquee in place.
  }
}

function closeSponsorMapModal() {
  const modal = document.querySelector('.sponsor-map-modal');
  if (!modal) return;
  modal.classList.add('is-leaving');
  document.body.classList.remove('sponsor-map-open');
  window.setTimeout(() => modal.remove(), 280);
}

function openSponsorMapModal({ name, address, embedUrl, directionsUrl }) {
  if (!address || !embedUrl || !directionsUrl) return;
  closeSponsorMapModal();

  const modal = document.createElement('aside');
  modal.className = 'sponsor-map-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `${name || 'Sponsor'} map`);
  modal.innerHTML = `
    <button type="button" class="sponsor-map-backdrop" aria-label="Close map"></button>
    <div class="sponsor-map-panel">
      <button type="button" class="sponsor-map-close" aria-label="Close map">×</button>
      <div class="sponsor-map-copy">
        <span class="sponsor-map-kicker">Sponsor location</span>
        <h3>${escapeHtml(name || 'Sponsor')}</h3>
        <p>${escapeHtml(address)}</p>
      </div>
      <a class="sponsor-map-shot" href="${escapeHtml(directionsUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open directions in maps">
        <iframe
          title="Map for ${escapeHtml(name || 'sponsor')}"
          src="${escapeHtml(embedUrl)}"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          tabindex="-1"
        ></iframe>
        <span class="sponsor-map-overlay">
          <strong>Open in Maps</strong>
          <small>Get directions in Google, Apple, Bing, or your default maps app</small>
        </span>
      </a>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add('sponsor-map-open');
  requestAnimationFrame(() => modal.classList.add('is-visible'));

  modal.querySelector('.sponsor-map-close')?.addEventListener('click', closeSponsorMapModal);
  modal.querySelector('.sponsor-map-backdrop')?.addEventListener('click', closeSponsorMapModal);
}

function bindSponsorMapCards(root = document) {
  root.querySelectorAll('[data-sponsor-card]').forEach((card) => {
    if (card.dataset.mapBound === '1') return;
    card.dataset.mapBound = '1';
    const open = (event) => {
      event.preventDefault();
      openSponsorMapModal({
        name: card.dataset.sponsorName || '',
        address: card.dataset.sponsorAddress || '',
        embedUrl: card.dataset.sponsorMapEmbed || '',
        directionsUrl: card.dataset.sponsorMapDirections || '',
      });
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') open(event);
    });
  });
}

function ensureBoosterMeetingsContainers() {
  if (document.querySelector('[data-booster-meetings]')) return;
  const cards = [...document.querySelectorAll('article.card, .card')];
  const meetingsCard = cards.find((card) => {
    const tag = card.querySelector('.tag')?.textContent || '';
    const heading = card.querySelector('h3')?.textContent || '';
    return /meetings/i.test(tag) || /booster meetings/i.test(heading);
  });
  if (!meetingsCard) return;
  let slot = meetingsCard.querySelector('[data-booster-meetings]');
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'timeline booster-meetings';
    slot.dataset.boosterMeetings = '';
    const placeholder = [...meetingsCard.querySelectorAll('p')].find((node) => /placeholder|monthly meeting/i.test(node.textContent || ''));
    if (placeholder) placeholder.replaceWith(slot);
    else meetingsCard.appendChild(slot);
  }
}

const MONTH_CALENDAR_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_CALENDAR_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getPublicZonedYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: read('year'), month: read('month'), day: read('day') };
}

function eventYearForCalendar(event) {
  const year = Number(event?.event_year);
  if (Number.isFinite(year) && year >= 2000 && year <= 2100) return year;
  return getPublicZonedYmd().year;
}

function eventDayNumber(event) {
  const detail = String(event?.date_detail || '').trim();
  if (/^\d{1,2}$/.test(detail)) return Number(detail);
  return null;
}

function eventBelongsToMonth(event, year, monthIndex) {
  return eventYearForCalendar(event) === year
    && String(event?.date_label || '').trim() === MONTH_CALENDAR_LABELS[monthIndex];
}

function daysInCalendarMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

let calendarDayToastLeaveTimer = null;

function ensureCalendarDayToast() {
  let root = document.querySelector('#calendar-day-toast');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'calendar-day-toast';
  root.className = 'calendar-day-toast';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'calendar-day-toast-title');
  root.innerHTML = `
    <div class="calendar-day-toast-backdrop" aria-hidden="true"></div>
    <div class="calendar-day-toast-panel">
      <button type="button" class="sponsor-flyin-close calendar-day-toast-close" data-calendar-day-close aria-label="Close day events">×</button>
      <div class="calendar-day-toast-card">
        <h3 id="calendar-day-toast-title"></h3>
        <div class="calendar-day-toast-list" data-calendar-day-list></div>
      </div>
    </div>`;
  document.body.appendChild(root);
  root.querySelector('[data-calendar-day-close]')?.addEventListener('click', () => hideCalendarDayToast());
  return root;
}

function hideCalendarDayToast() {
  const root = document.querySelector('#calendar-day-toast');
  if (!root || root.hidden) return;
  window.clearTimeout(calendarDayToastLeaveTimer);
  calendarDayToastLeaveTimer = playOverlayLeave(root, { ms: 280, hide: true });
}

function showCalendarDayToast(title, dayEvents) {
  const root = ensureCalendarDayToast();
  const titleEl = root.querySelector('#calendar-day-toast-title');
  const list = root.querySelector('[data-calendar-day-list]');
  if (titleEl) titleEl.textContent = title;
  if (list) {
    if (!dayEvents.length) {
      list.innerHTML = '<p class="draft">No events on this day.</p>';
    } else {
      list.innerHTML = dayEvents.map((event) => `
        <article class="calendar-day-toast-event">
          <h4>${formatInlineRichText(event.title)}</h4>
          <div class="event-description">${formatRichText(event.description)}</div>
        </article>
      `).join('');
    }
  }
  window.clearTimeout(calendarDayToastLeaveTimer);
  root.hidden = false;
  playOverlayEnter(root);
  window.setTimeout(() => root.querySelector('[data-calendar-day-close]')?.focus(), 40);
}

function renderMonthCalendar(container, allEvents, view) {
  const { year, monthIndex } = view;
  const today = getPublicZonedYmd();
  const monthEvents = (Array.isArray(allEvents) ? allEvents : []).filter((event) => (
    eventBelongsToMonth(event, year, monthIndex)
  ));
  const byDay = new Map();
  const undated = [];
  for (const event of monthEvents) {
    const day = eventDayNumber(event);
    if (day == null) {
      undated.push(event);
      continue;
    }
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(event);
  }

  const dim = daysInCalendarMonth(year, monthIndex);
  const firstDow = new Date(year, monthIndex, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i += 1) {
    cells.push('<div class="month-calendar-cell is-empty" aria-hidden="true"></div>');
  }
  for (let day = 1; day <= dim; day += 1) {
    const dayEvents = byDay.get(day) || [];
    const hasEvents = dayEvents.length > 0;
    const isToday = today.year === year && today.month === monthIndex + 1 && today.day === day;
    const classes = [
      'month-calendar-cell',
      hasEvents ? 'has-events' : '',
      isToday ? 'is-today' : '',
    ].filter(Boolean).join(' ');
    const label = `${MONTH_CALENDAR_NAMES[monthIndex]} ${day}, ${year}${hasEvents ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`;
    if (hasEvents) {
      cells.push(`
        <button type="button" class="${classes}" data-calendar-day="${day}" aria-label="${escapeHtml(label)}">
          <span class="month-calendar-daynum">${day}</span>
          <span class="month-calendar-dot" aria-hidden="true"></span>
        </button>`);
    } else {
      cells.push(`
        <div class="${classes}" aria-label="${escapeHtml(label)}">
          <span class="month-calendar-daynum">${day}</span>
        </div>`);
    }
  }

  const undatedHtml = undated.length
    ? `<div class="month-calendar-undated">
        <h3>Also this month</h3>
        <div class="month-calendar-undated-list">
          ${undated.map((event) => `
            <article class="event">
              <div class="datebox">${escapeHtml(event.date_label)} <span>${escapeHtml(event.date_detail)}</span></div>
              <div><h3>${formatInlineRichText(event.title)}</h3><div class="event-description">${formatRichText(event.description)}</div></div>
            </article>
          `).join('')}
        </div>
      </div>`
    : '';

  container.innerHTML = `
    <div class="month-calendar-shell">
      <div class="month-calendar-toolbar">
        <button type="button" class="month-calendar-nav" data-calendar-prev aria-label="Previous month">‹</button>
        <h2 class="month-calendar-title">${MONTH_CALENDAR_NAMES[monthIndex]} ${year}</h2>
        <button type="button" class="month-calendar-nav" data-calendar-next aria-label="Next month">›</button>
      </div>
      <div class="month-calendar-weekdays" aria-hidden="true">
        ${MONTH_CALENDAR_WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}
      </div>
      <div class="month-calendar-grid" role="grid" aria-label="${escapeHtml(`${MONTH_CALENDAR_NAMES[monthIndex]} ${year}`)}">
        ${cells.join('')}
      </div>
      ${undatedHtml}
    </div>`;

  container.querySelector('[data-calendar-prev]')?.addEventListener('click', () => {
    const next = { ...view };
    next.monthIndex -= 1;
    if (next.monthIndex < 0) {
      next.monthIndex = 11;
      next.year -= 1;
    }
    container._calendarView = next;
    renderMonthCalendar(container, allEvents, next);
  });
  container.querySelector('[data-calendar-next]')?.addEventListener('click', () => {
    const next = { ...view };
    next.monthIndex += 1;
    if (next.monthIndex > 11) {
      next.monthIndex = 0;
      next.year += 1;
    }
    container._calendarView = next;
    renderMonthCalendar(container, allEvents, next);
  });
  container.querySelectorAll('[data-calendar-day]').forEach((button) => {
    button.addEventListener('click', () => {
      const day = Number(button.dataset.calendarDay);
      const dayEvents = byDay.get(day) || [];
      showCalendarDayToast(`${MONTH_CALENDAR_NAMES[monthIndex]} ${day}, ${year}`, dayEvents);
    });
  });
}

function initMonthCalendars(allEvents) {
  const today = getPublicZonedYmd();
  document.querySelectorAll('[data-month-calendar]').forEach((container) => {
    const view = container._calendarView || {
      year: today.year,
      monthIndex: today.month - 1,
    };
    container._calendarView = view;
    renderMonthCalendar(container, allEvents, view);
  });
}

async function loadPublicContent() {
  // Start marquee immediately so it does not wait on site/events/photos.
  const marqueePromise = loadSponsorMarquee();
  const needsMonthCalendar = Boolean(document.querySelector('[data-month-calendar]'));
  const [site, events, photos, calendarEvents] = await Promise.all([
    fetch('/api/site', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    fetch('/api/events', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    fetch('/api/photos', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    needsMonthCalendar
      ? fetch('/api/calendar-events', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
      : Promise.resolve([]),
  ]);

  if (site) {
    document.querySelectorAll('[data-site-field]').forEach(element => {
      const key = element.dataset.siteField;
      const value = site[key];
      if (!value) return;
      if (key === 'hero_title' || key === 'title') {
        element.innerHTML = formatInlineRichText(value);
        return;
      }
      if (key === 'hero_subtitle' || key === 'footer_note') {
        const html = formatRichText(value);
        // Footer note is a div so rich <p> blocks can render once without nested-p duplication.
        if (key === 'footer_note' || element.tagName !== 'P') {
          element.innerHTML = html;
          return;
        }
        const match = html.match(/^<p>([\s\S]*)<\/p>$/i);
        element.innerHTML = match ? match[1] : sanitizeInlineRichHtml(html);
        return;
      }
      element.textContent = value;
    });
    if (site.title) {
      const plainTitle = String(site.title).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (plainTitle) document.title = document.title.replace('East Forsyth Band', plainTitle);
    }
  }

  document.querySelectorAll('[data-events]').forEach(container => {
    const rawLimit = container.dataset.limit;
    const limit = rawLimit === undefined || rawLimit === ''
      ? events.length
      : Math.max(0, Number(rawLimit) || 0);
    const visibleEvents = events.slice(0, limit || events.length);
    if (!visibleEvents.length) {
      container.innerHTML = '<p class="draft">No upcoming events have been published yet.</p>';
      return;
    }
    container.innerHTML = visibleEvents.map(event => `
      <article class="event">
        <div class="datebox">${escapeHtml(event.date_label)} <span>${escapeHtml(event.date_detail)}</span></div>
        <div><h3>${formatInlineRichText(event.title)}</h3><div class="event-description">${formatRichText(event.description)}</div></div>
      </article>
    `).join('');
  });

  if (needsMonthCalendar) initMonthCalendars(calendarEvents);

  ensureBoosterMeetingsContainers();
  const boosterMeetings = (Array.isArray(events) ? events : []).filter((event) => (
    Number(event.show_on_boosters) === 1
    && Number(event.repeat_enabled) !== 1
    && !event.is_occurrence
  ));
  document.querySelectorAll('[data-booster-meetings]').forEach((container) => {
    if (!boosterMeetings.length) {
      container.innerHTML = '<p class="draft">No upcoming booster meetings are scheduled yet.</p>';
      return;
    }
    container.innerHTML = boosterMeetings.map((event) => `
      <article class="event">
        <div class="datebox">${escapeHtml(event.date_label)} <span>${escapeHtml(event.date_detail)}</span></div>
        <div><h3>${formatInlineRichText(event.title)}</h3><div class="event-description">${formatRichText(event.description)}</div></div>
      </article>
    `).join('');
  });

  document.querySelectorAll('[data-photo-gallery]').forEach((container) => {
    renderPhotoGallery(container, photos);
  });
  bindPhotoGalleries();

  bindSponsorMapCards();
  bindSponsorTierSignup();
  bindDonateButtons();
  await Promise.all([marqueePromise, maybeShowHomepageSponsorAd(), loadContactForms()]);
}

function sortPhotosByRecent(photos = []) {
  return [...(Array.isArray(photos) ? photos : [])].sort((a, b) => {
    const aTime = Date.parse(a?.created_at || '') || 0;
    const bTime = Date.parse(b?.created_at || '') || 0;
    if (bTime !== aTime) return bTime - aTime;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

function isBrandGalleryPlaceholder(src = '') {
  const value = String(src || '').toLowerCase();
  return /efhs-photo-[12]\.png|efhs-logo\.png|efhs-blue-regiment-mark\.png|efhs-admin-mark\.png/.test(value);
}

function renderPhotoGallery(container, photos = []) {
  if (!container) return;
  // Drop any brand/logo placeholders immediately so they never flash on Gallery.
  container.querySelectorAll('.gallery-item img').forEach((img) => {
    if (isBrandGalleryPlaceholder(img.getAttribute('src') || img.src)) {
      img.closest('.gallery-item')?.remove();
    }
  });
  let list = Array.isArray(photos) ? [...photos] : [];
  const sortMode = String(container.dataset.sort || '').trim().toLowerCase();
  if (sortMode === 'recent') list = sortPhotosByRecent(list);
  const rawLimit = container.dataset.limit;
  if (rawLimit !== undefined && rawLimit !== '') {
    const limit = Math.max(0, Number(rawLimit) || 0);
    list = list.slice(0, limit);
  }
  if (!list.length) {
    container.innerHTML = '<p class="draft">No photos have been published yet.</p>';
    return;
  }
  container.innerHTML = list.map((photo) => `
    <figure class="gallery-item" data-photo-open>
      <button type="button" class="gallery-item-trigger" aria-label="View ${escapeHtml(photo.alt_text || photo.caption || 'photo')}">
        <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt_text || '')}" loading="lazy" draggable="false">
      </button>
      <figcaption>${formatInlineRichText(photo.caption || photo.alt_text || '')}</figcaption>
    </figure>
  `).join('');
}

function protectPhotoMedia(root = document) {
  const block = (event) => {
    event.preventDefault();
    return false;
  };
  root.querySelectorAll('.gallery-item img, .photo-lightbox-image, .photo-lightbox-frame').forEach((el) => {
    if (el.dataset.photoProtected === '1') return;
    el.dataset.photoProtected = '1';
    el.setAttribute('draggable', 'false');
    el.addEventListener('contextmenu', block);
    el.addEventListener('dragstart', block);
  });
}

function closePhotoLightbox() {
  const modal = document.querySelector('.photo-lightbox');
  if (!modal) return;
  modal.classList.add('is-leaving');
  modal.classList.remove('is-visible');
  document.body.classList.remove('photo-lightbox-open');
  window.setTimeout(() => {
    if (document.body.contains(modal)) modal.remove();
  }, 280);
}

function openPhotoLightbox({ src, alt = '', caption = '' } = {}) {
  if (!src) return;
  closePhotoLightbox();
  const modal = document.createElement('aside');
  modal.className = 'photo-lightbox';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', caption || alt || 'Photo');
  modal.innerHTML = `
    <button type="button" class="photo-lightbox-backdrop" aria-label="Close photo"></button>
    <div class="photo-lightbox-panel">
      <button type="button" class="photo-lightbox-close" aria-label="Close photo">×</button>
      <div class="photo-lightbox-frame">
        <img class="photo-lightbox-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt || caption || 'Band photo')}" draggable="false">
      </div>
      ${caption || alt ? `<p class="photo-lightbox-caption">${escapeHtml(caption || alt)}</p>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add('photo-lightbox-open');
  requestAnimationFrame(() => modal.classList.add('is-visible'));
  protectPhotoMedia(modal);
  modal.querySelector('.photo-lightbox-close')?.addEventListener('click', closePhotoLightbox);
  modal.querySelector('.photo-lightbox-backdrop')?.addEventListener('click', closePhotoLightbox);
  modal.querySelector('.photo-lightbox-close')?.focus();
}

function bindPhotoGalleries(root = document) {
  if (!window.__efPhotoLightboxKeysBound) {
    window.__efPhotoLightboxKeysBound = true;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.querySelector('.photo-lightbox')) {
        closePhotoLightbox();
      }
    });
    document.addEventListener('contextmenu', (event) => {
      if (event.target?.closest?.('.gallery-item, .photo-lightbox')) {
        event.preventDefault();
      }
    });
  }
  root.querySelectorAll('[data-photo-gallery]').forEach((container) => {
    if (container.dataset.photoBound === '1') return;
    container.dataset.photoBound = '1';
    container.addEventListener('click', (event) => {
      const trigger = event.target.closest?.('[data-photo-open], .gallery-item-trigger');
      if (!trigger || !container.contains(trigger)) return;
      const item = trigger.closest('.gallery-item') || trigger;
      const img = item.querySelector('img');
      if (!img?.src) return;
      event.preventDefault();
      const caption = item.querySelector('figcaption')?.textContent?.trim() || '';
      openPhotoLightbox({
        src: img.currentSrc || img.src,
        alt: img.alt || '',
        caption,
      });
    });
  });
  protectPhotoMedia(root);
}

function buildContactFormHtml(topics = []) {
  const options = topics.length
    ? topics.map((topic) => `<option value="${escapeHtml(topic.id)}">${escapeHtml(topic.label)}</option>`).join('')
    : '<option value="" disabled selected>Contact topics coming soon</option>';
  const disabled = topics.length ? '' : ' disabled';
  return `
    <span class="tag">Contact</span>
    <h3>Send a message</h3>
    <p class="contact-form-intro">Choose a topic and we will route your message to the right person.</p>
    <div class="form-grid">
      <label>Name<input name="name" required autocomplete="name" placeholder="Your name"${disabled}></label>
      <label>Email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"${disabled}></label>
      <label class="full">Topic<select name="topic_id" required${disabled}>${options}</select></label>
      <label class="full">Message<textarea name="message" rows="5" required placeholder="How can we help?"${disabled}></textarea></label>
      <label class="contact-honeypot" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label>
    </div>
    <p style="margin-top:16px"><button class="btn primary" type="submit"${disabled}>Send message</button></p>
    <p class="status" data-contact-status></p>
  `;
}

function bindContactForm(form) {
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-contact-status]');
    const payload = Object.fromEntries(new FormData(form).entries());
    if (status) status.textContent = 'Sending…';
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Could not send message');
      form.reset();
      if (status) status.textContent = result.detail || 'Message sent. Thank you!';
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not send message.';
    }
  });
}

async function loadContactForms() {
  const slots = [...document.querySelectorAll('[data-contact-form-slot], form[data-contact-form]')];
  if (!slots.length) return;
  const topics = await fetch('/api/contact/topics', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : []))
    .catch(() => []);

  slots.forEach((slot) => {
    let form = slot;
    if (slot.matches('[data-contact-form-slot]')) {
      form = document.createElement('form');
      form.className = 'card contact-form';
      form.dataset.contactForm = '';
      form.noValidate = true;
      form.innerHTML = buildContactFormHtml(topics);
      slot.replaceWith(form);
    } else {
      form.classList.add('card', 'contact-form');
      form.innerHTML = buildContactFormHtml(topics);
    }
    bindContactForm(form);
  });
}

function isCmsAdminPreviewContext(root = document) {
  return Boolean(
    document.body?.classList?.contains('admin-body')
    || root.closest?.('#page-preview, .cms-shell, .image-admin-shell')
  );
}

function parseSponsorAmountCents(value) {
  const cleaned = String(value || '').replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

function formatSponsorAmountDisplay(cents) {
  const amount = Number(cents);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const dollars = amount / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function readTierPackageFromCard(card) {
  const tier = String(card?.dataset?.tier || '').trim().toLowerCase();
  if (!['bronze', 'silver', 'gold'].includes(tier)) return null;
  const title = (card.querySelector('[data-cms-field$="_title"], h3')?.textContent || `${tier} Sponsor`)
    .replace(/\s+/g, ' ')
    .trim();
  const amountText = (card.querySelector('[data-cms-field$="_amount"], .sponsor-tier-amount')?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  const amountCents = parseSponsorAmountCents(amountText);
  if (!amountCents) return null;
  return {
    tier,
    title,
    amountCents,
    amountDisplay: formatSponsorAmountDisplay(amountCents) || amountText,
  };
}

let sponsorSignupState = null;

function closeSponsorSignupModal({ immediate = false } = {}) {
  const modal = document.querySelector('.sponsor-signup-modal:not(.donate-modal)');
  if (!modal) {
    if (!document.querySelector('.donate-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
    sponsorSignupState = null;
    return;
  }
  if (immediate) {
    modal.remove();
    if (!document.querySelector('.donate-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
    sponsorSignupState = null;
    return;
  }
  modal.classList.add('is-leaving');
  modal.classList.remove('is-visible');
  window.setTimeout(() => {
    if (document.body.contains(modal)) modal.remove();
    if (!document.querySelector('.sponsor-signup-modal:not(.donate-modal), .donate-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
    sponsorSignupState = null;
  }, 280);
}

function showSponsorSignupConfirm(modal) {
  const confirm = modal.querySelector('[data-signup-confirm]');
  if (!confirm) return;
  confirm.hidden = false;
  confirm.querySelector('[data-confirm-yes]')?.focus();
}

function hideSponsorSignupConfirm(modal) {
  const confirm = modal.querySelector('[data-signup-confirm]');
  if (!confirm) return;
  confirm.hidden = true;
}

function openSponsorSignupModal(pkg) {
  closeSponsorMapModal();
  closeDonateModal({ immediate: true });
  closeSponsorSignupModal({ immediate: true });
  sponsorSignupState = { ...pkg, draft: null, application: null };

  const modal = document.createElement('aside');
  modal.className = 'sponsor-signup-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `Become a ${pkg.title}`);
  modal.innerHTML = `
    <button type="button" class="sponsor-signup-backdrop" data-signup-cancel aria-label="Cancel signup"></button>
    <div class="sponsor-signup-panel">
      <div class="sponsor-signup-head" data-signup-head>
        <span class="sponsor-signup-kicker">Become a sponsor</span>
        <h3>${escapeHtml(pkg.title)}</h3>
        <p data-signup-head-copy>Tell us about your business, then continue to payment for <strong>${escapeHtml(pkg.amountDisplay)}</strong>.</p>
      </div>
      <div class="sponsor-signup-step" data-signup-step="details">
        <form class="sponsor-signup-form" data-signup-form novalidate>
          <label>Business / organization name<input name="business_name" required autocomplete="organization" maxlength="160" placeholder="Business or organization name"></label>
          <label class="sponsor-signup-address">Address
            <span class="sponsor-signup-address-wrap">
              <input name="address" type="text" required maxlength="400" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Start typing street address…" data-address-input aria-autocomplete="list" aria-expanded="false" aria-controls="sponsor-address-suggest">
              <ul class="sponsor-signup-address-suggest" id="sponsor-address-suggest" data-address-suggest role="listbox" hidden></ul>
            </span>
            <span class="sponsor-signup-address-hint" data-address-hint>Pick a suggestion to verify the address.</span>
          </label>
          <label>Phone<input name="phone" type="tel" required autocomplete="tel" maxlength="40" placeholder="(336) 555-0100"></label>
          <label>Invoice email<input name="email" type="email" required autocomplete="email" maxlength="160" placeholder="billing@example.com"></label>
          <p class="sponsor-signup-pay-note">Required so we can email your donation invoice from the East Forsyth Band Boosters.</p>
          <label class="sponsor-signup-logo">Company logo <span>(optional, image under 2 MB)</span>
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif">
          </label>
          <p class="sponsor-signup-logo-name" data-logo-name hidden></p>
          <p class="status" data-signup-status></p>
          <div class="sponsor-signup-actions">
            <button class="btn outline" type="button" data-signup-cancel>Cancel</button>
            <button class="btn primary" type="submit">Next</button>
          </div>
        </form>
      </div>
      <div class="sponsor-signup-step" data-signup-step="payment" hidden>
        <div class="sponsor-signup-payment-body" data-pay-body>
          <div class="sponsor-signup-summary">
            <p><span>Business</span><strong data-pay-business></strong></p>
            <p><span>Package</span><strong>${escapeHtml(pkg.title)}</strong></p>
            <p><span>Invoice email</span><strong data-pay-email></strong></p>
          </div>
          <label class="sponsor-signup-amount-lock">Amount due
            <input data-pay-amount type="text" readonly tabindex="-1" value="${escapeHtml(pkg.amountDisplay)}">
          </label>
          <p class="sponsor-signup-pay-note" data-pay-note>Your donation invoice will be emailed from no-reply@efhsband.org after payment. Thank you for supporting East Forsyth Band Boosters.</p>
          <p class="status" data-pay-status></p>
        </div>
        <div class="sponsor-signup-actions sponsor-signup-actions-split" data-pay-actions>
          <button class="btn outline" type="button" data-signup-cancel>Cancel</button>
          <div class="sponsor-signup-actions-end">
            <button class="btn outline" type="button" data-signup-back>Back</button>
            <button class="btn primary" type="button" data-pay-continue>Pay with Square</button>
          </div>
        </div>
      </div>
      <div class="sponsor-signup-confirm" data-signup-confirm hidden>
        <div class="sponsor-signup-confirm-card" role="alertdialog" aria-labelledby="sponsor-signup-confirm-title" aria-describedby="sponsor-signup-confirm-copy">
          <h4 id="sponsor-signup-confirm-title">Are you sure?</h4>
          <p id="sponsor-signup-confirm-copy">Canceling returns you to the sponsor/donation page and discards this form.</p>
          <div class="sponsor-signup-actions">
            <button class="btn outline" type="button" data-confirm-no>No</button>
            <button class="btn primary" type="button" data-confirm-yes>Yes</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add('sponsor-signup-open');
  requestAnimationFrame(() => modal.classList.add('is-visible'));

  const form = modal.querySelector('[data-signup-form]');
  const detailsStep = modal.querySelector('[data-signup-step="details"]');
  const paymentStep = modal.querySelector('[data-signup-step="payment"]');
  const payBody = modal.querySelector('[data-pay-body]');
  const status = modal.querySelector('[data-signup-status]');
  const payStatus = modal.querySelector('[data-pay-status]');
  const payNote = modal.querySelector('[data-pay-note]');
  const logoName = modal.querySelector('[data-logo-name]');
  const logoInput = form?.querySelector('input[name="logo"]');
  const addressInput = form?.querySelector('[data-address-input]');
  const addressSuggest = form?.querySelector('[data-address-suggest]');
  const addressHint = form?.querySelector('[data-address-hint]');
  let addressVerified = false;
  let addressSuggestTimer = 0;
  let addressSuggestController = null;
  let addressActiveIndex = -1;
  let checkoutMessageBound = false;

  function setAddressVerified(next, description = '') {
    addressVerified = Boolean(next);
    if (addressInput) {
      addressInput.dataset.verified = addressVerified ? '1' : '0';
      addressInput.classList.toggle('is-verified', addressVerified);
    }
    if (addressHint) {
      addressHint.textContent = addressVerified
        ? 'Verified address selected.'
        : 'Pick a suggestion to verify the address.';
      addressHint.classList.toggle('is-verified', addressVerified);
    }
    if (description && addressInput) addressInput.value = description;
  }

  function hideAddressSuggestions() {
    if (!addressSuggest || !addressInput) return;
    addressSuggest.hidden = true;
    addressSuggest.innerHTML = '';
    addressInput.setAttribute('aria-expanded', 'false');
    addressActiveIndex = -1;
  }

  function renderAddressSuggestions(items = []) {
    if (!addressSuggest || !addressInput) return;
    if (!items.length) {
      hideAddressSuggestions();
      return;
    }
    addressSuggest.innerHTML = items.map((item, index) => `
      <li role="option" id="sponsor-address-opt-${index}" data-address-option data-index="${index}" aria-selected="${index === 0 ? 'true' : 'false'}">
        ${escapeHtml(item.description)}
      </li>
    `).join('');
    addressSuggest.hidden = false;
    addressInput.setAttribute('aria-expanded', 'true');
    addressActiveIndex = 0;
  }

  function moveAddressActive(delta) {
    if (!addressSuggest || addressSuggest.hidden) return;
    const options = [...addressSuggest.querySelectorAll('[data-address-option]')];
    if (!options.length) return;
    addressActiveIndex = (addressActiveIndex + delta + options.length) % options.length;
    options.forEach((option, index) => {
      option.setAttribute('aria-selected', index === addressActiveIndex ? 'true' : 'false');
    });
    options[addressActiveIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function chooseAddressOption(option) {
    if (!option) return;
    const description = String(option.textContent || '').trim();
    if (!description) return;
    setAddressVerified(true, description);
    hideAddressSuggestions();
  }

  async function fetchAddressSuggestions(query) {
    if (addressSuggestController) addressSuggestController.abort();
    addressSuggestController = new AbortController();
    try {
      const response = await fetch(`/api/address-suggest?q=${encodeURIComponent(query)}`, {
        cache: 'no-store',
        signal: addressSuggestController.signal,
      });
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({}));
      if (String(addressInput?.value || '').trim() !== query) return;
      renderAddressSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      hideAddressSuggestions();
    }
  }

  addressInput?.addEventListener('input', () => {
    const query = String(addressInput.value || '').trim();
    setAddressVerified(false);
    window.clearTimeout(addressSuggestTimer);
    if (query.length < 3) {
      hideAddressSuggestions();
      return;
    }
    addressSuggestTimer = window.setTimeout(() => {
      fetchAddressSuggestions(query);
    }, 220);
  });

  addressInput?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveAddressActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveAddressActive(-1);
      return;
    }
    if (event.key === 'Enter' && addressSuggest && !addressSuggest.hidden && addressActiveIndex >= 0) {
      const option = addressSuggest.querySelector(`[data-address-option][data-index="${addressActiveIndex}"]`);
      if (option) {
        event.preventDefault();
        chooseAddressOption(option);
      }
      return;
    }
    if (event.key === 'Escape') hideAddressSuggestions();
  });

  addressSuggest?.addEventListener('mousedown', (event) => {
    const option = event.target.closest('[data-address-option]');
    if (!option) return;
    event.preventDefault();
    chooseAddressOption(option);
  });

  addressInput?.addEventListener('blur', () => {
    window.setTimeout(hideAddressSuggestions, 120);
  });

  function handleSponsorPaidMessage(event) {
    const data = event?.data;
    if (!data || data.type !== 'efhs-sponsor-paid') return;
    if (!sponsorSignupState?.application) return;
    if (String(data.application_id || '') !== String(sponsorSignupState.application.id || '')) return;
    window.removeEventListener('message', handleSponsorPaidMessage);
    checkoutMessageBound = false;
    if (!data.ok) {
      if (payStatus) payStatus.textContent = data.detail || 'Payment could not be confirmed.';
      return;
    }
    finishSponsorSignupSuccess(data.sponsor, data.detail);
  }

  function finishSponsorSignupSuccess(sponsor, detail) {
    closeSponsorSignupModal({ immediate: true });
    const note = detail || (sponsor?.name
      ? `${sponsor.name} is now listed as ${sponsor.level || 'a sponsor'}.`
      : 'Sponsorship activated. Thank you!');
    showTransientToast(note);
    loadSponsorMarquee();
  }

  async function embedCardCheckout(application, config) {
    if (!payBody) return;
    modal.classList.add('is-checkout');
    const headCopy = modal.querySelector('[data-signup-head-copy]');
    if (headCopy) {
      headCopy.innerHTML = `Enter card details to pay <strong>${escapeHtml(pkg.amountDisplay)}</strong>.`;
    }
    payBody.innerHTML = `
      <div class="sponsor-signup-summary">
        <p><span>Business</span><strong>${escapeHtml(application.business_name || sponsorSignupState.draft?.businessName || '')}</strong></p>
        <p><span>Package</span><strong>${escapeHtml(pkg.title)}</strong></p>
        <p><span>Invoice email</span><strong>${escapeHtml(application.email || sponsorSignupState.draft?.email || '')}</strong></p>
        <p><span>Amount</span><strong>${escapeHtml(pkg.amountDisplay)}</strong></p>
      </div>
      <div class="sponsor-signup-card-box">
        <div id="sponsor-square-card" class="sponsor-signup-card-host"></div>
      </div>
      <p class="status" data-pay-status>Loading secure card form…</p>
    `;
    const liveStatus = payBody.querySelector('[data-pay-status]');
    const payContinue = modal.querySelector('[data-pay-continue]');
    if (payContinue) {
      payContinue.hidden = false;
      payContinue.disabled = true;
      payContinue.textContent = `Pay ${pkg.amountDisplay}`;
    }
    const Square = await loadSquareWebSdk(config.environment || 'production');
    const payments = Square.payments(config.application_id, config.location_id);
    const card = await payments.card();
    await card.attach('#sponsor-square-card');
    if (liveStatus) {
      liveStatus.innerHTML = `
        <span class="sponsor-signup-square-status">
          <svg class="sponsor-signup-square-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M4.5 0A4.5 4.5 0 0 0 0 4.5v15A4.5 4.5 0 0 0 4.5 24h15a4.5 4.5 0 0 0 4.5-4.5v-15A4.5 4.5 0 0 0 19.5 0h-15Zm2.036 7.536h4.928v4.928H6.536V7.536Zm6 0H17.464v4.928h-4.928V7.536Zm-6 6h4.928v4.928H6.536v-4.928Zm6 0H17.464v4.928h-4.928v-4.928Z"/>
          </svg>
          <span>Square Secure Payment Ready.</span>
        </span>
      `;
    }
    if (payContinue) {
      payContinue.disabled = false;
      payContinue.onclick = async () => {
        payContinue.disabled = true;
        if (liveStatus) liveStatus.textContent = 'Processing payment…';
        try {
          const verificationDetails = {
            amount: (Number(application.amount_cents || pkg.amountCents) / 100).toFixed(2),
            currencyCode: 'USD',
            intent: 'CHARGE',
            customerInitiated: true,
            sellerKeyedIn: false,
            billingContact: {
              givenName: String(application.business_name || sponsorSignupState.draft?.businessName || 'Sponsor').slice(0, 100),
              phone: String(sponsorSignupState.draft?.phone || '').replace(/\D/g, '').slice(0, 20),
              addressLines: [String(sponsorSignupState.draft?.address || '').slice(0, 200)],
              countryCode: 'US',
            },
          };
          const result = await card.tokenize(verificationDetails);
          if (result.status !== 'OK' || !result.token) {
            const message = result.errors?.[0]?.message || 'Card could not be processed.';
            throw new Error(message);
          }
          const response = await fetch(`/api/sponsor-applications/${encodeURIComponent(application.id)}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: application.completion_token,
              source_id: result.token,
            }),
          });
          const paid = await response.json().catch(() => ({}));
          if (!response.ok || !paid.ok) throw new Error(paid.detail || 'Payment failed');
          finishSponsorSignupSuccess(paid.sponsor, paid.detail);
        } catch (error) {
          if (liveStatus) liveStatus.textContent = error.message || 'Payment failed.';
          payContinue.disabled = false;
        }
      };
    }
  }

  async function ensureApplication() {
    const draft = sponsorSignupState?.draft;
    if (!draft) throw new Error('Business details are required.');
    if (sponsorSignupState.application?.id && sponsorSignupState.application.completion_token) {
      return sponsorSignupState.application;
    }
    const body = new FormData();
    body.set('business_name', draft.businessName);
    body.set('address', draft.address);
    body.set('phone', draft.phone);
    body.set('email', draft.email);
    body.set('tier', pkg.tier);
    body.set('amount_display', pkg.amountDisplay);
    body.set('amount_cents', String(pkg.amountCents));
    if (draft.logo) body.set('logo', draft.logo, draft.logo.name || 'logo.png');
    const response = await fetch('/api/sponsor-applications', { method: 'POST', body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || 'Could not save application');
    sponsorSignupState.application = result;
    return result;
  }

  modal.querySelectorAll('[data-signup-cancel]').forEach((button) => {
    button.addEventListener('click', () => showSponsorSignupConfirm(modal));
  });
  modal.querySelector('[data-confirm-no]')?.addEventListener('click', () => hideSponsorSignupConfirm(modal));
  modal.querySelector('[data-confirm-yes]')?.addEventListener('click', () => {
    if (checkoutMessageBound) window.removeEventListener('message', handleSponsorPaidMessage);
    closeSponsorSignupModal();
  });

  logoInput?.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    if (!file) {
      if (logoName) {
        logoName.hidden = true;
        logoName.textContent = '';
      }
      return;
    }
    if (file.size > 1_900_000) {
      logoInput.value = '';
      if (status) status.textContent = 'Logo must be an image under 2 MB.';
      if (logoName) {
        logoName.hidden = true;
        logoName.textContent = '';
      }
      return;
    }
    if (status) status.textContent = '';
    if (logoName) {
      logoName.hidden = false;
      logoName.textContent = file.name;
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (status) status.textContent = '';
    const businessName = String(form.elements.business_name?.value || '').trim();
    const address = String(form.elements.address?.value || '').trim();
    const phone = String(form.elements.phone?.value || '').trim();
    const email = String(form.elements.email?.value || '').trim().toLowerCase();
    const logo = form.elements.logo?.files?.[0] || null;
    if (!businessName || !address || !phone || !email) {
      if (status) status.textContent = 'Business / organization name, address, phone, and invoice email are required.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (status) status.textContent = 'Enter a valid invoice email address.';
      form.elements.email?.focus();
      return;
    }
    if (!addressVerified) {
      if (status) status.textContent = 'Select a verified address from the suggestions while typing.';
      addressInput?.focus();
      return;
    }
    if (logo && logo.size > 1_900_000) {
      if (status) status.textContent = 'Logo must be an image under 2 MB.';
      return;
    }
    sponsorSignupState.draft = { businessName, address, phone, email, logo };
    sponsorSignupState.application = null;
    resetPaymentStepPreview(businessName);
    detailsStep.hidden = true;
    paymentStep.hidden = false;
    modal.querySelector('[data-pay-continue]')?.focus();
  });

  function resetPaymentStepPreview(businessName = '') {
    modal.classList.remove('is-checkout');
    if (checkoutMessageBound) {
      window.removeEventListener('message', handleSponsorPaidMessage);
      checkoutMessageBound = false;
    }
    const name = businessName || sponsorSignupState.draft?.businessName || '';
    if (payBody) {
      payBody.innerHTML = `
        <div class="sponsor-signup-summary">
          <p><span>Business</span><strong data-pay-business>${escapeHtml(name)}</strong></p>
          <p><span>Package</span><strong>${escapeHtml(pkg.title)}</strong></p>
          <p><span>Invoice email</span><strong>${escapeHtml(sponsorSignupState.draft?.email || '')}</strong></p>
        </div>
        <label class="sponsor-signup-amount-lock">Amount due
          <input data-pay-amount type="text" readonly tabindex="-1" value="${escapeHtml(pkg.amountDisplay)}">
        </label>
        <p class="sponsor-signup-pay-note" data-pay-note>Your donation invoice will be emailed from no-reply@efhsband.org after payment. Thank you for supporting East Forsyth Band Boosters.</p>
        <p class="status" data-pay-status></p>
      `;
    }
    const payContinue = modal.querySelector('[data-pay-continue]');
    if (payContinue) {
      payContinue.hidden = false;
      payContinue.disabled = false;
      payContinue.textContent = 'Pay with Square';
      payContinue.onclick = null;
    }
    const headCopy = modal.querySelector('[data-signup-head-copy]');
    if (headCopy) {
      headCopy.innerHTML = `Tell us about your business, then continue to payment for <strong>${escapeHtml(pkg.amountDisplay)}</strong>.`;
    }
  }

  function goBackToDetails() {
    resetPaymentStepPreview();
    paymentStep.hidden = true;
    detailsStep.hidden = false;
    if (status) status.textContent = '';
    form?.elements.business_name?.focus();
  }

  modal.querySelector('[data-signup-back]')?.addEventListener('click', goBackToDetails);

  async function startSquarePayment() {
    const payButton = modal.querySelector('[data-pay-continue]');
    const statusEl = modal.querySelector('[data-pay-status]');
    if (statusEl) statusEl.textContent = 'Saving application…';
    if (payButton) payButton.disabled = true;
    try {
      const [result, config] = await Promise.all([
        ensureApplication(),
        fetch('/api/sponsor-checkout/config', { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);
      if (config?.web_payments) {
        await embedCardCheckout(result, config);
        return;
      }
      if (statusEl) {
        statusEl.textContent = result.detail
          || 'Application saved. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.';
      }
      if (payButton) payButton.disabled = false;
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || 'Could not continue to payment.';
      if (payButton) payButton.disabled = false;
    }
  }

  modal.querySelector('[data-pay-continue]')?.addEventListener('click', () => {
    if (modal.classList.contains('is-checkout')) return;
    startSquarePayment();
  });

  form?.querySelector('input[name="business_name"]')?.focus();
}

function bindSponsorTierSignup(root = document) {
  if (isCmsAdminPreviewContext(root)) return;
  root.querySelectorAll('.sponsor-tiers [data-tier].sponsor-tier, .sponsor-tier[data-tier]').forEach((card) => {
    if (card.dataset.signupBound === '1') return;
    if (card.closest('#page-preview, .cms-shell, .admin-body')) return;
    card.dataset.signupBound = '1';
    card.classList.add('sponsor-tier-clickable');
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
    if (!card.getAttribute('role')) card.setAttribute('role', 'button');
    const open = (event) => {
      event.preventDefault();
      const pkg = readTierPackageFromCard(card);
      if (!pkg) return;
      openSponsorSignupModal(pkg);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') open(event);
    });
  });
}

let donateModalState = null;

function parseDonateAmountCents(raw) {
  const text = String(raw || '').trim();
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

function formatDonateAmountDisplay(cents) {
  const amount = Number(cents);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const dollars = amount / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function closeDonateModal({ immediate = false } = {}) {
  const modal = document.querySelector('.donate-modal');
  if (!modal) {
    document.body.classList.remove('sponsor-signup-open');
    donateModalState = null;
    return;
  }
  if (immediate) {
    modal.remove();
    if (!document.querySelector('.sponsor-signup-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
    donateModalState = null;
    return;
  }
  modal.classList.add('is-leaving');
  modal.classList.remove('is-visible');
  window.setTimeout(() => {
    if (document.body.contains(modal)) modal.remove();
    if (!document.querySelector('.sponsor-signup-modal, .donate-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
    donateModalState = null;
  }, 280);
}

function showDonateConfirm(modal) {
  const confirm = modal.querySelector('[data-donate-confirm]');
  if (!confirm) return;
  confirm.hidden = false;
  confirm.querySelector('[data-confirm-yes]')?.focus();
}

function hideDonateConfirm(modal) {
  const confirm = modal.querySelector('[data-donate-confirm]');
  if (!confirm) return;
  confirm.hidden = true;
}

function openDonateModal() {
  closeSponsorMapModal();
  closeSponsorSignupModal({ immediate: true });
  closeDonateModal({ immediate: true });
  donateModalState = { draft: null, donation: null };

  const modal = document.createElement('aside');
  modal.className = 'sponsor-signup-modal donate-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Donate to East Forsyth Band');
  modal.innerHTML = `
    <button type="button" class="sponsor-signup-backdrop" data-donate-cancel aria-label="Cancel donation"></button>
    <div class="sponsor-signup-panel">
      <div class="sponsor-signup-head" data-donate-head>
        <span class="sponsor-signup-kicker">Support the band</span>
        <h3>Make a donation</h3>
        <p data-donate-head-copy>Enter your name and a custom amount, then continue to secure Square checkout.</p>
      </div>
      <div class="sponsor-signup-step" data-donate-step="details">
        <form class="sponsor-signup-form" data-donate-form novalidate>
          <label>Your name<input name="donor_name" required autocomplete="name" maxlength="160" placeholder="Full name"></label>
          <label>Donation amount
            <input name="amount" type="text" inputmode="decimal" required maxlength="12" placeholder="25.00" aria-describedby="donate-amount-hint">
          </label>
          <p class="sponsor-signup-pay-note" id="donate-amount-hint">Enter any amount of $5 or more (USD).</p>
          <p class="status" data-donate-status></p>
          <div class="sponsor-signup-actions">
            <button class="btn outline" type="button" data-donate-cancel>Cancel</button>
            <button class="btn primary" type="submit">Next</button>
          </div>
        </form>
      </div>
      <div class="sponsor-signup-step" data-donate-step="payment" hidden>
        <div class="sponsor-signup-payment-body" data-donate-pay-body>
          <div class="sponsor-signup-summary">
            <p><span>Donor</span><strong data-donate-pay-name></strong></p>
            <p><span>Amount</span><strong data-donate-pay-amount></strong></p>
          </div>
          <p class="sponsor-signup-pay-note">Your gift supports instruments, travel, meals, uniforms, and student opportunities.</p>
          <p class="status" data-donate-pay-status></p>
        </div>
        <div class="sponsor-signup-actions sponsor-signup-actions-split" data-donate-pay-actions>
          <button class="btn outline" type="button" data-donate-cancel>Cancel</button>
          <div class="sponsor-signup-actions-end">
            <button class="btn outline" type="button" data-donate-back>Back</button>
            <button class="btn primary" type="button" data-donate-pay>Pay with Square</button>
          </div>
        </div>
      </div>
      <div class="sponsor-signup-confirm" data-donate-confirm hidden>
        <div class="sponsor-signup-confirm-card" role="alertdialog" aria-labelledby="donate-confirm-title" aria-describedby="donate-confirm-copy">
          <h4 id="donate-confirm-title">Are you sure?</h4>
          <p id="donate-confirm-copy">Canceling returns you to the sponsor/donation page and discards this donation.</p>
          <div class="sponsor-signup-actions">
            <button class="btn outline" type="button" data-confirm-no>No</button>
            <button class="btn primary" type="button" data-confirm-yes>Yes</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add('sponsor-signup-open');
  requestAnimationFrame(() => modal.classList.add('is-visible'));

  const form = modal.querySelector('[data-donate-form]');
  const detailsStep = modal.querySelector('[data-donate-step="details"]');
  const paymentStep = modal.querySelector('[data-donate-step="payment"]');
  const payBody = modal.querySelector('[data-donate-pay-body]');
  const status = modal.querySelector('[data-donate-status]');
  const payStatus = modal.querySelector('[data-donate-pay-status]');

  function finishDonateSuccess(detail) {
    closeDonateModal({ immediate: true });
    showTransientToast(detail || 'Thank you for your donation!');
  }

  async function embedCardCheckout(donation, config) {
    if (!payBody) return;
    modal.classList.add('is-checkout');
    const headCopy = modal.querySelector('[data-donate-head-copy]');
    const amountDisplay = donation.amount_display || formatDonateAmountDisplay(donation.amount_cents);
    if (headCopy) {
      headCopy.innerHTML = `Enter card details to donate <strong>${escapeHtml(amountDisplay)}</strong>.`;
    }
    payBody.innerHTML = `
      <div class="sponsor-signup-summary">
        <p><span>Donor</span><strong>${escapeHtml(donation.donor_name || donateModalState.draft?.donorName || '')}</strong></p>
        <p><span>Amount</span><strong>${escapeHtml(amountDisplay)}</strong></p>
      </div>
      <div class="sponsor-signup-card-box">
        <div id="donate-square-card" class="sponsor-signup-card-host"></div>
      </div>
      <p class="status" data-donate-pay-status>Loading secure card form…</p>
    `;
    const liveStatus = payBody.querySelector('[data-donate-pay-status]');
    const payContinue = modal.querySelector('[data-donate-pay]');
    if (payContinue) {
      payContinue.hidden = false;
      payContinue.disabled = true;
      payContinue.textContent = `Donate ${amountDisplay}`;
    }
    const Square = await loadSquareWebSdk(config.environment || 'production');
    const payments = Square.payments(config.application_id, config.location_id);
    const card = await payments.card();
    await card.attach('#donate-square-card');
    if (liveStatus) {
      liveStatus.innerHTML = `
        <span class="sponsor-signup-square-status">
          <svg class="sponsor-signup-square-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M4.5 0A4.5 4.5 0 0 0 0 4.5v15A4.5 4.5 0 0 0 4.5 24h15a4.5 4.5 0 0 0 4.5-4.5v-15A4.5 4.5 0 0 0 19.5 0h-15Zm2.036 7.536h4.928v4.928H6.536V7.536Zm6 0H17.464v4.928h-4.928V7.536Zm-6 6h4.928v4.928H6.536v-4.928Zm6 0H17.464v4.928h-4.928v-4.928Z"/>
          </svg>
          <span>Square Secure Payment Ready.</span>
        </span>
      `;
    }
    if (payContinue) {
      payContinue.disabled = false;
      payContinue.onclick = async () => {
        payContinue.disabled = true;
        if (liveStatus) liveStatus.textContent = 'Processing payment…';
        try {
          const verificationDetails = {
            amount: (Number(donation.amount_cents) / 100).toFixed(2),
            currencyCode: 'USD',
            intent: 'CHARGE',
            customerInitiated: true,
            sellerKeyedIn: false,
            billingContact: {
              givenName: String(donation.donor_name || donateModalState.draft?.donorName || 'Donor').slice(0, 100),
              countryCode: 'US',
            },
          };
          const result = await card.tokenize(verificationDetails);
          if (result.status !== 'OK' || !result.token) {
            const message = result.errors?.[0]?.message || 'Card could not be processed.';
            throw new Error(message);
          }
          const response = await fetch(`/api/donations/${encodeURIComponent(donation.id)}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: donation.completion_token,
              source_id: result.token,
            }),
          });
          const paid = await response.json().catch(() => ({}));
          if (!response.ok || !paid.ok) throw new Error(paid.detail || 'Payment failed');
          finishDonateSuccess(paid.detail);
        } catch (error) {
          if (liveStatus) liveStatus.textContent = error.message || 'Payment failed.';
          payContinue.disabled = false;
        }
      };
    }
  }

  async function ensureDonation() {
    const draft = donateModalState?.draft;
    if (!draft) throw new Error('Donor details are required.');
    if (donateModalState.donation?.id && donateModalState.donation.completion_token
      && Number(donateModalState.donation.amount_cents) === Number(draft.amountCents)
      && String(donateModalState.donation.donor_name || '') === draft.donorName) {
      return donateModalState.donation;
    }
    const response = await fetch('/api/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donor_name: draft.donorName,
        amount_cents: draft.amountCents,
        amount_display: draft.amountDisplay,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || 'Could not save donation');
    donateModalState.donation = result;
    return result;
  }

  function resetPaymentStepPreview() {
    modal.classList.remove('is-checkout');
    const draft = donateModalState?.draft;
    if (payBody) {
      payBody.innerHTML = `
        <div class="sponsor-signup-summary">
          <p><span>Donor</span><strong data-donate-pay-name>${escapeHtml(draft?.donorName || '')}</strong></p>
          <p><span>Amount</span><strong data-donate-pay-amount>${escapeHtml(draft?.amountDisplay || '')}</strong></p>
        </div>
        <p class="sponsor-signup-pay-note">Your gift supports instruments, travel, meals, uniforms, and student opportunities.</p>
        <p class="status" data-donate-pay-status></p>
      `;
    }
    const payContinue = modal.querySelector('[data-donate-pay]');
    if (payContinue) {
      payContinue.hidden = false;
      payContinue.disabled = false;
      payContinue.textContent = 'Pay with Square';
      payContinue.onclick = null;
    }
    const headCopy = modal.querySelector('[data-donate-head-copy]');
    if (headCopy) {
      headCopy.textContent = 'Enter your name and a custom amount, then continue to secure Square checkout.';
    }
  }

  modal.querySelectorAll('[data-donate-cancel]').forEach((button) => {
    button.addEventListener('click', () => showDonateConfirm(modal));
  });
  modal.querySelector('[data-confirm-no]')?.addEventListener('click', () => hideDonateConfirm(modal));
  modal.querySelector('[data-confirm-yes]')?.addEventListener('click', () => closeDonateModal());

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (status) status.textContent = '';
    const donorName = String(form.elements.donor_name?.value || '').trim();
    const amountRaw = String(form.elements.amount?.value || '').trim();
    const amountCents = parseDonateAmountCents(amountRaw);
    if (!donorName) {
      if (status) status.textContent = 'Please enter your name.';
      form.elements.donor_name?.focus();
      return;
    }
    if (!amountCents || amountCents < 500) {
      if (status) status.textContent = 'Enter a donation amount of at least $5.';
      form.elements.amount?.focus();
      return;
    }
    if (amountCents > 2_500_000) {
      if (status) status.textContent = 'Donation amount cannot exceed $25,000.';
      form.elements.amount?.focus();
      return;
    }
    const amountDisplay = formatDonateAmountDisplay(amountCents);
    donateModalState.draft = { donorName, amountCents, amountDisplay };
    donateModalState.donation = null;
    resetPaymentStepPreview();
    detailsStep.hidden = true;
    paymentStep.hidden = false;
    modal.querySelector('[data-donate-pay]')?.focus();
  });

  modal.querySelector('[data-donate-back]')?.addEventListener('click', () => {
    resetPaymentStepPreview();
    paymentStep.hidden = true;
    detailsStep.hidden = false;
    if (status) status.textContent = '';
    form?.elements.donor_name?.focus();
  });

  async function startSquarePayment() {
    const payButton = modal.querySelector('[data-donate-pay]');
    const statusEl = modal.querySelector('[data-donate-pay-status]');
    if (statusEl) statusEl.textContent = 'Saving donation…';
    if (payButton) payButton.disabled = true;
    try {
      const [result, config] = await Promise.all([
        ensureDonation(),
        fetch('/api/sponsor-checkout/config', { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);
      if (config?.web_payments) {
        await embedCardCheckout(result, config);
        return;
      }
      if (config?.mock_enabled) {
        const paid = await fetch(`/api/donations/${encodeURIComponent(result.id)}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: result.completion_token, mock: true }),
        }).then((response) => response.json().catch(() => ({})));
        if (!paid.ok) throw new Error(paid.detail || 'Mock payment failed');
        finishDonateSuccess(paid.detail);
        return;
      }
      if (statusEl) {
        statusEl.textContent = result.detail
          || 'Donation saved. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.';
      }
      if (payButton) payButton.disabled = false;
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || 'Could not continue to payment.';
      if (payButton) payButton.disabled = false;
    }
  }

  modal.querySelector('[data-donate-pay]')?.addEventListener('click', () => {
    if (modal.classList.contains('is-checkout')) return;
    startSquarePayment();
  });

  form?.querySelector('input[name="donor_name"]')?.focus();
}

function bindDonateButtons(root = document) {
  if (isCmsAdminPreviewContext(root)) return;
  root.querySelectorAll('[data-donate-open]').forEach((button) => {
    if (button.dataset.donateBound === '1') return;
    if (button.closest('#page-preview, .cms-shell, .admin-body')) return;
    if (button.hasAttribute('disabled')) return;
    button.dataset.donateBound = '1';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openDonateModal();
    });
  });
}

hydrateMarqueeFromCache();
loadPublicContent();
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const donate = document.querySelector('.donate-modal');
  if (donate) {
    const confirm = donate.querySelector('[data-donate-confirm]');
    if (confirm && !confirm.hidden) {
      hideDonateConfirm(donate);
      return;
    }
    showDonateConfirm(donate);
    return;
  }
  const signup = document.querySelector('.sponsor-signup-modal:not(.donate-modal)');
  if (signup) {
    const confirm = signup.querySelector('[data-signup-confirm]');
    if (confirm && !confirm.hidden) {
      hideSponsorSignupConfirm(signup);
      return;
    }
    showSponsorSignupConfirm(signup);
    return;
  }
  closeSponsorMapModal();
});
