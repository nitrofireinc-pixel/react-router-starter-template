function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
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

function formatHeaderBrandTitle(value) {
  const plain = String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  const match = plain.match(/^(East Forsyth)\s+(.+)$/i);
  if (!match) return formatInlineRichText(value);
  return `<small>${escapeHtml(match[1])}</small><span class="brand-title-rest">${escapeHtml(match[2])}</span>`;
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

const SPONSOR_MARQUEE_FILES = new Set([
  'calendar.html',
  'fundraising.html',
  'sponsors.html',
  'coming-soon.html',
  'join.html',
  'volunteer.html',
]);

function publicPathShowsSponsorMarquee(pathname = '') {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/' || /(?:^|\/)index\.html$/i.test(path)) return true;
  const file = path.split('/').pop() || '';
  return SPONSOR_MARQUEE_FILES.has(file);
}

function sponsorMarqueeEnabled() {
  if (document.body?.classList.contains('admin-body')) return false;
  if (document.body?.classList.contains('maintenance-body')) return false;
  if (document.querySelector('.cms-shell')) return false;
  const flag = document.body?.dataset?.sponsorMarquee;
  if (flag === 'off') return false;
  if (flag === 'on') return true;
  return publicPathShowsSponsorMarquee(location.pathname || '/');
}

const MARQUEE_SLOT_SELECTOR = 'section.sponsor-marquee-section[data-sponsor-marquee], [data-sponsor-marquee]:not(html):not(body)';

function isPageRootNode(node) {
  return Boolean(node) && (node === document.body || node === document.documentElement);
}

function querySponsorMarqueeSlots(root = document) {
  const nodes = [];
  if (!root) return nodes;
  if (typeof root.querySelectorAll !== 'function') return nodes;
  root.querySelectorAll(MARQUEE_SLOT_SELECTOR).forEach((node) => {
    if (!node || isPageRootNode(node)) return;
    if (typeof node.contains === 'function' && node.contains(document.body)) return;
    nodes.push(node);
  });
  return nodes;
}

function querySponsorMarqueeSlot(root = document) {
  return querySponsorMarqueeSlots(root)[0] || null;
}

function removeSponsorMarquee() {
  querySponsorMarqueeSlots().forEach((node) => node.remove());
}

function canPlaceInSiteChrome(parent, child) {
  if (!parent || !child || parent === child) return false;
  if (isPageRootNode(child) || isPageRootNode(parent)) return false;
  if (typeof child.contains === 'function' && child.contains(parent)) return false;
  return child.parentElement !== parent;
}

// --- Homepage fly-in weighted rotation (per-visitor cursor in localStorage; no server writes) ---
const SPONSOR_FLYIN_CURSOR_KEY = 'efhs-sponsor-flyin-cursor-v1';
const SPONSOR_FLYIN_DEFAULT_WEIGHTS = { gold: 2, silver: 1 };
function sponsorFlyinHouseAd(tier) {
  const label = tier === 'gold' ? 'Gold' : 'Silver';
  return {
    id: `house-become-a-${tier}-sponsor`,
    name: 'Advertise here',
    level: `Become a ${label} sponsor`,
    tier,
    tier_label: `Your ${label}`,
    mark_text: '★',
    flyin_href: '/become-a-sponsor.html',
    flyin_cta: `Become a ${label} sponsor`,
    is_house_ad: true,
  };
}

function normalizeFlyinWeight(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(0, n));
}

function flyinGcd(a, b) { return b ? flyinGcd(b, a % b) : a; }

// Build one full deterministic rotation: tiers interleaved by smooth weighted
// round-robin, sponsors in each tier taken in order so each gets an equal share.
function buildSponsorFlyinRotation(gold = [], silver = [], weights = {}) {
  const tiers = [
    { list: Array.isArray(gold) ? gold : [], weight: normalizeFlyinWeight(weights.gold, SPONSOR_FLYIN_DEFAULT_WEIGHTS.gold) },
    { list: Array.isArray(silver) ? silver : [], weight: normalizeFlyinWeight(weights.silver, SPONSOR_FLYIN_DEFAULT_WEIGHTS.silver) },
  ].filter((tier) => tier.list.length && tier.weight > 0);
  if (!tiers.length) return [];
  const totalWeight = tiers.reduce((sum, tier) => sum + tier.weight, 0);
  // Tier pattern for one cycle (e.g. 2:1 -> G S G).
  const current = tiers.map(() => 0);
  const pattern = [];
  for (let i = 0; i < totalWeight; i += 1) {
    let best = 0;
    tiers.forEach((tier, index) => {
      current[index] += tier.weight;
      if (current[index] > current[best]) best = index;
    });
    current[best] -= totalWeight;
    pattern.push(best);
  }
  // Repeat cycles until every tier list wraps evenly (capped for safety).
  let cycles = 1;
  tiers.forEach((tier) => {
    const need = tier.list.length / flyinGcd(tier.list.length, tier.weight);
    cycles = (cycles * need) / flyinGcd(cycles, need);
  });
  cycles = Math.min(cycles, 120);
  const cursors = tiers.map(() => 0);
  const rotation = [];
  for (let c = 0; c < cycles; c += 1) {
    pattern.forEach((tierIndex) => {
      const tier = tiers[tierIndex];
      rotation.push(tier.list[cursors[tierIndex] % tier.list.length]);
      cursors[tierIndex] += 1;
    });
  }
  // Avoid the same sponsor back to back (including wrap-around) when possible.
  const same = (a, b) => a === b || (a?.id != null && a?.id === b?.id);
  for (let i = 0; i < rotation.length && rotation.length > 2; i += 1) {
    const next = (i + 1) % rotation.length;
    if (!same(rotation[i], rotation[next])) continue;
    for (let j = 2; j < rotation.length; j += 1) {
      const k = (i + j) % rotation.length;
      const after = (k + 1) % rotation.length;
      const before = (k - 1 + rotation.length) % rotation.length;
      if (!same(rotation[k], rotation[i])
        && !same(rotation[before === next ? i : before], rotation[next])
        && !same(rotation[after], rotation[next])) {
        [rotation[next], rotation[k]] = [rotation[k], rotation[next]];
        break;
      }
    }
  }
  return rotation;
}

function sponsorFlyinTiers(sponsors = [], site = {}) {
  const gold = [];
  const silver = [];
  (Array.isArray(sponsors) ? sponsors : []).filter((sponsor) => sponsorShowsFlyin(sponsor) && !sponsor.is_house_ad).forEach((sponsor) => {
    if (resolveSponsorTierKey(sponsor) === 'gold') gold.push(sponsor);
    else silver.push(sponsor);
  });
  const houseOff = site?.sponsor_flyin_house_ad === 0 || site?.sponsor_flyin_house_ad === '0' || site?.sponsor_flyin_house_ad === false;
  // Auto "advertise here" card for any fly-in tier that has no real sponsors yet.
  if (!houseOff) {
    if (!gold.length) gold.push(sponsorFlyinHouseAd('gold'));
    if (!silver.length) silver.push(sponsorFlyinHouseAd('silver'));
  }
  return { gold, silver };
}

function pickRotatingSponsor(sponsors = [], site = {}, storage) {
  const { gold, silver } = sponsorFlyinTiers(sponsors, site);
  const rotation = buildSponsorFlyinRotation(gold, silver, {
    gold: site?.sponsor_flyin_gold_weight,
    silver: site?.sponsor_flyin_silver_weight,
  });
  if (!rotation.length) return null;
  let cursor;
  try {
    const store = storage === undefined ? window.localStorage : storage;
    const raw = Number.parseInt(store.getItem(SPONSOR_FLYIN_CURSOR_KEY) || '0', 10);
    cursor = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    store.setItem(SPONSOR_FLYIN_CURSOR_KEY, String((cursor + 1) % 100000));
  } catch {
    cursor = Math.floor(Math.random() * rotation.length);
  }
  return rotation[cursor % rotation.length];
}

// After a sponsor popup hides, taps that land where it was must not reach a
// donate trigger underneath (its X sits over the hero Support button on phones).
const SPONSOR_FLYIN_FADE_MS = 600; // >= longest panel transition (.55s)
const SPONSOR_FLYIN_GUARD_MS = 450;
let sponsorFlyinGuard = null;

