import { DEFAULT_CMS_PAGES } from './default-pages.mjs';
import {
  buildAdminAuditExportPdfBase64,
  buildAuditSummary,
  enrichMailAuditMeta,
  isSecurityLogPath,
  listAdminAuditLogs,
  maybeAuditAdminApiResponse,
  requestClientIp,
  summarizeAdminRequestForAudit,
  writeAdminAuditLog,
} from './admin-audit-log.mjs';
import {
  deserializeVapidKeys,
  generateVapidKeys,
  sendPushNotification,
  serializeVapidKeys,
} from './web-push-browser/index.js';
import {
  CALDEV_TRACKS,
  clearCaldevEvents,
  deleteCaldevEvent,
  ensureCaldevSchema,
  getCaldevEventById,
  insertCaldevEvent,
  listCaldevEvents,
  normalizeCaldevPayload,
  seedCaldevFromProduction,
  updateCaldevEvent,
} from './caldev.mjs';

export {
  CALDEV_TRACKS,
  normalizeCaldevPayload,
  seedCaldevFromProduction,
} from './caldev.mjs';

export const DEFAULT_UTILITY_LINKS = [
  { label: 'Upcoming Events', href: '/calendar.html', target: '_self' },
  { label: 'Student Resources', href: '/resources.html', target: '_self' },
  { label: 'Contact', href: '/contact.html', target: '_self' },
];

export const SOCIAL_PLATFORMS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
];

export const DEFAULT_SOCIAL_LINKS = SOCIAL_PLATFORMS.map((platform) => ({
  platform: platform.id,
  href: '',
}));

const SOCIAL_ICONS = {
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.02H7.9v-2.91h2.4V9.84c0-2.37 1.4-3.68 3.56-3.68 1.03 0 2.11.18 2.11.18v2.32h-1.19c-1.17 0-1.54.73-1.54 1.48v1.78h2.62l-.42 2.91h-2.2V22c4.78-.75 8.44-4.91 8.44-9.93z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4c0 3.2-2.6 5.8-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8C2 4.6 4.6 2 7.8 2zm0 2C5.7 4 4 5.7 4 7.8v8.4C4 18.3 5.7 20 7.8 20h8.4c2.1 0 3.8-1.7 3.8-3.8V7.8C20 5.7 18.3 4 16.2 4H7.8zm9.65 1.5a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6a3 3 0 0 0-2.1 2.1A31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.75 15.5v-7L16.5 12l-6.75 3.5z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.244 2H21.5l-7.19 8.22L22.5 22h-6.59l-5.16-6.74L5.2 22H1.94l7.69-8.79L1.5 2h6.75l4.66 6.18L18.244 2zm-1.16 18h1.83L7.08 3.94H5.12L17.084 20z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 3c.4 2.6 2.1 4.4 4.7 4.7V10c-1.7-.05-3.25-.6-4.5-1.55V15.2a5.2 5.2 0 1 1-5.2-5.2c.3 0 .6.03.9.08v2.55a2.65 2.65 0 1 0 1.9 2.54V3h2.2z"/></svg>',
};

export const DEFAULT_SITE = {
  title: 'East Forsyth Band',
  hero_title: 'Sound. Spirit. Eagle Pride.',
  hero_subtitle: 'A polished home for the East Forsyth Band program — built for students, families, alumni, sponsors, and the Kernersville community.',
  footer_note: 'Draft website for the East Forsyth High School band program. Replace placeholder copy with official program details before launch.',
  logo_url: '/assets/efhs-logo.png',
  maintenance_mode: '0',
  boosters_dues_enabled: '1',
  sponsor_ad_seconds: '6',
  utility_links: JSON.stringify(DEFAULT_UTILITY_LINKS),
  social_links: JSON.stringify(DEFAULT_SOCIAL_LINKS),
};

export const DEFAULT_EVENTS = [
  { date_label: 'Aug', date_detail: '01', event_year: 2026, title: 'Band Camp / Preseason Prep', description: 'Placeholder: add official summer band camp dates, times, and location.', sort_order: 1 },
  { date_label: 'Aug', date_detail: 'TBD', event_year: 2026, title: 'Parent Preview Night', description: 'Placeholder: add location and what families should bring.', sort_order: 2 },
  { date_label: 'Sep', date_detail: 'FRI', event_year: 2026, title: 'Football Game Performance', description: 'Placeholder: add football schedule and call times when available.', sort_order: 3 },
  { date_label: 'Oct', date_detail: 'TBD', event_year: 2026, title: 'Marching Competition', description: 'Placeholder: add itinerary, address, ticket info, and volunteer needs.', sort_order: 4 },
];

export const DEFAULT_SPONSORS = [
  { name: 'ABC Company', address: '123 Main Street', city: 'Kernersville', state: 'NC', logo_url: '', level: 'Bronze Sponsor', mark_text: 'ABC', sort_order: 1, active: 1, homepage_ad: 0 },
  { name: 'Kernersville Music & Arts', address: '', city: 'Kernersville', state: 'NC', logo_url: '', level: 'Silver Sponsor', mark_text: 'KMA', sort_order: 2, active: 1, homepage_ad: 1 },
  { name: 'Eagle Financial Partners', address: '', city: 'Kernersville', state: 'NC', logo_url: '', level: 'Gold Sponsor', mark_text: 'EFP', sort_order: 3, active: 1, homepage_ad: 1 },
];

export const SPONSOR_TIER_PACKAGES = [
  {
    id: 'bronze',
    name: 'Bronze',
    blurb: 'Put your brand in front of families online.',
    benefits: [
      'Logo featured on the website sponsor marquee',
    ],
  },
  {
    id: 'silver',
    name: 'Silver',
    blurb: 'Stand out across the site experience.',
    benefits: [
      'Logo featured on the website sponsor marquee',
      'Homepage fly-in advert for your business',
    ],
  },
  {
    id: 'gold',
    name: 'Gold',
    blurb: 'Our top package for game-day and digital impact.',
    benefits: [
      'Logo featured on the website sponsor marquee',
      'Homepage fly-in advert for your business',
      'Announcement recognition at home football games',
    ],
  },
];

export const SPONSOR_TIER_FIELD_DEFAULTS = {
  tiers_kicker: 'Sponsor packages',
  tiers_heading: 'Choose your level of support.',
  tiers_intro: 'Three clear ways to back Eagle Pride — from a website marquee feature to full game-day recognition.',
  bronze_label: 'Bronze',
  bronze_title: 'Bronze Sponsor',
  bronze_blurb: 'Put your brand in front of families online.',
  bronze_benefits: '<ul><li>Logo featured on the website sponsor marquee</li></ul>',
  bronze_amount: '$100',
  silver_label: 'Silver',
  silver_title: 'Silver Sponsor',
  silver_blurb: 'Stand out across the site experience.',
  silver_benefits: '<ul><li>Logo featured on the website sponsor marquee</li><li>Homepage fly-in advert for your business</li></ul>',
  silver_amount: '$250',
  gold_label: 'Gold',
  gold_title: 'Gold Sponsor',
  gold_blurb: 'Our top package for game-day and digital impact.',
  gold_benefits: '<ul><li>Logo featured on the website sponsor marquee</li><li>Homepage fly-in advert for your business</li><li>Announcement recognition at home football games</li></ul>',
  gold_amount: '$500',
};

export const SPONSOR_TIER_FIELD_KEYS = Object.keys(SPONSOR_TIER_FIELD_DEFAULTS);

export function normalizeSponsorTierFields(payload = {}) {
  const fields = {};
  for (const key of SPONSOR_TIER_FIELD_KEYS) {
    const raw = payload[key];
    const value = raw == null ? '' : String(raw).trim();
    if (!value) {
      fields[key] = SPONSOR_TIER_FIELD_DEFAULTS[key];
      continue;
    }
    if (/_benefits$/.test(key)) {
      fields[key] = /<li[\s>]/i.test(value) ? value : value;
      continue;
    }
    fields[key] = looksLikeInlineRichHtml(value) ? sanitizeInlineRichHtml(value) : value;
  }
  return fields;
}

function sponsorTierBenefitsHtml(value, fallbackHtml) {
  const source = String(value || '').trim() || String(fallbackHtml || '').trim();
  if (!source) return '<ul></ul>';
  if (/<li[\s>]/i.test(source)) {
    const cleaned = sanitizeRichHtml(source);
    const listMatch = cleaned.match(/<ul[\s\S]*?<\/ul>/i);
    if (listMatch) return listMatch[0];
    const items = [...cleaned.matchAll(/<li[\s\S]*?<\/li>/gi)].map((match) => match[0]).join('');
    return items ? `<ul>${items}</ul>` : `<ul><li>${htmlToPlainText(cleaned)}</li></ul>`;
  }
  const items = source
    .split(/\n+/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  if (!items.length) return String(fallbackHtml || '<ul></ul>');
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

export function extractSponsorTierFields(html = '') {
  const source = String(html || '');
  const section = (source.match(/<section[^>]*data-sponsor-tiers[^>]*>([\s\S]*?)<\/section>/i) || [])[1] || source;
  const head = (section.match(/<div[^>]*class="[^"]*sponsor-tiers-head[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
  const card = (id) => (section.match(new RegExp(`<article[^>]*data-tier="${id}"[^>]*>([\\s\\S]*?)<\\/article>`, 'i')) || [])[1] || '';
  const bronze = card('bronze');
  const silver = card('silver');
  const gold = card('gold');
  const benefitsOf = (block) => {
    const list = (block.match(/<ul[\s\S]*?<\/ul>/i) || [])[0] || '';
    return list || undefined;
  };
  return normalizeSponsorTierFields({
    tiers_kicker: matchInner(head, /<(?:span|p|div)[^>]*class="[^"]*\bkicker\b[^"]*"[^>]*>([\s\S]*?)<\/(?:span|p|div)>/i)
      || matchInner(head, /data-cms-field="tiers_kicker"[^>]*>([\s\S]*?)<\//i)
      || undefined,
    tiers_heading: matchInner(head, /<h2[^>]*>([\s\S]*?)<\/h2>/i) || undefined,
    tiers_intro: matchInner(head, /<h2[^>]*>[\s\S]*?<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i) || undefined,
    bronze_label: matchInner(bronze, /class="[^"]*sponsor-tier-label[^"]*"[^>]*>([\s\S]*?)<\//i) || undefined,
    bronze_title: matchInner(bronze, /<h3[^>]*>([\s\S]*?)<\/h3>/i) || undefined,
    bronze_blurb: matchInner(bronze, /<h3[^>]*>[\s\S]*?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i) || undefined,
    bronze_benefits: benefitsOf(bronze),
    bronze_amount: matchInner(bronze, /data-cms-field="bronze_amount"[^>]*>([\s\S]*?)<\//i)
      || matchInner(bronze, /class="[^"]*sponsor-tier-amount[^"]*"[^>]*>([\s\S]*?)<\//i)
      || undefined,
    silver_label: matchInner(silver, /class="[^"]*sponsor-tier-label[^"]*"[^>]*>([\s\S]*?)<\//i) || undefined,
    silver_title: matchInner(silver, /<h3[^>]*>([\s\S]*?)<\/h3>/i) || undefined,
    silver_blurb: matchInner(silver, /<h3[^>]*>[\s\S]*?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i) || undefined,
    silver_benefits: benefitsOf(silver),
    silver_amount: matchInner(silver, /data-cms-field="silver_amount"[^>]*>([\s\S]*?)<\//i)
      || matchInner(silver, /class="[^"]*sponsor-tier-amount[^"]*"[^>]*>([\s\S]*?)<\//i)
      || undefined,
    gold_label: matchInner(gold, /class="[^"]*sponsor-tier-label[^"]*"[^>]*>([\s\S]*?)<\//i) || undefined,
    gold_title: matchInner(gold, /<h3[^>]*>([\s\S]*?)<\/h3>/i) || undefined,
    gold_blurb: matchInner(gold, /<h3[^>]*>[\s\S]*?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i) || undefined,
    gold_benefits: benefitsOf(gold),
    gold_amount: matchInner(gold, /data-cms-field="gold_amount"[^>]*>([\s\S]*?)<\//i)
      || matchInner(gold, /class="[^"]*sponsor-tier-amount[^"]*"[^>]*>([\s\S]*?)<\//i)
      || undefined,
  });
}

const SESSION_COOKIE = 'efband_session';
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
const TEXT = new TextEncoder();
const READ_TEXT = new TextDecoder();
const GLOBAL_PERMISSIONS = ['site', 'pages', 'sponsors', 'treasurer', 'president', 'vice-president', 'staff', 'boosters', 'users', 'mail', 'events', 'events:manage', 'photos', 'contact', 'minutes', 'minutes:view'];
export const LEDGER_KINDS = ['sponsor', 'donor', 'fundraiser', 'dues', 'expense'];
export const LEDGER_INCOME_KINDS = ['sponsor', 'donor', 'fundraiser', 'dues'];
export const PAYMENT_LEDGER_XML_KEY = 'payment_ledger_xml';
const ASSET_VERSION = 'badge-creator-body-type-20260823';
const BLUE_REGIMENT_MARK_PATH = '/assets/efhs-blue-regiment-mark.png';
const PUBLIC_BRAND_MARK = `${BLUE_REGIMENT_MARK_PATH}?v=${ASSET_VERSION}`;
const MINUTES_LETTERHEAD_BANNER = `/assets/minutes-template/letterhead-banner.png?v=${ASSET_VERSION}`;
const MINUTES_DOCX_MAX_BYTES = 8_000_000;
const MINUTES_DOCX_MAX_LABEL = '8 MB';
const ZERNIO_API_BASE = 'https://zernio.com/api/v1';
const ZERNIO_PROFILE_KEY = 'zernio_profile_id';
const ZERNIO_FACEBOOK_KEY = 'zernio_facebook';
const ZERNIO_FACEBOOK_PENDING_KEY = 'zernio_facebook_pending';
const ZERNIO_FACEBOOK_DEBUG_KEY = 'zernio_facebook_debug';
const ZERNIO_FACEBOOK_EVENTS_KEY = 'zernio_facebook_events';
const ZERNIO_INSTAGRAM_KEY = 'zernio_instagram';
const ZERNIO_INSTAGRAM_AUTOPOST_KEY = 'zernio_instagram_gallery_autopost';
const PUBLIC_SITE_ORIGIN_DEFAULT = 'https://efhsband.org';
const FORM_RICH_TOOLBAR = `<div class="form-rich-toolbar" data-form-rich-toolbar><button type="button" data-form-rich="bold" title="Bold"><b>B</b></button><button type="button" data-form-rich="italic" title="Italic"><i>I</i></button><button type="button" data-form-rich="underline" title="Underline"><u>U</u></button><label title="Text color"><span>Color</span><input type="color" data-form-rich-color value="#002142"></label><label title="Font size"><span>Size</span><select data-form-rich-size><option value="">Normal</option><option value="14px">Small</option><option value="18px">Medium</option><option value="22px">Large</option><option value="28px">Extra large</option></select></label></div>`;
const MAINTENANCE_RETURN_COOKIE = 'efband_maintenance_return';
const MAIL_ATTACHMENT_MAX_FILES = 5;
const MAIL_ATTACHMENT_MAX_BYTES = 4_000_000;
const MAIL_ATTACHMENT_TOTAL_BYTES = 10_000_000;
const MAIL_ATTACHMENT_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip',
]);
const IMAGE_UPLOAD_MAX_BYTES = 1_900_000;
const IMAGE_UPLOAD_MAX_LABEL = '2 MB';
const SPONSOR_APPLICATION_LOGO_SORT = -410;
const IMAGE_UPLOAD_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);
const IMAGE_UPLOAD_EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};


export const DEFAULT_CONTACT_TOPICS = [
  { label: 'General question', email: '', sort_order: 1, active: 1 },
  { label: 'Sponsor inquiry', email: '', sort_order: 2, active: 1 },
  { label: 'Volunteer interest', email: '', sort_order: 3, active: 1 },
  { label: 'Student resource question', email: '', sort_order: 4, active: 1 },
];

export const DEFAULT_STAFF = [
  { name: 'Name TBD', role: 'Band Director', bio: 'Add bio, email, or preferred contact notes here.', photo_url: '', sort_order: 1, active: 1 },
  { name: 'Name TBD', role: 'Assistant Director', bio: 'Add bio, email, or preferred contact notes here.', photo_url: '', sort_order: 2, active: 1 },
  { name: 'Name TBD', role: 'Color Guard Staff', bio: 'Add bio, email, or preferred contact notes here.', photo_url: '', sort_order: 3, active: 1 },
  { name: 'Name TBD', role: 'Percussion Staff', bio: 'Add bio, email, or preferred contact notes here.', photo_url: '', sort_order: 4, active: 1 },
];

export const DEFAULT_BOOSTER_MEMBERS = [
  { name: 'Name TBD', role: 'Booster President', bio: 'Add contact notes or responsibilities here.', photo_url: '', sort_order: 1, active: 1 },
  { name: 'Name TBD', role: 'Vice President', bio: 'Add contact notes or responsibilities here.', photo_url: '', sort_order: 2, active: 1 },
  { name: 'Name TBD', role: 'Treasurer', bio: 'Add contact notes or responsibilities here.', photo_url: '', sort_order: 3, active: 1 },
  { name: 'Name TBD', role: 'Secretary', bio: 'Add contact notes or responsibilities here.', photo_url: '', sort_order: 4, active: 1 },
];

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

export function decodeBasicHtmlEntities(value) {
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function normalizeStaticPath(pathname) {
  if (pathname === '/') return '/index.html';
  if (pathname.includes('..')) return '/index.html';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function normalizePageSlug(value) {
  const raw = String(value || '').replace(/^\//, '').replace(/\.html$/i, '');
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'page';
}

export function parsePermissions(value) {
  const forbidden = new Set(['security-log', 'security', 'audit', 'audit-log', 'admin-audit']);
  const filterSafe = (items) => items
    .filter((item) => typeof item === 'string')
    .map((item) => String(item).trim())
    .filter((item) => item && !forbidden.has(item.toLowerCase()));
  if (Array.isArray(value)) return filterSafe(value);
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? filterSafe(parsed) : [];
  } catch {
    return [];
  }
}

export function isSuperAdmin(user) {
  return String(user?.role || '').trim().toLowerCase() === 'admin';
}

/** Security log is Super Admin only — never grantable via permissions. */
export function canAccessSecurityLog(user) {
  return isSuperAdmin(user);
}

/** Website Guide PDF/HTML is Super Admin only — not public, not for editors. */
export function canAccessWebsiteGuide(user) {
  return isSuperAdmin(user);
}

export const CMS_WEBSITE_GUIDE_PDF_PATH = '/assets/downloads/EFHS-Band-Website-CMS-Guide-Super-Admin.pdf';
export const CMS_WEBSITE_GUIDE_HTML_PATH = '/assets/downloads/EFHS-Band-Website-CMS-Guide-Super-Admin.html';
export const CMS_WEBSITE_GUIDE_API_PATH = '/api/admin/website-guide.pdf';

export function isCmsWebsiteGuidePath(pathname = '') {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  return path === CMS_WEBSITE_GUIDE_PDF_PATH
    || path === CMS_WEBSITE_GUIDE_HTML_PATH
    || path === CMS_WEBSITE_GUIDE_API_PATH
    // Legacy public filenames — keep gated so old links cannot leak the guide.
    || path === '/assets/downloads/EFHS-Band-Website-CMS-Guide.pdf'
    || path === '/assets/downloads/EFHS-Band-Website-CMS-Guide.html'
    || path === '/assets/downloads/EFHS-Band-Website-CMS-Guide.doc'
    || path === '/assets/downloads/EFHS-Band-Website-CMS-Guide';
}

export function hasPermission(user, scope) {
  if (!user) return false;
  const normalized = String(scope || '').trim().toLowerCase();
  if (['security-log', 'security', 'audit', 'audit-log', 'admin-audit'].includes(normalized)) {
    return canAccessSecurityLog(user);
  }
  if (isSuperAdmin(user)) return true;
  const permissions = parsePermissions(user.permissions);
  return permissions.includes(scope) || permissions.includes('all');
}


export const CALENDAR_PUSH_STATE_KEY = 'calendar_push_state';
export const CALENDAR_PUSH_TOPIC = 'efhs_calendar';
const WEB_PUSH_VAPID_PUBLIC_KEY = 'web_push_vapid_public';
const WEB_PUSH_VAPID_PRIVATE_KEY = 'web_push_vapid_private';

export function emptyCalendarPushState() {
  return { revision: 0, action: '', title: '', event_id: null, at: '' };
}

export function parseCalendarPushState(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    if (!parsed || typeof parsed !== 'object') return emptyCalendarPushState();
    const revision = Number(parsed.revision);
    const state = {
      revision: Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0,
      action: ['created', 'updated', 'deleted'].includes(String(parsed.action || '')) ? String(parsed.action) : '',
      title: String(parsed.title || '').trim().slice(0, 200),
      event_id: parsed.event_id == null || parsed.event_id === '' ? null : Number(parsed.event_id) || null,
      at: String(parsed.at || '').trim(),
    };
    if (parsed.web_push && typeof parsed.web_push === 'object') state.web_push = parsed.web_push;
    return state;
  } catch {
    return emptyCalendarPushState();
  }
}

export function buildCalendarPushPayload({ action = 'updated', event = null, eventId = null } = {}) {
  const normalizedAction = ['created', 'updated', 'deleted'].includes(action) ? action : 'updated';
  const title = htmlToPlainText(event?.title || '').trim() || (normalizedAction === 'deleted' ? 'An event was removed' : 'Calendar update');
  const headlines = {
    created: 'New calendar event',
    updated: 'Calendar event updated',
    deleted: 'Calendar event removed',
  };
  return {
    action: normalizedAction,
    event_id: event?.id ?? eventId ?? null,
    title,
    notification_title: headlines[normalizedAction],
    notification_body: title,
    url: '/calendar.html',
  };
}

export async function getWebPushVapidKeys(env = {}) {
  const envPublic = String(env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  const envPrivate = String(env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim();
  if (envPublic && envPrivate) return { publicKey: envPublic, privateKey: envPrivate, source: 'env' };
  let publicKey = await getSiteContentValue(env, WEB_PUSH_VAPID_PUBLIC_KEY);
  let privateKey = await getSiteContentValue(env, WEB_PUSH_VAPID_PRIVATE_KEY);
  if (publicKey && privateKey) return { publicKey, privateKey, source: 'db' };
  const pair = await generateVapidKeys();
  const serialized = await serializeVapidKeys(pair);
  await setSiteContentValue(env, WEB_PUSH_VAPID_PUBLIC_KEY, serialized.publicKey);
  await setSiteContentValue(env, WEB_PUSH_VAPID_PRIVATE_KEY, serialized.privateKey);
  return { publicKey: serialized.publicKey, privateKey: serialized.privateKey, source: 'generated' };
}

export function normalizeWebPushSubscription(payload = {}) {
  const endpoint = String(payload.endpoint || '').trim();
  const keys = payload.keys && typeof payload.keys === 'object' ? payload.keys : {};
  const p256dh = String(keys.p256dh || payload.p256dh || '').trim();
  const auth = String(keys.auth || payload.auth || '').trim();
  const userAgent = String(payload.user_agent || payload.userAgent || '').trim().slice(0, 300);
  if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2048) {
    return { ok: false, detail: 'A valid push endpoint is required' };
  }
  if (p256dh.length < 20 || p256dh.length > 512 || auth.length < 8 || auth.length > 256) {
    return { ok: false, detail: 'Subscription keys are missing or invalid' };
  }
  return { ok: true, endpoint, p256dh, auth, user_agent: userAgent };
}

async function upsertWebPushSubscription(env, { endpoint, p256dh, auth, user_agent }) {
  await env.DB.prepare(
    `INSERT INTO web_push_subscriptions (endpoint, p256dh, auth, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh=excluded.p256dh,
       auth=excluded.auth,
       user_agent=excluded.user_agent,
       updated_at=CURRENT_TIMESTAMP`,
  ).bind(endpoint, p256dh, auth, user_agent || '').run();
  return { ok: true, endpoint };
}

async function deleteWebPushSubscription(env, endpoint) {
  await env.DB.prepare('DELETE FROM web_push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
  return { ok: true };
}

function webPushSubjectEmail(env = {}) {
  const subjectEmail = String(env.CONTACT_FROM_EMAIL || SPONSOR_INVOICE_FROM_EMAIL || 'no-reply@efhsband.org')
    .trim()
    .replace(/^mailto:/i, '');
  return subjectEmail.includes('@') ? subjectEmail : 'no-reply@efhsband.org';
}

function buildWebPushMessage(pushPayload = {}) {
  return JSON.stringify({
    title: pushPayload.notification_title || pushPayload.title || 'Calendar update',
    body: pushPayload.notification_body || pushPayload.body || pushPayload.title || 'The band calendar changed.',
    url: pushPayload.url || '/calendar.html',
    action: pushPayload.action || '',
    event_id: pushPayload.event_id,
    revision: pushPayload.revision,
  });
}

export async function sendWebPushToSubscription(env, subscription, pushPayload = {}) {
  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.p256dh || subscription?.keys?.p256dh || '').trim();
  const auth = String(subscription?.auth || subscription?.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, sent: 0, failed: 1, removed: 0, detail: 'Subscription keys are missing' };
  }
  const vapid = await getWebPushVapidKeys(env);
  const keyPair = await deserializeVapidKeys({
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  });
  try {
    const response = await sendPushNotification(
      keyPair,
      { endpoint, keys: { p256dh, auth } },
      webPushSubjectEmail(env),
      buildWebPushMessage(pushPayload),
      { algorithm: 'aes128gcm', ttl: 86400, urgency: 'high' },
    );
    if (response.status === 404 || response.status === 410) {
      await deleteWebPushSubscription(env, endpoint);
      return { ok: false, sent: 0, failed: 1, removed: 1, detail: `Push endpoint gone (${response.status})` };
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        ok: false,
        sent: 0,
        failed: 1,
        removed: 0,
        detail: `Push service returned ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}`,
      };
    }
    return { ok: true, sent: 1, failed: 0, removed: 0, detail: '' };
  } catch (error) {
    return { ok: false, sent: 0, failed: 1, removed: 0, detail: error?.message || 'Web push send threw an error' };
  }
}

export async function sendWebPushCalendarNotifications(env, pushPayload = {}) {
  const rows = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM web_push_subscriptions').all();
  const subscriptions = rows.results || [];
  if (!subscriptions.length) {
    return { ok: true, skipped: true, sent: 0, failed: 0, removed: 0, detail: 'No browser subscriptions' };
  }
  let sent = 0;
  let failed = 0;
  let removed = 0;
  let detail = '';
  for (const row of subscriptions) {
    const result = await sendWebPushToSubscription(env, row, pushPayload);
    sent += Number(result.sent || 0);
    failed += Number(result.failed || 0);
    removed += Number(result.removed || 0);
    if (!result.ok && !detail && result.detail) detail = result.detail;
  }
  return {
    ok: failed === 0 && sent > 0,
    sent,
    failed,
    removed,
    total: subscriptions.length,
    detail: detail || (sent ? '' : 'No notifications were accepted'),
  };
}

async function getCalendarPushState(env) {
  return parseCalendarPushState(await getSiteContentValue(env, CALENDAR_PUSH_STATE_KEY));
}

export async function recordCalendarPushChange(env, { action = 'updated', event = null, eventId = null } = {}) {
  const payload = buildCalendarPushPayload({ action, event, eventId });
  const previous = await getCalendarPushState(env);
  const next = {
    revision: (previous.revision || 0) + 1,
    action: payload.action,
    title: payload.title,
    event_id: payload.event_id,
    at: new Date().toISOString(),
  };
  const pushPayload = { ...payload, revision: next.revision };
  let webPush = { ok: false, skipped: true, detail: 'No browser subscriptions' };
  try {
    webPush = await sendWebPushCalendarNotifications(env, pushPayload);
  } catch (error) {
    webPush = { ok: false, detail: error.message || 'Web push send failed' };
  }
  const state = {
    ...next,
    web_push: {
      ok: Boolean(webPush?.ok),
      skipped: Boolean(webPush?.skipped),
      sent: Number(webPush?.sent || 0),
      failed: Number(webPush?.failed || 0),
      removed: Number(webPush?.removed || 0),
      total: Number(webPush?.total || 0),
      detail: webPush?.detail || '',
    },
  };
  await setSiteContentValue(env, CALENDAR_PUSH_STATE_KEY, JSON.stringify(state));
  return { state, web_push: webPush, push: pushPayload };
}

export function renderNotifyMeNavControl() {
  return `<button type="button" class="nav-notify-me" data-notify-me aria-label="Notify me about calendar updates" title="Notify me about calendar updates"><span class="nav-notify-bell" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Zm7-6.2V11a7 7 0 1 0-14 0v4.8L3 17.8V19h18v-1.2l-2-1.8Z"/></svg></span><span class="nav-notify-label">Notify Me</span></button>`;
}

export function renderAddToHomeNavControl() {
  return `<button type="button" class="nav-add-home" data-add-home aria-label="Add East Forsyth Band to your home screen" title="Add to Home Screen"><span class="nav-add-home-icon" aria-hidden="true"><svg class="nav-add-home-house" viewBox="0 0 24 24" focusable="false"><path d="M3.6 10.4 12 3.5l8.4 6.9V20a1.1 1.1 0 0 1-1.1 1.1H4.7A1.1 1.1 0 0 1 3.6 20V10.4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><img class="nav-add-home-mark" src="${escapeAttr(PUBLIC_BRAND_MARK)}" alt="" width="16" height="16" decoding="async"></span></button>`;
}

export const EMAIL_LIST_TOPICS = ['calendar', 'fundraising'];
export const EMAIL_LIST_REPLY_TO = 'list@updates.efhsband.org';
export const EMAIL_LIST_FROM_EMAIL = 'no-reply@efhsband.org';
export const EMAIL_LIST_FROM_NAME = 'East Forsyth Band Boosters';

export function normalizeEmailListTopics(value, { defaultAll = true } = {}) {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw || '[]');
    } catch {
      raw = String(raw)
        .split(/[,;\s]+/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(raw)) raw = [];
  const topics = [];
  const seen = new Set();
  for (const item of raw) {
    const topic = String(item || '').trim().toLowerCase();
    if (!EMAIL_LIST_TOPICS.includes(topic) || seen.has(topic)) continue;
    seen.add(topic);
    topics.push(topic);
  }
  if (!topics.length && defaultAll) return [...EMAIL_LIST_TOPICS];
  return topics;
}

export function wantsEmailListNotify(payload = {}) {
  if (payload.notify_email_subscribers === undefined && payload.notify_subscribers === undefined) {
    return true;
  }
  const value = payload.notify_email_subscribers ?? payload.notify_subscribers;
  return !(value === false || value === 0 || value === '0' || value === 'false' || value === 'off');
}

export function extractEmailAddress(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const angled = text.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  const candidate = (angled ? angled[1] : text).trim().toLowerCase();
  return isValidEmail(candidate) ? candidate : '';
}

export function isEmailListStopRequest({ subject = '', text = '', html = '' } = {}) {
  const subjectText = String(subject || '');
  const bodyText = `${String(text || '')}\n${htmlToPlainText(html || '')}`;
  const subjectHit = /\b(stop|unsubscribe|cancel|end|quit)\b/i.test(subjectText);
  if (subjectHit) return true;
  const lines = bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!lines.length) return false;
  return lines.some((line) => /^(stop|unsubscribe|cancel|end|quit)\b[.!]*$/i.test(line));
}

function bytesToBase64(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqualString(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

export async function verifyResendWebhookSignature(rawBody, headers, secret) {
  const webhookSecret = String(secret || '').trim();
  if (!webhookSecret) return { ok: false, detail: 'RESEND_WEBHOOK_SECRET is not configured' };
  const getHeader = (name) => {
    if (!headers) return '';
    if (typeof headers.get === 'function') return String(headers.get(name) || '');
    return String(headers[name] || headers[name.toLowerCase()] || '');
  };
  const id = getHeader('svix-id') || getHeader('webhook-id');
  const timestamp = getHeader('svix-timestamp') || getHeader('webhook-timestamp');
  const signatureHeader = getHeader('svix-signature') || getHeader('webhook-signature');
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, detail: 'Missing webhook signature headers' };
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, detail: 'Invalid webhook timestamp' };
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > 60 * 5) return { ok: false, detail: 'Webhook timestamp is outside the allowed range' };
  const secretPart = webhookSecret.startsWith('whsec_') ? webhookSecret.slice(6) : webhookSecret;
  let secretBytes;
  try {
    secretBytes = base64ToBytes(secretPart);
  } catch {
    return { ok: false, detail: 'Invalid webhook signing secret' };
  }
  const signedContent = `${id}.${timestamp}.${String(rawBody || '')}`;
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, TEXT.encode(signedContent));
  const expected = bytesToBase64(new Uint8Array(digest));
  const candidates = String(signatureHeader)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(',') ? part.slice(part.indexOf(',') + 1) : part));
  if (!candidates.some((candidate) => timingSafeEqualString(candidate, expected))) {
    return { ok: false, detail: 'Invalid webhook signature' };
  }
  return { ok: true };
}

function randomEmailListToken(bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function renderEmailListSignup({ topics = EMAIL_LIST_TOPICS, heading = 'Get email updates', detail = 'Join the band email list. Reply STOP to any message to unsubscribe.', buttonLabel = 'Subscribe' } = {}) {
  const topicList = normalizeEmailListTopics(topics, { defaultAll: true }).join(',');
  return `<section class="content email-list-signup" data-email-list-signup data-email-list-topics="${escapeAttr(topicList)}">
  <div class="wrap email-list-signup-inner">
    <div class="email-list-signup-copy">
      <h2>${escapeHtml(heading)}</h2>
      <p>${escapeHtml(detail)}</p>
    </div>
    <div class="email-list-signup-action">
      <button type="button" class="btn primary" data-email-list-open>${escapeHtml(buttonLabel)}</button>
    </div>
  </div>
</section>`;
}

export function ensureEmailListSignupSlot(html, options = {}) {
  const source = String(html || '');
  // Keep button-only signup blocks; rewrite older QR/form variants for print-only QR usage.
  if (/data-email-list-open/i.test(source) && /data-email-list-signup/i.test(source) && !/email-list-signup-qr/i.test(source)) {
    return source;
  }
  const stripped = source.replace(/<section\b[^>]*data-email-list-signup[^>]*>[\s\S]*?<\/section>/gi, '');
  return `${stripped}${renderEmailListSignup(options)}`;
}

export function formatEmailListTopicsLabel(topics = []) {
  const list = normalizeEmailListTopics(topics, { defaultAll: false });
  if (list.length >= 2) return 'Calendar and Fundraising';
  if (list.includes('fundraising')) return 'Fundraising';
  if (list.includes('calendar')) return 'Calendar';
  return 'no topics';
}

export function emailListTopicsEqual(a, b) {
  const left = normalizeEmailListTopics(a, { defaultAll: false }).slice().sort();
  const right = normalizeEmailListTopics(b, { defaultAll: false }).slice().sort();
  return left.length === right.length && left.every((topic, index) => topic === right[index]);
}

export async function getEmailSubscriber(env, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) return null;
  const row = await env.DB.prepare(
    'SELECT email, topics, status, source, unsubscribe_token, created_at, updated_at, unsubscribed_at FROM email_subscribers WHERE email = ?',
  ).bind(normalizedEmail).first();
  if (!row) return null;
  return {
    email: row.email,
    topics: normalizeEmailListTopics(row.topics, { defaultAll: true }),
    status: String(row.status || 'active'),
    source: row.source || '',
    unsubscribe_token: row.unsubscribe_token || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    unsubscribed_at: row.unsubscribed_at || null,
  };
}

export async function upsertEmailSubscriber(env, { email, topics, source = 'website' } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) return { ok: false, detail: 'Enter a valid email address' };
  const topicList = normalizeEmailListTopics(topics, { defaultAll: true });
  if (!topicList.length) return { ok: false, detail: 'Choose at least one topic' };
  const existing = await getEmailSubscriber(env, normalizedEmail);
  const token = existing?.unsubscribe_token || randomEmailListToken();
  await env.DB.prepare(
    `INSERT INTO email_subscribers (email, topics, status, source, unsubscribe_token, created_at, updated_at, unsubscribed_at)
     VALUES (?, ?, 'active', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
     ON CONFLICT(email) DO UPDATE SET
       topics=excluded.topics,
       status='active',
       source=excluded.source,
       unsubscribe_token=excluded.unsubscribe_token,
       updated_at=CURRENT_TIMESTAMP,
       unsubscribed_at=NULL`,
  ).bind(normalizedEmail, JSON.stringify(topicList), String(source || 'website').slice(0, 80), token).run();
  return {
    ok: true,
    email: normalizedEmail,
    topics: topicList,
    previous_topics: existing?.topics || [],
    created: !existing,
    reactivated: Boolean(existing && existing.status !== 'active'),
    unsubscribe_token: token,
  };
}

export async function subscribeEmailList(env, {
  email,
  topics,
  source = 'website',
  update = false,
} = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) return { ok: false, detail: 'Enter a valid email address' };
  const topicList = normalizeEmailListTopics(topics, { defaultAll: false });
  if (!topicList.length) return { ok: false, detail: 'Choose at least one topic' };

  const existing = await getEmailSubscriber(env, normalizedEmail);
  if (existing && existing.status === 'active' && !update) {
    return {
      ok: true,
      already_subscribed: true,
      email: existing.email,
      topics: existing.topics,
      topics_label: formatEmailListTopicsLabel(existing.topics),
      detail: `You're already subscribed for ${formatEmailListTopicsLabel(existing.topics)}. Update your topics below if you want to change them.`,
      send_welcome: false,
    };
  }

  const saved = await upsertEmailSubscriber(env, {
    email: normalizedEmail,
    topics: topicList,
    source,
  });
  if (!saved.ok) return saved;

  if (existing && existing.status === 'active' && update) {
    const unchanged = emailListTopicsEqual(existing.topics, saved.topics);
    return {
      ok: true,
      updated: true,
      unchanged,
      email: saved.email,
      topics: saved.topics,
      previous_topics: existing.topics,
      topics_label: formatEmailListTopicsLabel(saved.topics),
      previous_topics_label: formatEmailListTopicsLabel(existing.topics),
      unsubscribe_token: saved.unsubscribe_token,
      detail: unchanged
        ? `You're still subscribed for ${formatEmailListTopicsLabel(saved.topics)}.`
        : `Updated — you're now subscribed for ${formatEmailListTopicsLabel(saved.topics)}.`,
      send_welcome: false,
      send_topics_email: !unchanged,
    };
  }

  return {
    ok: true,
    created: Boolean(saved.created),
    reactivated: Boolean(saved.reactivated),
    email: saved.email,
    topics: saved.topics,
    topics_label: formatEmailListTopicsLabel(saved.topics),
    unsubscribe_token: saved.unsubscribe_token,
    detail: saved.reactivated
      ? 'Welcome back — your subscription is active again.'
      : 'You are subscribed to band email updates.',
    send_welcome: true,
  };
}

export async function unsubscribeEmailSubscriber(env, { email = '', token = '', reason = 'stop' } = {}) {
  const normalizedEmail = extractEmailAddress(email);
  const unsubscribeToken = String(token || '').trim();
  let row = null;
  if (unsubscribeToken) {
    row = await env.DB.prepare('SELECT email, status FROM email_subscribers WHERE unsubscribe_token = ?')
      .bind(unsubscribeToken)
      .first();
  } else if (normalizedEmail) {
    row = await env.DB.prepare('SELECT email, status FROM email_subscribers WHERE email = ?')
      .bind(normalizedEmail)
      .first();
  }
  if (!row) return { ok: true, found: false, detail: 'No matching subscriber' };
  if (row.status === 'unsubscribed') return { ok: true, found: true, already: true, email: row.email };
  await env.DB.prepare(
    `UPDATE email_subscribers
     SET status='unsubscribed', updated_at=CURRENT_TIMESTAMP, unsubscribed_at=CURRENT_TIMESTAMP
     WHERE email = ?`,
  ).bind(row.email).run();
  return { ok: true, found: true, already: false, email: row.email, reason: String(reason || 'stop').slice(0, 40) };
}

async function listActiveEmailSubscribers(env, topic = '') {
  const rows = await env.DB.prepare(
    `SELECT email, topics, unsubscribe_token FROM email_subscribers WHERE status = 'active' ORDER BY email COLLATE NOCASE`,
  ).all();
  const wanted = String(topic || '').trim().toLowerCase();
  return (rows.results || []).filter((row) => {
    if (!wanted) return true;
    return normalizeEmailListTopics(row.topics, { defaultAll: true }).includes(wanted);
  });
}

export function buildEmailListWelcomeMessage({ topics = EMAIL_LIST_TOPICS, unsubscribeToken = '' } = {}) {
  const siteUrl = 'https://efhsband.org';
  const topicList = normalizeEmailListTopics(topics, { defaultAll: true });
  const topicLabels = topicList.map((topic) => (topic === 'fundraising' ? 'fundraising' : 'calendar'));
  const topicPhrase = topicLabels.length === 2
    ? 'calendar and fundraising updates'
    : `${topicLabels[0] || 'band'} updates`;
  const unsubUrl = unsubscribeToken
    ? `${siteUrl}/api/email-unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
    : `${siteUrl}/calendar.html`;
  return {
    subject: 'Welcome to East Forsyth Band email updates',
    text: [
      'You are subscribed to East Forsyth Band email updates.',
      '',
      `You will receive ${topicPhrase} from this list.`,
      '',
      'How to unsubscribe:',
      `- Reply STOP to this email (or any list email), or`,
      `- Open this link: ${unsubUrl}`,
      '',
      `Calendar: ${siteUrl}/calendar.html`,
      `Fundraising: ${siteUrl}/fundraising.html`,
      '',
      'East Forsyth Band Boosters',
    ].join('\n'),
    html: [
      '<p><strong>You are subscribed to East Forsyth Band email updates.</strong></p>',
      `<p>You will receive ${escapeHtml(topicPhrase)} from this list.</p>`,
      '<p><strong>How to unsubscribe</strong></p>',
      '<ul>',
      `<li>Reply <strong>STOP</strong> to this email (or any list email), or</li>`,
      `<li><a href="${escapeAttr(unsubUrl)}">Unsubscribe with one click</a></li>`,
      '</ul>',
      `<p><a href="${siteUrl}/calendar.html">Calendar</a> · <a href="${siteUrl}/fundraising.html">Fundraising</a></p>`,
      '<p>East Forsyth Band Boosters</p>',
    ].join(''),
  };
}

export async function sendEmailListWelcome(env, { email, topics, unsubscribeToken } = {}) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, skipped: true, detail: 'RESEND_API_KEY is not configured' };
  }
  const to = String(email || '').trim().toLowerCase();
  if (!isValidEmail(to)) return { ok: false, detail: 'Recipient email is invalid' };
  const message = buildEmailListWelcomeMessage({ topics, unsubscribeToken });
  try {
    await sendViaResend(env, {
      to,
      replyTo: EMAIL_LIST_REPLY_TO,
      subject: message.subject,
      text: message.text,
      html: message.html,
      fromEmail: String(env.CONTACT_FROM_EMAIL || EMAIL_LIST_FROM_EMAIL).trim() || EMAIL_LIST_FROM_EMAIL,
      fromName: String(env.CONTACT_FROM_NAME || EMAIL_LIST_FROM_NAME).trim() || EMAIL_LIST_FROM_NAME,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error?.message || 'Welcome email failed' };
  }
}

export function buildEmailListTopicsChangedMessage({
  previousTopics = [],
  topics = EMAIL_LIST_TOPICS,
  unsubscribeToken = '',
} = {}) {
  const siteUrl = 'https://efhsband.org';
  const beforeLabel = formatEmailListTopicsLabel(previousTopics);
  const afterLabel = formatEmailListTopicsLabel(topics);
  const unsubUrl = unsubscribeToken
    ? `${siteUrl}/api/email-unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
    : `${siteUrl}/calendar.html`;
  return {
    subject: 'Your East Forsyth Band email preferences were updated',
    text: [
      'You updated your East Forsyth Band email subscription.',
      '',
      `Before: ${beforeLabel}`,
      `Now: ${afterLabel}`,
      '',
      `You will now receive ${afterLabel === 'Calendar and Fundraising' ? 'calendar and fundraising updates' : `${afterLabel.toLowerCase()} updates`} from this list.`,
      '',
      'How to unsubscribe:',
      '- Reply STOP to this email (or any list email), or',
      `- Open this link: ${unsubUrl}`,
      '',
      'East Forsyth Band Boosters',
    ].join('\n'),
    html: [
      '<p><strong>You updated your East Forsyth Band email subscription.</strong></p>',
      `<p>Before: <strong>${escapeHtml(beforeLabel)}</strong><br>Now: <strong>${escapeHtml(afterLabel)}</strong></p>`,
      `<p>You will now receive ${escapeHtml(afterLabel === 'Calendar and Fundraising' ? 'calendar and fundraising updates' : `${afterLabel.toLowerCase()} updates`)} from this list.</p>`,
      '<p><strong>How to unsubscribe</strong></p>',
      '<ul>',
      '<li>Reply <strong>STOP</strong> to this email (or any list email), or</li>',
      `<li><a href="${escapeAttr(unsubUrl)}">Unsubscribe with one click</a></li>`,
      '</ul>',
      '<p>East Forsyth Band Boosters</p>',
    ].join(''),
  };
}

export async function sendEmailListTopicsChanged(env, {
  email,
  previousTopics,
  topics,
  unsubscribeToken,
} = {}) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, skipped: true, detail: 'RESEND_API_KEY is not configured' };
  }
  const to = String(email || '').trim().toLowerCase();
  if (!isValidEmail(to)) return { ok: false, detail: 'Recipient email is invalid' };
  const message = buildEmailListTopicsChangedMessage({ previousTopics, topics, unsubscribeToken });
  try {
    await sendViaResend(env, {
      to,
      replyTo: EMAIL_LIST_REPLY_TO,
      subject: message.subject,
      text: message.text,
      html: message.html,
      fromEmail: String(env.CONTACT_FROM_EMAIL || EMAIL_LIST_FROM_EMAIL).trim() || EMAIL_LIST_FROM_EMAIL,
      fromName: String(env.CONTACT_FROM_NAME || EMAIL_LIST_FROM_NAME).trim() || EMAIL_LIST_FROM_NAME,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error?.message || 'Topics update email failed' };
  }
}

export function buildEmailListUpdateMessage({ topic = 'calendar', action = 'updated', event = null, pageTitle = '' } = {}) {
  const siteUrl = 'https://efhsband.org';
  if (topic === 'fundraising') {
    const title = htmlToPlainText(pageTitle || 'Fundraising').trim() || 'Fundraising';
    return {
      subject: `Fundraising update: ${title}`,
      text: [
        'East Forsyth Band fundraising was updated.',
        '',
        `View details: ${siteUrl}/fundraising.html`,
        '',
        'Reply STOP to unsubscribe from this email list.',
      ].join('\n'),
      html: `<p>East Forsyth Band fundraising was updated.</p><p><a href="${siteUrl}/fundraising.html">View fundraising</a></p><p style="color:#667">Reply <strong>STOP</strong> to unsubscribe.</p>`,
    };
  }
  if (action === 'finished') {
    return {
      subject: 'Band calendar updated',
      text: [
        'The East Forsyth Band calendar was updated.',
        '',
        `View calendar: ${siteUrl}/calendar.html`,
        '',
        'Reply STOP to unsubscribe from this email list.',
      ].join('\n'),
      html: `<p><strong>The East Forsyth Band calendar was updated.</strong></p><p><a href="${siteUrl}/calendar.html">View calendar</a></p><p style="color:#667">Reply <strong>STOP</strong> to unsubscribe.</p>`,
    };
  }
  const normalizedAction = ['created', 'updated', 'deleted'].includes(action) ? action : 'updated';
  const eventTitle = htmlToPlainText(event?.title || '').trim() || 'Calendar update';
  const headlines = {
    created: 'New calendar event',
    updated: 'Calendar event updated',
    deleted: 'Calendar event removed',
  };
  const dateBits = [event?.date_label, event?.date_detail, event?.event_year].filter(Boolean).join(' ');
  return {
    subject: `${headlines[normalizedAction]}: ${eventTitle}`,
    text: [
      headlines[normalizedAction],
      eventTitle,
      dateBits ? `When: ${dateBits}` : '',
      '',
      `View calendar: ${siteUrl}/calendar.html`,
      '',
      'Reply STOP to unsubscribe from this email list.',
    ].filter(Boolean).join('\n'),
    html: `<p><strong>${escapeHtml(headlines[normalizedAction])}</strong></p><p>${escapeHtml(eventTitle)}</p>${dateBits ? `<p>When: ${escapeHtml(dateBits)}</p>` : ''}<p><a href="${siteUrl}/calendar.html">View calendar</a></p><p style="color:#667">Reply <strong>STOP</strong> to unsubscribe.</p>`,
  };
}

export async function notifyEmailSubscribers(env, {
  topic = 'calendar',
  action = 'updated',
  event = null,
  pageTitle = '',
} = {}) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, skipped: true, sent: 0, failed: 0, detail: 'RESEND_API_KEY is not configured' };
  }
  const subscribers = await listActiveEmailSubscribers(env, topic);
  if (!subscribers.length) {
    return { ok: true, skipped: true, sent: 0, failed: 0, detail: 'No email subscribers' };
  }
  const message = buildEmailListUpdateMessage({ topic, action, event, pageTitle });
  let sent = 0;
  let failed = 0;
  let detail = '';
  for (const row of subscribers) {
    try {
      await sendViaResend(env, {
        to: row.email,
        replyTo: EMAIL_LIST_REPLY_TO,
        subject: message.subject,
        text: message.text,
        html: message.html,
        fromEmail: String(env.CONTACT_FROM_EMAIL || EMAIL_LIST_FROM_EMAIL).trim() || EMAIL_LIST_FROM_EMAIL,
        fromName: String(env.CONTACT_FROM_NAME || EMAIL_LIST_FROM_NAME).trim() || EMAIL_LIST_FROM_NAME,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      if (!detail) detail = error?.message || 'Email send failed';
    }
  }
  return {
    ok: failed === 0 && sent > 0,
    sent,
    failed,
    total: subscribers.length,
    detail: detail || (sent ? '' : 'No emails were accepted'),
  };
}

async function fetchReceivedEmail(env, emailId) {
  const id = String(emailId || '').trim();
  if (!id) return null;
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Could not load received email (${response.status})`);
  }
  return response.json();
}

export async function handleResendInboundWebhook(env, request) {
  const rawBody = await request.text();
  const verified = await verifyResendWebhookSignature(rawBody, request.headers, env.RESEND_WEBHOOK_SECRET);
  if (!verified.ok) return jsonResponse({ detail: verified.detail }, 400);
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ detail: 'Invalid JSON payload' }, 400);
  }
  if (event?.type && event.type !== 'email.received') {
    return jsonResponse({ ok: true, ignored: true, type: event.type });
  }
  const data = event?.data && typeof event.data === 'object' ? event.data : {};
  const emailId = String(data.email_id || data.id || '').trim();
  const fromAddress = extractEmailAddress(data.from);
  let subject = String(data.subject || '');
  let text = '';
  let html = '';
  if (emailId && env.RESEND_API_KEY) {
    try {
      const received = await fetchReceivedEmail(env, emailId);
      subject = String(received?.subject || subject || '');
      text = String(received?.text || '');
      html = String(received?.html || '');
      if (!fromAddress) {
        const receivedFrom = extractEmailAddress(received?.from || received?.headers?.from || '');
        if (receivedFrom) data.from = receivedFrom;
      }
    } catch (error) {
      return jsonResponse({ detail: error?.message || 'Could not load received email' }, 502);
    }
  }
  const sender = extractEmailAddress(data.from) || fromAddress;
  if (!sender) return jsonResponse({ ok: true, ignored: true, detail: 'No sender address' });
  if (!isEmailListStopRequest({ subject, text, html })) {
    return jsonResponse({ ok: true, ignored: true, detail: 'Not a STOP request', from: sender });
  }
  const result = await unsubscribeEmailSubscriber(env, { email: sender, reason: 'inbound_stop' });
  if (result.found && !result.already && env.RESEND_API_KEY) {
    try {
      await sendViaResend(env, {
        to: sender,
        replyTo: EMAIL_LIST_REPLY_TO,
        subject: 'You are unsubscribed from East Forsyth Band emails',
        text: 'You have been removed from the East Forsyth Band email list. If this was a mistake, subscribe again at https://efhsband.org/calendar.html',
        html: '<p>You have been removed from the East Forsyth Band email list.</p><p>If this was a mistake, subscribe again on the <a href="https://efhsband.org/calendar.html">calendar page</a>.</p>',
        fromEmail: String(env.CONTACT_FROM_EMAIL || EMAIL_LIST_FROM_EMAIL).trim() || EMAIL_LIST_FROM_EMAIL,
        fromName: String(env.CONTACT_FROM_NAME || EMAIL_LIST_FROM_NAME).trim() || EMAIL_LIST_FROM_NAME,
      });
    } catch {
      // Confirmation mail is best-effort.
    }
  }
  return jsonResponse({
    ok: true,
    unsubscribed: Boolean(result.found),
    already: Boolean(result.already),
    email: result.email || sender,
    email_id: emailId || null,
  });
}

export function canAccessCheckout(user) {
  return (
    hasPermission(user, 'treasurer')
    || hasPermission(user, 'president')
    || hasPermission(user, 'vice-president')
  );
}

/** Treasurer ledger is limited to treasurer/president (not vice-president). */
export function canAccessTreasurerLedger(user) {
  return hasPermission(user, 'treasurer') || hasPermission(user, 'president');
}

/** Schedule Board: Super Admin, President, or Vice President. */
export function canAccessScheduleBoard(user) {
  return (
    isSuperAdmin(user)
    || hasPermission(user, 'president')
    || hasPermission(user, 'vice-president')
  );
}

/** Badge Creator: Super Admin, President, or Vice President. */
export function canAccessBadgeCreator(user) {
  return (
    isSuperAdmin(user)
    || hasPermission(user, 'president')
    || hasPermission(user, 'vice-president')
  );
}

const COMMITTEE_BADGE_ROLES = [
  'Director',
  'Assistant Director',
  'President',
  'Vice-President',
  'Secretary',
  'Treasurer',
  'Committee Member',
];

export function normalizeCommitteeBadgePayload(payload = {}, existing = {}) {
  const memberName = String(payload.member_name ?? existing.member_name ?? '').trim();
  const roleRaw = String(payload.role ?? existing.role ?? 'Committee Member').trim();
  const role = COMMITTEE_BADGE_ROLES.includes(roleRaw) ? roleRaw : 'Committee Member';
  const schoolYear = String(payload.school_year ?? existing.school_year ?? '').trim();
  const photoUrl = String(payload.photo_url ?? existing.photo_url ?? '').trim();
  const photoZoomRaw = Number(payload.photo_zoom ?? existing.photo_zoom ?? 1);
  const photoOffsetXRaw = Number(payload.photo_offset_x ?? existing.photo_offset_x ?? 0);
  const photoOffsetYRaw = Number(payload.photo_offset_y ?? existing.photo_offset_y ?? 0);
  const clamp = (value, min, max, fallback) => (
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  );
  return {
    member_name: memberName,
    role,
    school_year: schoolYear,
    photo_url: photoUrl,
    photo_zoom: clamp(photoZoomRaw, 1, 4, 1),
    photo_offset_x: clamp(photoOffsetXRaw, -2, 2, 0),
    photo_offset_y: clamp(photoOffsetYRaw, -2, 2, 0),
  };
}

async function getCommitteeBadges(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, member_name, role, school_year, photo_url, photo_zoom, photo_offset_x, photo_offset_y, created_by, created_at, updated_at FROM committee_badges ORDER BY datetime(updated_at) DESC, id DESC',
  ).all();
  return (results || []).map((row) => ({
    ...row,
    photo_zoom: Number(row.photo_zoom ?? 1) || 1,
    photo_offset_x: Number(row.photo_offset_x ?? 0) || 0,
    photo_offset_y: Number(row.photo_offset_y ?? 0) || 0,
  }));
}

export function canManageAllEvents(user) {
  return isSuperAdmin(user) || hasPermission(user, 'events:manage');
}

export function canCreateEvents(user) {
  return hasPermission(user, 'events') || canManageAllEvents(user);
}

/** Any signed-in CMS user may browse calendar events (mutations stay gated). */
export function canViewEvents(user) {
  return Boolean(user);
}

export function canMutateEvent(user, event) {
  if (!user || !event) return false;
  if (canManageAllEvents(user)) return true;
  if (!hasPermission(user, 'events')) return false;
  const ownerId = Number(event.created_by);
  const userId = Number(user.id);
  // Legacy events without an owner stay editable by calendar editors.
  if (!Number.isInteger(ownerId) || ownerId <= 0) return true;
  return ownerId === userId;
}

function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

function redirect(location) {
  return new Response(null, { status: 303, headers: { location } });
}

export function sanitizeAdminReturnPath(value = '/admin') {
  let raw = String(value || '').trim();
  if (!raw) return '/admin';
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return '/admin';
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('\n') || raw.includes('\r')) {
    return '/admin';
  }
  raw = raw.split('#')[0];
  const pathPart = raw.split('?')[0] || '/admin';
  if (!pathPart.startsWith('/admin')) return '/admin';
  return raw;
}

function publicSiteOrigin(request, env = {}) {
  const configured = String(env.PUBLIC_SITE_URL || env.SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through
    }
  }
  try {
    const host = String(new URL(request.url).host || '').toLowerCase();
    if (host === 'efhsband.org' || host.endsWith('.efhsband.org')) {
      return `https://${host}`;
    }
  } catch {
    // fall through
  }
  return PUBLIC_SITE_ORIGIN_DEFAULT;
}

function zernioFacebookCallbackUrl(request, env = {}) {
  return `${publicSiteOrigin(request, env)}/admin/zernio/facebook/callback`;
}

function zernioInstagramCallbackUrl(request, env = {}) {
  return `${publicSiteOrigin(request, env)}/admin/zernio/instagram/callback`;
}

export function absolutePublicAssetUrl(request, env, pathOrUrl = '') {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = publicSiteOrigin(request, env);
  return `${origin}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacSign(value, secret) {
  const key = await crypto.subtle.importKey('raw', TEXT.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(await crypto.subtle.sign('HMAC', key, TEXT.encode(value)));
}

async function makeSession(user, env) {
  const payload = base64Url(TEXT.encode(JSON.stringify({ uid: user.id, u: user.username, t: Math.floor(Date.now() / 1000) })));
  return `${payload}.${await hmacSign(payload, sessionSecret(env))}`;
}

export function isSessionFresh(issuedAtSeconds, nowSeconds = Math.floor(Date.now() / 1000), ttlSeconds = SESSION_TTL_SECONDS) {
  const issued = Number(issuedAtSeconds);
  const now = Number(nowSeconds);
  const ttl = Number(ttlSeconds);
  if (!Number.isFinite(issued) || !Number.isFinite(now) || !Number.isFinite(ttl)) return false;
  if (issued > now + 60) return false; // reject far-future timestamps
  return (now - issued) <= ttl;
}

export function sessionCookieHeader(token, { maxAge = SESSION_TTL_SECONDS } = {}) {
  const age = Math.max(0, Number(maxAge) || 0);
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
}

async function currentUser(request, env) {
  const value = getCookie(request, SESSION_COOKIE);
  if (!value || !value.includes('.')) return null;
  const [payload, supplied] = value.split('.');
  const expected = await hmacSign(payload, sessionSecret(env));
  if (supplied !== expected) return null;
  try {
    const data = JSON.parse(READ_TEXT.decode(fromBase64Url(payload)));
    if (!isSessionFresh(data.t)) return null;
    if (data.uid) return getUserById(env, Number(data.uid));
    if (data.u) return getUserByUsername(env, data.u);
  } catch {
    return null;
  }
  return null;
}

function sessionSecret(env) {
  return env.EFBAND_SECRET || 'change-me-before-launch';
}

function adminUsername(env) {
  return env.EFBAND_ADMIN_USERNAME || 'admin';
}

function initialAdminPassword(env) {
  return env.EFBAND_ADMIN_PASSWORD || 'admin123$';
}

async function hashPassword(password, salt = crypto.randomUUID().replaceAll('-', '')) {
  const iterations = 100000;
  const key = await crypto.subtle.importKey('raw', TEXT.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: TEXT.encode(salt), iterations }, key, 256);
  return `pbkdf2_sha256$${iterations}$${salt}$${base64Url(bits)}`;
}

async function verifyPassword(password, stored) {
  try {
    const [algorithm, iterationsText, salt, expected] = stored.split('$');
    if (algorithm !== 'pbkdf2_sha256') return false;
    const key = await crypto.subtle.importKey('raw', TEXT.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: TEXT.encode(salt), iterations: Number(iterationsText) }, key, 256);
    return base64Url(bits) === expected;
  } catch {
    return false;
  }
}

async function initDb(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, date_label TEXT NOT NULL, date_detail TEXT NOT NULL, event_year INTEGER NOT NULL DEFAULT 2026, title TEXT NOT NULL, description TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, show_on_boosters INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, original_name TEXT NOT NULL, alt_text TEXT NOT NULL, caption TEXT NOT NULL DEFAULT \'\', sort_order INTEGER NOT NULL DEFAULT 0, content_type TEXT NOT NULL DEFAULT \'application/octet-stream\', data_base64 TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sponsors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT \'\', city TEXT NOT NULL DEFAULT \'Kernersville\', state TEXT NOT NULL DEFAULT \'NC\', logo_url TEXT NOT NULL DEFAULT \'\', level TEXT NOT NULL DEFAULT \'Sponsor\', mark_text TEXT NOT NULL DEFAULT \'★\', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, homepage_ad INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sponsor_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, tier TEXT NOT NULL, amount_cents INTEGER NOT NULL, amount_display TEXT NOT NULL DEFAULT \'\', business_name TEXT NOT NULL, address TEXT NOT NULL DEFAULT \'\', phone TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL DEFAULT \'\', logo_url TEXT NOT NULL DEFAULT \'\', status TEXT NOT NULL DEFAULT \'pending_payment\', square_payment_link_id TEXT NOT NULL DEFAULT \'\', square_checkout_url TEXT NOT NULL DEFAULT \'\', completion_token TEXT NOT NULL DEFAULT \'\', sponsor_id INTEGER, paid_at TEXT, invoice_sent_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS donations (id INTEGER PRIMARY KEY AUTOINCREMENT, donor_name TEXT NOT NULL, amount_cents INTEGER NOT NULL, amount_display TEXT NOT NULL DEFAULT \'\', status TEXT NOT NULL DEFAULT \'pending_payment\', square_payment_id TEXT NOT NULL DEFAULT \'\', completion_token TEXT NOT NULL DEFAULT \'\', paid_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS dues_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_name TEXT NOT NULL, email TEXT NOT NULL DEFAULT \'\', amount_cents INTEGER NOT NULL, amount_display TEXT NOT NULL DEFAULT \'\', status TEXT NOT NULL DEFAULT \'pending_payment\', square_payment_id TEXT NOT NULL DEFAULT \'\', completion_token TEXT NOT NULL DEFAULT \'\', failure_detail TEXT NOT NULL DEFAULT \'\', receipt_sent_at TEXT, paid_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS staff_members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'\', bio TEXT NOT NULL DEFAULT \'\', photo_url TEXT NOT NULL DEFAULT \'\', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS booster_members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'\', bio TEXT NOT NULL DEFAULT \'\', photo_url TEXT NOT NULL DEFAULT \'\', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS contact_topics (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, email TEXT NOT NULL DEFAULT \'\', recipient_user_ids TEXT NOT NULL DEFAULT \'[]\', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS contact_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER, topic_label TEXT NOT NULL DEFAULT \'\', to_email TEXT NOT NULL DEFAULT \'\', name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0, delivery_error TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS booster_meeting_minutes (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_date TEXT NOT NULL, body_html TEXT NOT NULL DEFAULT \'\', created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS committee_badges (id INTEGER PRIMARY KEY AUTOINCREMENT, member_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'Committee Member\', school_year TEXT NOT NULL DEFAULT \'\', photo_url TEXT NOT NULL DEFAULT \'\', photo_zoom REAL NOT NULL DEFAULT 1, photo_offset_x REAL NOT NULL DEFAULT 0, photo_offset_y REAL NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS auth_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL DEFAULT \'\', password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'editor\', permissions TEXT NOT NULL DEFAULT \'[]\', active INTEGER NOT NULL DEFAULT 1, last_login_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS web_push_subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS email_subscribers (email TEXT PRIMARY KEY, topics TEXT NOT NULL DEFAULT \'["calendar","fundraising"]\', status TEXT NOT NULL DEFAULT \'active\', source TEXT NOT NULL DEFAULT \'website\', unsubscribe_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, unsubscribed_at TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS cms_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body_html TEXT NOT NULL DEFAULT \'\', nav_order INTEGER NOT NULL DEFAULT 0, is_home INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS admin_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, action TEXT NOT NULL, category TEXT NOT NULL DEFAULT \'admin\', method TEXT NOT NULL DEFAULT \'\', path TEXT NOT NULL DEFAULT \'\', status INTEGER, actor_user_id INTEGER, actor_username TEXT NOT NULL DEFAULT \'\', ip TEXT NOT NULL DEFAULT \'\', user_agent TEXT NOT NULL DEFAULT \'\', summary TEXT NOT NULL DEFAULT \'\', meta_json TEXT NOT NULL DEFAULT \'\{\}\', payload_sha256 TEXT NOT NULL DEFAULT \'\', ciphertext TEXT NOT NULL DEFAULT \'\', enc_version INTEGER NOT NULL DEFAULT 1)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS payment_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref_type TEXT NOT NULL DEFAULT \'\', ref_id INTEGER, name TEXT NOT NULL DEFAULT \'\', address TEXT NOT NULL DEFAULT \'\', amount_cents INTEGER NOT NULL DEFAULT 0, amount_display TEXT NOT NULL DEFAULT \'\', package TEXT NOT NULL DEFAULT \'\', note TEXT NOT NULL DEFAULT \'\', money_exchanged INTEGER NOT NULL DEFAULT 1, paid_at TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(kind, ref_type, ref_id))'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS caldev_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      who TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      track TEXT NOT NULL DEFAULT 'other',
      all_day INTEGER NOT NULL DEFAULT 1,
      source_event_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  ]);
  await ensureCaldevSchema(env);
  try {
    await env.DB.prepare('ALTER TABLE committee_badges ADD COLUMN photo_zoom REAL NOT NULL DEFAULT 1').run();
  } catch {
    // Column already exists.
  }
  try {
    await env.DB.prepare('ALTER TABLE committee_badges ADD COLUMN photo_offset_x REAL NOT NULL DEFAULT 0').run();
  } catch {
    // Column already exists.
  }
  try {
    await env.DB.prepare('ALTER TABLE committee_badges ADD COLUMN photo_offset_y REAL NOT NULL DEFAULT 0').run();
  } catch {
    // Column already exists.
  }
  try {
    await env.DB.prepare("ALTER TABLE admin_audit_log ADD COLUMN payload_sha256 TEXT NOT NULL DEFAULT ''").run();
  } catch {
    // Column already exists.
  }
  try {
    await env.DB.prepare("ALTER TABLE admin_audit_log ADD COLUMN ciphertext TEXT NOT NULL DEFAULT ''").run();
  } catch {
    // Column already exists.
  }
  try {
    await env.DB.prepare('ALTER TABLE admin_audit_log ADD COLUMN enc_version INTEGER NOT NULL DEFAULT 1').run();
  } catch {
    // Column already exists.
  }
  try {
    await env.DB.prepare('ALTER TABLE events ADD COLUMN event_year INTEGER NOT NULL DEFAULT 2026').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  await env.DB.prepare('UPDATE events SET event_year = 2026 WHERE event_year IS NULL OR event_year = 0').run();
  try {
    await env.DB.prepare('ALTER TABLE events ADD COLUMN show_on_boosters INTEGER NOT NULL DEFAULT 0').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE events ADD COLUMN created_by INTEGER').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE events ADD COLUMN repeat_enabled INTEGER NOT NULL DEFAULT 0').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE events ADD COLUMN repeat_days TEXT NOT NULL DEFAULT \'[]\'').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE events ADD COLUMN repeat_months TEXT NOT NULL DEFAULT \'[]\'').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE events ADD COLUMN repeat_exceptions TEXT NOT NULL DEFAULT \'[]\'').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE sponsors ADD COLUMN homepage_ad INTEGER NOT NULL DEFAULT 0').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE sponsor_applications ADD COLUMN completion_token TEXT NOT NULL DEFAULT \'\'').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE sponsor_applications ADD COLUMN sponsor_id INTEGER').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE sponsor_applications ADD COLUMN paid_at TEXT').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare("ALTER TABLE sponsor_applications ADD COLUMN email TEXT NOT NULL DEFAULT ''").run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE sponsor_applications ADD COLUMN invoice_sent_at TEXT').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare("ALTER TABLE sponsors ADD COLUMN city TEXT NOT NULL DEFAULT 'Kernersville'").run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare("ALTER TABLE sponsors ADD COLUMN state TEXT NOT NULL DEFAULT 'NC'").run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE users ADD COLUMN last_login_at TEXT').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare("ALTER TABLE contact_topics ADD COLUMN recipient_user_ids TEXT NOT NULL DEFAULT '[]'").run();
  } catch {
    // Column already exists on upgraded databases.
  }
  await migrateContactTopicRecipients(env);
  try {
    await env.DB.prepare("ALTER TABLE payment_ledger ADD COLUMN note TEXT NOT NULL DEFAULT ''").run();
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    await env.DB.prepare('ALTER TABLE payment_ledger ADD COLUMN money_exchanged INTEGER NOT NULL DEFAULT 1').run();
  } catch {
    // Column already exists on upgraded databases.
  }
  const legacySponsors = await env.DB.prepare('SELECT id, address, city, state FROM sponsors').all();
  for (const row of legacySponsors.results || []) {
    const rawAddress = String(row.address || '');
    if (!rawAddress.includes(',')) continue;
    const parts = rawAddress.split(',').map((part) => part.trim()).filter(Boolean);
    const maybeState = normalizeStateCode(parts[parts.length - 1] || '', '');
    if (!maybeState || !isUsStateCode(maybeState)) continue;
    const parsed = parseLegacySponsorAddress(rawAddress);
    await env.DB.prepare('UPDATE sponsors SET address = ?, city = ?, state = ? WHERE id = ?')
      .bind(parsed.address, parsed.city, parsed.state, row.id)
      .run();
  }
  const tierRows = await env.DB.prepare('SELECT id, level, homepage_ad FROM sponsors').all();
  for (const row of tierRows.results || []) {
    const nextLevel = normalizeSponsorLevel(row.level, { homepageAd: row.homepage_ad });
    const benefits = sponsorBenefitsFromLevel(nextLevel);
    const nextAd = benefits.show_flyin ? 1 : 0;
    if (nextLevel !== String(row.level || '') || Number(row.homepage_ad) !== nextAd) {
      await env.DB.prepare('UPDATE sponsors SET level = ?, homepage_ad = ? WHERE id = ?')
        .bind(nextLevel, nextAd, row.id)
        .run();
    }
  }
  const siteRows = await env.DB.prepare('SELECT key FROM site_content').all();
  const existingKeys = new Set((siteRows.results || []).map((row) => row.key));
  for (const [key, value] of Object.entries(DEFAULT_SITE)) {
    if (!existingKeys.has(key)) await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?)').bind(key, value).run();
  }
  const eventCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM events').first();
  if (!eventCount?.count) {
    await env.DB.batch(DEFAULT_EVENTS.map((event) => env.DB.prepare('INSERT INTO events (date_label, date_detail, event_year, title, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)').bind(event.date_label, event.date_detail, event.event_year, event.title, event.description, event.sort_order)));
  }
  const sponsorCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM sponsors').first();
  if (!sponsorCount?.count) {
    await env.DB.batch(DEFAULT_SPONSORS.map((sponsor) => env.DB.prepare('INSERT INTO sponsors (name, address, city, state, logo_url, level, mark_text, sort_order, active, homepage_ad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(sponsor.name, sponsor.address, sponsor.city || 'Kernersville', sponsor.state || 'NC', sponsor.logo_url, sponsor.level, sponsor.mark_text, sponsor.sort_order, sponsor.active, sponsor.homepage_ad ?? 0)));
  }
  const staffCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM staff_members').first();
  if (!staffCount?.count) {
    await env.DB.batch(DEFAULT_STAFF.map((member) => env.DB.prepare('INSERT INTO staff_members (name, role, bio, photo_url, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)').bind(member.name, member.role, member.bio, member.photo_url, member.sort_order, member.active)));
  }
  const boosterMemberCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM booster_members').first();
  if (!boosterMemberCount?.count) {
    await env.DB.batch(DEFAULT_BOOSTER_MEMBERS.map((member) => env.DB.prepare('INSERT INTO booster_members (name, role, bio, photo_url, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)').bind(member.name, member.role, member.bio, member.photo_url, member.sort_order, member.active)));
  }
  const topicCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM contact_topics').first();
  if (!topicCount?.count) {
    const fallbackEmail = String(env.CONTACT_DEFAULT_EMAIL || '').trim();
    await env.DB.batch(DEFAULT_CONTACT_TOPICS.map((topic) => env.DB.prepare('INSERT INTO contact_topics (label, email, sort_order, active) VALUES (?, ?, ?, ?)').bind(topic.label, topic.email || fallbackEmail, topic.sort_order, topic.active)));
  }
  const pageCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM cms_pages').first();
  if (!pageCount?.count) {
    await env.DB.batch(DEFAULT_CMS_PAGES.map((page) => env.DB.prepare('INSERT INTO cms_pages (slug, path, title, body_html, nav_order, is_home, active) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(page.slug, page.path, page.title, page.body_html, page.nav_order, page.is_home, page.active)));
  }
  const becomeSponsorPage = DEFAULT_CMS_PAGES.find((page) => page.slug === 'become-a-sponsor');
  if (becomeSponsorPage) {
    const existingBecome = await env.DB.prepare("SELECT id FROM cms_pages WHERE slug = 'become-a-sponsor'").first();
    if (!existingBecome) {
      await env.DB.prepare('INSERT INTO cms_pages (slug, path, title, body_html, nav_order, is_home, active) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(becomeSponsorPage.slug, becomeSponsorPage.path, becomeSponsorPage.title, becomeSponsorPage.body_html, becomeSponsorPage.nav_order, becomeSponsorPage.is_home, becomeSponsorPage.active)
        .run();
    }
  }
  const sponsorsPageRow = await env.DB.prepare("SELECT id, body_html FROM cms_pages WHERE slug = 'sponsors'").first();
  if (sponsorsPageRow?.body_html) {
    const nextSponsorsHtml = ensureSponsorDonateButton(rewriteBecomeSponsorLinks(stripSponsorTiersSection(sponsorsPageRow.body_html)));
    if (nextSponsorsHtml !== sponsorsPageRow.body_html) {
      await env.DB.prepare('UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(nextSponsorsHtml, sponsorsPageRow.id)
        .run();
    }
  }
  const fundraisingPageRow = await env.DB.prepare("SELECT id, body_html FROM cms_pages WHERE slug = 'fundraising'").first();
  if (fundraisingPageRow?.body_html) {
    const nextFundraisingHtml = ensureEmailListSignupSlot(
      ensureFundraisingDonateSlot(fundraisingPageRow.body_html),
      {
        topics: ['fundraising', 'calendar'],
        heading: 'Email fundraising updates',
        detail: 'Get campaign notes by email. Reply STOP to any message to unsubscribe.',
      },
    );
    if (nextFundraisingHtml !== fundraisingPageRow.body_html) {
      await env.DB.prepare('UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(nextFundraisingHtml, fundraisingPageRow.id)
        .run();
    }
  }
  const boostersPageRow = await env.DB.prepare("SELECT id, body_html FROM cms_pages WHERE slug = 'boosters'").first();
  if (boostersPageRow?.body_html) {
    const siteForDues = await getSite(env);
    const nextBoostersHtml = applyBoostersDuesVisibility(
      ensureBoosterMembersSlot(ensureBoosterMeetingsSlot(boostersPageRow.body_html)),
      isBoostersDuesEnabled(siteForDues),
    );
    if (nextBoostersHtml !== boostersPageRow.body_html) {
      await env.DB.prepare('UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(nextBoostersHtml, boostersPageRow.id)
        .run();
    }
  }
  const homePageRow = await env.DB.prepare("SELECT id, body_html FROM cms_pages WHERE slug = 'home' OR is_home = 1 ORDER BY is_home DESC, id ASC LIMIT 1").first();
  if (homePageRow?.body_html) {
    const nextHomeHtml = ensureHomePhotoGallerySlot(refreshHomeHeroBrandMark(refreshHomeStartHereSection(homePageRow.body_html)));
    if (nextHomeHtml !== homePageRow.body_html) {
      await env.DB.prepare('UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(nextHomeHtml, homePageRow.id)
        .run();
    }
  }
  const galleryPage = DEFAULT_CMS_PAGES.find((page) => page.slug === 'gallery');
  if (galleryPage) {
    const existingGallery = await env.DB.prepare("SELECT id, body_html FROM cms_pages WHERE slug = 'gallery'").first();
    if (!existingGallery) {
      await env.DB.prepare('UPDATE cms_pages SET nav_order = nav_order + 1 WHERE nav_order >= ?').bind(galleryPage.nav_order).run();
      await env.DB.prepare('INSERT INTO cms_pages (slug, path, title, body_html, nav_order, is_home, active) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(galleryPage.slug, galleryPage.path, galleryPage.title, galleryPage.body_html, galleryPage.nav_order, galleryPage.is_home, galleryPage.active)
        .run();
    } else if (existingGallery.body_html) {
      const nextGalleryHtml = ensureGalleryPageSlot(existingGallery.body_html);
      if (nextGalleryHtml !== existingGallery.body_html) {
        await env.DB.prepare('UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(nextGalleryHtml, existingGallery.id)
          .run();
      }
    }
  }
  const calendarPageRow = await env.DB.prepare("SELECT id, body_html FROM cms_pages WHERE slug = 'calendar'").first();
  if (calendarPageRow?.body_html) {
    const nextCalendarHtml = ensureEmailListSignupSlot(
      ensureCalendarMonthMount(calendarPageRow.body_html),
      {
        topics: ['calendar', 'fundraising'],
        heading: 'Email calendar updates',
        detail: 'Get calendar changes by email. Reply STOP to any message to unsubscribe.',
      },
    );
    if (nextCalendarHtml !== calendarPageRow.body_html) {
      await env.DB.prepare('UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(nextCalendarHtml, calendarPageRow.id)
        .run();
    }
  }
  const userCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  if (!userCount?.count) {
    const previousHash = await env.DB.prepare("SELECT value FROM auth_settings WHERE key = 'admin_password_hash'").first();
    const passwordHash = previousHash?.value || await hashPassword(initialAdminPassword(env));
    await env.DB.prepare('INSERT INTO users (username, display_name, password_hash, role, permissions, active) VALUES (?, ?, ?, ?, ?, 1)').bind(adminUsername(env), 'Site Administrator', passwordHash, 'admin', JSON.stringify(['all'])).run();
    await env.DB.prepare("INSERT INTO auth_settings (key, value) VALUES ('admin_password_hash', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(passwordHash).run();
  }
}

export function isMaintenanceMode(site = {}) {
  const value = site?.maintenance_mode;
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

/** Band dues card on Boosters — on by default unless explicitly disabled. */
export function isBoostersDuesEnabled(site = {}) {
  const value = site?.boosters_dues_enabled;
  if (value === undefined || value === null || value === '') return true;
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

export function isMaintenancePath(pathname = '/') {
  return pathname === '/maintenance' || pathname === '/maintenance.html';
}

export function isPublicHtmlPath(pathname = '/') {
  if (pathname === '/') return true;
  const path = normalizeStaticPath(pathname);
  return path.endsWith('.html');
}

export function shouldRedirectToMaintenance(pathname = '/', site = {}, { bypass = false } = {}) {
  if (bypass) return false;
  if (!isMaintenanceMode(site)) return false;
  if (isMaintenancePath(pathname)) return false;
  return isPublicHtmlPath(pathname);
}

export function renderMaintenancePreviewBanner() {
  return `<div class="maintenance-preview-banner" role="status" data-maintenance-preview-banner>
  <strong>Maintenance mode is on.</strong>
  <span>Super Admin preview — the public and other users still see the maintenance page.</span>
  <a href="/admin">Back to CMS</a>
</div>`;
}

export function sanitizeMaintenanceReturnPath(value = '/') {
  let raw = String(value || '').trim();
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes(':')) return '/';
  raw = raw.split('#')[0];
  const pathPart = raw.split('?')[0] || '/';
  if (isMaintenancePath(pathPart) || pathPart.startsWith('/admin') || pathPart.startsWith('/api') || pathPart.startsWith('/uploads/')) {
    return '/';
  }
  if (pathPart !== '/' && !isPublicHtmlPath(pathPart)) return '/';
  const normalized = pathPart === '/' ? '/' : normalizeStaticPath(pathPart);
  const query = raw.includes('?') ? `?${raw.split('?').slice(1).join('?')}` : '';
  const base = normalized === '/index.html' ? '/' : normalized;
  if (base === '/') return query ? `/${query}` : '/';
  return `${base}${query}`;
}

export function maintenanceReturnCookie(pathname = '/') {
  const path = sanitizeMaintenanceReturnPath(pathname);
  return `${MAINTENANCE_RETURN_COOKIE}=${encodeURIComponent(path)}; Path=/; Max-Age=604800; SameSite=Lax`;
}

export function clearMaintenanceReturnCookie() {
  return `${MAINTENANCE_RETURN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readMaintenanceReturnPath(request) {
  const raw = getCookie(request, MAINTENANCE_RETURN_COOKIE);
  if (!raw) return '/';
  try {
    return sanitizeMaintenanceReturnPath(decodeURIComponent(raw));
  } catch {
    return '/';
  }
}

export function normalizeSponsorAdSeconds(value, fallback = 6) {
  const raw = Number(value);
  const base = Number.isFinite(raw) ? raw : Number(fallback);
  const seconds = Math.round(Number.isFinite(base) ? base : 6);
  return Math.min(30, Math.max(2, seconds));
}

export function parseSponsorAmountCents(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

export function resolveSponsorAmountCents({ amountCents, amountDisplay } = {}) {
  const raw = amountCents;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    // Pure integer values are already cents from the client/form.
    if (/^\s*\d+\s*$/.test(String(raw))) {
      const cents = Math.round(Number(raw));
      return Number.isFinite(cents) && cents > 0 ? cents : 0;
    }
    return parseSponsorAmountCents(raw);
  }
  return parseSponsorAmountCents(amountDisplay);
}

export function formatSponsorAmountDisplay(cents) {
  const amount = Number(cents);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const dollars = amount / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function normalizeSponsorTierKey(value) {
  const tier = String(value || '').trim().toLowerCase();
  if (tier === 'bronze' || tier === 'silver' || tier === 'gold') return tier;
  return '';
}

export const SQUARE_SETTINGS_KEY = 'square_settings';

export function emptySquareSettings() {
  return {
    access_token: '',
    application_id: '',
    location_id: '',
    environment: 'production',
  };
}

export function sanitizeSquareAccessToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

export function normalizeSquareEnvironment(value = '') {
  return String(value || '').trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
}

export function parseSquareSettings(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || 'null') : value;
    if (!parsed || typeof parsed !== 'object') return emptySquareSettings();
    return {
      access_token: sanitizeSquareAccessToken(parsed.access_token || parsed.square_access_token || parsed.SQUARE_ACCESS_TOKEN || ''),
      application_id: String(parsed.application_id || parsed.square_application_id || parsed.SQUARE_APPLICATION_ID || parsed.SQUARE_APP_ID || '').trim(),
      location_id: String(parsed.location_id || parsed.square_location_id || parsed.SQUARE_LOCATION_ID || '').trim(),
      environment: normalizeSquareEnvironment(parsed.environment || parsed.SQUARE_ENVIRONMENT || parsed.SQUARE_ENV || 'production'),
    };
  } catch {
    return emptySquareSettings();
  }
}

export function squareAccessToken(env = {}) {
  return sanitizeSquareAccessToken(env.SQUARE_ACCESS_TOKEN || '');
}

export function squareApplicationId(env = {}) {
  return String(env.SQUARE_APPLICATION_ID || env.SQUARE_APP_ID || '').trim();
}

export function squareCheckoutConfigured(env = {}) {
  return Boolean(squareAccessToken(env));
}

export function squareWebPaymentsConfigured(env = {}) {
  return Boolean(squareAccessToken(env) && squareApplicationId(env));
}

/** When host env has Square secrets (e.g. Pages), copy them into shared D1 for CMS + other hosts. */
export async function syncSquareSettingsFromEnv(env = {}) {
  const envToken = squareAccessToken(env);
  if (!envToken || !env?.DB) return false;
  const next = {
    access_token: envToken,
    application_id: squareApplicationId(env),
    location_id: String(env.SQUARE_LOCATION_ID || '').trim(),
    environment: normalizeSquareEnvironment(env.SQUARE_ENVIRONMENT || env.SQUARE_ENV || 'production'),
  };
  let stored = emptySquareSettings();
  try {
    stored = parseSquareSettings(await getSiteContentValue(env, SQUARE_SETTINGS_KEY));
  } catch {
    stored = emptySquareSettings();
  }
  if (!next.application_id) next.application_id = stored.application_id;
  if (!next.location_id) next.location_id = stored.location_id;
  if (
    stored.access_token === next.access_token
    && stored.application_id === next.application_id
    && stored.location_id === next.location_id
    && stored.environment === next.environment
  ) {
    return false;
  }
  try {
    await setSiteContentValue(env, SQUARE_SETTINGS_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export async function resolveSquareRuntimeEnv(env = {}) {
  const envToken = squareAccessToken(env);
  const envAppId = squareApplicationId(env);
  const envLocation = String(env.SQUARE_LOCATION_ID || '').trim();
  const envMode = String(env.SQUARE_ENVIRONMENT || env.SQUARE_ENV || '').trim();
  let stored = emptySquareSettings();
  if (env?.DB) {
    try {
      if (envToken) await syncSquareSettingsFromEnv(env);
      stored = parseSquareSettings(await getSiteContentValue(env, SQUARE_SETTINGS_KEY));
    } catch {
      stored = emptySquareSettings();
    }
  }
  const token = envToken || stored.access_token;
  const applicationId = envAppId || stored.application_id;
  const locationId = envLocation || stored.location_id;
  const environment = envMode ? normalizeSquareEnvironment(envMode) : stored.environment;
  return {
    env: {
      ...env,
      SQUARE_ACCESS_TOKEN: token,
      SQUARE_APPLICATION_ID: applicationId,
      SQUARE_LOCATION_ID: locationId,
      SQUARE_ENVIRONMENT: environment,
    },
    source: envToken ? 'env' : (stored.access_token ? 'database' : ''),
    has_database_settings: Boolean(stored.access_token || stored.application_id || stored.location_id),
    configured: Boolean(token),
  };
}

function squareConfigDetail({ configured, applicationId, location, includeManage = false } = {}) {
  if (!configured) {
    return includeManage
      ? 'Square is not connected on this host. Super Admin can paste the access token and application ID below, or add SQUARE_ACCESS_TOKEN in Cloudflare settings.'
      : 'Square payment is not connected yet.';
  }
  if (!applicationId) {
    return includeManage
      ? 'Square access token is connected. Add SQUARE_APPLICATION_ID below to enable card checkout.'
      : 'Square access token is connected. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.';
  }
  if (!location?.ok) return location?.detail || 'Square location could not be determined.';
  return includeManage ? 'Square checkout is ready.' : 'Square card payments are ready in the signup popup.';
}

export async function buildSquareCheckoutConfig(env = {}, { includeManage = false, user = null } = {}) {
  const resolved = await resolveSquareRuntimeEnv(env);
  const applicationId = squareApplicationId(resolved.env);
  const configured = resolved.configured;
  const location = configured
    ? await resolveSquareLocationId(resolved.env)
    : { ok: false, location_id: '', detail: '' };
  const payload = {
    configured,
    configured_source: resolved.source,
    environment: normalizeSquareEnvironment(resolved.env.SQUARE_ENVIRONMENT),
    application_id: applicationId,
    location_ready: Boolean(location.ok && location.location_id),
    location_id: location.ok ? location.location_id : '',
    web_payments: Boolean(applicationId && location.ok && location.location_id),
    mock_enabled: squareMockPayEnabled(resolved.env),
    detail: squareConfigDetail({
      configured,
      applicationId,
      location,
      includeManage,
    }),
  };
  if (includeManage) {
    payload.can_manage = isSuperAdmin(user);
    payload.database_saved = resolved.has_database_settings;
  }
  return { ...payload, runtime: resolved };
}

export async function createSquareCardPayment(env, {
  sourceId,
  amountCents,
  locationId = '',
  referenceId = '',
  note = '',
} = {}) {
  const token = squareAccessToken(env);
  if (!token) return { ok: false, detail: 'Square is not configured' };
  const cents = Math.round(Number(amountCents) || 0);
  if (cents < 100) return { ok: false, detail: 'Payment amount must be at least $1' };
  const source = String(sourceId || '').trim();
  if (!source) return { ok: false, detail: 'Payment card token is required' };
  let resolvedLocationId = String(locationId || env.SQUARE_LOCATION_ID || '').trim();
  if (!resolvedLocationId) {
    const location = await resolveSquareLocationId(env);
    if (!location.ok || !location.location_id) {
      return { ok: false, detail: location.detail || 'Square location could not be determined' };
    }
    resolvedLocationId = location.location_id;
  }
  const body = {
    idempotency_key: crypto.randomUUID(),
    source_id: source,
    amount_money: { amount: cents, currency: 'USD' },
    location_id: resolvedLocationId,
    autocomplete: true,
  };
  if (referenceId) body.reference_id = String(referenceId).slice(0, 40);
  if (note) body.note = String(note).slice(0, 500);
  const response = await fetch(`${squareApiBase(env)}/v2/payments`, {
    method: 'POST',
    headers: squareApiHeaders(env),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, detail: formatSquareError(payload, response.status) };
  }
  const payment = payload?.payment || {};
  return {
    ok: true,
    payment_id: String(payment.id || ''),
    status: String(payment.status || ''),
    receipt_url: String(payment.receipt_url || ''),
    location_id: resolvedLocationId,
  };
}

export function squareApiBase(env = {}) {
  return normalizeSquareEnvironment(env.SQUARE_ENVIRONMENT || env.SQUARE_ENV) === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

export function squareApiHeaders(env = {}) {
  return {
    Authorization: `Bearer ${squareAccessToken(env)}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Square-Version': '2024-11-20',
  };
}

export function formatSquareError(payload = {}, status = 0) {
  const first = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  const parts = [
    first?.detail,
    first?.code,
    first?.category,
    payload?.message,
    status ? `HTTP ${status}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'Square request failed';
}

export function pickSquareLocationId(locations = [], preferredId = '') {
  const preferred = String(preferredId || '').trim();
  const list = Array.isArray(locations) ? locations : [];
  if (preferred) {
    const match = list.find((location) => String(location?.id || '') === preferred);
    if (match?.id) return String(match.id);
    // Allow an explicit override even if ListLocations failed/was empty.
    if (!list.length) return preferred;
  }
  const active = list.find((location) => String(location?.status || '').toUpperCase() === 'ACTIVE' && location?.id);
  if (active?.id) return String(active.id);
  const first = list.find((location) => location?.id);
  return first?.id ? String(first.id) : '';
}

export async function resolveSquareLocationId(env = {}) {
  const configured = String(env.SQUARE_LOCATION_ID || '').trim();
  const token = squareAccessToken(env);
  if (!token) {
    return { ok: false, location_id: '', detail: 'Square access token is not configured' };
  }
  try {
    const response = await fetch(`${squareApiBase(env)}/v2/locations`, {
      method: 'GET',
      headers: squareApiHeaders(env),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = formatSquareError(payload, response.status);
      if (configured) return { ok: true, location_id: configured, detail: '' };
      return { ok: false, location_id: '', detail };
    }
    const locationId = pickSquareLocationId(payload?.locations || [], configured);
    if (!locationId) {
      return {
        ok: false,
        location_id: '',
        detail: 'No Square location found on this account. Create a location in Square, then try again.',
      };
    }
    return { ok: true, location_id: locationId, detail: '' };
  } catch (error) {
    if (configured) return { ok: true, location_id: configured, detail: '' };
    return {
      ok: false,
      location_id: '',
      detail: error?.message || 'Could not reach Square to look up a location',
    };
  }
}

export async function createSquarePaymentLink(env, {
  name,
  amountCents,
  referenceId = '',
  buyerPhone = '',
  redirectUrl = '',
} = {}) {
  const token = squareAccessToken(env);
  if (!token) {
    return { ok: false, detail: 'Square is not configured' };
  }
  const location = await resolveSquareLocationId(env);
  if (!location.ok || !location.location_id) {
    return { ok: false, detail: location.detail || 'Square location could not be determined' };
  }
  const locationId = location.location_id;
  const cents = Math.round(Number(amountCents) || 0);
  if (cents < 100) {
    return { ok: false, detail: 'Payment amount must be at least $1' };
  }
  const itemName = String(name || 'Sponsor package').trim().slice(0, 255) || 'Sponsor package';
  const body = {
    idempotency_key: crypto.randomUUID(),
    quick_pay: {
      name: itemName,
      price_money: { amount: cents, currency: 'USD' },
      location_id: locationId,
    },
  };
  if (redirectUrl) {
    body.checkout_options = { redirect_url: String(redirectUrl).slice(0, 2048) };
  }
  if (referenceId) body.payment_note = String(referenceId).slice(0, 500);
  void buyerPhone;
  const response = await fetch(`${squareApiBase(env)}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: squareApiHeaders(env),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Minimal retry without optional fields — some accounts reject notes/redirects.
    if (body.checkout_options || body.payment_note) {
      const minimal = {
        idempotency_key: crypto.randomUUID(),
        quick_pay: body.quick_pay,
      };
      const retry = await fetch(`${squareApiBase(env)}/v2/online-checkout/payment-links`, {
        method: 'POST',
        headers: squareApiHeaders(env),
        body: JSON.stringify(minimal),
      });
      const retryPayload = await retry.json().catch(() => ({}));
      if (retry.ok) {
        const link = retryPayload?.payment_link || {};
        const url = String(link.url || link.long_url || '').trim();
        if (url) {
          return {
            ok: true,
            id: String(link.id || ''),
            url,
            order_id: String(link.order_id || ''),
            location_id: locationId,
          };
        }
      }
      return { ok: false, detail: formatSquareError(retryPayload, retry.status) || formatSquareError(payload, response.status) };
    }
    return { ok: false, detail: formatSquareError(payload, response.status) };
  }
  const link = payload?.payment_link || {};
  const url = String(link.url || link.long_url || '').trim();
  if (!url) return { ok: false, detail: 'Square did not return a checkout URL' };
  return {
    ok: true,
    id: String(link.id || ''),
    url,
    order_id: String(link.order_id || ''),
    location_id: locationId,
  };
}

export function normalizeUtilityLinks(value) {
  let items = value;
  if (typeof value === 'string') {
    try {
      items = JSON.parse(value);
    } catch {
      items = null;
    }
  }
  if (!Array.isArray(items) || !items.length) items = DEFAULT_UTILITY_LINKS;
  return items.slice(0, 6).map((item, index) => {
    const label = String(item?.label || '').trim() || `Link ${index + 1}`;
    let href = String(item?.href || '').trim() || '#';
    if (/^\s*javascript:/i.test(href)) href = '#';
    else if (/^https?:\/\//i.test(href) || href.startsWith('/') || href === '#') {
      // keep absolute URLs, site-root paths, and placeholders
    } else {
      href = `/${href.replace(/^\/+/, '')}`;
    }
    const rawTarget = String(item?.target || '_self').trim().toLowerCase();
    const target = rawTarget === '_blank' ? '_blank' : '_self';
    return { label, href, target };
  }).filter((item) => item.label);
}

function canManageUtilityLinks(user) {
  return hasPermission(user, 'site') || hasPermission(user, 'pages') || canEditPage(user, 'home');
}

function renderUtilityLinks(site = {}) {
  return normalizeUtilityLinks(site.utility_links)
    .map((link) => {
      const targetAttr = link.target === '_blank'
        ? ' target="_blank" rel="noopener noreferrer"'
        : '';
      return `<a href="${escapeAttr(link.href)}"${targetAttr}>${escapeHtml(link.label)}</a>`;
    })
    .join('');
}

export function normalizeSocialHref(value) {
  let href = String(value || '').trim();
  if (!href) return '';
  if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/?#].*)?$/i.test(href)) {
    return `https://${href}`;
  }
  return '';
}

export function normalizeSocialLinks(value) {
  let items = value;
  if (typeof value === 'string') {
    try {
      items = JSON.parse(value);
    } catch {
      items = null;
    }
  }
  const byPlatform = new Map();
  if (Array.isArray(items)) {
    for (const item of items) {
      const platform = String(item?.platform || item?.id || '').trim().toLowerCase();
      if (!platform) continue;
      byPlatform.set(platform, normalizeSocialHref(item?.href || item?.url || ''));
    }
  }
  return SOCIAL_PLATFORMS.map((platform) => ({
    platform: platform.id,
    label: platform.label,
    href: byPlatform.has(platform.id) ? byPlatform.get(platform.id) : '',
  }));
}

export function renderSocialLinks(site = {}) {
  const links = normalizeSocialLinks(site.social_links);
  const items = links.map((link) => {
    const icon = SOCIAL_ICONS[link.platform] || '';
    if (link.href) {
      return `<a class="footer-social-link" href="${escapeAttr(link.href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(link.label)}">${icon}<span class="sr-only">${escapeHtml(link.label)}</span></a>`;
    }
    return `<span class="footer-social-link is-placeholder" aria-hidden="true" title="${escapeAttr(`${link.label} coming soon`)}">${icon}</span>`;
  }).join('');
  return `<nav class="footer-social" aria-label="Social media">${items}</nav>`;
}

export const DEFAULT_HOME_FEATURE_CARDS = {
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

function normalizeCmsHref(value, fallback = '#') {
  let href = String(value || '').trim() || fallback;
  if (/^\s*javascript:/i.test(href)) return fallback || '#';
  if (/^https?:\/\//i.test(href) || href.startsWith('/') || href === '#' || /^[a-z0-9][a-z0-9._-]*\.html(?:[?#].*)?$/i.test(href)) {
    return href;
  }
  return `/${href.replace(/^\/+/, '')}`;
}

function plainTextFromMarkup(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInlineRichField(value, fallback = '') {
  const raw = String(value ?? '').trim();
  const source = raw || String(fallback || '').trim();
  if (!source) return '';
  return looksLikeInlineRichHtml(source) ? sanitizeInlineRichHtml(source) : plainTextFromMarkup(source);
}

export function normalizeHomeFeatureCards(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    boosters_tag: normalizeInlineRichField(source.boosters_tag, DEFAULT_HOME_FEATURE_CARDS.boosters_tag) || DEFAULT_HOME_FEATURE_CARDS.boosters_tag,
    boosters_heading: normalizeInlineRichField(source.boosters_heading, DEFAULT_HOME_FEATURE_CARDS.boosters_heading) || DEFAULT_HOME_FEATURE_CARDS.boosters_heading,
    boosters_body: normalizeInlineRichField(source.boosters_body, DEFAULT_HOME_FEATURE_CARDS.boosters_body) || DEFAULT_HOME_FEATURE_CARDS.boosters_body,
    boosters_button: normalizeInlineRichField(source.boosters_button, DEFAULT_HOME_FEATURE_CARDS.boosters_button) || DEFAULT_HOME_FEATURE_CARDS.boosters_button,
    boosters_href: normalizeCmsHref(source.boosters_href ?? DEFAULT_HOME_FEATURE_CARDS.boosters_href, DEFAULT_HOME_FEATURE_CARDS.boosters_href),
    launch_tag: normalizeInlineRichField(source.launch_tag, DEFAULT_HOME_FEATURE_CARDS.launch_tag) || DEFAULT_HOME_FEATURE_CARDS.launch_tag,
    launch_heading: normalizeInlineRichField(source.launch_heading, DEFAULT_HOME_FEATURE_CARDS.launch_heading) || DEFAULT_HOME_FEATURE_CARDS.launch_heading,
    launch_body: normalizeInlineRichField(source.launch_body, DEFAULT_HOME_FEATURE_CARDS.launch_body) || DEFAULT_HOME_FEATURE_CARDS.launch_body,
    launch_footer: normalizeInlineRichField(source.launch_footer, DEFAULT_HOME_FEATURE_CARDS.launch_footer) || DEFAULT_HOME_FEATURE_CARDS.launch_footer,
  };
}

export function hasHomeFeatureCardFields(payload = {}) {
  return HOME_FEATURE_CARD_KEYS.some((key) => payload?.[key] !== undefined);
}

function matchInner(block, pattern) {
  const match = String(block || '').match(pattern);
  if (!match) return '';
  const raw = String(match[1] || '');
  return looksLikeInlineRichHtml(raw) ? sanitizeInlineRichHtml(raw) : plainTextFromMarkup(raw);
}

export function extractHomeFeatureCards(html = '') {
  const source = String(html || '');
  const boostersMatch = source.match(/<article[^>]*class="[^"]*\baccent-card\b[^"]*"[^>]*>([\s\S]*?)<\/article>/i)
    || source.match(/<article[^>]*data-cms-block="home-boosters"[^>]*>([\s\S]*?)<\/article>/i);
  const launchMatch = source.match(/data-cms-block="home-launch"[^>]*>([\s\S]*?)<\/article>/i)
    || source.match(/<article[^>]*class="[^"]*\baccent-card\b[^"]*"[^>]*>[\s\S]*?<\/article>\s*<article[^>]*class="card"[^>]*>([\s\S]*?)<\/article>/i);

  const boosters = boostersMatch?.[1] || '';
  const launch = launchMatch?.[1] || '';
  const buttonHref = (boosters.match(/<a[^>]*class="[^"]*\bbtn secondary\b[^"]*"[^>]*href="([^"]*)"/i)
    || boosters.match(/href="([^"]*)"[^>]*class="[^"]*\bbtn secondary\b[^"]*"/i)
    || [])[1];

  return normalizeHomeFeatureCards({
    boosters_tag: matchInner(boosters, /<span[^>]*class="[^"]*\btag\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || undefined,
    boosters_heading: matchInner(boosters, /<h3[^>]*>([\s\S]*?)<\/h3>/i) || undefined,
    boosters_body: matchInner(boosters, /<h3[^>]*>[\s\S]*?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i) || undefined,
    boosters_button: matchInner(boosters, /<a[^>]*class="[^"]*\bbtn secondary\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || undefined,
    boosters_href: buttonHref || undefined,
    launch_tag: matchInner(launch, /<span[^>]*class="[^"]*\btag\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || undefined,
    launch_heading: matchInner(launch, /<h3[^>]*>([\s\S]*?)<\/h3>/i) || undefined,
    launch_body: matchInner(launch, /<h3[^>]*>[\s\S]*?<\/h3>\s*<p(?![^>]*class="draft")[^>]*>([\s\S]*?)<\/p>/i) || undefined,
    launch_footer: matchInner(launch, /<p[^>]*class="[^"]*\bdraft\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || undefined,
  });
}

export function renderHomeFeatureCardsSection(cards = {}) {
  const c = normalizeHomeFeatureCards(cards);
  return `<section data-cms-home-cards>
  <div class="wrap grid two">
    <article class="card accent-card" data-cms-block="home-boosters"><span class="tag" data-cms-field="boosters_tag">${formatInlineRichText(c.boosters_tag)}</span><h3 data-cms-field="boosters_heading">${formatInlineRichText(c.boosters_heading)}</h3><p data-cms-field="boosters_body">${formatInlineRichText(c.boosters_body)}</p><p style="margin-top:18px"><a class="btn secondary" href="${escapeAttr(c.boosters_href)}" data-cms-field="boosters_button">${formatInlineRichText(c.boosters_button)}</a></p></article>
    <article class="card" data-cms-block="home-launch"><span class="tag" data-cms-field="launch_tag">${formatInlineRichText(c.launch_tag)}</span><h3 data-cms-field="launch_heading">${formatInlineRichText(c.launch_heading)}</h3><p data-cms-field="launch_body">${formatInlineRichText(c.launch_body)}</p><p class="draft" data-cms-field="launch_footer">${formatInlineRichText(c.launch_footer)}</p></article>
  </div>
</section>`;
}

const HOME_FEATURE_CARDS_SECTION_RE = /<section(?:\s+data-cms-home-cards)?[^>]*>\s*<div class="wrap grid two">\s*<article[^>]*(?:accent-card|home-boosters)[^>]*>[\s\S]*?<\/article>\s*<article[^>]*(?:home-launch|class="card")[^>]*>[\s\S]*?<\/article>\s*<\/div>\s*<\/section>/i;

export function applyHomeFeatureCards(html = '', cards = {}) {
  const section = renderHomeFeatureCardsSection(cards);
  const source = String(html || '').trim();
  if (!source) return section;
  if (HOME_FEATURE_CARDS_SECTION_RE.test(source)) {
    return source.replace(HOME_FEATURE_CARDS_SECTION_RE, section);
  }
  if (/data-cms-block="home-boosters"/i.test(source) || /class="[^"]*\baccent-card\b/i.test(source)) {
    return source.replace(
      /<article[^>]*(?:accent-card|home-boosters)[^>]*>[\s\S]*?<\/article>\s*<article[^>]*>[\s\S]*?<\/article>/i,
      () => {
        const inner = section.match(/<div class="wrap grid two">([\s\S]*?)<\/div>/i);
        return inner ? inner[1].trim() : section;
      }
    );
  }
  return `${source}\n${section}`;
}

async function getSite(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM site_content').all();
  const payload = { ...DEFAULT_SITE };
  for (const row of rows.results || []) payload[row.key] = row.value;
  payload.maintenance_mode = isMaintenanceMode(payload) ? 1 : 0;
  payload.boosters_dues_enabled = isBoostersDuesEnabled(payload) ? 1 : 0;
  payload.sponsor_ad_seconds = normalizeSponsorAdSeconds(payload.sponsor_ad_seconds, 6);
  payload.utility_links = normalizeUtilityLinks(payload.utility_links);
  payload.social_links = normalizeSocialLinks(payload.social_links);
  return payload;
}

async function getSiteContentValue(env, key) {
  const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?').bind(key).first();
  return row?.value == null ? '' : String(row.value);
}

async function setSiteContentValue(env, key, value) {
  await env.DB.prepare(
    'INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).bind(key, String(value ?? '')).run();
}

export function parseZernioFacebookConnection(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || 'null') : value;
    if (!parsed || typeof parsed !== 'object') return null;
    const accountId = String(parsed.accountId || parsed._id || '').trim();
    if (!accountId) return null;
    return {
      accountId,
      profileId: String(parsed.profileId || '').trim(),
      platform: 'facebook',
      name: String(parsed.name || parsed.displayName || parsed.username || 'Facebook Page').trim(),
      username: String(parsed.username || '').trim(),
      connectedAt: String(parsed.connectedAt || '').trim(),
    };
  } catch {
    return null;
  }
}

export function parseZernioInstagramConnection(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || 'null') : value;
    if (!parsed || typeof parsed !== 'object') return null;
    const accountId = String(parsed.accountId || parsed._id || '').trim();
    if (!accountId) return null;
    return {
      accountId,
      profileId: String(parsed.profileId || '').trim(),
      platform: 'instagram',
      name: String(parsed.name || parsed.displayName || parsed.username || 'Instagram').trim(),
      username: String(parsed.username || '').trim(),
      connectedAt: String(parsed.connectedAt || '').trim(),
    };
  } catch {
    return null;
  }
}

export function isInstagramGalleryAutopostEnabled(raw) {
  const value = String(raw ?? '1').trim().toLowerCase();
  if (!value) return true;
  return !(value === '0' || value === 'false' || value === 'off' || value === 'no');
}

export function galleryInstagramCaption(photo = {}) {
  const caption = htmlToPlainText(photo.caption || '').trim();
  if (caption) return caption.slice(0, 2200);
  const alt = String(photo.alt_text || '').trim();
  if (alt) return alt.slice(0, 2200);
  return 'New photo from East Forsyth Band';
}

export function isInstagramPublishableImage(photo = {}) {
  const filename = String(photo.filename || photo.original_name || photo.url || '').toLowerCase();
  if (!filename) return false;
  if (filename.endsWith('.svg') || filename.includes('.svg?')) return false;
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(filename) || !/\.[a-z0-9]+(\?|$)/i.test(filename);
}

export const ZERNIO_API_KEY_CONTENT_KEY = 'zernio_api_key';

export async function resolveZernioApiKey(env) {
  const fromEnv = String(env?.ZERNIO_API_KEY || '').trim();
  if (fromEnv) return { key: fromEnv, source: 'env' };
  try {
    const fromDb = String(await getSiteContentValue(env, ZERNIO_API_KEY_CONTENT_KEY) || '').trim();
    if (fromDb) return { key: fromDb, source: 'database' };
  } catch {
    // Database may be unavailable during early boot; treat as unset.
  }
  return { key: '', source: 'none' };
}

async function zernioConfigured(env) {
  return Boolean((await resolveZernioApiKey(env)).key);
}

async function zernioApi(env, path, options = {}) {
  const resolved = await resolveZernioApiKey(env);
  const apiKey = resolved.key;
  if (!apiKey) {
    throw new Error('Zernio is not configured. The shared API key is missing from the database.');
  }
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
  const { timeoutMs: _ignoredTimeout, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${ZERNIO_API_BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...(fetchOptions.headers || {}),
      },
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Zernio request timed out. Try again in a moment.');
    }
    throw new Error(error?.message || 'Could not reach Zernio');
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const detail = data?.message || data?.error || data?.detail || data?.raw || `Zernio request failed (${response.status})`;
    throw new Error(String(detail));
  }
  return data;
}

export function parseZernioUserProfile(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    try {
      const parsed = JSON.parse(decodeURIComponent(text));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

function parseZernioFacebookPending(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '') : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    const profileId = String(parsed.profileId || '').trim();
    const tempToken = String(parsed.tempToken || '').trim();
    if (!profileId || !tempToken) return null;
    return {
      profileId,
      tempToken,
      connectToken: String(parsed.connectToken || parsed.connect_token || '').trim(),
      userProfile: parsed.userProfile && typeof parsed.userProfile === 'object' ? parsed.userProfile : null,
      createdAt: String(parsed.createdAt || '').trim(),
    };
  } catch {
    return null;
  }
}

async function getZernioFacebookPending(env) {
  return parseZernioFacebookPending(await getSiteContentValue(env, ZERNIO_FACEBOOK_PENDING_KEY));
}

async function setZernioFacebookPending(env, pending) {
  if (!pending) {
    await setSiteContentValue(env, ZERNIO_FACEBOOK_PENDING_KEY, '');
    return null;
  }
  const value = {
    profileId: String(pending.profileId || '').trim(),
    tempToken: String(pending.tempToken || '').trim(),
    connectToken: String(pending.connectToken || '').trim(),
    userProfile: pending.userProfile && typeof pending.userProfile === 'object' ? pending.userProfile : null,
    createdAt: String(pending.createdAt || new Date().toISOString()).trim(),
  };
  await setSiteContentValue(env, ZERNIO_FACEBOOK_PENDING_KEY, JSON.stringify(value));
  return value;
}

function zernioConnectHeaders(pending = null) {
  const token = String(pending?.connectToken || '').trim();
  return token ? { 'X-Connect-Token': token } : {};
}

async function listZernioFacebookPages(env, pending) {
  if (!pending?.profileId || !pending?.tempToken) throw new Error('Facebook page selection is not ready. Connect Facebook again.');
  const query = new URLSearchParams({
    profileId: pending.profileId,
    tempToken: pending.tempToken,
  });
  const data = await zernioApi(env, `/connect/facebook/select-page?${query.toString()}`, {
    headers: zernioConnectHeaders(pending),
  });
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  return pages.map((page) => ({
    id: String(page?.id || page?.pageId || '').trim(),
    name: String(page?.name || page?.displayName || page?.username || 'Facebook Page').trim(),
    username: String(page?.username || '').trim(),
    category: String(page?.category || '').trim(),
  })).filter((page) => page.id);
}

async function selectZernioFacebookPage(env, pending, pageId, requestUrl = '') {
  const selectedPageId = String(pageId || '').trim();
  if (!selectedPageId) throw new Error('Choose a Facebook Page to finish connecting.');
  if (!pending?.profileId || !pending?.tempToken) throw new Error('Facebook page selection expired. Connect Facebook again.');
  if (!pending.userProfile) throw new Error('Facebook user profile missing from OAuth. Connect Facebook again.');
  const redirectUrl = requestUrl
    ? new URL('/admin?tab=social&zernio=facebook_connected', requestUrl).toString()
    : undefined;
  const data = await zernioApi(env, '/connect/facebook/select-page', {
    method: 'POST',
    headers: zernioConnectHeaders(pending),
    body: JSON.stringify({
      profileId: pending.profileId,
      pageId: selectedPageId,
      tempToken: pending.tempToken,
      userProfile: pending.userProfile,
      ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
    }),
  });
  await setZernioFacebookPending(env, null);
  const account = data?.account || {};
  const connection = {
    accountId: String(account.accountId || account._id || account.id || '').trim(),
    profileId: pending.profileId,
    platform: 'facebook',
    name: String(account.selectedPageName || account.displayName || account.username || 'Facebook Page').trim(),
    username: String(account.username || '').trim(),
    connectedAt: new Date().toISOString(),
  };
  if (!connection.accountId) {
    const synced = await syncZernioFacebookConnection(env, pending.profileId);
    if (synced) return synced;
    throw new Error('Facebook Page was selected but no account id was returned.');
  }
  await setSiteContentValue(env, ZERNIO_FACEBOOK_KEY, JSON.stringify(connection));
  await setSiteContentValue(env, ZERNIO_PROFILE_KEY, pending.profileId);
  return connection;
}

async function ensureZernioProfileId(env) {
  const existing = String(await getSiteContentValue(env, ZERNIO_PROFILE_KEY) || '').trim();
  if (existing) return existing;
  const listed = await zernioApi(env, '/profiles');
  const profiles = Array.isArray(listed?.profiles) ? listed.profiles : [];
  const named = profiles.find((profile) => String(profile?.name || '').trim().toLowerCase() === 'east forsyth band');
  const fallback = named || profiles.find((profile) => profile?.isDefault) || profiles[0];
  const foundId = String(fallback?._id || fallback?.id || '').trim();
  if (foundId) {
    await setSiteContentValue(env, ZERNIO_PROFILE_KEY, foundId);
    return foundId;
  }
  const created = await zernioApi(env, '/profiles', {
    method: 'POST',
    body: JSON.stringify({
      name: 'East Forsyth Band',
      description: 'EFHS Band CMS social publishing profile',
    }),
  });
  const profileId = String(created?.profile?._id || created?._id || created?.id || '').trim();
  if (!profileId) throw new Error('Zernio profile was created but no profile id was returned.');
  await setSiteContentValue(env, ZERNIO_PROFILE_KEY, profileId);
  return profileId;
}

async function getZernioFacebookStatus(env, { sync = false } = {}) {
  const resolvedKey = await resolveZernioApiKey(env);
  let stored = parseZernioFacebookConnection(await getSiteContentValue(env, ZERNIO_FACEBOOK_KEY));
  let pending = await getZernioFacebookPending(env);
  const configured = Boolean(resolvedKey.key) || Boolean(stored?.accountId) || Boolean(pending);
  let profileId = String(await getSiteContentValue(env, ZERNIO_PROFILE_KEY) || stored?.profileId || pending?.profileId || '').trim();
  const canCallZernio = Boolean(resolvedKey.key);
  if (canCallZernio && sync) {
    try {
      profileId = await ensureZernioProfileId(env);
      const live = await syncZernioFacebookConnection(env, profileId);
      if (live) {
        stored = live;
        if (pending) {
          await setZernioFacebookPending(env, null);
          pending = null;
        }
      } else if (stored?.accountId) {
        // Stored account no longer present remotely.
        const data = await zernioApi(env, '/accounts');
        const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
        const stillThere = accounts.some((account) => String(account?._id || account?.accountId || '') === stored.accountId);
        if (!stillThere) {
          await setSiteContentValue(env, ZERNIO_FACEBOOK_KEY, '');
          stored = null;
        }
      }
    } catch (error) {
      return {
        configured: true,
        configured_source: resolvedKey.source === 'none' ? 'shared' : resolvedKey.source,
        connected: Boolean(stored?.accountId),
        needsPageSelection: Boolean(pending && !stored?.accountId),
        profileId,
        account: stored,
        detail: stored?.accountId
          ? `Connected: ${stored.name || stored.accountId}`
          : (pending
            ? 'Facebook login finished. Choose which Page to connect below.'
            : `Could not refresh Zernio status: ${error.message}`),
        error: error.message,
      };
    }
  }
  const needsPageSelection = Boolean(pending && !stored?.accountId);
  let debug = null;
  try {
    debug = JSON.parse(String(await getSiteContentValue(env, ZERNIO_FACEBOOK_DEBUG_KEY) || '') || 'null');
  } catch {
    debug = null;
  }
  const connected = Boolean(stored?.accountId);
  let detail;
  if (connected) {
    detail = `Connected: ${stored.name || stored.accountId}`;
  } else if (needsPageSelection) {
    detail = 'Facebook login finished. Choose which Page to connect below.';
  } else if (canCallZernio) {
    detail = 'Ready to connect a Facebook Page. Use Connect Facebook.';
  } else {
    detail = 'Zernio key not found yet. Facebook/Instagram use the shared key already stored for this site — click Refresh status.';
  }
  return {
    configured,
    configured_source: resolvedKey.source === 'none' && configured ? 'shared' : resolvedKey.source,
    connected,
    needsPageSelection,
    profileId,
    account: stored,
    connectPath: '/admin/zernio/facebook/connect',
    debug,
    detail,
  };
}

export function normalizeZernioPostPayload(payload = {}, account = null, platform = 'facebook') {
  const content = String(payload.content || '').trim();
  const mediaUrl = String(payload.media_url || payload.image_url || '').trim();
  const publishNow = payload.publish_now !== false && !payload.scheduled_for;
  const scheduledFor = String(payload.scheduled_for || '').trim();
  const timezone = String(payload.timezone || 'America/New_York').trim() || 'America/New_York';
  const targetPlatform = String(platform || account?.platform || 'facebook').trim().toLowerCase() || 'facebook';
  if (!content) throw new Error('Post content is required.');
  if (content.length > 5000) throw new Error('Post content is too long.');
  if (!account?.accountId) {
    throw new Error(targetPlatform === 'instagram'
      ? 'Connect Instagram before posting.'
      : 'Connect a Facebook Page before posting.');
  }
  if (targetPlatform === 'instagram' && !mediaUrl) {
    throw new Error('Instagram posts require an image URL.');
  }
  if (mediaUrl && !/^https?:\/\//i.test(mediaUrl)) throw new Error('Media URL must start with http:// or https://');
  const body = {
    content,
    platforms: [{ platform: targetPlatform, accountId: account.accountId }],
  };
  if (mediaUrl) body.mediaItems = [{ type: 'image', url: mediaUrl }];
  if (publishNow) body.publishNow = true;
  else {
    if (!scheduledFor) throw new Error('Choose Publish now or provide a schedule time.');
    body.scheduledFor = scheduledFor.includes('T') ? scheduledFor : `${scheduledFor}T12:00:00`;
    body.timezone = timezone;
  }
  return body;
}

function zernioAccountProfileId(account = null) {
  const profile = account?.profileId;
  if (profile && typeof profile === 'object') return String(profile._id || profile.id || '').trim();
  return String(profile || '').trim();
}

async function syncZernioFacebookConnection(env, profileId = '') {
  const preferredProfileId = String(profileId || await getSiteContentValue(env, ZERNIO_PROFILE_KEY) || '').trim();
  const data = await zernioApi(env, '/accounts');
  const accounts = Array.isArray(data?.accounts) ? data.accounts : (Array.isArray(data) ? data : []);
  const facebookAccounts = accounts.filter((account) => String(account?.platform || '').toLowerCase() === 'facebook');
  const facebook = facebookAccounts.find((account) => zernioAccountProfileId(account) === preferredProfileId)
    || facebookAccounts.find((account) => String(account?.profileId?.name || '').trim().toLowerCase() === 'east forsyth band')
    || facebookAccounts[facebookAccounts.length - 1]
    || null;
  if (!facebook) return null;
  const connection = {
    accountId: String(facebook._id || facebook.accountId || facebook.id || '').trim(),
    profileId: preferredProfileId || zernioAccountProfileId(facebook),
    platform: 'facebook',
    name: String(facebook.selectedPageName || facebook.displayName || facebook.name || facebook.username || 'Facebook Page').trim(),
    username: String(facebook.username || '').trim(),
    connectedAt: new Date().toISOString(),
  };
  if (!connection.accountId) return null;
  await setSiteContentValue(env, ZERNIO_FACEBOOK_KEY, JSON.stringify(connection));
  if (connection.profileId) await setSiteContentValue(env, ZERNIO_PROFILE_KEY, connection.profileId);
  return connection;
}

async function syncZernioInstagramConnection(env, profileId = '') {
  const preferredProfileId = String(profileId || await getSiteContentValue(env, ZERNIO_PROFILE_KEY) || '').trim();
  const data = await zernioApi(env, '/accounts');
  const accounts = Array.isArray(data?.accounts) ? data.accounts : (Array.isArray(data) ? data : []);
  const instagramAccounts = accounts.filter((account) => String(account?.platform || '').toLowerCase() === 'instagram');
  const instagram = instagramAccounts.find((account) => zernioAccountProfileId(account) === preferredProfileId)
    || instagramAccounts.find((account) => String(account?.profileId?.name || '').trim().toLowerCase() === 'east forsyth band')
    || instagramAccounts[instagramAccounts.length - 1]
    || null;
  if (!instagram) return null;
  const connection = {
    accountId: String(instagram._id || instagram.accountId || instagram.id || '').trim(),
    profileId: preferredProfileId || zernioAccountProfileId(instagram),
    platform: 'instagram',
    name: String(instagram.displayName || instagram.name || instagram.username || 'Instagram').trim(),
    username: String(instagram.username || '').trim(),
    connectedAt: new Date().toISOString(),
  };
  if (!connection.accountId) return null;
  await setSiteContentValue(env, ZERNIO_INSTAGRAM_KEY, JSON.stringify(connection));
  if (connection.profileId) await setSiteContentValue(env, ZERNIO_PROFILE_KEY, connection.profileId);
  return connection;
}

async function getInstagramGalleryAutopostEnabled(env) {
  return isInstagramGalleryAutopostEnabled(await getSiteContentValue(env, ZERNIO_INSTAGRAM_AUTOPOST_KEY));
}

async function setInstagramGalleryAutopostEnabled(env, enabled) {
  await setSiteContentValue(env, ZERNIO_INSTAGRAM_AUTOPOST_KEY, enabled ? '1' : '0');
  return enabled;
}

async function getZernioInstagramStatus(env, { sync = false } = {}) {
  const resolvedKey = await resolveZernioApiKey(env);
  let stored = parseZernioInstagramConnection(await getSiteContentValue(env, ZERNIO_INSTAGRAM_KEY));
  const facebookStored = parseZernioFacebookConnection(await getSiteContentValue(env, ZERNIO_FACEBOOK_KEY));
  // Instagram shares Facebook's Zernio key — never require a separate key.
  const configured = Boolean(resolvedKey.key) || Boolean(stored?.accountId) || Boolean(facebookStored?.accountId);
  let profileId = String(await getSiteContentValue(env, ZERNIO_PROFILE_KEY) || stored?.profileId || facebookStored?.profileId || '').trim();
  let galleryAutopost = await getInstagramGalleryAutopostEnabled(env);
  const canCallZernio = Boolean(resolvedKey.key);
  if (canCallZernio && sync) {
    try {
      profileId = await ensureZernioProfileId(env);
      const live = await syncZernioInstagramConnection(env, profileId);
      if (live) {
        stored = live;
      } else if (stored?.accountId) {
        const data = await zernioApi(env, '/accounts');
        const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
        const stillThere = accounts.some((account) => (
          String(account?.platform || '').toLowerCase() === 'instagram'
          && String(account?._id || account?.accountId || '') === stored.accountId
        ));
        if (!stillThere) {
          await setSiteContentValue(env, ZERNIO_INSTAGRAM_KEY, '');
          stored = null;
        }
      }
      galleryAutopost = await getInstagramGalleryAutopostEnabled(env);
    } catch (error) {
      return {
        configured: true,
        configured_source: resolvedKey.source === 'none' ? 'shared' : resolvedKey.source,
        connected: Boolean(stored?.accountId),
        profileId,
        account: stored,
        gallery_autopost: galleryAutopost,
        connectPath: '/admin/zernio/instagram/connect',
        detail: stored?.accountId
          ? `Connected: ${stored.name || stored.username || stored.accountId}${galleryAutopost ? ' · gallery auto-post on' : ' · gallery auto-post off'}`
          : `Could not refresh Instagram from Zernio: ${error.message}`,
        error: error.message,
      };
    }
  }
  const connected = Boolean(stored?.accountId);
  let detail;
  if (connected) {
    detail = `Connected: ${stored.name || stored.username || stored.accountId}${galleryAutopost ? ' · gallery auto-post on' : ' · gallery auto-post off'}`;
  } else if (canCallZernio) {
    detail = 'Instagram is not linked yet. Click Refresh status to pull the account already connected in Zernio (same key as Facebook).';
  } else if (facebookStored?.accountId) {
    detail = 'Facebook is connected. Click Refresh status to link Instagram with the same Zernio setup.';
  } else {
    detail = 'Connect Facebook first (or Refresh after linking Instagram in Zernio). Instagram uses the same Zernio key — no separate key to enter.';
  }
  return {
    configured,
    configured_source: resolvedKey.source === 'none' && configured ? 'shared' : resolvedKey.source,
    connected,
    profileId,
    account: stored,
    gallery_autopost: galleryAutopost,
    connectPath: '/admin/zernio/instagram/connect',
    detail,
  };
}

export async function maybePublishGalleryPhotoToInstagram(env, request, photo = {}) {
  if (!(await zernioConfigured(env))) {
    return { attempted: false, ok: false, reason: 'not_configured' };
  }
  if (Number(photo.sort_order) < 0) {
    return { attempted: false, ok: false, reason: 'utility_upload' };
  }
  if (!isInstagramPublishableImage(photo)) {
    return { attempted: false, ok: false, reason: 'unsupported_format' };
  }
  const status = await getZernioInstagramStatus(env, { sync: true });
  if (!status.connected || !status.account?.accountId) {
    return { attempted: false, ok: false, reason: 'not_connected' };
  }
  if (!status.gallery_autopost) {
    return { attempted: false, ok: false, reason: 'autopost_disabled' };
  }
  const mediaUrl = absolutePublicAssetUrl(request, env, photo.url);
  if (!mediaUrl) {
    return { attempted: false, ok: false, reason: 'missing_media_url' };
  }
  try {
    const body = normalizeZernioPostPayload({
      content: galleryInstagramCaption(photo),
      media_url: mediaUrl,
      publish_now: true,
    }, status.account, 'instagram');
    const created = await zernioApi(env, '/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const postId = String(created?.post?._id || created?.post?.id || created?._id || created?.id || '').trim();
    return {
      attempted: true,
      ok: true,
      reason: 'published',
      post_id: postId,
      media_url: mediaUrl,
      account: status.account?.username || status.account?.name || '',
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      reason: 'publish_failed',
      error: String(error?.message || error || 'Instagram publish failed'),
      media_url: mediaUrl,
    };
  }
}

async function handleZernioInstagramConnect(request, env) {
  await initDb(env);
  const user = await currentUser(request, env);
  if (!user) return redirect('/admin/login');
  if (!hasPermission(user, 'site')) {
    return htmlResponse('<!doctype html><title>Forbidden</title><p>Site settings permission is required to connect Instagram.</p><p><a href="/admin">Back to CMS</a></p>', 403);
  }
  if (!(await zernioConfigured(env))) {
    return htmlResponse('<!doctype html><title>Zernio not configured</title><p>Zernio is not configured for this site yet.</p><p><a href="/admin?tab=social">Back to Social Media</a></p>', 503);
  }
  try {
    const profileId = await ensureZernioProfileId(env);
    const redirectUrl = zernioInstagramCallbackUrl(request, env);
    const query = new URLSearchParams({
      profileId,
      redirect_url: redirectUrl,
    });
    const data = await zernioApi(env, `/connect/instagram?${query.toString()}`);
    const authUrl = String(data?.authUrl || data?.url || '').trim();
    if (!authUrl) throw new Error('Zernio did not return an Instagram OAuth URL.');
    return redirect(authUrl);
  } catch (error) {
    const message = escapeHtml(error?.message || 'Could not start Instagram OAuth');
    return htmlResponse(`<!doctype html><title>Instagram connect failed</title><p>${message}</p><p><a href="/admin">Back to CMS</a></p>`, 502);
  }
}

async function handleZernioInstagramCallback(request, env) {
  await initDb(env);
  const url = new URL(request.url);
  const error = String(url.searchParams.get('error') || url.searchParams.get('error_description') || '').trim();
  if (error) {
    return redirect(`/admin?tab=social&zernio=instagram_error&detail=${encodeURIComponent(error)}`);
  }
  let nextPath = '/admin?tab=social&zernio=instagram_connected';
  try {
    const profileId = String(url.searchParams.get('profileId') || await getSiteContentValue(env, ZERNIO_PROFILE_KEY) || '').trim();
    if (profileId) await setSiteContentValue(env, ZERNIO_PROFILE_KEY, profileId);
    const connection = await syncZernioInstagramConnection(env, profileId);
    if (!connection) {
      nextPath = `/admin?tab=social&zernio=instagram_error&detail=${encodeURIComponent('Instagram OAuth finished, but no Instagram account was found on the Zernio profile. Connect Instagram in Zernio, then click Refresh status.')}`;
    }
  } catch (callbackError) {
    nextPath = `/admin?tab=social&zernio=instagram_error&detail=${encodeURIComponent(callbackError?.message || 'Instagram connect failed')}`;
  }
  const user = await currentUser(request, env);
  if (!user) {
    return redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (!hasPermission(user, 'site')) {
    return htmlResponse('<!doctype html><title>Forbidden</title><p>Site settings permission is required.</p><p><a href="/admin">Back to CMS</a></p>', 403);
  }
  return redirect(nextPath);
}

function emptyFacebookEventSyncState() {
  return {
    posted: {},
    pending: {},
    ignored: {},
    lastPublishedAt: '',
    lastPostId: '',
    seeded: false,
    publishDisabledCleared: false,
  };
}

export function parseFacebookEventSyncState(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '') : raw;
    if (!parsed || typeof parsed !== 'object') return emptyFacebookEventSyncState();
    return {
      posted: parsed.posted && typeof parsed.posted === 'object' ? parsed.posted : {},
      pending: parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : {},
      ignored: parsed.ignored && typeof parsed.ignored === 'object' ? parsed.ignored : {},
      lastPublishedAt: String(parsed.lastPublishedAt || '').trim(),
      lastPostId: String(parsed.lastPostId || '').trim(),
      seeded: Boolean(parsed.seeded),
      publishDisabledCleared: Boolean(parsed.publishDisabledCleared),
    };
  } catch {
    return emptyFacebookEventSyncState();
  }
}

export function eventFacebookFingerprint(event = {}) {
  const title = htmlToPlainText(event.title || '').trim();
  const description = htmlToPlainText(event.description || '').trim();
  const date = Number(event.repeat_enabled)
    ? `repeat:${formatRepeatSummary(event)}`
    : `${eventYearValue(event)}|${String(event.date_label || '').trim()}|${String(event.date_detail || '').trim()}`;
  return `${date}||${title}||${description}`;
}

async function getFacebookEventSyncState(env) {
  return parseFacebookEventSyncState(await getSiteContentValue(env, ZERNIO_FACEBOOK_EVENTS_KEY));
}

async function saveFacebookEventSyncState(env, state) {
  const next = parseFacebookEventSyncState(state);
  await setSiteContentValue(env, ZERNIO_FACEBOOK_EVENTS_KEY, JSON.stringify(next));
  return next;
}

function formatEventDateForFacebook(event = {}) {
  if (Number(event.repeat_enabled)) {
    return formatRepeatSummary(event) || 'Repeating event';
  }
  const label = String(event.date_label || '').trim();
  const detail = String(event.date_detail || '').trim();
  const year = eventYearValue(event);
  const datePart = [label, detail].filter(Boolean).join(' ');
  return datePart ? `${datePart}, ${year}` : String(year);
}

export function formatFacebookCalendarDigest(events = [], { calendarUrl = '' } = {}) {
  const lines = ['East Forsyth Band — calendar updates', ''];
  for (const event of events) {
    const title = htmlToPlainText(event.title || '').trim() || 'Untitled event';
    const when = formatEventDateForFacebook(event);
    const description = htmlToPlainText(event.description || '').trim();
    lines.push(`• ${when} — ${title}`);
    if (description) {
      const short = description.length > 220 ? `${description.slice(0, 217).trim()}…` : description;
      lines.push(`  ${short}`);
    }
    lines.push('');
  }
  if (calendarUrl) {
    lines.push(`Full calendar: ${calendarUrl}`);
  }
  return lines.join('\n').trim();
}

async function getCalendarPublicUrl(env) {
  try {
    const row = await env.DB.prepare('SELECT path, slug FROM pages WHERE slug = ? LIMIT 1').bind('calendar').first();
    const path = String(row?.path || '/calendar.html').trim() || '/calendar.html';
    return `${PUBLIC_SITE_ORIGIN_DEFAULT}${path.startsWith('/') ? path : `/${path}`}`;
  } catch {
    return `${PUBLIC_SITE_ORIGIN_DEFAULT}/calendar.html`;
  }
}

async function pruneFacebookEventSyncState(env, state) {
  const next = parseFacebookEventSyncState(state);
  const rows = await env.DB.prepare('SELECT id FROM events').all();
  const liveIds = new Set((rows.results || []).map((row) => String(row.id)));
  for (const key of Object.keys(next.pending)) {
    if (!liveIds.has(String(key))) delete next.pending[key];
  }
  for (const key of Object.keys(next.posted)) {
    if (!liveIds.has(String(key))) delete next.posted[key];
  }
  for (const key of Object.keys(next.ignored)) {
    if (!liveIds.has(String(key))) delete next.ignored[key];
  }
  return next;
}

/** Stop auto-seeding every upcoming event into the Facebook suggestions queue. */
async function seedFacebookEventPendingIfNeeded(env, state) {
  const next = parseFacebookEventSyncState(state);
  if (!next.seeded) next.seeded = true;
  return next;
}

/** One-time clear of legacy publish-queue suggestions (staff will not post these). */
export async function clearLegacyFacebookPublishQueueIfNeeded(env, state) {
  const next = parseFacebookEventSyncState(state);
  if (next.publishDisabledCleared) return next;
  const now = new Date().toISOString();
  for (const [id, entry] of Object.entries(next.pending)) {
    next.ignored[id] = {
      fingerprint: String(entry?.fingerprint || '').trim(),
      ignoredAt: now,
      reason: 'cleared',
    };
  }
  next.pending = {};
  next.seeded = true;
  next.publishDisabledCleared = true;
  return next;
}

async function queueEventForFacebook(env, event, reason = 'updated') {
  if (!event?.id) return null;
  const state = await pruneFacebookEventSyncState(env, await getFacebookEventSyncState(env));
  const id = String(event.id);
  const fingerprint = eventFacebookFingerprint(event);
  const posted = state.posted[id];
  const ignored = state.ignored[id];
  if (posted && posted.fingerprint === fingerprint) {
    delete state.pending[id];
    return saveFacebookEventSyncState(env, state);
  }
  if (ignored && ignored.fingerprint === fingerprint) {
    delete state.pending[id];
    return saveFacebookEventSyncState(env, state);
  }
  if (state.pending[id]?.fingerprint === fingerprint) return state;
  state.pending[id] = {
    fingerprint,
    queuedAt: new Date().toISOString(),
    reason: posted || ignored ? 'updated' : (reason === 'seed' ? 'seed' : 'new'),
  };
  return saveFacebookEventSyncState(env, state);
}

async function unqueueEventForFacebook(env, eventId) {
  const state = await getFacebookEventSyncState(env);
  const id = String(eventId || '');
  if (!id) return state;
  delete state.pending[id];
  delete state.posted[id];
  delete state.ignored[id];
  return saveFacebookEventSyncState(env, state);
}

export async function ignoreFacebookEventSuggestion(env, eventId) {
  const id = String(eventId || '').trim();
  if (!id) throw new Error('Event id is required');
  let state = await pruneFacebookEventSyncState(env, await getFacebookEventSyncState(env));
  state = await clearLegacyFacebookPublishQueueIfNeeded(env, state);
  const pending = state.pending[id];
  const event = await getEventById(env, Number(id));
  const fingerprint = pending?.fingerprint
    || (event ? eventFacebookFingerprint(event) : '');
  state.ignored[id] = {
    fingerprint,
    ignoredAt: new Date().toISOString(),
    reason: 'ignored',
  };
  delete state.pending[id];
  await saveFacebookEventSyncState(env, state);
  return getFacebookEventQueueStatus(env);
}

export async function ignoreAllFacebookEventSuggestions(env) {
  let state = await pruneFacebookEventSyncState(env, await getFacebookEventSyncState(env));
  state = await clearLegacyFacebookPublishQueueIfNeeded(env, state);
  const now = new Date().toISOString();
  for (const [id, entry] of Object.entries(state.pending)) {
    state.ignored[id] = {
      fingerprint: String(entry?.fingerprint || '').trim(),
      ignoredAt: now,
      reason: 'ignored',
    };
  }
  state.pending = {};
  state.publishDisabledCleared = true;
  state.seeded = true;
  await saveFacebookEventSyncState(env, state);
  return getFacebookEventQueueStatus(env);
}

async function getFacebookEventQueueStatus(env) {
  let state = await pruneFacebookEventSyncState(env, await getFacebookEventSyncState(env));
  state = await clearLegacyFacebookPublishQueueIfNeeded(env, state);
  state = await seedFacebookEventPendingIfNeeded(env, state);
  state = await saveFacebookEventSyncState(env, state);
  const pendingIds = Object.keys(state.pending);
  const events = [];
  for (const id of pendingIds) {
    const event = await getEventById(env, Number(id));
    if (!event) continue;
    events.push({
      ...event,
      queue_reason: state.pending[id]?.reason || 'new',
      queued_at: state.pending[id]?.queuedAt || '',
    });
  }
  events.sort(compareEventsByDate);
  return {
    pending_count: events.length,
    pending_events: events,
    last_published_at: state.lastPublishedAt || '',
    last_post_id: state.lastPostId || '',
    seeded: Boolean(state.seeded),
    posted_count: Object.keys(state.posted).length,
    ignored_count: Object.keys(state.ignored).length,
  };
}

async function publishFacebookEventQueue(env) {
  const status = await getZernioFacebookStatus(env, { sync: true });
  if (!status.connected || !status.account?.accountId) {
    throw new Error('Connect a Facebook Page before posting calendar updates.');
  }
  const queue = await getFacebookEventQueueStatus(env);
  if (!queue.pending_events.length) {
    throw new Error('No new or updated calendar events are waiting to post.');
  }
  const calendarUrl = await getCalendarPublicUrl(env);
  const content = formatFacebookCalendarDigest(queue.pending_events, { calendarUrl });
  if (content.length > 60000) throw new Error('Calendar update post is too long. Post fewer events at once.');
  const created = await zernioApi(env, '/posts', {
    method: 'POST',
    body: JSON.stringify({
      content,
      platforms: [{ platform: 'facebook', accountId: status.account.accountId }],
      publishNow: true,
    }),
  });
  const state = await getFacebookEventSyncState(env);
  const postedAt = new Date().toISOString();
  for (const event of queue.pending_events) {
    const id = String(event.id);
    state.posted[id] = {
      fingerprint: state.pending[id]?.fingerprint || eventFacebookFingerprint(event),
      postedAt,
    };
    delete state.pending[id];
  }
  state.lastPublishedAt = postedAt;
  state.lastPostId = String(created?.post?._id || created?._id || created?.id || '').trim();
  state.seeded = true;
  await saveFacebookEventSyncState(env, state);
  return {
    ok: true,
    post: created?.post || created,
    published_count: queue.pending_events.length,
    content,
    ...(await getFacebookEventQueueStatus(env)),
  };
}

async function rememberZernioFacebookDebug(env, info = {}) {
  const payload = {
    at: new Date().toISOString(),
    keys: Array.isArray(info.keys) ? info.keys.slice(0, 40) : [],
    note: String(info.note || '').trim().slice(0, 300),
  };
  await setSiteContentValue(env, ZERNIO_FACEBOOK_DEBUG_KEY, JSON.stringify(payload));
}

async function finalizeZernioFacebookCallback(env, request, url) {
  const profileId = String(url.searchParams.get('profileId') || await getSiteContentValue(env, ZERNIO_PROFILE_KEY) || '').trim();
  if (profileId) await setSiteContentValue(env, ZERNIO_PROFILE_KEY, profileId);

  const tempToken = String(url.searchParams.get('tempToken') || url.searchParams.get('temp_token') || '').trim();
  const step = String(url.searchParams.get('step') || '').trim().toLowerCase();
  const userProfile = parseZernioUserProfile(url.searchParams.get('userProfile') || url.searchParams.get('user_profile') || '');
  const connectToken = String(url.searchParams.get('connect_token') || url.searchParams.get('connectToken') || '').trim();
  const hintedId = String(url.searchParams.get('accountId') || url.searchParams.get('account_id') || '').trim();
  const hintedName = String(url.searchParams.get('username') || url.searchParams.get('name') || url.searchParams.get('selectedPageName') || 'Facebook Page').trim();
  const callbackKeys = [...url.searchParams.keys()];

  await rememberZernioFacebookDebug(env, {
    keys: callbackKeys,
    note: tempToken ? 'callback_has_temp_token' : (hintedId ? 'callback_has_account_id' : 'callback_no_account_payload'),
  });

  // Persist headless selection state even before auth checks so a session gap cannot drop OAuth.
  if (tempToken) {
    const pending = await setZernioFacebookPending(env, {
      profileId,
      tempToken,
      connectToken,
      userProfile,
      createdAt: new Date().toISOString(),
    });
    try {
      const pages = await listZernioFacebookPages(env, pending);
      if (pages.length === 1) {
        await selectZernioFacebookPage(env, pending, pages[0].id, `${publicSiteOrigin(request, env)}/`);
        return '/admin?tab=social&zernio=facebook_connected';
      }
      if (!pages.length) {
        return `/admin?tab=social&zernio=facebook_error&detail=${encodeURIComponent('No Facebook Pages were returned. In the Meta dialog, select your business and the East Forsyth Band Page, then connect again.')}`;
      }
    } catch (listError) {
      return `/admin?tab=social&zernio=facebook_error&detail=${encodeURIComponent(listError?.message || 'Could not list Facebook Pages')}`;
    }
    return '/admin?tab=social&zernio=facebook_select';
  }

  if (hintedId) {
    await setSiteContentValue(env, ZERNIO_FACEBOOK_KEY, JSON.stringify({
      accountId: hintedId,
      profileId,
      platform: 'facebook',
      name: hintedName,
      username: hintedName,
      connectedAt: new Date().toISOString(),
    }));
    await setZernioFacebookPending(env, null);
    return '/admin?tab=social&zernio=facebook_connected';
  }

  const connection = await syncZernioFacebookConnection(env, profileId);
  if (connection) {
    await setZernioFacebookPending(env, null);
    return '/admin?tab=social&zernio=facebook_connected';
  }

  // Standard Zernio hosted picker may still be in progress, or callback lacked account fields.
  return `/admin?tab=social&zernio=facebook_pending&detail=${encodeURIComponent(`OAuth returned without a Page yet (${callbackKeys.join(', ') || 'no params'}). If Zernio showed a Page picker, finish it; otherwise connect again and choose the Page.`)}`;
}

async function handleZernioFacebookConnect(request, env) {
  await initDb(env);
  const user = await currentUser(request, env);
  if (!user) return redirect('/admin/login');
  if (!hasPermission(user, 'site')) {
    return htmlResponse('<!doctype html><title>Forbidden</title><p>Site settings permission is required to connect Facebook.</p><p><a href="/admin">Back to CMS</a></p>', 403);
  }
  if (!(await zernioConfigured(env))) {
    return htmlResponse('<!doctype html><title>Zernio not configured</title><p>Zernio is not configured for this site yet.</p><p><a href="/admin?tab=social">Back to Social Media</a></p>', 503);
  }
  try {
    const profileId = await ensureZernioProfileId(env);
    // Always return to the public custom domain so session cookies match the CMS the admin uses.
    const redirectUrl = zernioFacebookCallbackUrl(request, env);
    // Standard mode: Zernio hosts the Page picker after Meta OAuth (clearer when Pages must be chosen).
    const query = new URLSearchParams({
      profileId,
      redirect_url: redirectUrl,
    });
    const data = await zernioApi(env, `/connect/facebook?${query.toString()}`);
    const authUrl = String(data?.authUrl || data?.url || '').trim();
    if (!authUrl) throw new Error('Zernio did not return an OAuth URL.');
    await rememberZernioFacebookDebug(env, { keys: ['connect_started'], note: `redirect=${redirectUrl}` });
    return redirect(authUrl);
  } catch (error) {
    const message = escapeHtml(error?.message || 'Could not start Facebook OAuth');
    return htmlResponse(`<!doctype html><title>Facebook connect failed</title><p>${message}</p><p><a href="/admin">Back to CMS</a></p>`, 502);
  }
}

function describeZernioFacebookOAuthError(error = '') {
  const code = String(error || '').trim();
  const lower = code.toLowerCase();
  if (!code) return 'Facebook connect failed.';
  if (lower.includes('no_facebook_pages') || lower.includes('no pages')) {
    return 'Facebook logged in, but Meta did not share any Pages. On the Meta permission screens: (1) select your Business if asked, (2) turn ON / check the East Forsyth Band Page, (3) allow Pages access. You must be a Page Admin or Editor. Then click Connect Facebook again.';
  }
  if (lower.includes('access_denied') || lower.includes('user_denied')) {
    return 'Facebook permission was declined. Click Connect Facebook again and allow Page access.';
  }
  return code;
}

async function handleZernioFacebookCallback(request, env) {
  await initDb(env);
  const url = new URL(request.url);
  const error = String(url.searchParams.get('error') || url.searchParams.get('error_description') || '').trim();
  if (error) {
    await rememberZernioFacebookDebug(env, { keys: [...url.searchParams.keys()], note: `oauth_error:${error}` });
    return redirect(`/admin?tab=social&zernio=facebook_error&detail=${encodeURIComponent(describeZernioFacebookOAuthError(error))}`);
  }

  let nextPath = '/admin?tab=social&zernio=facebook_pending';
  try {
    nextPath = await finalizeZernioFacebookCallback(env, request, url);
  } catch (callbackError) {
    nextPath = `/admin?tab=social&zernio=facebook_error&detail=${encodeURIComponent(callbackError?.message || 'Facebook connect failed')}`;
  }

  const user = await currentUser(request, env);
  if (!user) {
    return redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (!hasPermission(user, 'site')) {
    return htmlResponse('<!doctype html><title>Forbidden</title><p>Site settings permission is required.</p><p><a href="/admin">Back to CMS</a></p>', 403);
  }
  return redirect(nextPath);
}


const MONTH_RANK = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
  spring: 3,
  summer: 6,
  fall: 9, autumn: 9,
  winter: 12,
  tbd: 99,
};

export function monthRank(label) {
  const key = String(label || '').trim().toLowerCase();
  if (!key) return 99;
  if (MONTH_RANK[key] != null) return MONTH_RANK[key];
  const prefix = key.slice(0, 3);
  if (MONTH_RANK[prefix] != null) return MONTH_RANK[prefix];
  return 99;
}

export function dayRank(detail) {
  const raw = String(detail || '').trim();
  if (!raw || /^tbd$/i.test(raw)) return 99;
  if (/^\d{1,2}$/.test(raw)) return Number(raw);
  // Weekday-only labels sort after numbered days in the same month.
  return 50;
}

export function eventYearValue(event) {
  const year = Number(event?.event_year);
  if (Number.isFinite(year) && year >= 2000 && year <= 2100) return year;
  return new Date().getFullYear();
}

export function eventSortKey(event) {
  return [
    eventYearValue(event),
    monthRank(event?.date_label),
    dayRank(event?.date_detail),
    Number(event?.id) || 0,
  ];
}

export function compareEventsByDate(a, b) {
  const ka = eventSortKey(a);
  const kb = eventSortKey(b);
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
}

export function getZonedYmd(date = new Date(), timeZone = 'America/New_York') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: read('year'), month: read('month'), day: read('day') };
}

/** Resolve an event to a calendar end date used for public visibility. */
export function eventComparableDate(event) {
  const year = eventYearValue(event);
  let month = monthRank(event?.date_label);
  if (!month || month > 12) month = 12;
  const detail = String(event?.date_detail || '').trim();
  let day;
  if (/^\d{1,2}$/.test(detail)) {
    day = Math.min(Number(detail), daysInMonth(year, month));
  } else {
    // TBD / weekday labels stay visible through the end of that month.
    day = daysInMonth(year, month);
  }
  return { year, month, day };
}

export function isUpcomingEvent(event, now = new Date(), timeZone = 'America/New_York') {
  const today = getZonedYmd(now, timeZone);
  const eventDate = eventComparableDate(event);
  if (eventDate.year !== today.year) return eventDate.year > today.year;
  if (eventDate.month !== today.month) return eventDate.month > today.month;
  return eventDate.day >= today.day;
}

const WEEKDAY_NAME_TO_INDEX = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTH_INDEX_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_INDEX_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return String(value).split(/[\s,]+/).filter(Boolean);
    }
  }
  return [];
}

export function normalizeRepeatDays(value) {
  const out = [];
  for (const item of parseJsonArray(value)) {
    if (typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 6) {
      out.push(item);
      continue;
    }
    const asNumber = Number(item);
    if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= 6) {
      out.push(asNumber);
      continue;
    }
    const mapped = WEEKDAY_NAME_TO_INDEX[String(item || '').trim().toLowerCase()];
    if (mapped != null) out.push(mapped);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function normalizeRepeatMonths(value) {
  const out = [];
  for (const item of parseJsonArray(value)) {
    const asNumber = Number(item);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 12) {
      out.push(asNumber);
      continue;
    }
    const rank = monthRank(item);
    if (rank >= 1 && rank <= 12) out.push(rank);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function normalizeRepeatExceptions(value) {
  const out = [];
  for (const item of parseJsonArray(value)) {
    const raw = String(item || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) out.push(raw);
  }
  return [...new Set(out)].sort();
}

export function formatRepeatSummary(event = {}) {
  if (!Number(event.repeat_enabled)) return '';
  const days = normalizeRepeatDays(event.repeat_days).map((day) => WEEKDAY_INDEX_LABELS[day]).join(', ');
  const months = normalizeRepeatMonths(event.repeat_months).map((month) => MONTH_INDEX_LABELS[month - 1]).join(', ');
  const bits = [];
  if (days) bits.push(days);
  if (months) bits.push(months);
  const year = eventYearValue(event);
  return bits.length ? `Repeats ${bits.join(' · ')} ${year}` : `Repeats in ${year}`;
}

export function expandRecurringEvent(event) {
  if (!Number(event?.repeat_enabled)) return [{ ...event, is_occurrence: false, series_id: event?.id ?? null }];
  const days = normalizeRepeatDays(event.repeat_days);
  const months = normalizeRepeatMonths(event.repeat_months);
  const exceptions = new Set(normalizeRepeatExceptions(event.repeat_exceptions));
  if (!days.length || !months.length) return [];
  const year = eventYearValue(event);
  const occurrences = [];
  for (const month of months) {
    const dim = daysInMonth(year, month);
    for (let day = 1; day <= dim; day += 1) {
      const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      if (!days.includes(dow)) continue;
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (exceptions.has(iso)) continue;
      occurrences.push({
        ...event,
        series_id: event.id,
        occurrence_date: iso,
        is_occurrence: true,
        date_label: MONTH_INDEX_LABELS[month - 1],
        date_detail: String(day).padStart(2, '0'),
        show_on_boosters: 0,
      });
    }
  }
  return occurrences;
}

export function normalizeEventPayload(payload = {}, existing = null) {
  const date_label = String(payload.date_label ?? existing?.date_label ?? '').trim();
  const date_detail = String(payload.date_detail ?? existing?.date_detail ?? '').trim();
  const titleRaw = String(payload.title ?? existing?.title ?? '').trim();
  const descriptionRaw = String(payload.description ?? existing?.description ?? '').trim();
  const title = titleRaw
    ? (looksLikeInlineRichHtml(titleRaw) ? sanitizeInlineRichHtml(titleRaw) : decodeBasicHtmlEntities(titleRaw).trim())
    : '';
  const description = descriptionRaw
    ? (looksLikeHtml(descriptionRaw) ? sanitizeRichHtml(descriptionRaw) : decodeBasicHtmlEntities(descriptionRaw).trim())
    : '';
  const event_year = eventYearValue({
    event_year: payload.event_year ?? existing?.event_year ?? new Date().getFullYear(),
  });
  const repeat_enabled = payload.repeat_enabled !== undefined
    ? (payload.repeat_enabled === true || payload.repeat_enabled === 1 || payload.repeat_enabled === '1' ? 1 : 0)
    : (Number(existing?.repeat_enabled) === 1 ? 1 : 0);
  const repeat_days = normalizeRepeatDays(
    payload.repeat_days !== undefined ? payload.repeat_days : existing?.repeat_days,
  );
  const repeat_months = normalizeRepeatMonths(
    payload.repeat_months !== undefined ? payload.repeat_months : existing?.repeat_months,
  );
  const repeat_exceptions = normalizeRepeatExceptions(
    payload.repeat_exceptions !== undefined ? payload.repeat_exceptions : existing?.repeat_exceptions,
  );
  const rawBooster = payload.show_on_boosters !== undefined
    ? payload.show_on_boosters
    : existing?.show_on_boosters;
  // Repeating series stay on the calendar only — never on Boosters.
  const show_on_boosters = repeat_enabled
    ? 0
    : (rawBooster === true || rawBooster === 1 || rawBooster === '1' ? 1 : 0);
  const firstMonthLabel = repeat_months.length ? MONTH_INDEX_LABELS[repeat_months[0] - 1] : '';
  return {
    date_label: date_label || (repeat_enabled ? firstMonthLabel || 'Jan' : ''),
    date_detail: date_detail || (repeat_enabled ? '01' : ''),
    event_year,
    title,
    description,
    sort_order: 0,
    show_on_boosters,
    repeat_enabled,
    repeat_days,
    repeat_months,
    repeat_exceptions,
  };
}

function hydrateEventRow(row = {}) {
  return {
    ...row,
    event_year: eventYearValue(row),
    show_on_boosters: Number(row.show_on_boosters) === 1 ? 1 : 0,
    repeat_enabled: Number(row.repeat_enabled) === 1 ? 1 : 0,
    repeat_days: normalizeRepeatDays(row.repeat_days),
    repeat_months: normalizeRepeatMonths(row.repeat_months),
    repeat_exceptions: normalizeRepeatExceptions(row.repeat_exceptions),
    repeat_summary: formatRepeatSummary(row),
    created_by: row.created_by == null || row.created_by === '' ? null : Number(row.created_by),
    created_by_name: row.created_by_name || '',
    created_by_username: row.created_by_username || '',
    is_occurrence: false,
    series_id: row.id ?? null,
  };
}

async function getEvents(env, { upcomingOnly = false, now = new Date(), includeCreators = false, expandRepeats = false } = {}) {
  const selectCols = 'e.id, e.date_label, e.date_detail, e.event_year, e.title, e.description, e.sort_order, e.show_on_boosters, e.created_by, e.repeat_enabled, e.repeat_days, e.repeat_months, e.repeat_exceptions';
  const rows = includeCreators
    ? await env.DB.prepare(`
        SELECT ${selectCols},
               u.display_name AS created_by_name, u.username AS created_by_username
        FROM events e
        LEFT JOIN users u ON u.id = e.created_by
      `).all()
    : await env.DB.prepare(`SELECT id, date_label, date_detail, event_year, title, description, sort_order, show_on_boosters, created_by, repeat_enabled, repeat_days, repeat_months, repeat_exceptions FROM events`).all();
  const events = (rows.results || []).map((row) => hydrateEventRow(row));
  const expanded = expandRepeats
    ? events.flatMap((event) => expandRecurringEvent(event))
    : events;
  expanded.sort(compareEventsByDate);
  if (!upcomingOnly) return expanded;
  return expanded.filter((event) => isUpcomingEvent(event, now));
}

async function getEventById(env, id) {
  const row = await env.DB.prepare(`
    SELECT e.id, e.date_label, e.date_detail, e.event_year, e.title, e.description, e.sort_order, e.show_on_boosters, e.created_by,
           e.repeat_enabled, e.repeat_days, e.repeat_months, e.repeat_exceptions,
           u.display_name AS created_by_name, u.username AS created_by_username
    FROM events e
    LEFT JOIN users u ON u.id = e.created_by
    WHERE e.id = ?
  `).bind(id).first();
  return row ? hydrateEventRow(row) : null;
}

/** Replace legacy event timelines / month grids with the Schedule Board mount on the Calendar page. */
export function ensureCalendarMonthMount(html) {
  const source = String(html || '');
  if (!source.trim()) return source;
  const mount = '<div id="caldev-app" class="caldev-app" aria-live="polite"></div>';
  if (/id=["']caldev-app["']/i.test(source) || /\bcaldev-app\b/i.test(source)) {
    return source
      .replace(/(?:<div\b[^>]*\bid=["']caldev-app["'][^>]*>\s*<\/div>\s*){2,}/gi, `${mount}\n`)
      .replace(/<div class="month-calendar"[^>]*data-month-calendar[^>]*>\s*<\/div>/gi, '');
  }
  const openRe = /<div\b[^>]*\bdata-events\b[^>]*>/gi;
  const ranges = [];
  let match;
  while ((match = openRe.exec(source)) !== null) {
    const start = match.index;
    let depth = 1;
    let i = start + match[0].length;
    while (i < source.length && depth > 0) {
      const nextOpen = source.toLowerCase().indexOf('<div', i);
      const nextClose = source.toLowerCase().indexOf('</div>', i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 4;
      } else {
        depth -= 1;
        i = nextClose + 6;
        if (depth === 0) ranges.push([start, i]);
      }
    }
  }
  let next = source;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const [start, end] = ranges[index];
    next = `${next.slice(0, start)}${mount}${next.slice(end)}`;
  }
  if (/data-month-calendar/i.test(next)) {
    next = next.replace(
      /<div class="month-calendar"[^>]*data-month-calendar[^>]*>\s*<\/div>/gi,
      mount,
    );
    return next.replace(
      /(?:<div id="caldev-app" class="caldev-app" aria-live="polite"><\/div>\s*){2,}/gi,
      `${mount}\n`,
    );
  }
  if (/id=["']caldev-app["']/i.test(next)) return next;
  if (/<div class="wrap">/i.test(next)) {
    return next.replace(
      /(<div class="wrap">)([\s\S]*?)(<\/div>\s*<\/section>)/i,
      `$1$2${mount}$3`,
    );
  }
  return `${next}${mount}`;
}

export function ensureBoosterMeetingsSlot(html) {
  const source = String(html || '');
  if (/data-booster-meetings/i.test(source)) return source;
  if (/<h3>\s*Booster Meetings\s*<\/h3>/i.test(source)) {
    return source.replace(
      /(<h3>\s*Booster Meetings\s*<\/h3>)([\s\S]*?)(<\/article>)/i,
      '$1<p class="booster-meetings-intro">Upcoming booster meetings are listed below.</p><div class="timeline booster-meetings" data-booster-meetings></div>$3'
    );
  }
  // Prefer inserting the meetings card into the main content wrap when present.
  if (/<section[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>[\s\S]*?<div class="wrap">/i.test(source)) {
    return source.replace(
      /(<section[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>\s*<div class="wrap">)([\s\S]*?)(<\/div>\s*<\/section>)/i,
      `$1$2<article class="card"><span class="tag">Meetings</span><h3>Booster Meetings</h3><p class="booster-meetings-intro">Upcoming booster meetings are listed below.</p><div class="timeline booster-meetings" data-booster-meetings></div></article>$3`
    );
  }
  return `${source}<div class="timeline booster-meetings" data-booster-meetings></div>`;
}

export function ensureBoosterMembersSlot(html) {
  const source = String(html || '');
  if (/data-booster-members/i.test(source)) return source;
  return `${source}<section class="content soft"><div class="wrap"><div class="section-head"><span class="kicker">People</span><h2>Booster Members</h2><p>Officers and volunteers who support the East Forsyth Band program.</p></div><div class="directory" data-booster-members></div></div></section>`;
}

export function renderSquareDonateCard() {
  return `<article class="card accent-card square-donate-card" data-square-donate>
  <span class="tag">Donate</span>
  <h3>Direct Support</h3>
  <p>Give securely online to support instruments, travel, meals, uniforms, and student opportunities.</p>
  <div class="square-donate">
    <button type="button" class="btn primary" data-donate-open>Donate</button>
  </div>
</article>`;
}

export function rewriteFundraisingDonateToPopup(html) {
  let source = String(html || '');
  if (!source.trim()) return source;
  // Prefer the in-page donate popup over legacy Square payment-link popups.
  source = source.replace(
    /<a\b[^>]*(?:data-square-checkout|id=["']embedded-checkout-modal-checkout-button["'])[^>]*>\s*Donate\s*<\/a>/gi,
    '<button type="button" class="btn primary" data-donate-open>Donate</button>',
  );
  source = source.replace(
    /<a\b[^>]*href=["'][^"']*square\.link[^"']*["'][^>]*>\s*Donate\s*<\/a>/gi,
    '<button type="button" class="btn primary" data-donate-open>Donate</button>',
  );
  return source;
}

export function refreshHomeStartHereSection(html) {
  const source = String(html || '');
  if (!source.trim()) return source;
  if (/Everything families need, all in one place\./i.test(source)) return source;
  if (!/Start here/i.test(source) || !/Built around the pages families expect\./i.test(source)) {
    return source;
  }
  return source
    .replace(/Built around the pages families expect\./g, 'Everything families need, all in one place.')
    .replace(
      /Modeled after a full high-school band program site structure, with East Forsyth branding and easy paths for students, parents, sponsors, and visitors\./g,
      'Designed to keep students, parents, alumni, sponsors, and the community connected with the East Forsyth Blue Regiment through quick access to important information, events, and resources.',
    )
    .replace(
      /Marching band, concert bands, percussion, color guard, jazz, and chamber opportunities\./g,
      "Explore our marching band, concert bands, percussion, color guard, jazz, and chamber ensembles, with information about each group's activities and expectations.",
    )
    .replace(
      /Forms, handbook links, rehearsal expectations, fees, uniforms, and travel information\./g,
      'Find forms, handbooks, rehearsal schedules, fees, uniform information, travel details, volunteer opportunities, and other essential family resources.',
    )
    .replace(
      /A place for local businesses and alumni to support the program and be recognized\./g,
      'Discover the businesses and community partners that support our program, learn about sponsorship opportunities, and help strengthen the Blue Regiment tradition.',
    );
}

export function refreshHomeHeroBrandMark(html, markUrl = PUBLIC_BRAND_MARK) {
  const source = String(html || '');
  if (!source.trim() || !/<aside\b[^>]*\bhero-card\b/i.test(source)) return source;
  const mark = String(markUrl || PUBLIC_BRAND_MARK || BLUE_REGIMENT_MARK_PATH).trim() || BLUE_REGIMENT_MARK_PATH;
  return source.replace(
    /(<aside\b[^>]*\bhero-card\b[^>]*>[\s\S]*?<img\b[^>]*?\bsrc=["'])([^"']+)(["'])/i,
    `$1${mark}$3`,
  );
}

export function ensureHomePhotoGallerySlot(html) {
  let source = String(html || '');
  if (!source.trim() || !/\bdata-photo-gallery\b/i.test(source)) return source;
  source = source.replace(/<div\b([^>]*\bdata-photo-gallery\b[^>]*)>/gi, (_match, attrs) => {
    const cleaned = String(attrs || '')
      .replace(/\s*data-limit=(["'])[^"']*\1/gi, '')
      .replace(/\s*data-sort=(["'])[^"']*\1/gi, '')
      .trimEnd();
    return `<div${cleaned} data-limit="6" data-sort="recent">`;
  });
  if (!/gallery-more|View full gallery/i.test(source)) {
    const withLink = source.replace(
      /(<(?:div)\b[^>]*\bdata-photo-gallery\b[^>]*>[\s\S]*?<\/div>)(\s*)(?=<\/div>\s*<\/section>)/i,
      '$1$2<p class="gallery-more"><a class="btn outline" href="/gallery.html">View full gallery</a></p>$2',
    );
    if (withLink !== source) source = withLink;
  }
  return source;
}

export function sortPhotosByRecent(photos = []) {
  return [...(Array.isArray(photos) ? photos : [])].sort((a, b) => {
    const aTime = Date.parse(a?.created_at || '') || 0;
    const bTime = Date.parse(b?.created_at || '') || 0;
    if (bTime !== aTime) return bTime - aTime;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

export function ensureGalleryPageSlot(html) {
  let source = String(html || '');
  if (!source.trim()) return source;
  // Never ship brand/logo placeholders inside the public Gallery photo mount.
  if (/\bdata-photo-gallery\b/i.test(source)) {
    source = source.replace(
      /(<div\b[^>]*\bdata-photo-gallery\b[^>]*>)[\s\S]*?(<\/div>)/gi,
      '$1$2',
    );
  }
  if (!/\bdata-photo-gallery\b/i.test(source) && /data-cms-layout=["']gallery["']/i.test(source)) {
    source = source.replace(
      /(<\/section>\s*)$/i,
      '<section class="content soft photo-gallery-section"><div class="wrap"><div class="photo-gallery" data-photo-gallery data-sort="recent"></div></div></section>$1',
    );
  }
  return source;
}

export function ensureFundraisingDonateSlot(html) {
  let source = rewriteFundraisingDonateToPopup(html);
  if (/data-donate-open/i.test(source) && /data-square-donate|Direct Support/i.test(source)) {
    return source;
  }
  if (/data-square-donate/i.test(source)) return source;
  const donate = renderSquareDonateCard();
  if (/data-cms-field=["']body_text["']/i.test(source)) {
    const replaced = source.replace(
      /(<div\b[^>]*data-cms-field=["']body_text["'][^>]*>[\s\S]*?<\/div>)(\s*<\/div>\s*<\/section>)/i,
      `$1${donate}$2`,
    );
    if (replaced !== source) return replaced;
  }
  if (/class=["'][^"']*\bwrap\b[^"']*["']/i.test(source)) {
    const replaced = source.replace(
      /(<div\b[^>]*class=["'][^"']*\bwrap\b[^"']*["'][^>]*>)([\s\S]*?)(<\/div>\s*<\/section>)/i,
      `$1$2${donate}$3`,
    );
    if (replaced !== source) return replaced;
  }
  return `${source}<section class="content soft"><div class="wrap">${donate}</div></section>`;
}

export function renderBoostersDuesCard() {
  return `<article class="card accent-card boosters-dues-card" data-boosters-dues>
  <span class="tag">Band dues</span>
  <h3>Pay band dues</h3>
  <p>Pay student band dues securely online with a credit card. Enter the student&rsquo;s full name, the amount, and an email for the receipt.</p>
  <div class="boosters-dues-actions">
    <button type="button" class="btn primary" data-dues-open>Pay dues</button>
  </div>
</article>`;
}

export function ensureBoostersDuesSlot(html) {
  const source = String(html || '');
  if (/data-dues-open/i.test(source) || /data-boosters-dues/i.test(source)) return source;
  const dues = renderBoostersDuesCard();
  if (/data-cms-field=["']body_text["']/i.test(source)) {
    const replaced = source.replace(
      /(<div\b[^>]*data-cms-field=["']body_text["'][^>]*>[\s\S]*?<\/div>)/i,
      `$1${dues}`,
    );
    if (replaced !== source) return replaced;
  }
  if (/<span[^>]*class="[^"]*\btag\b[^"]*"[^>]*>\s*Meetings\s*<\/span>/i.test(source)) {
    const replaced = source.replace(
      /(<article\b[^>]*>\s*<span[^>]*class="[^"]*\btag\b[^"]*"[^>]*>\s*Meetings\s*<\/span>)/i,
      `${dues}$1`,
    );
    if (replaced !== source) return replaced;
  }
  if (/class=["'][^"']*\bwrap\b[^"']*["']/i.test(source)) {
    const replaced = source.replace(
      /(<div\b[^>]*class=["'][^"']*\bwrap\b[^"']*["'][^>]*>)([\s\S]*?)(<\/div>\s*<\/section>)/i,
      `$1$2${dues}$3`,
    );
    if (replaced !== source) return replaced;
  }
  return `${source}<section class="content soft"><div class="wrap">${dues}</div></section>`;
}

export function stripBoostersDuesSlot(html) {
  return String(html || '').replace(
    /<article\b[^>]*\bdata-boosters-dues\b[^>]*>[\s\S]*?<\/article>/gi,
    '',
  );
}

export function applyBoostersDuesVisibility(html, enabled = true) {
  if (enabled) return ensureBoostersDuesSlot(html);
  return stripBoostersDuesSlot(html);
}

async function syncBoostersDuesCmsBody(env, enabled) {
  const boostersPageRow = await env.DB.prepare("SELECT id, body_html FROM cms_pages WHERE slug = 'boosters'").first();
  if (!boostersPageRow?.body_html) return;
  const nextBoostersHtml = applyBoostersDuesVisibility(
    ensureBoosterMembersSlot(ensureBoosterMeetingsSlot(boostersPageRow.body_html)),
    enabled,
  );
  if (nextBoostersHtml === boostersPageRow.body_html) return;
  await env.DB.prepare('UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(nextBoostersHtml, boostersPageRow.id)
    .run();
}


export const US_STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];

const STATE_NAME_TO_CODE = Object.fromEntries(
  US_STATES.flatMap(([code, name]) => [[code.toLowerCase(), code], [name.toLowerCase(), code]])
);

export function isUsStateCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return US_STATES.some(([item]) => item === code);
}

export function normalizeStateCode(value, fallback = 'NC') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const mapped = STATE_NAME_TO_CODE[raw.toLowerCase()];
  if (mapped) return mapped;
  const upper = raw.toUpperCase();
  return isUsStateCode(upper) ? upper : fallback;
}

export function titleCaseAddressPart(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^\d/.test(word)) {
        return word.replace(/[a-zA-Z]+/g, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
      }
      if (word.includes('-')) {
        return word.split('-').map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part)).join('-');
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function parseLegacySponsorAddress(raw) {
  const text = String(raw || '').trim();
  if (!text) return { address: '', city: 'Kernersville', state: 'NC' };
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const stateTail = String(parts[parts.length - 1] || '')
      .replace(/\s+\d{5}(?:-\d{4})?\s*$/, '')
      .trim();
    const maybeState = normalizeStateCode(stateTail, '');
    if (maybeState && isUsStateCode(maybeState)) {
      if (parts.length >= 3) {
        return {
          address: parts.slice(0, -2).join(', '),
          city: titleCaseAddressPart(parts[parts.length - 2]) || 'Kernersville',
          state: maybeState,
        };
      }
      return {
        address: '',
        city: titleCaseAddressPart(parts[0]) || 'Kernersville',
        state: maybeState,
      };
    }
  }
  return {
    address: text,
    city: 'Kernersville',
    state: 'NC',
  };
}

export function formatSponsorAddress(sponsor = {}) {
  const street = titleCaseAddressPart(sponsor.address || '');
  const city = titleCaseAddressPart(sponsor.city || '');
  const state = normalizeStateCode(sponsor.state || '', '');
  const pieces = [];
  if (street) pieces.push(street);
  if (city) pieces.push(city);
  if (state) pieces.push(state);
  return pieces.join(', ');
}

export function sponsorMapsUrls(formattedAddress) {
  const query = encodeURIComponent(String(formattedAddress || '').trim());
  if (!query) {
    return { embedUrl: '', directionsUrl: '', searchUrl: '' };
  }
  return {
    embedUrl: `https://maps.google.com/maps?q=${query}&z=15&output=embed`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${query}`,
    searchUrl: `https://www.google.com/maps/search/?api=1&query=${query}`,
  };
}

const ADDRESS_SUGGEST_BIAS = { lat: 36.1199, lon: -80.0736, city: 'Kernersville', state: 'NC' };

export function googleMapsApiKey(env = {}) {
  return String(env.GOOGLE_MAPS_API_KEY || env.GOOGLE_PLACES_API_KEY || '').trim();
}

export function formatSuggestedAddress({
  street = '',
  city = '',
  state = '',
  postcode = '',
  label = '',
} = {}) {
  const line = titleCaseAddressPart(street);
  const town = titleCaseAddressPart(city);
  const region = normalizeStateCode(state, '');
  const zip = String(postcode || '').trim().match(/^\d{5}(?:-\d{4})?$/)?.[0] || '';
  const pieces = [];
  if (line) pieces.push(line);
  if (town) pieces.push(town);
  if (region) pieces.push(zip ? `${region} ${zip}` : region);
  if (pieces.length) return pieces.join(', ');
  return String(label || '').trim().replace(/,?\s*United States$/i, '').trim();
}

function uniqueAddressSuggestions(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const description = String(item?.description || '').trim();
    if (!description || seen.has(description.toLowerCase())) continue;
    seen.add(description.toLowerCase());
    out.push({
      id: String(item.id || `addr-${out.length + 1}`),
      description,
      verified: true,
    });
    if (out.length >= 6) break;
  }
  return out;
}

async function suggestAddressesGoogle(query, env) {
  const key = googleMapsApiKey(env);
  if (!key) return null;
  const params = new URLSearchParams({
    input: query,
    key,
    types: 'address',
    components: 'country:us',
    language: 'en',
    location: `${ADDRESS_SUGGEST_BIAS.lat},${ADDRESS_SUGGEST_BIAS.lon}`,
    radius: '80000',
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`, {
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === 'REQUEST_DENIED' || payload.status === 'INVALID_REQUEST') {
    return null;
  }
  const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
  return uniqueAddressSuggestions(predictions.map((item, index) => ({
    id: String(item.place_id || `google-${index}`),
    description: String(item.description || '')
      .replace(/,?\s*USA$/i, '')
      .replace(/,?\s*United States$/i, '')
      .trim(),
  })));
}

async function suggestAddressesNominatim(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    countrycodes: 'us',
    viewbox: '-80.35,36.35,-79.75,35.90',
    bounded: '0',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'efhsband-address-suggest/1.0 (https://efhsband.org)',
    },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => []);
  const rows = Array.isArray(payload) ? payload : [];
  return uniqueAddressSuggestions(rows.map((row, index) => {
    const addr = row.address || {};
    const street = [addr.house_number, addr.road || addr.pedestrian || addr.residential]
      .filter(Boolean)
      .join(' ');
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || '';
    const state = addr.state || addr['ISO3166-2-lvl4'] || '';
    const description = formatSuggestedAddress({
      street,
      city,
      state,
      postcode: addr.postcode,
      label: row.display_name,
    });
    return { id: String(row.place_id || `nominatim-${index}`), description };
  }).filter((item) => item.description));
}

async function suggestAddressesPhoton(query) {
  const params = new URLSearchParams({
    q: query,
    lat: String(ADDRESS_SUGGEST_BIAS.lat),
    lon: String(ADDRESS_SUGGEST_BIAS.lon),
    limit: '6',
    lang: 'en',
  });
  const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  const features = Array.isArray(payload.features) ? payload.features : [];
  return uniqueAddressSuggestions(features.map((feature, index) => {
    const props = feature?.properties || {};
    if (props.countrycode && String(props.countrycode).toUpperCase() !== 'US') return null;
    const street = [props.housenumber, props.street || props.name]
      .filter(Boolean)
      .join(' ');
    const description = formatSuggestedAddress({
      street: street || props.name,
      city: props.city || props.town || props.village || props.district || '',
      state: props.state,
      postcode: props.postcode,
      label: [props.name, props.street, props.city, props.state, props.postcode].filter(Boolean).join(', '),
    });
    return description ? { id: `photon-${props.osm_id || index}`, description } : null;
  }).filter(Boolean));
}

export async function suggestAddresses(query, env = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return { suggestions: [], provider: 'none' };
  try {
    const google = await suggestAddressesGoogle(q, env);
    if (google && google.length) return { suggestions: google, provider: 'google' };
  } catch {
    // Fall through to open geocoders.
  }
  try {
    const nominatim = await suggestAddressesNominatim(q);
    if (nominatim.length) return { suggestions: nominatim, provider: 'nominatim' };
  } catch {
    // Fall through to Photon.
  }
  try {
    const photon = await suggestAddressesPhoton(q);
    return { suggestions: photon, provider: photon.length ? 'photon' : 'none' };
  } catch {
    return { suggestions: [], provider: 'none' };
  }
}

export function hydrateSponsor(sponsor) {
  const source = sponsor || {};
  const city = titleCaseAddressPart(source.city || 'Kernersville') || 'Kernersville';
  const state = normalizeStateCode(source.state || 'NC');
  const address = titleCaseAddressPart(source.address || '');
  const formatted_address = formatSponsorAddress({ address, city, state });
  const maps = sponsorMapsUrls(formatted_address);
  const level = normalizeSponsorLevel(source.level, { homepageAd: source.homepage_ad });
  const benefits = sponsorBenefitsFromLevel(level);
  return {
    ...source,
    address,
    city,
    state,
    level,
    ...benefits,
    homepage_ad: benefits.show_flyin ? 1 : 0,
    formatted_address,
    maps_embed_url: maps.embedUrl,
    maps_directions_url: maps.directionsUrl,
  };
}

async function getSponsors(env, includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const rows = await env.DB.prepare(`SELECT id, name, address, city, state, logo_url, level, mark_text, sort_order, active, homepage_ad FROM sponsors ${where} ORDER BY sort_order, id`).all();
  return (rows.results || []).map((row) => hydrateSponsor(row));
}

export function normalizeSponsorTier(level = '') {
  const raw = String(level || '').trim().toLowerCase();
  if (/\bgold\b/.test(raw)) return 'gold';
  if (/\bsilver\b/.test(raw)) return 'silver';
  if (/\bbronze\b/.test(raw)) return 'bronze';
  return '';
}

export function sponsorTierLabel(tier = '') {
  if (tier === 'gold') return 'Gold';
  if (tier === 'silver') return 'Silver';
  if (tier === 'bronze') return 'Bronze';
  return 'Sponsor';
}

export function normalizeSponsorLevel(level = '', { homepageAd } = {}) {
  let tier = normalizeSponsorTier(level);
  if (!tier && (homepageAd === true || homepageAd === 1 || homepageAd === '1')) tier = 'silver';
  if (!tier) tier = 'bronze';
  return `${sponsorTierLabel(tier)} Sponsor`;
}

export function sponsorBenefitsFromLevel(level = '') {
  const tier = normalizeSponsorTier(level) || 'bronze';
  return {
    tier,
    tier_label: sponsorTierLabel(tier),
    show_marquee: true,
    show_flyin: tier === 'silver' || tier === 'gold',
    show_game_announcement: tier === 'gold',
  };
}

export function sponsorShowsMarquee(sponsor = {}) {
  if (Number(sponsor.active) === 0) return false;
  if (sponsor.show_marquee === false || sponsor.show_marquee === 0) return false;
  const tier = String(sponsor.tier || sponsor.level || '').toLowerCase();
  return /\b(bronze|silver|gold)\b/.test(tier) || sponsor.show_marquee === true || sponsor.show_marquee === 1;
}

export function renderSponsorMarqueeSection(sponsors = []) {
  const items = (Array.isArray(sponsors) ? sponsors : []).filter(sponsorShowsMarquee);
  if (!items.length) {
    return '<section class="sponsor-marquee-section" data-sponsor-marquee aria-label="Sponsor marquee" hidden></section>';
  }
  const logos = items.map((sponsor) => {
    const tier = normalizeSponsorTier(sponsor.tier || sponsor.level) || '';
    const tierClass = tier ? ` tier-${tier}` : '';
    const visual = sponsor.logo_url
      ? `<img src="${escapeAttr(sponsor.logo_url)}" alt="${escapeAttr(sponsor.name || 'Sponsor')} logo">`
      : `<span class="sponsor-marquee-mark" aria-hidden="true">${escapeHtml(sponsor.mark_text || '★')}</span>`;
    return `<a class="sponsor-marquee-item${tierClass}" href="/sponsors.html" title="${escapeAttr(sponsor.name || '')}" data-sponsor-tier="${escapeAttr(tier)}">${visual}<span>${escapeHtml(sponsor.name || '')}</span></a>`;
  }).join('');
  return `<section class="sponsor-marquee-section" data-sponsor-marquee aria-label="Sponsor marquee"><div class="wrap sponsor-marquee-bar"><span class="sponsor-marquee-label">Sponsors</span><div class="sponsor-marquee" data-marquee-track><div class="sponsor-marquee-track">${logos}${logos}</div></div></div></section>`;
}

export function sponsorLevelFromTierKey(tier = '') {
  const key = normalizeSponsorTierKey(tier);
  if (!key) return '';
  return normalizeSponsorLevel(`${key} Sponsor`);
}

export function squareMockPayEnabled(env = {}) {
  const raw = String(env.SQUARE_ALLOW_MOCK_PAY ?? '0').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export const SPONSOR_INVOICE_FROM_EMAIL = 'no-reply@efhsband.org';
export const SPONSOR_INVOICE_FROM_NAME = 'East Forsyth Band Boosters';

export function formatSponsorInvoiceDate(value = '') {
  const raw = String(value || '').trim();
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

export function buildSponsorDonationInvoice(application = {}) {
  const tier = normalizeSponsorTierKey(application.tier);
  const tierLabel = tier
    ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)} Sponsor`
    : 'Sponsor package';
  const amountDisplay = String(application.amount_display || '').trim()
    || formatSponsorAmountDisplay(application.amount_cents)
    || '$0';
  const businessName = String(application.business_name || '').trim() || 'Sponsor';
  const address = String(application.address || '').trim() || '—';
  const phone = String(application.phone || '').trim() || '—';
  const email = String(application.email || '').trim().toLowerCase();
  const invoiceNumber = `SP-${Number(application.id || 0) || 'pending'}`;
  const paidLabel = formatSponsorInvoiceDate(application.paid_at);
  const subject = `Invoice — Donation to East Forsyth Band Boosters (${tierLabel})`;
  const text = [
    'Thank you for your donation to the East Forsyth Band Boosters.',
    '',
    'This invoice confirms that your sponsorship payment is a donation to the East Forsyth Band Boosters in support of the East Forsyth High School Band program.',
    '',
    'Invoice details',
    `Invoice number: ${invoiceNumber}`,
    `Date: ${paidLabel}`,
    `Business / organization: ${businessName}`,
    `Address: ${address}`,
    `Phone: ${phone}`,
    `Email: ${email || '—'}`,
    `Package: ${tierLabel}`,
    `Amount: ${amountDisplay}`,
    'Payment status: Paid',
    '',
    'East Forsyth Band Boosters',
    'East Forsyth High School Band',
    'https://efhsband.org',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10233c;max-width:640px">
      <h1 style="font-size:22px;margin:0 0 12px">Donation invoice</h1>
      <p style="margin:0 0 14px">Thank you for your donation to the <strong>East Forsyth Band Boosters</strong>.</p>
      <p style="margin:0 0 18px">This invoice confirms that your sponsorship payment is a donation to the East Forsyth Band Boosters in support of the East Forsyth High School Band program.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
        <tr><td style="padding:6px 0;color:#64748b">Invoice number</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(invoiceNumber)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Date</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(paidLabel)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Business / organization</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(businessName)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Address</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(address)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Phone</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(phone)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(email || '—')}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Package</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(tierLabel)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Amount</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(amountDisplay)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Payment status</td><td style="padding:6px 0;text-align:right"><strong>Paid</strong></td></tr>
      </table>
      <p style="margin:0;color:#64748b;font-size:14px">East Forsyth Band Boosters · <a href="https://efhsband.org">efhsband.org</a></p>
    </div>
  `.trim();
  return {
    to: email,
    subject,
    text,
    html,
    invoice_number: invoiceNumber,
    from_email: SPONSOR_INVOICE_FROM_EMAIL,
    from_name: SPONSOR_INVOICE_FROM_NAME,
  };
}

export async function sendSponsorDonationInvoice(env, application = {}) {
  const invoice = buildSponsorDonationInvoice(application);
  if (!isValidEmail(invoice.to)) {
    return { ok: false, detail: 'Invoice email is missing or invalid' };
  }
  if (!env.RESEND_API_KEY) {
    return { ok: false, detail: 'Email delivery is not configured. Add RESEND_API_KEY in Cloudflare Pages secrets.' };
  }
  try {
    await sendViaResend(env, {
      to: invoice.to,
      subject: invoice.subject,
      text: invoice.text,
      html: invoice.html,
      fromEmail: SPONSOR_INVOICE_FROM_EMAIL,
      fromName: SPONSOR_INVOICE_FROM_NAME,
    });
    const id = Number(application.id || 0);
    if (id) {
      const sentAt = new Date().toISOString();
      await env.DB.prepare(
        'UPDATE sponsor_applications SET invoice_sent_at = ?, updated_at = ? WHERE id = ?',
      ).bind(sentAt, sentAt, id).run();
    }
    return { ok: true, detail: 'Invoice emailed', invoice_number: invoice.invoice_number };
  } catch (error) {
    return { ok: false, detail: error?.message || 'Could not send invoice email' };
  }
}

async function maybeSendSponsorInvoice(env, application, { force = false } = {}) {
  if (!application) return { ok: false, detail: 'Application missing' };
  if (!force && application.invoice_sent_at) {
    return { ok: true, detail: 'Invoice already sent', skipped: true };
  }
  return sendSponsorDonationInvoice(env, application);
}

export function escapeXml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&apos;',
    '"': '&quot;',
  }[char]));
}

export function formatLedgerAmountDisplay(cents) {
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

export function normalizeLedgerKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  return LEDGER_KINDS.includes(kind) ? kind : '';
}

export function ledgerSignedCents(row = {}) {
  const cents = Math.abs(Math.round(Number(row.amount_cents) || 0));
  return normalizeLedgerKind(row.kind) === 'expense' ? -cents : cents;
}

export function summarizeLedgerEntries(entries = []) {
  const rows = Array.isArray(entries) ? entries : [];
  const byKind = Object.fromEntries(LEDGER_KINDS.map((kind) => [kind, []]));
  for (const row of rows) {
    const kind = normalizeLedgerKind(row.kind) || 'donor';
    byKind[kind].push(row);
  }
  const sumAbs = (list) => list.reduce((sum, row) => sum + Math.abs(Number(row.amount_cents) || 0), 0);
  const incomeRows = LEDGER_INCOME_KINDS.flatMap((kind) => byKind[kind] || []);
  const incomeCents = sumAbs(incomeRows);
  const expenseCents = sumAbs(byKind.expense);
  const inKindTotalCents = rows
    .filter((row) => row.money_exchanged === false || Number(row.money_exchanged) === 0)
    .reduce((sum, row) => sum + Math.abs(Number(row.amount_cents) || 0), 0);
  const cashIncomeCents = incomeRows
    .filter((row) => !(row.money_exchanged === false || Number(row.money_exchanged) === 0))
    .reduce((sum, row) => sum + Math.abs(Number(row.amount_cents) || 0), 0);
  const cashExpenseCents = byKind.expense
    .filter((row) => !(row.money_exchanged === false || Number(row.money_exchanged) === 0))
    .reduce((sum, row) => sum + Math.abs(Number(row.amount_cents) || 0), 0);
  return {
    byKind,
    counts: Object.fromEntries(LEDGER_KINDS.map((kind) => [kind, byKind[kind].length])),
    income_cents: incomeCents,
    expense_cents: expenseCents,
    net_cents: incomeCents - expenseCents,
    cash_cents: cashIncomeCents - cashExpenseCents,
    in_kind_cents: inKindTotalCents,
    sponsors_cents: sumAbs(byKind.sponsor),
    donors_cents: sumAbs(byKind.donor),
    fundraisers_cents: sumAbs(byKind.fundraiser),
    dues_cents: sumAbs(byKind.dues),
  };
}

export function buildPaymentLedgerXml({
  entries = null,
  sponsors = [],
  donors = [],
  fundraisers = [],
  dues = [],
  expenses = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const allEntries = Array.isArray(entries) && entries.length
    ? entries
    : [
      ...sponsors.map((row) => ({ ...row, kind: 'sponsor' })),
      ...donors.map((row) => ({ ...row, kind: 'donor' })),
      ...fundraisers.map((row) => ({ ...row, kind: 'fundraiser' })),
      ...dues.map((row) => ({ ...row, kind: 'dues' })),
      ...expenses.map((row) => ({ ...row, kind: 'expense' })),
    ];
  const summary = summarizeLedgerEntries(allEntries);
  const renderEntry = (row) => {
    const kind = normalizeLedgerKind(row.kind) || 'donor';
    const name = escapeXml(row.name || '');
    const address = escapeXml(row.address || '');
    const signed = ledgerSignedCents(row);
    const amountDisplay = escapeXml(row.amount_display || formatLedgerAmountDisplay(Math.abs(signed)));
    const paidAt = escapeXml(row.paid_at || '');
    const pkg = escapeXml(row.package || '');
    const note = escapeXml(row.note || '');
    const moneyExchanged = !(row.money_exchanged === false || Number(row.money_exchanged) === 0);
    const id = escapeXml(row.id == null ? '' : String(row.id));
    const packageXml = pkg ? `\n      <package>${pkg}</package>` : '';
    const noteXml = note ? `\n      <note>${note}</note>` : '';
    return `    <entry id="${id}" kind="${kind}" paid_at="${paidAt}" money_exchanged="${moneyExchanged ? 'true' : 'false'}">
      <name>${name}</name>
      <address>${address}</address>
      <amount cents="${signed}" display="${amountDisplay}"/>${packageXml}${noteXml}
    </entry>`;
  };
  const section = (kind, label) => {
    const rows = summary.byKind[kind] || [];
    const total = rows.reduce((sum, row) => sum + Math.abs(Number(row.amount_cents) || 0), 0);
    const xml = rows.map(renderEntry).join('\n');
    return `  <${label} count="${rows.length}" total_cents="${kind === 'expense' ? -total : total}" total_display="${escapeXml(formatLedgerAmountDisplay(kind === 'expense' ? -total : total))}">
${xml ? `${xml}\n` : ''}  </${label}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<payment_ledger generated_at="${escapeXml(generatedAt)}" organization="East Forsyth Band Boosters">
${section('sponsor', 'sponsors')}
${section('donor', 'donors')}
${section('fundraiser', 'fundraisers')}
${section('dues', 'dues')}
${section('expense', 'expenses')}
  <totals>
    <income cents="${summary.income_cents}" display="${escapeXml(formatLedgerAmountDisplay(summary.income_cents))}"/>
    <expenses cents="${summary.expense_cents}" display="${escapeXml(formatLedgerAmountDisplay(summary.expense_cents))}"/>
    <cash_total cents="${summary.cash_cents}" display="${escapeXml(formatLedgerAmountDisplay(summary.cash_cents))}"/>
    <in_kind_total cents="${summary.in_kind_cents}" display="${escapeXml(formatLedgerAmountDisplay(summary.in_kind_cents))}"/>
    <net_total cents="${summary.net_cents}" display="${escapeXml(formatLedgerAmountDisplay(summary.net_cents))}"/>
  </totals>
</payment_ledger>
`;
}

export function buildPaymentLedgerExcelXml(entries = [], {
  generatedAt = new Date().toISOString(),
} = {}) {
  const rows = Array.isArray(entries) ? entries : [];
  const summary = summarizeLedgerEntries(rows);
  const cell = (value, type = 'String') => {
    const text = String(value ?? '');
    return `<Cell><Data ss:Type="${type}">${escapeXml(text)}</Data></Cell>`;
  };
  const header = ['Date', 'Type', 'Name', 'Address', 'Amount', 'Amount (cents)', 'Money exchanged', 'Package / description', 'Note', 'Ledger ID'];
  const body = rows.map((row) => {
    const signed = ledgerSignedCents(row);
    const money = !(row.money_exchanged === false || Number(row.money_exchanged) === 0);
    return [
      row.paid_at || '',
      normalizeLedgerKind(row.kind) || '',
      row.name || '',
      row.address || '',
      row.amount_display || formatLedgerAmountDisplay(Math.abs(signed)),
      String(signed),
      money ? 'Yes' : 'No (in-kind)',
      row.package || '',
      row.note || '',
      String(row.id ?? ''),
    ];
  });
  const summaryRows = [
    ['', '', '', '', '', '', '', '', '', ''],
    ['Totals', '', '', '', '', '', '', '', '', ''],
    ['Income', '', '', '', formatLedgerAmountDisplay(summary.income_cents), String(summary.income_cents), '', '', '', ''],
    ['Expenses', '', '', '', formatLedgerAmountDisplay(summary.expense_cents), String(summary.expense_cents), '', '', '', ''],
    ['Cash net', '', '', '', formatLedgerAmountDisplay(summary.cash_cents), String(summary.cash_cents), '', '', '', ''],
    ['In-kind total', '', '', '', formatLedgerAmountDisplay(summary.in_kind_cents), String(summary.in_kind_cents), '', '', '', ''],
    ['Net total', '', '', '', formatLedgerAmountDisplay(summary.net_cents), String(summary.net_cents), '', '', '', ''],
    ['Generated at', generatedAt, '', '', '', '', '', '', '', ''],
  ];
  const excelRows = [header, ...body, ...summaryRows]
    .map((cols) => `<Row>${cols.map((value, index) => cell(value, index === 5 && /^-?\d+$/.test(String(value)) ? 'Number' : 'String')).join('')}</Row>`)
    .join('\n');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
 </Styles>
 <Worksheet ss:Name="EFHS Ledger">
  <Table>
${excelRows}
  </Table>
 </Worksheet>
</Workbook>
`;
}

export async function upsertPaymentLedgerEntry(env, {
  kind = 'sponsor',
  refType = '',
  refId = null,
  name = '',
  address = '',
  amountCents = 0,
  amountDisplay = '',
  packageLabel = '',
  note = '',
  moneyExchanged = true,
  paidAt = '',
} = {}) {
  const normalizedKind = normalizeLedgerKind(kind) || 'sponsor';
  const cents = Math.max(0, Math.round(Math.abs(Number(amountCents) || 0)));
  const display = String(amountDisplay || formatLedgerAmountDisplay(cents)).trim();
  const paid = String(paidAt || new Date().toISOString()).trim();
  const exchanged = moneyExchanged === false || moneyExchanged === 0 || moneyExchanged === '0' ? 0 : 1;
  await env.DB.prepare(
    `INSERT INTO payment_ledger
      (kind, ref_type, ref_id, name, address, amount_cents, amount_display, package, note, money_exchanged, paid_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, ref_type, ref_id) DO UPDATE SET
       name=excluded.name,
       address=excluded.address,
       amount_cents=excluded.amount_cents,
       amount_display=excluded.amount_display,
       package=excluded.package,
       note=excluded.note,
       money_exchanged=excluded.money_exchanged,
       paid_at=excluded.paid_at`,
  ).bind(
    normalizedKind,
    String(refType || '').trim().slice(0, 40),
    refId == null ? null : Number(refId),
    String(name || '').trim().slice(0, 200),
    String(address || '').trim().slice(0, 400),
    cents,
    display.slice(0, 40),
    String(packageLabel || '').trim().slice(0, 80),
    String(note || '').trim().slice(0, 500),
    exchanged,
    paid.slice(0, 64),
    new Date().toISOString(),
  ).run();
}

export async function recordSponsorPaymentLedger(env, application = {}) {
  const id = Number(application.id || 0);
  if (!id) return null;
  const tier = normalizeSponsorTierKey(application.tier) || String(application.tier || '').trim();
  const packageLabel = sponsorLevelFromTierKey(tier) || (tier ? `${tier} Sponsor` : 'Sponsor');
  await upsertPaymentLedgerEntry(env, {
    kind: 'sponsor',
    refType: 'application',
    refId: id,
    name: application.business_name || application.name || '',
    address: application.address || '',
    amountCents: application.amount_cents,
    amountDisplay: application.amount_display,
    packageLabel,
    paidAt: application.paid_at || new Date().toISOString(),
  });
  return refreshPaymentLedgerXml(env);
}

export async function recordDonorPaymentLedger(env, donation = {}) {
  const id = Number(donation.id || 0);
  if (!id) return null;
  await upsertPaymentLedgerEntry(env, {
    kind: 'donor',
    refType: 'donation',
    refId: id,
    name: donation.donor_name || donation.name || '',
    address: donation.address || '',
    amountCents: donation.amount_cents,
    amountDisplay: donation.amount_display,
    packageLabel: 'Donation',
    paidAt: donation.paid_at || new Date().toISOString(),
  });
  return refreshPaymentLedgerXml(env);
}

export async function recordDuesPaymentLedger(env, dues = {}) {
  const id = Number(dues.id || 0);
  if (!id) return null;
  await upsertPaymentLedgerEntry(env, {
    kind: 'dues',
    refType: 'dues_payment',
    refId: id,
    name: dues.student_name || dues.name || '',
    address: dues.email || '',
    amountCents: dues.amount_cents,
    amountDisplay: dues.amount_display,
    packageLabel: 'Band dues',
    note: dues.email ? `Receipt: ${dues.email}` : '',
    moneyExchanged: true,
    paidAt: dues.paid_at || new Date().toISOString(),
  });
  return refreshPaymentLedgerXml(env);
}

export async function recordDuesFailedLedger(env, dues = {}) {
  const id = Number(dues.id || 0);
  if (!id) return null;
  const failure = String(dues.failure_detail || 'Payment failed').trim().slice(0, 400);
  await upsertPaymentLedgerEntry(env, {
    kind: 'dues',
    refType: 'dues_failed',
    refId: id,
    name: dues.student_name || dues.name || '',
    address: dues.email || '',
    amountCents: dues.amount_cents,
    amountDisplay: dues.amount_display,
    packageLabel: 'Band dues (failed)',
    note: failure,
    moneyExchanged: false,
    paidAt: dues.updated_at || new Date().toISOString(),
  });
  return refreshPaymentLedgerXml(env);
}

export function buildDuesReceipt(dues = {}, { failed = false } = {}) {
  const studentName = String(dues.student_name || '').trim() || 'Student';
  const email = String(dues.email || '').trim().toLowerCase();
  const amountDisplay = String(dues.amount_display || '').trim()
    || formatLedgerAmountDisplay(dues.amount_cents)
    || '$0';
  const receiptNumber = `DU-${Number(dues.id || 0) || 'pending'}`;
  const whenLabel = formatSponsorInvoiceDate(dues.paid_at || dues.updated_at || new Date().toISOString());
  const failure = String(dues.failure_detail || '').trim() || 'The card payment could not be completed.';
  if (failed) {
    const subject = `Band dues payment unsuccessful — East Forsyth Band Boosters (${receiptNumber})`;
    const text = [
      'East Forsyth Band Boosters — band dues payment receipt',
      '',
      'This message confirms that a band dues payment attempt was unsuccessful.',
      'No charge was completed for this attempt.',
      '',
      `Receipt number: ${receiptNumber}`,
      `Date: ${whenLabel}`,
      `Student name: ${studentName}`,
      `Email: ${email || '—'}`,
      `Amount attempted: ${amountDisplay}`,
      'Payment status: Failed',
      `Details: ${failure}`,
      '',
      'You can try again from the Band Boosters dues payment page.',
      '',
      'East Forsyth Band Boosters',
      'https://efhsband.org',
    ].join('\n');
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10233c;max-width:640px">
        <h1 style="font-size:22px;margin:0 0 12px">Band dues payment unsuccessful</h1>
        <p style="margin:0 0 14px">This message confirms that a band dues payment attempt was <strong>unsuccessful</strong>. No charge was completed for this attempt.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
          <tr><td style="padding:6px 0;color:#64748b">Receipt number</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(receiptNumber)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Date</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(whenLabel)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Student name</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(studentName)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(email || '—')}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Amount attempted</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(amountDisplay)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Payment status</td><td style="padding:6px 0;text-align:right"><strong>Failed</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Details</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(failure)}</strong></td></tr>
        </table>
        <p style="margin:0;color:#64748b;font-size:14px">East Forsyth Band Boosters · <a href="https://efhsband.org">efhsband.org</a></p>
      </div>
    `.trim();
    return {
      to: email,
      subject,
      text,
      html,
      receipt_number: receiptNumber,
      from_email: SPONSOR_INVOICE_FROM_EMAIL,
      from_name: SPONSOR_INVOICE_FROM_NAME,
    };
  }
  const subject = `Band dues payment receipt — East Forsyth Band Boosters (${receiptNumber})`;
  const text = [
    'Thank you for paying band dues to the East Forsyth Band Boosters.',
    '',
    'This receipt confirms your successful band dues payment.',
    '',
    `Receipt number: ${receiptNumber}`,
    `Date: ${whenLabel}`,
    `Student name: ${studentName}`,
    `Email: ${email || '—'}`,
    `Amount: ${amountDisplay}`,
    'Payment status: Paid',
    '',
    'East Forsyth Band Boosters',
    'East Forsyth High School Band',
    'https://efhsband.org',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10233c;max-width:640px">
      <h1 style="font-size:22px;margin:0 0 12px">Band dues payment receipt</h1>
      <p style="margin:0 0 14px">Thank you for paying band dues to the <strong>East Forsyth Band Boosters</strong>.</p>
      <p style="margin:0 0 18px">This receipt confirms your successful band dues payment.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
        <tr><td style="padding:6px 0;color:#64748b">Receipt number</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(receiptNumber)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Date</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(whenLabel)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Student name</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(studentName)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(email || '—')}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Amount</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(amountDisplay)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Payment status</td><td style="padding:6px 0;text-align:right"><strong>Paid</strong></td></tr>
      </table>
      <p style="margin:0;color:#64748b;font-size:14px">East Forsyth Band Boosters · <a href="https://efhsband.org">efhsband.org</a></p>
    </div>
  `.trim();
  return {
    to: email,
    subject,
    text,
    html,
    receipt_number: receiptNumber,
    from_email: SPONSOR_INVOICE_FROM_EMAIL,
    from_name: SPONSOR_INVOICE_FROM_NAME,
  };
}

export async function sendDuesReceipt(env, dues = {}, { failed = false } = {}) {
  const receipt = buildDuesReceipt(dues, { failed });
  if (!isValidEmail(receipt.to)) {
    return { ok: false, detail: 'Receipt email is missing or invalid' };
  }
  if (!env.RESEND_API_KEY) {
    return { ok: false, detail: 'Email delivery is not configured. Add RESEND_API_KEY in Cloudflare Pages secrets.' };
  }
  try {
    await sendViaResend(env, {
      to: receipt.to,
      subject: receipt.subject,
      text: receipt.text,
      html: receipt.html,
      fromEmail: SPONSOR_INVOICE_FROM_EMAIL,
      fromName: SPONSOR_INVOICE_FROM_NAME,
    });
    const id = Number(dues.id || 0);
    if (id) {
      const sentAt = new Date().toISOString();
      await env.DB.prepare(
        'UPDATE dues_payments SET receipt_sent_at = ?, updated_at = ? WHERE id = ?',
      ).bind(sentAt, sentAt, id).run();
    }
    return { ok: true, detail: 'Receipt emailed', receipt_number: receipt.receipt_number };
  } catch (error) {
    return { ok: false, detail: error?.message || 'Could not send receipt email' };
  }
}

export async function recordManualSponsorPaymentLedger(env, sponsor = {}, {
  amountCents = 0,
  amountDisplay = '',
  paidAt = '',
} = {}) {
  const id = Number(sponsor.id || 0);
  if (!id) return null;
  const address = formatSponsorAddress(sponsor) || [sponsor.address, sponsor.city, sponsor.state].filter(Boolean).join(', ');
  await upsertPaymentLedgerEntry(env, {
    kind: 'sponsor',
    refType: 'manual_sponsor',
    refId: id,
    name: sponsor.name || '',
    address,
    amountCents: amountCents || resolveSponsorAmountCents({ amountCents, amountDisplay }),
    amountDisplay,
    packageLabel: sponsor.level || sponsor.tier_label || 'Sponsor',
    paidAt: paidAt || new Date().toISOString(),
  });
  return refreshPaymentLedgerXml(env);
}

export async function loadPaymentLedgerRows(env) {
  const rows = await env.DB.prepare(
    `SELECT id, kind, ref_type, ref_id, name, address, amount_cents, amount_display, package, note, money_exchanged, paid_at, created_at
     FROM payment_ledger
     ORDER BY datetime(paid_at) DESC, id DESC`,
  ).all();
  const mapRow = (row) => {
    const kind = normalizeLedgerKind(row.kind) || String(row.kind || '');
    const cents = Math.abs(Math.round(Number(row.amount_cents) || 0));
    const signed = kind === 'expense' ? -cents : cents;
    return {
      id: Number(row.id || 0),
      kind,
      ref_type: String(row.ref_type || ''),
      ref_id: row.ref_id == null ? null : Number(row.ref_id),
      name: String(row.name || ''),
      address: String(row.address || ''),
      amount_cents: cents,
      amount_display: String(row.amount_display || formatLedgerAmountDisplay(signed)),
      package: String(row.package || ''),
      note: String(row.note || ''),
      money_exchanged: Number(row.money_exchanged) !== 0,
      paid_at: String(row.paid_at || ''),
      created_at: String(row.created_at || ''),
    };
  };
  const all = (rows.results || []).map(mapRow);
  return {
    entries: all,
    sponsors: all.filter((row) => row.kind === 'sponsor'),
    donors: all.filter((row) => row.kind === 'donor'),
    fundraisers: all.filter((row) => row.kind === 'fundraiser'),
    dues: all.filter((row) => row.kind === 'dues'),
    expenses: all.filter((row) => row.kind === 'expense'),
  };
}

export async function ensureDefaultInKindLedgerEntries(env) {
  await upsertPaymentLedgerEntry(env, {
    kind: 'sponsor',
    refType: 'in_kind',
    refId: 1,
    name: 'Nitrofire Computing LLC',
    address: '4526 Westhill Pl., Kernersville, NC 27284',
    amountCents: 826400,
    amountDisplay: '$8,264.00',
    packageLabel: 'In-kind donated services',
    note: 'Fair market value for donated services; no money exchanged.',
    moneyExchanged: false,
    paidAt: '2026-08-10T12:00:00.000Z',
  });
}

export async function refreshPaymentLedgerXml(env) {
  await ensureDefaultInKindLedgerEntries(env);
  const { entries } = await loadPaymentLedgerRows(env);
  const xml = buildPaymentLedgerXml({
    entries,
    generatedAt: new Date().toISOString(),
  });
  await setSiteContentValue(env, PAYMENT_LEDGER_XML_KEY, xml);
  return xml;
}

export async function buildPaymentLedgerExcelDownload(env) {
  await ensureDefaultInKindLedgerEntries(env);
  const { entries } = await loadPaymentLedgerRows(env);
  return buildPaymentLedgerExcelXml(entries, { generatedAt: new Date().toISOString() });
}

export async function backfillPaymentLedgerFromPaidRecords(env) {
  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM payment_ledger').first();
  if (Number(existing?.n || 0) > 0) return { imported: 0, skipped: true };
  let imported = 0;
  const apps = await env.DB.prepare(
    `SELECT id, tier, amount_cents, amount_display, business_name, address, paid_at, status
     FROM sponsor_applications
     WHERE status IN ('paid', 'paid_mock') OR paid_at IS NOT NULL`,
  ).all();
  for (const row of apps.results || []) {
    const tier = normalizeSponsorTierKey(row.tier) || String(row.tier || '').trim();
    await upsertPaymentLedgerEntry(env, {
      kind: 'sponsor',
      refType: 'application',
      refId: row.id,
      name: row.business_name || '',
      address: row.address || '',
      amountCents: row.amount_cents,
      amountDisplay: row.amount_display,
      packageLabel: sponsorLevelFromTierKey(tier) || (tier ? `${tier} Sponsor` : 'Sponsor'),
      paidAt: row.paid_at || new Date().toISOString(),
    });
    imported += 1;
  }
  const donations = await env.DB.prepare(
    `SELECT id, donor_name, amount_cents, amount_display, paid_at, status
     FROM donations
     WHERE status IN ('paid', 'paid_mock') OR paid_at IS NOT NULL`,
  ).all();
  for (const row of donations.results || []) {
    await upsertPaymentLedgerEntry(env, {
      kind: 'donor',
      refType: 'donation',
      refId: row.id,
      name: row.donor_name || '',
      address: '',
      amountCents: row.amount_cents,
      amountDisplay: row.amount_display,
      packageLabel: 'Donation',
      paidAt: row.paid_at || new Date().toISOString(),
    });
    imported += 1;
  }
  await refreshPaymentLedgerXml(env);
  return { imported, skipped: false };
}

export async function getPaymentLedgerXml(env, { rebuild = false } = {}) {
  await backfillPaymentLedgerFromPaidRecords(env);
  if (!rebuild) {
    const existing = await getSiteContentValue(env, PAYMENT_LEDGER_XML_KEY);
    if (existing && existing.includes('<payment_ledger')) return existing;
  }
  return refreshPaymentLedgerXml(env);
}

export async function activatePaidSponsorApplication(env, application, { mock = false } = {}) {
  const row = application || {};
  const id = Number(row.id || 0);
  if (!id) throw new Error('Application not found');
  if (row.sponsor_id) {
    const existing = await env.DB.prepare(
      'SELECT id, name, address, city, state, logo_url, level, mark_text, sort_order, active, homepage_ad FROM sponsors WHERE id = ?',
    ).bind(row.sponsor_id).first();
    if (existing) {
      return {
        application: row,
        sponsor: hydrateSponsor(existing),
        created: false,
        mock: Boolean(mock),
      };
    }
  }
  const level = sponsorLevelFromTierKey(row.tier);
  if (!level) throw new Error('Application package is invalid');
  const sponsor = normalizeSponsorPayload({
    name: row.business_name,
    address: row.address,
    logo_url: row.logo_url || '',
    level,
    active: 1,
  });
  if (!sponsor.name) throw new Error('Business name is required');
  if (sponsor._assign_sort_order) {
    const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM sponsors').first();
    sponsor.sort_order = Number(max?.max_order || 0) + 1;
  }
  const inserted = await env.DB.prepare(
    'INSERT INTO sponsors (name, address, city, state, logo_url, level, mark_text, sort_order, active, homepage_ad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    sponsor.name,
    sponsor.address,
    sponsor.city,
    sponsor.state,
    sponsor.logo_url,
    sponsor.level,
    sponsor.mark_text,
    sponsor.sort_order,
    sponsor.active,
    sponsor.homepage_ad,
  ).run();
  const sponsorId = inserted.meta.last_row_id;
  const paidAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE sponsor_applications
     SET status = ?, sponsor_id = ?, paid_at = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(mock ? 'paid_mock' : 'paid', sponsorId, paidAt, paidAt, id).run();
  const saved = await env.DB.prepare(
    'SELECT id, name, address, city, state, logo_url, level, mark_text, sort_order, active, homepage_ad FROM sponsors WHERE id = ?',
  ).bind(sponsorId).first();
  return {
    application: {
      ...row,
      status: mock ? 'paid_mock' : 'paid',
      sponsor_id: sponsorId,
      paid_at: paidAt,
    },
    sponsor: hydrateSponsor(saved),
    created: true,
    mock: Boolean(mock),
  };
}

export function normalizeSponsorPayload(payload = {}, existing = null) {
  const name = String(payload.name || existing?.name || '').trim();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word.match(/[a-z0-9]/i)?.[0]?.toUpperCase()).filter(Boolean).join('') || '★';
  const legacy = (!payload.city && !payload.state && payload.address && String(payload.address).includes(','))
    ? parseLegacySponsorAddress(payload.address)
    : null;
  const address = titleCaseAddressPart(String(payload.address ?? legacy?.address ?? existing?.address ?? '').trim());
  const city = titleCaseAddressPart(String(payload.city ?? legacy?.city ?? existing?.city ?? 'Kernersville').trim()) || 'Kernersville';
  const state = normalizeStateCode(payload.state ?? legacy?.state ?? existing?.state ?? 'NC');
  const hasSortOrder = payload.sort_order !== undefined && payload.sort_order !== null && payload.sort_order !== '';
  const level = normalizeSponsorLevel(payload.level ?? existing?.level, {
    homepageAd: payload.homepage_ad !== undefined ? payload.homepage_ad : existing?.homepage_ad,
  });
  const benefits = sponsorBenefitsFromLevel(level);
  return {
    name,
    address,
    city,
    state,
    logo_url: String(payload.logo_url ?? existing?.logo_url ?? '').trim(),
    level,
    mark_text: String(payload.mark_text ?? existing?.mark_text ?? initials).trim() || initials,
    sort_order: hasSortOrder ? Number(payload.sort_order) : Number(existing?.sort_order ?? 0),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
    homepage_ad: benefits.show_flyin ? 1 : 0,
    _assign_sort_order: !hasSortOrder && !existing,
  };
}

export function renderSponsorsDirectory(sponsors = []) {
  if (!sponsors.length) {
    return '<div class="sponsor-empty"><h3>Sponsor spots are available.</h3><p>Use the admin Sponsors page to add businesses, logos, and addresses.</p></div>';
  }
  return sponsors.map((sponsor, index) => {
    const item = hydrateSponsor(sponsor);
    const featured = index === 0 ? ' sponsor-featured' : '';
    const logo = item.logo_url
      ? `<span class="sponsor-logo"><img src="${escapeAttr(item.logo_url)}" alt="${escapeAttr(item.name)} logo"></span>`
      : `<span class="sponsor-mark">${escapeHtml(item.mark_text || '★')}</span>`;
    const formatted = item.formatted_address;
    const hasMap = Boolean(formatted);
    const tier = item.tier || normalizeSponsorTier(item.level) || 'bronze';
    return `<article class="sponsor-card${featured}${hasMap ? ' sponsor-card-clickable' : ''}" data-sponsor-id="${escapeAttr(item.id || '')}"${hasMap ? ` data-sponsor-card data-sponsor-name="${escapeAttr(item.name)}" data-sponsor-address="${escapeAttr(formatted)}" data-sponsor-map-embed="${escapeAttr(item.maps_embed_url)}" data-sponsor-map-directions="${escapeAttr(item.maps_directions_url)}" role="button" tabindex="0"` : ''}>${logo}<div><span class="sponsor-level sponsor-tier-badge tier-${escapeAttr(tier)}">${escapeHtml(item.tier_label || item.level || 'Sponsor')}</span><h3>${escapeHtml(item.name)}</h3>${formatted ? `<p class="sponsor-address">${escapeHtml(formatted)}</p>` : ''}${hasMap ? '<span class="sponsor-map-hint">View map &amp; directions</span>' : ''}</div></article>`;
  }).join('');
}

export function renderSponsorTiersHtml(payload = {}) {
  const fields = normalizeSponsorTierFields(payload);
  const card = (id, labelKey, titleKey, blurbKey, benefitsKey, amountKey) => {
    const benefits = sponsorTierBenefitsHtml(fields[benefitsKey], SPONSOR_TIER_FIELD_DEFAULTS[benefitsKey]);
    return `<article class="sponsor-tier sponsor-tier-${escapeAttr(id)}" data-tier="${escapeAttr(id)}">
      <span class="sponsor-tier-label" data-cms-field="${escapeAttr(labelKey)}">${formatInlineRichText(fields[labelKey])}</span>
      <h3 data-cms-field="${escapeAttr(titleKey)}">${formatInlineRichText(fields[titleKey])}</h3>
      <p data-cms-field="${escapeAttr(blurbKey)}">${formatInlineRichText(fields[blurbKey])}</p>
      <div data-cms-field="${escapeAttr(benefitsKey)}">${benefits}</div>
      <p class="sponsor-tier-amount" data-cms-field="${escapeAttr(amountKey)}">${formatInlineRichText(fields[amountKey])}</p>
    </article>`;
  };
  return `<section class="sponsor-tiers" data-sponsor-tiers aria-label="Sponsor packages">
    <div class="sponsor-tiers-head">
      <span class="kicker" data-cms-field="tiers_kicker">${formatInlineRichText(fields.tiers_kicker)}</span>
      <h2 data-cms-field="tiers_heading">${formatInlineRichText(fields.tiers_heading)}</h2>
      <p data-cms-field="tiers_intro">${formatInlineRichText(fields.tiers_intro)}</p>
    </div>
    <div class="sponsor-tiers-grid">
      ${card('bronze', 'bronze_label', 'bronze_title', 'bronze_blurb', 'bronze_benefits', 'bronze_amount')}
      ${card('silver', 'silver_label', 'silver_title', 'silver_blurb', 'silver_benefits', 'silver_amount')}
      ${card('gold', 'gold_label', 'gold_title', 'gold_blurb', 'gold_benefits', 'gold_amount')}
    </div>
  </section>`;
}

export function ensureSponsorTiersSection(html) {
  const source = String(html || '');
  if (/data-sponsor-tiers/i.test(source)) {
    // Rebuild from stored fields so new tier fields (like amounts) appear with defaults.
    const tiers = renderSponsorTiersHtml(extractSponsorTierFields(source));
    return source.replace(/<section\b[^>]*data-sponsor-tiers[^>]*>[\s\S]*?<\/section>/i, tiers);
  }
  const tiers = renderSponsorTiersHtml();
  if (/become-sponsor-panel|data-contact-form-slot/i.test(source)) {
    return source.replace(/(<div[^>]*(?:become-sponsor-panel|data-contact-form-slot)[^>]*>)/i, `${tiers}$1`);
  }
  return `${source}${tiers}`;
}

export function stripSponsorTiersSection(html) {
  return String(html || '').replace(/<section[^>]*data-sponsor-tiers[^>]*>[\s\S]*?<\/section>/gi, '');
}

export function rewriteBecomeSponsorLinks(html) {
  return String(html || '')
    .replace(/href=(["'])(?:\.\/)?(?:\/)?sponsors\.html#sponsor-packages\1/gi, 'href="/become-a-sponsor.html"')
    .replace(/href=(["'])(?:\.\/)?(?:\/)?contact\.html\1(?=[^>]*>\s*Become a sponsor)/gi, 'href="/become-a-sponsor.html"')
    .replace(/href=(["'])(?:\.\/)?(?:\/)?contact\.html\1(?=[^>]*>\s*Ask about sponsoring)/gi, 'href="/become-a-sponsor.html"')
    .replace(/href=(["'])(?:\.\/)?(?:\/)?sponsors\.html\1(?=[^>]*>\s*(?:Become a sponsor|Ask about sponsoring))/gi, 'href="/become-a-sponsor.html"');
}

export const SPONSOR_INTRO_ACTIONS_HTML = '<div class="sponsor-intro-actions"><a class="btn primary" href="/become-a-sponsor.html">Become a sponsor</a><button type="button" class="btn outline" data-donate-open>Donate</button></div>';

export function ensureSponsorDonateButton(html) {
  const source = String(html || '');
  if (!source.trim()) return source;
  if (/data-donate-open/i.test(source)) return source;
  if (/sponsor-intro-actions/i.test(source)) return source;
  // Wrap the primary Become a sponsor control in the intro with a Donate button.
  const wrapped = source.replace(
    /(<div[^>]*class="[^"]*\bsponsor-intro\b[^"]*"[^>]*>[\s\S]*?)(<a\b[^>]*class="[^"]*\bbtn primary\b[^"]*"[^>]*href="[^"]*become-a-sponsor\.html"[^>]*>\s*Become a sponsor\s*<\/a>)/i,
    `$1<div class="sponsor-intro-actions">$2<button type="button" class="btn outline" data-donate-open>Donate</button></div>`,
  );
  if (wrapped !== source) return wrapped;
  // Fallback: insert actions before the sponsor directory when intro link was already removed/customized.
  return source.replace(
    /(<div[^>]*class="[^"]*\bsponsor-intro\b[^"]*"[^>]*>[\s\S]*?)(<\/div>\s*<div[^>]*class="[^"]*\bsponsor-directory)/i,
    `$1${SPONSOR_INTRO_ACTIONS_HTML}$2`,
  );
}

function renderSponsorPageBody(page, sponsors) {
  const directory = `<div class="sponsor-directory" data-sponsors>${renderSponsorsDirectory(sponsors)}</div>`;
  let html = ensureSponsorDonateButton(rewriteBecomeSponsorLinks(stripSponsorTiersSection(page.body_html || '')));
  if (html.includes('data-sponsors')) {
    return replaceMarkedDirectory(html, 'data-sponsors', directory) || `${html}${directory}`;
  }
  if (html.includes('class="sponsor-directory"')) {
    return html.replace(/<div class=\"sponsor-directory\">[\s\S]*?<\/div><aside class=\"sponsor-cta\">/, `${directory}<aside class="sponsor-cta">`);
  }
  return `<section class="page-hero sponsor-hero" data-cms-layout="sponsors"><div class="page-title"><div class="kicker" data-cms-field="kicker">Community Partners</div><h1 data-cms-field="heading">${escapeHtml(page.title || 'Sponsors')}</h1><p data-cms-field="intro">Local businesses, alumni, and families make opportunities possible for every East Forsyth Band student.</p></div></section><section class="content sponsor-content"><div class="wrap"><div class="sponsor-intro"><div data-cms-field="body_text"><div class="kicker">Thank you</div><h2>Community support takes center stage.</h2><p>Our sponsors help provide instruments, instruction, travel, meals, uniforms, and unforgettable performance opportunities.</p></div>${SPONSOR_INTRO_ACTIONS_HTML}</div>${directory}<aside class="sponsor-cta" data-cms-block="callout"><div><span class="sponsor-level">Sponsor opportunities</span><h2 data-cms-field="callout_title">Want your business here?</h2><div data-cms-field="callout_text"><p>Review Bronze, Silver, and Gold packages, then send a sponsor inquiry.</p></div></div><a class="btn secondary" href="/become-a-sponsor.html">Become a sponsor</a></aside></div></section>`;
}

function renderBecomeSponsorPageBody(page) {
  const form = '<div data-contact-form-slot></div>';
  let html = ensureSponsorTiersSection(page.body_html || '');
  if (!html.trim()) {
    return `<section class="page-hero sponsor-hero" data-cms-layout="become-sponsor"><div class="page-title"><div class="kicker" data-cms-field="kicker">Support</div><h1 data-cms-field="heading">${escapeHtml(page.title || 'Become a Sponsor')}</h1><p data-cms-field="intro">Choose a package and tell us how you would like to support East Forsyth Band.</p></div></section><section class="content sponsor-content"><div class="wrap">${renderSponsorTiersHtml()}<div class="become-sponsor-panel grid two"><article class="card" data-cms-field="body_text"><span class="tag">Next step</span><h3>Ready to partner with Eagle Pride?</h3><p>Pick Bronze, Silver, or Gold above, then send a sponsor inquiry.</p></article>${form}</div></div></section>`;
  }
  if (html.includes('data-contact-form-slot')) {
    html = html.replace(/<div[^>]*data-contact-form-slot[^>]*>[\s\S]*?<\/div>/i, form);
  } else if (/become-sponsor-panel/i.test(html)) {
    html = html.replace(/(<div[^>]*become-sponsor-panel[^>]*>)([\s\S]*?)(<\/div>\s*<\/div>\s*<\/section>)/i, `$1$2${form}$3`);
  } else {
    html = `${html}<div class="become-sponsor-panel grid two">${form}</div>`;
  }
  return html;
}

async function getStaff(env, includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const rows = await env.DB.prepare(`SELECT id, name, role, bio, photo_url, sort_order, active FROM staff_members ${where} ORDER BY sort_order, id`).all();
  return rows.results || [];
}

export function normalizeStaffPayload(payload = {}, existing = null) {
  const hasSortOrder = Object.prototype.hasOwnProperty.call(payload, 'sort_order')
    && payload.sort_order !== ''
    && payload.sort_order !== null
    && payload.sort_order !== undefined;
  const roleRaw = String(payload.role ?? existing?.role ?? '').trim();
  const bioRaw = String(payload.bio ?? existing?.bio ?? '').trim();
  return {
    name: String(payload.name || existing?.name || '').trim(),
    role: roleRaw ? (looksLikeInlineRichHtml(roleRaw) ? sanitizeInlineRichHtml(roleRaw) : roleRaw) : '',
    bio: bioRaw ? (looksLikeHtml(bioRaw) ? sanitizeRichHtml(bioRaw) : bioRaw) : '',
    photo_url: String(payload.photo_url ?? existing?.photo_url ?? '').trim(),
    sort_order: hasSortOrder ? Number(payload.sort_order) : Number(existing?.sort_order ?? 0),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
    _assign_sort_order: !hasSortOrder && !existing,
  };
}

export function normalizeStaffReorderIds(payload = {}) {
  const raw = Array.isArray(payload.ids) ? payload.ids : [];
  return [...new Set(raw.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

export function renderStaffDirectory(staff = []) {
  if (!staff.length) {
    return '<div class="staff-empty"><h3>No staff listed yet.</h3><p>Use the admin Directors &amp; Staff page to add photos, names, and roles.</p></div>';
  }
  return staff.map((member) => {
    const photo = member.photo_url
      ? `<div class="avatar"><img src="${escapeAttr(member.photo_url)}" alt="${escapeAttr(member.name)}"></div>`
      : '<div class="avatar" aria-hidden="true"></div>';
    const role = member.role ? `<p class="person-role">${formatInlineRichText(member.role)}</p>` : '';
    const bio = member.bio ? `<div class="person-bio">${formatRichText(member.bio)}</div>` : '';
    return `<article class="person" data-staff-id="${escapeAttr(member.id || '')}">${photo}<div class="person-copy"><h3>${escapeHtml(member.name)}</h3>${role}${bio}</div></article>`;
  }).join('');
}

function replaceMarkedDirectory(html, markerAttr, replacement) {
  const pattern = new RegExp(`<div\\b[^>]*\\b${markerAttr}\\b[^>]*>`, 'i');
  const match = pattern.exec(html);
  if (!match) return null;
  const start = match.index;
  let index = start + match[0].length;
  let depth = 1;
  while (index < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', index);
    const nextClose = html.indexOf('</div>', index);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      index = nextOpen + 4;
      continue;
    }
    depth -= 1;
    index = nextClose + 6;
    if (depth === 0) {
      return `${html.slice(0, start)}${replacement}${html.slice(index)}`;
    }
  }
  return null;
}

function renderDirectorsPageBody(page, staff) {
  const directory = `<div class="directory" data-staff>${renderStaffDirectory(staff)}</div>`;
  const html = page.body_html || '';
  if (html.includes('data-staff')) {
    return replaceMarkedDirectory(html, 'data-staff', directory) || `${html}${directory}`;
  }
  return `<section class="page-hero" data-cms-layout="directory"><div class="page-title"><div class="kicker" data-cms-field="kicker">People</div><h1 data-cms-field="heading">${escapeHtml(page.title || 'Directors & Staff')}</h1><p data-cms-field="intro">Meet the directors and staff who lead the East Forsyth Band program.</p></div></section><section class="content"><div class="wrap"><div class="card" data-cms-field="body_text"><p>Add a short welcome note for families here.</p></div>${directory}</div></section>`;
}

async function getBoosterMembers(env, includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const rows = await env.DB.prepare(`SELECT id, name, role, bio, photo_url, sort_order, active FROM booster_members ${where} ORDER BY sort_order, id`).all();
  return rows.results || [];
}

export function normalizeBoosterMemberPayload(payload = {}, existing = null) {
  return normalizeStaffPayload(payload, existing);
}

export function normalizeBoosterMemberReorderIds(payload = {}) {
  return normalizeStaffReorderIds(payload);
}

export function renderBoosterMembersDirectory(members = []) {
  if (!members.length) {
    return '<div class="staff-empty"><h3>No booster members listed yet.</h3><p>Use the admin Booster Members page to add photos, names, and roles.</p></div>';
  }
  return members.map((member) => {
    const photo = member.photo_url
      ? `<div class="avatar"><img src="${escapeAttr(member.photo_url)}" alt="${escapeAttr(member.name)}"></div>`
      : '<div class="avatar" aria-hidden="true"></div>';
    const role = member.role ? `<p class="person-role">${formatInlineRichText(member.role)}</p>` : '';
    const bio = member.bio ? `<div class="person-bio">${formatRichText(member.bio)}</div>` : '';
    return `<article class="person" data-booster-member-id="${escapeAttr(member.id || '')}">${photo}<div class="person-copy"><h3>${escapeHtml(member.name)}</h3>${role}${bio}</div></article>`;
  }).join('');
}

function renderBoostersPageBody(page, boosterMembers = [], { duesEnabled = true } = {}) {
  let html = ensureBoosterMeetingsSlot(page.body_html || '');
  html = ensureBoosterMembersSlot(html);
  html = applyBoostersDuesVisibility(html, duesEnabled);
  const directory = `<div class="directory" data-booster-members>${renderBoosterMembersDirectory(boosterMembers)}</div>`;
  return replaceMarkedDirectory(html, 'data-booster-members', directory) || `${html}${directory}`;
}


export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function parseRecipientUserIds(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw || '[]');
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const ids = [];
  for (const item of raw) {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function normalizeContactTopicPayload(payload = {}, existing = null) {
  const label = String(payload.label ?? existing?.label ?? '').trim();
  const hasRecipientField = Object.prototype.hasOwnProperty.call(payload, 'recipient_user_ids')
    || Object.prototype.hasOwnProperty.call(payload, 'recipient_ids')
    || Object.prototype.hasOwnProperty.call(payload, 'recipients');
  const recipientSource = hasRecipientField
    ? (payload.recipient_user_ids ?? payload.recipient_ids ?? payload.recipients)
    : (existing?.recipient_user_ids ?? []);
  const recipient_user_ids = parseRecipientUserIds(recipientSource);
  // Keep email only as a derived/cache field for message history display.
  const email = String(payload.email ?? existing?.email ?? '').trim().toLowerCase();
  return {
    label,
    email,
    recipient_user_ids,
    // Topics are displayed A–Z by label; sort_order is unused in the UI.
    sort_order: 0,
    active: payload.active === false || payload.active === 0 ? 0 : 1,
  };
}

export function formatContactRecipientLabel(user = {}) {
  const name = String(user.display_name || '').trim();
  const email = String(user.email || user.username || '').trim().toLowerCase();
  if (name && email) return `${name} <${email}>`;
  return name || email || 'Unknown user';
}

export function contactTopicHasRecipients(topic = {}) {
  const ids = parseRecipientUserIds(topic.recipient_user_ids);
  if (ids.length) return true;
  const emails = String(topic.email || '')
    .split(/[,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => isValidEmail(value));
  return emails.length > 0;
}

async function listContactRecipientUsers(env, { activeOnly = true } = {}) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  const rows = await env.DB.prepare(
    `SELECT id, username, display_name, role, active FROM users ${where} ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE, id`,
  ).all();
  return (rows.results || [])
    .map((user) => {
      const email = String(user.username || '').trim().toLowerCase();
      return {
        id: Number(user.id),
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        active: Number(user.active) === 1,
        email,
        can_email: isValidEmail(email),
      };
    })
    .filter((user) => user.can_email);
}

async function resolveContactTopicRecipients(env, topic = {}, users = null) {
  const catalog = users || await listContactRecipientUsers(env, { activeOnly: false });
  const byId = new Map(catalog.map((user) => [user.id, user]));
  const ids = parseRecipientUserIds(topic.recipient_user_ids);
  const recipients = [];
  const emails = [];
  const seen = new Set();
  for (const id of ids) {
    const user = byId.get(id);
    if (!user || !user.active || !user.can_email) continue;
    if (seen.has(user.email)) continue;
    seen.add(user.email);
    recipients.push(user);
    emails.push(user.email);
  }
  // Legacy fallback: free-form email(s) until topics are remapped to CMS users.
  if (!emails.length) {
    for (const email of String(topic.email || '').split(/[,;]+/).map((value) => value.trim().toLowerCase())) {
      if (!isValidEmail(email) || seen.has(email)) continue;
      seen.add(email);
      emails.push(email);
      const matched = catalog.find((user) => user.email === email);
      recipients.push(matched || {
        id: null,
        username: email,
        display_name: email,
        email,
        can_email: true,
        active: true,
        legacy: true,
      });
    }
  }
  return { recipients, emails, recipient_user_ids: recipients.map((user) => user.id).filter(Boolean) };
}

export function serializeContactTopic(row = {}, recipientInfo = null) {
  const recipient_user_ids = parseRecipientUserIds(row.recipient_user_ids);
  const emails = recipientInfo?.emails
    || String(row.email || '').split(/[,;]+/).map((value) => value.trim().toLowerCase()).filter((value) => isValidEmail(value));
  const recipients = recipientInfo?.recipients || [];
  return {
    id: row.id,
    label: row.label,
    email: emails.join(', '),
    emails,
    recipient_user_ids: recipientInfo?.recipient_user_ids || recipient_user_ids,
    recipients: recipients.map((user) => ({
      id: user.id,
      display_name: user.display_name,
      username: user.username,
      email: user.email,
      legacy: Boolean(user.legacy),
    })),
    sort_order: Number(row.sort_order) || 0,
    active: Number(row.active) === 1 ? 1 : 0,
  };
}

async function migrateContactTopicRecipients(env) {
  const rows = await env.DB.prepare('SELECT id, email, recipient_user_ids FROM contact_topics').all().catch(() => ({ results: [] }));
  const users = await listContactRecipientUsers(env, { activeOnly: false });
  const byEmail = new Map(users.map((user) => [user.email, user.id]));
  for (const row of rows.results || []) {
    const existingIds = parseRecipientUserIds(row.recipient_user_ids);
    if (existingIds.length) continue;
    const matched = [];
    const seen = new Set();
    for (const email of String(row.email || '').split(/[,;]+/).map((value) => value.trim().toLowerCase())) {
      const id = byEmail.get(email);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      matched.push(id);
    }
    if (!matched.length) continue;
    await env.DB.prepare('UPDATE contact_topics SET recipient_user_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(JSON.stringify(matched), row.id)
      .run();
  }
}

async function getContactTopics(env, includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const rows = await env.DB.prepare(
    `SELECT id, label, email, recipient_user_ids, sort_order, active FROM contact_topics ${where} ORDER BY label COLLATE NOCASE, id`,
  ).all();
  const users = await listContactRecipientUsers(env, { activeOnly: false });
  return (rows.results || []).map((row) => serializeContactTopic(row, resolveContactTopicRecipientsSync(row, users)));
}

function resolveContactTopicRecipientsSync(topic = {}, users = []) {
  // Sync helper used when the user catalog is already loaded.
  const byId = new Map(users.map((user) => [user.id, user]));
  const ids = parseRecipientUserIds(topic.recipient_user_ids);
  const recipients = [];
  const emails = [];
  const seen = new Set();
  for (const id of ids) {
    const user = byId.get(id);
    if (!user || !user.active || !user.can_email) continue;
    if (seen.has(user.email)) continue;
    seen.add(user.email);
    recipients.push(user);
    emails.push(user.email);
  }
  if (!emails.length) {
    for (const email of String(topic.email || '').split(/[,;]+/).map((value) => value.trim().toLowerCase())) {
      if (!isValidEmail(email) || seen.has(email)) continue;
      seen.add(email);
      emails.push(email);
      const matched = users.find((user) => user.email === email);
      recipients.push(matched || {
        id: null,
        username: email,
        display_name: email,
        email,
        can_email: true,
        active: true,
        legacy: true,
      });
    }
  }
  return { recipients, emails, recipient_user_ids: recipients.map((user) => user.id).filter(Boolean) };
}

export function renderContactForm(topics = []) {
  const options = topics.length
    ? topics.map((topic) => `<option value="${escapeAttr(topic.id)}">${escapeHtml(topic.label)}</option>`).join('')
    : '<option value="" disabled selected>Contact topics coming soon</option>';
  const disabled = topics.length ? '' : ' disabled';
  return `<form class="card contact-form" data-contact-form novalidate>
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
</form>`;
}

function renderContactPageBody(page) {
  const form = '<div data-contact-form-slot></div>';
  const html = page.body_html || '';
  if (!html.trim()) {
    return `<section class="page-hero" data-cms-layout="contact"><div class="page-title"><div class="kicker" data-cms-field="kicker">Connect</div><h1 data-cms-field="heading">${escapeHtml(page.title || 'Contact')}</h1><p data-cms-field="intro">Use this page for director contact information, booster questions, sponsor inquiries, and student/family support.</p></div></section><section class="content soft"><div class="wrap grid two"><article class="card" data-cms-field="body_text"><span class="tag">East Forsyth Band</span><h3>East Forsyth High School</h3><p><strong>Phone:</strong><br>(336) 703-6735</p><p><strong>Mailing Address:</strong><br>East Forsyth High School<br>2500 W Mountain Street<br>Kernersville, NC 27284</p><p><strong>Response Expectations:</strong><br>General inquiries should be directed to the main office during regular school hours (8:00 AM–4:00 PM). Allow reasonable time for staff response, as requests may need to be routed to the appropriate department, administrator, counselor, or staff member.</p><p style="margin-top:14px"><a class="btn outline" href="https://www.wsfcs.k12.nc.us/o/efhs">Visit EFHS Website</a></p></article>${form}</div></section>`;
  }
  let next = html;
  if (next.includes('data-contact-form-slot')) {
    next = next.replace(/<div[^>]*data-contact-form-slot[^>]*>[\s\S]*?<\/div>/i, form);
  } else if (/data-contact-form/.test(next)) {
    next = next.replace(/<form[^>]*data-contact-form[^>]*>[\s\S]*?<\/form>/i, form)
      .replace(/<div[^>]*data-contact-form[^>]*>[\s\S]*?<\/div>/i, form);
  } else if (/<form[\s\S]*?<\/form>/i.test(next)) {
    next = next.replace(/<form[\s\S]*?<\/form>/i, form);
  } else if (next.includes('grid two')) {
    next = next.replace(/(<div class="wrap grid two">)([\s\S]*?)(<\/div>\s*<\/section>)/i, `$1$2${form}$3`);
  } else {
    next = `${next}${form}`;
  }
  return next;
}

export function resolveContactEmailProvider(env = {}) {
  if (env.RESEND_API_KEY) return 'resend';
  if (env.MAILCHANNELS_API_KEY) return 'mailchannels';
  const forced = String(env.CONTACT_EMAIL_PROVIDER || '').trim().toLowerCase();
  if (forced === 'formsubmit') return 'formsubmit';
  if (forced === 'none' || forced === '') return 'none';
  return forced;
}

export function describeContactEmailProvider(provider) {
  if (provider === 'resend') return { provider, configured: true, detail: 'Delivering with Resend.' };
  if (provider === 'mailchannels') return { provider, configured: true, detail: 'Delivering with Mailchannels.' };
  if (provider === 'formsubmit') {
    return {
      provider,
      configured: true,
      detail: 'Delivering with FormSubmit. The first message to a new topic email may require one-time inbox activation.',
    };
  }
  return {
    provider: provider || 'none',
    configured: false,
    detail: 'No email provider configured. Messages are saved below. Add a Cloudflare Pages secret named RESEND_API_KEY (from resend.com), then redeploy.',
  };
}

async function sendViaResend(env, { to, replyTo, subject, text, html, fromEmail, fromName, attachments }) {
  const recipients = (Array.isArray(to) ? to : [to]).map((value) => String(value || '').trim()).filter(Boolean);
  const payload = {
    from: `${fromName} <${fromEmail}>`,
    to: recipients,
    reply_to: replyTo || undefined,
    subject,
    text,
  };
  if (html) payload.html = html;
  if (Array.isArray(attachments) && attachments.length) {
    payload.attachments = attachments.map((file) => ({
      filename: file.filename,
      content: file.content,
      content_type: file.content_type || undefined,
    }));
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    if (/domain is not verified/i.test(body)) {
      throw new Error('Resend domain not verified. Add/verify efhsband.org at https://resend.com/domains (DNS records), then retry.');
    }
    throw new Error(`Resend error: ${body}`);
  }
  return { provider: 'resend' };
}

export function htmlToPlainText(html) {
  return decodeBasicHtmlEntities(
    String(html || '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*p\s*>/gi, '\n\n')
      .replace(/<\/\s*li\s*>/gi, '\n')
      .replace(/<\/\s*h[1-6]\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extensionOfFilename(filename) {
  const name = String(filename || '').trim().toLowerCase();
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx) : '';
}

export async function normalizeMailAttachments(files = []) {
  const list = Array.isArray(files) ? files : [];
  if (list.length > MAIL_ATTACHMENT_MAX_FILES) {
    throw new Error(`You can attach up to ${MAIL_ATTACHMENT_MAX_FILES} files.`);
  }
  let total = 0;
  const attachments = [];
  for (const file of list) {
    if (!file || typeof file.arrayBuffer !== 'function') continue;
    const filename = String(file.name || 'attachment').trim() || 'attachment';
    const ext = extensionOfFilename(filename);
    if (!MAIL_ATTACHMENT_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported attachment type for ${filename}. Allowed: PDF, Office, images, TXT, CSV, ZIP.`);
    }
    const size = Number(file.size || 0);
    if (size <= 0) throw new Error(`Attachment ${filename} is empty.`);
    if (size > MAIL_ATTACHMENT_MAX_BYTES) {
      throw new Error(`Attachment ${filename} exceeds the 4 MB limit.`);
    }
    total += size;
    if (total > MAIL_ATTACHMENT_TOTAL_BYTES) {
      throw new Error('Attachments exceed the 10 MB total limit.');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    attachments.push({
      filename,
      content: btoa(binary),
      content_type: String(file.type || '').trim() || undefined,
      size,
    });
  }
  return attachments;
}

export function normalizeAdminMailPayload({ subject, html, userIds } = {}) {
  const cleanSubject = String(subject || '').trim();
  const cleanHtml = sanitizeRichHtml(html || '');
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))];
  return {
    subject: cleanSubject,
    html: cleanHtml,
    text: htmlToPlainText(cleanHtml),
    user_ids: ids,
  };
}

async function parseAdminMailRequest(request) {
  const contentType = String(request.headers.get('content-type') || '');
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const userIds = form.getAll('user_ids')
      .flatMap((value) => String(value || '').split(/[,\s]+/))
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    const files = form.getAll('attachments').filter((file) => file && typeof file.arrayBuffer === 'function' && Number(file.size || 0) > 0);
    return {
      ...normalizeAdminMailPayload({
        subject: form.get('subject'),
        html: form.get('html'),
        userIds,
      }),
      attachments: await normalizeMailAttachments(files),
    };
  }
  const payload = await request.json();
  return {
    ...normalizeAdminMailPayload({
      subject: payload.subject,
      html: payload.html || payload.body_html || payload.message,
      userIds: payload.user_ids || payload.userIds || [],
    }),
    attachments: [],
  };
}

export function resolveAdminMailSender(user = {}) {
  const replyTo = String(user?.username || '').trim().toLowerCase();
  if (!isValidEmail(replyTo)) {
    return {
      ok: false,
      detail: 'Your account username must be a valid email address so replies can go back to you. Update it in User Management, then try again.',
    };
  }
  const displayName = String(user?.display_name || '').trim();
  return {
    ok: true,
    replyTo,
    fromName: displayName || replyTo,
  };
}

async function sendAdminUserMail(env, { to, replyTo, subject, html, text, attachments, fromName }) {
  const fromEmail = String(env.CONTACT_FROM_EMAIL || SPONSOR_INVOICE_FROM_EMAIL).trim();
  const senderName = String(fromName || env.CONTACT_FROM_NAME || SPONSOR_INVOICE_FROM_NAME).trim();
  if (!isValidEmail(to)) throw new Error('Recipient email is invalid');
  if (!env.RESEND_API_KEY) throw new Error('Email delivery is not configured. Add RESEND_API_KEY in Cloudflare Pages secrets.');
  if (!isValidEmail(fromEmail)) throw new Error('CONTACT_FROM_EMAIL must be a valid sender address on your Resend domain');
  if (!isValidEmail(replyTo)) throw new Error('Sender Reply-To email is required');
  return sendViaResend(env, {
    to,
    replyTo,
    subject,
    html,
    text,
    fromEmail,
    fromName: senderName,
    attachments,
  });
}

async function sendViaMailchannels(env, { to, replyTo, subject, text, fromEmail, fromName }) {
  const recipients = (Array.isArray(to) ? to : [to])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => isValidEmail(value));
  if (!recipients.length) throw new Error('Mailchannels recipient email is invalid');
  const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Api-Key': String(env.MAILCHANNELS_API_KEY),
    },
    body: JSON.stringify({
      personalizations: [{
        to: recipients.map((email) => ({ email })),
        ...(replyTo ? { reply_to: [{ email: replyTo }] } : {}),
      }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: 'text/plain', value: text }],
    }),
  });
  if (!response.ok) throw new Error(`Mailchannels error: ${await response.text()}`);
  return { provider: 'mailchannels' };
}

async function sendViaFormSubmit({ to, replyTo, subject, text, name }) {
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      name: name || 'Website visitor',
      email: replyTo || SPONSOR_INVOICE_FROM_EMAIL,
      _subject: subject,
      message: text,
      _template: 'table',
      _captcha: 'false',
    }),
  });
  const bodyText = await response.text();
  let payload = {};
  try { payload = JSON.parse(bodyText); } catch { payload = { message: bodyText }; }
  if (!response.ok) {
    throw new Error(`FormSubmit error: ${payload.message || bodyText || response.status}`);
  }
  const message = String(payload.message || bodyText || '');
  if (/activate|confirm|check your email/i.test(message)) {
    throw new Error(`FormSubmit activation required for ${to}. Check that inbox for a one-time activation link, then submit again.`);
  }
  return { provider: 'formsubmit', detail: message };
}

async function sendContactEmail(env, { to, replyTo, subject, text, name }) {
  const fromEmail = String(env.CONTACT_FROM_EMAIL || SPONSOR_INVOICE_FROM_EMAIL).trim();
  const fromName = String(env.CONTACT_FROM_NAME || SPONSOR_INVOICE_FROM_NAME).trim();
  const recipients = (Array.isArray(to) ? to : String(to || '').split(/[,;]+/))
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value, index, list) => isValidEmail(value) && list.indexOf(value) === index);
  if (!recipients.length) throw new Error('Topic recipient email is invalid');

  const provider = resolveContactEmailProvider(env);
  if (provider === 'resend') {
    if (!isValidEmail(fromEmail)) throw new Error('CONTACT_FROM_EMAIL must be a valid sender address on your Resend domain');
    return sendViaResend(env, { to: recipients, replyTo, subject, text, fromEmail, fromName });
  }
  if (provider === 'mailchannels') {
    if (!isValidEmail(fromEmail)) throw new Error('CONTACT_FROM_EMAIL must be a valid sender address');
    return sendViaMailchannels(env, { to: recipients, replyTo, subject, text, fromEmail, fromName });
  }
  if (provider === 'formsubmit') {
    // FormSubmit accepts one inbox per request; fan out for multi-recipient topics.
    for (const recipient of recipients) {
      await sendViaFormSubmit({ to: recipient, replyTo, subject, text, name });
    }
    return { provider: 'formsubmit' };
  }
  throw new Error('Email delivery is not configured. Add RESEND_API_KEY in Cloudflare Pages secrets.');
}

export function sanitizePageSectionHtml(dirty = '') {
  return String(dirty || '')
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

export function extractEnsemblesBodyHtml(pageHtml = '') {
  const source = String(pageHtml || '');
  const marked = source.match(/<section\b[^>]*data-ensembles-body[^>]*>([\s\S]*?)<\/section>/i);
  if (marked) {
    const wrap = marked[1].match(/<div\b[^>]*class="[^"]*\bwrap\b[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/i);
    return (wrap ? wrap[1] : marked[1]).trim();
  }
  const content = source.match(/<section\b[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
  if (content) {
    const wrap = content[1].match(/<div\b[^>]*class="[^"]*\bwrap\b[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/i);
    return (wrap ? wrap[1] : content[1]).trim();
  }
  return source.replace(/<section\b[^>]*class="[^"]*\bpage-hero\b[\s\S]*?<\/section>/i, '').trim();
}

export function applyEnsemblesBodyHtml(pageHtml = '', bodyInnerHtml = '') {
  const cleanInner = sanitizePageSectionHtml(bodyInnerHtml);
  const wrapped = `<section class="content" data-ensembles-body><div class="wrap">${cleanInner}</div></section>`;
  const source = String(pageHtml || '');
  if (/data-ensembles-body/i.test(source)) {
    return source.replace(/<section\b[^>]*data-ensembles-body[^>]*>[\s\S]*?<\/section>/i, wrapped);
  }
  if (/<section\b[^>]*class="[^"]*\bcontent\b/i.test(source)) {
    return source.replace(/<section\b[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>[\s\S]*?<\/section>/i, wrapped);
  }
  const hero = source.match(/<section\b[^>]*class="[^"]*\bpage-hero\b[\s\S]*?<\/section>/i);
  if (hero) {
    const withoutHero = source.replace(hero[0], '').trim();
    return withoutHero ? `${hero[0]}${wrapped}${withoutHero}` : `${hero[0]}${wrapped}`;
  }
  return source ? `${source}${wrapped}` : wrapped;
}

function renderPageBody(page, sponsors = [], staff = [], boosterMembers = [], site = null) {
  if (page.slug === 'sponsors') return renderSponsorPageBody(page, sponsors);
  if (page.slug === 'become-a-sponsor') return renderBecomeSponsorPageBody(page);
  if (page.slug === 'directors') return renderDirectorsPageBody(page, staff);
  if (page.slug === 'contact') return renderContactPageBody(page);
  if (page.slug === 'boosters') {
    return renderBoostersPageBody(page, boosterMembers, {
      duesEnabled: isBoostersDuesEnabled(site || {}),
    });
  }
  if (page.slug === 'fundraising') {
    return ensureEmailListSignupSlot(ensureFundraisingDonateSlot(page.body_html), {
      topics: ['fundraising', 'calendar'],
      heading: 'Email fundraising updates',
      detail: 'Get campaign notes by email. Reply STOP to any message to unsubscribe.',
    });
  }
  if (page.slug === 'calendar') {
    return ensureEmailListSignupSlot(ensureCalendarMonthMount(page.body_html), {
      topics: ['calendar', 'fundraising'],
      heading: 'Email calendar updates',
      detail: 'Get calendar changes by email. Reply STOP to any message to unsubscribe.',
    });
  }
  if (page.slug === 'gallery') return ensureGalleryPageSlot(page.body_html);
  if (page.slug === 'home' || page.is_home) return ensureHomePhotoGallerySlot(refreshHomeHeroBrandMark(page.body_html));
  return page.body_html;
}

async function getPhotos(env) {
  // Gallery listing only: staff/logo utility uploads use negative sort_order and stay hidden here.
  // Manual drag order uses sort_order; created_at breaks ties for older rows still at 0.
  const rows = await env.DB.prepare(
    'SELECT id, filename, original_name, alt_text, caption, sort_order, created_at FROM photos WHERE sort_order >= 0 ORDER BY sort_order ASC, datetime(created_at) DESC, id DESC',
  ).all();
  return (rows.results || []).map((photo) => ({ ...photo, url: `/uploads/${encodeURIComponent(photo.filename)}` }));
}

async function nextGalleryPhotoSortOrder(env) {
  const max = await env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM photos WHERE sort_order >= 0',
  ).first();
  return Number(max?.max_order || 0) + 1;
}

export function normalizePhotoMetaPayload(payload = {}, existing = null) {
  const altRaw = payload.alt_text !== undefined ? payload.alt_text : existing?.alt_text;
  const captionRaw = payload.caption !== undefined ? payload.caption : existing?.caption;
  const alt_text = String(altRaw || '').trim();
  const captionSource = String(captionRaw || '').trim();
  const caption = captionSource
    ? (looksLikeInlineRichHtml(captionSource) ? sanitizeInlineRichHtml(captionSource) : captionSource)
    : '';
  return { alt_text, caption };
}

async function photoUsageLabels(env, filename) {
  const plain = `/uploads/${filename}`;
  const encoded = `/uploads/${encodeURIComponent(filename)}`;
  const [staff, boosterMembers, sponsors, logo] = await Promise.all([
    env.DB.prepare('SELECT name FROM staff_members WHERE photo_url = ? OR photo_url = ?').bind(plain, encoded).all(),
    env.DB.prepare('SELECT name FROM booster_members WHERE photo_url = ? OR photo_url = ?').bind(plain, encoded).all(),
    env.DB.prepare('SELECT name FROM sponsors WHERE logo_url = ? OR logo_url = ?').bind(plain, encoded).all(),
    env.DB.prepare("SELECT value FROM site_content WHERE key = 'logo_url' AND (value = ? OR value = ?)").bind(plain, encoded).first(),
  ]);
  const labels = [];
  for (const row of staff.results || []) labels.push(`staff photo for ${row.name}`);
  for (const row of boosterMembers.results || []) labels.push(`booster member photo for ${row.name}`);
  for (const row of sponsors.results || []) labels.push(`sponsor logo for ${row.name}`);
  if (logo) labels.push('the site logo');
  return labels;
}

async function getPages(env, includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const rows = await env.DB.prepare(`SELECT id, slug, path, title, body_html, nav_order, is_home, active, updated_at FROM cms_pages ${where} ORDER BY nav_order, id`).all();
  return rows.results || [];
}

async function getPageBySlug(env, slug, includeInactive = false) {
  const sql = includeInactive ? 'SELECT * FROM cms_pages WHERE slug = ?' : 'SELECT * FROM cms_pages WHERE slug = ? AND active = 1';
  return env.DB.prepare(sql).bind(slug).first();
}

async function getPageByPath(env, path) {
  return env.DB.prepare('SELECT * FROM cms_pages WHERE path = ? AND active = 1').bind(path).first();
}

async function getUserByUsername(env, username) {
  const normalized = String(username || '').trim();
  if (!normalized) return null;
  const direct = await env.DB.prepare('SELECT id, username, display_name, password_hash, role, permissions, active FROM users WHERE username = ?').bind(normalized).first();
  if (direct) return direct;
  // Bootstrap alias: allow "admin" (or the configured bootstrap username) to reach the
  // active site administrator even after the account was renamed to an email address.
  const bootstrap = String(adminUsername(env) || 'admin').trim().toLowerCase();
  if (normalized.toLowerCase() === 'admin' || normalized.toLowerCase() === bootstrap) {
    return env.DB.prepare("SELECT id, username, display_name, password_hash, role, permissions, active FROM users WHERE role = 'admin' AND active = 1 ORDER BY id ASC LIMIT 1").first();
  }
  return null;
}

async function getUserById(env, id) {
  return env.DB.prepare('SELECT id, username, display_name, password_hash, role, permissions, active FROM users WHERE id = ? AND active = 1').bind(id).first();
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    permissions: parsePermissions(user.permissions),
    active: Boolean(user.active),
    last_login_at: String(user.last_login_at || '').trim() || null,
  };
}

export function formatUserLastLoginDisplay(value, {
  timeZone = 'America/New_York',
  now = new Date(),
} = {}) {
  const raw = String(value || '').trim();
  if (!raw) return 'Never logged in';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Never logged in';
  try {
    return `Last login ${date.toLocaleString('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })} ET`;
  } catch {
    return `Last login ${date.toISOString()}`;
  }
}

function canEditPage(user, slug) {
  return hasPermission(user, 'pages') || hasPermission(user, `page:${slug}`);
}

export const MINUTES_EDIT_WINDOW_DAYS = 10;

export function parseMeetingDateInput(value) {
  const raw = String(value || '').trim();
  let month;
  let day;
  let year;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const compact = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (slash) {
    month = Number(slash[1]);
    day = Number(slash[2]);
    year = Number(slash[3]);
  } else if (compact) {
    month = Number(compact[1]);
    day = Number(compact[2]);
    year = Number(compact[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatMeetingDateDisplay(value) {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const slash = parseMeetingDateInput(raw);
  if (!slash) return raw;
  const parts = slash.split('-');
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

export function normalizeMinutesPayload(payload = {}, existing = null) {
  const meetingDateRaw = payload.meeting_date !== undefined ? payload.meeting_date : existing?.meeting_date;
  const meeting_date = parseMeetingDateInput(meetingDateRaw) || (
    String(meetingDateRaw || '').match(/^\d{4}-\d{2}-\d{2}$/) ? String(meetingDateRaw) : ''
  );
  const bodyRaw = payload.body_html !== undefined ? payload.body_html : existing?.body_html;
  const bodySource = String(bodyRaw || '').trim();
  const body_html = bodySource ? sanitizeRichHtml(bodySource) : '';
  return { meeting_date, body_html };
}

function utf8Decode(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

async function inflateRawDeflate(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DOCX decompression is not supported in this runtime');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findZipCentralDirectory(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minEOCD = 22;
  const maxComment = 0xffff;
  const start = Math.max(0, bytes.byteLength - (minEOCD + maxComment));
  for (let i = bytes.byteLength - minEOCD; i >= start; i -= 1) {
    if (view.getUint32(i, true) !== 0x06054b50) continue;
    const entries = view.getUint16(i + 10, true);
    const size = view.getUint32(i + 12, true);
    const offset = view.getUint32(i + 16, true);
    if (offset + size > bytes.byteLength) continue;
    return { entries, offset };
  }
  return null;
}

export async function readZipEntryBytes(buffer, entryName) {
  const wanted = String(entryName || '').replace(/^\/+/, '');
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findZipCentralDirectory(bytes);
  if (!eocd) throw new Error('Invalid DOCX archive');
  let offset = eocd.offset;
  for (let i = 0; i < eocd.entries; i += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Invalid DOCX central directory');
    }
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = utf8Decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;
    if (name !== wanted && !name.endsWith(`/${wanted}`)) continue;
    if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`Corrupt DOCX entry: ${wanted}`);
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(dataStart, dataStart + compSize);
    if (method === 0) return data.slice();
    if (method === 8) return inflateRawDeflate(data);
    throw new Error(`Unsupported DOCX compression method (${method})`);
  }
  return null;
}

export function docxXmlToPlainText(xml = '') {
  let text = String(xml || '');
  text = text
    .replace(/<w:tab\b[^:]*\/>/gi, '\t')
    .replace(/<w:br\b[^:]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanMinutesDocxBlank(value, { multiline = false } = {}) {
  const raw = String(value || '').replace(/[_\u2013\u2014\-.]{2,}/g, ' ');
  if (multiline) {
    return raw
      .split(/\n+/)
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }
  return raw.replace(/\s+/g, ' ').trim();
}

export function extractMeetingDateFromFilename(filename = '') {
  const base = String(filename || '').split(/[/\\]/).pop() || '';
  const iso = base.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (iso) return parseMeetingDateInput(`${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`);
  const slashy = base.match(/(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})/);
  if (slashy) return parseMeetingDateInput(`${slashy[1]}/${slashy[2]}/${slashy[3]}`);
  const compact = base.match(/(?<!\d)(\d{8})(?!\d)/);
  if (compact) return parseMeetingDateInput(compact[1]);
  return null;
}

export function extractMeetingDateFromMinutesText(text = '', filename = '') {
  const source = String(text || '');
  const beforeNext = source.split(/\bNEXT\s+MEETING\b/i)[0] || source;
  const labeled = beforeNext.match(/\bDate\s*:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{8})/i);
  if (labeled) {
    const parsed = parseMeetingDateInput(labeled[1]);
    if (parsed) return parsed;
  }
  const anySlash = beforeNext.match(/\b([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\b/);
  if (anySlash) {
    const parsed = parseMeetingDateInput(anySlash[1]);
    if (parsed) return parsed;
  }
  return extractMeetingDateFromFilename(filename);
}

function captureLabeledLine(text, label) {
  const re = new RegExp(`${label}\\s*:\\s*([^\\n]*)`, 'i');
  const match = String(text || '').match(re);
  let value = cleanMinutesDocxBlank(match?.[1] || '');
  if (/^date$/i.test(label)) {
    value = value.replace(/\s+Time\s*:.*$/i, '').trim();
  }
  return value;
}

function sectionBodyBetween(text, startRe, endRe) {
  const source = String(text || '');
  const start = source.search(startRe);
  if (start < 0) return '';
  const afterStart = source.slice(start).replace(startRe, '');
  const end = afterStart.search(endRe);
  const body = end >= 0 ? afterStart.slice(0, end) : afterStart;
  return cleanMinutesDocxBlank(body, { multiline: true });
}

export function parseBoostersMinutesFieldsFromText(text = '') {
  const source = String(text || '');
  const header = source.split(/\bCALL\s+TO\s+ORDER\b/i)[0] || source;
  const nextMeetingBlock = sectionBodyBetween(source, /\bNEXT\s+MEETING\b/i, /\bADJOURNMENT\b/i);
  const callBlock = sectionBodyBetween(source, /\bCALL\s+TO\s+ORDER\b/i, /\bATTENDANCE\b/i);
  const callMatch = callBlock.match(/called to order at\s+(.+?)\s+by\s+(.+?)\.?$/im);
  const attendance = sectionBodyBetween(source, /\bATTENDANCE\b/i, /\bAPPROVAL\s+OF\s+PREVIOUS\s+MEETING\s+MINUTES\b/i);
  const presentMatch = attendance.match(/Members\s+Present\s*:?\s*([\s\S]*?)(?=Members\s+Absent\s*:|$)/i);
  const absentMatch = attendance.match(/Members\s+Absent\s*:?\s*([\s\S]*)$/i);
  const approval = sectionBodyBetween(source, /\bAPPROVAL\s+OF\s+PREVIOUS\s+MEETING\s+MINUTES\b/i, /\bTREASURER'?S\s+REPORT/i);
  const motionLine = approval.match(/Motion\s+to\s+approve\s*:\s*(.+?)(?:\s{2,}|\s+Seconded\s+by\s*:|$)/i);
  const secondLine = approval.match(/Seconded\s+by\s*:\s*(.+)$/im);
  const voteLine = approval.match(/Vote\s*\/?\s*Action\s*:\s*(.+)$/im);
  const actionBlock = sectionBodyBetween(source, /\bACTION\s+ITEMS\b/i, /\bNEXT\s+MEETING\b/i);
  const actionItems = [...actionBlock.matchAll(/^\s*(?:\d+[\).]|[-*])\s*(.+)$/gm)]
    .map((match) => cleanMinutesDocxBlank(match[1]))
    .filter(Boolean);
  const adjourn = sectionBodyBetween(source, /\bADJOURNMENT\b/i, /$/);
  const adjournMatch = adjourn.match(/adjourned at\s+(.+?)\.?$/im);
  const submitted = captureLabeledLine(adjourn, 'Submitted by');
  return {
    meeting_time: captureLabeledLine(header, 'Time'),
    location: captureLabeledLine(header, 'Location'),
    called_by: captureLabeledLine(header, 'Meeting Called By'),
    call_to_order_time: cleanMinutesDocxBlank(callMatch?.[1] || ''),
    call_to_order_by: cleanMinutesDocxBlank(callMatch?.[2] || ''),
    members_present: cleanMinutesDocxBlank(presentMatch?.[1] || '', { multiline: true }),
    members_absent: cleanMinutesDocxBlank(absentMatch?.[1] || '', { multiline: true }),
    previous_minutes_motion: cleanMinutesDocxBlank(motionLine?.[1] || ''),
    previous_minutes_second: cleanMinutesDocxBlank(secondLine?.[1] || ''),
    previous_minutes_vote: cleanMinutesDocxBlank(voteLine?.[1] || ''),
    treasurer_report: sectionBodyBetween(source, /\bTREASURER'?S\s+REPORT(?:\s*\/\s*FINANCIAL\s+UPDATE)?\b/i, /\bDIRECTOR\s*\/\s*BAND\s+PROGRAM\s+UPDATE\b/i),
    director_update: sectionBodyBetween(source, /\bDIRECTOR\s*\/\s*BAND\s+PROGRAM\s+UPDATE\b/i, /\bOLD\s+BUSINESS\b/i),
    old_business: sectionBodyBetween(source, /\bOLD\s+BUSINESS\b/i, /\bNEW\s+BUSINESS\b/i),
    new_business: sectionBodyBetween(source, /\bNEW\s+BUSINESS\b/i, /\bFUNDRAISING\b/i),
    fundraising: sectionBodyBetween(source, /\bFUNDRAISING\b/i, /\bUPCOMING\s+EVENTS/i)
      .replace(/^Fundraisers discussed, planned, or currently in progress:\s*/i, '')
      .trim(),
    upcoming_events: sectionBodyBetween(source, /\bUPCOMING\s+EVENTS(?:\s*&\s*ACTIVITIES)?\b/i, /\bVOLUNTEER\s+NEEDS\b/i),
    volunteer_needs: sectionBodyBetween(source, /\bVOLUNTEER\s+NEEDS\b/i, /\bADDITIONAL\s+DISCUSSION\b/i),
    additional_discussion: sectionBodyBetween(source, /\bADDITIONAL\s+DISCUSSION\b/i, /\bACTION\s+ITEMS\b/i),
    action_item_1: actionItems[0] || '',
    action_item_2: actionItems[1] || '',
    action_item_3: actionItems[2] || '',
    next_meeting_date: captureLabeledLine(nextMeetingBlock, 'Date'),
    next_meeting_time: captureLabeledLine(nextMeetingBlock, 'Time'),
    adjourned_at: cleanMinutesDocxBlank(adjournMatch?.[1] || ''),
    submitted_by: submitted,
  };
}

function minutesMultilineHtmlFromText(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trimEnd());
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return '<p><em>Not recorded.</em></p>';
  return lines.map((line) => `<p>${escapeHtml(line || ' ')}</p>`).join('');
}

export function buildMinutesDocxBodyHtmlFromFields(fields = {}, meetingDateDisplay = '') {
  const values = { ...fields };
  const date = meetingDateDisplay || formatMeetingDateDisplay(values.meeting_date) || '';
  const time = String(values.meeting_time || '').trim();
  const location = String(values.location || '').trim();
  const calledBy = String(values.called_by || '').trim();
  const subtitle = String(values.meeting_subtitle || '').trim();
  const callTime = String(values.call_to_order_time || '').trim();
  const callBy = String(values.call_to_order_by || '').trim();
  const actions = [values.action_item_1, values.action_item_2, values.action_item_3]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const fieldsPayload = {
    version: 1,
    template: 'east-forsyth-boosters-v1',
    meeting_date: date,
    meeting_subtitle: String(values.meeting_subtitle || ''),
    meeting_time: String(values.meeting_time || ''),
    location: String(values.location || ''),
    called_by: String(values.called_by || ''),
    call_to_order_time: String(values.call_to_order_time || ''),
    call_to_order_by: String(values.call_to_order_by || ''),
    members_present: String(values.members_present || ''),
    members_absent: String(values.members_absent || ''),
    previous_minutes_motion: String(values.previous_minutes_motion || ''),
    previous_minutes_second: String(values.previous_minutes_second || ''),
    previous_minutes_vote: String(values.previous_minutes_vote || ''),
    treasurer_report: String(values.treasurer_report || ''),
    director_update: String(values.director_update || ''),
    old_business: String(values.old_business || ''),
    new_business: String(values.new_business || ''),
    fundraising: String(values.fundraising || ''),
    upcoming_events: String(values.upcoming_events || ''),
    volunteer_needs: String(values.volunteer_needs || ''),
    additional_discussion: String(values.additional_discussion || ''),
    action_item_1: String(values.action_item_1 || ''),
    action_item_2: String(values.action_item_2 || ''),
    action_item_3: String(values.action_item_3 || ''),
    next_meeting_date: String(values.next_meeting_date || ''),
    next_meeting_time: String(values.next_meeting_time || ''),
    adjourned_at: String(values.adjourned_at || ''),
    submitted_by: String(values.submitted_by || ''),
  };
  const encodedFields = btoa(unescape(encodeURIComponent(JSON.stringify(fieldsPayload))));
  return `<div class="minutes-docx">
<div class="draft">MINUTES_FIELDS_V1:${encodedFields}</div>
<div class="kicker">East Forsyth Band Boosters</div>
<h2>Meeting Minutes</h2>
${subtitle ? `<p><em>${escapeHtml(subtitle)}</em></p>` : ''}
<p><strong>Date:</strong> ${escapeHtml(date)}${time ? ` · <strong>Time:</strong> ${escapeHtml(time)}` : ''}${location ? ` · <strong>Location:</strong> ${escapeHtml(location)}` : ''}</p>
${calledBy ? `<p><strong>Meeting Called By:</strong> ${escapeHtml(calledBy)}</p>` : ''}
<h3>Call to Order</h3>
<p>The regular meeting of the East Forsyth Band Boosters was called to order at ${escapeHtml(callTime || '__________')} by ${escapeHtml(callBy || '________________')}.</p>
<h3>Attendance</h3>
<p><strong>Members Present:</strong></p>
${minutesMultilineHtmlFromText(values.members_present)}
<p><strong>Members Absent:</strong></p>
${minutesMultilineHtmlFromText(values.members_absent)}
<h3>Approval of Previous Meeting Minutes</h3>
<p>The minutes from the previous meeting were reviewed.</p>
<p><strong>Motion to approve:</strong> ${escapeHtml(values.previous_minutes_motion || '________________')} · <strong>Seconded by:</strong> ${escapeHtml(values.previous_minutes_second || '________________')}</p>
<p><strong>Vote/Action:</strong> ${escapeHtml(values.previous_minutes_vote || '________________')}</p>
<h3>Treasurer's Report / Financial Update</h3>
${minutesMultilineHtmlFromText(values.treasurer_report)}
<h3>Director / Band Program Update</h3>
${minutesMultilineHtmlFromText(values.director_update)}
<h3>Old Business</h3>
${minutesMultilineHtmlFromText(values.old_business)}
<h3>New Business</h3>
${minutesMultilineHtmlFromText(values.new_business)}
<h3>Fundraising</h3>
<p>Fundraisers discussed, planned, or currently in progress:</p>
${minutesMultilineHtmlFromText(values.fundraising)}
<h3>Upcoming Events &amp; Activities</h3>
${minutesMultilineHtmlFromText(values.upcoming_events)}
<h3>Volunteer Needs</h3>
${minutesMultilineHtmlFromText(values.volunteer_needs)}
<h3>Additional Discussion</h3>
${minutesMultilineHtmlFromText(values.additional_discussion)}
<h3>Action Items</h3>
${actions ? `<ol>${actions}</ol>` : '<p><em>No action items recorded.</em></p>'}
<h3>Next Meeting</h3>
<p><strong>Date:</strong> ${escapeHtml(values.next_meeting_date || '________________')} · <strong>Time:</strong> ${escapeHtml(values.next_meeting_time || '________________')}</p>
<h3>Adjournment</h3>
<p><strong>Meeting Adjourned:</strong> ${escapeHtml(values.adjourned_at || '__________')} · <strong>Submitted by:</strong> ${escapeHtml(values.submitted_by || '________________')}</p>
<p><em>Secretary, East Forsyth Band Boosters</em></p>
</div>`;
}

export async function parseBoostersMinutesDocx(arrayBuffer, filename = '') {
  const entry = await readZipEntryBytes(arrayBuffer, 'word/document.xml');
  if (!entry) throw new Error('DOCX is missing word/document.xml');
  const plain = docxXmlToPlainText(utf8Decode(entry));
  if (!plain) throw new Error('DOCX did not contain readable meeting minutes text');
  const meeting_date = extractMeetingDateFromMinutesText(plain, filename);
  if (!meeting_date) {
    throw new Error('Could not find a meeting date in the DOCX. Add Date: MM/DD/YYYY near the top, or include the date in the filename.');
  }
  const fields = parseBoostersMinutesFieldsFromText(plain);
  const meeting_date_display = formatMeetingDateDisplay(meeting_date);
  const body_html = sanitizeRichHtml(buildMinutesDocxBodyHtmlFromFields(fields, meeting_date_display));
  if (!body_html.replace(/<[^>]+>/g, '').trim()) {
    throw new Error('DOCX did not contain usable minutes content');
  }
  return {
    meeting_date,
    meeting_date_display,
    fields,
    body_html,
    plain_text: plain,
  };
}

export function minutesEditableUntil(meetingDate) {
  // 10-day secretary edit window starts on the meeting date (not upload/submit time).
  const iso = parseMeetingDateInput(meetingDate) || (
    String(meetingDate || '').match(/^\d{4}-\d{2}-\d{2}$/) ? String(meetingDate) : ''
  );
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const start = Date.UTC(year, month - 1, day);
  if (Number.isNaN(start)) return null;
  return new Date(start + (MINUTES_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000));
}

export function canViewMeetingMinutes(user) {
  // Any logged-in CMS user can view/print meeting minutes.
  return Boolean(user);
}

export function canManageMeetingMinutes(user) {
  // Secretary / create-edit capability (time window applied separately).
  if (!user) return false;
  return isSuperAdmin(user) || hasPermission(user, 'minutes');
}

export function canEditMeetingMinutes(user, record, now = new Date()) {
  if (!user || !record) return false;
  if (!canManageMeetingMinutes(user)) return false;
  if (isSuperAdmin(user)) return true;
  const until = minutesEditableUntil(record.meeting_date);
  if (!until) return false;
  return now.getTime() <= until.getTime();
}

export function canDeleteMeetingMinutes(user) {
  // Hard rule: secretaries and view-only users can never delete minutes.
  // Only users with the Super Admin role (role === 'admin') may delete.
  return Boolean(user) && isSuperAdmin(user);
}

export function renderMinutesDocumentHtml(site = {}, minutes = {}, { embed = false } = {}) {
  const title = site.title || 'East Forsyth Band';
  const dateLabel = formatMeetingDateDisplay(minutes.meeting_date_display || minutes.meeting_date);
  const recorder = String(minutes.created_by_name || '').trim();
  const body = sanitizeRichHtml(minutes.body_html || '');
  const isDocxMinutes = /\bminutes-docx\b/.test(body);
  const isEmbed = Boolean(embed);
  // Letterhead banner only for DOCX minutes. Blue Regiment logo is not used in minutes.
  const letterheadBanner = MINUTES_LETTERHEAD_BANNER;
  const chrome = isDocxMinutes
    ? `<header class="letterhead letterhead-banner-wrap" aria-hidden="true">
      <img class="letterhead-banner" src="${escapeHtml(letterheadBanner)}" alt="" draggable="false">
    </header>`
    : `<p class="doc-kicker">${escapeHtml(title)}</p>
    <h1>Booster Meeting Minutes</h1>
    <p class="meta">${escapeHtml(dateLabel)}${recorder ? ` · Recorded by ${escapeHtml(recorder)}` : ''}</p>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Meeting Minutes ${escapeHtml(dateLabel)} | ${escapeHtml(title)}</title>
  <style>
    @page { size: letter; margin: 0.65in; }
    :root { color-scheme: only light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 12pt/1.55 "Times New Roman", Times, serif;
      color: #111;
      background: #e8eef5;
    }
    .sheet {
      width: min(8.5in, 100%);
      min-height: 11in;
      margin: 16px auto;
      padding: 0.65in 0.75in 0.75in;
      background: #fff;
      box-shadow: 0 10px 30px rgba(15, 34, 58, 0.18);
    }
    .sheet.docx { padding-top: 0.45in; }
    .letterhead {
      display: flex;
      justify-content: center;
      margin: 0 0 14px;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .letterhead-banner-wrap { display: block; margin: 0 0 10px; }
    .letterhead-banner {
      display: block;
      width: 100%;
      max-height: 1.35in;
      object-fit: contain;
      object-position: center top;
      -webkit-user-drag: none;
    }
    .doc-kicker {
      margin: 0 0 6px;
      font: 700 9pt/1.2 "Work Sans", system-ui, sans-serif;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #c8121d;
      text-align: center;
    }
    h1 {
      margin: 0 0 8px;
      font: 700 22pt/1.15 "Work Sans", system-ui, sans-serif;
      color: #10233c;
      text-align: center;
    }
    .meta {
      margin: 0 0 22px;
      padding-bottom: 14px;
      border-bottom: 1px solid #d5deea;
      font: 10pt/1.4 "Work Sans", system-ui, sans-serif;
      color: #5b6f88;
      text-align: center;
    }
    .body { font: 12pt/1.55 "Times New Roman", Times, serif; color: #1a1a1a; }
    .body p { margin: 0 0 0.85em; }
    .body p:last-child { margin-bottom: 0; }
    .body ul, .body ol { margin: 0 0 0.85em; padding-left: 1.3em; }
    .body h2 { margin: 0 0 10px; font: 700 16pt/1.2 "Work Sans", system-ui, sans-serif; color: #10233c; text-align: center; }
    .body h3 { margin: 1.1em 0 0.45em; font: 800 10pt/1.25 "Work Sans", system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: #10233c; }
    .body .kicker { margin: 0 0 6px; font: 700 9pt/1.2 "Work Sans", system-ui, sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: #c8121d; text-align: center; }
    .body .draft { display: none !important; }
    .body .minutes-docx { margin: 0; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 10px 16px;
      background: rgba(246, 248, 251, 0.96);
      border-bottom: 1px solid #d5deea;
    }
    .toolbar button {
      border: 1px solid #d5deea;
      border-radius: 10px;
      background: #10233c;
      color: #fff;
      font: 700 12px/1 "Work Sans", system-ui, sans-serif;
      padding: 10px 14px;
      cursor: pointer;
    }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .sheet { margin: 0; width: auto; min-height: 0; padding: 0; box-shadow: none; }
      .letterhead-banner { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
    body.is-embed { background: #fff; }
    body.is-embed .toolbar { display: none !important; }
    body.is-embed .sheet {
      margin: 0;
      width: auto;
      min-height: 0;
      box-shadow: none;
    }
  </style>
</head>
<body${isEmbed ? ' class="is-embed"' : ''}>
  <div class="toolbar"><button type="button" onclick="window.print()">Print / Save PDF</button></div>
  <main class="sheet${isDocxMinutes ? ' docx' : ''}">
    ${chrome}
    <div class="body">${body || '<p>No minutes content.</p>'}</div>
  </main>
</body>
</html>`;
}

function serializeMinutesRow(row, user = null) {
  if (!row) return null;
  return {
    id: row.id,
    meeting_date: row.meeting_date,
    meeting_date_display: formatMeetingDateDisplay(row.meeting_date),
    body_html: row.body_html || '',
    created_by: row.created_by || null,
    created_by_name: row.created_by_name || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    editable_until: minutesEditableUntil(row.meeting_date)?.toISOString() || null,
    can_view: canViewMeetingMinutes(user),
    can_edit: canEditMeetingMinutes(user, row),
    can_manage: canManageMeetingMinutes(user),
    can_delete: canDeleteMeetingMinutes(user),
    document_url: row.id ? `/api/admin/minutes/${row.id}/document` : '',
  };
}

async function listMeetingMinutes(env, user = null) {
  const rows = await env.DB.prepare(
    `SELECT m.id, m.meeting_date, m.body_html, m.created_by, m.created_at, m.updated_at,
            u.display_name AS created_by_name
     FROM booster_meeting_minutes m
     LEFT JOIN users u ON u.id = m.created_by
     ORDER BY date(m.meeting_date) DESC, datetime(m.created_at) DESC, m.id DESC`,
  ).all();
  return (rows.results || []).map((row) => serializeMinutesRow(row, user));
}

async function getMeetingMinutesById(env, id, user = null) {
  const row = await env.DB.prepare(
    `SELECT m.id, m.meeting_date, m.body_html, m.created_by, m.created_at, m.updated_at,
            u.display_name AS created_by_name
     FROM booster_meeting_minutes m
     LEFT JOIN users u ON u.id = m.created_by
     WHERE m.id = ?`,
  ).bind(id).first();
  return serializeMinutesRow(row, user);
}

export async function requireSuperAdmin(request, env) {
  const auth = await requireLogin(request, env);
  if (auth.response) return auth;
  if (!isSuperAdmin(auth.user)) {
    return { response: jsonResponse({ detail: 'Super admin access required' }, 403), user: auth.user };
  }
  return auth;
}

export async function requireScheduleBoardAccess(request, env) {
  const auth = await requireLogin(request, env);
  if (auth.response) return auth;
  if (!canAccessScheduleBoard(auth.user)) {
    return {
      response: jsonResponse({ detail: 'Permission required: president, vice-president, or Super Admin' }, 403),
      user: auth.user,
    };
  }
  return auth;
}

export async function requireSecurityLogAccess(request, env) {
  const auth = await requireLogin(request, env);
  if (auth.response) return auth;
  if (!canAccessSecurityLog(auth.user)) {
    return { response: jsonResponse({ detail: 'Security log is Super Admin only' }, 403), user: auth.user };
  }
  return auth;
}

async function requireLogin(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { response: jsonResponse({ detail: 'Login required' }, 401) };
  return { user };
}

async function requirePermission(request, env, scope) {
  const auth = await requireLogin(request, env);
  if (auth.response) return auth;
  if (!hasPermission(auth.user, scope)) return { response: jsonResponse({ detail: `Permission required: ${scope}` }, 403), user: auth.user };
  return auth;
}

async function updatePassword(env, userId, newPassword) {
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(newPassword), userId).run();
}

export function validateSelfPasswordChange(payload = {}) {
  const current_password = String(payload.current_password || '');
  const new_password = String(payload.new_password || '');
  const confirm_password = String(payload.confirm_password ?? '');
  if (!new_password || new_password.length < 8) {
    return { ok: false, status: 422, detail: 'New password must be at least 8 characters' };
  }
  if (confirm_password !== new_password) {
    return { ok: false, status: 422, detail: 'New password and confirmation do not match' };
  }
  return { ok: true, current_password, new_password };
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToArrayBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function photoBytesFromStored(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    try {
      return new Uint8Array(base64ToArrayBuffer(value));
    } catch {
      // Older/odd rows may store raw binary in a text field.
      const bytes = new Uint8Array(value.length);
      for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
      return bytes;
    }
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return new Uint8Array(value);
  // D1 sometimes returns objects that are array-like.
  if (typeof value === 'object' && value.length != null) {
    try {
      return new Uint8Array(value);
    } catch {
      return null;
    }
  }
  return null;
}

async function storeImageUpload(env, file, altText = '', caption = '', sortOrder = 0) {
  if (!file || typeof file === 'string') throw new Error('Photo file is required');
  const originalName = file.name || 'photo';
  let ext = (originalName.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
  if (!IMAGE_UPLOAD_EXTENSIONS.has(ext)) {
    ext = IMAGE_UPLOAD_EXT_BY_TYPE[String(file.type || '').toLowerCase()] || '';
  }
  if (!IMAGE_UPLOAD_EXTENSIONS.has(ext)) {
    throw new Error('Upload a JPG, PNG, WEBP, GIF, or SVG image');
  }
  const size = Number(file.size || 0);
  if (size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error(`Upload an image under ${IMAGE_UPLOAD_MAX_LABEL}`);
  }
  // Negative sort_order hides utility uploads (staff/logo) from the public gallery.
  // Gallery photos get the next positive sort_order so drag-and-drop can reorder them.
  const requestedSort = Number(sortOrder);
  let resolvedSort;
  if (Number.isFinite(requestedSort) && requestedSort < 0) {
    resolvedSort = requestedSort;
  } else if (Number.isFinite(requestedSort) && requestedSort > 0) {
    resolvedSort = requestedSort;
  } else {
    resolvedSort = await nextGalleryPhotoSortOrder(env);
  }
  const createdAt = new Date().toISOString();
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  // Store raw bytes as a D1 BLOB so ~1.9 MB images fit (base64 would exceed D1's 2 MB row limit).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cleanAlt = String(altText || '').trim();
  const captionRaw = String(caption || '').trim();
  const cleanCaption = captionRaw
    ? (looksLikeInlineRichHtml(captionRaw) ? sanitizeInlineRichHtml(captionRaw) : captionRaw)
    : '';
  try {
    const result = await env.DB.prepare(
      'INSERT INTO photos (filename, original_name, alt_text, caption, sort_order, content_type, data_base64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      filename,
      originalName,
      cleanAlt,
      cleanCaption,
      resolvedSort,
      file.type || 'application/octet-stream',
      bytes,
      createdAt,
    ).run();
    return {
      id: result.meta.last_row_id,
      filename,
      original_name: originalName,
      alt_text: cleanAlt,
      caption: cleanCaption,
      sort_order: resolvedSort,
      created_at: createdAt,
      url: `/uploads/${encodeURIComponent(filename)}`,
    };
  } catch (error) {
    const detail = String(error?.message || error || 'Database error');
    if (/too big|TOO_BIG|max.*size|row size|string or blob/i.test(detail)) {
      throw new Error(`That image is too large to store. Try a smaller PNG/JPG under ${IMAGE_UPLOAD_MAX_LABEL}.`);
    }
    throw new Error(detail || 'Could not save the image');
  }
}

function pagePathFromSlug(slug) {
  return slug === 'home' ? '/' : `/${slug}.html`;
}

function paragraphsFromText(value) {
  return String(value || '')
    .split(/\n\s*\n/)
    .map((part) => decodeBasicHtmlEntities(part).trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
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
    if (prop === 'color' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(value)) {
      parts.push(`color: ${value}`);
    }
    if (prop === 'font-size' && /^[\d.]+\s*(px|em|rem|%)$/i.test(value)) {
      parts.push(`font-size: ${value}`);
    }
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


function sanitizeRichHtmlClassList(attrs, allowedNames) {
  const classMatch = String(attrs || '').match(/class\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return String(classMatch?.[1] || classMatch?.[2] || '')
    .split(/\s+/)
    .filter((name) => allowedNames.includes(name))
    .join(' ');
}

function sanitizeRichImageWidthPx(attrs = '') {
  const widthAttr = String(attrs || '').match(/\bwidth\s*=\s*(?:"([^"]*)"|'([^']*)'|([0-9]+))/i);
  const fromAttr = Number.parseFloat(String(widthAttr?.[1] || widthAttr?.[2] || widthAttr?.[3] || ''));
  const dataMatch = String(attrs || '').match(/\bdata-photo-width\s*=\s*(?:"([^"]*)"|'([^']*)'|([0-9]+))/i);
  const dataWidth = Number.parseFloat(String(dataMatch?.[1] || dataMatch?.[2] || dataMatch?.[3] || ''));
  const styleMatch = String(attrs || '').match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const style = String(styleMatch?.[1] || styleMatch?.[2] || '');
  const fromStyle = Number.parseFloat((style.match(/(?:^|;)\s*width\s*:\s*([\d.]+)\s*px\b/i) || [])[1] || '');
  const width = Number.isFinite(fromStyle) && fromStyle > 0
    ? fromStyle
    : (Number.isFinite(dataWidth) && dataWidth > 0
      ? dataWidth
      : (Number.isFinite(fromAttr) && fromAttr > 0 ? fromAttr : 0));
  if (!width) return 0;
  return Math.max(80, Math.min(1600, Math.round(width)));
}

function sanitizeRichImageFloatClass(attrs = '') {
  const className = String(attrs || '');
  const styleMatch = String(attrs || '').match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const style = String(styleMatch?.[1] || styleMatch?.[2] || '');
  if (/\bcms-body-photo-block\b/i.test(className) || /(?:^|;)\s*float\s*:\s*none\b/i.test(style)) return 'cms-body-photo-block';
  if (/\bcms-body-photo-right\b/i.test(className) || /(?:^|;)\s*float\s*:\s*right\b/i.test(style)) return 'cms-body-photo-right';
  if (/\bcms-body-photo-left\b/i.test(className) || /(?:^|;)\s*float\s*:\s*left\b/i.test(style)) return 'cms-body-photo-left';
  if (sanitizeRichImageWidthPx(attrs) > 0) return 'cms-body-photo-left';
  return 'cms-body-photo-block';
}

function sanitizeRichImageTag(attrs = '') {
  const srcMatch = String(attrs || '').match(/src\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  let src = String(srcMatch?.[1] || srcMatch?.[2] || '').trim();
  if (!src || /^(javascript:|data:)/i.test(src)) return '';
  try {
    if (/^https?:\/\//i.test(src)) {
      const parsed = new URL(src);
      if (!parsed.pathname.startsWith('/uploads/')) return '';
      src = parsed.pathname + (parsed.search || '');
    }
  } catch {
    return '';
  }
  if (!src.startsWith('/uploads/')) return '';
  if (/[<>"\s]/.test(src)) return '';
  const altMatch = String(attrs || '').match(/alt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const alt = escapeHtml(String(altMatch?.[1] || altMatch?.[2] || '').trim() || 'Photo');
  const floatClass = sanitizeRichImageFloatClass(attrs);
  const className = ['cms-body-photo', floatClass].filter(Boolean).join(' ');
  const widthPx = sanitizeRichImageWidthPx(attrs);
  const sizeStyle = widthPx ? ` style="width: ${widthPx}px; height: auto;"` : '';
  const widthData = widthPx ? ` data-photo-width="${widthPx}"` : '';
  return `<img src="${src.replace(/"/g, '&quot;')}" alt="${alt}" class="${className}"${sizeStyle}${widthData}>`;
}

export function sanitizeRichHtml(dirty) {
  let html = normalizeCssEmphasisMarkup(dirty)
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
  const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'ul', 'ol', 'li', 'div', 'h2', 'h3', 'a', 'img']);
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return '';
    if (tag === 'img') {
      if (match.startsWith('</')) return '';
      return sanitizeRichImageTag(attrs);
    }
    if (match.startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag === 'a') {
      const hrefMatch = String(attrs || '').match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const href = String(hrefMatch?.[1] || hrefMatch?.[2] || '').trim();
      if (!href || /^(javascript:|data:)/i.test(href)) return '';
      if (!/^(https?:\/\/|\/|mailto:)/i.test(href)) return '';
      const safeHref = href.replace(/"/g, '&quot;');
      return `<a href="${safeHref}">`;
    }
    if (tag === 'span') {
      const style = sanitizeStyleAttribute(attrs);
      return style ? `<span style="${style}">` : '<span>';
    }
    if (tag === 'p') {
      const className = sanitizeRichHtmlClassList(attrs, ['cms-body-photo']);
      return className ? `<p class="${className}">` : '<p>';
    }
    if (tag === 'div') {
      const className = sanitizeRichHtmlClassList(attrs, ['kicker', 'tag', 'draft', 'minutes-docx', 'cms-body-photo']);
      return className ? `<div class="${className}">` : '<div>';
    }
    return `<${tag}>`;
  });
  html = html
    .replace(/<span[^>]*\bdata-cms-caret-mark\b[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<(p|div)\s+class="cms-body-photo">\s*(<img\b[^>]*>)\s*<\/\1>/gi, '$2')
    .replace(/<span(?:\s[^>]*)?>\s*(<br\s*\/?>)\s*<\/span>/gi, '$1')
    .replace(/(?:<br>\s*){3,}/gi, '<br><br>')
    .trim();
  if (!html) return '';
  // Keep a lone floated <img> unwrapped so it can sit mid-paragraph and wrap text.
  if (!/<(?:p|div|h2|h3|ul|ol|img)[\s>]/i.test(html)) html = `<p>${html}</p>`;
  return html;
}

export function sanitizeInlineRichHtml(dirty) {
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

export function formatInlineRichText(value, fallback = '') {
  const raw = String(value ?? '');
  const source = raw.trim() ? raw : String(fallback || '');
  if (!source.trim()) return '';
  return looksLikeInlineRichHtml(source)
    ? sanitizeInlineRichHtml(source)
    : escapeHtml(decodeBasicHtmlEntities(source));
}

export function formatRichText(value, fallback = '') {
  const raw = String(value ?? '');
  const source = raw.trim() ? raw : String(fallback || '');
  if (!source.trim()) return '';
  return looksLikeHtml(source) ? sanitizeRichHtml(source) : paragraphsFromText(source);
}

function hasStructuredPageFields(payload) {
  return ['layout', 'kicker', 'heading', 'intro', 'body_text', 'callout_title', 'callout_text'].some((key) => payload[key] !== undefined);
}

export function generateStructuredPageHtml(payload = {}) {
  const layout = String(payload.layout || 'standard');
  const kicker = formatInlineRichText(payload.kicker || 'Page');
  const heading = formatInlineRichText(payload.heading || payload.title || 'Untitled Page');
  const intro = formatInlineRichText(payload.intro || '');
  const body = formatRichText(payload.body_text || 'Add page information here.');
  const calloutTitle = formatInlineRichText(payload.callout_title || '').trim();
  const calloutText = String(payload.callout_text || '').trim();
  const callout = calloutTitle || calloutText
    ? `<aside class="notice" data-cms-block="callout"><h3 data-cms-field="callout_title">${calloutTitle || 'Note'}</h3><div data-cms-field="callout_text">${formatRichText(calloutText)}</div></aside>`
    : '';
  const hero = `<section class="page-hero" data-cms-layout="${escapeAttr(layout)}"><div class="page-title"><div class="kicker" data-cms-field="kicker">${kicker}</div><h1 data-cms-field="heading">${heading}</h1>${intro ? `<p data-cms-field="intro">${intro}</p>` : ''}</div></section>`;

  if (layout === 'calendar') {
    return `${hero}<section class="content soft caldev-section"><div class="wrap caldev-wrap"><div data-cms-field="body_text">${body}</div><div id="caldev-app" class="caldev-app" aria-live="polite"></div>${callout}</div></section>`;
  }

  if (layout === 'gallery') {
    return `${hero}<section class="content soft photo-gallery-section"><div class="wrap"><div class="photo-gallery" data-photo-gallery data-sort="recent"></div>${callout}</div></section>`;
  }

  if (layout === 'contact') {
    return `${hero}<section class="content soft"><div class="wrap grid two"><article class="card" data-cms-field="body_text">${body}</article><div data-contact-form-slot></div>${callout}</div></section>`;
  }

  if (layout === 'directory') {
    return `${hero}<section class="content"><div class="wrap"><div class="card" data-cms-field="body_text">${body}</div><div class="directory" data-staff></div>${callout}</div></section>`;
  }

  if (layout === 'boosters') {
    return `${hero}<section class="content"><div class="wrap"><div class="card" data-cms-field="body_text">${body}</div>${renderBoostersDuesCard()}<article class="card"><span class="tag">Meetings</span><h3>Booster Meetings</h3><p class="booster-meetings-intro">Upcoming booster meetings are listed below.</p><div class="timeline booster-meetings" data-booster-meetings></div></article>${callout}</div></section><section class="content soft"><div class="wrap"><div class="section-head"><span class="kicker">People</span><h2>Booster Members</h2><p>Officers and volunteers who support the East Forsyth Band program.</p></div><div class="directory" data-booster-members></div></div></section>`;
  }

  if (layout === 'sponsors') {
    const sponsorCallout = calloutTitle || calloutText
      ? `<aside class="sponsor-cta" data-cms-block="callout"><div><span class="sponsor-level">Sponsor opportunities</span><h2 data-cms-field="callout_title">${calloutTitle || 'Sponsor opportunities'}</h2><div data-cms-field="callout_text">${formatRichText(calloutText)}</div></div><a class="btn secondary" href="/become-a-sponsor.html">Become a sponsor</a></aside>`
      : '';
    return `<section class="page-hero sponsor-hero" data-cms-layout="${escapeAttr(layout)}"><div class="page-title"><div class="kicker" data-cms-field="kicker">${kicker}</div><h1 data-cms-field="heading">${heading}</h1>${intro ? `<p data-cms-field="intro">${intro}</p>` : ''}</div></section><section class="content sponsor-content"><div class="wrap"><div class="sponsor-intro"><div data-cms-field="body_text">${body}</div>${SPONSOR_INTRO_ACTIONS_HTML}</div><div class="sponsor-directory" data-sponsors></div>${sponsorCallout}</div></section>`;
  }

  if (layout === 'become-sponsor') {
    return `<section class="page-hero sponsor-hero" data-cms-layout="${escapeAttr(layout)}"><div class="page-title"><div class="kicker" data-cms-field="kicker">${kicker}</div><h1 data-cms-field="heading">${heading}</h1>${intro ? `<p data-cms-field="intro">${intro}</p>` : ''}</div></section><section class="content sponsor-content"><div class="wrap">${renderSponsorTiersHtml(payload)}<div class="become-sponsor-panel grid two"><article class="card" data-cms-field="body_text">${body}</article><div data-contact-form-slot></div></div>${callout}</div></section>`;
  }

  return `${hero}<section class="content"><div class="wrap"><div class="card" data-cms-field="body_text">${body}</div>${callout}</div></section>`;
}

export function sanitizeHomeBodyHtml(html = '') {
  let source = String(html || '')
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\scontenteditable\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:role|spellcheck|aria-label|data-placeholder|data-edit-label|data-cms-home-field|data-cms-field|data-cms-href|data-cms-dynamic-label)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sclass="([^"]*)"/gi, (_, classes) => {
      const cleaned = String(classes || '')
        .split(/\s+/)
        .filter((name) => name && !['cms-edit-field', 'cms-edit-rich', 'cms-edit-inline', 'is-focused', 'cms-home-dynamic'].includes(name))
        .join(' ');
      return cleaned ? ` class="${cleaned}"` : '';
    })
    .replace(/javascript:/gi, '');
  source = source
    .replace(/<div class="cms-home-preview-note"[\s\S]*?<\/div>/gi, '')
    .replace(/<label class="cms-home-href-field"[\s\S]*?<\/label>/gi, '')
    .replace(/<span class="cms-home-link-edit">([\s\S]*?)<\/span>/gi, '$1');
  return source.trim();
}

export function serializePagePayload(payload, existing = null) {
  const slug = normalizePageSlug(payload.slug || payload.title || existing?.slug);
  const path = payload.path ? normalizeStaticPath(payload.path) : pagePathFromSlug(slug);
  const defaultHtml = '<section><div class="wrap"><h1>New Page</h1><p>Edit this page in the CMS.</p></div></section>';
  let body_html;
  if (slug === 'home') {
    if (payload.body_html != null && String(payload.body_html).trim()) {
      body_html = sanitizeHomeBodyHtml(payload.body_html);
    } else {
      const baseHtml = String(existing?.body_html ?? defaultHtml);
      const cards = normalizeHomeFeatureCards({
        ...extractHomeFeatureCards(baseHtml),
        ...payload,
      });
      body_html = applyHomeFeatureCards(baseHtml, cards);
    }
  } else if (hasStructuredPageFields(payload)) {
    body_html = generateStructuredPageHtml({ title: payload.title || existing?.title, ...payload });
  } else {
    body_html = String(payload.body_html ?? existing?.body_html ?? defaultHtml);
  }
  return {
    slug,
    path: slug === 'home' ? '/' : path,
    title: String(payload.title || existing?.title || 'Untitled Page').trim(),
    body_html,
    nav_order: Number(payload.nav_order ?? existing?.nav_order ?? 99),
    is_home: slug === 'home' || payload.is_home ? 1 : 0,
    active: payload.active === false || payload.active === 0 ? 0 : 1,
  };
}

async function handleApi(request, env, url, ctx = null) {
  await initDb(env);
  let requestSummary = null;
  const actor = url.pathname.startsWith('/api/admin')
    ? await currentUser(request, env)
    : null;
  if (url.pathname.startsWith('/api/admin') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    requestSummary = await summarizeAdminRequestForAudit(request);
  }
  const response = await routeApi(request, env, url, ctx);
  await maybeAuditAdminApiResponse(env, {
    request,
    url,
    response,
    actor,
    requestSummary,
    ctx,
  });
  return response;
}

async function routeApi(request, env, url, ctx = null) {
  if (url.pathname === '/health') return jsonResponse({ ok: true });
  // Security log is immutable: no create/update/delete endpoints.
  if (isSecurityLogPath(url.pathname) && request.method !== 'GET') {
    return jsonResponse({
      detail: 'Security log is view and print only. Editing is not allowed.',
      access: 'super_admin_only',
      mode: 'view_print_only',
      editable: false,
    }, 405);
  }
  if (url.pathname === '/api/site' && request.method === 'GET') return jsonResponse(await getSite(env));

  if (url.pathname === '/api/calendar-push-state' && request.method === 'GET') {
    const state = await getCalendarPushState(env);
    return jsonResponse({
      ...state,
      topic: CALENDAR_PUSH_TOPIC,
    });
  }
  if (url.pathname === '/api/push/vapid-public-key' && request.method === 'GET') {
    const keys = await getWebPushVapidKeys(env);
    return jsonResponse({
      publicKey: keys.publicKey,
      supported: true,
    });
  }
  if (url.pathname === '/api/push/subscribe' && request.method === 'POST') {
    const normalized = normalizeWebPushSubscription(await request.json().catch(() => ({})));
    if (!normalized.ok) return jsonResponse({ detail: normalized.detail }, 422);
    const saved = await upsertWebPushSubscription(env, normalized);
    let welcome = null;
    try {
      welcome = await sendWebPushToSubscription(env, normalized, {
        notification_title: 'Notifications on',
        notification_body: 'East Forsyth Band will notify you when the calendar changes.',
        title: 'Notifications on',
        body: 'East Forsyth Band will notify you when the calendar changes.',
        url: '/calendar.html',
        action: 'welcome',
      });
    } catch (error) {
      welcome = { ok: false, detail: error?.message || 'Welcome push failed' };
    }
    return jsonResponse({ ...saved, welcome });
  }
  if (url.pathname === '/api/push/subscribe' && request.method === 'DELETE') {
    const payload = await request.json().catch(() => ({}));
    const endpoint = String(payload.endpoint || '').trim();
    if (!endpoint) return jsonResponse({ detail: 'endpoint is required' }, 422);
    return jsonResponse(await deleteWebPushSubscription(env, endpoint));
  }
  if (url.pathname === '/api/email-subscribe' && request.method === 'POST') {
    const payload = await request.json().catch(() => ({}));
    const topics = Array.isArray(payload.topics)
      ? payload.topics
      : String(payload.topics || '')
        .split(/[,;\s]+/)
        .map((value) => value.trim())
        .filter(Boolean);
    const result = await subscribeEmailList(env, {
      email: payload.email,
      topics,
      source: payload.source || 'website',
      update: Boolean(payload.update),
    });
    if (!result.ok) return jsonResponse({ detail: result.detail }, 422);
    if (result.send_welcome) {
      try {
        await sendEmailListWelcome(env, {
          email: result.email,
          topics: result.topics,
          unsubscribeToken: result.unsubscribe_token,
        });
      } catch {
        // Welcome delivery is best-effort.
      }
    } else if (result.send_topics_email) {
      try {
        await sendEmailListTopicsChanged(env, {
          email: result.email,
          previousTopics: result.previous_topics,
          topics: result.topics,
          unsubscribeToken: result.unsubscribe_token,
        });
      } catch {
        // Topics-change delivery is best-effort.
      }
    }
    return jsonResponse({
      ok: true,
      email: result.email,
      topics: result.topics,
      topics_label: result.topics_label || formatEmailListTopicsLabel(result.topics),
      previous_topics: result.previous_topics || [],
      already_subscribed: Boolean(result.already_subscribed),
      updated: Boolean(result.updated),
      unchanged: Boolean(result.unchanged),
      created: Boolean(result.created),
      reactivated: Boolean(result.reactivated),
      detail: result.detail,
    });
  }
  if (url.pathname === '/api/email-unsubscribe' && (request.method === 'POST' || request.method === 'GET')) {
    const payload = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const token = String(payload.token || url.searchParams.get('token') || '').trim();
    const email = String(payload.email || url.searchParams.get('email') || '').trim();
    const result = await unsubscribeEmailSubscriber(env, { token, email, reason: 'link' });
    if (request.method === 'GET' && (url.searchParams.get('format') || '').toLowerCase() !== 'json') {
      const message = result.found
        ? (result.already ? 'You were already unsubscribed.' : 'You are unsubscribed from band email updates.')
        : 'That unsubscribe link is invalid or expired.';
      return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe | East Forsyth Band</title><link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}"></head><body class="admin-body"><main class="admin-shell small"><h1>Email list</h1><p>${escapeHtml(message)}</p><p><a class="btn primary" href="/calendar.html">Back to calendar</a></p></main></body></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return jsonResponse({
      ok: true,
      found: Boolean(result.found),
      already: Boolean(result.already),
      detail: result.found
        ? (result.already ? 'Already unsubscribed.' : 'Unsubscribed.')
        : 'No matching subscriber.',
    });
  }
  if (url.pathname === '/api/resend/inbound' && request.method === 'POST') {
    return handleResendInboundWebhook(env, request);
  }
  if (url.pathname === '/api/session' && request.method === 'GET') {
    const user = await currentUser(request, env);
    return jsonResponse({
      logged_in: Boolean(user),
      is_super_admin: Boolean(user) && isSuperAdmin(user),
    });
  }
  if (url.pathname === '/api/events' && request.method === 'GET') {
    return jsonResponse(await getEvents(env, { upcomingOnly: true, expandRepeats: true }));
  }
  if (url.pathname === '/api/calendar-events' && request.method === 'GET') {
    // Full month view needs past and future months, not only upcoming rows.
    return jsonResponse(await getEvents(env, { upcomingOnly: false, expandRepeats: true }));
  }
  if (url.pathname === '/api/caldev/events' && request.method === 'GET') {
    await ensureCaldevSchema(env);
    let events = await listCaldevEvents(env);
    if (!events.length) {
      try {
        await seedCaldevFromProduction(env, { getEvents, clear: true });
        events = await listCaldevEvents(env);
      } catch {
        // Seeding is best-effort for the lab page.
      }
    }
    return jsonResponse(events);
  }
  if (url.pathname === '/api/caldev/tracks' && request.method === 'GET') {
    return jsonResponse(CALDEV_TRACKS);
  }
  if (url.pathname === '/api/sponsors' && request.method === 'GET') return jsonResponse(await getSponsors(env));
  if (url.pathname === '/api/address-suggest' && request.method === 'GET') {
    const query = String(url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
    if (query.length < 3) {
      return jsonResponse({ suggestions: [], provider: 'none', detail: 'Type at least 3 characters' });
    }
    if (query.length > 120) {
      return jsonResponse({ detail: 'Search query is too long' }, 422);
    }
    const result = await suggestAddresses(query, env);
    return jsonResponse({
      suggestions: result.suggestions,
      provider: result.provider,
      verified_source: Boolean(googleMapsApiKey(env)),
    });
  }
  if (url.pathname === '/api/sponsor-checkout/config' && request.method === 'GET') {
    const { runtime, ...config } = await buildSquareCheckoutConfig(env);
    void runtime;
    return jsonResponse(config);
  }
  if (url.pathname === '/api/sponsor-applications' && request.method === 'POST') {
    const contentType = String(request.headers.get('content-type') || '');
    let businessName = '';
    let address = '';
    let phone = '';
    let email = '';
    let tier = '';
    let amountDisplay = '';
    let amountCents = 0;
    let logoFile = null;
    if (/multipart\/form-data/i.test(contentType)) {
      const form = await request.formData();
      businessName = String(form.get('business_name') || '').trim();
      address = String(form.get('address') || '').trim();
      phone = String(form.get('phone') || '').trim();
      email = String(form.get('email') || '').trim().toLowerCase();
      tier = normalizeSponsorTierKey(form.get('tier'));
      amountDisplay = String(form.get('amount_display') || '').trim();
      amountCents = resolveSponsorAmountCents({
        amountCents: form.get('amount_cents'),
        amountDisplay: form.get('amount_display') || amountDisplay,
      });
      const rawLogo = form.get('logo');
      if (rawLogo && typeof rawLogo !== 'string' && Number(rawLogo.size || 0) > 0) logoFile = rawLogo;
    } else {
      const payload = await request.json().catch(() => ({}));
      businessName = String(payload.business_name || '').trim();
      address = String(payload.address || '').trim();
      phone = String(payload.phone || '').trim();
      email = String(payload.email || '').trim().toLowerCase();
      tier = normalizeSponsorTierKey(payload.tier);
      amountDisplay = String(payload.amount_display || '').trim();
      amountCents = resolveSponsorAmountCents({
        amountCents: payload.amount_cents,
        amountDisplay: payload.amount_display || amountDisplay,
      });
    }
    if (!tier) return jsonResponse({ detail: 'Choose a Bronze, Silver, or Gold package' }, 422);
    if (!businessName || businessName.length > 160) {
      return jsonResponse({ detail: 'Business or organization name is required' }, 422);
    }
    if (!address || address.length > 400) {
      return jsonResponse({ detail: 'Business address is required' }, 422);
    }
    if (!phone || phone.length > 40) {
      return jsonResponse({ detail: 'Phone number is required' }, 422);
    }
    if (!isValidEmail(email) || email.length > 160) {
      return jsonResponse({ detail: 'A valid invoice email address is required' }, 422);
    }
    if (!amountCents || amountCents < 100) {
      return jsonResponse({ detail: 'A valid package amount is required' }, 422);
    }
    const display = amountDisplay || formatSponsorAmountDisplay(amountCents);
    let logoUrl = '';
    if (logoFile) {
      try {
        const stored = await storeImageUpload(
          env,
          logoFile,
          `${businessName} logo`,
          'Sponsor application logo',
          SPONSOR_APPLICATION_LOGO_SORT,
        );
        logoUrl = stored.url || '';
      } catch (error) {
        return jsonResponse({ detail: error.message || 'Could not upload logo' }, 422);
      }
    }
    const now = new Date().toISOString();
    const completionToken = crypto.randomUUID().replace(/-/g, '');
    const insert = await env.DB.prepare(
      `INSERT INTO sponsor_applications
        (tier, amount_cents, amount_display, business_name, address, phone, email, logo_url, status, completion_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?)`,
    ).bind(tier, amountCents, display, businessName, address, phone, email, logoUrl, completionToken, now, now).run();
    const applicationId = insert.meta.last_row_id;
    const tierLabel = `${tier.charAt(0).toUpperCase()}${tier.slice(1)} Sponsor`;
    const origin = publicSiteOrigin(request, env);
    const completePath = `/sponsor-payment-complete?app=${encodeURIComponent(String(applicationId))}&token=${encodeURIComponent(completionToken)}`;
    const redirectUrl = `${origin}${completePath}`;
    const square = await resolveSquareRuntimeEnv(env);
    const mockCheckoutUrl = squareMockPayEnabled(square.env) ? `${completePath}&mock=1` : '';
    let checkoutUrl = '';
    let paymentLinkId = '';
    let paymentReady = false;
    let paymentDetail = '';
    if (squareCheckoutConfigured(square.env)) {
      const link = await createSquarePaymentLink(square.env, {
        name: `EFHS Band ${tierLabel}`,
        amountCents,
        referenceId: `sponsor-app-${applicationId}`,
        buyerPhone: phone,
        redirectUrl,
      });
      if (link.ok) {
        checkoutUrl = link.url;
        paymentLinkId = link.id;
        paymentReady = true;
        await env.DB.prepare(
          `UPDATE sponsor_applications
           SET square_payment_link_id = ?, square_checkout_url = ?, status = 'checkout_ready', updated_at = ?
           WHERE id = ?`,
        ).bind(paymentLinkId, checkoutUrl, new Date().toISOString(), applicationId).run();
      } else {
        paymentDetail = link.detail || 'Could not start Square checkout';
        await env.DB.prepare(
          `UPDATE sponsor_applications SET status = 'payment_setup_needed', updated_at = ? WHERE id = ?`,
        ).bind(new Date().toISOString(), applicationId).run();
      }
    } else {
      paymentDetail = 'Square payment is not connected yet. Your application was saved.';
      await env.DB.prepare(
        `UPDATE sponsor_applications SET status = 'payment_setup_needed', updated_at = ? WHERE id = ?`,
      ).bind(new Date().toISOString(), applicationId).run();
    }
    return jsonResponse({
      ok: true,
      id: applicationId,
      tier,
      tier_label: tierLabel,
      amount_cents: amountCents,
      amount_display: display,
      business_name: businessName,
      email,
      logo_url: logoUrl,
      completion_token: completionToken,
      payment_ready: paymentReady,
      checkout_url: checkoutUrl,
      mock_enabled: squareMockPayEnabled(square.env),
      mock_checkout_url: mockCheckoutUrl,
      detail: paymentReady
        ? 'Application saved. Continue to Square to pay the package amount.'
        : paymentDetail,
    });
  }
  const sponsorApplicationCompleteMatch = url.pathname.match(/^\/api\/sponsor-applications\/(\d+)\/complete$/);
  if (sponsorApplicationCompleteMatch && request.method === 'POST') {
    const applicationId = Number(sponsorApplicationCompleteMatch[1]);
    const payload = await request.json().catch(() => ({}));
    const token = String(payload.token || '').trim();
    const mock = Boolean(payload.mock);
    if (!applicationId) return jsonResponse({ detail: 'Application not found' }, 404);
    if (mock && !squareMockPayEnabled(env)) {
      return jsonResponse({ detail: 'Mock payments are disabled' }, 403);
    }
    const application = await env.DB.prepare(
      `SELECT id, tier, amount_cents, amount_display, business_name, address, phone, email, logo_url, status,
              square_payment_link_id, square_checkout_url, completion_token, sponsor_id, paid_at, invoice_sent_at
       FROM sponsor_applications WHERE id = ?`,
    ).bind(applicationId).first();
    if (!application) return jsonResponse({ detail: 'Application not found' }, 404);
    if (!token || token !== String(application.completion_token || '')) {
      return jsonResponse({ detail: 'Invalid payment completion token' }, 403);
    }
    if (!['pending_payment', 'checkout_ready', 'payment_setup_needed', 'paid', 'paid_mock'].includes(String(application.status || ''))) {
      return jsonResponse({ detail: 'This application cannot be completed' }, 422);
    }
    try {
      const result = await activatePaidSponsorApplication(env, application, { mock });
      const invoice = await maybeSendSponsorInvoice(env, {
        ...application,
        ...result.application,
      });
      try {
        await recordSponsorPaymentLedger(env, {
          ...application,
          ...result.application,
        });
      } catch { /* ledger is best-effort */ }
      return jsonResponse({
        ok: true,
        mock: result.mock,
        created: result.created,
        sponsor: result.sponsor,
        application_id: applicationId,
        invoice_sent: Boolean(invoice.ok && !invoice.skipped),
        invoice_detail: invoice.detail || '',
        detail: result.created
          ? `${result.sponsor.level} activated for ${result.sponsor.name}.`
          : 'Sponsorship was already activated.',
      });
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Could not activate sponsorship' }, 422);
    }
  }
  const sponsorApplicationPayMatch = url.pathname.match(/^\/api\/sponsor-applications\/(\d+)\/pay$/);
  if (sponsorApplicationPayMatch && request.method === 'POST') {
    const applicationId = Number(sponsorApplicationPayMatch[1]);
    const payload = await request.json().catch(() => ({}));
    const token = String(payload.token || '').trim();
    const sourceId = String(payload.source_id || payload.sourceId || '').trim();
    if (!applicationId) return jsonResponse({ detail: 'Application not found' }, 404);
    if (!sourceId) return jsonResponse({ detail: 'Payment card token is required' }, 422);
    const application = await env.DB.prepare(
      `SELECT id, tier, amount_cents, amount_display, business_name, address, phone, email, logo_url, status,
              square_payment_link_id, square_checkout_url, completion_token, sponsor_id, paid_at, invoice_sent_at
       FROM sponsor_applications WHERE id = ?`,
    ).bind(applicationId).first();
    if (!application) return jsonResponse({ detail: 'Application not found' }, 404);
    if (!token || token !== String(application.completion_token || '')) {
      return jsonResponse({ detail: 'Invalid payment completion token' }, 403);
    }
    if (application.sponsor_id) {
      const existing = await env.DB.prepare(
        'SELECT id, name, address, city, state, logo_url, level, mark_text, sort_order, active, homepage_ad FROM sponsors WHERE id = ?',
      ).bind(application.sponsor_id).first();
      return jsonResponse({
        ok: true,
        created: false,
        sponsor: existing ? hydrateSponsor(existing) : null,
        application_id: applicationId,
        detail: 'Sponsorship was already activated.',
      });
    }
    const square = await resolveSquareRuntimeEnv(env);
    if (!squareCheckoutConfigured(square.env)) {
      return jsonResponse({ detail: 'Square payment is not connected yet' }, 503);
    }
    const payment = await createSquareCardPayment(square.env, {
      sourceId,
      amountCents: application.amount_cents,
      referenceId: `sponsor-${applicationId}`,
      note: `EFHS Band ${String(application.tier || '').toUpperCase()} sponsor — ${application.business_name}`,
    });
    if (!payment.ok) {
      return jsonResponse({ detail: payment.detail || 'Square payment failed' }, 422);
    }
    try {
      const result = await activatePaidSponsorApplication(env, application, { mock: false });
      await env.DB.prepare(
        `UPDATE sponsor_applications
         SET square_payment_link_id = ?, status = 'paid', updated_at = ?
         WHERE id = ?`,
      ).bind(payment.payment_id || '', new Date().toISOString(), applicationId).run();
      const invoice = await maybeSendSponsorInvoice(env, {
        ...application,
        ...result.application,
      });
      try {
        await recordSponsorPaymentLedger(env, {
          ...application,
          ...result.application,
          square_payment_id: payment.payment_id || '',
        });
      } catch { /* ledger is best-effort */ }
      return jsonResponse({
        ok: true,
        created: result.created,
        sponsor: result.sponsor,
        application_id: applicationId,
        payment_id: payment.payment_id,
        invoice_sent: Boolean(invoice.ok && !invoice.skipped),
        invoice_detail: invoice.detail || '',
        detail: result.created
          ? `${result.sponsor.level} activated for ${result.sponsor.name}.`
          : 'Sponsorship was already activated.',
      });
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Payment succeeded but sponsorship activation failed' }, 500);
    }
  }
  if (url.pathname === '/api/donations' && request.method === 'POST') {
    const payload = await request.json().catch(() => ({}));
    const donorName = String(payload.donor_name || payload.name || '').trim();
    const amountDisplay = String(payload.amount_display || '').trim();
    const amountCents = resolveSponsorAmountCents({
      amountCents: payload.amount_cents,
      amountDisplay: payload.amount_display || amountDisplay || payload.amount,
    });
    if (!donorName || donorName.length > 160) {
      return jsonResponse({ detail: 'Donor name is required' }, 422);
    }
    if (!amountCents || amountCents < 500) {
      return jsonResponse({ detail: 'Enter a donation amount of at least $5' }, 422);
    }
    if (amountCents > 2_500_000) {
      return jsonResponse({ detail: 'Donation amount cannot exceed $25,000' }, 422);
    }
    const display = amountDisplay || formatSponsorAmountDisplay(amountCents);
    const now = new Date().toISOString();
    const completionToken = crypto.randomUUID().replace(/-/g, '');
    const insert = await env.DB.prepare(
      `INSERT INTO donations
        (donor_name, amount_cents, amount_display, status, completion_token, created_at, updated_at)
       VALUES (?, ?, ?, 'pending_payment', ?, ?, ?)`,
    ).bind(donorName, amountCents, display, completionToken, now, now).run();
    const donationId = insert.meta.last_row_id;
    const config = await buildSquareCheckoutConfig(env);
    return jsonResponse({
      ok: true,
      id: donationId,
      donor_name: donorName,
      amount_cents: amountCents,
      amount_display: display,
      completion_token: completionToken,
      payment_ready: config.web_payments,
      web_payments: config.web_payments,
      mock_enabled: config.mock_enabled,
      detail: config.web_payments
        ? 'Donation saved. Continue to Square to pay.'
        : (config.configured
          ? 'Donation saved. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.'
          : 'Donation saved. Square payment is not connected yet.'),
    });
  }
  const donationPayMatch = url.pathname.match(/^\/api\/donations\/(\d+)\/pay$/);
  if (donationPayMatch && request.method === 'POST') {
    const donationId = Number(donationPayMatch[1]);
    const payload = await request.json().catch(() => ({}));
    const token = String(payload.token || '').trim();
    const sourceId = String(payload.source_id || payload.sourceId || '').trim();
    const mock = Boolean(payload.mock);
    if (!donationId) return jsonResponse({ detail: 'Donation not found' }, 404);
    const donation = await env.DB.prepare(
      `SELECT id, donor_name, amount_cents, amount_display, status, square_payment_id, completion_token, paid_at
       FROM donations WHERE id = ?`,
    ).bind(donationId).first();
    if (!donation) return jsonResponse({ detail: 'Donation not found' }, 404);
    if (!token || token !== String(donation.completion_token || '')) {
      return jsonResponse({ detail: 'Invalid payment completion token' }, 403);
    }
    if (['paid', 'paid_mock'].includes(String(donation.status || '')) || donation.paid_at) {
      return jsonResponse({
        ok: true,
        created: false,
        donation_id: donationId,
        donor_name: donation.donor_name,
        amount_cents: donation.amount_cents,
        amount_display: donation.amount_display,
        detail: 'This donation was already paid. Thank you!',
      });
    }
    if (mock) {
      if (!squareMockPayEnabled(env)) {
        return jsonResponse({ detail: 'Mock payments are disabled' }, 403);
      }
      const paidAt = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE donations
         SET status = 'paid_mock', paid_at = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(paidAt, paidAt, donationId).run();
      try {
        await recordDonorPaymentLedger(env, { ...donation, paid_at: paidAt, status: 'paid_mock' });
      } catch { /* ledger is best-effort */ }
      return jsonResponse({
        ok: true,
        mock: true,
        created: true,
        donation_id: donationId,
        donor_name: donation.donor_name,
        amount_cents: donation.amount_cents,
        amount_display: donation.amount_display,
        detail: `Thank you, ${donation.donor_name}! Your ${donation.amount_display} donation was recorded.`,
      });
    }
    if (!sourceId) return jsonResponse({ detail: 'Payment card token is required' }, 422);
    const square = await resolveSquareRuntimeEnv(env);
    if (!squareCheckoutConfigured(square.env)) {
      return jsonResponse({ detail: 'Square payment is not connected yet' }, 503);
    }
    const payment = await createSquareCardPayment(square.env, {
      sourceId,
      amountCents: donation.amount_cents,
      referenceId: `donate-${donationId}`,
      note: `EFHS Band donation — ${donation.donor_name}`,
    });
    if (!payment.ok) {
      return jsonResponse({ detail: payment.detail || 'Square payment failed' }, 422);
    }
    const paidAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE donations
       SET square_payment_id = ?, status = 'paid', paid_at = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(payment.payment_id || '', paidAt, paidAt, donationId).run();
    try {
      await recordDonorPaymentLedger(env, {
        ...donation,
        paid_at: paidAt,
        status: 'paid',
        square_payment_id: payment.payment_id || '',
      });
    } catch { /* ledger is best-effort */ }
    return jsonResponse({
      ok: true,
      created: true,
      donation_id: donationId,
      donor_name: donation.donor_name,
      amount_cents: donation.amount_cents,
      amount_display: donation.amount_display,
      payment_id: payment.payment_id,
      detail: `Thank you, ${donation.donor_name}! Your ${donation.amount_display} donation was received.`,
    });
  }
  if (url.pathname === '/api/dues' && request.method === 'POST') {
    const payload = await request.json().catch(() => ({}));
    const studentName = String(payload.student_name || payload.child_name || payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const amountDisplay = String(payload.amount_display || '').trim();
    const amountCents = resolveSponsorAmountCents({
      amountCents: payload.amount_cents,
      amountDisplay: payload.amount_display || amountDisplay || payload.amount,
    });
    if (!studentName || studentName.length > 160) {
      return jsonResponse({ detail: 'Student full name is required' }, 422);
    }
    if (!isValidEmail(email)) {
      return jsonResponse({ detail: 'A valid receipt email is required' }, 422);
    }
    if (!amountCents || amountCents < 100) {
      return jsonResponse({ detail: 'Enter a dues amount of at least $1' }, 422);
    }
    if (amountCents > 2_500_000) {
      return jsonResponse({ detail: 'Dues amount cannot exceed $25,000' }, 422);
    }
    const display = amountDisplay || formatSponsorAmountDisplay(amountCents);
    const now = new Date().toISOString();
    const completionToken = crypto.randomUUID().replace(/-/g, '');
    const insert = await env.DB.prepare(
      `INSERT INTO dues_payments
        (student_name, email, amount_cents, amount_display, status, completion_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending_payment', ?, ?, ?)`,
    ).bind(studentName, email, amountCents, display, completionToken, now, now).run();
    const duesId = insert.meta.last_row_id;
    const config = await buildSquareCheckoutConfig(env);
    return jsonResponse({
      ok: true,
      id: duesId,
      student_name: studentName,
      email,
      amount_cents: amountCents,
      amount_display: display,
      completion_token: completionToken,
      payment_ready: config.web_payments,
      web_payments: config.web_payments,
      mock_enabled: config.mock_enabled,
      detail: config.web_payments
        ? 'Dues payment saved. Continue to Square to pay.'
        : (config.configured
          ? 'Dues payment saved. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.'
          : 'Dues payment saved. Square payment is not connected yet.'),
    });
  }
  const duesPayMatch = url.pathname.match(/^\/api\/dues\/(\d+)\/pay$/);
  if (duesPayMatch && request.method === 'POST') {
    const duesId = Number(duesPayMatch[1]);
    const payload = await request.json().catch(() => ({}));
    const token = String(payload.token || '').trim();
    const sourceId = String(payload.source_id || payload.sourceId || '').trim();
    const mock = Boolean(payload.mock);
    if (!duesId) return jsonResponse({ detail: 'Dues payment not found' }, 404);
    const dues = await env.DB.prepare(
      `SELECT id, student_name, email, amount_cents, amount_display, status, square_payment_id, completion_token, failure_detail, receipt_sent_at, paid_at, updated_at
       FROM dues_payments WHERE id = ?`,
    ).bind(duesId).first();
    if (!dues) return jsonResponse({ detail: 'Dues payment not found' }, 404);
    if (!token || token !== String(dues.completion_token || '')) {
      return jsonResponse({ detail: 'Invalid payment completion token' }, 403);
    }
    if (['paid', 'paid_mock'].includes(String(dues.status || '')) || dues.paid_at) {
      return jsonResponse({
        ok: true,
        created: false,
        dues_id: duesId,
        student_name: dues.student_name,
        email: dues.email,
        amount_cents: dues.amount_cents,
        amount_display: dues.amount_display,
        detail: 'This band dues payment was already completed. Thank you!',
      });
    }

    async function finalizeDuesFailure(detail) {
      const failedAt = new Date().toISOString();
      const failureDetail = String(detail || 'Payment failed').trim().slice(0, 500);
      await env.DB.prepare(
        `UPDATE dues_payments
         SET status = 'payment_failed', failure_detail = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(failureDetail, failedAt, duesId).run();
      const failedRow = { ...dues, status: 'payment_failed', failure_detail: failureDetail, updated_at: failedAt };
      try {
        await recordDuesFailedLedger(env, failedRow);
      } catch { /* ledger is best-effort */ }
      let receipt = { ok: false, detail: '' };
      try {
        receipt = await sendDuesReceipt(env, failedRow, { failed: true });
      } catch (error) {
        receipt = { ok: false, detail: error?.message || 'Could not send failed receipt' };
      }
      return jsonResponse({
        ok: false,
        failed: true,
        dues_id: duesId,
        student_name: dues.student_name,
        email: dues.email,
        amount_cents: dues.amount_cents,
        amount_display: dues.amount_display,
        receipt_sent: Boolean(receipt.ok),
        receipt_detail: receipt.detail || '',
        detail: failureDetail,
      }, 422);
    }

    if (mock) {
      if (!squareMockPayEnabled(env)) {
        return jsonResponse({ detail: 'Mock payments are disabled' }, 403);
      }
      const paidAt = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE dues_payments
         SET status = 'paid_mock', failure_detail = '', paid_at = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(paidAt, paidAt, duesId).run();
      const paidRow = { ...dues, paid_at: paidAt, status: 'paid_mock', failure_detail: '' };
      try {
        await recordDuesPaymentLedger(env, paidRow);
      } catch { /* ledger is best-effort */ }
      let receipt = { ok: false, detail: '' };
      try {
        receipt = await sendDuesReceipt(env, paidRow, { failed: false });
      } catch (error) {
        receipt = { ok: false, detail: error?.message || 'Could not send receipt' };
      }
      return jsonResponse({
        ok: true,
        mock: true,
        created: true,
        dues_id: duesId,
        student_name: dues.student_name,
        email: dues.email,
        amount_cents: dues.amount_cents,
        amount_display: dues.amount_display,
        receipt_sent: Boolean(receipt.ok),
        receipt_detail: receipt.detail || '',
        detail: `Thank you! Band dues of ${dues.amount_display} for ${dues.student_name} were recorded.`,
      });
    }
    if (!sourceId) return finalizeDuesFailure('Payment card token is required');
    const square = await resolveSquareRuntimeEnv(env);
    if (!squareCheckoutConfigured(square.env)) {
      return finalizeDuesFailure('Square payment is not connected yet');
    }
    const payment = await createSquareCardPayment(square.env, {
      sourceId,
      amountCents: dues.amount_cents,
      referenceId: `dues-${duesId}`,
      note: `EFHS Band dues — ${dues.student_name}`,
    });
    if (!payment.ok) {
      return finalizeDuesFailure(payment.detail || 'Square payment failed');
    }
    const paidAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE dues_payments
       SET square_payment_id = ?, status = 'paid', failure_detail = '', paid_at = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(payment.payment_id || '', paidAt, paidAt, duesId).run();
    const paidRow = {
      ...dues,
      paid_at: paidAt,
      status: 'paid',
      square_payment_id: payment.payment_id || '',
      failure_detail: '',
    };
    try {
      await recordDuesPaymentLedger(env, paidRow);
    } catch { /* ledger is best-effort */ }
    let receipt = { ok: false, detail: '' };
    try {
      receipt = await sendDuesReceipt(env, paidRow, { failed: false });
    } catch (error) {
      receipt = { ok: false, detail: error?.message || 'Could not send receipt' };
    }
    return jsonResponse({
      ok: true,
      created: true,
      dues_id: duesId,
      student_name: dues.student_name,
      email: dues.email,
      amount_cents: dues.amount_cents,
      amount_display: dues.amount_display,
      payment_id: payment.payment_id,
      receipt_sent: Boolean(receipt.ok),
      receipt_detail: receipt.detail || '',
      detail: `Thank you! Band dues of ${dues.amount_display} for ${dues.student_name} were received.`,
    });
  }
  if (url.pathname === '/api/staff' && request.method === 'GET') return jsonResponse(await getStaff(env));
  if (url.pathname === '/api/booster-members' && request.method === 'GET') return jsonResponse(await getBoosterMembers(env));
  if (url.pathname === '/api/contact/topics' && request.method === 'GET') {
    const topics = (await getContactTopics(env)).filter((topic) => (topic.emails || []).length > 0);
    return jsonResponse(topics.map((topic) => ({ id: topic.id, label: topic.label, sort_order: topic.sort_order })));
  }
  if (url.pathname === '/api/contact' && request.method === 'POST') {
    const payload = await request.json().catch(() => ({}));
    if (String(payload.company || '').trim()) {
      return jsonResponse({ ok: true }); // honeypot
    }
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const message = String(payload.message || '').trim();
    const topicId = Number(payload.topic_id);
    if (!name || !isValidEmail(email) || !message || !topicId) {
      return jsonResponse({ detail: 'Name, valid email, topic, and message are required' }, 422);
    }
    if (name.length > 120 || message.length > 5000) {
      return jsonResponse({ detail: 'Message is too long' }, 422);
    }
    const topicRow = await env.DB.prepare('SELECT id, label, email, recipient_user_ids, active FROM contact_topics WHERE id = ?').bind(topicId).first();
    if (!topicRow || !topicRow.active) return jsonResponse({ detail: 'Selected topic is unavailable' }, 422);
    const recipientInfo = await resolveContactTopicRecipients(env, topicRow);
    if (!recipientInfo.emails.length) {
      return jsonResponse({ detail: 'This topic is not configured for delivery yet. Please try another topic or email the band office directly.' }, 503);
    }
    const subject = `EFHS Band contact: ${topicRow.label}`;
    const text = [
      `Topic: ${topicRow.label}`,
      `From: ${name} <${email}>`,
      `Delivered to: ${recipientInfo.emails.join(', ')}`,
      '',
      message,
      '',
      '— Sent from the East Forsyth Band website contact form',
    ].join('\n');
    let delivered = 0;
    let deliveryError = '';
    try {
      await sendContactEmail(env, { to: recipientInfo.emails, replyTo: email, subject, text, name });
      delivered = 1;
    } catch (error) {
      deliveryError = String(error?.message || error || 'Delivery failed');
    }
    await env.DB.prepare(
      'INSERT INTO contact_messages (topic_id, topic_label, to_email, name, email, message, delivered, delivery_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(topicRow.id, topicRow.label, recipientInfo.emails.join(', '), name, email, message, delivered, deliveryError).run();
    if (!delivered) {
      return jsonResponse({
        ok: true,
        delivered: false,
        detail: 'Message received. Staff can review it in the admin Contact tab while email delivery is being configured.',
      });
    }
    return jsonResponse({ ok: true, delivered: true, detail: 'Message sent. Thank you!' });
  }
  if (url.pathname === '/api/photos' && request.method === 'GET') return jsonResponse(await getPhotos(env));
  if (url.pathname === '/api/pages' && request.method === 'GET') return jsonResponse((await getPages(env)).map(({ body_html, ...page }) => page));
  const publicPageMatch = url.pathname.match(/^\/api\/pages\/([a-z0-9-]+)$/);
  if (publicPageMatch && request.method === 'GET') {
    const page = await getPageBySlug(env, publicPageMatch[1]);
    return page ? jsonResponse(page) : jsonResponse({ detail: 'Not found' }, 404);
  }

  if (url.pathname === '/api/admin/me') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    return jsonResponse({ user: publicUser(auth.user), permissions: GLOBAL_PERMISSIONS, pages: (await getPages(env, true)).map((page) => ({ slug: page.slug, title: page.title, path: page.path, active: Boolean(page.active), nav_order: page.nav_order })) });
  }
  if (url.pathname === '/api/admin/security-log' && request.method === 'GET') {
    const auth = await requireSecurityLogAccess(request, env);
    if (auth.response) return auth.response;
    const pageSize = Math.min(Math.max(Number(url.searchParams.get('limit') || 5), 1), 5);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
    const actionFilter = String(url.searchParams.get('action') || '').trim();
    const actorFilter = String(url.searchParams.get('actor') || '').trim();
    const payload = await listAdminAuditLogs(env, {
      // CMS preview shows 5 entries per page; full history is in the PDF download.
      limit: pageSize,
      offset,
      action: actionFilter,
      actor: actorFilter,
    });
    const totalPages = Math.max(1, Math.ceil((Number(payload.total) || 0) / pageSize) || 1);
    const page = Math.floor(offset / pageSize) + 1;
    // Log vault access on first-page opens/refreshes only — not every pager click.
    if (offset === 0) {
      await writeAdminAuditLog(env, {
        action: 'security.log.view',
        category: 'security',
        method: 'GET',
        path: '/api/admin/security-log',
        status: 200,
        actor_user_id: auth.user.id,
        actor_username: auth.user.username,
        ip: requestClientIp(request),
        user_agent: request.headers.get('user-agent') || '',
        summary: buildAuditSummary({
          action: 'security.log.view',
          method: 'GET',
          path: '/api/admin/security-log',
          status: 200,
          actorUsername: auth.user.username,
          detail: 'preview opened',
        }),
        meta: {
          preview_limit: pageSize,
          page: 1,
          filters: {
            action: actionFilter,
            actor: actorFilter,
          },
        },
      });
    }
    return jsonResponse({
      ...payload,
      preview_limit: pageSize,
      page,
      page_size: pageSize,
      total_pages: totalPages,
      storage: 'encrypted-server-database',
      access: 'super_admin_only',
      mode: 'view_print_only',
      editable: false,
    });
  }
  if (url.pathname === '/api/admin/website-guide.pdf' && request.method === 'GET') {
    const auth = await requireSuperAdmin(request, env);
    if (auth.response) return auth.response;
    const guideUrl = new URL(CMS_WEBSITE_GUIDE_PDF_PATH, request.url);
    const guideAsset = await env.ASSETS.fetch(new Request(guideUrl, request));
    if (!guideAsset.ok) {
      return jsonResponse({ detail: 'Website Guide PDF is missing from deployment assets' }, 404);
    }
    const headers = new Headers(guideAsset.headers);
    headers.set('content-type', 'application/pdf');
    headers.set('content-disposition', 'inline; filename="EFHS-Band-Website-CMS-Guide-Super-Admin.pdf"');
    headers.set('cache-control', 'private, no-store');
    return new Response(guideAsset.body, { status: 200, headers });
  }
  if ((url.pathname === '/api/admin/security-log.pdf' || url.pathname === '/api/admin/security-log.txt') && request.method === 'GET') {
    const auth = await requireSecurityLogAccess(request, env);
    if (auth.response) return auth.response;
    const payload = await listAdminAuditLogs(env, {
      limit: Math.min(Number(url.searchParams.get('limit') || 1000), 2000),
      offset: 0,
      action: String(url.searchParams.get('action') || '').trim(),
      actor: String(url.searchParams.get('actor') || '').trim(),
    });
    await writeAdminAuditLog(env, {
      action: 'security.log.export',
      category: 'security',
      method: 'GET',
      path: url.pathname,
      status: 200,
      actor_user_id: auth.user.id,
      actor_username: auth.user.username,
      ip: requestClientIp(request),
      user_agent: request.headers.get('user-agent') || '',
      summary: buildAuditSummary({
        action: 'security.log.export',
        method: 'GET',
        path: url.pathname,
        status: 200,
        actorUsername: auth.user.username,
        detail: `exported ${payload.entries.length} entries`,
      }),
      meta: {
        entry_count: payload.entries.length,
        total: payload.total,
        format: 'pdf',
      },
    });
    const pdfBase64 = buildAdminAuditExportPdfBase64(payload.entries);
    const bytes = Uint8Array.from(atob(pdfBase64), (char) => char.charCodeAt(0));
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="efhsband-security-audit-log.pdf"',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex, nofollow',
      },
    });
  }


  if (url.pathname === '/api/admin/site' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const payload = await request.json();
    for (const key of ['title', 'hero_title', 'hero_subtitle', 'footer_note', 'logo_url']) {
      if (payload[key] === undefined) continue;
      let value = String(payload[key]);
      if (key === 'hero_title' || key === 'title') value = sanitizeInlineRichHtml(value) || htmlToPlainText(value);
      if (key === 'hero_subtitle' || key === 'footer_note') {
        value = looksLikeHtml(value) ? sanitizeRichHtml(value) : value;
      }
      await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run();
    }
    if (payload.maintenance_mode !== undefined) {
      const enabled = isMaintenanceMode({ maintenance_mode: payload.maintenance_mode }) ? '1' : '0';
      await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('maintenance_mode', enabled).run();
    }
    if (payload.boosters_dues_enabled !== undefined) {
      if (!isSuperAdmin(auth.user)) {
        return jsonResponse({ detail: 'Only Super Admins can change the Band dues Boosters setting.' }, 403);
      }
      const duesEnabled = isBoostersDuesEnabled({ boosters_dues_enabled: payload.boosters_dues_enabled }) ? '1' : '0';
      await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('boosters_dues_enabled', duesEnabled).run();
      await syncBoostersDuesCmsBody(env, duesEnabled === '1');
    }
    return jsonResponse(await getSite(env));
  }

  if (url.pathname === '/api/admin/utility-links' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canManageUtilityLinks(auth.user)) return jsonResponse({ detail: 'Permission required: page:home' }, 403);
    const site = await getSite(env);
    return jsonResponse({ utility_links: site.utility_links });
  }
  if (url.pathname === '/api/admin/utility-links' && request.method === 'PUT') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canManageUtilityLinks(auth.user)) return jsonResponse({ detail: 'Permission required: page:home' }, 403);
    const payload = await request.json();
    const links = normalizeUtilityLinks(payload.utility_links || payload);
    if (!links.length) return jsonResponse({ detail: 'Add at least one utility link.' }, 422);
    await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind('utility_links', JSON.stringify(links))
      .run();
    return jsonResponse({ utility_links: links });
  }

  if (url.pathname === '/api/admin/social-links' && request.method === 'GET') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const site = await getSite(env);
    return jsonResponse({ social_links: site.social_links });
  }
  if (url.pathname === '/api/admin/social-links' && request.method === 'PUT') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const payload = await request.json();
    const links = normalizeSocialLinks(payload.social_links || payload);
    await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind('social_links', JSON.stringify(links.map(({ platform, href }) => ({ platform, href }))))
      .run();
    return jsonResponse({ social_links: links });
  }

  if (url.pathname === '/api/admin/zernio/facebook' && request.method === 'GET') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const sync = url.searchParams.get('sync') === '1' || url.searchParams.get('refresh') === '1';
    return jsonResponse(await getZernioFacebookStatus(env, { sync }));
  }
  if (url.pathname === '/api/admin/zernio/facebook' && request.method === 'DELETE') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const status = await getZernioFacebookStatus(env);
    if (status.account?.accountId && (await zernioConfigured(env))) {
      try {
        await zernioApi(env, `/accounts/${encodeURIComponent(status.account.accountId)}`, { method: 'DELETE' });
      } catch {
        // Local disconnect still proceeds if Zernio revoke fails.
      }
    }
    await setSiteContentValue(env, ZERNIO_FACEBOOK_KEY, '');
    await setZernioFacebookPending(env, null);
    return jsonResponse(await getZernioFacebookStatus(env));
  }
  if (url.pathname === '/api/admin/zernio/facebook/pages' && request.method === 'GET') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    if (!(await zernioConfigured(env))) return jsonResponse({ detail: 'ZERNIO_API_KEY is not configured' }, 503);
    const pending = await getZernioFacebookPending(env);
    if (!pending) return jsonResponse({ detail: 'No pending Facebook Page selection. Click Connect Facebook again.', pages: [] }, 400);
    try {
      const pages = await listZernioFacebookPages(env, pending);
      return jsonResponse({ pages, pending: true });
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Could not list Facebook Pages', pages: [] }, 502);
    }
  }
  if (url.pathname === '/api/admin/zernio/facebook/select-page' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    if (!(await zernioConfigured(env))) return jsonResponse({ detail: 'ZERNIO_API_KEY is not configured' }, 503);
    const pending = await getZernioFacebookPending(env);
    if (!pending) return jsonResponse({ detail: 'No pending Facebook Page selection. Click Connect Facebook again.' }, 400);
    let pageId = '';
    try {
      const payload = await request.json();
      pageId = String(payload?.pageId || payload?.page_id || '').trim();
    } catch {
      return jsonResponse({ detail: 'Invalid JSON body' }, 400);
    }
    try {
      const connection = await selectZernioFacebookPage(env, pending, pageId, request.url);
      return jsonResponse({
        ok: true,
        account: connection,
        ...(await getZernioFacebookStatus(env)),
      });
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Could not select Facebook Page' }, 502);
    }
  }
  if (url.pathname === '/api/admin/zernio/facebook/events' && request.method === 'GET') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    try {
      await getZernioFacebookStatus(env, { sync: true });
      return jsonResponse(await getFacebookEventQueueStatus(env));
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Could not load Facebook event queue' }, 502);
    }
  }
  if (url.pathname === '/api/admin/zernio/facebook/events/ignore-all' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    try {
      return jsonResponse(await ignoreAllFacebookEventSuggestions(env));
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Could not clear suggested calendar updates' }, 502);
    }
  }
  const facebookEventIgnoreMatch = url.pathname.match(/^\/api\/admin\/zernio\/facebook\/events\/(\d+)\/ignore$/);
  if (facebookEventIgnoreMatch && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    try {
      return jsonResponse(await ignoreFacebookEventSuggestion(env, facebookEventIgnoreMatch[1]));
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Could not ignore calendar update' }, 502);
    }
  }
  if (url.pathname === '/api/admin/zernio/facebook/events/publish' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    if (!(await zernioConfigured(env))) return jsonResponse({ detail: 'ZERNIO_API_KEY is not configured' }, 503);
    try {
      return jsonResponse(await publishFacebookEventQueue(env), 201);
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Could not publish calendar updates' }, 502);
    }
  }
  if (url.pathname === '/api/admin/zernio/posts' && request.method === 'GET') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    if (!(await zernioConfigured(env))) return jsonResponse({ detail: 'ZERNIO_API_KEY is not configured' }, 503);
    try {
      const data = await zernioApi(env, '/posts?limit=20');
      const posts = Array.isArray(data?.posts) ? data.posts : (Array.isArray(data) ? data : []);
      return jsonResponse({ posts });
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Could not load posts' }, 502);
    }
  }
  if (url.pathname === '/api/admin/zernio/posts' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    if (!(await zernioConfigured(env))) return jsonResponse({ detail: 'ZERNIO_API_KEY is not configured' }, 503);
    const status = await getZernioFacebookStatus(env, { sync: true });
    if (!status.connected) return jsonResponse({ detail: 'Connect a Facebook Page before posting.' }, 400);
    let body;
    try {
      body = normalizeZernioPostPayload(await request.json(), status.account);
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Invalid post' }, 422);
    }
    try {
      const created = await zernioApi(env, '/posts', { method: 'POST', body: JSON.stringify(body) });
      return jsonResponse({ ok: true, post: created?.post || created }, 201);
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Could not create post' }, 502);
    }
  }

  if (url.pathname === '/api/admin/zernio/instagram' && request.method === 'GET') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const sync = String(url.searchParams.get('sync') || '') === '1';
    return jsonResponse(await getZernioInstagramStatus(env, { sync }));
  }
  if (url.pathname === '/api/admin/zernio/instagram' && request.method === 'DELETE') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const status = await getZernioInstagramStatus(env);
    if (status.account?.accountId && (await zernioConfigured(env))) {
      try {
        await zernioApi(env, `/accounts/${encodeURIComponent(status.account.accountId)}`, { method: 'DELETE' });
      } catch {
        // Clear local link even if remote disconnect fails.
      }
    }
    await setSiteContentValue(env, ZERNIO_INSTAGRAM_KEY, '');
    return jsonResponse(await getZernioInstagramStatus(env));
  }
  if (url.pathname === '/api/admin/zernio/instagram/settings' && request.method === 'PUT') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const payload = await request.json().catch(() => ({}));
    const enabled = payload.gallery_autopost !== false && payload.gallery_autopost !== 0 && payload.gallery_autopost !== '0';
    await setInstagramGalleryAutopostEnabled(env, enabled);
    return jsonResponse(await getZernioInstagramStatus(env));
  }

  if (url.pathname === '/api/admin/logo' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'site');
    if (auth.response) return auth.response;
    const form = await request.formData();
    try {
      const stored = await storeImageUpload(env, form.get('file'), 'Site logo', 'Logo', -1000);
      await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('logo_url', stored.url).run();
      return jsonResponse({ ...stored, site: await getSite(env) });
    } catch (error) {
      return jsonResponse({ detail: error.message }, 400);
    }
  }

  if (url.pathname === '/api/admin/password' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const payload = await request.json();
    const check = validateSelfPasswordChange(payload);
    if (!check.ok) return jsonResponse({ detail: check.detail }, check.status);
    if (!(await verifyPassword(check.current_password, auth.user.password_hash))) {
      return jsonResponse({ detail: 'Current password is incorrect' }, 400);
    }
    await updatePassword(env, auth.user.id, check.new_password);
    return jsonResponse({ ok: true });
  }

  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    const auth = await requirePermission(request, env, 'users');
    if (auth.response) return auth.response;
    const rows = await env.DB.prepare('SELECT id, username, display_name, role, permissions, active, last_login_at FROM users ORDER BY username').all();
    return jsonResponse((rows.results || []).map(publicUser));
  }
  if (url.pathname === '/api/admin/users' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'users');
    if (auth.response) return auth.response;
    const payload = await request.json();
    const username = String(payload.username || '').trim();
    const password = String(payload.password || '');
    if (!username || !password) return jsonResponse({ detail: 'Username and password are required' }, 422);
    if (password.length < 8) return jsonResponse({ detail: 'Password must be at least 8 characters' }, 422);
    const displayName = String(payload.display_name || '').trim();
    if (!displayName) return jsonResponse({ detail: 'Display name is required' }, 422);
    const wantsAdmin = payload.role === 'admin';
    if (wantsAdmin && !isSuperAdmin(auth.user)) {
      return jsonResponse({ detail: 'Only Super Admins can create Super Admin accounts' }, 403);
    }
    try {
      const result = await env.DB.prepare('INSERT INTO users (username, display_name, password_hash, role, permissions, active) VALUES (?, ?, ?, ?, ?, ?)').bind(username, displayName, await hashPassword(password), wantsAdmin ? 'admin' : 'editor', JSON.stringify(parsePermissions(payload.permissions)), payload.active === false ? 0 : 1).run();
      const created = await env.DB.prepare('SELECT id, username, display_name, role, permissions, active, last_login_at FROM users WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(publicUser(created));
    } catch (error) {
      const message = String(error?.message || error || '');
      if (message.includes('UNIQUE') || message.includes('unique')) {
        return jsonResponse({ detail: 'A user with that username already exists' }, 409);
      }
      throw error;
    }
  }
  const userMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch && request.method === 'PUT') {
    const auth = await requirePermission(request, env, 'users');
    if (auth.response) return auth.response;
    const id = Number(userMatch[1]);
    const payload = await request.json();
    const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!existing) return jsonResponse({ detail: 'User not found' }, 404);
    if (isSuperAdmin(existing) && !isSuperAdmin(auth.user)) {
      return jsonResponse({ detail: 'Only Super Admins can edit Super Admin accounts' }, 403);
    }
    const wantsAdmin = payload.role === 'admin';
    if (wantsAdmin && !isSuperAdmin(auth.user)) {
      return jsonResponse({ detail: 'Only Super Admins can assign the Super Admin role' }, 403);
    }
    const role = wantsAdmin ? 'admin' : 'editor';
    const permissions = JSON.stringify(parsePermissions(payload.permissions));
    const displayName = String(payload.display_name || '').trim();
    if (!displayName) return jsonResponse({ detail: 'Display name is required' }, 422);
    await env.DB.prepare('UPDATE users SET username = ?, display_name = ?, role = ?, permissions = ?, active = ? WHERE id = ?').bind(String(payload.username || existing.username).trim(), displayName, role, permissions, payload.active === false ? 0 : 1, id).run();
    if (payload.password) await updatePassword(env, id, payload.password);
    return jsonResponse(publicUser(await env.DB.prepare('SELECT id, username, display_name, role, permissions, active, last_login_at FROM users WHERE id = ?').bind(id).first()));
  }
  if (userMatch && request.method === 'DELETE') {
    const auth = await requirePermission(request, env, 'users');
    if (auth.response) return auth.response;
    if (Number(userMatch[1]) === auth.user.id) return jsonResponse({ detail: 'You cannot delete your own account' }, 400);
    const existing = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(Number(userMatch[1])).first();
    if (!existing) return jsonResponse({ detail: 'User not found' }, 404);
    if (isSuperAdmin(existing) && !isSuperAdmin(auth.user)) {
      return jsonResponse({ detail: 'Only Super Admins can delete Super Admin accounts' }, 403);
    }
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(Number(userMatch[1])).run();
    return jsonResponse({ ok: true });
  }

  if (url.pathname === '/api/admin/pages' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const pages = await getPages(env, true);
    const canSee = (page) => (
      hasPermission(auth.user, 'pages')
      || canEditPage(auth.user, page.slug)
      || (page.slug === 'boosters' && hasPermission(auth.user, 'boosters'))
    );
    return jsonResponse(hasPermission(auth.user, 'pages') ? pages : pages.filter(canSee));
  }
  if (url.pathname === '/api/admin/pages' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'pages');
    if (auth.response) return auth.response;
    const page = serializePagePayload(await request.json());
    const result = await env.DB.prepare('INSERT INTO cms_pages (slug, path, title, body_html, nav_order, is_home, active) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(page.slug, page.path, page.title, page.body_html, page.nav_order, page.is_home, page.active).run();
    return jsonResponse(await env.DB.prepare('SELECT * FROM cms_pages WHERE id = ?').bind(result.meta.last_row_id).first());
  }
  const pageMatch = url.pathname.match(/^\/api\/admin\/pages\/([a-z0-9-]+)$/);
  if (pageMatch && request.method === 'PUT') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const existing = await getPageBySlug(env, pageMatch[1], true);
    if (!existing) return jsonResponse({ detail: 'Page not found' }, 404);
    const mayEditBoosters = existing.slug === 'boosters' && hasPermission(auth.user, 'boosters');
    if (!canEditPage(auth.user, existing.slug) && !mayEditBoosters) {
      return jsonResponse({ detail: `Permission required: page:${existing.slug}` }, 403);
    }
    const rawPayload = await request.json().catch(() => ({}));
    const page = serializePagePayload(rawPayload, existing);
    if (existing.slug === 'home') page.slug = 'home';
    if (existing.is_home) page.path = '/';
    await env.DB.prepare('UPDATE cms_pages SET slug = ?, path = ?, title = ?, body_html = ?, nav_order = ?, is_home = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(page.slug, page.path, page.title, page.body_html, page.nav_order, page.is_home, page.active, existing.id).run();
    const updated = await getPageBySlug(env, page.slug, true);
    let email_list = null;
    if (existing.slug === 'fundraising' && wantsEmailListNotify(rawPayload)) {
      try {
        email_list = await notifyEmailSubscribers(env, {
          topic: 'fundraising',
          action: 'updated',
          pageTitle: updated?.title || 'Fundraising',
        });
      } catch (error) {
        email_list = { ok: false, detail: error?.message || 'Email list notify failed' };
      }
    }
    return jsonResponse({ ...updated, email_list });
  }
  if (pageMatch && request.method === 'DELETE') {
    const auth = await requirePermission(request, env, 'pages');
    if (auth.response) return auth.response;
    const existing = await getPageBySlug(env, pageMatch[1], true);
    if (!existing) return jsonResponse({ detail: 'Page not found' }, 404);
    if (existing.is_home) return jsonResponse({ detail: 'Home page cannot be deleted' }, 400);
    await env.DB.prepare('DELETE FROM cms_pages WHERE id = ?').bind(existing.id).run();
    return jsonResponse({ ok: true });
  }


  if (url.pathname === '/api/admin/ensembles/body' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canEditPage(auth.user, 'ensembles')) {
      return jsonResponse({ detail: 'Permission required: page:ensembles' }, 403);
    }
    const page = await getPageBySlug(env, 'ensembles', true);
    if (!page) return jsonResponse({ detail: 'Ensembles page not found' }, 404);
    return jsonResponse({
      body_html: extractEnsemblesBodyHtml(page.body_html || ''),
      updated_at: page.updated_at || null,
    });
  }
  if (url.pathname === '/api/admin/ensembles/body' && request.method === 'PUT') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canEditPage(auth.user, 'ensembles')) {
      return jsonResponse({ detail: 'Permission required: page:ensembles' }, 403);
    }
    const page = await getPageBySlug(env, 'ensembles', true);
    if (!page) return jsonResponse({ detail: 'Ensembles page not found' }, 404);
    const payload = await request.json().catch(() => ({}));
    const nextBody = applyEnsemblesBodyHtml(page.body_html || '', payload.body_html || '');
    await env.DB.prepare(
      'UPDATE cms_pages SET body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).bind(nextBody, page.id).run();
    const updated = await getPageBySlug(env, 'ensembles', true);
    return jsonResponse({
      body_html: extractEnsemblesBodyHtml(updated?.body_html || nextBody),
      updated_at: updated?.updated_at || null,
    });
  }

  if (url.pathname === '/api/admin/sponsors/settings' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'sponsors') && !canEditPage(auth.user, 'sponsors')) return jsonResponse({ detail: 'Permission required: sponsors' }, 403);
    const site = await getSite(env);
    return jsonResponse({ sponsor_ad_seconds: site.sponsor_ad_seconds });
  }
  if (url.pathname === '/api/admin/sponsors/settings' && request.method === 'PUT') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'sponsors') && !canEditPage(auth.user, 'sponsors')) return jsonResponse({ detail: 'Permission required: sponsors' }, 403);
    const payload = await request.json();
    const seconds = normalizeSponsorAdSeconds(payload.sponsor_ad_seconds, 6);
    await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind('sponsor_ad_seconds', String(seconds))
      .run();
    return jsonResponse({ sponsor_ad_seconds: seconds });
  }
  if (url.pathname === '/api/admin/checkout/config' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canAccessCheckout(auth.user)) {
      return jsonResponse({ detail: 'Permission required: treasurer, president, or vice-president' }, 403);
    }
    const { runtime, ...config } = await buildSquareCheckoutConfig(env, { includeManage: true, user: auth.user });
    void runtime;
    return jsonResponse(config);
  }
  if (url.pathname === '/api/admin/checkout/settings' && request.method === 'POST') {
    const auth = await requireSuperAdmin(request, env);
    if (auth.response) return auth.response;
    const payload = await request.json().catch(() => ({}));
    if (payload?.clear === true) {
      await setSiteContentValue(env, SQUARE_SETTINGS_KEY, '');
      const { runtime, ...config } = await buildSquareCheckoutConfig(env, { includeManage: true, user: auth.user });
      void runtime;
      return jsonResponse({ ok: true, cleared: true, ...config });
    }
    const next = parseSquareSettings({
      access_token: payload.square_access_token || payload.access_token || payload.SQUARE_ACCESS_TOKEN,
      application_id: payload.square_application_id || payload.application_id || payload.SQUARE_APPLICATION_ID || payload.SQUARE_APP_ID,
      location_id: payload.square_location_id || payload.location_id || payload.SQUARE_LOCATION_ID,
      environment: payload.square_environment || payload.environment || payload.SQUARE_ENVIRONMENT,
    });
    if (!next.access_token || next.access_token.length < 16 || next.access_token.length > 500) {
      return jsonResponse({ detail: 'A valid Square access token is required' }, 422);
    }
    if (!next.application_id || next.application_id.length < 8 || next.application_id.length > 120) {
      return jsonResponse({ detail: 'Square application ID is required for card checkout' }, 422);
    }
    if (next.location_id && next.location_id.length > 64) {
      return jsonResponse({ detail: 'Square location ID is too long' }, 422);
    }
    const probeEnv = {
      ...env,
      SQUARE_ACCESS_TOKEN: next.access_token,
      SQUARE_APPLICATION_ID: next.application_id,
      SQUARE_LOCATION_ID: next.location_id,
      SQUARE_ENVIRONMENT: next.environment,
    };
    const location = await resolveSquareLocationId(probeEnv);
    if (!location.ok || !location.location_id) {
      return jsonResponse({
        detail: location.detail || 'Could not verify the Square access token. Check the token and environment (production vs sandbox).',
      }, 422);
    }
    if (!next.location_id) next.location_id = location.location_id;
    await setSiteContentValue(env, SQUARE_SETTINGS_KEY, JSON.stringify(next));
    const { runtime, ...config } = await buildSquareCheckoutConfig(env, { includeManage: true, user: auth.user });
    void runtime;
    return jsonResponse({
      ok: true,
      saved: true,
      ...config,
      detail: config.web_payments ? 'Square checkout is connected.' : (config.detail || 'Square settings saved.'),
    });
  }
  if (url.pathname === '/api/admin/checkout/pay' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canAccessCheckout(auth.user)) {
      return jsonResponse({ detail: 'Permission required: treasurer, president, or vice-president' }, 403);
    }
    const payload = await request.json().catch(() => ({}));
    const item = String(payload.item || payload.description || '').trim();
    const payerName = String(payload.payer_name || payload.name || payload.entity || '').trim();
    const note = String(payload.note || '').trim();
    const sourceId = String(payload.source_id || payload.sourceId || '').trim();
    const amountCents = resolveSponsorAmountCents({
      amountCents: payload.amount_cents,
      amountDisplay: payload.amount_display || payload.amount,
    });
    if (!payerName || payerName.length > 160) {
      return jsonResponse({ detail: 'User name or entity is required' }, 422);
    }
    if (!item || item.length > 200) {
      return jsonResponse({ detail: 'Description of transaction is required' }, 422);
    }
    if (!amountCents || amountCents < 100) {
      return jsonResponse({ detail: 'Amount must be at least $1.00' }, 422);
    }
    if (amountCents > 25_000_000) {
      return jsonResponse({ detail: 'Amount cannot exceed $250,000' }, 422);
    }
    if (!sourceId) {
      return jsonResponse({ detail: 'Payment card token is required' }, 422);
    }
    const amountDisplay = formatLedgerAmountDisplay(amountCents);
    const square = await resolveSquareRuntimeEnv(env);
    const payment = await createSquareCardPayment(square.env, {
      sourceId,
      amountCents,
      referenceId: `admin-checkout-${Date.now().toString(36)}`.slice(0, 40),
      note: [item, payerName ? `Payer: ${payerName}` : '', note].filter(Boolean).join(' — ').slice(0, 500),
    });
    if (!payment.ok) {
      return jsonResponse({ detail: payment.detail || 'Square payment failed' }, 422);
    }
    const paidAt = new Date().toISOString();
    try {
      const nextRef = await env.DB.prepare(
        "SELECT COALESCE(MAX(ref_id), 0) + 1 AS next_id FROM payment_ledger WHERE kind = 'fundraiser' AND ref_type = 'square_checkout'",
      ).first();
      await upsertPaymentLedgerEntry(env, {
        kind: 'fundraiser',
        refType: 'square_checkout',
        refId: Number(nextRef?.next_id || 1),
        name: payerName || item,
        address: '',
        amountCents,
        amountDisplay,
        packageLabel: item,
        note: note || `Square payment ${payment.payment_id || ''}`.trim(),
        moneyExchanged: true,
        paidAt,
      });
      await refreshPaymentLedgerXml(env);
    } catch { /* ledger is best-effort */ }
    return jsonResponse({
      ok: true,
      payment_id: payment.payment_id,
      status: payment.status,
      receipt_url: payment.receipt_url,
      amount_cents: amountCents,
      amount_display: amountDisplay,
      item,
      payer_name: payerName,
      detail: `Charged ${amountDisplay} for ${item}${payerName ? ` (${payerName})` : ''}.`,
    });
  }
  if (
    (url.pathname === '/api/admin/ledger.xls' || url.pathname === '/api/admin/ledger.xlsx' || url.pathname === '/api/admin/sponsors/payment-ledger.xls')
    && request.method === 'GET'
  ) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canAccessTreasurerLedger(auth.user)) {
      return jsonResponse({ detail: 'Permission required: treasurer' }, 403);
    }
    await backfillPaymentLedgerFromPaidRecords(env);
    const excel = await buildPaymentLedgerExcelDownload(env);
    return new Response(excel, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.ms-excel; charset=utf-8',
        'cache-control': 'no-store',
        'content-disposition': 'attachment; filename="efhs-payment-ledger.xls"',
      },
    });
  }
  if (
    (url.pathname === '/api/admin/ledger.xml' || url.pathname === '/api/admin/sponsors/payment-ledger.xml')
    && request.method === 'GET'
  ) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canAccessTreasurerLedger(auth.user)) {
      return jsonResponse({ detail: 'Permission required: treasurer' }, 403);
    }
    const rebuild = String(url.searchParams.get('rebuild') || '') === '1';
    const xml = await getPaymentLedgerXml(env, { rebuild });
    return new Response(xml, {
      status: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'no-store',
        'content-disposition': 'attachment; filename="efhs-payment-ledger.xml"',
      },
    });
  }
  if (
    (url.pathname === '/api/admin/ledger' || url.pathname === '/api/admin/sponsors/payment-ledger')
    && request.method === 'GET'
  ) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canAccessTreasurerLedger(auth.user)) {
      return jsonResponse({ detail: 'Permission required: treasurer' }, 403);
    }
    await backfillPaymentLedgerFromPaidRecords(env);
    const rebuild = String(url.searchParams.get('rebuild') || '') === '1';
    if (rebuild) await refreshPaymentLedgerXml(env);
    else await ensureDefaultInKindLedgerEntries(env);
    const loaded = await loadPaymentLedgerRows(env);
    const summary = summarizeLedgerEntries(loaded.entries);
    return jsonResponse({
      entries: loaded.entries,
      sponsors: loaded.sponsors,
      donors: loaded.donors,
      fundraisers: loaded.fundraisers,
      dues: loaded.dues,
      expenses: loaded.expenses,
      totals: {
        income_cents: summary.income_cents,
        income_display: formatLedgerAmountDisplay(summary.income_cents),
        expense_cents: summary.expense_cents,
        expense_display: formatLedgerAmountDisplay(summary.expense_cents),
        cash_cents: summary.cash_cents,
        cash_display: formatLedgerAmountDisplay(summary.cash_cents),
        in_kind_cents: summary.in_kind_cents,
        in_kind_display: formatLedgerAmountDisplay(summary.in_kind_cents),
        net_cents: summary.net_cents,
        net_display: formatLedgerAmountDisplay(summary.net_cents),
        sponsors_cents: summary.sponsors_cents,
        sponsors_display: formatLedgerAmountDisplay(summary.sponsors_cents),
        donors_cents: summary.donors_cents,
        donors_display: formatLedgerAmountDisplay(summary.donors_cents),
        fundraisers_cents: summary.fundraisers_cents,
        fundraisers_display: formatLedgerAmountDisplay(summary.fundraisers_cents),
        dues_cents: summary.dues_cents,
        dues_display: formatLedgerAmountDisplay(summary.dues_cents),
        counts: summary.counts,
      },
      download_url: '/api/admin/ledger.xls',
      xml_download_url: '/api/admin/ledger.xml',
    });
  }
  if (
    (url.pathname === '/api/admin/ledger' || url.pathname === '/api/admin/sponsors/payment-ledger/in-kind')
    && request.method === 'POST'
  ) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canAccessTreasurerLedger(auth.user)) {
      return jsonResponse({ detail: 'Permission required: treasurer' }, 403);
    }
    const payload = await request.json().catch(() => ({}));
    const kind = normalizeLedgerKind(payload.kind) || (
      String(payload.kind || '').trim().toLowerCase() === 'donor' ? 'donor' : ''
    );
    if (!kind) {
      return jsonResponse({ detail: 'Type must be sponsor, donor, fundraiser, dues, or expense' }, 422);
    }
    const name = String(payload.name || payload.business_name || '').trim();
    const address = String(payload.address || '').trim();
    const amountCents = resolveSponsorAmountCents({
      amountCents: payload.amount_cents,
      amountDisplay: payload.amount_display || payload.amount,
    });
    const signedDisplay = formatLedgerAmountDisplay(kind === 'expense' ? -Math.abs(amountCents) : Math.abs(amountCents));
    const amountDisplay = String(payload.amount_display || signedDisplay).trim() || signedDisplay;
    const moneyExchangedRaw = payload.money_exchanged;
    const forcedInKind = url.pathname.endsWith('/in-kind');
    const moneyExchanged = forcedInKind
      ? false
      : !(
        moneyExchangedRaw === false
        || moneyExchangedRaw === 0
        || moneyExchangedRaw === '0'
        || String(payload.entry_mode || '').trim().toLowerCase() === 'in_kind'
        || String(payload.payment_type || '').trim().toLowerCase() === 'in_kind'
      );
    const defaultNote = moneyExchanged
      ? (kind === 'expense' ? 'Booster expense' : '')
      : 'Fair market value for donated goods or services; no money exchanged.';
    const note = String(payload.note || defaultNote).trim();
    const defaultPackage = moneyExchanged
      ? (
        kind === 'fundraiser' ? 'Fundraiser'
          : kind === 'dues' ? 'Dues'
            : kind === 'expense' ? 'Expense'
              : kind === 'donor' ? 'Donation'
                : 'Sponsor'
      )
      : 'In-kind donated services';
    const packageLabel = String(payload.package || payload.package_label || defaultPackage).trim() || defaultPackage;
    if (!name || name.length > 200) {
      return jsonResponse({ detail: 'Name or business is required' }, 422);
    }
    if (address.length > 400) {
      return jsonResponse({ detail: 'Address is too long' }, 422);
    }
    if (!amountCents || amountCents < 1) {
      return jsonResponse({ detail: 'Enter an amount greater than $0' }, 422);
    }
    if (amountCents > 25_000_000) {
      return jsonResponse({ detail: 'Amount cannot exceed $250,000' }, 422);
    }
    if (note.length > 500) {
      return jsonResponse({ detail: 'Note is too long' }, 422);
    }
    const refType = moneyExchanged ? 'manual' : 'in_kind';
    const nextRef = await env.DB.prepare(
      'SELECT COALESCE(MAX(ref_id), 0) + 1 AS next_id FROM payment_ledger WHERE kind = ? AND ref_type = ?',
    ).bind(kind, refType).first();
    const refId = Number(nextRef?.next_id || 1);
    const paidAt = String(payload.paid_at || payload.date || new Date().toISOString()).trim();
    await upsertPaymentLedgerEntry(env, {
      kind,
      refType,
      refId,
      name,
      address,
      amountCents,
      amountDisplay,
      packageLabel,
      note,
      moneyExchanged,
      paidAt,
    });
    await refreshPaymentLedgerXml(env);
    const loaded = await loadPaymentLedgerRows(env);
    const entry = loaded.entries.find((row) => row.kind === kind && row.ref_type === refType && Number(row.ref_id) === refId)
      || {
        kind,
        ref_type: refType,
        ref_id: refId,
        name,
        address,
        amount_cents: amountCents,
        amount_display: amountDisplay,
        package: packageLabel,
        note,
        money_exchanged: moneyExchanged,
        paid_at: paidAt,
      };
    return jsonResponse({
      ok: true,
      entry,
      detail: `${moneyExchanged ? 'Cash' : 'In-kind'} ${kind} recorded for ${name}.`,
    });
  }
  {
    const deleteMatch = url.pathname.match(/^\/api\/admin\/ledger\/(\d+)$/);
    if (deleteMatch && request.method === 'DELETE') {
      const auth = await requireLogin(request, env);
      if (auth.response) return auth.response;
      if (!canAccessTreasurerLedger(auth.user)) {
        return jsonResponse({ detail: 'Permission required: treasurer' }, 403);
      }
      const id = Number(deleteMatch[1] || 0);
      if (!id) return jsonResponse({ detail: 'Invalid ledger entry' }, 422);
      const existing = await env.DB.prepare('SELECT id, name FROM payment_ledger WHERE id = ?').bind(id).first();
      if (!existing) return jsonResponse({ detail: 'Ledger entry not found' }, 404);
      await env.DB.prepare('DELETE FROM payment_ledger WHERE id = ?').bind(id).run();
      await refreshPaymentLedgerXml(env);
      return jsonResponse({ ok: true, detail: `Removed ledger entry for ${existing.name || id}.` });
    }
  }
  if (url.pathname === '/api/admin/sponsors' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'sponsors') && !canEditPage(auth.user, 'sponsors')) return jsonResponse({ detail: 'Permission required: sponsors' }, 403);
    return jsonResponse(await getSponsors(env, true));
  }
  if (url.pathname === '/api/admin/sponsors' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'sponsors') && !canEditPage(auth.user, 'sponsors')) return jsonResponse({ detail: 'Permission required: sponsors' }, 403);
    const sponsor = normalizeSponsorPayload(await request.json());
    if (!sponsor.name) return jsonResponse({ detail: 'Sponsor name is required' }, 422);
    if (sponsor._assign_sort_order) {
      const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM sponsors').first();
      sponsor.sort_order = Number(max?.max_order || 0) + 1;
    }
    const result = await env.DB.prepare('INSERT INTO sponsors (name, address, city, state, logo_url, level, mark_text, sort_order, active, homepage_ad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(sponsor.name, sponsor.address, sponsor.city, sponsor.state, sponsor.logo_url, sponsor.level, sponsor.mark_text, sponsor.sort_order, sponsor.active, sponsor.homepage_ad).run();
    return jsonResponse(hydrateSponsor(await env.DB.prepare('SELECT id, name, address, city, state, logo_url, level, mark_text, sort_order, active, homepage_ad FROM sponsors WHERE id = ?').bind(result.meta.last_row_id).first()));
  }
  if (url.pathname === '/api/admin/sponsors/reorder' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'sponsors') && !canEditPage(auth.user, 'sponsors')) {
      return jsonResponse({ detail: 'Permission required: sponsors' }, 403);
    }
    const ids = normalizeStaffReorderIds(await request.json());
    if (!ids.length) return jsonResponse({ detail: 'Sponsor order is required' }, 422);
    const existing = await getSponsors(env, true);
    if (ids.length !== existing.length || ids.some((id) => !existing.some((sponsor) => sponsor.id === id))) {
      return jsonResponse({ detail: 'Sponsor order must include every sponsor exactly once' }, 422);
    }
    await env.DB.batch(ids.map((id, index) => (
      env.DB.prepare('UPDATE sponsors SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(index + 1, id)
    )));
    return jsonResponse(await getSponsors(env, true));
  }
  const sponsorMatch = url.pathname.match(/^\/api\/admin\/sponsors\/(\d+)$/);
  if (sponsorMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'sponsors') && !canEditPage(auth.user, 'sponsors')) return jsonResponse({ detail: 'Permission required: sponsors' }, 403);
    const id = Number(sponsorMatch[1]);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM sponsors WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }
    const existing = await env.DB.prepare('SELECT * FROM sponsors WHERE id = ?').bind(id).first();
    if (!existing) return jsonResponse({ detail: 'Sponsor not found' }, 404);
    const sponsor = normalizeSponsorPayload(await request.json(), existing);
    if (!sponsor.name) return jsonResponse({ detail: 'Sponsor name is required' }, 422);
    await env.DB.prepare('UPDATE sponsors SET name = ?, address = ?, city = ?, state = ?, logo_url = ?, level = ?, mark_text = ?, sort_order = ?, active = ?, homepage_ad = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(sponsor.name, sponsor.address, sponsor.city, sponsor.state, sponsor.logo_url, sponsor.level, sponsor.mark_text, sponsor.sort_order, sponsor.active, sponsor.homepage_ad, id).run();
    return jsonResponse(hydrateSponsor(await env.DB.prepare('SELECT id, name, address, city, state, logo_url, level, mark_text, sort_order, active, homepage_ad FROM sponsors WHERE id = ?').bind(id).first()));
  }

  if (url.pathname === '/api/admin/staff' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'staff') && !canEditPage(auth.user, 'directors')) return jsonResponse({ detail: 'Permission required: staff' }, 403);
    return jsonResponse(await getStaff(env, true));
  }
  if (url.pathname === '/api/admin/staff' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'staff') && !canEditPage(auth.user, 'directors')) return jsonResponse({ detail: 'Permission required: staff' }, 403);
    const member = normalizeStaffPayload(await request.json());
    if (!member.name) return jsonResponse({ detail: 'Staff name is required' }, 422);
    if (member._assign_sort_order) {
      const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM staff_members').first();
      member.sort_order = Number(max?.max_order || 0) + 1;
    }
    const result = await env.DB.prepare('INSERT INTO staff_members (name, role, bio, photo_url, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)').bind(member.name, member.role, member.bio, member.photo_url, member.sort_order, member.active).run();
    return jsonResponse(await env.DB.prepare('SELECT id, name, role, bio, photo_url, sort_order, active FROM staff_members WHERE id = ?').bind(result.meta.last_row_id).first());
  }
  if (url.pathname === '/api/admin/staff/reorder' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'staff') && !canEditPage(auth.user, 'directors')) {
      return jsonResponse({ detail: 'Permission required: staff' }, 403);
    }
    const ids = normalizeStaffReorderIds(await request.json());
    if (!ids.length) return jsonResponse({ detail: 'Staff order is required' }, 422);
    const existing = await getStaff(env, true);
    if (ids.length !== existing.length || ids.some((id) => !existing.some((member) => member.id === id))) {
      return jsonResponse({ detail: 'Staff order must include every staff member exactly once' }, 422);
    }
    await env.DB.batch(ids.map((id, index) => (
      env.DB.prepare('UPDATE staff_members SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(index + 1, id)
    )));
    return jsonResponse(await getStaff(env, true));
  }
  const staffMatch = url.pathname.match(/^\/api\/admin\/staff\/(\d+)$/);
  if (staffMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'staff') && !canEditPage(auth.user, 'directors')) return jsonResponse({ detail: 'Permission required: staff' }, 403);
    const id = Number(staffMatch[1]);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM staff_members WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }
    const existing = await env.DB.prepare('SELECT * FROM staff_members WHERE id = ?').bind(id).first();
    if (!existing) return jsonResponse({ detail: 'Staff member not found' }, 404);
    const member = normalizeStaffPayload(await request.json(), existing);
    if (!member.name) return jsonResponse({ detail: 'Staff name is required' }, 422);
    await env.DB.prepare('UPDATE staff_members SET name = ?, role = ?, bio = ?, photo_url = ?, sort_order = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(member.name, member.role, member.bio, member.photo_url, member.sort_order, member.active, id).run();
    return jsonResponse(await env.DB.prepare('SELECT id, name, role, bio, photo_url, sort_order, active FROM staff_members WHERE id = ?').bind(id).first());
  }

  if (url.pathname === '/api/admin/booster-members' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'boosters') && !canEditPage(auth.user, 'boosters')) {
      return jsonResponse({ detail: 'Permission required: boosters' }, 403);
    }
    return jsonResponse(await getBoosterMembers(env, true));
  }
  if (url.pathname === '/api/admin/booster-members' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'boosters') && !canEditPage(auth.user, 'boosters')) {
      return jsonResponse({ detail: 'Permission required: boosters' }, 403);
    }
    const member = normalizeBoosterMemberPayload(await request.json());
    if (!member.name) return jsonResponse({ detail: 'Booster member name is required' }, 422);
    if (member._assign_sort_order) {
      const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM booster_members').first();
      member.sort_order = Number(max?.max_order || 0) + 1;
    }
    const result = await env.DB.prepare('INSERT INTO booster_members (name, role, bio, photo_url, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)').bind(member.name, member.role, member.bio, member.photo_url, member.sort_order, member.active).run();
    return jsonResponse(await env.DB.prepare('SELECT id, name, role, bio, photo_url, sort_order, active FROM booster_members WHERE id = ?').bind(result.meta.last_row_id).first());
  }
  if (url.pathname === '/api/admin/booster-members/reorder' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'boosters') && !canEditPage(auth.user, 'boosters')) {
      return jsonResponse({ detail: 'Permission required: boosters' }, 403);
    }
    const ids = normalizeBoosterMemberReorderIds(await request.json());
    if (!ids.length) return jsonResponse({ detail: 'Booster member order is required' }, 422);
    const existing = await getBoosterMembers(env, true);
    if (ids.length !== existing.length || ids.some((id) => !existing.some((member) => member.id === id))) {
      return jsonResponse({ detail: 'Booster member order must include every booster member exactly once' }, 422);
    }
    await env.DB.batch(ids.map((id, index) => (
      env.DB.prepare('UPDATE booster_members SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(index + 1, id)
    )));
    return jsonResponse(await getBoosterMembers(env, true));
  }
  const boosterMemberMatch = url.pathname.match(/^\/api\/admin\/booster-members\/(\d+)$/);
  if (boosterMemberMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'boosters') && !canEditPage(auth.user, 'boosters')) {
      return jsonResponse({ detail: 'Permission required: boosters' }, 403);
    }
    const id = Number(boosterMemberMatch[1]);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM booster_members WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }
    const existing = await env.DB.prepare('SELECT * FROM booster_members WHERE id = ?').bind(id).first();
    if (!existing) return jsonResponse({ detail: 'Booster member not found' }, 404);
    const member = normalizeBoosterMemberPayload(await request.json(), existing);
    if (!member.name) return jsonResponse({ detail: 'Booster member name is required' }, 422);
    await env.DB.prepare('UPDATE booster_members SET name = ?, role = ?, bio = ?, photo_url = ?, sort_order = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(member.name, member.role, member.bio, member.photo_url, member.sort_order, member.active, id).run();
    return jsonResponse(await env.DB.prepare('SELECT id, name, role, bio, photo_url, sort_order, active FROM booster_members WHERE id = ?').bind(id).first());
  }

  if (url.pathname === '/api/admin/badges' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canAccessBadgeCreator(auth.user)) {
      return jsonResponse({ detail: 'Permission required: president or vice-president' }, 403);
    }
    return jsonResponse(await getCommitteeBadges(env));
  }
  if (url.pathname === '/api/admin/badges' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canAccessBadgeCreator(auth.user)) {
      return jsonResponse({ detail: 'Permission required: president or vice-president' }, 403);
    }
    const badge = normalizeCommitteeBadgePayload(await request.json());
    if (!badge.member_name) return jsonResponse({ detail: 'Member name is required' }, 422);
    if (!badge.school_year) return jsonResponse({ detail: 'School year is required' }, 422);
    const result = await env.DB.prepare(
      'INSERT INTO committee_badges (member_name, role, school_year, photo_url, photo_zoom, photo_offset_x, photo_offset_y, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      badge.member_name,
      badge.role,
      badge.school_year,
      badge.photo_url,
      badge.photo_zoom,
      badge.photo_offset_x,
      badge.photo_offset_y,
      auth.user.id || null,
    ).run();
    return jsonResponse(await env.DB.prepare(
      'SELECT id, member_name, role, school_year, photo_url, photo_zoom, photo_offset_x, photo_offset_y, created_by, created_at, updated_at FROM committee_badges WHERE id = ?',
    ).bind(result.meta.last_row_id).first());
  }
  const badgeMatch = url.pathname.match(/^\/api\/admin\/badges\/(\d+)$/);
  if (badgeMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canAccessBadgeCreator(auth.user)) {
      return jsonResponse({ detail: 'Permission required: president or vice-president' }, 403);
    }
    const id = Number(badgeMatch[1]);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM committee_badges WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }
    const existing = await env.DB.prepare('SELECT * FROM committee_badges WHERE id = ?').bind(id).first();
    if (!existing) return jsonResponse({ detail: 'Badge not found' }, 404);
    const badge = normalizeCommitteeBadgePayload(await request.json(), existing);
    if (!badge.member_name) return jsonResponse({ detail: 'Member name is required' }, 422);
    if (!badge.school_year) return jsonResponse({ detail: 'School year is required' }, 422);
    await env.DB.prepare(
      'UPDATE committee_badges SET member_name = ?, role = ?, school_year = ?, photo_url = ?, photo_zoom = ?, photo_offset_x = ?, photo_offset_y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).bind(
      badge.member_name,
      badge.role,
      badge.school_year,
      badge.photo_url,
      badge.photo_zoom,
      badge.photo_offset_x,
      badge.photo_offset_y,
      id,
    ).run();
    return jsonResponse(await env.DB.prepare(
      'SELECT id, member_name, role, school_year, photo_url, photo_zoom, photo_offset_x, photo_offset_y, created_by, created_at, updated_at FROM committee_badges WHERE id = ?',
    ).bind(id).first());
  }

  if (url.pathname === '/api/admin/contact/topics' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'contact') && !canEditPage(auth.user, 'contact')) {
      return jsonResponse({ detail: 'Permission required: contact' }, 403);
    }
    return jsonResponse(await getContactTopics(env, true));
  }
  if (url.pathname === '/api/admin/contact/topics' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'contact') && !canEditPage(auth.user, 'contact')) {
      return jsonResponse({ detail: 'Permission required: contact' }, 403);
    }
    const topic = normalizeContactTopicPayload(await request.json());
    if (!topic.label) return jsonResponse({ detail: 'Topic label is required' }, 422);
    if (!topic.recipient_user_ids.length) {
      return jsonResponse({ detail: 'Select at least one CMS user to receive this topic' }, 422);
    }
    const recipientInfo = await resolveContactTopicRecipients(env, topic);
    if (!recipientInfo.emails.length) {
      return jsonResponse({ detail: 'Selected users need a valid email login username' }, 422);
    }
    const result = await env.DB.prepare(
      'INSERT INTO contact_topics (label, email, recipient_user_ids, sort_order, active) VALUES (?, ?, ?, ?, ?)',
    ).bind(
      topic.label,
      recipientInfo.emails.join(', '),
      JSON.stringify(recipientInfo.recipient_user_ids),
      topic.sort_order,
      topic.active,
    ).run();
    const created = await env.DB.prepare('SELECT id, label, email, recipient_user_ids, sort_order, active FROM contact_topics WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();
    return jsonResponse(serializeContactTopic(created, await resolveContactTopicRecipients(env, created)));
  }
  const contactTopicMatch = url.pathname.match(/^\/api\/admin\/contact\/topics\/(\d+)$/);
  if (contactTopicMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'contact') && !canEditPage(auth.user, 'contact')) {
      return jsonResponse({ detail: 'Permission required: contact' }, 403);
    }
    const id = Number(contactTopicMatch[1]);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM contact_topics WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }
    const existing = await env.DB.prepare('SELECT * FROM contact_topics WHERE id = ?').bind(id).first();
    if (!existing) return jsonResponse({ detail: 'Topic not found' }, 404);
    const topic = normalizeContactTopicPayload(await request.json(), existing);
    if (!topic.label) return jsonResponse({ detail: 'Topic label is required' }, 422);
    if (!topic.recipient_user_ids.length) {
      return jsonResponse({ detail: 'Select at least one CMS user to receive this topic' }, 422);
    }
    const recipientInfo = await resolveContactTopicRecipients(env, topic);
    if (!recipientInfo.emails.length) {
      return jsonResponse({ detail: 'Selected users need a valid email login username' }, 422);
    }
    await env.DB.prepare(
      'UPDATE contact_topics SET label = ?, email = ?, recipient_user_ids = ?, sort_order = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).bind(
      topic.label,
      recipientInfo.emails.join(', '),
      JSON.stringify(recipientInfo.recipient_user_ids),
      topic.sort_order,
      topic.active,
      id,
    ).run();
    const updated = await env.DB.prepare('SELECT id, label, email, recipient_user_ids, sort_order, active FROM contact_topics WHERE id = ?').bind(id).first();
    return jsonResponse(serializeContactTopic(updated, await resolveContactTopicRecipients(env, updated)));
  }
  if (url.pathname === '/api/admin/contact/delivery' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'contact') && !canEditPage(auth.user, 'contact')) {
      return jsonResponse({ detail: 'Permission required: contact' }, 403);
    }
    const provider = resolveContactEmailProvider(env);
    return jsonResponse({
      ...describeContactEmailProvider(provider),
      from_email: String(env.CONTACT_FROM_EMAIL || SPONSOR_INVOICE_FROM_EMAIL),
      from_name: String(env.CONTACT_FROM_NAME || SPONSOR_INVOICE_FROM_NAME),
    });
  }
  if (url.pathname === '/api/admin/contact/messages' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!hasPermission(auth.user, 'contact') && !canEditPage(auth.user, 'contact')) {
      return jsonResponse({ detail: 'Permission required: contact' }, 403);
    }
    const rows = await env.DB.prepare('SELECT id, topic_id, topic_label, to_email, name, email, message, delivered, delivery_error, created_at FROM contact_messages ORDER BY id DESC LIMIT 50').all();
    return jsonResponse(rows.results || []);
  }

  if (url.pathname === '/api/admin/minutes' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canViewMeetingMinutes(auth.user)) {
      return jsonResponse({ detail: 'Login required to view meeting minutes' }, 403);
    }
    return jsonResponse(await listMeetingMinutes(env, auth.user));
  }
  if (url.pathname === '/api/admin/minutes' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canManageMeetingMinutes(auth.user)) {
      return jsonResponse({ detail: 'Permission required: minutes' }, 403);
    }
    let payload;
    try {
      payload = normalizeMinutesPayload(await request.json());
    } catch (error) {
      return jsonResponse({ detail: error.message || 'Invalid minutes payload' }, 400);
    }
    if (!payload.meeting_date) return jsonResponse({ detail: 'Meeting date is required' }, 422);
    if (!payload.body_html.replace(/<[^>]+>/g, '').trim()) return jsonResponse({ detail: 'Minutes content is required' }, 422);
    try {
      const result = await env.DB.prepare(
        'INSERT INTO booster_meeting_minutes (meeting_date, body_html, created_by) VALUES (?, ?, ?)',
      ).bind(payload.meeting_date, payload.body_html, auth.user.id).run();
      const createdId = Number(result?.meta?.last_row_id || 0);
      const created = createdId ? await getMeetingMinutesById(env, createdId, auth.user) : null;
      if (!created?.id) {
        return jsonResponse({ detail: 'Minutes saved but could not be reloaded. Refresh and check the list.' }, 500);
      }
      return jsonResponse(created, 201);
    } catch (error) {
      return jsonResponse({ detail: `Could not save minutes: ${error?.message || error}` }, 500);
    }
  }
  if (url.pathname === '/api/admin/minutes/upload' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canManageMeetingMinutes(auth.user)) {
      return jsonResponse({ detail: 'Permission required: minutes' }, 403);
    }
    let form;
    try {
      form = await request.formData();
    } catch {
      return jsonResponse({ detail: 'Expected multipart form upload with a .docx file' }, 400);
    }
    const file = form.get('file') || form.get('docx') || form.get('minutes');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      return jsonResponse({ detail: 'Choose a .docx meeting minutes file to upload' }, 422);
    }
    const filename = String(file.name || 'minutes.docx');
    const lower = filename.toLowerCase();
    if (!lower.endsWith('.docx')) {
      return jsonResponse({ detail: 'Only .docx Word files are supported for minutes upload' }, 422);
    }
    const size = Number(file.size || 0);
    if (size <= 0) return jsonResponse({ detail: 'Uploaded DOCX file is empty' }, 422);
    if (size > MINUTES_DOCX_MAX_BYTES) {
      return jsonResponse({ detail: `DOCX must be ${MINUTES_DOCX_MAX_LABEL} or smaller` }, 422);
    }
    let parsed;
    try {
      parsed = await parseBoostersMinutesDocx(await file.arrayBuffer(), filename);
    } catch (error) {
      return jsonResponse({ detail: error?.message || 'Could not read the DOCX minutes file' }, 422);
    }
    try {
      const result = await env.DB.prepare(
        'INSERT INTO booster_meeting_minutes (meeting_date, body_html, created_by) VALUES (?, ?, ?)',
      ).bind(parsed.meeting_date, parsed.body_html, auth.user.id).run();
      const createdId = Number(result?.meta?.last_row_id || 0);
      const created = createdId ? await getMeetingMinutesById(env, createdId, auth.user) : null;
      if (!created?.id) {
        return jsonResponse({ detail: 'Minutes uploaded but could not be reloaded. Refresh and check the list.' }, 500);
      }
      return jsonResponse(created, 201);
    } catch (error) {
      return jsonResponse({ detail: `Could not save uploaded minutes: ${error?.message || error}` }, 500);
    }
  }
  const minutesDocumentMatch = url.pathname.match(/^\/api\/admin\/minutes\/(\d+)\/document$/);
  if (minutesDocumentMatch && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canViewMeetingMinutes(auth.user)) {
      return jsonResponse({ detail: 'Login required to view meeting minutes' }, 403);
    }
    const id = Number(minutesDocumentMatch[1]);
    const existing = await getMeetingMinutesById(env, id, auth.user);
    if (!existing) return jsonResponse({ detail: 'Meeting minutes not found' }, 404);
    const site = await getSite(env);
    const embed = String(url.searchParams.get('embed') || '') === '1';
    return htmlResponse(renderMinutesDocumentHtml(site, existing, { embed }));
  }
  const minutesMatch = url.pathname.match(/^\/api\/admin\/minutes\/(\d+)$/);
  if (minutesMatch && ['GET', 'PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canViewMeetingMinutes(auth.user)) {
      return jsonResponse({ detail: 'Login required to view meeting minutes' }, 403);
    }
    const id = Number(minutesMatch[1]);
    const existing = await getMeetingMinutesById(env, id, auth.user);
    if (!existing) return jsonResponse({ detail: 'Meeting minutes not found' }, 404);
    if (request.method === 'GET') return jsonResponse(existing);
    if (request.method === 'DELETE') {
      if (!canDeleteMeetingMinutes(auth.user)) {
        return jsonResponse({ detail: 'Only Super Admins can delete meeting minutes' }, 403);
      }
      await env.DB.prepare('DELETE FROM booster_meeting_minutes WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }
    if (!canEditMeetingMinutes(auth.user, existing)) {
      return jsonResponse({ detail: 'Meeting minutes can only be edited by the secretary within 10 days of the meeting date' }, 403);
    }
    let payload;
    try {
      payload = normalizeMinutesPayload(await request.json(), existing);
    } catch (error) {
      return jsonResponse({ detail: error.message }, 400);
    }
    if (!payload.meeting_date) return jsonResponse({ detail: 'Meeting date is required' }, 422);
    if (!payload.body_html.replace(/<[^>]+>/g, '').trim()) return jsonResponse({ detail: 'Minutes content is required' }, 422);
    try {
      await env.DB.prepare(
        'UPDATE booster_meeting_minutes SET meeting_date = ?, body_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).bind(payload.meeting_date, payload.body_html, id).run();
      return jsonResponse(await getMeetingMinutesById(env, id, auth.user));
    } catch (error) {
      return jsonResponse({ detail: `Could not update minutes: ${error?.message || error}` }, 500);
    }
  }

  if (url.pathname === '/api/admin/email-subscribers' && request.method === 'GET') {
    const auth = await requireSuperAdmin(request, env);
    if (auth.response) return auth.response;
    const rows = await env.DB.prepare(
      `SELECT email, topics, status, source, created_at, updated_at, unsubscribed_at
       FROM email_subscribers
       ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, email COLLATE NOCASE`,
    ).all();
    const subscribers = (rows.results || []).map((row) => ({
      ...row,
      topics: normalizeEmailListTopics(row.topics, { defaultAll: true }),
    }));
    return jsonResponse({
      subscribers,
      active_count: subscribers.filter((row) => row.status === 'active').length,
      total: subscribers.length,
    });
  }
  if (url.pathname === '/api/admin/mail/recipients' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const rows = await env.DB.prepare('SELECT id, username, display_name, role, active FROM users WHERE active = 1 ORDER BY display_name, username').all();
    const recipients = (rows.results || [])
      .map((user) => ({
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        email: String(user.username || '').trim().toLowerCase(),
        can_email: isValidEmail(user.username),
      }))
      .filter((user) => user.can_email);
    return jsonResponse(recipients);
  }
  if (url.pathname === '/api/admin/mail/delivery' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const provider = resolveContactEmailProvider(env);
    const sender = resolveAdminMailSender(auth.user);
    return jsonResponse({
      ...describeContactEmailProvider(provider),
      from_email: String(env.CONTACT_FROM_EMAIL || SPONSOR_INVOICE_FROM_EMAIL).trim(),
      from_name: sender.ok ? sender.fromName : String(env.CONTACT_FROM_NAME || SPONSOR_INVOICE_FROM_NAME),
      reply_to: sender.ok ? sender.replyTo : '',
      sender_ready: sender.ok,
      requires_resend: true,
      invoice_from_email: SPONSOR_INVOICE_FROM_EMAIL,
      detail: provider !== 'resend'
        ? 'Mail requires Resend. Add a Cloudflare Pages secret named RESEND_API_KEY, verify efhsband.org in Resend, then redeploy.'
        : sender.ok
          ? `Delivering with Resend. Recipients see your name, and replies go to ${sender.replyTo}.`
          : sender.detail,
      configured: provider === 'resend' && sender.ok,
    });
  }
  if (url.pathname === '/api/admin/mail/resend-status' && request.method === 'GET') {
    const auth = await requirePermission(request, env, 'mail');
    if (auth.response) return auth.response;
    if (!env.RESEND_API_KEY) {
      return jsonResponse({ ok: false, detail: 'RESEND_API_KEY is not configured' }, 503);
    }
    const response = await fetch('https://api.resend.com/domains', {
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        Accept: 'application/json',
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return jsonResponse({
        ok: false,
        detail: payload?.message || `Resend domains request failed (${response.status})`,
      }, 502);
    }
    const domains = Array.isArray(payload?.data) ? payload.data : [];
    const efhs = domains.find((domain) => String(domain?.name || '').toLowerCase() === 'efhsband.org');
    return jsonResponse({
      ok: true,
      contact_from_email: String(env.CONTACT_FROM_EMAIL || '').trim(),
      invoice_from_email: SPONSOR_INVOICE_FROM_EMAIL,
      note: 'Resend does not require creating individual sender addresses. Any address at a verified domain can send.',
      efhsband_org: efhs
        ? {
          id: efhs.id,
          name: efhs.name,
          status: efhs.status,
          region: efhs.region,
          sending: efhs?.capabilities?.sending || '',
        }
        : null,
      domains: domains.map((domain) => ({
        id: domain.id,
        name: domain.name,
        status: domain.status,
        region: domain.region,
      })),
      can_send_no_reply: Boolean(efhs && String(efhs.status || '').toLowerCase() === 'verified'),
    });
  }
  if (url.pathname === '/api/admin/mail/test-no-reply' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'mail');
    if (auth.response) return auth.response;
    if (!env.RESEND_API_KEY) {
      return jsonResponse({ ok: false, detail: 'RESEND_API_KEY is not configured' }, 503);
    }
    const payload = await request.json().catch(() => ({}));
    const to = String(payload.to || auth.user?.username || '').trim().toLowerCase();
    if (!isValidEmail(to)) {
      return jsonResponse({ detail: 'Provide a valid test recipient email' }, 422);
    }
    try {
      await sendViaResend(env, {
        to,
        subject: 'Test: no-reply@efhsband.org sender',
        text: [
          'This is a test email confirming Resend can send from no-reply@efhsband.org.',
          '',
          'East Forsyth Band Boosters',
          'https://efhsband.org',
        ].join('\n'),
        html: '<p>This is a test email confirming Resend can send from <strong>no-reply@efhsband.org</strong>.</p><p>East Forsyth Band Boosters</p>',
        fromEmail: SPONSOR_INVOICE_FROM_EMAIL,
        fromName: SPONSOR_INVOICE_FROM_NAME,
      });
      return jsonResponse({
        ok: true,
        from: `${SPONSOR_INVOICE_FROM_NAME} <${SPONSOR_INVOICE_FROM_EMAIL}>`,
        to,
        detail: `Test email sent to ${to} from ${SPONSOR_INVOICE_FROM_EMAIL}.`,
      });
    } catch (error) {
      return jsonResponse({ ok: false, detail: error?.message || 'Could not send test email' }, 502);
    }
  }
  if (url.pathname === '/api/admin/mail' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    let mail;
    try {
      mail = await parseAdminMailRequest(request);
    } catch (error) {
      return jsonResponse({ detail: String(error?.message || error || 'Invalid mail request') }, 422);
    }
    if (!mail.user_ids.length) return jsonResponse({ detail: 'Select at least one recipient.' }, 422);
    if (!mail.subject) return jsonResponse({ detail: 'Subject is required.' }, 422);
    if (!mail.html && !mail.text) return jsonResponse({ detail: 'Message body is required.' }, 422);
    if (resolveContactEmailProvider(env) !== 'resend') {
      return jsonResponse({ detail: 'Mail requires Resend. Add RESEND_API_KEY in Cloudflare Pages secrets.' }, 503);
    }
    const sender = resolveAdminMailSender(auth.user);
    if (!sender.ok) return jsonResponse({ detail: sender.detail }, 422);

    const placeholders = mail.user_ids.map(() => '?').join(', ');
    const rows = await env.DB.prepare(
      `SELECT id, username, display_name, active FROM users WHERE id IN (${placeholders})`
    ).bind(...mail.user_ids).all();
    const users = (rows.results || []).filter((user) => Number(user.active) !== 0 && isValidEmail(user.username));
    if (!users.length) return jsonResponse({ detail: 'No selected users have a valid email username.' }, 422);

    const results = [];
    for (const user of users) {
      const email = String(user.username).trim().toLowerCase();
      try {
        await sendAdminUserMail(env, {
          to: email,
          replyTo: sender.replyTo,
          fromName: sender.fromName,
          subject: mail.subject,
          html: mail.html,
          text: mail.text || htmlToPlainText(mail.html),
          attachments: mail.attachments,
        });
        results.push({ user_id: user.id, email, ok: true });
      } catch (error) {
        results.push({ user_id: user.id, email, ok: false, error: String(error?.message || error || 'Send failed') });
      }
    }
    const sent = results.filter((item) => item.ok).length;
    const failed = results.length - sent;
    const status = failed && sent ? 207 : failed ? 502 : 200;
    await writeAdminAuditLog(env, {
      action: 'mail.send',
      category: 'mail',
      method: 'POST',
      path: '/api/admin/mail',
      status,
      actor_user_id: auth.user.id,
      actor_username: auth.user.username,
      ip: requestClientIp(request),
      user_agent: request.headers.get('user-agent') || '',
      summary: buildAuditSummary({
        action: 'mail.send',
        method: 'POST',
        path: '/api/admin/mail',
        status,
        actorUsername: auth.user.username,
        detail: `subject="${mail.subject}" sent=${sent} failed=${failed}`,
      }),
      meta: enrichMailAuditMeta({
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        recipients: users.map((user) => ({ user_id: user.id, email: String(user.username).trim().toLowerCase() })),
        attachments: mail.attachments,
        replyTo: sender.replyTo,
        results,
      }),
    });
    return jsonResponse({
      ok: failed === 0,
      sent,
      failed,
      results,
      detail: failed
        ? `Sent ${sent} of ${results.length}. ${failed} failed.`
        : `Sent to ${sent} recipient${sent === 1 ? '' : 's'}.`,
    }, status);
  }

  if (url.pathname === '/api/admin/events' && request.method === 'GET') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canViewEvents(auth.user)) {
      return jsonResponse({ detail: 'Login required' }, 401);
    }
    return jsonResponse(await getEvents(env, { upcomingOnly: false, includeCreators: true, expandRepeats: false }));
  }
  if (url.pathname === '/api/admin/caldev/events' && request.method === 'GET') {
    const auth = await requireScheduleBoardAccess(request, env);
    if (auth.response) return auth.response;
    await ensureCaldevSchema(env);
    return jsonResponse({
      events: await listCaldevEvents(env),
      tracks: CALDEV_TRACKS,
      preview_url: '/calendar.html',
    });
  }
  if (url.pathname === '/api/admin/caldev/events' && request.method === 'POST') {
    const auth = await requireScheduleBoardAccess(request, env);
    if (auth.response) return auth.response;
    await ensureCaldevSchema(env);
    const payload = await request.json().catch(() => ({}));
    const p = normalizeCaldevPayload(payload);
    if (!p.title) return jsonResponse({ detail: 'Title is required' }, 422);
    const created = await insertCaldevEvent(env, p);
    return jsonResponse(created, 201);
  }
  if (url.pathname === '/api/admin/caldev/seed' && request.method === 'POST') {
    const auth = await requireScheduleBoardAccess(request, env);
    if (auth.response) return auth.response;
    await ensureCaldevSchema(env);
    const payload = await request.json().catch(() => ({}));
    const result = await seedCaldevFromProduction(env, {
      getEvents,
      clear: payload?.clear !== false,
    });
    return jsonResponse({
      ok: true,
      ...result,
      events: await listCaldevEvents(env),
    });
  }
  if (url.pathname === '/api/admin/caldev/notify-finished' && request.method === 'POST') {
    const auth = await requireScheduleBoardAccess(request, env);
    if (auth.response) return auth.response;
    let email_list = null;
    try {
      email_list = await notifyEmailSubscribers(env, { topic: 'calendar', action: 'finished' });
    } catch (error) {
      email_list = { ok: false, detail: error?.message || 'Email list notify failed' };
    }
    return jsonResponse({ ok: Boolean(email_list?.ok || email_list?.skipped), email_list });
  }
  const caldevMatch = url.pathname.match(/^\/api\/admin\/caldev\/events\/(\d+)$/);
  if (caldevMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireScheduleBoardAccess(request, env);
    if (auth.response) return auth.response;
    await ensureCaldevSchema(env);
    const id = Number(caldevMatch[1]);
    const existing = await getCaldevEventById(env, id);
    if (!existing) return jsonResponse({ detail: 'Event not found' }, 404);
    if (request.method === 'DELETE') {
      await deleteCaldevEvent(env, id);
      return jsonResponse({ ok: true, id });
    }
    const payload = await request.json().catch(() => ({}));
    const p = normalizeCaldevPayload(payload, existing);
    if (!p.title) return jsonResponse({ detail: 'Title is required' }, 422);
    const updated = await updateCaldevEvent(env, id, p, existing);
    return jsonResponse(updated);
  }
  if (url.pathname === '/api/admin/events' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    if (!canCreateEvents(auth.user)) return jsonResponse({ detail: 'Permission required: events' }, 403);
    const rawPayload = await request.json().catch(() => ({}));
    const p = normalizeEventPayload(rawPayload);
    if (!htmlToPlainText(p.title) || !htmlToPlainText(p.description)) {
      return jsonResponse({ detail: 'Title and description are required' }, 422);
    }
    if (p.repeat_enabled) {
      if (!p.repeat_days.length || !p.repeat_months.length) {
        return jsonResponse({ detail: 'Choose at least one weekday and one month for repeating events' }, 422);
      }
    } else if (!p.date_label || !p.date_detail) {
      return jsonResponse({ detail: 'Month, day, title, and description are required' }, 422);
    }
    const result = await env.DB.prepare('INSERT INTO events (date_label, date_detail, event_year, title, description, sort_order, show_on_boosters, created_by, repeat_enabled, repeat_days, repeat_months, repeat_exceptions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
      p.date_label,
      p.date_detail,
      p.event_year,
      p.title,
      p.description,
      p.sort_order,
      p.show_on_boosters,
      auth.user.id,
      p.repeat_enabled,
      JSON.stringify(p.repeat_days),
      JSON.stringify(p.repeat_months),
      JSON.stringify(p.repeat_exceptions),
    ).run();
    const created = await getEventById(env, result.meta.last_row_id);
    try { await queueEventForFacebook(env, created, 'new'); } catch { /* queue is best-effort */ }
    let pushResult = null;
    try { pushResult = await recordCalendarPushChange(env, { action: 'created', event: created }); } catch { /* push is best-effort */ }
    let email_list = null;
    if (wantsEmailListNotify(rawPayload)) {
      try { email_list = await notifyEmailSubscribers(env, { topic: 'calendar', action: 'created', event: created }); } catch (error) {
        email_list = { ok: false, detail: error?.message || 'Email list notify failed' };
      }
    }
    return jsonResponse({ ...created, web_push: pushResult?.web_push || null, email_list });
  }
  const eventMatch = url.pathname.match(/^\/api\/admin\/events\/(\d+)$/);
  if (eventMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const id = Number(eventMatch[1]);
    const existing = await getEventById(env, id);
    if (!existing) return jsonResponse({ detail: 'Event not found' }, 404);
    if (!canMutateEvent(auth.user, existing)) {
      return jsonResponse({ detail: 'You can only edit or delete calendar events you created, unless an admin grants manage-all events access.' }, 403);
    }
    if (request.method === 'DELETE') {
      const rawPayload = await request.json().catch(() => ({}));
      await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
      try { await unqueueEventForFacebook(env, id); } catch { /* ignore */ }
      let pushResult = null;
      try { pushResult = await recordCalendarPushChange(env, { action: 'deleted', event: existing, eventId: id }); } catch { /* push is best-effort */ }
      let email_list = null;
      if (wantsEmailListNotify(rawPayload)) {
        try { email_list = await notifyEmailSubscribers(env, { topic: 'calendar', action: 'deleted', event: existing }); } catch (error) {
          email_list = { ok: false, detail: error?.message || 'Email list notify failed' };
        }
      }
      return jsonResponse({ ok: true, web_push: pushResult?.web_push || null, email_list });
    }
    const rawPayload = await request.json().catch(() => ({}));
    const p = normalizeEventPayload(rawPayload, existing);
    if (!htmlToPlainText(p.title) || !htmlToPlainText(p.description)) {
      return jsonResponse({ detail: 'Title and description are required' }, 422);
    }
    if (p.repeat_enabled) {
      if (!p.repeat_days.length || !p.repeat_months.length) {
        return jsonResponse({ detail: 'Choose at least one weekday and one month for repeating events' }, 422);
      }
    } else if (!p.date_label || !p.date_detail) {
      return jsonResponse({ detail: 'Month, day, title, and description are required' }, 422);
    }
    await env.DB.prepare('UPDATE events SET date_label = ?, date_detail = ?, event_year = ?, title = ?, description = ?, sort_order = ?, show_on_boosters = ?, repeat_enabled = ?, repeat_days = ?, repeat_months = ?, repeat_exceptions = ? WHERE id = ?').bind(
      p.date_label,
      p.date_detail,
      p.event_year,
      p.title,
      p.description,
      p.sort_order,
      p.show_on_boosters,
      p.repeat_enabled,
      JSON.stringify(p.repeat_days),
      JSON.stringify(p.repeat_months),
      JSON.stringify(p.repeat_exceptions),
      id,
    ).run();
    const updated = await getEventById(env, id);
    try { await queueEventForFacebook(env, updated, 'updated'); } catch { /* queue is best-effort */ }
    let pushResult = null;
    try { pushResult = await recordCalendarPushChange(env, { action: 'updated', event: updated }); } catch { /* push is best-effort */ }
    let email_list = null;
    if (wantsEmailListNotify(rawPayload)) {
      try { email_list = await notifyEmailSubscribers(env, { topic: 'calendar', action: 'updated', event: updated }); } catch (error) {
        email_list = { ok: false, detail: error?.message || 'Email list notify failed' };
      }
    }
    return jsonResponse({ ...updated, web_push: pushResult?.web_push || null, email_list });
  }

  if (url.pathname === '/api/admin/photos' && request.method === 'POST') {
    const auth = await requireLogin(request, env);
    if (auth.response) return auth.response;
    const canUpload = hasPermission(auth.user, 'photos')
      || hasPermission(auth.user, 'staff')
      || canEditPage(auth.user, 'directors')
      || hasPermission(auth.user, 'boosters')
      || canEditPage(auth.user, 'boosters')
      || hasPermission(auth.user, 'site');
    if (!canUpload) return jsonResponse({ detail: 'Permission required: photos' }, 403);
    const form = await request.formData();
    try {
      // Gallery uploads omit sort_order (auto-assigned). Negative values still hide staff/logo utility images.
      const rawSort = form.get('sort_order');
      const sortOrder = rawSort === null || rawSort === '' ? 0 : Number(rawSort);
      const stored = await storeImageUpload(
        env,
        form.get('file'),
        String(form.get('alt_text') || ''),
        String(form.get('caption') || ''),
        sortOrder,
      );
      // Return the saved photo immediately. Instagram autopost can take many seconds and
      // made gallery uploads look like they did nothing while the request hung.
      const publishTask = maybePublishGalleryPhotoToInstagram(env, request, stored).catch((error) => ({
        attempted: true,
        ok: false,
        reason: 'publish_failed',
        error: String(error?.message || error || 'Instagram publish failed'),
      }));
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(publishTask);
        return jsonResponse({
          ...stored,
          instagram: { attempted: false, ok: false, reason: 'queued_background' },
        });
      }
      const instagram = await publishTask;
      return jsonResponse({ ...stored, instagram });
    } catch (error) {
      return jsonResponse({ detail: error.message }, 400);
    }
  }
  if (url.pathname === '/api/admin/photos/reorder' && request.method === 'POST') {
    const auth = await requirePermission(request, env, 'photos');
    if (auth.response) return auth.response;
    const ids = normalizeStaffReorderIds(await request.json());
    if (!ids.length) return jsonResponse({ detail: 'Photo order is required' }, 422);
    const existing = await getPhotos(env);
    if (ids.length !== existing.length || ids.some((id) => !existing.some((photo) => photo.id === id))) {
      return jsonResponse({ detail: 'Photo order must include every gallery photo exactly once' }, 422);
    }
    await env.DB.batch(ids.map((id, index) => (
      env.DB.prepare('UPDATE photos SET sort_order = ? WHERE id = ? AND sort_order >= 0').bind(index + 1, id)
    )));
    return jsonResponse(await getPhotos(env));
  }
  const photoMatch = url.pathname.match(/^\/api\/admin\/photos\/(\d+)$/);
  if (photoMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const auth = await requirePermission(request, env, 'photos');
    if (auth.response) return auth.response;
    const id = Number(photoMatch[1]);
    const photo = await env.DB.prepare(
      'SELECT id, filename, original_name, alt_text, caption, sort_order, created_at FROM photos WHERE id = ?',
    ).bind(id).first();
    if (!photo) return jsonResponse({ detail: 'Photo not found' }, 404);
    if (request.method === 'DELETE') {
      const usage = await photoUsageLabels(env, photo.filename);
      if (usage.length) {
        return jsonResponse({ detail: `This image is still used as ${usage.join(', ')}. Remove or replace it there before deleting.` }, 409);
      }
      await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }
    const meta = normalizePhotoMetaPayload(await request.json(), photo);
    if (!meta.alt_text) return jsonResponse({ detail: 'Alt text is required' }, 422);
    await env.DB.prepare('UPDATE photos SET alt_text = ?, caption = ? WHERE id = ?').bind(meta.alt_text, meta.caption, id).run();
    const updated = await env.DB.prepare(
      'SELECT id, filename, original_name, alt_text, caption, sort_order, created_at FROM photos WHERE id = ?',
    ).bind(id).first();
    return jsonResponse({ ...updated, url: `/uploads/${encodeURIComponent(updated.filename)}` });
  }

  return jsonResponse({ detail: 'Not found' }, 404);
}

async function handleUploadGet(env, url) {
  await initDb(env);
  const key = decodeURIComponent(url.pathname.replace('/uploads/', ''));
  const row = await env.DB.prepare('SELECT content_type, data_base64 FROM photos WHERE filename = ?').bind(key).first();
  if (!row) return new Response('Not found', { status: 404 });
  try {
    const bytes = photoBytesFromStored(row.data_base64);
    if (!bytes || !bytes.byteLength) return new Response('Not found', { status: 404 });
    return new Response(bytes, {
      headers: {
        'content-type': row.content_type || 'application/octet-stream',
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return jsonResponse({
      detail: 'Could not read stored image bytes',
      error: String(error?.message || error || ''),
      valueType: typeof row.data_base64,
      isArray: Array.isArray(row.data_base64),
      ctor: row.data_base64?.constructor?.name || null,
    }, 500);
  }
}

function clearSessionCookie() {
  return sessionCookieHeader('', { maxAge: 0 });
}

function renderLoginHtml(nextPath = '/admin') {
  const safeNext = sanitizeAdminReturnPath(nextPath);
  return LOGIN_HTML.replace(
    '<form class="admin-card" method="post" action="/admin/login">',
    `<form class="admin-card" method="post" action="/admin/login"><input type="hidden" name="next" value="${escapeAttr(safeNext)}">`,
  );
}

async function handleLogin(request, env) {
  await initDb(env);
  const requestUrl = new URL(request.url);
  if (request.method === 'GET') {
    const nextPath = sanitizeAdminReturnPath(requestUrl.searchParams.get('next') || '/admin');
    // Already authenticated users should not stay on the login form with a live session.
    if (await currentUser(request, env)) return redirect(nextPath);
    return htmlResponse(renderLoginHtml(nextPath));
  }
  const form = await request.formData();
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  const nextPath = sanitizeAdminReturnPath(form.get('next') || requestUrl.searchParams.get('next') || '/admin');
  const user = await getUserByUsername(env, username);
  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) {
    // Always clear any existing session on failed login so a stale cookie cannot
    // keep granting access after an invalid password attempt.
    await writeAdminAuditLog(env, {
      action: 'login.failed',
      category: 'auth',
      method: 'POST',
      path: '/admin/login',
      status: 401,
      actor_username: username,
      ip: requestClientIp(request),
      user_agent: request.headers.get('user-agent') || '',
      summary: buildAuditSummary({
        action: 'login.failed',
        method: 'POST',
        path: '/admin/login',
        status: 401,
        actorUsername: username || 'unknown',
        detail: 'invalid credentials',
      }),
      meta: { username, next: nextPath },
    });
    return htmlResponse(
      renderLoginHtml(nextPath).replace('</form>', "<p class='error'>Invalid username or password.</p></form>"),
      401,
      { 'set-cookie': clearSessionCookie() },
    );
  }
  try {
    await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), user.id)
      .run();
  } catch {
    // Best-effort; login should still succeed if the column is missing mid-deploy.
  }
  await writeAdminAuditLog(env, {
    action: 'login',
    category: 'auth',
    method: 'POST',
    path: '/admin/login',
    status: 302,
    actor_user_id: user.id,
    actor_username: user.username,
    ip: requestClientIp(request),
    user_agent: request.headers.get('user-agent') || '',
    summary: buildAuditSummary({
      action: 'login',
      method: 'POST',
      path: '/admin/login',
      status: 302,
      actorUsername: user.username,
      detail: 'session started',
    }),
    meta: {
      user_id: user.id,
      role: user.role,
      next: nextPath,
    },
  });
  const response = redirect(nextPath);
  response.headers.set('set-cookie', sessionCookieHeader(await makeSession(user, env)));
  return response;
}

async function handleAdmin(request, env) {
  await initDb(env);
  if (!(await currentUser(request, env))) return redirect('/admin/login');
  return htmlResponse(ADMIN_HTML);
}

async function logout(request, env) {
  const user = await currentUser(request, env);
  if (user) {
    await writeAdminAuditLog(env, {
      action: 'logout',
      category: 'auth',
      method: String(request?.method || 'POST').toUpperCase(),
      path: '/admin/logout',
      status: 302,
      actor_user_id: user.id,
      actor_username: user.username,
      ip: requestClientIp(request),
      user_agent: request.headers.get('user-agent') || '',
      summary: buildAuditSummary({
        action: 'logout',
        method: String(request?.method || 'POST').toUpperCase(),
        path: '/admin/logout',
        status: 302,
        actorUsername: user.username,
        detail: 'session ended',
      }),
      meta: { user_id: user.id, role: user.role },
    });
  }
  const response = redirect('/admin/login');
  response.headers.set('set-cookie', clearSessionCookie());
  return response;
}

export function renderStaffAuthNavLink(loggedIn = false) {
  if (loggedIn) {
    return '<a href="/admin" data-staff-auth-link>Staff Menu</a>';
  }
  return '<a href="/admin/login" data-staff-auth-link>Login</a>';
}

export function renderNav(pages, { loggedIn = false } = {}) {
  const pageLinks = pages
    .filter((page) => page.slug !== 'become-a-sponsor')
    .map((page) => `<a href="${escapeAttr(page.path)}">${escapeHtml(page.title.replace(/\s*\|\s*East Forsyth Band$/, ''))}</a>`).join('');
  return `${pageLinks}${renderStaffAuthNavLink(loggedIn)}${renderNotifyMeNavControl()}${renderAddToHomeNavControl()}`;
}

function renderCmsPage(page, site, pages, sponsors = [], staff = [], boosterMembers = [], marqueeSponsors = null, { maintenancePreview = false, loggedIn = false } = {}) {
  const title = page.is_home ? `Home | ${site.title}` : `${page.title} | ${site.title}`;
  const bodyHtml = renderPageBody(page, sponsors, staff, boosterMembers, site);
  const marqueeHtml = renderSponsorMarqueeSection(
    Array.isArray(marqueeSponsors) ? marqueeSponsors : sponsors,
  );
  const previewBanner = maintenancePreview ? renderMaintenancePreviewBanner() : '';
  const bodyClass = maintenancePreview ? ' class="maintenance-preview"' : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttr(site.title)} website.">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="${escapeAttr(site.logo_url || '/assets/efhs-icon.png')}">
  <link rel="apple-touch-icon" href="${escapeAttr(PUBLIC_BRAND_MARK)}">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#002142">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="EFHS Band">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}">
</head>
<body${bodyClass}>
${previewBanner}
<a class="skip-link" href="#main">Skip to content</a>
<div class="utility"><div class="wrap">${renderUtilityLinks(site)}</div></div>
<header class="site-header"><div class="header-inner"><a class="brand" href="/"><img class="brand-logo" src="${escapeAttr(site.logo_url || '/assets/efhs-logo.png')}" alt="${escapeAttr(site.title)} logo"><span data-site-field="title">${escapeHtml(site.title)}</span><img class="brand-mark" src="${escapeAttr(PUBLIC_BRAND_MARK)}" alt="East Forsyth Blue Regiment"></a></div><div class="mobile-nav-tray" data-mobile-nav-tray><button class="menu-button" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu"><span class="menu-button-icon" aria-hidden="true"><span></span><span></span><span></span></span><span class="sr-only">Menu</span></button><div class="header-quick-actions" data-header-quick-actions></div></div><div class="nav-backdrop" data-nav-backdrop hidden></div><nav id="site-nav" aria-label="Main navigation">${renderNav(pages, { loggedIn })}</nav></header>
${marqueeHtml}
<main id="main">${bodyHtml}</main>
<footer class="footer"><div class="wrap"><div>${renderSocialLinks(site)}<h3 data-site-field="title">${formatInlineRichText(site.title)}</h3><p data-site-field="footer_note">${formatRichText(site.footer_note)}</p><small>School colors and imagery sourced from East Forsyth High School assets provided with permission.</small></div><div><h3>Program</h3>${pages.slice(1,4).map((p) => `<a href="${escapeAttr(p.path)}">${escapeHtml(p.title)}</a>`).join('')}</div><div><h3>Families</h3>${pages.slice(4,7).map((p) => `<a href="${escapeAttr(p.path)}">${escapeHtml(p.title)}</a>`).join('')}</div><div><h3>Community</h3><a href="/sponsors.html">Sponsors</a><a href="/become-a-sponsor.html">Become a Sponsor</a><a href="/contact.html">Contact</a><a href="https://www.wsfcs.k12.nc.us/o/efhs">EFHS Website</a></div></div></footer>
<script src="/script.js?v=${ASSET_VERSION}"></script><script src="/site-content.js?v=${ASSET_VERSION}"></script>${page.slug === 'calendar' ? `<script src="/caldev.js?v=${ASSET_VERSION}"></script>` : ''}
</body></html>`;
}

function renderMaintenancePage(site = {}) {
  const title = site.title || 'East Forsyth Band';
  const logo = site.logo_url || '/assets/efhs-logo.png';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttr(title)} website is temporarily undergoing maintenance.">
  <meta name="robots" content="noindex">
  <title>Maintenance | ${escapeHtml(title)}</title>
  <link rel="icon" href="${escapeAttr(site.logo_url || '/assets/efhs-icon.png')}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}">
</head>
<body class="maintenance-body">
<main class="maintenance-shell" id="main">
  <img class="maintenance-logo" src="${escapeAttr(logo)}" alt="${escapeAttr(title)} logo">
  <p class="kicker">${escapeHtml(title)}</p>
  <h1>We’ll be right back.</h1>
  <p class="maintenance-copy">The website is temporarily down for maintenance. Please check back soon, or visit the school site for general information.</p>
  <div class="button-row">
    <a class="btn primary" href="/">Try homepage again</a>
    <a class="btn outline" href="https://www.wsfcs.k12.nc.us/o/efhs">EFHS Website</a>
  </div>
</main>
<script>
(function () {
  function readReturnPath() {
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i += 1) {
      var part = parts[i].trim();
      if (part.indexOf('efband_maintenance_return=') !== 0) continue;
      try {
        var value = decodeURIComponent(part.slice('efband_maintenance_return='.length) || '');
        if (!value || value.charAt(0) !== '/' || value.indexOf('//') === 0 || value.indexOf(':') !== -1) return '/';
        if (value.indexOf('/maintenance') !== -1 || value.indexOf('/admin') === 0) return '/';
        return value.split('#')[0] || '/';
      } catch (error) {
        return '/';
      }
    }
    return '/';
  }
  function clearReturnPath() {
    document.cookie = 'efband_maintenance_return=; Path=/; Max-Age=0; SameSite=Lax';
  }
  async function leaveIfLive() {
    try {
      const response = await fetch('/api/site', { cache: 'no-store' });
      if (!response.ok) return;
      const site = await response.json();
      const enabled = site && (site.maintenance_mode === true || site.maintenance_mode === 1 || site.maintenance_mode === '1');
      if (!enabled) {
        var target = readReturnPath() || '/';
        clearReturnPath();
        window.location.replace(target);
      }
    } catch (_) {}
  }
  leaveIfLive();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') leaveIfLive();
  });
  setInterval(leaveIfLive, 15000);
})();
</script>
</body>
</html>`;
}

async function serveStaticOrCms(request, env, url) {
  await initDb(env);
  const site = await getSite(env);
  const maintenanceOn = isMaintenanceMode(site);
  const user = await currentUser(request, env);
  const loggedIn = Boolean(user);
  const superAdmin = loggedIn && isSuperAdmin(user);
  if (isMaintenancePath(url.pathname)) {
    // When live again, bounce people off the maintenance URL so browsers don't stay stuck there.
    if (!maintenanceOn) {
      const returnTo = readMaintenanceReturnPath(request);
      return new Response(null, {
        status: 302,
        headers: {
          location: returnTo || '/',
          'cache-control': 'no-store',
          'set-cookie': clearMaintenanceReturnCookie(),
        },
      });
    }
    // Super admins preview the real site; everyone else stays on the public maintenance page.
    if (superAdmin) {
      return new Response(null, {
        status: 302,
        headers: {
          location: '/',
          'cache-control': 'no-store',
        },
      });
    }
    return htmlResponse(renderMaintenancePage(site));
  }
  // Public + non-super-admin users get the maintenance page. Super admins can preview.
  if (shouldRedirectToMaintenance(url.pathname, site, { bypass: superAdmin })) {
    const returnPath = `${url.pathname || '/'}${url.search || ''}`;
    return new Response(null, {
      status: 302,
      headers: {
        location: '/maintenance.html',
        'cache-control': 'no-store',
        'set-cookie': maintenanceReturnCookie(returnPath),
      },
    });
  }
  const path = url.pathname === '/' ? '/' : normalizeStaticPath(url.pathname);
  if (path === '/' || path.endsWith('.html')) {
    const page = await getPageByPath(env, path);
    if (page) {
      const [site, pages, allSponsors, staff, boosterMembers] = await Promise.all([
        getSite(env),
        getPages(env),
        getSponsors(env),
        page.slug === 'directors' ? getStaff(env) : Promise.resolve([]),
        page.slug === 'boosters' ? getBoosterMembers(env) : Promise.resolve([]),
      ]);
      const sponsors = page.slug === 'sponsors' ? allSponsors : [];
      return htmlResponse(renderCmsPage(page, site, pages, sponsors, staff, boosterMembers, allSponsors, {
        maintenancePreview: maintenanceOn && superAdmin,
        loggedIn,
      }));
    }
  }
  if (url.pathname === '/') return env.ASSETS.fetch(request);
  const assetUrl = new URL(request.url);
  assetUrl.pathname = normalizeStaticPath(url.pathname);
  const rawGuidePath = String(url.pathname || '').replace(/\/+$/, '') || '/';
  if (isCmsWebsiteGuidePath(rawGuidePath) || isCmsWebsiteGuidePath(assetUrl.pathname)) {
    const guideAuth = await requireLogin(request, env);
    if (guideAuth.response) {
      return redirect(`/admin/login?next=${encodeURIComponent('/admin')}`);
    }
    if (!canAccessWebsiteGuide(guideAuth.user)) {
      return htmlResponse('<!doctype html><title>Forbidden</title><p>The Website Guide is available to Super Admins only.</p><p><a href="/admin">Back to CMS</a></p>', 403);
    }
    // Always serve the current Super Admin PDF (legacy filenames redirect here).
    const servePdf = !rawGuidePath.endsWith('.html') && !assetUrl.pathname.endsWith('.html');
    assetUrl.pathname = servePdf ? CMS_WEBSITE_GUIDE_PDF_PATH : CMS_WEBSITE_GUIDE_HTML_PATH;
    const guideAsset = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (!guideAsset.ok) return guideAsset;
    const headers = new Headers(guideAsset.headers);
    if (servePdf) {
      headers.set('content-type', 'application/pdf');
      headers.set('content-disposition', 'inline; filename="EFHS-Band-Website-CMS-Guide-Super-Admin.pdf"');
    } else {
      headers.set('content-type', 'text/html; charset=utf-8');
    }
    headers.set('cache-control', 'private, no-store');
    return new Response(guideAsset.body, { status: guideAsset.status, statusText: guideAsset.statusText, headers });
  }
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
  // Keep CMS scripts/styles fresh so deploy fixes are not masked by long CDN/browser caches.
  const assetName = assetUrl.pathname.split('/').pop() || '';
  if (['admin.js', 'admin-caldev.js', 'caldev.js', 'site-content.js', 'script.js', 'styles.css', 'push-sw.js', 'manifest.webmanifest'].includes(assetName)) {
    const headers = new Headers(assetResponse.headers);
    headers.set('cache-control', 'no-store');
    if (assetName === 'push-sw.js') {
      headers.set('content-type', 'application/javascript; charset=utf-8');
      headers.set('service-worker-allowed', '/');
    }
    if (assetName === 'manifest.webmanifest') {
      headers.set('content-type', 'application/manifest+json; charset=utf-8');
    }
    return new Response(assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
  }
  return assetResponse;
}

export function renderPushServiceWorker() {
  // Kept for tests; runtime serves /push-sw.js from static assets.
  return '';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/push-sw.js') {
      const asset = await env.ASSETS.fetch(new Request(new URL('/push-sw.js', request.url), request));
      if (asset.ok) {
        const headers = new Headers(asset.headers);
        headers.set('content-type', 'application/javascript; charset=utf-8');
        headers.set('cache-control', 'no-store');
        headers.set('service-worker-allowed', '/');
        return new Response(asset.body, { status: 200, headers });
      }
    }
    if (url.pathname === '/manifest.webmanifest') {
      const asset = await env.ASSETS.fetch(new Request(new URL('/manifest.webmanifest', request.url), request));
      if (asset.ok) {
        const headers = new Headers(asset.headers);
        headers.set('content-type', 'application/manifest+json; charset=utf-8');
        headers.set('cache-control', 'no-store');
        return new Response(asset.body, { status: 200, headers });
      }
    }
    if (url.pathname === '/health' || url.pathname.startsWith('/api/')) return handleApi(request, env, url, ctx);
    if (url.pathname === '/subscribe' || url.pathname === '/subscribe/') {
      const target = new URL('/calendar.html', url.origin);
      target.searchParams.set('subscribe', '1');
      return Response.redirect(target.toString(), 302);
    }
    if (url.pathname === '/caldev' || url.pathname === '/caldev/' || url.pathname === '/caldev.html') {
      return Response.redirect(new URL('/calendar.html', url.origin).toString(), 302);
    }
    if (url.pathname === '/calendar' || url.pathname === '/calendar/') {
      return Response.redirect(new URL('/calendar.html', url.origin).toString(), 302);
    }
    if (url.pathname === '/sponsor' || url.pathname === '/sponsor/') {
      return Response.redirect(new URL('/become-a-sponsor.html', url.origin).toString(), 302);
    }
    if (url.pathname === '/donate' || url.pathname === '/donate/') {
      const target = new URL('/sponsors.html', url.origin);
      target.searchParams.set('donate', '1');
      return Response.redirect(target.toString(), 302);
    }
    if (url.pathname === '/admin/login') return handleLogin(request, env);
    // Accept GET or POST so visiting /admin/logout never falls through to the public homepage
    // (relative asset paths like styles.css break under /admin/* and show an unstyled page).
    if (url.pathname === '/admin/logout') return logout(request, env);
    if (url.pathname === '/admin/zernio/facebook/connect') return handleZernioFacebookConnect(request, env);
    if (url.pathname === '/admin/zernio/facebook/callback') return handleZernioFacebookCallback(request, env);
    if (url.pathname === '/admin/zernio/instagram/connect') return handleZernioInstagramConnect(request, env);
    if (url.pathname === '/admin/zernio/instagram/callback') return handleZernioInstagramCallback(request, env);
    if (url.pathname === '/admin') return handleAdmin(request, env);
    if (url.pathname.startsWith('/admin/')) return redirect('/admin');
    if (url.pathname.startsWith('/uploads/')) return handleUploadGet(env, url);
    return serveStaticOrCms(request, env, url);
  },
};

const LOGIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login | East Forsyth Band</title><link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}"></head><body class="admin-body"><main class="admin-shell small admin-login-shell"><h1>East Forsyth Band Admin</h1><p>Log in to edit assigned CMS areas.</p><form class="admin-card" method="post" action="/admin/login"><label>Username<input name="username" required autocomplete="username"></label><label class="admin-password-label">Password<span class="admin-password-field"><input id="admin-login-password" name="password" type="password" required autocomplete="current-password"><button type="button" class="admin-password-toggle" data-password-toggle aria-controls="admin-login-password" aria-pressed="false" aria-label="Show password" title="Show password"><svg class="admin-password-icon admin-password-icon-show" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7Zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9Zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg><svg class="admin-password-icon admin-password-icon-hide" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.3 2.2 2.2 3.3l3.1 3.1C3.4 7.6 1.7 9.2.9 11c1.7 3.9 6 7 11.1 7 2.1 0 4.1-.5 5.8-1.4l3 3 1.1-1.1L3.3 2.2Zm8.7 13.3c-2.5 0-4.5-2-4.5-4.5 0-.7.2-1.4.5-2l6 6c-.6.3-1.3.5-2 .5Zm10.1-4.5c-.5 1.2-1.4 2.4-2.5 3.4l-2.2-2.2a4.5 4.5 0 0 0-5.9-5.9L8.9 4.7C9.9 4.4 10.9 4.2 12 4.2c5.1 0 9.4 3.1 11.1 7Z"/></svg></button></span></label><button class="btn primary" type="submit">Log in</button></form><p class="admin-login-home"><a href="/">← Back to home page</a></p></main><script>(function(){var btn=document.querySelector("[data-password-toggle]");var input=document.getElementById("admin-login-password");if(!btn||!input)return;btn.addEventListener("click",function(){var show=input.type==="password";input.type=show?"text":"password";btn.setAttribute("aria-pressed",show?"true":"false");btn.setAttribute("aria-label",show?"Hide password":"Show password");btn.title=show?"Hide password":"Show password";btn.classList.toggle("is-revealed",show);});})();</script></body></html>`;

const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EFHS Band Admin CMS</title><link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}"></head><body class="admin-body"><main class="admin-shell cms-shell image-admin-shell">
<div class="admin-mobile-bar">
<div class="admin-mobile-bar-top">
<button type="button" class="admin-nav-toggle" aria-expanded="false" aria-controls="admin-mobile-menu">Menu</button>
<form id="admin-mobile-logout-form" class="admin-mobile-logout-form" method="post" action="/admin/logout">
<button class="admin-mobile-logout-btn" type="submit">Log Out</button>
</form>
</div>
<nav id="admin-mobile-menu" class="admin-mobile-menu" hidden aria-label="CMS mobile navigation"></nav>
</div>
<aside id="admin-sidebar" class="admin-sidebar"><div class="admin-brand"><img class="admin-brand-mark" src="/assets/efhs-admin-mark.png?v=${ASSET_VERSION}" alt="East Forsyth Band eagle logo"><div><b>EFHS Band</b><small>Admin CMS</small></div></div><div id="current-user" class="admin-user"></div><nav class="admin-tabs admin-menu" aria-label="CMS navigation"><button type="button" data-tab="dashboard">Dashboard</button><button type="button" data-tab="mail">Staff Email</button><p class="admin-menu-label" data-page-shortcuts-label hidden>Pages</p><div id="admin-page-shortcuts" class="admin-page-shortcuts"></div><p class="admin-menu-label">Manage</p><button type="button" data-tab="staff">Directors & Staff</button><button type="button" data-tab="ensembles" hidden>Ensemble</button><div class="admin-menu-group" data-boosters-menu hidden><button type="button" class="admin-menu-parent" data-boosters-toggle aria-expanded="false">Band Boosters</button><div class="admin-menu-sub" data-boosters-sub hidden><button type="button" data-tab="booster-members">Booster Members</button><button type="button" data-tab="minutes">Meeting Minutes</button><button type="button" data-tab="badge-creator">Badge Creator</button></div></div><button type="button" data-tab="events" hidden>Calendar Events</button><div class="admin-menu-group" data-sponsors-menu hidden><button type="button" class="admin-menu-parent" data-sponsors-toggle aria-expanded="false">Sponsors</button><div class="admin-menu-sub" data-sponsors-sub hidden><button type="button" data-tab="sponsors">Manage sponsors</button><button type="button" data-sponsor-nav="sponsors-page">Sponsors page</button><button type="button" data-sponsor-nav="become-a-sponsor">Become a Sponsor</button></div></div><button type="button" data-tab="contact">Contact Form</button><button type="button" data-tab="ledger" hidden>Ledger</button><button type="button" data-tab="checkout" hidden>Checkout</button><button type="button" data-tab="users">Users</button><button type="button" data-tab="caldev" hidden>Schedule Board</button><button type="button" data-tab="security-log" hidden>Security Log</button><button type="button" data-tab="social">Social Media</button><button type="button" data-tab="site">Site Settings</button><button type="button" data-tab="photos">Photos</button></nav><div class="admin-sidebar-footer"><form id="admin-logout-form" class="admin-logout-form" method="post" action="/admin/logout"><button class="admin-logout" type="submit">Log Out</button></form><button type="button" class="admin-change-password" data-open-password>Change Password</button></div></aside>
<section class="admin-workspace">
<section id="tab-dashboard" class="cms-panel dashboard-panel"><div class="panel-head"><div><p class="kicker">Administration</p><h1 id="dashboard-welcome">Welcome back</h1><p>Changes save to the shared CMS database and publish to the public East Forsyth Band website.</p></div><a class="btn primary" href="/" target="_blank" rel="noreferrer">View Site</a></div><div id="dashboard-cards" class="dashboard-cards"></div></section>
<section id="tab-pages" class="cms-panel editor-panel"><div class="panel-head"><div><p class="kicker">Website Pages</p><h1 data-page-editor-title>Select a page to edit</h1><p>Site admins manage pages here. Editors with page permissions edit assigned page bodies from Manage. Edit text in the live preview, then save to publish.</p></div><button class="btn outline" type="button" id="new-page" hidden>Add Page</button></div><div class="editor-layout page-visual-layout"><div class="page-canvas-shell"><div class="page-canvas-sticky"><div class="page-canvas-toolbar"><div><strong>Live page preview</strong><small>Click any text to edit · Select text, then use the Formatting bar for color/bold/size · Save to publish</small></div><span class="page-dirty-chip" data-page-dirty-chip>Unsaved</span><span class="page-canvas-chip" data-page-layout-chip>Standard layout</span></div><div id="rich-text-toolbar" class="rich-text-toolbar" hidden><div class="rich-text-toolbar-main"><span class="rich-text-toolbar-label">Formatting</span><button type="button" data-rich="bold" title="Bold"><b>B</b></button><button type="button" data-rich="italic" title="Italic"><i>I</i></button><button type="button" data-rich="underline" title="Underline"><u>U</u></button><label class="rich-color" title="Text color"><span>Color</span><input type="color" id="rich-text-color" value="#002142"></label><label class="rich-size" title="Font size"><span>Size</span><select id="rich-text-size"><option value="">Normal</option><option value="14px">Small</option><option value="18px">Medium</option><option value="22px">Large</option><option value="28px">Extra large</option></select></label></div><small class="rich-text-hint">Select heading, intro, or body text in the preview, then apply formatting.</small></div></div><div id="page-preview" class="page-preview" hidden aria-label="Editable page preview"></div><div class="page-preview-empty" data-page-preview-empty><p class="kicker">Visual editor</p><h2>Choose a page to begin</h2><p>Open any page from the left menu. The preview matches the public layout and stays editable like Squarespace or Drupal.</p></div></div>
<button type="button" class="page-editor-resizer" id="page-editor-resizer" aria-label="Resize page preview" title="Drag to resize preview" hidden></button>
<form id="page-form" class="admin-card stack page-settings-card" hidden><h2>Page settings</h2><p class="notice" data-calendar-hint hidden>The Calendar page text controls the header/instructions. Events are managed in the Schedule Board tab.</p><p class="notice" data-sponsors-hint hidden>The Sponsors page text controls the header, intro, and callout. To add, edit, or remove sponsor businesses, open Sponsors → Manage sponsors.</p><p class="notice" data-become-sponsor-hint hidden>Click the Bronze, Silver, and Gold package cards in the preview to edit labels, titles, descriptions, benefits, and dollar amounts. Contact topics and delivery emails are managed in the Contact Form tab.</p><p class="notice" data-boosters-hint hidden>Edit the Boosters page intro and main content card here. Pay dues opens on the public page. Booster meetings come from Schedule Board Meetings, members from Band Boosters → Booster Members, and minutes from Meeting Minutes.</p><p class="notice" data-contact-hint hidden>The Contact page text controls the header and intro. Contact topics and delivery emails are managed in the Contact tab.</p><p class="notice" data-gallery-hint hidden>The Gallery page text controls the header and intro. Photos are managed in the Photos tab. Visitors can click any photo to open a larger viewer.</p><p class="notice" data-home-hint hidden>Hero headline and top utility links are in Site Settings. Edit the Boosters and Launch note cards in the live preview.</p><input type="hidden" name="original_slug"><input type="hidden" name="kicker"><input type="hidden" name="heading"><input type="hidden" name="intro"><input type="hidden" name="body_text"><input type="hidden" name="callout_title"><input type="hidden" name="callout_text"><input type="hidden" name="boosters_tag"><input type="hidden" name="boosters_heading"><input type="hidden" name="boosters_body"><input type="hidden" name="boosters_button"><input type="hidden" name="boosters_href"><input type="hidden" name="launch_tag"><input type="hidden" name="launch_heading"><input type="hidden" name="launch_body"><input type="hidden" name="launch_footer"><input type="hidden" name="tiers_kicker"><input type="hidden" name="tiers_heading"><input type="hidden" name="tiers_intro"><input type="hidden" name="bronze_label"><input type="hidden" name="bronze_title"><input type="hidden" name="bronze_blurb"><input type="hidden" name="bronze_benefits"><input type="hidden" name="bronze_amount"><input type="hidden" name="silver_label"><input type="hidden" name="silver_title"><input type="hidden" name="silver_blurb"><input type="hidden" name="silver_benefits"><input type="hidden" name="silver_amount"><input type="hidden" name="gold_label"><input type="hidden" name="gold_title"><input type="hidden" name="gold_blurb"><input type="hidden" name="gold_benefits"><input type="hidden" name="gold_amount"><div class="form-grid page-meta-grid"><label>Page title<input name="title" required></label><label>Slug<input name="slug" placeholder="booster-info" required></label><label>Path<input name="path" placeholder="/booster-info.html"></label><label>Navigation order<input name="nav_order" type="number" value="99"></label><label class="full">Page layout<select name="layout"><option value="home" hidden>Home page</option><option value="standard">Standard information page</option><option value="calendar">Calendar page with event list</option><option value="contact">Contact/details page</option><option value="directory">Directors &amp; staff directory</option><option value="sponsors">Sponsors page with directory</option><option value="become-sponsor">Become a sponsor packages page</option><option value="boosters">Boosters page with meetings &amp; members</option></select></label></div><label class="checkline page-active-line"><input name="active" type="checkbox" checked> Active / visible on the public site</label><label class="toggle-line" data-fundraising-notify hidden><input type="checkbox" name="notify_email_subscribers" value="1" checked><span><b>Notify email list</b><small>Email fundraising subscribers about this save (on by default). Turn off for grammar-only edits.</small></span></label><div class="page-settings-actions"><button class="btn primary" type="submit">Save Changes</button><button class="btn outline" type="button" id="add-page-callout">Add callout</button></div><p class="status" id="page-status"></p></form></div></section>
<section id="tab-staff" class="cms-panel staff-panel"><div class="panel-head"><div><p class="kicker">People</p><h1>Directors &amp; Staff</h1><p>Add a photo, name, role, and short description for each staff member. Drag rows to reorder the public directory.</p></div><div class="panel-actions"><button class="btn outline" type="button" id="edit-directors-page">Edit page text</button><button class="btn primary" type="button" id="new-staff">Add Staff Member</button></div></div><div class="editor-layout"><form id="staff-form" class="admin-card stack"><input type="hidden" name="staff_id" value=""><div class="form-grid"><label>Name<input name="name" required placeholder="Jordan Smith"></label><label class="full form-rich-label"><span>Role / title</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor form-rich-inline cms-edit-rich cms-edit-inline" contenteditable="true" role="textbox" spellcheck="true" data-rich-input="role" data-rich-mode="inline" data-placeholder="Band Director" aria-label="Role / title"></div><input type="hidden" name="role"></label><label class="full form-rich-label"><span>Short description</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor cms-edit-rich" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-rich-input="bio" data-rich-mode="block" data-placeholder="Email, office hours, or a short bio." aria-label="Short description"></div><input type="hidden" name="bio"></label><label class="full">Photo URL<input name="photo_url" placeholder="/uploads/director.jpg or https://..."></label><label class="full">Upload photo<input name="photo_file" type="file" accept="image/*"></label><label class="checkline"><input name="active" type="checkbox" checked> Show on Directors &amp; Staff page</label></div><button class="btn primary">Save Staff Member</button><p class="status" id="staff-status"></p></form><div><div id="staff-list" class="admin-list staff-list" aria-label="Staff list. Drag rows to reorder."></div><div class="live-preview staff-live-preview"><span>Live Preview</span><div id="staff-preview" class="directory"></div></div></div></div></section>
<section id="tab-booster-members" class="cms-panel staff-panel"><div class="panel-head"><div><p class="kicker">Families</p><h1>Booster Members</h1><p>Add a photo, name, role, and short description for each booster officer or member. Drag rows to reorder the public Boosters page directory.</p></div><div class="panel-actions"><button class="btn outline" type="button" id="edit-boosters-page">Edit Boosters page</button><button class="btn primary" type="button" id="new-booster-member">Add Booster Member</button></div></div><div class="editor-layout"><form id="booster-member-form" class="admin-card stack"><input type="hidden" name="booster_member_id" value=""><div class="form-grid"><label>Name<input name="name" required placeholder="Jordan Smith"></label><label class="full form-rich-label"><span>Role / title</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor form-rich-inline cms-edit-rich cms-edit-inline" contenteditable="true" role="textbox" spellcheck="true" data-rich-input="role" data-rich-mode="inline" data-placeholder="Booster President" aria-label="Role / title"></div><input type="hidden" name="role"></label><label class="full form-rich-label"><span>Short description</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor cms-edit-rich" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-rich-input="bio" data-rich-mode="block" data-placeholder="Email, meeting notes, or a short bio." aria-label="Short description"></div><input type="hidden" name="bio"></label><label class="full">Photo URL<input name="photo_url" placeholder="/uploads/booster.jpg or https://..."></label><label class="full">Upload photo<input name="photo_file" type="file" accept="image/*"></label><label class="checkline"><input name="active" type="checkbox" checked> Show on Boosters page</label></div><button class="btn primary">Save Booster Member</button><p class="status" id="booster-member-status"></p></form><div><div id="booster-members-list" class="admin-list staff-list" aria-label="Booster members list. Drag rows to reorder."></div><div class="live-preview staff-live-preview"><span>Live Preview</span><div id="booster-members-preview" class="directory"></div></div></div></div></section>
<section id="tab-sponsors" class="cms-panel sponsors-panel"><div class="panel-head"><div><p class="kicker">Community</p><h1>Manage sponsors</h1><p>Add, edit, reorder, or remove sponsor businesses. Assign Bronze, Silver, or Gold to control marquee, fly-in, and public advertising.</p></div><div class="panel-actions"><button class="btn primary" type="button" id="new-sponsor">Add Sponsor</button></div></div><div class="editor-layout"><div class="admin-card stack gold-sponsors-print-card">
  <h2>Gold sponsors for advertising</h2>
  <p class="muted">Active Gold sponsors with logos for programs, flyers, and handouts. Print builds a PDF in the background, then opens the print dialog in this page (no pop-up window).</p>
  <div id="gold-sponsors-print-preview" class="gold-sponsors-print-preview" aria-live="polite"></div>
  <button class="btn outline" type="button" id="print-gold-sponsors">Print Gold sponsors PDF</button>
  <p class="status" id="gold-sponsors-print-status"></p>
</div>
<form id="sponsor-ad-settings-form" class="admin-card stack sponsor-ad-settings-card"><h2>Homepage fly-in timing</h2><p class="muted">Silver and Gold sponsors can appear in the homepage fly-in. Choose how long it stays before closing.</p><label>Display time (seconds)<input name="sponsor_ad_seconds" type="number" min="2" max="30" step="1" value="6" required></label><button class="btn primary" type="submit">Save ad timing</button><p class="status" id="sponsor-ad-settings-status"></p></form><form id="sponsor-form" class="admin-card stack"><input type="hidden" name="id"><div class="form-grid"><label>Sponsor name<input name="name" required placeholder="ABC Company"></label><label>Sponsor tier<select name="level"><option value="Bronze Sponsor">Bronze — marquee</option><option value="Silver Sponsor">Silver — marquee + fly-in</option><option value="Gold Sponsor" selected>Gold - Marquee + Fly-in + public advert</option></select></label><p class="sponsor-tier-benefits muted" id="sponsor-tier-benefits" aria-live="polite"></p><label class="full">Street address<input name="address" placeholder="123 Main Street"></label><label>City<input name="city" value="Kernersville" placeholder="Kernersville"></label><label>State<select name="state"><option value="AL">Alabama</option><option value="AK">Alaska</option><option value="AZ">Arizona</option><option value="AR">Arkansas</option><option value="CA">California</option><option value="CO">Colorado</option><option value="CT">Connecticut</option><option value="DE">Delaware</option><option value="FL">Florida</option><option value="GA">Georgia</option><option value="HI">Hawaii</option><option value="ID">Idaho</option><option value="IL">Illinois</option><option value="IN">Indiana</option><option value="IA">Iowa</option><option value="KS">Kansas</option><option value="KY">Kentucky</option><option value="LA">Louisiana</option><option value="ME">Maine</option><option value="MD">Maryland</option><option value="MA">Massachusetts</option><option value="MI">Michigan</option><option value="MN">Minnesota</option><option value="MS">Mississippi</option><option value="MO">Missouri</option><option value="MT">Montana</option><option value="NE">Nebraska</option><option value="NV">Nevada</option><option value="NH">New Hampshire</option><option value="NJ">New Jersey</option><option value="NM">New Mexico</option><option value="NY">New York</option><option value="NC" selected>North Carolina</option><option value="ND">North Dakota</option><option value="OH">Ohio</option><option value="OK">Oklahoma</option><option value="OR">Oregon</option><option value="PA">Pennsylvania</option><option value="RI">Rhode Island</option><option value="SC">South Carolina</option><option value="SD">South Dakota</option><option value="TN">Tennessee</option><option value="TX">Texas</option><option value="UT">Utah</option><option value="VT">Vermont</option><option value="VA">Virginia</option><option value="WA">Washington</option><option value="WV">West Virginia</option><option value="WI">Wisconsin</option><option value="WY">Wyoming</option></select></label><label class="full">Logo URL<input name="logo_url" placeholder="https://example.com/logo.png or /uploads/logo.png"></label><label class="full">Upload logo<input name="logo_file" type="file" accept="image/*,.svg"><small class="field-hint">Upload a file or paste a URL above. Upload replaces the URL when you save.</small></label><div class="sponsor-logo-preview" data-sponsor-logo-preview hidden><img alt="Sponsor logo preview"></div><label>Fallback logo text<input name="mark_text" placeholder="ABC"></label><label class="checkline"><input name="active" type="checkbox" checked> Show on public Sponsors page</label></div><button class="btn primary">Save Sponsor</button><p class="status" id="sponsor-status"></p></form><div><div id="sponsors-list" class="admin-list sponsor-list"></div></div></div></section>
<section id="tab-ledger" class="cms-panel ledger-panel" hidden><div class="panel-head"><div><p class="kicker">Treasurer</p><h1>Ledger</h1><p>Accountant view for donors, sponsors, fundraisers, dues, and expenses. Cash and in-kind entries update the downloadable Excel ledger.</p></div><div class="panel-actions"><a class="btn outline" id="download-ledger-excel" href="/api/admin/ledger.xls">Download Excel</a><button class="btn outline" type="button" id="refresh-ledger">Refresh</button><button class="btn primary" type="button" id="new-ledger-entry">Add entry</button></div></div>
<div class="ledger-summary-grid" id="ledger-summary" aria-live="polite"></div>
<div class="admin-card stack ledger-table-card">
  <div class="ledger-table-head"><h2>Transaction ledger</h2><p class="muted">Newest entries first. Amounts for expenses appear as credits against income.</p></div>
  <div class="ledger-table-wrap">
    <table class="ledger-table" id="ledger-table">
      <thead>
        <tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Name</th><th scope="col">Amount</th><th scope="col">Cash / In-kind</th><th scope="col">Description</th><th scope="col">Note</th><th scope="col"><span class="sr-only">Actions</span></th></tr>
      </thead>
      <tbody id="ledger-table-body"><tr><td colspan="8" class="draft">Loading ledger…</td></tr></tbody>
    </table>
  </div>
  <p class="status" id="ledger-status"></p>
</div>
</section>
<section id="tab-checkout" class="cms-panel checkout-panel" hidden><div class="panel-head"><div><p class="kicker">Payments</p><h1>Checkout</h1><p>Manually charge a card through Square for an item or amount. Available to Treasurer, President, and Vice President.</p></div></div>
<form id="square-connect-form" class="admin-card stack square-connect-card" hidden>
  <div class="utility-links-head">
    <h2>Connect Square</h2>
    <p class="muted">efhsband.org and the Pages preview can have different Cloudflare secrets. Paste the production Square access token and application ID here so checkout works on every host. Cloudflare secrets still take priority when present.</p>
  </div>
  <p class="notice" id="square-connect-source">Checking Square connection…</p>
  <div class="form-grid">
    <label class="full">Access token<input name="square_access_token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste from Square Developer → Credentials"></label>
    <label class="full">Application ID<input name="square_application_id" autocomplete="off" spellcheck="false" placeholder="sq0idp-…"></label>
    <label>Location ID <span class="muted">(optional)</span><input name="square_location_id" autocomplete="off" spellcheck="false" placeholder="Leave blank to auto-detect"></label>
    <label>Environment<select name="square_environment"><option value="production" selected>Production</option><option value="sandbox">Sandbox</option></select></label>
  </div>
  <div class="page-settings-actions">
    <button class="btn primary" type="submit">Save and verify Square</button>
    <button class="btn outline" type="button" id="square-connect-clear" hidden>Clear saved credentials</button>
  </div>
  <p class="status" id="square-connect-status"></p>
</form>
<div class="checkout-layout">
  <form id="checkout-form" class="admin-card stack checkout-form-card" novalidate>
    <h2>Charge a card</h2>
    <p class="muted">Enter the payer, transaction description, amount, and card details. Square processes the payment immediately.</p>
    <label>User name or entity<input name="payer_name" required maxlength="160" placeholder="Student, family, business, or organization" autocomplete="name"></label>
    <label>Description of transaction<input name="item" required maxlength="200" placeholder="Uniform deposit, trailer rental, donation…"></label>
    <label>Amount<input name="amount_display" required inputmode="decimal" placeholder="$25.00"></label>
    <label>Note <span class="muted">(optional)</span><textarea name="note" rows="2" maxlength="500" placeholder="Optional internal note"></textarea></label>
    <div class="checkout-card-box">
      <div id="admin-square-card" class="checkout-card-host" aria-label="Square card entry"></div>
    </div>
    <p class="status" id="checkout-status" aria-live="polite">Loading Square…</p>
    <button class="btn primary checkout-charge-btn" type="submit" id="checkout-submit" disabled>Charge card</button>
  </form>
  <div class="admin-card stack checkout-help-card">
    <h2>How this works</h2>
    <p class="muted">Use this when you need to take a payment in person or by phone. Successful charges are recorded in the Treasurer ledger as fundraiser income.</p>
    <ul class="checkout-help-list">
      <li>Requires Square card checkout to be connected (Cloudflare secrets or Super Admin connect form)</li>
      <li>User name or entity and description of transaction are required</li>
      <li>Minimum charge is $1.00</li>
      <li>Card data stays with Square — it is never stored in the CMS</li>
    </ul>
  </div>
</div>
</section>
<section id="tab-site" class="cms-panel"><div class="panel-head"><div><p class="kicker">Site Settings</p><h1>Home, title, logo, footer, and top links</h1></div></div><div class="editor-layout"><form id="utility-links-form" class="admin-card stack utility-links-card">
  <div class="utility-links-head"><h2>Top utility links</h2><p class="muted">Links in the dark bar at the top right of every public page.</p></div>
  <div id="utility-links-list" class="utility-links-list"></div>
  <div class="page-settings-actions utility-links-actions">
    <button class="btn outline" type="button" id="utility-link-add">Add</button>
    <button class="btn primary" type="submit">Save links</button>
  </div>
  <p class="status" id="utility-links-status"></p>
</form>
<div class="admin-card stack zernio-facebook-card">
  <div class="utility-links-head">
    <h2>Social media accounts</h2>
    <p class="muted">Add Instagram, YouTube, Facebook, X, and TikTok links for the site footer, and connect Facebook publishing, on Social Media.</p>
  </div>
  <p class="notice" id="zernio-facebook-status-site">Open Social Media to manage account links or Facebook posts.</p>
  <div class="panel-actions">
    <button class="btn primary" type="button" data-open-social-tab>Open Social Media</button>
  </div>
</div>
<form id="site-form" class="admin-card stack"><label class="full form-rich-label"><span>Site title</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor form-rich-inline cms-edit-rich cms-edit-inline" contenteditable="true" role="textbox" spellcheck="true" data-rich-input="title" data-rich-mode="inline" data-placeholder="East Forsyth Band" aria-label="Site title"></div><input type="hidden" name="title" required></label><label class="full form-rich-label"><span>Hero title</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor form-rich-inline cms-edit-rich cms-edit-inline" contenteditable="true" role="textbox" spellcheck="true" data-rich-input="hero_title" data-rich-mode="inline" data-placeholder="Sound. Spirit. Eagle Pride." aria-label="Hero title"></div><input type="hidden" name="hero_title" required></label><label class="full form-rich-label"><span>Hero subtitle</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor cms-edit-rich" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-rich-input="hero_subtitle" data-rich-mode="block" data-placeholder="Short hero supporting sentence" aria-label="Hero subtitle"></div><input type="hidden" name="hero_subtitle" required></label><label class="full form-rich-label"><span>Footer note</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor cms-edit-rich" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-rich-input="footer_note" data-rich-mode="block" data-placeholder="Footer note" aria-label="Footer note"></div><input type="hidden" name="footer_note" required></label><label>Logo URL<input name="logo_url" required></label><div class="site-settings-switches"><label class="toggle-line"><span><b>Maintenance mode</b><small>When enabled, the public and non-super-admin users see maintenance.html. Super Admins can open site pages to test, with a maintenance banner at the top.</small></span><input name="maintenance_mode" type="checkbox" role="switch" aria-label="Enable maintenance mode"></label><label class="toggle-line" data-boosters-dues-setting hidden><span><b>Show band dues on Boosters</b><small>Super Admin only. When off, the Pay dues card is hidden on the public Boosters page. Turning it back on restores the card.</small></span><input name="boosters_dues_enabled" type="checkbox" role="switch" aria-label="Show band dues card on Boosters page" checked></label></div><button class="btn primary">Save site settings</button><p class="status" id="site-status"></p></form><form id="logo-form" class="admin-card stack"><h2>Upload new logo</h2><label>Logo file<input name="file" type="file" accept="image/*,.svg" required></label><button class="btn secondary">Upload logo</button><p class="status" id="logo-status"></p></form></div></section>
<section id="tab-social" class="cms-panel social-panel">
<div class="panel-head"><div><p class="kicker">Social</p><h1>Social Media</h1><p>Add Instagram, YouTube, and other account links for the site footer. Connect Facebook and Instagram through Zernio to publish posts. New gallery photos can auto-post to Instagram when it is connected.</p></div></div>
<div class="editor-layout">
<form id="social-links-form" class="admin-card stack utility-links-card social-links-card">
  <div class="utility-links-head"><h2>Account links</h2><p class="muted">These URLs power the social icons above the footer brand on every public page. Leave a URL blank to show a faded placeholder until that network is ready.</p></div>
  <div id="social-links-list" class="social-links-list"></div>
  <div class="page-settings-actions utility-links-actions">
    <button class="btn primary" type="submit">Save social links</button>
  </div>
  <p class="status" id="social-links-status"></p>
</form>
<div class="admin-card stack zernio-instagram-card">
  <div class="utility-links-head">
    <h2>Instagram connection</h2>
    <p class="muted">Uses the same Zernio key as Facebook — nothing to paste. Click Refresh status to load the Instagram account already linked in Zernio. When gallery auto-post is on, new Photos uploads publish to Instagram automatically.</p>
  </div>
  <p class="notice" id="zernio-instagram-status">Checking Instagram connection…</p>
  <label class="toggle-line" id="zernio-instagram-autopost-row" hidden>
    <span><b>Auto-post new gallery photos</b><small>Publishes each new gallery upload (not staff/logo utility images) to Instagram with the photo title/caption.</small></span>
    <input id="zernio-instagram-autopost" name="instagram_gallery_autopost" type="checkbox" role="switch" aria-label="Auto-post new gallery photos to Instagram" checked>
  </label>
  <div class="panel-actions">
    <a class="btn primary" id="zernio-instagram-connect" href="/admin/zernio/instagram/connect" hidden>Connect Instagram</a>
    <button class="btn outline" type="button" id="zernio-instagram-refresh">Refresh status</button>
    <button class="btn outline" type="button" id="zernio-instagram-disconnect" hidden>Disconnect</button>
  </div>
  <p class="status" id="zernio-instagram-message"></p>
</div>
<div class="admin-card stack zernio-facebook-card">
  <div class="utility-links-head">
    <h2>Facebook connection</h2>
    <p class="muted">Log in as a Facebook Page Admin/Editor. On Meta’s permission screens, select your Business and turn on the East Forsyth Band Page — if no Page is shared, connect fails with “no Facebook pages”.</p>
  </div>
  <p class="notice" id="zernio-facebook-status">Checking Facebook connection…</p>
  <div class="panel-actions">
    <a class="btn primary" id="zernio-facebook-connect" href="/admin/zernio/facebook/connect">Connect Facebook</a>
    <button class="btn outline" type="button" id="zernio-facebook-refresh" hidden>Refresh status</button>
    <button class="btn outline" type="button" id="zernio-facebook-disconnect" hidden>Disconnect</button>
  </div>
  <p class="status" id="zernio-facebook-message"></p>
</div>
<div class="admin-card stack" id="zernio-facebook-pages-card" hidden>
  <div class="utility-links-head">
    <h2>Choose Facebook Page</h2>
    <p class="muted">Facebook login succeeded. Select the East Forsyth Band Page to finish connecting.</p>
  </div>
  <div id="zernio-facebook-pages-list" class="admin-list zernio-pages-list"></div>
  <p class="status" id="zernio-facebook-pages-status"></p>
</div>
<div class="admin-card stack" id="zernio-facebook-events-card" hidden>
  <div class="utility-links-head">
    <h2>Suggested calendar updates</h2>
    <p class="muted">New or changed calendar events appear here. Post them as one Facebook update, or ignore any you do not need.</p>
  </div>
  <p class="notice" id="zernio-facebook-events-summary">Checking calendar suggestions…</p>
  <div id="zernio-facebook-events-list" class="admin-list zernio-events-queue-list"></div>
  <div class="panel-actions">
    <button class="btn primary" type="button" id="zernio-facebook-events-publish" hidden>Post calendar updates to Facebook</button>
    <button class="btn outline" type="button" id="zernio-facebook-events-ignore-all" hidden>Ignore all suggestions</button>
  </div>
  <p class="status" id="zernio-facebook-events-status"></p>
</div>
<form id="zernio-post-form" class="admin-card stack" hidden>
  <h2>Compose Facebook post</h2>
  <p class="muted">Posts publish through Zernio to the connected Page. Schedule times use America/New_York.</p>
  <label class="full">Post text<textarea name="content" rows="6" required maxlength="5000" placeholder="Share an update with band families…"></textarea></label>
  <label class="full">Image URL <small>optional</small><input name="media_url" type="url" inputmode="url" autocomplete="url" placeholder="https://…"></label>
  <fieldset class="zernio-publish-mode">
    <legend>When to publish</legend>
    <label class="checkline"><input type="radio" name="publish_mode" value="now" checked> Publish now</label>
    <label class="checkline"><input type="radio" name="publish_mode" value="schedule"> Schedule for later</label>
  </fieldset>
  <label class="full" id="zernio-schedule-fields" hidden>Schedule date &amp; time <small>Eastern</small><input name="scheduled_for" type="datetime-local"></label>
  <div class="panel-actions">
    <button class="btn primary" type="submit">Publish to Facebook</button>
  </div>
  <p class="status" id="zernio-post-status"></p>
</form>
<div class="admin-card stack">
  <div class="utility-links-head">
    <h2>Recent posts</h2>
    <p class="muted">Latest posts created through Zernio for this account.</p>
  </div>
  <div id="zernio-posts-list" class="admin-list zernio-posts-list"></div>
  <p class="status" id="zernio-posts-status"></p>
</div>
</div>
</section>
<section id="tab-contact" class="cms-panel">
<div class="panel-head"><div><p class="kicker">Connect</p><h1>Contact Form</h1><p>Create topics for the public form and choose which CMS users receive each inquiry. Multiple users can share a topic.</p><p class="notice" id="contact-delivery-status">Checking email delivery…</p></div><div class="panel-actions"><button class="btn outline" type="button" id="edit-contact-page" data-edit-shortcut="contact">Edit page text</button><button class="btn primary" type="button" id="new-contact-topic">Add Topic</button></div></div>
<div class="editor-layout">
<form id="contact-topic-form" class="admin-card stack">
<input type="hidden" name="id">
<div class="form-grid">
<label class="full">Topic label<input name="label" required maxlength="120" placeholder="General question"></label>
<label class="checkline"><input name="active" type="checkbox" checked> Active on contact form</label>
</div>
<fieldset class="contact-topic-recipients">
  <legend>Deliver messages to</legend>
  <p class="muted">Select one or more CMS users. Their login email receives the inquiry for this topic.</p>
  <div id="contact-topic-recipient-boxes" class="contact-recipient-boxes"></div>
</fieldset>
<button class="btn primary" type="submit">Save Topic</button>
<p class="status" id="contact-topic-status"></p>
</form>
<div class="admin-card"><h2>Topics</h2><p class="muted">Topics are listed A–Z. Only active topics with at least one CMS recipient appear on the public contact form.</p><div id="contact-topics-list" class="admin-list"></div></div>
<div class="admin-card"><h2>Recent Messages</h2><p class="muted">Messages are stored even if email delivery is unavailable.</p><div id="contact-messages-list" class="admin-list"></div></div>
</div>
</section>
<section id="tab-ensembles" class="cms-panel ensembles-panel"><div class="panel-head"><div><p class="kicker">Program</p><h1>Ensemble Body</h1><p>To edit this page. Please click the red edit button in the top right.</p></div><div class="panel-actions"><button class="btn primary" type="button" id="edit-ensembles-body">Edit Body</button></div></div><div class="admin-card stack ensembles-body-card"><h2>Current body</h2><p class="muted">Open the editor to create or update the ensemble cards and body copy shown below the page hero.</p><div id="ensembles-body-preview" class="cms-content ensembles-body-preview"></div><p class="status" id="ensembles-body-panel-status"></p></div>
<div id="ensembles-editor-modal" class="minutes-frame-modal ensembles-editor-modal" hidden>
  <button type="button" class="minutes-frame-backdrop" data-ensembles-editor-dismiss aria-label="Close ensemble body editor"></button>
  <div class="minutes-editor-dialog ensembles-editor-dialog admin-card stack" role="dialog" aria-modal="true" aria-labelledby="ensembles-editor-title">
    <div class="minutes-editor-head">
      <div>
        <p class="kicker">Program</p>
        <h2 id="ensembles-editor-title">Edit Ensemble Body</h2>
      </div>
      <button class="btn outline" type="button" data-ensembles-editor-dismiss>Close</button>
    </div>
    <form id="ensembles-body-form" class="stack minutes-editor-form ensembles-editor-form" novalidate>
      <label class="full form-rich-label"><span>Ensemble body</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor cms-edit-rich ensembles-body-editor" contenteditable="true" role="textbox" spellcheck="true" data-rich-input="body_html" data-rich-mode="block" data-placeholder="Enter ensemble cards and body content…" aria-label="Ensemble body content"></div><input type="hidden" name="body_html"></label>
      <div class="panel-actions minutes-form-actions">
        <button class="btn primary" data-ensembles-submit type="submit">Save body</button>
        <button class="btn outline" type="button" id="cancel-ensembles-edit">Cancel</button>
      </div>
      <p class="status" id="ensembles-body-status"></p>
    </form>
  </div>
</div>
</section>
<section id="tab-minutes" class="cms-panel minutes-panel"><div class="panel-head"><div><p class="kicker">Boosters</p><h1>Meeting Minutes</h1><p>All CMS users can view and print booster meeting minutes by date. Select a meeting to open the document. Secretaries can add, edit, or upload .docx minutes. Only Super Admins can delete.</p></div><div class="panel-actions minutes-panel-actions" data-minutes-manage-actions hidden><button class="btn primary" type="button" id="new-minutes">Add Minutes</button><button class="btn outline" type="button" id="upload-minutes-docx">Upload .docx</button><input id="minutes-docx-file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></div></div><div class="editor-layout minutes-layout"><aside class="admin-card minutes-nav-card"><div class="minutes-nav-desktop-head"><h2>Minutes list</h2><p class="muted">Select a date to open the document.</p></div><div class="minutes-mobile-bar"><button type="button" class="minutes-nav-toggle" aria-expanded="false" aria-controls="minutes-mobile-menu">Minutes</button></div><div id="minutes-mobile-menu" class="minutes-mobile-menu" hidden></div><nav id="minutes-list" class="minutes-nav" aria-label="Submitted meeting minutes"></nav></aside><div class="minutes-main"><p id="minutes-empty" class="minutes-empty-hint muted">Choose a meeting date from the list to open it.</p><article id="minutes-view" class="admin-card stack minutes-view minutes-view-card" hidden aria-labelledby="minutes-view-title"><button type="button" class="btn outline minutes-view-back" data-minutes-view-dismiss>← Minutes list</button><div class="minutes-view-head"><div><p class="kicker">Meeting minutes</p><h2 id="minutes-view-title" data-minutes-view-date></h2><p class="muted" data-minutes-view-meta></p></div><div class="panel-actions"><button class="btn outline" type="button" id="print-minutes" hidden>Print / Save PDF</button><button class="btn primary" type="button" id="edit-minutes" hidden>Edit</button><button class="btn outline" type="button" id="delete-minutes" hidden>Delete</button><button class="btn outline minutes-view-close" type="button" data-minutes-view-dismiss>Close</button></div></div><div class="minutes-document-frame-wrap"><iframe id="minutes-document-frame" class="minutes-document-frame" title="Meeting minutes document" hidden></iframe><div class="minutes-view-body cms-content" data-minutes-view-body hidden></div></div></article></div></div>
<div id="minutes-editor-modal" class="minutes-frame-modal minutes-editor-modal" hidden>
  <button type="button" class="minutes-frame-backdrop" data-minutes-editor-dismiss aria-label="Close minutes editor"></button>
  <div class="minutes-editor-dialog minutes-docx-dialog admin-card stack" role="dialog" aria-modal="true" aria-labelledby="minutes-editor-title">
    <div class="minutes-editor-head minutes-docx-toolbar">
      <div>
        <p class="kicker">Boosters</p>
        <h2 id="minutes-editor-title">Add Minutes</h2>
      </div>
      <div class="panel-actions minutes-docx-toolbar-actions">
        <button class="btn primary" data-minutes-submit form="minutes-form" type="submit">Save minutes</button>
        <button class="btn outline" type="button" id="cancel-minutes-edit">Cancel</button>
      </div>
    </div>
    <form id="minutes-form" class="stack minutes-editor-form minutes-docx-form" novalidate>
      <input type="hidden" name="minutes_id" value="">
      <input type="hidden" name="body_html" value="">
      <div class="minutes-docx-scroll">
        <article class="minutes-docx-sheet" data-minutes-template="east-forsyth-boosters-v1">
          <header class="minutes-docx-letterhead">
            <img class="minutes-docx-banner" src="${MINUTES_LETTERHEAD_BANNER}" alt="East Forsyth Band Boosters letterhead" draggable="false">
          </header>

          <h1 class="minutes-docx-doc-title">Meeting Minutes</h1>
          <label class="minutes-docx-subtitle-label"><span class="sr-only">Meeting subtitle</span>
            <input name="meeting_subtitle" type="text" maxlength="200" placeholder="Optional subtitle (for example: Election of New Officers)" autocomplete="off" class="minutes-docx-subtitle">
          </label>

          <div class="minutes-docx-meta-row">
            <label class="minutes-docx-blank">Date <small>MM/DD/YYYY</small><input name="meeting_date" type="text" inputmode="numeric" autocomplete="off" required placeholder="________" maxlength="10" aria-describedby="minutes-date-hint"></label>
            <label class="minutes-docx-blank">Time<input name="meeting_time" type="text" maxlength="80" placeholder="________" autocomplete="off"></label>
            <label class="minutes-docx-blank minutes-docx-blank-wide">Location<input name="location" type="text" maxlength="200" placeholder="________" autocomplete="off"></label>
          </div>
          <p id="minutes-date-hint" class="field-hint minutes-docx-hint">Defaults to today. Type digits and slashes are inserted for you.</p>
          <label class="minutes-docx-blank minutes-docx-called-by">Meeting Called By<input name="called_by" type="text" maxlength="160" placeholder="________________" autocomplete="name"></label>

          <section class="minutes-docx-section">
            <h2>Call to Order</h2>
            <p class="minutes-docx-prompt">The regular meeting of the East Forsyth Band Boosters was called to order at
              <input name="call_to_order_time" type="text" maxlength="40" placeholder="________" class="minutes-docx-inline"> by
              <input name="call_to_order_by" type="text" maxlength="120" placeholder="________________" class="minutes-docx-inline minutes-docx-inline-wide">.
            </p>
          </section>

          <section class="minutes-docx-section">
            <h2>Attendance</h2>
            <label class="minutes-docx-blank-block">Members Present<textarea name="members_present" rows="2" maxlength="4000" placeholder="________________________________________________________________"></textarea></label>
            <label class="minutes-docx-blank-block">Members Absent<textarea name="members_absent" rows="2" maxlength="4000" placeholder="________________________________________________________________"></textarea></label>
          </section>

          <section class="minutes-docx-section">
            <h2>Approval of Previous Meeting Minutes</h2>
            <p class="minutes-docx-prompt">The minutes from the previous meeting were reviewed.</p>
            <div class="minutes-docx-meta-row minutes-docx-meta-row-2">
              <label class="minutes-docx-blank">Motion to approve<input name="previous_minutes_motion" type="text" maxlength="160" placeholder="________________"></label>
              <label class="minutes-docx-blank">Seconded by<input name="previous_minutes_second" type="text" maxlength="160" placeholder="________________"></label>
            </div>
            <label class="minutes-docx-blank minutes-docx-blank-full">Vote / Action<input name="previous_minutes_vote" type="text" maxlength="300" placeholder="________________________________________________________________"></label>
          </section>

          <section class="minutes-docx-section">
            <h2>Treasurer's Report / Financial Update</h2>
            <label class="minutes-docx-blank-block"><span class="sr-only">Treasurer report</span><textarea name="treasurer_report" rows="3" maxlength="8000" placeholder="Write the financial update…"></textarea></label>
          </section>

          <section class="minutes-docx-section">
            <h2>Director / Band Program Update</h2>
            <label class="minutes-docx-blank-block"><span class="sr-only">Director update</span><textarea name="director_update" rows="3" maxlength="8000" placeholder="Write the program update…"></textarea></label>
          </section>

          <section class="minutes-docx-section">
            <h2>Old Business</h2>
            <label class="minutes-docx-blank-block"><span class="sr-only">Old business</span><textarea name="old_business" rows="3" maxlength="8000" placeholder="Old business notes…"></textarea></label>
          </section>

          <section class="minutes-docx-section">
            <h2>New Business</h2>
            <label class="minutes-docx-blank-block"><span class="sr-only">New business</span><textarea name="new_business" rows="3" maxlength="8000" placeholder="New business notes…"></textarea></label>
          </section>

          <section class="minutes-docx-section">
            <h2>Fundraising</h2>
            <p class="minutes-docx-prompt">Fundraisers discussed, planned, or currently in progress:</p>
            <label class="minutes-docx-blank-block"><span class="sr-only">Fundraising</span><textarea name="fundraising" rows="3" maxlength="8000" placeholder="Fundraising notes…"></textarea></label>
          </section>

          <section class="minutes-docx-section">
            <h2>Upcoming Events &amp; Activities</h2>
            <label class="minutes-docx-blank-block"><span class="sr-only">Upcoming events</span><textarea name="upcoming_events" rows="3" maxlength="8000" placeholder="Upcoming events…"></textarea></label>
          </section>

          <section class="minutes-docx-section">
            <h2>Volunteer Needs</h2>
            <label class="minutes-docx-blank-block"><span class="sr-only">Volunteer needs</span><textarea name="volunteer_needs" rows="2" maxlength="8000" placeholder="Volunteer needs…"></textarea></label>
          </section>

          <section class="minutes-docx-section">
            <h2>Additional Discussion</h2>
            <label class="minutes-docx-blank-block"><span class="sr-only">Additional discussion</span><textarea name="additional_discussion" rows="3" maxlength="8000" placeholder="Additional discussion…"></textarea></label>
          </section>

          <section class="minutes-docx-section">
            <h2>Action Items</h2>
            <ol class="minutes-docx-actions">
              <li><input name="action_item_1" type="text" maxlength="500" placeholder="________________________________________________________________"></li>
              <li><input name="action_item_2" type="text" maxlength="500" placeholder="________________________________________________________________"></li>
              <li><input name="action_item_3" type="text" maxlength="500" placeholder="________________________________________________________________"></li>
            </ol>
          </section>

          <section class="minutes-docx-section">
            <h2>Next Meeting</h2>
            <div class="minutes-docx-meta-row minutes-docx-meta-row-2">
              <label class="minutes-docx-blank">Date<input name="next_meeting_date" type="text" maxlength="80" placeholder="________"></label>
              <label class="minutes-docx-blank">Time<input name="next_meeting_time" type="text" maxlength="80" placeholder="________"></label>
            </div>
          </section>

          <section class="minutes-docx-section minutes-docx-adjournment">
            <h2>Adjournment</h2>
            <div class="minutes-docx-footer-fields">
              <label class="minutes-docx-blank">Meeting Adjourned<input name="adjourned_at" type="text" maxlength="40" placeholder="________"></label>
              <label class="minutes-docx-blank">Submitted by<input name="submitted_by" type="text" maxlength="160" placeholder="________________"></label>
            </div>
            <p class="minutes-docx-footer-note">Secretary, East Forsyth Band Boosters</p>
          </section>
        </article>
      </div>
      <p class="status" id="minutes-status"></p>
    </form>
  </div>
</div>
</section><section id="tab-badge-creator" class="cms-panel badge-creator-panel"><div class="panel-head"><div><p class="kicker">Boosters</p><h1>Badge Creator</h1><p>Create enlarged portrait badges (125% of CR80) for directors, officers, and committee members. Titles and names print larger for readability. Drag the photo in the live preview to center it, then save, download, or print.</p></div></div><div class="badge-creator-layout"><form id="badge-creator-form" class="admin-card stack"><input type="hidden" name="badge_id" value=""><input type="hidden" name="photo_url" value=""><input type="hidden" name="photo_zoom" value="1"><input type="hidden" name="photo_offset_x" value="0"><input type="hidden" name="photo_offset_y" value="0"><div class="form-grid"><label>Name<input name="member_name" required placeholder="Jordan Smith" autocomplete="name"></label><label>Role<select name="role"></select></label><label>Active years<select name="school_year"></select></label><label class="full">Photo<input name="photo_file" type="file" accept="image/*"></label></div><div class="badge-creator-actions"><button class="btn primary" type="submit">Save Badge</button><button class="btn outline" type="button" id="badge-creator-new">New</button><button class="btn outline" type="button" id="badge-creator-download">Download PNG</button><button class="btn outline" type="button" id="badge-creator-print">Print</button></div><p class="status" id="badge-creator-status"></p></form><aside class="admin-card stack badge-creator-preview-card"><h2>Live preview</h2><div class="badge-creator-preview-wrap"><div id="badge-creator-photo-stage" class="badge-creator-photo-stage"><canvas id="badge-creator-preview" width="947" height="1416" aria-label="Badge preview"></canvas><div id="badge-creator-photo-handle" class="badge-creator-photo-handle" hidden><span class="badge-creator-photo-hint">Drag to center</span><button type="button" id="badge-creator-photo-resize" class="badge-creator-photo-resize" aria-label="Resize photo"></button></div></div></div><div id="badge-creator-photo-controls" class="badge-creator-photo-controls" hidden><label class="badge-creator-zoom-label">Photo size <input id="badge-creator-photo-zoom" type="range" min="1" max="3.5" step="0.01" value="1"><span id="badge-creator-photo-zoom-label">1.00×</span></label><button class="btn outline" type="button" id="badge-creator-photo-reset">Reset photo</button><p class="muted">Print includes a 0.25 in white margin around the badge to avoid edge cropping. Drag the photo to center, then resize with the handle or slider.</p></div></aside></div><div class="admin-card stack badge-creator-list-card"><h2>Saved badges</h2><p class="muted">Open a saved badge to edit, download, or print again.</p><div id="badge-creator-list" class="admin-list" aria-label="Saved badges"></div></div></section><section id="tab-mail" class="cms-panel mail-panel">
<div class="panel-head"><div><p class="kicker">Administration</p><h1>Staff Email</h1><p>Compose a rich-text email with optional attachments and send it to selected CMS users. Replies go to the logged-in user’s email username.</p></div></div>
<div class="editor-layout">
<form id="mail-form" class="admin-card stack mail-compose">
<label>Subject<input name="subject" required maxlength="200" placeholder="Band update for the team"></label>
<div class="mail-recipients">
  <div class="mail-recipients-head">
    <h2>Recipients</h2>
    <div class="panel-actions">
      <button class="btn outline" type="button" id="mail-select-all">Select all</button>
      <button class="btn outline" type="button" id="mail-clear-all">Clear</button>
    </div>
  </div>
  <p class="muted">Users are emailed at their login username. Usernames must be valid email addresses.</p>
  <div id="mail-recipients-list" class="mail-recipients-list"></div>
</div>
<div class="mail-editor-block">
  <div class="mail-editor-label">Message</div>
  <div id="mail-rich-toolbar" class="mail-rich-toolbar" role="toolbar" aria-label="Formatting">
    <button type="button" data-mail-rich="bold" title="Bold"><b>B</b></button>
    <button type="button" data-mail-rich="italic" title="Italic"><i>I</i></button>
    <button type="button" data-mail-rich="underline" title="Underline"><u>U</u></button>
    <button type="button" data-mail-rich="insertUnorderedList" title="Bulleted list">• List</button>
    <label class="rich-color" title="Text color"><span>Color</span><input type="color" id="mail-rich-color" value="#002142"></label>
  </div>
  <div id="mail-body" class="mail-body-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Email message" data-placeholder="Write your message…"></div>
</div>
<label class="full">Attachments <small>Optional · up to 5 files · 4 MB each · 10 MB total · PDF, Office, images, TXT, CSV, ZIP</small>
  <input name="attachments" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip,application/pdf,image/*">
</label>
<button class="btn primary" type="submit">Send email</button>
<p class="status" id="mail-status"></p>
</form>
</div>
</section>
<section id="tab-caldev" class="cms-panel" hidden><div class="panel-head"><div><p class="kicker">Program</p><h1>Schedule Board</h1><p>President, Vice President, and Super Admin editing for the public Calendar. Single-click selects, double-click opens the Create/Edit toast, drag (or press-and-hold then drag on mobile) reschedules. Day <b>+</b> adds an event. Events with Who set to <b>Meetings</b> also appear on the Boosters page. Public calendar is <code>/calendar.html</code>.</p></div><div class="panel-actions"><button class="btn primary" type="button" id="caldev-finished-top">Finished</button></div></div><div id="cms-caldev-board" class="cms-caldev-mount" aria-live="polite"></div></section><section id="tab-security-log" class="cms-panel security-log-panel" hidden><div class="panel-head"><div><p class="kicker">Security</p><h1>Security Audit Log</h1><p>Super Admin only — view and print. Five entries per page with « ‹ Page › » navigation. Download PDF for the full encrypted log. This log cannot be edited or deleted, and access cannot be granted to other users.</p></div><div class="panel-actions"><a class="btn outline" id="download-security-log" href="/api/admin/security-log.pdf">Download / Print PDF</a><button class="btn outline" type="button" id="refresh-security-log">Refresh</button></div></div>
<div class="admin-card security-log-filters">
  <div class="form-grid">
    <label>Filter by user<input id="security-log-actor" type="search" placeholder="username" autocomplete="off"></label>
    <label>Filter by action<input id="security-log-action" type="search" placeholder="login, mail.send, change.pages…" autocomplete="off"></label>
  </div>
  <p class="muted">Append-only encrypted vault (<span class="mono">admin_audit_log</span>) with AES-256-GCM + SHA-256 integrity. Isolated from website pages and logos.</p>
  <p class="status" id="security-log-status" aria-live="polite"></p>
</div>
<div class="admin-card">
  <div id="security-log-list" class="security-log-list" aria-live="polite"></div>
  <nav id="security-log-pager" class="security-log-pager" aria-label="Security log pages" hidden></nav>
</div>
</section>
<section id="tab-users" class="cms-panel"><div class="panel-head"><div><p class="kicker">Administration</p><h1>User Management</h1><p>Invite a new editor, then assign global and page-level permissions.</p></div></div><div class="editor-layout"><div class="admin-card"><h2>Team Members</h2><div id="users-list" class="admin-list"></div></div><form id="user-form" class="admin-card stack"><h2>Invite New User</h2><input type="hidden" name="id"><label>Email / Username<input name="username" type="text" required autocomplete="username" placeholder="editor@example.com"></label><label>Display name<input name="display_name" required placeholder="Full name"></label><label>Temporary password <small>required for new users (min 8 chars), optional when editing</small><input name="password" type="password" autocomplete="new-password" minlength="8"></label><label>Role<select name="role"><option value="editor">Editor</option><option value="admin">Super Admin - all permissions</option></select></label><label class="checkline"><input name="active" type="checkbox" checked> Active</label><fieldset><legend>Global permissions</legend><label class="checkline"><input type="checkbox" name="permissions" value="site"> Site settings, home text, logo</label><label class="checkline"><input type="checkbox" name="permissions" value="pages"> Add/remove/manage all pages</label><label class="checkline"><input type="checkbox" name="permissions" value="sponsors"> Manage sponsors</label><label class="checkline"><input type="checkbox" name="permissions" value="contact"> Manage contact form topics</label><label class="checkline"><input type="checkbox" name="permissions" value="staff"> Manage directors &amp; staff</label><label class="checkline"><input type="checkbox" name="permissions" value="boosters"> Manage booster members</label><label class="checkline"><input type="checkbox" name="permissions" value="users"> Manage users</label><label class="checkline"><input type="checkbox" name="permissions" value="mail"> Send mail to CMS users</label><label class="checkline"><input type="checkbox" name="permissions" value="events"> Create calendar events (edit/delete your own)</label><label class="checkline"><input type="checkbox" name="permissions" value="events:manage"> Manage all calendar events (edit/delete any)</label><label class="checkline"><input type="checkbox" name="permissions" value="photos"> Upload/delete photos</label><label class="checkline"><input type="checkbox" name="permissions" value="minutes"> Meeting Minutes Secretary (add/edit)</label><label class="checkline"><input type="checkbox" name="permissions" value="treasurer"> Treasurer (Ledger + Square Checkout)</label><label class="checkline"><input type="checkbox" name="permissions" value="president"> President (Ledger + Square Checkout)</label><label class="checkline"><input type="checkbox" name="permissions" value="vice-president"> Vice President (Square Checkout)</label></fieldset><fieldset><legend>Page edit permissions</legend><div id="page-permission-boxes"></div></fieldset><button class="btn primary">Send Invite / Save User</button><button class="btn outline" type="button" id="new-user">New user</button><p class="status" id="user-status"></p></form></div></section>
<section id="tab-events" class="cms-panel"><div class="panel-head"><div><p class="kicker">Program</p><h1>Calendar Events</h1><p>All CMS users can browse events by month. Optional repeats expand into dated calendar rows for matching weekdays in selected months; exceptions skip specific dates. Repeating events stay on the calendar only (not Boosters). Past events stay here for reference but are hidden from the public Calendar. The public page shows up to 5 upcoming events and does not display the year. Adding or editing events still requires calendar event permission.</p></div><div class="panel-actions"><button class="btn outline" type="button" id="edit-calendar-page" hidden>Edit Calendar page</button><button class="btn outline" type="button" id="new-event">New event</button></div></div><p id="events-view-only-note" class="muted" hidden>You can browse calendar events. Ask a Super Admin for Calendar Events permission to create or edit.</p><div class="editor-layout" id="events-editor-layout"><form id="event-form" class="admin-card stack"><input type="hidden" name="event_id" value=""><p class="status" id="event-status"></p><label>Month<select name="date_label" required><option value="Jan">Jan</option><option value="Feb">Feb</option><option value="Mar">Mar</option><option value="Apr">Apr</option><option value="May">May</option><option value="Jun">Jun</option><option value="Jul">Jul</option><option value="Aug" selected>Aug</option><option value="Sep">Sep</option><option value="Oct">Oct</option><option value="Nov">Nov</option><option value="Dec">Dec</option><option value="Spring">Spring</option><option value="Summer">Summer</option><option value="Fall">Fall</option><option value="Winter">Winter</option><option value="TBD">TBD</option></select></label><label>Day / detail<select name="date_detail" required><option value="TBD">TBD</option><option value="01" selected>01</option><option value="02">02</option><option value="03">03</option><option value="04">04</option><option value="05">05</option><option value="06">06</option><option value="07">07</option><option value="08">08</option><option value="09">09</option><option value="10">10</option><option value="11">11</option><option value="12">12</option><option value="13">13</option><option value="14">14</option><option value="15">15</option><option value="16">16</option><option value="17">17</option><option value="18">18</option><option value="19">19</option><option value="20">20</option><option value="21">21</option><option value="22">22</option><option value="23">23</option><option value="24">24</option><option value="25">25</option><option value="26">26</option><option value="27">27</option><option value="28">28</option><option value="29">29</option><option value="30">30</option><option value="31">31</option><option value="MON">MON</option><option value="TUE">TUE</option><option value="WED">WED</option><option value="THU">THU</option><option value="FRI">FRI</option><option value="SAT">SAT</option><option value="SUN">SUN</option></select></label><label class="full form-rich-label"><span>Title</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor form-rich-inline cms-edit-rich cms-edit-inline" contenteditable="true" role="textbox" spellcheck="true" data-rich-input="title" data-rich-mode="inline" data-placeholder="Event title" aria-label="Event title"></div><input type="hidden" name="title" required></label><label class="full form-rich-label"><span>Description</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor cms-edit-rich" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-rich-input="description" data-rich-mode="block" data-placeholder="Event details" aria-label="Event description"></div><input type="hidden" name="description" required></label><label>Year<input name="event_year" type="number" min="2000" max="2100" value="2026" required></label>
<fieldset class="event-repeat" data-event-repeat>
  <legend>Repeat</legend>
  <label class="checkline"><input type="checkbox" name="repeat_enabled" value="1" data-repeat-enabled> Repeat on selected days and months</label>
  <div class="event-repeat-options" data-repeat-options hidden>
    <p class="muted">Creates a dated calendar row for each matching weekday in the selected months of this year. Public calendar still shows only the next 5 upcoming dates. Repeating events stay on the calendar only (not Boosters).</p>
    <div class="event-repeat-grid">
      <div>
        <p class="event-repeat-heading">Days of the week</p>
        <div class="event-repeat-checks">
          <label class="checkline"><input type="checkbox" name="repeat_day" value="0"> Sun</label>
          <label class="checkline"><input type="checkbox" name="repeat_day" value="1"> Mon</label>
          <label class="checkline"><input type="checkbox" name="repeat_day" value="2"> Tue</label>
          <label class="checkline"><input type="checkbox" name="repeat_day" value="3"> Wed</label>
          <label class="checkline"><input type="checkbox" name="repeat_day" value="4"> Thu</label>
          <label class="checkline"><input type="checkbox" name="repeat_day" value="5"> Fri</label>
          <label class="checkline"><input type="checkbox" name="repeat_day" value="6"> Sat</label>
        </div>
      </div>
      <div>
        <p class="event-repeat-heading">Months</p>
        <div class="event-repeat-checks">
          <label class="checkline"><input type="checkbox" name="repeat_month" value="1"> Jan</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="2"> Feb</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="3"> Mar</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="4"> Apr</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="5"> May</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="6"> Jun</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="7"> Jul</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="8"> Aug</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="9"> Sep</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="10"> Oct</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="11"> Nov</label>
          <label class="checkline"><input type="checkbox" name="repeat_month" value="12"> Dec</label>
        </div>
      </div>
    </div>
    <div class="event-repeat-exceptions">
      <p class="event-repeat-heading">Exceptions (skip these dates)</p>
      <div class="event-exception-add">
        <input type="date" data-exception-date aria-label="Exception date">
        <button class="btn outline" type="button" id="event-exception-add">Add exception</button>
      </div>
      <ul id="event-exceptions-list" class="event-exceptions-list"></ul>
    </div>
  </div>
</fieldset>
<fieldset class="event-placement" data-event-placement><legend>Also show on</legend><label class="checkline"><input type="radio" name="show_on_boosters" value="0" checked> None (calendar only)</label><label class="checkline"><input type="radio" name="show_on_boosters" value="1" data-booster-placement> Boosters meetings card</label><p class="muted" data-repeat-booster-note hidden>Repeating events cannot be added to the Boosters meetings card.</p></fieldset><label class="toggle-line"><input type="checkbox" name="notify_email_subscribers" value="1" checked><span><b>Notify email list</b><small>Email subscribers about this calendar change (on by default). Turn off for grammar-only edits.</small></span></label><button class="btn primary">Save event</button></form><div class="admin-card stack events-list-card"><div class="events-list-head"><div><h2>Events by month</h2><span class="status" id="events-count"></span></div><nav class="events-month-nav" aria-label="Calendar month"><button type="button" class="btn outline events-month-btn" id="events-month-prev" aria-label="Previous month">‹</button><div class="events-month-current"><b id="events-month-label">August 2026</b><button type="button" class="btn outline events-month-today" id="events-month-today">This month</button></div><button type="button" class="btn outline events-month-btn" id="events-month-next" aria-label="Next month">›</button></nav></div><div id="events-list" class="admin-list"></div></div></div></section>
<section id="tab-photos" class="cms-panel"><div class="panel-head"><div><p class="kicker">Media</p><h1>Photo gallery</h1><p>Select one or many JPG, PNG, WEBP, or GIF images. Oversized photos are auto-resized under 1.9 MB before upload. Drag rows to reorder the public gallery. When Instagram gallery auto-post is on, each new upload can publish to Instagram.</p></div><div class="panel-actions"><button class="btn outline" type="button" id="new-photo">New photo</button></div></div><form id="photo-form" class="admin-card stack"><input type="hidden" name="photo_id" value=""><label>Photo(s) <small data-photo-file-hint>Select one or more images · oversized files auto-resize under 1.9 MB</small><input name="file" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif" required></label><label>Alt text<input name="alt_text" required placeholder="Students performing on the field"></label><label class="full form-rich-label"><span>Title / caption</span>${FORM_RICH_TOOLBAR}<div class="form-rich-editor form-rich-inline cms-edit-rich cms-edit-inline" contenteditable="true" role="textbox" spellcheck="true" data-rich-input="caption" data-rich-mode="inline" data-placeholder="Optional title shown under the photo" aria-label="Photo title"></div><input type="hidden" name="caption"></label><button class="btn primary" data-photo-submit>Upload photo</button><p class="status" id="photo-status"></p></form><div id="photos-list" class="admin-list"></div></section>
</section></main>
<dialog id="unsaved-page-dialog" class="unsaved-dialog">
  <form method="dialog" class="unsaved-dialog-card">
    <h2>Unsaved changes</h2>
    <p>This page has edits that have not been saved. What would you like to do before leaving?</p>
    <div class="unsaved-dialog-actions">
      <button type="submit" value="stay" class="btn outline">Stay</button>
      <button type="submit" value="discard" class="btn outline">Discard</button>
      <button type="submit" value="save" class="btn primary">Save &amp; leave</button>
    </div>
  </form>
</dialog>
<script src="/badge-creator.js?v=${ASSET_VERSION}"></script><script src="/badge-creator-admin.js?v=${ASSET_VERSION}"></script><script src="/admin-caldev.js?v=${ASSET_VERSION}"></script><script src="/admin.js?v=${ASSET_VERSION}"></script></body></html>`;