function sponsorFlyinGuardBlocks(event) {
  const guard = sponsorFlyinGuard;
  if (!guard) return false;
  if (Date.now() > guard.until) {
    sponsorFlyinGuard = null;
    return false;
  }
  // Any ghost/compat click in the guard window is swallowed, wherever it lands
  // (the X can sit outside the panel rect, over the hero Support button).
  const target = event.target instanceof Element ? event.target : null;
  if (target && target.closest('.sponsor-flyin:not(.is-leaving)')) return false;
  // Keyboard-activated clicks are deliberate.
  if (event.detail === 0 && !event.clientX && !event.clientY) return false;
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    if (!sponsorFlyinGuardBlocks(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

let sponsorPopupClosedAt = 0;
function markSponsorPopupClose() { sponsorPopupClosedAt = Date.now(); }
/** Donate openers ignore input for 600ms after any sponsor popup close/press. */
function sponsorPopupRecentlyClosed() {
  return Date.now() - sponsorPopupClosedAt < 600 || !!document.querySelector('.sponsor-flyin.is-leaving');
}

const SPONSOR_POPUP_DISMISSED_KEY = 'efhs-sponsor-popup-dismissed-v2';
const SPONSOR_POPUP_LEGACY_KEY = 'efhs-sponsor-popup-dismissed-v1';
/** A "visit" ends after 30 idle minutes, so a dismissal only lasts for that visit. */
const SPONSOR_VISIT_IDLE_MS = 30 * 60 * 1000;
/**
 * Dismissals are stamped with the visit's last activity. sessionStorage alone
 * outlives a visit (tab restore, mobile Safari tabs, hard refresh), which left
 * returning browsers permanently silenced by the old '1' flag.
 */
function sponsorPopupDismissedForSession() {
  try {
    sessionStorage.removeItem(SPONSOR_POPUP_LEGACY_KEY);
    const raw = JSON.parse(sessionStorage.getItem(SPONSOR_POPUP_DISMISSED_KEY) || 'null');
    const seen = Number(raw?.seen);
    if (!Number.isFinite(seen) || Date.now() - seen > SPONSOR_VISIT_IDLE_MS || seen > Date.now() + 60000) {
      sessionStorage.removeItem(SPONSOR_POPUP_DISMISSED_KEY);
      return false;
    }
    sessionStorage.setItem(SPONSOR_POPUP_DISMISSED_KEY, JSON.stringify({ at: raw.at, seen: Date.now() }));
    return true;
  } catch { return false; }
}
function rememberSponsorPopupDismissed() {
  try { sessionStorage.setItem(SPONSOR_POPUP_DISMISSED_KEY, JSON.stringify({ at: Date.now(), seen: Date.now() })); } catch { /* storage unavailable */ }
}
const SPONSOR_TAP_SHIELD_MS = 400;
/** Transparent full-screen layer that eats the tap that closed the ad (and its ghost click). */
function raiseSponsorTapShield(ms) {
  if (typeof document === 'undefined' || !document.body) return;
  let shield = document.querySelector('.sponsor-flyin-shield');
  if (!shield) {
    shield = document.createElement('div');
    shield.className = 'sponsor-flyin-shield';
    shield.setAttribute('aria-hidden', 'true');
    const eat = (event) => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); };
    ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach((type) => shield.addEventListener(type, eat, { passive: false, capture: true }));
    document.body.appendChild(shield);
  }
  window.clearTimeout(Number(shield.dataset.timer || 0));
  shield.dataset.timer = String(window.setTimeout(() => shield.remove(), ms));
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  // Back/forward cache restores: drop any popup that was frozen on screen.
  window.addEventListener('pageshow', () => {
    if (!sponsorPopupDismissedForSession()) return;
    document.querySelectorAll('.sponsor-flyin[data-sponsor-ad]').forEach((el) => el.remove());
    document.body?.classList.remove('sponsor-flyin-open');
  });
}

function dismissSponsorAd(root) {
  markSponsorPopupClose();
  if (!root || root.dataset.flyinLeaving === '1') return;
  root.dataset.flyinLeaving = '1';
  const panel = root.querySelector('.sponsor-flyin-panel') || root;
  const box = panel.getBoundingClientRect();
  const rect = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  // Guard covers the whole fade plus the grace period after removal.
  sponsorFlyinGuard = { rect, until: Date.now() + SPONSOR_FLYIN_FADE_MS + SPONSOR_FLYIN_GUARD_MS };
  raiseSponsorTapShield(SPONSOR_FLYIN_FADE_MS + SPONSOR_TAP_SHIELD_MS);
  root.classList.add('is-leaving');
  root.classList.remove('is-visible');
  document.body.classList.remove('sponsor-flyin-open');
  window.setTimeout(() => { root.remove(); markSponsorPopupClose(); }, SPONSOR_FLYIN_FADE_MS);
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
  if (/\bhonorable(?:[\s_-]+mention)?\b/.test(raw)) return 'honorable';
  return '';
}

function showHomepageSponsorAd(sponsor, durationSeconds = 6) {
  if (!sponsor || document.querySelector('.sponsor-flyin') || sponsorPopupDismissedForSession()) return;

  const tier = resolveSponsorTierKey(sponsor);
  const tierClass = tier ? ` tier-${tier}` : '';
  const logo = sponsor.logo_url
    ? `<span class="sponsor-flyin-logo"><img src="${escapeHtml(sponsor.logo_url)}" alt="${escapeHtml(sponsor.name)} logo"></span>`
    : `<span class="sponsor-flyin-mark" aria-hidden="true">${escapeHtml(sponsor.mark_text || '★')}</span>`;

  const root = document.createElement('aside');
  root.className = `sponsor-flyin${tierClass}`;
  root.dataset.sponsorAd = '1';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Featured sponsor');
  root.innerHTML = `
    <button type="button" class="sponsor-flyin-backdrop" aria-label="Dismiss sponsor ad"></button>
    <div class="sponsor-flyin-panel">
      <button type="button" class="sponsor-flyin-close" aria-label="Close sponsor ad"><span aria-hidden="true">×</span></button>
      <div class="sponsor-flyin-card" role="button" tabindex="0" aria-label="Close sponsor ad">
        ${logo}
        <div class="sponsor-flyin-copy">
          <span class="sponsor-flyin-kicker">${escapeHtml(sponsor.tier_label || 'Community')} Partner</span>
          <strong>${escapeHtml(sponsor.name)}</strong>
          <span class="sponsor-flyin-tier">${escapeHtml(sponsor.level || 'Sponsor')}</span>
          <em>${escapeHtml(sponsor.flyin_cta || 'View all sponsors')}</em>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  document.body.classList.add('sponsor-flyin-open');
  requestAnimationFrame(() => root.classList.add('is-visible'));

  const close = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    rememberSponsorPopupDismissed();
    dismissSponsorAd(root);
  };
  // The X sits outside the card link with a wide hit zone, so a near-miss
  // can't open /sponsors.html.
  root.querySelectorAll('.sponsor-flyin-close').forEach((closeBtn) => {
  closeBtn.addEventListener('click', close);
  // Cancel the press so no compatibility click is synthesized onto whatever
  // sits under the X; the close itself runs on touchend / click.
  ['pointerdown', 'touchstart', 'pointerup', 'mousedown', 'mouseup', 'touchend'].forEach((type) => {
    closeBtn?.addEventListener(type, (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      markSponsorPopupClose();
      if (type === 'touchend') { rememberSponsorPopupDismissed(); dismissSponsorAd(root); }
    }, { passive: false });
  });
  });
  root.querySelector('.sponsor-flyin-backdrop')?.addEventListener('click', close);
  // The card is not a link: clicking or tapping anywhere on it closes the ad.
  const cardEl = root.querySelector('.sponsor-flyin-card');
  cardEl?.addEventListener('click', close);
  cardEl?.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') close(event); });
  // While the popup fades out, swallow taps so they never reach a donate
  // trigger (e.g. the sticky Support button) underneath.
  root.addEventListener('click', (event) => {
    if (!root.classList.contains('is-leaving')) return;
    event.preventDefault();
    event.stopPropagation();
  });

  // Rule: any tap on the ad (X, card, backdrop) only closes it - never navigates.
  // Capture on the root so nothing underneath (News tab, ticker) gets the press.
  ['pointerdown', 'touchstart', 'mousedown'].forEach((type) => {
    root.addEventListener(type, (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      markSponsorPopupClose();
      if (type === 'pointerdown') pressingStart();
    }, { passive: false, capture: true });
  });
  ['touchend', 'pointerup', 'click'].forEach((type) => {
    root.addEventListener(type, (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      if (type === 'pointerup' && event.pointerType === 'mouse') return; // mouse closes on click
      rememberSponsorPopupDismissed();
      dismissSponsorAd(root);
    }, { passive: false, capture: true });
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { rememberSponsorPopupDismissed(); dismissSponsorAd(root); }
  });

  // Don't auto-hide while a finger or pointer is down on the popup.
  let pressing = false;
  let hideDue = false;
  const release = () => {
    pressing = false;
    if (hideDue && document.body.contains(root)) dismissSponsorAd(root);
  };
  function pressingStart() { pressing = true; }
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);

  const durationMs = normalizeSponsorAdSeconds(durationSeconds, 6) * 1000;
  window.setTimeout(() => {
    if (!document.body.contains(root)) return;
    if (pressing) { hideDue = true; return; }
    dismissSponsorAd(root);
  }, durationMs);
}

function sponsorShowsFlyin(sponsor = {}) {
  if (Number(sponsor.active) === 0) return false;
  const tierKey = resolveSponsorTierKey(sponsor);
  if (tierKey === 'bronze' || tierKey === 'honorable') return false;
  if (sponsor.show_flyin === true || sponsor.show_flyin === 1) return true;
  const tier = String(sponsor.tier || sponsor.level || '').toLowerCase();
  return /\b(silver|gold)\b/.test(tier) || Number(sponsor.homepage_ad) === 1;
}

function sponsorShowsMarquee(sponsor = {}) {
  if (sponsor.show_marquee === false || sponsor.show_marquee === 0) return false;
  const tier = String(sponsor.tier || sponsor.level || '').toLowerCase();
  return /\b(bronze|silver|gold|honorable)\b/.test(tier) || sponsor.show_marquee === true || sponsor.show_marquee === 1;
}

const MARQUEE_CACHE_KEY = 'efhs-sponsor-marquee-v4';

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

function paidSponsorsFirst(sponsors = []) {
  const list = Array.isArray(sponsors) ? sponsors : [];
  const paid = [];
  const mention = [];
  for (const sponsor of list) {
    if (resolveSponsorTierKey(sponsor) === 'honorable') mention.push(sponsor);
    else paid.push(sponsor);
  }
  return [...paid, ...mention];
}

function buildSponsorMarqueeMarkup(sponsors = []) {
  const items = paidSponsorsFirst((Array.isArray(sponsors) ? sponsors : []).filter(sponsorShowsMarquee));
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

function readPublicBootstrap() {
  if (Object.prototype.hasOwnProperty.call(readPublicBootstrap, 'value')) return readPublicBootstrap.value;
  const node = document.getElementById('efhs-public-read');
  if (!node) {
    readPublicBootstrap.value = null;
    return null;
  }
  try {
    const parsed = JSON.parse(node.textContent || 'null');
    readPublicBootstrap.value = parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    readPublicBootstrap.value = null;
  }
  return readPublicBootstrap.value;
}

const SQUARE_SDK_TIMEOUT_MS = 15000;

function squareSdkSrc(environment = 'production') {
  return environment === 'sandbox'
    ? 'https://sandbox.web.squarecdn.com/v1/square.js'
    : 'https://web.squarecdn.com/v1/square.js';
}

function readSquarePublishableConfig() {
  const square = readPublicBootstrap()?.square;
  if (!square || typeof square !== 'object') return null;
  const application_id = String(square.application_id || '').trim();
  const location_id = String(square.location_id || '').trim();
  if (!application_id && !location_id) return null;
  return {
    application_id,
    location_id,
    environment: square.environment === 'sandbox' ? 'sandbox' : 'production',
    web_payments: Boolean(square.web_payments || (application_id && location_id)),
  };
}

async function fetchSquarePublishableConfig() {
  const boot = readSquarePublishableConfig();
  if (boot?.application_id && boot?.location_id) {
    return { ...boot, web_payments: true };
  }
  const config = await fetch('/api/sponsor-checkout/config', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  if (!config || typeof config !== 'object') return boot;
  const application_id = String(config.application_id || boot?.application_id || '').trim();
  const location_id = String(config.location_id || boot?.location_id || '').trim();
  return {
    application_id,
    location_id,
    environment: config.environment === 'sandbox' || boot?.environment === 'sandbox' ? 'sandbox' : 'production',
    web_payments: Boolean(config.web_payments || (application_id && location_id)),
    mock_enabled: Boolean(config.mock_enabled),
    detail: config.detail || '',
  };
}

function loadSquareWebSdk(environment = 'production') {
  if (typeof window !== 'undefined' && window.Square) return Promise.resolve(window.Square);
  const existing = typeof document !== 'undefined'
    ? document.querySelector('script[data-square-web-sdk]')
    : null;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, sdk) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(sdk);
    };
    const waitForSquare = (script) => {
      if (window.Square) {
        finish(null, window.Square);
        return;
      }
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.Square) {
          window.clearInterval(timer);
          finish(null, window.Square);
        } else if (Date.now() - started > SQUARE_SDK_TIMEOUT_MS) {
          window.clearInterval(timer);
          finish(new Error('Square.js failed to load'));
        }
      }, 50);
      script?.addEventListener('error', () => {
        window.clearInterval(timer);
        finish(new Error('Could not load Square payment form'));
      });
    };
    if (existing) {
      waitForSquare(existing);
      return;
    }
    if (typeof document === 'undefined' || !document.head) {
      finish(new Error('Could not load Square payment form'));
      return;
    }
    const script = document.createElement('script');
    script.dataset.squareWebSdk = '1';
    script.src = squareSdkSrc(environment);
    script.onload = () => waitForSquare(script);
    script.onerror = () => finish(new Error('Could not load Square payment form'));
    document.head.appendChild(script);
  });
}

function prefetchSquareWebSdk(environment = 'production') {
  loadSquareWebSdk(environment).catch(() => {});
}

async function attachSquareCard(config, hostSelector) {
  const applicationId = String(config?.application_id || '').trim();
  const locationId = String(config?.location_id || '').trim();
  if (!applicationId || !locationId) {
    throw new Error('Square card form is not configured.');
  }
  const Square = await loadSquareWebSdk(config.environment || 'production');
  const payments = Square.payments(applicationId, locationId);
  const card = await payments.card();
  await card.attach(hostSelector);
  return card;
}

async function maybeShowHomepageSponsorAd() {
  if (!isHomePage()) return;
  try {
    const bootstrap = readPublicBootstrap();
    const [sponsors, site] = await Promise.all([
      Array.isArray(bootstrap?.sponsors)
        ? bootstrap.sponsors
        : fetch('/api/sponsors', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : [])),
      bootstrap?.site
        ? bootstrap.site
        : fetch('/api/site', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : {})),
    ]);
    const picked = pickRotatingSponsor(sponsors, site);
    if (picked) showHomepageSponsorAd(picked, site?.sponsor_ad_seconds);
  } catch {
    // Bypass the ad entirely if sponsors cannot be loaded.
  }
}

function ensurePublicBrandMark() {
  document.querySelectorAll('header.site-header a.brand').forEach((brand) => {
    const logo = brand.querySelector('img:not(.brand-mark)');
    if (logo) logo.classList.add('brand-logo');
    if (brand.querySelector('img.brand-mark')) return;
    const mark = document.createElement('img');
    mark.className = 'brand-mark';
    mark.src = '/assets/efhs-blue-regiment-mark.png?v=cms-p2-20261031s';
    mark.alt = 'East Forsyth Blue Regiment';
    mark.width = 48;
    mark.height = 48;
    brand.appendChild(mark);
  });
}

function ensureSiteChrome(header, marquee, deadlineMount) {
  if (!header || isPageRootNode(header)) return null;
  let chrome = document.querySelector('[data-site-chrome]');
  if (chrome && (isPageRootNode(chrome) || chrome === header || chrome.contains(document.body))) {
    chrome = null;
  }
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'site-chrome';
    chrome.setAttribute('data-site-chrome', '');
    header.parentNode?.insertBefore(chrome, header);
  }
  if (canPlaceInSiteChrome(chrome, header)) chrome.appendChild(header);
  if (canPlaceInSiteChrome(chrome, marquee)) chrome.appendChild(marquee);
  if (canPlaceInSiteChrome(chrome, deadlineMount)) chrome.appendChild(deadlineMount);
  if (marquee && !isPageRootNode(marquee) && marquee.previousElementSibling !== header) {
    header.after(marquee);
  }
  if (deadlineMount && !isPageRootNode(deadlineMount) && marquee && !isPageRootNode(marquee)
    && deadlineMount.previousElementSibling !== marquee) {
    marquee.after(deadlineMount);
  } else if (deadlineMount && !isPageRootNode(deadlineMount) && (!marquee || isPageRootNode(marquee))
    && deadlineMount.previousElementSibling !== header) {
    header.after(deadlineMount);
  }
  return chrome;
}

function ensureSponsorMarqueeMount() {
  if (!sponsorMarqueeEnabled()) {
    removeSponsorMarquee();
    return null;
  }
  const header = document.querySelector('header.site-header');
  if (!header) return querySponsorMarqueeSlot();

  let mount = querySponsorMarqueeSlot();
  if (!mount) {
    mount = document.createElement('section');
    mount.className = 'sponsor-marquee-section';
    mount.setAttribute('data-sponsor-marquee', '');
    mount.setAttribute('aria-label', 'Sponsor marquee');
    mount.hidden = true;
  }
  ensureSiteChrome(header, mount, document.querySelector('[data-site-deadline-banners]'));
  querySponsorMarqueeSlots().forEach((node) => {
    if (node !== mount) node.remove();
  });
  return mount;
}

function renderSponsorMarquee(sponsors = []) {
  if (!sponsorMarqueeEnabled()) {
    removeSponsorMarquee();
    return;
  }
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

function syncSponsorTickerSpace() {
  const set = () => {
    const m = document.querySelector('.sponsor-marquee-section:not([hidden])');
    const h = m?.getBoundingClientRect ? Math.ceil(m.getBoundingClientRect().height) : 0;
    document.body?.style?.setProperty?.('--sponsor-ticker-h', `${h}px`);
    document.body?.style?.setProperty?.('--sponsor-ticker-vis', `${m?.classList?.contains('is-ticker-away') ? 0 : h}px`);
  };
  set();
  if (typeof ResizeObserver === 'function' && !syncSponsorTickerSpace.ro) {
    syncSponsorTickerSpace.ro = new ResizeObserver(set);
    const m = document.querySelector('.sponsor-marquee-section');
    if (m) syncSponsorTickerSpace.ro.observe(m); else syncSponsorTickerSpace.ro = null;
    if (typeof MutationObserver === 'function' && m) new MutationObserver(set).observe(m, { attributes: true, attributeFilter: ['hidden', 'class'] });
  }
  if (!syncSponsorTickerSpace.bound && typeof window !== 'undefined' && window.addEventListener) { syncSponsorTickerSpace.bound = true; window.addEventListener('resize', set, { passive: true }); 
    let lastY = window.scrollY || 0; let queued = false;
    const tick = () => {
      queued = false;
      const m = document.querySelector('.sponsor-marquee-section');
      if (!m) return;
      const y = window.scrollY || 0; const dy = y - lastY;
      const atBottom = y + window.innerHeight >= document.documentElement.scrollHeight - 24;
      if (atBottom || y <= 8) { m.classList.remove('is-ticker-away'); lastY = y; return; }
      if (Math.abs(dy) < 10) return;
      m.classList.toggle('is-ticker-away', dy > 0);
      lastY = y;
    };
    window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(tick); } }, { passive: true });
  }
}

function hydrateMarqueeFromCache() {
  if (!sponsorMarqueeEnabled()) {
    removeSponsorMarquee();
    return;
  }
  const mount = ensureSponsorMarqueeMount();
  if (mount && !mount.hidden && mount.querySelector('.sponsor-marquee-track')) {
    mount.dataset.marqueeReady = '1';
    mount.dataset.marqueeHtml = mount.innerHTML.trim();
  }
  const cached = readMarqueeCache();
  if (cached?.length) renderSponsorMarquee(cached);
  syncSponsorTickerSpace();
}

async function loadSponsorMarquee() {
  if (!sponsorMarqueeEnabled()) {
    removeSponsorMarquee();
    return;
  }
  try {
    const bootstrap = readPublicBootstrap();
    const sponsors = Array.isArray(bootstrap?.sponsors)
      ? bootstrap.sponsors
      : await fetch('/api/sponsors', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : []));
    const list = Array.isArray(sponsors) ? sponsors : [];
    writeMarqueeCache(list);
    renderSponsorMarquee(list);
    syncSponsorTickerSpace();
  } catch {
    // Keep any already-visible SSR/cache marquee in place.
  }
}

function isPublicSiteDeadlineContext() {
  if (document.body?.classList.contains('admin-body')) return false;
  if (document.querySelector('.cms-shell')) return false;
  return !isCmsAdminPreviewContext();
}

function safeDeadlineBannerHref(value) {
  const href = String(value || '').trim();
  if (!href || /^(javascript:|data:|vbscript:)/i.test(href)) return '/calendar.html';
  if (/^https?:\/\//i.test(href) || href.startsWith('/') || /^mailto:/i.test(href)) return href;
  return '/calendar.html';
}

function ensureSiteDeadlineBannersMount() {
  if (!isPublicSiteDeadlineContext()) return document.querySelector('[data-site-deadline-banners]') || null;
  const header = document.querySelector('header.site-header');
  const marquee = sponsorMarqueeEnabled()
    ? (querySponsorMarqueeSlot() || ensureSponsorMarqueeMount())
    : null;
  if (!sponsorMarqueeEnabled()) removeSponsorMarquee();
  let mount = document.querySelector('[data-site-deadline-banners]');
  if (!mount) {
    mount = document.createElement('div');
    mount.className = 'site-deadline-banners';
    mount.setAttribute('data-site-deadline-banners', '');
    mount.hidden = true;
  }
  if (header) ensureSiteChrome(header, marquee, mount);
  else if (marquee && mount.previousElementSibling !== marquee) marquee.after(mount);
  document.querySelectorAll('[data-site-deadline-banners]').forEach((node) => {
    if (node !== mount) node.remove();
  });
  return mount;
}

function renderSiteDeadlineBanners(items = []) {
  const mount = ensureSiteDeadlineBannersMount();
  if (!mount) return;
  const banners = (Array.isArray(items) ? items : []).map((item) => {
    const text = String(item?.text || '').trim();
    if (!text) return '';
    const href = safeDeadlineBannerHref(item.href);
    const cta = String(item?.cta || 'View details').trim() || 'View details';
    return `<div class="caldev-deadline-banner" role="status">${escapeHtml(text)} <a href="${escapeHtml(href)}">${escapeHtml(cta)}</a></div>`;
  }).filter(Boolean);
  if (!banners.length) {
    mount.hidden = true;
    mount.innerHTML = '';
    syncNewsTuck(false);
    return;
  }
  mount.hidden = false;
  mount.innerHTML = banners.join('');
  syncNewsTuck(true);
}

// When the red IMPORTANT banner is showing, tuck the News strip off to the side
// behind a small rounded newspaper tab that slides it back out.
function syncNewsTuck(active) {
  const strip = document.querySelector('.news-strip');
  if (!strip || typeof document.createElement !== 'function') return;
  const dock = strip.parentElement?.classList?.contains('news-dock') ? strip.parentElement : null;
  if (!active) {
    if (dock) { dock.querySelector('.news-tab')?.remove(); dock.replaceWith(strip); }
    strip.classList.remove('is-tuckable', 'is-tucked');
    strip.inert = false; strip.removeAttribute('aria-hidden');
    return;
  }
  if (dock) return;
  if (!strip.id) strip.id = 'news-strip';
  strip.classList.add('is-tuckable');
  // Anchor the tab to the strip itself (in-page dock), not floating over the hero.
  const wrap = document.createElement('div');
  wrap.className = 'news-dock';
  strip.before(wrap);
  wrap.appendChild(strip);
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'news-tab';
  tab.setAttribute('aria-controls', strip.id);
  tab.innerHTML = '<span aria-hidden="true">📰</span><span class="news-tab-label">News</span>';
  tab.addEventListener('click', () => setNewsTucked(!strip.classList.contains('is-tucked')));
  tab.addEventListener('animationend', () => tab.classList.remove('is-bouncing'));
  wrap.prepend(tab);
  setNewsTucked(true);
  // Bounce once per browser, not on every reload.
  let seen = false;
  try { seen = localStorage.getItem('efhsNewsTabBounced') === '1'; localStorage.setItem('efhsNewsTabBounced', '1'); } catch { seen = true; }
  if (!seen) tab.classList.add('is-bouncing');
}

function setNewsTucked(tucked) {
  const strip = document.querySelector('.news-strip');
  const tab = document.querySelector('.news-tab');
  if (!strip || !tab) return;
  strip.classList.toggle('is-tucked', tucked);
  strip.parentElement?.classList?.toggle('is-tucked', tucked);
  if (tucked) strip.setAttribute('aria-hidden', 'true'); else strip.removeAttribute('aria-hidden');
  strip.inert = tucked;
  tab.classList.toggle('is-open', !tucked);
  tab.setAttribute('aria-expanded', tucked ? 'false' : 'true');
  tab.setAttribute('aria-label', tucked ? 'Show latest news' : 'Tuck away latest news');
  tab.title = tucked ? 'Show latest news' : 'Tuck away news';
}

async function loadSiteDeadlineBanners() {
  if (!isPublicSiteDeadlineContext()) return;
  ensureSiteDeadlineBannersMount();
  const bootstrap = readPublicBootstrap();
  if (Array.isArray(bootstrap?.deadlineBanners)) {
    renderSiteDeadlineBanners(bootstrap.deadlineBanners);
    return;
  }
  try {
    const items = await fetch('/api/caldev/deadline-banners', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []));
    renderSiteDeadlineBanners(Array.isArray(items) ? items : []);
  } catch {
    // Keep any server-rendered banners in place.
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
  root.classList.add('is-leaving');
  root.classList.remove('is-visible');
  window.clearTimeout(calendarDayToastLeaveTimer);
  calendarDayToastLeaveTimer = window.setTimeout(() => {
    root.hidden = true;
    root.classList.remove('is-leaving');
  }, 280);
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
  root.classList.remove('is-leaving');
  root.classList.remove('is-visible');
  void root.offsetWidth;
  root.classList.add('is-visible');
  window.setTimeout(() => root.querySelector('[data-calendar-day-close]')?.focus(), 40);
}

function eventCalendarParts(event) {
  const year = eventYearForCalendar(event);
  const monthIndex = MONTH_CALENDAR_LABELS.indexOf(String(event?.date_label || '').trim());
  const day = eventDayNumber(event);
  if (!Number.isFinite(year) || monthIndex < 0 || day == null) return null;
  return { year, monthIndex, day };
}

function calendarDaySortKey(year, monthIndex, day) {
  return (Number(year) * 10000) + ((Number(monthIndex) + 1) * 100) + Number(day);
}

/** Pick today if it has dated events; otherwise the soonest later day with events. */
function findNextDayWithEvents(allEvents, from = getPublicZonedYmd()) {
  const fromKey = calendarDaySortKey(from.year, from.month - 1, from.day);
  const buckets = new Map();
  for (const event of Array.isArray(allEvents) ? allEvents : []) {
    const parts = eventCalendarParts(event);
    if (!parts) continue;
    const key = calendarDaySortKey(parts.year, parts.monthIndex, parts.day);
    if (key < fromKey) continue;
    if (!buckets.has(key)) buckets.set(key, { ...parts, events: [] });
    buckets.get(key).events.push(event);
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  if (!keys.length) return null;
  return buckets.get(keys[0]);
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

function autoOpenCalendarDayToast(container, allEvents) {
  if (!container || container._calendarAutoOpened) return;
  container._calendarAutoOpened = true;
  const target = findNextDayWithEvents(allEvents);
  if (!target?.events?.length) return;
  const title = `${MONTH_CALENDAR_NAMES[target.monthIndex]} ${target.day}, ${target.year}`;
  window.setTimeout(() => showCalendarDayToast(title, target.events), 60);
}

function initMonthCalendars(allEvents) {
  const today = getPublicZonedYmd();
  const nextDay = findNextDayWithEvents(allEvents, today);
  document.querySelectorAll('[data-month-calendar]').forEach((container) => {
    const view = container._calendarView || {
      year: nextDay?.year ?? today.year,
      monthIndex: nextDay?.monthIndex ?? (today.month - 1),
    };
    container._calendarView = view;
    renderMonthCalendar(container, allEvents, view);
    autoOpenCalendarDayToast(container, allEvents);
  });
}

function highlightEventFromCaldev(event) {
  if (!event || typeof event !== 'object') {
    return { date_label: '', date_detail: '', title: '', description: '' };
  }
  if (event.date_label && event.date_detail) return event;
  const iso = String(event.start_date || '').trim();
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return {
      ...event,
      date_label: String(event.date_label || ''),
      date_detail: String(event.date_detail || ''),
    };
  }
  const monthIndex = Number(match[2]) - 1;
  return {
    ...event,
    date_label: MONTH_CALENDAR_LABELS[monthIndex] || '',
    date_detail: match[3],
    event_year: Number(match[1]),
  };
}

async function loadPublicContent() {
  // Start marquee immediately so it does not wait on site/events/photos.
  const marqueePromise = sponsorMarqueeEnabled() ? loadSponsorMarquee() : Promise.resolve(removeSponsorMarquee());
  const deadlinePromise = loadSiteDeadlineBanners();
  ensureBoosterMeetingsContainers();
  const highlightNodes = [...document.querySelectorAll('[data-events]')];
  const needsHighlights = highlightNodes.length > 0;
  const needsBoosterMeetings = Boolean(document.querySelector('[data-booster-meetings]'));
  const needsMonthCalendar = Boolean(document.querySelector('[data-month-calendar]'));
  const needsLegacyEvents = needsBoosterMeetings || needsMonthCalendar;
  const highlightLimit = highlightNodes.reduce((max, node) => {
    const raw = node.dataset.limit;
    if (raw === undefined || raw === '') return Math.max(max, 3);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.max(max, n) : max;
  }, 0) || 3;
  const bootstrap = readPublicBootstrap();
  const [site, events, photos, calendarEvents, highlightEvents] = await Promise.all([
    bootstrap?.site
      ? bootstrap.site
      : fetch('/api/site', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    needsLegacyEvents
      ? fetch('/api/events', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
      : Promise.resolve([]),
    Array.isArray(bootstrap?.photos)
      ? bootstrap.photos
      : (
        document.querySelector('[data-photo-gallery], .photo-gallery, [data-home-gallery]')
          ? fetch('/api/photos', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
          : []
      ),
    needsMonthCalendar
      ? fetch('/api/calendar-events', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
      : Promise.resolve([]),
    needsHighlights
      ? fetch(`/api/caldev/events?upcoming=1&limit=${Math.min(highlightLimit, 12)}`, { cache: 'no-store' })
        .then(r => r.json())
        .catch(() => [])
      : Promise.resolve([]),
  ]);
  try { mountHolidayThemes(site); } catch { /* decorative only */ }

  if (site) {
    document.querySelectorAll('[data-site-field]').forEach(element => {
      const key = element.dataset.siteField;
      const value = site[key];
      if (!value) return;
      if (key === 'title' && element.closest('a.brand')) {
        element.innerHTML = formatHeaderBrandTitle(value);
        return;
      }
      if (key === 'hero_title' || key === 'title') {
        element.innerHTML = key === 'hero_title' && element.closest('.home-redesign')
          ? formatHomeHeroTitle(value)
          : formatInlineRichText(value);
        return;
      }
      if (key === 'hero_subtitle' || key === 'footer_note') {
        const html = formatRichText(value);
        if (element.tagName === 'P') {
          const match = html.match(/^<p>([\s\S]*)<\/p>$/i);
          element.innerHTML = match ? match[1] : sanitizeInlineRichHtml(html);
        } else {
          element.innerHTML = html;
        }
        return;
      }
      element.textContent = value;
    });
    if (site.title) {
      const plainTitle = String(site.title).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (plainTitle) document.title = document.title.replace('East Forsyth Band Boosters', plainTitle);
    }
    ensurePublicBrandMark();
    const duesEnabled = !(
      site.boosters_dues_enabled === 0
      || site.boosters_dues_enabled === '0'
      || site.boosters_dues_enabled === false
    );
    if (!duesEnabled) {
      document.querySelectorAll('[data-boosters-dues]').forEach((node) => node.remove());
    }
  }

  document.querySelectorAll('[data-events]').forEach(container => {
    const rawLimit = container.dataset.limit;
    const source = Array.isArray(highlightEvents) ? highlightEvents : [];
    const limit = rawLimit === undefined || rawLimit === ''
      ? source.length
      : Math.max(0, Number(rawLimit) || 0);
    const visibleEvents = source.slice(0, limit || source.length).map(highlightEventFromCaldev);
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
  applyPublicThemePhotos(photos);

  bindSponsorMapCards();
  bindSponsorTierSignup();
  bindDonateButtons();
  bindDuesButtons();
  bindSponsorChoiceButtons();
  bindInKindForm();
  bindLettermanForm();
  bindCmsForms();
  maybeAutoOpenDonate();
  await Promise.all([marqueePromise, deadlinePromise, maybeShowHomepageSponsorAd(), loadContactForms()]);
}

function shouldAutoOpenDonate() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('donate') === '1') return true;
    const hash = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    return hash === 'donate';
  } catch {
    return false;
  }
}

function clearDonateDeepLink() {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('donate')) {
      url.searchParams.delete('donate');
      changed = true;
    }
    if (/^donate$/i.test(url.hash.replace(/^#/, ''))) {
      url.hash = '';
      changed = true;
    }
    if (changed) {
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', next || url.pathname);
    }
  } catch {
    // Ignore history cleanup failures.
  }
}

function maybeAutoOpenDonate() {
  if (isCmsAdminPreviewContext(document)) return;
  if (!shouldAutoOpenDonate()) return;
  clearDonateDeepLink();
  window.setTimeout(() => {
    try { openDonateModal(); } catch { /* donate UI unavailable on this page */ }
  }, 140);
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

function safePublicThemePhotoUrl(url = '') {
  const value = String(url || '').trim();
  if (!value.startsWith('/uploads/') && !value.startsWith('/assets/')) return '';
  if (/["');\s<>\\]/.test(value)) return '';
  return value;
}

function applyPublicThemePhotos(photos = []) {
  if (!document.body?.classList.contains('efhs-theme')) return;
  // Keep the pinned Home Game Performance (4) hero; gallery matching must not replace it.
  const homeHero = '/assets/efhs-home-hero.jpg?v=cms-p2-20261031s';
  const root = document.documentElement;
  root.style.setProperty('--efhs-hero-photo', `url("${homeHero}")`);
  const currentPage = String(getComputedStyle(root).getPropertyValue('--efhs-page-photo') || '').trim();
  if (currentPage && currentPage !== 'none') return;
  const list = Array.isArray(photos) ? photos : [];
  const urls = list.map((photo) => safePublicThemePhotoUrl(photo?.url)).filter(Boolean);
  if (!urls.length) return;
  const at = (index) => urls[index % urls.length];
  root.style.setProperty('--efhs-page-photo', `url("${at(0)}")`);
  root.style.setProperty('--efhs-card-photo-1', `url("${at(0)}")`);
  root.style.setProperty('--efhs-card-photo-2', `url("${at(1)}")`);
  root.style.setProperty('--efhs-card-photo-3', `url("${at(2)}")`);
}

function formatHomeHeroTitle(value) {
  const html = formatInlineRichText(value);
  if (/<span\b/i.test(html)) return html;
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = plain.split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return html;
  const last = parts.pop().replace(/\.$/, '');
  const lead = `${parts.join('. ')}.`;
  return `<span>${lead}</span> ${last}.`;
}

function renderPhotoGallery(container, photos = []) {
  if (!container) return;
  // Drop brand/logo placeholders immediately so they never flash on Gallery.
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
    if (container.dataset.keepFallback === '1' && container.querySelector('img')) return;
    container.innerHTML = '<p class="draft">No photos have been published yet.</p>';
    return;
  }
  container.innerHTML = list.map((photo) => `
    <figure class="gallery-item" data-photo-open>
      <button type="button" class="gallery-item-trigger" aria-label="View ${escapeHtml(photo.alt_text || photo.caption || 'photo')}">
        <img src="${escapeHtml(photo.thumb_url || photo.url)}"${photo.thumb_url && photo.width && photo.height ? ` width="${Number(photo.width)}" height="${Number(photo.height)}"` : ''} data-photo-full="${escapeHtml(photo.full_url || photo.url)}" alt="${escapeHtml(photo.alt_text || '')}" loading="lazy" decoding="async" draggable="false">
      </button>
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

function openPhotoLightbox({ src, alt = '', caption = '', showCaption = true } = {}) {
  if (!src) return;
  closePhotoLightbox();
  const visibleCaption = showCaption ? (caption || alt) : '';
  const modal = document.createElement('aside');
  modal.className = 'photo-lightbox';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', visibleCaption || alt || 'Photo');
  modal.innerHTML = `
    <button type="button" class="photo-lightbox-backdrop" aria-label="Close photo"></button>
    <div class="photo-lightbox-panel">
      <button type="button" class="photo-lightbox-close" aria-label="Close photo">×</button>
      <div class="photo-lightbox-frame">
        <img class="photo-lightbox-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt || caption || 'Band photo')}" draggable="false">
      </div>
      ${visibleCaption ? `<p class="photo-lightbox-caption">${escapeHtml(visibleCaption)}</p>` : ''}
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
      if (event.target?.closest?.('.gallery-item, .photo-lightbox, [data-photo-open]')) {
        event.preventDefault();
      }
    });
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest?.('[data-photo-open]');
      if (!trigger || trigger.closest('[data-photo-gallery]')) return;
      const img = trigger.matches('img') ? trigger : trigger.querySelector('img');
      const src = trigger.getAttribute('data-photo-src') || img?.currentSrc || img?.src;
      if (!src) return;
      event.preventDefault();
      openPhotoLightbox({
        src,
        alt: img?.alt || trigger.getAttribute('aria-label') || '',
        caption: trigger.getAttribute('data-photo-caption') || trigger.getAttribute('aria-label') || img?.alt || '',
      });
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
      openPhotoLightbox({
        src: img.getAttribute('data-photo-full') || img.currentSrc || img.src,
        alt: img.alt || '',
        caption: '',
        showCaption: false,
      });
    });
  });
  protectPhotoMedia(root);
}

function isDefaultContactTopicLabel(label) {
  return /^general\s+questions?$/i.test(String(label || '').trim());
}

function buildContactFormHtml(topics = []) {
  const selectedId = (Array.isArray(topics) ? topics : []).find((topic) => isDefaultContactTopicLabel(topic?.label))?.id;
  const options = topics.length
    ? topics.map((topic) => {
      const selected = selectedId != null && Number(topic.id) === Number(selectedId) ? ' selected' : '';
      return `<option value="${escapeHtml(topic.id)}"${selected}>${escapeHtml(topic.label)}</option>`;
    }).join('')
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
  const amountAttr = Number(card.dataset?.amountCents || card.getAttribute?.('data-amount-cents') || 0);
  const amountNode = card.querySelector('[data-cms-field$="_amount"], .sponsor-tier-amount, [data-amount]');
  const amountText = (amountNode?.textContent || String(card.textContent || '').match(/\$\s*[\d,]+(?:\.\d{2})?/)?.[0] || '')
    .replace(/\s+/g, ' ')
    .trim();
  const amountCents = amountAttr > 0 ? Math.round(amountAttr) : parseSponsorAmountCents(amountText);
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
  closeDuesModal({ immediate: true });
  closeSponsorSignupModal({ immediate: true });
  sponsorSignupState = { ...pkg, draft: null, application: null };
  prefetchSquareWebSdk(readSquarePublishableConfig()?.environment || 'production');

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
    const toast = document.createElement('div');
    toast.className = 'sponsor-signup-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = note;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 280);
    }, 4200);
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
    let card;
    try {
      card = await attachSquareCard(config, '#sponsor-square-card');
    } catch (error) {
      if (liveStatus) liveStatus.textContent = error.message || 'Could not load the secure card form.';
      if (payContinue) payContinue.disabled = false;
      throw error;
    }
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
        fetchSquarePublishableConfig(),
      ]);
      if (config?.web_payments) {
        await embedCardCheckout(result, config);
        return;
      }
      const live = modal.querySelector('[data-pay-status]');
      if (live) {
        live.textContent = result.detail
          || 'Application saved. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.';
      } else if (statusEl) {
        statusEl.textContent = result.detail
          || 'Application saved. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.';
      }
      if (payButton) payButton.disabled = false;
    } catch (error) {
      const live = modal.querySelector('[data-pay-status]');
      if (live) live.textContent = error.message || 'Could not continue to payment.';
      else if (statusEl) statusEl.textContent = error.message || 'Could not continue to payment.';
      if (payButton) payButton.disabled = false;
    }
  }

  modal.querySelector('[data-pay-continue]')?.addEventListener('click', () => {
    if (modal.classList.contains('is-checkout')) return;
    startSquarePayment();
  });

  form?.querySelector('input[name="business_name"]')?.focus();
}

let sponsorTierSignupDelegated = false;

function sponsorTierCardFromEvent(event) {
  const target = event?.target;
  if (!target?.closest) return null;
  const card = target.closest('.sponsor-tier[data-tier], .sponsor-tiers [data-tier].sponsor-tier');
  if (!card) return null;
  if (card.closest('#page-preview, .cms-shell, .admin-body')) return null;
  return card;
}

function bindSponsorTierSignup(root = document) {
  if (isCmsAdminPreviewContext(root)) return;
  root.querySelectorAll('.sponsor-tiers [data-tier].sponsor-tier, .sponsor-tier[data-tier]').forEach((card) => {
    if (card.closest('#page-preview, .cms-shell, .admin-body')) return;
    card.classList.add('sponsor-tier-clickable');
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
    if (!card.getAttribute('role')) card.setAttribute('role', 'button');
  });
  if (sponsorTierSignupDelegated) return;
  sponsorTierSignupDelegated = true;
  const openFromEvent = (event) => {
    const card = sponsorTierCardFromEvent(event);
    if (!card) return;
    const pkg = readTierPackageFromCard(card);
    if (!pkg) return;
    event.preventDefault();
    openSponsorSignupModal(pkg);
  };
  document.addEventListener('click', openFromEvent);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    openFromEvent(event);
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
  closeDuesModal({ immediate: true });
  donateModalState = { draft: null, donation: null };
  prefetchSquareWebSdk(readSquarePublishableConfig()?.environment || 'production');

  const modal = document.createElement('aside');
  modal.className = 'sponsor-signup-modal donate-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Donate to East Forsyth Band Boosters');
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
    const toast = document.createElement('div');
    toast.className = 'sponsor-signup-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = detail || 'Thank you for your donation!';
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 280);
    }, 4200);
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
    let card;
    try {
      card = await attachSquareCard(config, '#donate-square-card');
    } catch (error) {
      if (liveStatus) liveStatus.textContent = error.message || 'Could not load the secure card form.';
      if (payContinue) payContinue.disabled = false;
      throw error;
    }
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
        fetchSquarePublishableConfig(),
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
      const live = modal.querySelector('[data-donate-pay-status]');
      if (live) {
        live.textContent = result.detail
          || 'Donation saved. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.';
      } else if (statusEl) {
        statusEl.textContent = result.detail
          || 'Donation saved. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.';
      }
      if (payButton) payButton.disabled = false;
    } catch (error) {
      const live = modal.querySelector('[data-donate-pay-status]');
      if (live) live.textContent = error.message || 'Could not continue to payment.';
      else if (statusEl) statusEl.textContent = error.message || 'Could not continue to payment.';
      if (payButton) payButton.disabled = false;
    }
  }

  modal.querySelector('[data-donate-pay]')?.addEventListener('click', () => {
    if (modal.classList.contains('is-checkout')) return;
    startSquarePayment();
  });

  form?.querySelector('input[name="donor_name"]')?.focus();
}

function closeSponsorChoiceModal({ immediate = false } = {}) {
  const modal = document.querySelector('.sponsor-choice-modal');
  const clearBody = () => {
    if (!document.querySelector('.sponsor-signup-modal, .donate-modal, .dues-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
  };
  if (!modal) {
    clearBody();
    return;
  }
  if (immediate) {
    modal.remove();
    clearBody();
    return;
  }
  modal.classList.add('is-leaving');
  modal.classList.remove('is-visible');
  window.setTimeout(() => {
    if (document.body.contains(modal)) modal.remove();
    clearBody();
  }, 280);
}

function openSponsorChoiceModal() {
  closeSponsorChoiceModal({ immediate: true });
  const modal = document.createElement('aside');
  modal.className = 'sponsor-signup-modal sponsor-choice-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Choose sponsorship or in-kind');
  modal.innerHTML = `
    <button type="button" class="sponsor-signup-backdrop" data-choice-close aria-label="Close"></button>
    <div class="sponsor-signup-panel">
      <div class="sponsor-signup-head">
        <span class="sponsor-signup-kicker">Support the band</span>
        <h3>How would you like to help?</h3>
        <p>Choose Sponsorship Tiers or an In-Kind donation.</p>
      </div>
      <div class="sponsor-choice-actions">
        <a class="btn primary" href="/become-a-sponsor.html">Sponsorship Tiers</a>
        <a class="btn outline" href="/in-kind.html">In-Kind</a>
      </div>
      <button type="button" class="btn outline" data-choice-close>Cancel</button>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add('sponsor-signup-open');
  requestAnimationFrame(() => modal.classList.add('is-visible'));
  modal.querySelectorAll('[data-choice-close]').forEach((button) => {
    button.addEventListener('click', () => closeSponsorChoiceModal());
  });
}

function bindSponsorChoiceButtons(root = document) {
  if (isCmsAdminPreviewContext(root)) return;
  root.querySelectorAll('[data-sponsor-choice-open]').forEach((control) => {
    if (control.dataset.sponsorChoiceBound === '1') return;
    if (control.closest('#page-preview, .cms-shell, .admin-body')) return;
    if (control.hasAttribute('disabled')) return;
    control.dataset.sponsorChoiceBound = '1';
    control.addEventListener('click', (event) => {
      event.preventDefault();
      openSponsorChoiceModal();
    });
  });
}

function bindInKindForm(root = document) {
  const form = root.querySelector('[data-inkind-form]');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  const hear = form.querySelector('[data-inkind-hear]');
  const other = form.querySelector('[data-inkind-other]');
  const syncOther = () => {
    if (!other) return;
    const show = String(hear?.value || '') === 'Other';
    other.hidden = !show;
    const input = other.querySelector('input');
    if (input) input.required = show;
  };
  hear?.addEventListener('change', syncOther);
  syncOther();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-inkind-status]');
    if (status) status.textContent = 'Sending…';
    try {
      const response = await fetch('/api/inkind', {
        method: 'POST',
        body: new FormData(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Could not submit the form');
      form.reset();
      syncOther();
      if (status) status.textContent = result.detail || 'Thank you. Your form was sent.';
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not submit the form.';
    }
  });
}

function cmsFormPayload(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
    } else {
      data[key] = value;
    }
  }
  return data;
}

function bindLettermanAmountAutofill(form) {
  const amount = form.querySelector('[data-letterman-amount]');
  const priceForSize = (size) => {
    const key = String(size || '').trim().toUpperCase();
    if (!key) return '';
    const wrap = form.closest('[data-letterman-copy]') || form;
    for (const item of wrap.querySelectorAll('[data-letterman-price]')) {
      const sizes = String(item.dataset.priceSizes || '').split(/[\s,]+/).map((part) => part.trim().toUpperCase()).filter(Boolean);
      if (sizes.includes(key)) return item.querySelector('b')?.textContent?.trim() || '';
    }
    return '';
  };
  form.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!amount) return;
      const next = priceForSize(input.value);
      if (next) amount.value = next;
    });
  });
}

function bindLettermanForm(root = document) {
  const form = root.querySelector('[data-letterman-form]');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  bindLettermanAmountAutofill(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-letterman-status]');
    if (status) status.textContent = 'Sending…';
    try {
      const response = await fetch('/api/letterman-jacket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmsFormPayload(form)),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Could not submit the form');
      form.reset();
      if (status) status.textContent = result.detail || 'Thank you. Your order was sent.';
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not submit the form.';
    }
  });
}

function bindCmsForms(root = document) {
  root.querySelectorAll('[data-cms-form]').forEach((form) => {
    if (form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    bindLettermanAmountAutofill(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const slug = String(form.getAttribute('data-cms-form') || '').trim();
      const status = form.querySelector('[data-cms-form-status], [data-letterman-status]');
      if (!slug) {
        if (status) status.textContent = 'This form is missing its page name.';
        return;
      }
      if (status) status.textContent = 'Sending…';
      try {
        const response = await fetch(`/api/forms/${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmsFormPayload(form)),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || 'Could not submit the form');
        form.reset();
        if (status) status.textContent = result.detail || 'Thank you. Your form was sent.';
      } catch (error) {
        if (status) status.textContent = error.message || 'Could not submit the form.';
      }
    });
  });
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
      if (sponsorPopupRecentlyClosed() || document.querySelector('.sponsor-flyin')) return;
      openDonateModal();
    });
  });
}


let duesModalState = null;

function closeDuesModal({ immediate = false } = {}) {
  const modal = document.querySelector('.dues-modal');
  if (!modal) {
    if (!document.querySelector('.sponsor-signup-modal, .donate-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
    duesModalState = null;
    return;
  }
  if (immediate) {
    modal.remove();
    if (!document.querySelector('.sponsor-signup-modal, .donate-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
    duesModalState = null;
    return;
  }
  modal.classList.add('is-leaving');
  modal.classList.remove('is-visible');
  window.setTimeout(() => {
    if (document.body.contains(modal)) modal.remove();
    if (!document.querySelector('.sponsor-signup-modal, .donate-modal, .dues-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
    duesModalState = null;
  }, 280);
}

function showDuesConfirm(modal) {
  const confirm = modal.querySelector('[data-dues-confirm]');
  if (!confirm) return;
  confirm.hidden = false;
  confirm.querySelector('[data-confirm-no]')?.focus();
}

function hideDuesConfirm(modal) {
  const confirm = modal.querySelector('[data-dues-confirm]');
  if (!confirm) return;
  confirm.hidden = true;
}

function openDuesModal() {
  closeSponsorMapModal();
  closeSponsorSignupModal({ immediate: true });
  closeDonateModal({ immediate: true });
  closeDuesModal({ immediate: true });
  duesModalState = { draft: null, dues: null };
  prefetchSquareWebSdk(readSquarePublishableConfig()?.environment || 'production');

  const modal = document.createElement('aside');
  modal.className = 'sponsor-signup-modal dues-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Pay band dues');
  modal.innerHTML = `
    <button type="button" class="sponsor-signup-backdrop" data-dues-cancel aria-label="Cancel dues payment"></button>
    <div class="sponsor-signup-panel">
      <div class="sponsor-signup-head" data-dues-head>
        <span class="sponsor-signup-kicker">Band Boosters</span>
        <h3>Pay band dues</h3>
        <p data-dues-head-copy>Enter the student&rsquo;s full name, payment amount, and an email for the receipt. Then continue to secure Square checkout.</p>
      </div>
      <div class="sponsor-signup-step" data-dues-step="details">
        <form class="sponsor-signup-form" data-dues-form novalidate>
          <label>Student full name<input name="student_name" required autocomplete="name" maxlength="160" placeholder="First and last name"></label>
          <label>Receipt email<input name="email" type="email" required autocomplete="email" maxlength="200" placeholder="parent@example.com"></label>
          <label>Amount paying
            <input name="amount" type="text" inputmode="decimal" required maxlength="12" placeholder="50.00" aria-describedby="dues-amount-hint">
          </label>
          <p class="sponsor-signup-pay-note" id="dues-amount-hint">Enter any amount of $1 or more (USD). A receipt is emailed after payment succeeds or fails.</p>
          <p class="status" data-dues-status></p>
          <div class="sponsor-signup-actions">
            <button class="btn outline" type="button" data-dues-cancel>Cancel</button>
            <button class="btn primary" type="submit">Next</button>
          </div>
        </form>
      </div>
      <div class="sponsor-signup-step" data-dues-step="payment" hidden>
        <div class="sponsor-signup-payment-body" data-dues-pay-body>
          <div class="sponsor-signup-summary">
            <p><span>Student</span><strong data-dues-pay-name></strong></p>
            <p><span>Email</span><strong data-dues-pay-email></strong></p>
            <p><span>Amount</span><strong data-dues-pay-amount></strong></p>
          </div>
          <p class="sponsor-signup-pay-note">Your receipt will be emailed from no-reply@efhsband.org after checkout.</p>
          <p class="status" data-dues-pay-status></p>
        </div>
        <div class="sponsor-signup-actions sponsor-signup-actions-split" data-dues-pay-actions>
          <button class="btn outline" type="button" data-dues-cancel>Cancel</button>
          <div class="sponsor-signup-actions-end">
            <button class="btn outline" type="button" data-dues-back>Back</button>
            <button class="btn primary" type="button" data-dues-pay>Pay with Square</button>
          </div>
        </div>
      </div>
      <div class="sponsor-signup-confirm" data-dues-confirm hidden>
        <div class="sponsor-signup-confirm-card" role="alertdialog" aria-labelledby="dues-confirm-title" aria-describedby="dues-confirm-copy">
          <h4 id="dues-confirm-title">Are you sure?</h4>
          <p id="dues-confirm-copy">Canceling closes this payment window and discards the unpaid dues draft.</p>
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

  const form = modal.querySelector('[data-dues-form]');
  const detailsStep = modal.querySelector('[data-dues-step="details"]');
  const paymentStep = modal.querySelector('[data-dues-step="payment"]');
  const payBody = modal.querySelector('[data-dues-pay-body]');
  const status = modal.querySelector('[data-dues-status]');

  function finishDuesToast(detail, { failed = false } = {}) {
    closeDuesModal({ immediate: true });
    const toast = document.createElement('div');
    toast.className = failed ? 'sponsor-signup-toast dues-toast is-failed' : 'sponsor-signup-toast dues-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = detail || (failed ? 'Payment failed.' : 'Thank you for paying band dues!');
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 280);
    }, failed ? 5600 : 4200);
  }

  async function embedCardCheckout(dues, config) {
    if (!payBody) return;
    modal.classList.add('is-checkout');
    const headCopy = modal.querySelector('[data-dues-head-copy]');
    const amountDisplay = dues.amount_display || formatDonateAmountDisplay(dues.amount_cents);
    if (headCopy) {
      headCopy.innerHTML = `Enter card details to pay <strong>${escapeHtml(amountDisplay)}</strong> in band dues.`;
    }
    payBody.innerHTML = `
      <div class="sponsor-signup-summary">
        <p><span>Student</span><strong>${escapeHtml(dues.student_name || duesModalState.draft?.studentName || '')}</strong></p>
        <p><span>Email</span><strong>${escapeHtml(dues.email || duesModalState.draft?.email || '')}</strong></p>
        <p><span>Amount</span><strong>${escapeHtml(amountDisplay)}</strong></p>
      </div>
      <div class="sponsor-signup-card-box">
        <div id="dues-square-card" class="sponsor-signup-card-host"></div>
      </div>
      <p class="status" data-dues-pay-status>Loading secure card form…</p>
    `;
    const liveStatus = payBody.querySelector('[data-dues-pay-status]');
    const payContinue = modal.querySelector('[data-dues-pay]');
    if (payContinue) {
      payContinue.hidden = false;
      payContinue.disabled = true;
      payContinue.textContent = `Pay ${amountDisplay}`;
    }
    let card;
    try {
      card = await attachSquareCard(config, '#dues-square-card');
    } catch (error) {
      if (liveStatus) liveStatus.textContent = error.message || 'Could not load the secure card form.';
      if (payContinue) payContinue.disabled = false;
      throw error;
    }
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
            amount: (Number(dues.amount_cents) / 100).toFixed(2),
            currencyCode: 'USD',
            intent: 'CHARGE',
            customerInitiated: true,
            sellerKeyedIn: false,
            billingContact: {
              givenName: String(dues.student_name || duesModalState.draft?.studentName || 'Student').slice(0, 100),
              email: String(dues.email || duesModalState.draft?.email || '').slice(0, 100),
              countryCode: 'US',
            },
          };
          const result = await card.tokenize(verificationDetails);
          if (result.status !== 'OK' || !result.token) {
            const message = result.errors?.[0]?.message || 'Card could not be processed.';
            throw new Error(message);
          }
          const response = await fetch(`/api/dues/${encodeURIComponent(dues.id)}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: dues.completion_token,
              source_id: result.token,
            }),
          });
          const paid = await response.json().catch(() => ({}));
          if (!response.ok || !paid.ok) {
            const failDetail = paid.detail || 'Payment failed';
            finishDuesToast(
              paid.receipt_sent
                ? `${failDetail} A failed-payment receipt was emailed.`
                : failDetail,
              { failed: true },
            );
            return;
          }
          finishDuesToast(
            paid.receipt_sent
              ? `${paid.detail || 'Payment received.'} A receipt was emailed.`
              : (paid.detail || 'Payment received. Thank you!'),
          );
        } catch (error) {
          if (liveStatus) liveStatus.textContent = error.message || 'Payment failed.';
          payContinue.disabled = false;
        }
      };
    }
  }

  async function ensureDuesPayment() {
    const draft = duesModalState?.draft;
    if (!draft) throw new Error('Student details are required.');
    if (duesModalState.dues?.id && duesModalState.dues.completion_token
      && Number(duesModalState.dues.amount_cents) === Number(draft.amountCents)
      && String(duesModalState.dues.student_name || '') === draft.studentName
      && String(duesModalState.dues.email || '') === draft.email) {
      return duesModalState.dues;
    }
    const response = await fetch('/api/dues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_name: draft.studentName,
        email: draft.email,
        amount_cents: draft.amountCents,
        amount_display: draft.amountDisplay,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || 'Could not save dues payment');
    duesModalState.dues = result;
    return result;
  }

  function resetPaymentStepPreview() {
    modal.classList.remove('is-checkout');
    const draft = duesModalState?.draft;
    if (payBody) {
      payBody.innerHTML = `
        <div class="sponsor-signup-summary">
          <p><span>Student</span><strong data-dues-pay-name>${escapeHtml(draft?.studentName || '')}</strong></p>
          <p><span>Email</span><strong data-dues-pay-email>${escapeHtml(draft?.email || '')}</strong></p>
          <p><span>Amount</span><strong data-dues-pay-amount>${escapeHtml(draft?.amountDisplay || '')}</strong></p>
        </div>
        <p class="sponsor-signup-pay-note">Your receipt will be emailed from no-reply@efhsband.org after checkout.</p>
        <p class="status" data-dues-pay-status></p>
      `;
    }
    const payContinue = modal.querySelector('[data-dues-pay]');
    if (payContinue) {
      payContinue.hidden = false;
      payContinue.disabled = false;
      payContinue.textContent = 'Pay with Square';
      payContinue.onclick = null;
    }
    const headCopy = modal.querySelector('[data-dues-head-copy]');
    if (headCopy) {
      headCopy.textContent = "Enter the student's full name, payment amount, and an email for the receipt. Then continue to secure Square checkout.";
    }
  }

  modal.querySelectorAll('[data-dues-cancel]').forEach((button) => {
    button.addEventListener('click', () => showDuesConfirm(modal));
  });
  modal.querySelector('[data-confirm-no]')?.addEventListener('click', () => hideDuesConfirm(modal));
  modal.querySelector('[data-confirm-yes]')?.addEventListener('click', () => closeDuesModal());

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (status) status.textContent = '';
    const studentName = String(form.elements.student_name?.value || '').trim();
    const email = String(form.elements.email?.value || '').trim().toLowerCase();
    const amountRaw = String(form.elements.amount?.value || '').trim();
    const amountCents = parseDonateAmountCents(amountRaw);
    if (!studentName) {
      if (status) status.textContent = "Please enter the student's full name.";
      form.elements.student_name?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (status) status.textContent = 'Please enter a valid receipt email.';
      form.elements.email?.focus();
      return;
    }
    if (!amountCents || amountCents < 100) {
      if (status) status.textContent = 'Enter a dues amount of at least $1.';
      form.elements.amount?.focus();
      return;
    }
    if (amountCents > 2_500_000) {
      if (status) status.textContent = 'Dues amount cannot exceed $25,000.';
      form.elements.amount?.focus();
      return;
    }
    const amountDisplay = formatDonateAmountDisplay(amountCents);
    duesModalState.draft = { studentName, email, amountCents, amountDisplay };
    duesModalState.dues = null;
    resetPaymentStepPreview();
    detailsStep.hidden = true;
    paymentStep.hidden = false;
    modal.querySelector('[data-dues-pay]')?.focus();
  });

  modal.querySelector('[data-dues-back]')?.addEventListener('click', () => {
    resetPaymentStepPreview();
    paymentStep.hidden = true;
    detailsStep.hidden = false;
    if (status) status.textContent = '';
    form?.elements.student_name?.focus();
  });

  async function startSquarePayment() {
    const payButton = modal.querySelector('[data-dues-pay]');
    const statusEl = modal.querySelector('[data-dues-pay-status]');
    if (statusEl) statusEl.textContent = 'Saving dues payment…';
    if (payButton) payButton.disabled = true;
    try {
      const dues = await ensureDuesPayment();
      const config = await fetchSquarePublishableConfig();
      if (!config?.web_payments) {
        throw new Error(config?.detail || 'Square card payments are not ready yet.');
      }
      await embedCardCheckout(dues, config);
    } catch (error) {
      const live = modal.querySelector('[data-dues-pay-status]');
      if (live) live.textContent = error.message || 'Could not start payment.';
      else if (statusEl) statusEl.textContent = error.message || 'Could not start payment.';
      if (payButton) {
        payButton.disabled = false;
        payButton.textContent = 'Pay with Square';
      }
    }
  }

  modal.querySelector('[data-dues-pay]')?.addEventListener('click', () => {
    if (modal.classList.contains('is-checkout')) return;
    startSquarePayment();
  });

  form?.querySelector('input[name="student_name"]')?.focus();
}

function bindDuesButtons(root = document) {
  if (isCmsAdminPreviewContext(root)) return;
  root.querySelectorAll('[data-dues-open]').forEach((button) => {
    if (button.dataset.duesBound === '1') return;
    if (button.closest('#page-preview, .cms-shell, .admin-body')) return;
    if (button.hasAttribute('disabled')) return;
    button.dataset.duesBound = '1';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openDuesModal();
    });
  });
}

function bootPublicSiteContent() {
  ensurePublicBrandMark();
  try {
    hydrateMarqueeFromCache();
  } catch (error) {
    // Marquee chrome must never wipe the page or block donate/toast/Square bindings.
    console.error(error);
    try { removeSponsorMarquee(); } catch { /* keep going */ }
  }
  bindSponsorChoiceButtons();
  bindSponsorTierSignup();
  bindDonateButtons();
  bindDuesButtons();
  bindInKindForm();
  bindLettermanForm();
  bindCmsForms();
  loadPublicContent();
}

// Holiday theme overlays (public pages only). Turned on/off per holiday in CMS → Site settings →
// EFHS Blue Regiment holiday theme pack (drop-in for site-content.js).
// Same contract as the existing mountHalloweenOverlay(): one fixed, aria-hidden, pointer-events:none
// layer injected on public pages only, removed by print, frozen by prefers-reduced-motion, hidden <=340px.
// Every graphic is inline SVG drawn for this pack (no external files, no photos, no people).
// Install: paste this file's contents above mountHolidayThemes() and replace its `mounts` line with:
//   const mounts = { halloween: mountHalloweenOverlay, ...EFHS_HOLIDAY_MOUNTS };

const HT_INK = '#16202c';
const HT_BRASS = '#e3b341';
const HT_BRASS_D = '#a97a17';
const HT_SILVER = '#cfd6de';

// ---------- instruments (viewBox 0 0 120 120) ----------
const HT_INSTR = {
  snare: () => `<g stroke="${HT_INK}" stroke-width="2" stroke-linejoin="round">
    <path d="M22 50v34c0 7 17 12 38 12s38-5 38-12V50" fill="#f4f6f8"/>
    <path d="M22 54h76v6H22zM22 80h76v6H22z" fill="${HT_SILVER}"/>
    <ellipse cx="60" cy="50" rx="38" ry="11" fill="#fdfdfd"/>
    <path d="M30 60v20M45 62v20M60 62v20M75 62v20M90 60v20" stroke="${HT_SILVER}" stroke-width="2.5"/>
    <path d="M28 18l40 34M92 14L54 50" stroke="#8a5a2b" stroke-width="4" stroke-linecap="round"/></g>`,
  bassdrum: () => `<g stroke="${HT_INK}" stroke-width="2"><circle cx="60" cy="62" r="44" fill="#002142"/>
    <circle cx="60" cy="62" r="36" fill="#f4f6f8"/><circle cx="60" cy="62" r="44" fill="none" stroke="${HT_SILVER}" stroke-width="5"/>
    <path d="M86 8l-14 30" stroke="#8a5a2b" stroke-width="4" stroke-linecap="round"/><circle cx="70" cy="41" r="6" fill="#fff"/></g>`,
  trumpet: () => `<g stroke="${HT_INK}" stroke-width="2" stroke-linejoin="round" fill="${HT_BRASS}">
    <path d="M8 58h60v8H8z"/><path d="M68 54l40-18v52L68 70z"/><ellipse cx="108" cy="62" rx="5" ry="26" fill="${HT_BRASS_D}"/>
    <path d="M20 66v14c0 6 6 8 12 8h28c6 0 8-4 8-10v-12" fill="none" stroke="${HT_BRASS_D}" stroke-width="5"/>
    <rect x="34" y="40" width="6" height="18"/><rect x="44" y="40" width="6" height="18"/><rect x="54" y="40" width="6" height="18"/>
    <path d="M2 56h8v12H2z" fill="${HT_SILVER}"/></g>`,
  sax: () => `<g stroke="${HT_INK}" stroke-width="2" stroke-linejoin="round" fill="${HT_BRASS}">
    <path d="M40 10l10 4-4 10 8 0v60c0 14 8 20 18 20s16-8 16-18V72l12-6 4 10-6 4v14c0 18-12 30-28 30s-28-12-28-30V30z"/>
    <path d="M24 6l20 6-2 6-20-6z" fill="${HT_INK}"/>
    <g fill="${HT_BRASS_D}"><circle cx="48" cy="40" r="3.5"/><circle cx="48" cy="52" r="3.5"/><circle cx="48" cy="64" r="3.5"/><circle cx="48" cy="76" r="3.5"/></g></g>`,
  sousaphone: () => `<g stroke="${HT_INK}" stroke-width="2" stroke-linejoin="round">
    <circle cx="52" cy="70" r="36" fill="none" stroke="${HT_BRASS}" stroke-width="10"/>
    <circle cx="52" cy="70" r="36" fill="none" stroke="${HT_INK}" stroke-width="1"/>
    <path d="M70 40L88 8h28L104 54z" fill="${HT_BRASS}"/><ellipse cx="102" cy="10" rx="16" ry="5" fill="#f4f6f8"/>
    <rect x="44" y="60" width="5" height="16" fill="${HT_BRASS_D}"/><rect x="52" y="60" width="5" height="16" fill="${HT_BRASS_D}"/><rect x="60" y="60" width="5" height="16" fill="${HT_BRASS_D}"/></g>`,
  trombone: () => `<g stroke="${HT_INK}" stroke-width="2" stroke-linejoin="round" fill="${HT_BRASS}">
    <path d="M6 44h70v5H6zM6 70h70v5H6z"/><path d="M6 44v31" fill="none" stroke="${HT_BRASS}" stroke-width="5"/>
    <path d="M76 44h8v31h-8" fill="none" stroke="${HT_BRASS_D}" stroke-width="4"/>
    <path d="M40 58h44l26-20v48L84 66H40z"/><ellipse cx="110" cy="62" rx="5" ry="24" fill="${HT_BRASS_D}"/></g>`,
  clarinet: () => `<g stroke="${HT_INK}" stroke-width="2" transform="rotate(-35 60 60)">
    <rect x="54" y="4" width="12" height="96" rx="3" fill="#20262e"/><path d="M50 100h20l8 16H42z" fill="#20262e"/>
    <path d="M56 0h8l-1 8h-6z" fill="${HT_INK}"/><g fill="${HT_SILVER}"><circle cx="60" cy="28" r="2.5"/><circle cx="60" cy="42" r="2.5"/><circle cx="60" cy="56" r="2.5"/><circle cx="60" cy="70" r="2.5"/><circle cx="60" cy="84" r="2.5"/></g></g>`,
  horn: () => `<g stroke="${HT_INK}" stroke-width="2" fill="none"><circle cx="54" cy="62" r="34" stroke="${HT_BRASS}" stroke-width="8"/>
    <circle cx="54" cy="62" r="20" stroke="${HT_BRASS_D}" stroke-width="6"/>
    <path d="M78 86l24 18-4 12-30-16z" fill="${HT_BRASS}"/><ellipse cx="102" cy="112" rx="14" ry="6" fill="${HT_BRASS_D}" transform="rotate(-30 102 112)"/></g>`,
  bells: () => `<g stroke="${HT_INK}" stroke-width="2"><path d="M60 6L22 108h76z" fill="#002142"/>
    ${[0,1,2,3,4,5].map(i=>`<rect x="${36+i*2}" y="${36+i*12}" width="${48-i*4+i*8}" height="7" rx="2" fill="${HT_SILVER}" transform="translate(${-i*2} 0)"/>`).join('')}
    <path d="M60 6v-4" stroke="${HT_INK}"/><circle cx="60" cy="6" r="4" fill="${HT_BRASS}"/></g>`,
};

// ---------- motif pieces ----------
const htStar = (x, y, r, fill) => {
  let d = '';
  for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.42 : r; d += `${i ? 'L' : 'M'}${(x + rr * Math.cos(a)).toFixed(1)} ${(y + rr * Math.sin(a)).toFixed(1)}`; }
  return `<path d="${d}Z" fill="${fill}"/>`;
};
const htHeart = (x, y, s, fill) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 4C-2-2-10-1-10 5c0 5 6 8 10 12 4-4 10-7 10-12 0-6-8-7-10-1z" fill="${fill}"/>`;
const htShamrock = (x, y, s, fill = '#2e9e4f') => `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}"><circle cx="0" cy="-6" r="5.5"/><circle cx="-6" cy="1" r="5.5"/><circle cx="6" cy="1" r="5.5"/><path d="M0 2q2 8-2 14" stroke="${fill}" stroke-width="2" fill="none"/></g>`;
const htBurst = (x, y, r, color) => `<g stroke="${color}" stroke-width="2.4" stroke-linecap="round">${[...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return `<path d="M${(x + r * .35 * Math.cos(a)).toFixed(1)} ${(y + r * .35 * Math.sin(a)).toFixed(1)}L${(x + r * Math.cos(a)).toFixed(1)} ${(y + r * Math.sin(a)).toFixed(1)}"/>`; }).join('')}</g>`;
const htLeaf = (x, y, s, fill, rot = 0) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0-10C7-6 9 2 0 10-9 2-7-6 0-10zM0-10V12" fill="${fill}" stroke="${HT_INK}" stroke-width=".8"/>`;
const htFlake = (x, y, r, c = '#ffffff') => `<g stroke="${c}" stroke-width="1.8" stroke-linecap="round">${[0, 60, 120].map(a => `<path transform="rotate(${a} ${x} ${y})" d="M${x} ${y - r}V${y + r}M${x - r * .3} ${y - r * .7}L${x} ${y - r * .45}L${x + r * .3} ${y - r * .7}M${x - r * .3} ${y + r * .7}L${x} ${y + r * .45}L${x + r * .3} ${y + r * .7}"/>`).join('')}</g>`;
const htEgg = (x, y, s, fill, band) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-12C7-12 10 0 10 4c0 6-4 9-10 9S-10 10-10 4C-10 0-7-12 0-12z" fill="${fill}" stroke="${HT_INK}" stroke-width="1"/><path d="M-9 0q4.5-4 9 0t9 0" stroke="${band}" stroke-width="2.5" fill="none"/></g>`;
const htPoppy = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="-4" cy="-3" r="6" fill="#c8102e"/><circle cx="4" cy="-3" r="6" fill="#c8102e"/><circle cx="-4" cy="4" r="6" fill="#b00d27"/><circle cx="4" cy="4" r="6" fill="#b00d27"/><circle r="3" fill="${HT_INK}"/></g>`;
const htBulbs = (pts) => {
  const cols = ['#e3342f', '#ffd400', '#2fb34a', '#3a8dde'];
  return `<path d="M${pts.map(p => p.join(' ')).join('Q')}" fill="none"/>` + pts.map(([x, y], i) => `<ellipse class="ht-bulb" style="animation-delay:${(i % 4) * .4}s" cx="${x}" cy="${y + 4}" rx="3.2" ry="4.6" fill="${cols[i % 4]}" stroke="${HT_INK}" stroke-width=".8"/>`).join('');
};

// ---------- the 17 themes ----------
// window: suggested on/off dates for the Foreman (overlay has no scheduler today; see README).
const HT_THEMES = {
  newyear: { label: "New Year's", instrument: 'trumpet', window: 'Dec 31 – Jan 2', garland: 'confetti', colors: ['#ffd400', '#ffffff', '#3a8dde', '#e3342f'], particle: 'confetti',
    motif: () => htBurst(86, 18, 16, '#ffd400') + htBurst(108, 34, 10, '#3a8dde') + htBurst(66, 6, 8, '#e3342f') },
  mlk: { label: 'Martin Luther King Jr. Day', instrument: 'horn', window: '3rd Mon of Jan (Fri–Mon)', garland: 'rays', colors: ['#f2b544'], particle: null, solemn: true,
    motif: () => `<circle cx="96" cy="22" r="14" fill="#f2b544" opacity=".9"/><path d="M78 30q10-8 18-2 8-10 20-4-8 2-12 10-12 6-26-4z" fill="#ffffff" stroke="${HT_INK}" stroke-width="1.4"/>` },
  presidents: { label: "Presidents' Day", instrument: 'snare', window: '3rd Mon of Feb (Fri–Mon)', garland: 'bunting', colors: ['#c8102e', '#ffffff', '#002868'], particle: 'star',
    motif: () => `<path d="M22 70q38 16 76 0v8q-38 16-76 0z" fill="#c8102e" stroke="${HT_INK}" stroke-width="1.4"/><path d="M22 74q38 16 76 0" stroke="#fff" stroke-width="2.5" fill="none"/>` + htStar(60, 40, 7, '#002868') },
  valentines: { label: "Valentine's Day", instrument: 'trombone', window: 'Feb 10 – Feb 14', garland: 'hearts', colors: ['#e0245e', '#ff7aa2', '#ffffff'], particle: 'heart',
    motif: () => htHeart(104, 26, 1.2, '#e0245e') + htHeart(88, 12, .8, '#ff7aa2') + htHeart(22, 30, .9, '#e0245e') },
  stpatricks: { label: "St. Patrick's Day", instrument: 'trumpet', window: 'Mar 14 – Mar 17', garland: 'shamrocks', colors: ['#2e9e4f', '#7bc96f', '#ffd400'], particle: 'shamrock',
    motif: () => htShamrock(100, 22, 1.3) + htShamrock(80, 12, .9, '#7bc96f') + htShamrock(24, 30, 1) },
  easter: { label: 'Easter / Spring', instrument: 'clarinet', window: 'Good Friday – Easter Monday', garland: 'pastel', colors: ['#f7b2d0', '#b8e1ff', '#fff3a6', '#c9f2c7'], particle: 'petal',
    motif: () => htEgg(92, 98, 1.3, '#f7b2d0', '#7a4fb8') + htEgg(108, 104, 1, '#b8e1ff', '#2fb34a') + htEgg(22, 104, 1.1, '#fff3a6', '#e0245e') },
  memorial: { label: 'Memorial Day', instrument: 'trumpet', window: 'Last Mon of May (Sat–Mon)', garland: 'bunting', colors: ['#c8102e', '#ffffff', '#002868'], particle: null, solemn: true,
    motif: () => htPoppy(96, 20, 1.2) + htPoppy(80, 30, .8) + `<path d="M98 26q-4 10 2 20" stroke="#2e7d32" stroke-width="2" fill="none"/>` },
  juneteenth: { label: 'Juneteenth', instrument: 'bassdrum', window: 'Jun 17 – Jun 19', garland: 'bunting', colors: ['#c8102e', '#ffffff', '#002868'], particle: 'star',
    motif: () => `<path d="M24 74q36-14 72 0" stroke="#c8102e" stroke-width="4" fill="none"/>` + htBurst(60, 62, 22, '#c8102e') + htStar(60, 62, 10, '#002868') },
  july4: { label: 'Independence Day', instrument: 'sax', window: 'Jul 1 – Jul 5', garland: 'bunting', colors: ['#c8102e', '#ffffff', '#002868', '#ffd400'], particle: 'spark',
    motif: () => htBurst(98, 18, 16, '#c8102e') + htBurst(20, 22, 12, '#3a8dde') + htBurst(104, 52, 9, '#ffd400') + htStar(98, 18, 4, '#fff') },
  labor: { label: 'Labor Day', instrument: 'sousaphone', window: '1st Mon of Sep (Fri–Mon)', garland: 'bunting', colors: ['#c8102e', '#ffffff', '#002868'], particle: null,
    motif: () => `<g stroke="${HT_INK}" stroke-width="1.6"><path d="M84 4c0-8 10-12 18-12s18 4 18 12z" fill="#ffd400" transform="translate(0 4)"/><rect x="80" y="6" width="44" height="4" rx="2" fill="#f2c200"/><path d="M102-6v12" stroke="#c99a00"/></g>` },
  indigenous: { label: "Columbus Day / Indigenous Peoples' Day", instrument: 'horn', window: '2nd Mon of Oct (Sat–Mon)', garland: 'leaves', colors: ['#c4511c', '#e0a030', '#7a3b12'], particle: 'leaf',
    motif: () => htLeaf(98, 20, 1.2, '#c4511c', 20) + htLeaf(84, 10, .9, '#e0a030', -30) + `<g transform="translate(22 22)" stroke="${HT_INK}" stroke-width="1.4"><circle r="12" fill="#f3e6c8"/><path d="M0-11L3 0 0 11-3 0z" fill="#c8102e"/></g>` },
  veterans: { label: 'Veterans Day', instrument: 'snare', window: 'Nov 9 – Nov 11', garland: 'bunting', colors: ['#c8102e', '#ffffff', '#002868'], particle: null, solemn: true,
    motif: () => `<path d="M22 70q38 16 76 0v8q-38 16-76 0z" fill="#002868" stroke="${HT_INK}" stroke-width="1.4"/>` + htStar(42, 76, 4, '#fff') + htStar(60, 79, 4, '#fff') + htStar(78, 76, 4, '#fff') },
  thanksgiving: { label: 'Thanksgiving', instrument: 'sousaphone', window: 'Mon – Sun of Thanksgiving week', garland: 'leaves', colors: ['#c4511c', '#e0a030', '#7a3b12'], particle: 'leaf',
    motif: () => `<g stroke="${HT_INK}" stroke-width="1.6" transform="translate(0 2)"><path d="M88 -2h28l4 22H84z" fill="#1d1d1f"/><rect x="80" y="18" width="44" height="5" rx="2" fill="#1d1d1f"/><rect x="88" y="11" width="28" height="6" fill="#d8c08a"/><rect x="98" y="10" width="8" height="8" fill="none" stroke="${HT_BRASS}" stroke-width="2"/></g>` + htLeaf(30, 108, 1.1, '#c4511c', 30) },
  hanukkah: { label: 'Hanukkah', instrument: 'bells', window: '8 nights (2026: Dec 4–12 · 2027: Dec 24–Jan 1 · 2028: Dec 12–20)', garland: 'blue', colors: ['#2a6fdb', '#ffffff', '#cfd6de'], particle: 'flake',
    motif: () => `<g transform="translate(98 26)" stroke="${HT_INK}" stroke-width="1.6"><path d="M-10-10h20v14L0 16-10 4z" fill="#2a6fdb"/><rect x="-2" y="-18" width="4" height="8" fill="${HT_SILVER}"/></g>` + htStar(22, 24, 10, '#2a6fdb') },
  winter: { label: 'Winter (December, non-denominational)', instrument: 'bells', window: 'Dec 1 – Dec 20 (and Jan 3 – Jan 15 if wanted)', garland: 'blue', colors: ['#ffffff', '#b8e1ff'], particle: 'flake',
    motif: () => htFlake(98, 20, 12, '#b8e1ff') + htFlake(22, 28, 9, '#ffffff') + htFlake(104, 48, 6, '#ffffff') },
  christmas: { label: 'Christmas', instrument: 'snare', window: 'Dec 21 – Dec 26', garland: 'lights', colors: ['#e3342f', '#2fb34a', '#ffd400', '#ffffff'], particle: 'flake',
    motif: () => `<g stroke="#2e7d32" stroke-width="1.6">${htBulbs([[18, 56], [40, 70], [62, 66], [84, 74], [102, 60]])}</g><g stroke="#2e7d32" stroke-width="1.6">${htBulbs([[22, 88], [44, 96], [70, 94], [96, 86]])}</g><g transform="translate(62 46)"><path d="M-10 0q-6-8 0-8l10 6 10-6q6 0 0 8l-10-2z" fill="#e3342f" stroke="${HT_INK}" stroke-width="1"/></g>` },
};

// ---------- top garland strip ----------
function htGarland(kind, colors, w) {
  const n = Math.ceil(w / 40);
  const seg = (i) => i * 40;
  switch (kind) {
    case 'bunting': return [...Array(n)].map((_, i) => `<path d="M${seg(i)} 0h40l-20 ${i % 2 ? 16 : 18}z" fill="${colors[i % 3]}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>`).join('') + `<path d="M0 1H${w}" stroke="${HT_INK}" stroke-width="1.4"/>`;
    case 'lights': return `<path d="M0 2${[...Array(n)].map((_, i) => `Q${seg(i) + 20} 14 ${seg(i) + 40} 2`).join('')}" stroke="#2e7d32" stroke-width="1.6" fill="none"/>` + [...Array(n)].map((_, i) => `<ellipse class="ht-bulb" style="animation-delay:${(i % 4) * .4}s" cx="${seg(i) + 20}" cy="13" rx="3.4" ry="5" fill="${['#e3342f', '#ffd400', '#2fb34a', '#3a8dde'][i % 4]}"/>`).join('');
    case 'hearts': return [...Array(n)].map((_, i) => htHeart(seg(i) + 20, 2, .7, colors[i % 2])).join('');
    case 'shamrocks': return [...Array(n)].map((_, i) => htShamrock(seg(i) + 20, 8, .7, colors[i % 2])).join('');
    case 'leaves': return [...Array(n)].map((_, i) => htLeaf(seg(i) + 20, 8, .8, colors[i % 3], (i % 2 ? 40 : -40))).join('');
    case 'confetti': return [...Array(n * 2)].map((_, i) => `<rect x="${i * 20 + (i * 7) % 11}" y="${(i * 13) % 14}" width="5" height="3" transform="rotate(${(i * 37) % 90} ${i * 20} 6)" fill="${colors[i % colors.length]}"/>`).join('');
    case 'pastel': return [...Array(n)].map((_, i) => `<circle cx="${seg(i) + 20}" cy="6" r="5" fill="${colors[i % 4]}"/>`).join('');
    case 'blue': return [...Array(n)].map((_, i) => htFlake(seg(i) + 20, 9, 6, i % 2 ? '#b8e1ff' : '#ffffff')).join('');
    case 'rays': return `<path d="M0 0H${w}" stroke="#f2b544" stroke-width="3" opacity=".7"/>`;
    default: return '';
  }
}

const HT_PARTICLE = {
  confetti: (c) => `<rect width="8" height="5" fill="${c}"/>`,
  star: (c) => htStar(6, 6, 6, c === '#ffffff' ? '#c8102e' : c),
  heart: (c) => htHeart(10, 2, .9, c),
  shamrock: (c) => htShamrock(10, 10, .8, c),
  petal: (c) => `<ellipse cx="6" cy="4" rx="6" ry="3.5" fill="${c}"/>`,
  spark: (c) => `<circle cx="4" cy="4" r="3" fill="${c}"/>`,
  leaf: (c) => htLeaf(10, 10, .9, c, 0),
  flake: () => htFlake(10, 10, 8, '#ffffff'),
};

// ---------- top corner clusters (viewBox 0 0 200 200, drawn from the top-left corner; mirrored on the right) ----------
const htHexStar = (x, y, r, c) => `<g fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"><path d="M${x} ${y - r}L${(x + r * .866).toFixed(1)} ${(y + r / 2).toFixed(1)}H${(x - r * .866).toFixed(1)}Z"/><path d="M${x} ${y + r}L${(x + r * .866).toFixed(1)} ${(y - r / 2).toFixed(1)}H${(x - r * .866).toFixed(1)}Z"/></g>`;
const htHolly = (x, y, s) => htLeaf(x - 6 * s, y, s, '#2e9e4f', -60) + htLeaf(x + 6 * s, y, s, '#2e9e4f', 60) + `<g fill="#e3342f" stroke="${HT_INK}" stroke-width=".6"><circle cx="${x}" cy="${y + 2 * s}" r="${3 * s}"/><circle cx="${x - 3 * s}" cy="${y + 6 * s}" r="${2.6 * s}"/><circle cx="${x + 3 * s}" cy="${y + 6 * s}" r="${2.6 * s}"/></g>`;
const htOrnament = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-22V-10" stroke="#eef3f8" stroke-width="1"/><rect x="-3" y="-12" width="6" height="4" fill="${HT_SILVER}"/><circle r="8" fill="${c}" stroke="${HT_INK}" stroke-width=".8"/><path d="M-6-3q6 3 12 0" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7"/></g>`;
// Each piece is drawn at (x, y) with scale s; i is the piece index (for colour cycling).
const HT_CORNER_PIECE = {
  newyear: (x, y, s, i) => htBurst(x, y, 12 * s, ['#ffd400', '#3a8dde', '#e3342f', '#ffffff'][i % 4]),
  mlk: (x, y, s) => htStar(x, y, 7 * s, '#f2b544'),
  presidents: (x, y, s, i) => htStar(x, y, 8 * s, ['#ffffff', '#c8102e', '#ffffff'][i % 3]),
  valentines: (x, y, s, i) => htHeart(x, y - 6 * s, s, ['#e0245e', '#ff7aa2'][i % 2]),
  stpatricks: (x, y, s, i) => htShamrock(x, y, s, ['#2e9e4f', '#7bc96f'][i % 2]),
  easter: (x, y, s, i) => htEgg(x, y, s * .9, ['#f7b2d0', '#b8e1ff', '#fff3a6', '#c9f2c7'][i % 4], ['#7a4fb8', '#2fb34a', '#e0245e', '#3a8dde'][i % 4]),
  memorial: (x, y, s) => htPoppy(x, y, s * .9),
  juneteenth: (x, y, s, i) => htStar(x, y, 8 * s, ['#ffffff', '#c8102e'][i % 2]),
  july4: (x, y, s, i) => htBurst(x, y, 12 * s, ['#c8102e', '#ffffff', '#3a8dde', '#ffd400'][i % 4]),
  labor: (x, y, s, i) => htStar(x, y, 8 * s, ['#ffd400', '#ffffff', '#c8102e'][i % 3]),
  indigenous: (x, y, s, i) => htLeaf(x, y, s * 1.1, ['#c4511c', '#e0a030', '#7a3b12'][i % 3], i * 50),
  veterans: (x, y, s, i) => htStar(x, y, 8 * s, ['#ffffff', '#c8102e'][i % 2]),
  thanksgiving: (x, y, s, i) => htLeaf(x, y, s * 1.1, ['#c4511c', '#e0a030', '#7a3b12'][i % 3], i * 50),
  hanukkah: (x, y, s) => htHexStar(x, y, 9 * s, '#8fc1ff'),
  winter: (x, y, s, i) => htFlake(x, y, 9 * s, ['#ffffff', '#b8e1ff'][i % 2]),
  christmas: (x, y, s, i) => (i % 2 ? htOrnament(x, y, s, ['#e3342f', '#ffd400', '#3a8dde'][i % 3]) : htHolly(x, y, s * .8)),
};
// Strands along the top edge, down the side and one diagonal, like the Halloween web spokes.
// Kept in the page gutter so pieces never sit on the logo, utility links, nav or phone header icons.
const HT_CORNER_SPOTS = [[18, 18, .95], [14, 64, .9], [13, 126, .85], [12, 178, .75]];
function htCornerSvg(key) {
  const piece = HT_CORNER_PIECE[key];
  const strands = '<path d="M0 4Q60 16 120 6M4 0Q22 100 10 196" fill="none" stroke="#eef3f8" stroke-width="1.4" stroke-linecap="round" opacity=".55" vector-effect="non-scaling-stroke"/>';
  return strands + HT_CORNER_SPOTS.map(([x, y, s], i) => `<g class="ht-s${i}">${piece(x, y, s, i)}</g>`).join('');
}

function mountHolidayTheme(key) {
  const t = HT_THEMES[key];
  const id = `efhs-holiday-${key}`;
  if (!t || !HT_CORNER_PIECE[key] || document.getElementById(id)) return;
  const style = document.createElement('style');
  style.textContent = `
#${id}{position:fixed;inset:0;z-index:99;pointer-events:none;overflow:hidden;contain:strict}
#${id} svg{position:absolute;display:block;overflow:visible}
#${id} .ht-garland{left:0;top:0;width:100%;height:12px;opacity:.85}
#${id} .ht-corner{top:0;width:var(--ht-corner,200px);height:var(--ht-corner,200px);opacity:.8}
#${id} .ht-corner.l{left:0}
#${id} .ht-corner.r{right:0;transform:scaleX(-1)}
#${id} .ht-center{left:var(--ht-cl,36%);top:var(--ht-ct,12px);width:var(--ht-cw,90px);height:var(--ht-cw,90px);margin-left:calc(var(--ht-cw,90px) / -2);opacity:.97;filter:drop-shadow(0 0 8px rgba(255,255,255,.7)) drop-shadow(0 0 20px rgba(255,255,255,.35));animation:ht-sway 6s ease-in-out infinite;transform-origin:50% 0}
#${id} .ht-p{top:-24px;width:20px;height:20px;opacity:.8;animation:ht-fall var(--d,14s) linear infinite;animation-delay:var(--dl,0s);will-change:transform}
#${id} .ht-bulb{animation:ht-twinkle 1.6s ease-in-out infinite alternate}
@keyframes ht-sway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
@keyframes ht-fall{from{transform:translate3d(0,0,0) rotate(0)}to{transform:translate3d(var(--dx,20px),110vh,0) rotate(300deg)}}
@keyframes ht-twinkle{from{opacity:1}to{opacity:.35}}
@media (max-width:640px){#${id}{--ht-corner:90px;--ht-cw:46px}#${id} .ht-p:nth-of-type(n+6){display:none}#${id} .ht-garland{height:9px}#${id} .ht-corner .ht-s0,#${id} .ht-corner .ht-s1{display:none}#${id} .ht-center{filter:drop-shadow(0 0 4px rgba(255,255,255,.7)) drop-shadow(0 0 10px rgba(255,255,255,.35))}}
@media (max-width:767px){#${id}{position:absolute;top:0;left:0;right:0;bottom:auto;width:auto;height:100vh;height:100svh}}
@media (max-width:340px){#${id}{display:none}}
@media (prefers-reduced-motion:reduce){#${id} *{animation:none!important}#${id} .ht-p{display:none}}
@media print{#${id}{display:none}}`;
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'efhs-holiday-theme';
  wrap.setAttribute('aria-hidden', 'true');
  const W = 1600;
  const corner = htCornerSvg(key);
  let html = t.garland && t.garland !== 'none'
    ? `<svg class="ht-garland" viewBox="0 0 ${W} 20" preserveAspectRatio="xMinYMin slice" focusable="false">${htGarland(t.garland, t.colors, W)}</svg>` : '';
  html += `<svg class="ht-corner l" viewBox="0 0 200 200" focusable="false">${corner}</svg><svg class="ht-corner r" viewBox="0 0 200 200" focusable="false">${corner}</svg>`;
  html += `<svg class="ht-center" viewBox="-4 -12 128 132" focusable="false">${HT_INSTR[t.instrument]()}${t.motif()}</svg>`;
  if (t.particle && !t.solemn) {
    for (let i = 0; i < 10; i += 1) {
      const c = t.colors[i % t.colors.length];
      html += `<svg class="ht-p" style="left:${(i * 37 + 5) % 100}%;--d:${12 + (i * 5) % 9}s;--dl:${-(i * 2.3).toFixed(1)}s;--dx:${(i % 2 ? 1 : -1) * (20 + i * 4)}px" viewBox="0 0 20 20" focusable="false">${HT_PARTICLE[t.particle](c)}</svg>`;
    }
  }
  wrap.innerHTML = html;
  // Same placement as the Halloween bat: desktop in the header gap between logo and nav,
  // phone just under the header / marquee / notice strip so it never sits on the logo or icons.
  const placeCenter = () => {
    if (window.innerWidth > 900) {
      wrap.style.setProperty('--ht-ct', '10px');
      wrap.style.setProperty('--ht-cl', '36%');
      return;
    }
    // Phone: in the header gap between the menu button and the logo.
    const menu = document.querySelector('header.site-header button, header.site-header [aria-controls]')?.getBoundingClientRect();
    const logo = document.querySelector('header.site-header img')?.getBoundingClientRect();
    const head = document.querySelector('header.site-header')?.getBoundingClientRect();
    const mid = menu && logo && logo.left > menu.right ? (menu.right + logo.left) / 2 : window.innerWidth * 0.21;
    wrap.style.setProperty('--ht-cl', `${Math.round(mid)}px`);
    wrap.style.setProperty('--ht-ct', `${head && head.height > 50 ? Math.max(4, Math.round((head.height - 46) / 2)) : 6}px`);
  };
  placeCenter();
  window.setTimeout(placeCenter, 1500);
  document.head.appendChild(style);
  document.body.appendChild(wrap);
}

// Keys used in site.holiday_theme. Halloween keeps its existing mount.
const EFHS_HOLIDAY_MOUNTS = Object.fromEntries(Object.keys(HT_THEMES).map((k) => [k, () => mountHolidayTheme(k)]));

// Holiday themes (site.holiday_theme = 'halloween' | ''; one at a time). Kill switch: set
// HOLIDAY_THEMES_ENABLED = false, or add class "no-holiday-theme" to <html>/<body>.
const HOLIDAY_THEMES_ENABLED = true;

function activeHolidayTheme(site) {
  return String(site?.holiday_theme || '').trim().toLowerCase();
}

function mountHolidayThemes(site) {
  if (!HOLIDAY_THEMES_ENABLED) return;
  const root = document.documentElement;
  const body = document.body;
  if (!body || root.classList.contains('no-holiday-theme') || body.classList.contains('no-holiday-theme')) return;
  if (/^\/(admin|cms)(\/|$)/i.test(location.pathname || '') || !isPublicSiteDeadlineContext()) return;
  const mounts = { halloween: mountHalloweenOverlay, ...EFHS_HOLIDAY_MOUNTS };
  mounts[activeHolidayTheme(site)]?.();
}

function halloweenWebPath(size = 160) {
  const spokes = 7;
  const rings = [0.2, 0.38, 0.58, 0.8, 1];
  const angle = (i) => (Math.PI / 2) * (i / (spokes - 1));
  const pt = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const f = (n) => n.toFixed(1);
  let d = '';
  for (let i = 0; i < spokes; i += 1) {
    const [x, y] = pt(size, angle(i));
    d += `M0 0L${f(x)} ${f(y)}`;
  }
  rings.slice(0, -1).forEach((ring) => {
    const r = ring * size;
    for (let i = 0; i < spokes - 1; i += 1) {
      const [x1, y1] = pt(r, angle(i));
      const [x2, y2] = pt(r, angle(i + 1));
      const [cx, cy] = pt(r * 0.86, (angle(i) + angle(i + 1)) / 2);
      d += `${i === 0 ? `M${f(x1)} ${f(y1)}` : ''}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}`;
    }
  });
  return d;
}

function mountHalloweenOverlay() {
  if (document.getElementById('efhs-halloween')) return;
  const body = document.body;
  const web = halloweenWebPath(160);
  const style = document.createElement('style');
  style.textContent = `
#efhs-halloween{position:fixed;inset:0 0 auto 0;height:0;z-index:99;pointer-events:none}
#efhs-halloween svg{position:absolute;display:block;overflow:visible;background:none}
#efhs-halloween .hw-web{top:0;width:var(--hw-web,160px);height:var(--hw-web,160px);opacity:.32}
#efhs-halloween .hw-web path{fill:none;stroke:#dfe6ee;stroke-width:1;vector-effect:non-scaling-stroke}
#efhs-halloween .hw-web.l{left:0}
#efhs-halloween .hw-web.r{right:0;transform:scaleX(-1)}
#efhs-halloween .hw-spider{right:20px;top:0;width:16px;height:92px;opacity:.55;transform-origin:50% 0;animation:hw-bob 5s ease-in-out infinite}
#efhs-halloween .hw-bat{left:var(--hw-bat-left,50%);top:var(--hw-bat-top,40px);width:46px;height:24px;margin-left:-23px;color:#000;opacity:.97;filter:drop-shadow(0 0 4px rgba(255,255,255,.7)) drop-shadow(0 0 10px rgba(255,255,255,.35));animation:hw-drift 9s ease-in-out infinite}
#efhs-halloween .hw-bat path{stroke:none;transform-origin:50% 50%;animation:hw-flap .6s ease-in-out infinite alternate}
@keyframes hw-bob{0%,100%{transform:scaleY(.86)}50%{transform:scaleY(1)}}
@keyframes hw-drift{0%,100%{transform:translate(-18px,0) rotate(-4deg)}50%{transform:translate(18px,-6px) rotate(4deg)}}
@keyframes hw-flap{from{transform:scaleY(1)}to{transform:scaleY(.72)}}
@media (max-width:640px){#efhs-halloween{--hw-web:90px}#efhs-halloween .hw-web{opacity:.58}#efhs-halloween .hw-web path{stroke:#eef3f8;stroke-width:2}#efhs-halloween .hw-spider{right:4px;height:50px;width:12px}#efhs-halloween .hw-bat{width:36px;height:19px;margin-left:-18px}}
@media (min-width:768px){#efhs-halloween{--hw-web:200px}#efhs-halloween .hw-web{opacity:.6}#efhs-halloween .hw-web path{stroke:#eef3f8;stroke-width:2}#efhs-halloween .hw-spider{width:22px;height:120px;opacity:.85}#efhs-halloween .hw-spider line,#efhs-halloween .hw-spider>path{stroke-width:1.6}#efhs-halloween .hw-bat{width:100px;height:52px;margin-left:-50px;opacity:.97;filter:drop-shadow(0 0 10px rgba(255,255,255,.75)) drop-shadow(0 0 24px rgba(255,255,255,.4))}}
@media (max-width:767px){#efhs-halloween{position:absolute;top:0;left:0;right:0;bottom:auto;width:auto;overflow:visible}}
@media (max-width:340px){#efhs-halloween{display:none}}
@media (prefers-reduced-motion:reduce){#efhs-halloween *{animation:none!important}}
@media print{#efhs-halloween{display:none}}`;
  const wrap = document.createElement('div');
  wrap.id = 'efhs-halloween';
  wrap.setAttribute('aria-hidden', 'true');
  const webSvg = (side) => `<svg class="hw-web ${side}" viewBox="0 0 160 160" focusable="false"><path d="${web}"/></svg>`;
  wrap.innerHTML = `${webSvg('l')}${webSvg('r')}`
    + '<svg class="hw-spider" viewBox="0 0 16 118" preserveAspectRatio="xMidYMin meet" focusable="false"><line x1="8" y1="0" x2="8" y2="104" stroke="#c9d2dc" stroke-width=".8" vector-effect="non-scaling-stroke"/><g fill="#1f2630" stroke="rgba(255,255,255,.7)" stroke-width=".6"><ellipse cx="8" cy="106" rx="3.2" ry="3.6"/><circle cx="8" cy="101.5" r="2.2"/></g><path d="M5 104l-4-3M5 106l-4 0M5 108l-4 3M11 104l4-3M11 106l4 0M11 108l4 3" stroke="#c9d2dc" stroke-width=".8" fill="none"/></svg>'
    + '<svg class="hw-bat" viewBox="0 0 46 24" focusable="false"><path fill="currentColor" d="M23 7c-1.2 0-2 .8-2.4 1.6L19.5 6l-.3 3.2C16 6.5 11 4 4 6c3 1.5 4.5 4 4.3 7 2.4-1.4 5.2-.8 6.7 1.4 1.4-1 3.6-.9 5 .6.8 1.6 1.8 3.4 3 4.8 1.2-1.4 2.2-3.2 3-4.8 1.4-1.5 3.6-1.6 5-.6 1.5-2.2 4.3-2.8 6.7-1.4-.2-3 1.3-5.5 4.3-7-7-2-12 .5-15.2 3.2L26.5 6l-1.1 2.6C25 7.8 24.2 7 23 7z"/></svg>';
  // Desktop: bat sits in the header gap between logo and nav. Phone: header is full, so the bat
  // floats just under the header/marquee/notice strip instead of on the logo or icons.
  // Keep the bat clear of the logo and site name: park it in the empty header
  // space left of the brand when there is room, else just under the chrome.
  const placeBat = () => {
    const brand = document.querySelector('header.site-header .brand');
    const r = brand?.getBoundingClientRect();
    const half = window.innerWidth >= 768 ? 50 : 18;
    const reach = half + 18 + 16; // half-width + drift + breathing room
    if (r && r.width && r.left - reach >= half + 8) {
      wrap.style.setProperty('--hw-bat-top', `${Math.round(r.top + r.height / 2 - half * 0.52)}px`);
      wrap.style.setProperty('--hw-bat-left', `${Math.round(r.left - reach)}px`);
      return;
    }
    const chrome = ['header.site-header', '.sponsor-marquee-section:not([hidden])', '[data-site-deadline-banners]']
      .map((sel) => document.querySelector(sel)?.getBoundingClientRect().bottom || 0);
    const bottom = Math.max(...chrome);
    wrap.style.setProperty('--hw-bat-top', `${bottom > 0 && bottom < 320 ? Math.round(bottom + 10) : 70}px`);
    wrap.style.setProperty('--hw-bat-left', '50%');
  };
  window.addEventListener('resize', placeBat, { passive: true });
  placeBat();
  window.setTimeout(placeBat, 1500);
  document.head.appendChild(style);
  body.appendChild(wrap);
}

if (!globalThis.__EFHS_SKIP_SITE_CONTENT_BOOT) {
  bootPublicSiteContent();
} else {
  globalThis.__efhsSiteContent = {
    sponsorMarqueeEnabled,
    removeSponsorMarquee,
    querySponsorMarqueeSlot,
    querySponsorMarqueeSlots,
    ensureSiteChrome,
    ensureSponsorMarqueeMount,
    hydrateMarqueeFromCache,
    readTierPackageFromCard,
    bindSponsorTierSignup,
    readSquarePublishableConfig,
    fetchSquarePublishableConfig,
    loadSquareWebSdk,
    attachSquareCard,
  };
}
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const choice = document.querySelector('.sponsor-choice-modal');
  if (choice) {
    closeSponsorChoiceModal();
    return;
  }
  const dues = document.querySelector('.dues-modal');
  if (dues) {
    const confirm = dues.querySelector('[data-dues-confirm]');
    if (confirm && !confirm.hidden) {
      hideDuesConfirm(dues);
      return;
    }
    showDuesConfirm(dues);
    return;
  }
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
