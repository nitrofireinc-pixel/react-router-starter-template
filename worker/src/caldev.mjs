/** Schedule Board (caldev) — public calendar store. Meetings track syncs to Boosters via events.show_on_boosters. */

export const CALDEV_TRACKS = [
  { id: 'game', label: 'Games', color: '#E71321' },
  { id: 'rehearsal', label: 'Rehearsals', color: '#014990' },
  { id: 'meeting', label: 'Meetings', color: '#002142' },
  { id: 'deadline', label: 'IMPORTANT', color: '#FDD703' },
  { id: 'trip', label: 'Trips', color: '#7c3aed' },
  { id: 'other', label: 'Other', color: '#5b6472' },
  { id: 'fundraiser', label: 'Fundraising', color: '#F2B705' },
];

const TRACK_IDS = new Set(CALDEV_TRACKS.map((t) => t.id));
const MONTH_LABEL_TO_NUM = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const MONTH_INDEX_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function normalizeCaldevTrack(value = '') {
  const track = String(value || '').trim().toLowerCase();
  return TRACK_IDS.has(track) ? track : 'other';
}

export function inferCaldevTrack(title = '', description = '') {
  const text = `${title} ${description}`.toLowerCase();
  if (/\b(game|football|vs\.?|bye week|pep rally)\b/.test(text)) return 'game';
  if (/\b(rehearsal|practice|band camp|sectionals?)\b/.test(text)) return 'rehearsal';
  if (/\b(meeting|booster|orientation|open house)\b/.test(text)) return 'meeting';
  if (/\b(deadline|due|form|payment|dues)\b/.test(text)) return 'deadline';
  if (/\b(trip|competition|travel|away)\b/.test(text)) return 'trip';
  return 'other';
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function isIsoDate(value = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

const EXCLUDED_DATES_MAX = 60;

/** Dates strictly inside a span (after the start, before the end). Endpoints stay covered. */
export function normalizeExcludedDates(value, startDate = '', endDate = '') {
  const start = isIsoDate(startDate) ? String(startDate).trim() : '';
  const end = isIsoDate(endDate) ? String(endDate).trim() : '';
  if (!start || !end || end <= start) return [];
  let list = value;
  if (typeof list === 'string') {
    const trimmed = list.trim();
    if (!trimmed) list = [];
    else {
      try {
        list = JSON.parse(trimmed);
      } catch {
        list = [];
      }
    }
  }
  if (!Array.isArray(list)) list = [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const iso = String(item || '').trim().slice(0, 10);
    if (!isIsoDate(iso) || seen.has(iso)) continue;
    if (iso <= start || iso >= end) continue;
    seen.add(iso);
    out.push(iso);
    if (out.length >= EXCLUDED_DATES_MAX) break;
  }
  out.sort();
  return out;
}

export function caldevEventCoversDate(event, iso) {
  const day = String(iso || '').trim().slice(0, 10);
  if (!isIsoDate(day)) return false;
  const start = String(event?.start_date || '').trim().slice(0, 10);
  if (!isIsoDate(start)) return false;
  const endRaw = String(event?.end_date || '').trim().slice(0, 10);
  const end = isIsoDate(endRaw) && endRaw >= start ? endRaw : start;
  if (day < start || day > end) return false;
  if (end > start && normalizeExcludedDates(event?.excluded_dates, start, end).includes(day)) return false;
  return true;
}

/** Map ISO YYYY-MM-DD → production events date fields. */
export function isoToProductionDateParts(iso) {
  if (!isIsoDate(iso)) return null;
  const [year, month, day] = String(iso).split('-').map(Number);
  if (!MONTH_INDEX_LABELS[month - 1] || day < 1 || day > 31) return null;
  return {
    event_year: year,
    date_label: MONTH_INDEX_LABELS[month - 1],
    date_detail: pad2(day),
  };
}

export function productionEventToStartDate(event) {
  if (event?.occurrence_date && isIsoDate(event.occurrence_date)) {
    return String(event.occurrence_date).trim();
  }
  const year = Number(event?.event_year);
  const month = MONTH_LABEL_TO_NUM[String(event?.date_label || '').trim()];
  const day = Number.parseInt(String(event?.date_detail || '').trim(), 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return '';
  if (!month || !Number.isFinite(day) || day < 1 || day > 31) return '';
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function stripSimpleHtml(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBasicHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function escapeHtmlAttr(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeCaldevLinkUrl(raw = '') {
  const url = decodeBasicHtmlEntities(String(raw || '')).trim();
  if (!url || /[\s<>]/.test(url)) return '';
  if (/^(javascript:|data:|vbscript:)/i.test(url)) return '';
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(url)) return `https://${url}`;
  return '';
}

function extractHtmlAttr(attrs, name) {
  const match = String(attrs || '').match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeBasicHtmlEntities(match?.[1] || match?.[2] || match?.[3] || '').trim();
}

function sanitizeCaldevStyleAttribute(attrs = '') {
  const style = extractHtmlAttr(attrs, 'style');
  if (!style || /expression|url\s*\(|javascript/i.test(style)) return '';
  const parts = [];
  const color = style.match(/color\s*:\s*([^;]+)/i);
  const size = style.match(/font-size\s*:\s*([^;]+)/i);
  if (color && /^(#(?:[0-9a-f]{3}|[0-9a-f]{6})|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-z]+)$/i.test(color[1].trim())) {
    parts.push(`color: ${color[1].trim()}`);
  }
  if (size && /^\d+(\.\d+)?(px|pt|em|rem)$/i.test(size[1].trim())) {
    parts.push(`font-size: ${size[1].trim()}`);
  }
  return parts.join('; ');
}

/** Keep safe description markup (links + basic formatting). Strip everything else. */
/** opts.blocks keeps p/ul/ol/li (News body); opts.keepTarget keeps a link's own target choice; opts.max caps length. */
export function sanitizeCaldevDescriptionHtml(value = '', opts = {}) {
  const { blocks = false, keepTarget = false, max = 4000 } = opts;
  let html = String(value || '');
  if (!html.trim()) return '';
  html = html
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(blocks ? /<(div)(\s[^>]*)?>/gi : /<(p|div)(\s[^>]*)?>/gi, '')
    .replace(blocks ? /<\/(div)>/gi : /<\/(p|div)>/gi, '<br>');
  const allowed = new Set(['a', 'b', 'i', 'u', 'strong', 'em', 'span', 'br', ...(blocks ? ['p', 'ul', 'ol', 'li'] : [])]);
  const openA = []; // true = kept opener; a blocked link's closing tag is dropped with it
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return '';
    if (tag === 'br') return '<br>';
    if (match.startsWith('</')) {
      if (tag === 'a' && !openA.pop()) return '';
      return `</${tag}>`;
    }
    if (tag === 'a') {
      const href = normalizeCaldevLinkUrl(extractHtmlAttr(attrs, 'href'));
      openA.push(Boolean(href));
      if (!href) return '';
      if (keepTarget && !/^_blank$/i.test(extractHtmlAttr(attrs, 'target'))) return `<a href="${escapeHtmlAttr(href)}">`;
      return `<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer">`;
    }
    if (tag === 'span') {
      const style = sanitizeCaldevStyleAttribute(attrs);
      return style ? `<span style="${style}">` : '<span>';
    }
    return `<${tag}>`;
  });
  return html
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/(?:<br>\s*)+$/gi, '')
    .trim()
    .slice(0, max);
}

export function normalizeCaldevPayload(payload = {}, existing = null) {
  const title = stripSimpleHtml(payload.title ?? existing?.title ?? '').slice(0, 200);
  const description = sanitizeCaldevDescriptionHtml(payload.description ?? existing?.description ?? '');
  const location = stripSimpleHtml(payload.location ?? existing?.location ?? '').slice(0, 200);
  const who = stripSimpleHtml(payload.who ?? existing?.who ?? '').slice(0, 200);
  let start_date = String(payload.start_date ?? existing?.start_date ?? '').trim();
  if (start_date && !isIsoDate(start_date)) start_date = '';
  let end_date = String(payload.end_date ?? existing?.end_date ?? '').trim();
  if (end_date && !isIsoDate(end_date)) end_date = '';
  if (start_date && end_date && end_date < start_date) end_date = start_date;
  const start_time = String(payload.start_time ?? existing?.start_time ?? '').trim().slice(0, 8);
  const end_time = String(payload.end_time ?? existing?.end_time ?? '').trim().slice(0, 8);
  const track = normalizeCaldevTrack(payload.track ?? existing?.track ?? 'other');
  const all_day = payload.all_day !== undefined
    ? (payload.all_day === true || payload.all_day === 1 || payload.all_day === '1' ? 1 : 0)
    : (existing?.all_day == null ? 1 : (Number(existing.all_day) ? 1 : 0));
  const source_event_id = payload.source_event_id !== undefined
    ? (payload.source_event_id == null || payload.source_event_id === '' ? null : Number(payload.source_event_id))
    : (existing?.source_event_id == null ? null : Number(existing.source_event_id));
  const excludedSource = Object.prototype.hasOwnProperty.call(payload || {}, 'excluded_dates')
    ? payload.excluded_dates
    : existing?.excluded_dates;
  return {
    title,
    description,
    location,
    who,
    start_date,
    end_date,
    start_time: /^\d{1,2}:\d{2}/.test(start_time) ? start_time.slice(0, 5) : '',
    end_time: /^\d{1,2}:\d{2}/.test(end_time) ? end_time.slice(0, 5) : '',
    track,
    all_day: all_day || (!start_time ? 1 : all_day),
    source_event_id: Number.isFinite(source_event_id) ? source_event_id : null,
    excluded_dates: normalizeExcludedDates(excludedSource, start_date, end_date),
  };
}

/** Move an event to a new start date while preserving multi-day span. */
export function shiftCaldevEventToDate(event, nextStartDate) {
  if (!isIsoDate(nextStartDate)) return null;
  const currentStart = String(event?.start_date || '');
  const currentEnd = String(event?.end_date || '');
  let end_date = '';
  let excluded_dates = [];
  if (currentStart && currentEnd && currentEnd >= currentStart) {
    const startMs = Date.parse(`${currentStart}T00:00:00Z`);
    const endMs = Date.parse(`${currentEnd}T00:00:00Z`);
    const nextMs = Date.parse(`${nextStartDate}T00:00:00Z`);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && Number.isFinite(nextMs)) {
      const spanDays = Math.round((endMs - startMs) / 86400000);
      const shifted = new Date(nextMs + (spanDays * 86400000));
      end_date = `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
      const deltaDays = Math.round((nextMs - startMs) / 86400000);
      excluded_dates = normalizeExcludedDates(event?.excluded_dates, currentStart, currentEnd)
        .map((iso) => shiftIsoDate(iso, deltaDays));
    }
  }
  return {
    ...event,
    start_date: nextStartDate,
    end_date,
    excluded_dates: normalizeExcludedDates(excluded_dates, nextStartDate, end_date),
  };
}

export function hydrateCaldevRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: String(row.title || ''),
    description: String(row.description || ''),
    location: String(row.location || ''),
    who: String(row.who || ''),
    start_date: String(row.start_date || ''),
    end_date: String(row.end_date || ''),
    start_time: String(row.start_time || ''),
    end_time: String(row.end_time || ''),
    track: normalizeCaldevTrack(row.track),
    all_day: Number(row.all_day) ? 1 : 0,
    source_event_id: row.source_event_id == null ? null : Number(row.source_event_id),
    booster_event_id: row.booster_event_id == null ? null : Number(row.booster_event_id),
    series_id: row.series_id == null ? null : Number(row.series_id),
    series_rule: row.series_rule == null ? null : String(row.series_rule),
    cancelled_at: row.cancelled_at == null || row.cancelled_at === '' ? null : String(row.cancelled_at),
    excluded_dates: normalizeExcludedDates(row.excluded_dates, row.start_date, row.end_date),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    deal_text: row.deal_text == null ? '' : String(row.deal_text),
    must_attend: Number(row.must_attend) ? 1 : 0,
  };
}

/** Optional home-card fields; only written when the payload carries them. */
async function saveCaldevCardFields(env, id, payload = {}) {
  if (payload?.deal_text === undefined && payload?.must_attend === undefined) return;
  const deal = stripSimpleHtml(String(payload.deal_text ?? '')).trim().slice(0, 200);
  const must = payload.must_attend === true || payload.must_attend === 1 || payload.must_attend === '1' ? 1 : null;
  await env.DB.prepare('UPDATE caldev_events SET deal_text = ?, must_attend = ? WHERE id = ?')
    .bind(deal || null, must, Number(id)).run();
}

export function compareCaldevEvents(a, b) {
  const ad = String(a?.start_date || '');
  const bd = String(b?.start_date || '');
  if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
  if (ad && !bd) return -1;
  if (!ad && bd) return 1;
  const at = String(a?.start_time || '');
  const bt = String(b?.start_time || '');
  if (at !== bt) return at < bt ? -1 : 1;
  return String(a?.title || '').localeCompare(String(b?.title || ''));
}

/** Banner shows from 7 days before the due date through the due date (Eastern). */
export const DEADLINE_BANNER_LEAD_DAYS = 7;
const DEADLINE_BANNER_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Homepage highlights and Schedule Board rundown use America/New_York calendar days. */
export function easternTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

export const CALDEV_UPCOMING_LIMIT_DEFAULT = 3;
export const CALDEV_UPCOMING_LIMIT_MAX = 12;

export function parseCaldevUpcomingLimit(value, fallback = CALDEV_UPCOMING_LIMIT_DEFAULT) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), CALDEV_UPCOMING_LIMIT_MAX);
}

/** Map a Schedule Board row onto the homepage timeline datebox fields. */
export function caldevEventToHighlight(event) {
  const hydrated = event?.id != null && event?.start_date != null ? event : hydrateCaldevRow(event);
  const parts = isoToProductionDateParts(hydrated?.start_date);
  return {
    id: Number(hydrated?.id) || 0,
    title: String(hydrated?.title || ''),
    description: String(hydrated?.description || ''),
    location: String(hydrated?.location || ''),
    who: String(hydrated?.who || ''),
    start_date: String(hydrated?.start_date || ''),
    end_date: String(hydrated?.end_date || ''),
    start_time: String(hydrated?.start_time || ''),
    end_time: String(hydrated?.end_time || ''),
    track: normalizeCaldevTrack(hydrated?.track),
    all_day: Number(hydrated?.all_day) ? 1 : 0,
    excluded_dates: normalizeExcludedDates(hydrated?.excluded_dates, hydrated?.start_date, hydrated?.end_date),
    date_label: parts?.date_label || '',
    date_detail: parts?.date_detail || '',
    event_year: parts?.event_year ?? null,
  };
}

export function shiftIsoDate(iso, days = 0) {
  if (!isIsoDate(iso)) return '';
  const [year, month, day] = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Last calendar day the deadline is still due — start_date, or end_date when later. */
export function deadlineDueIso(event) {
  const start = String(event?.start_date || '').trim();
  if (!isIsoDate(start)) return '';
  const end = String(event?.end_date || '').trim();
  if (isIsoDate(end) && end >= start) return end;
  return start;
}

export function isDeadlineBannerActive(event, todayIso = '') {
  if (normalizeCaldevTrack(event?.track) !== 'deadline') return false;
  // A cancelled date never shows the red banner.
  if (event?.cancelled_at) return false;
  const due = deadlineDueIso(event);
  if (!due || !isIsoDate(todayIso)) return false;
  const windowStart = shiftIsoDate(due, -DEADLINE_BANNER_LEAD_DAYS);
  return todayIso >= windowStart && todayIso <= due;
}

/**
 * Upcoming deadline banners from already-loaded Schedule Board rows.
 * Read-only: no extra D1 table, column, write, or cron. D1 has no cheap
 * scheduled cleanup, and public GET handlers stay read-only.
 */
export function activeDeadlineBannerEvents(events = [], todayIso = '') {
  return (Array.isArray(events) ? events : [])
    .filter((event) => isDeadlineBannerActive(event, todayIso))
    .sort((a, b) => {
      const dueCmp = deadlineDueIso(a).localeCompare(deadlineDueIso(b));
      if (dueCmp) return dueCmp;
      return compareCaldevEvents(a, b);
    });
}

export function formatDeadlineBannerDate(iso) {
  if (!isIsoDate(iso)) return '';
  const [year, month, day] = String(iso).split('-').map(Number);
  const monthName = DEADLINE_BANNER_MONTHS[month - 1];
  if (!monthName || day < 1 || day > 31) return '';
  const suffix = (day % 100 >= 11 && day % 100 <= 13)
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
  return `${monthName} ${day}${suffix}, ${year}`;
}

export function firstCaldevDescriptionLink(html = '') {
  const match = String(html || '').match(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/i);
  if (!match) return '';
  return normalizeCaldevLinkUrl(match[1] || match[2] || match[3] || '');
}

export function deadlineBannerCopy(event) {
  const due = deadlineDueIso(event);
  const title = stripSimpleHtml(event?.title || '').slice(0, 200) || 'IMPORTANT';
  const dateLabel = formatDeadlineBannerDate(due);
  return {
    title,
    due,
    dateLabel,
    text: dateLabel ? `IMPORTANT: ${title} ${dateLabel}!` : `IMPORTANT: ${title}!`,
    href: firstCaldevDescriptionLink(event?.description || ''),
  };
}

export function buildDeadlineBannerItems(events = [], todayIso = '') {
  const today = isIsoDate(todayIso) ? todayIso : easternTodayIso();
  return activeDeadlineBannerEvents(events, today).map((event) => {
    const copy = deadlineBannerCopy(event);
    const href = copy.href || '/calendar.html';
    return {
      text: copy.text,
      href,
      cta: copy.href ? 'Click Here' : 'View details',
    };
  });
}

export function renderSiteDeadlineBannersHtml(items = []) {
  const banners = (Array.isArray(items) ? items : [])
    .map((item) => {
      const text = String(item?.text || '').trim();
      if (!text) return '';
      const href = normalizeCaldevLinkUrl(item.href) || '/calendar.html';
      const cta = String(item?.cta || 'View details').trim() || 'View details';
      return `<div class="caldev-deadline-banner" role="status">${escapeHtml(text)} <a href="${escapeHtmlAttr(href)}">${escapeHtml(cta)}</a></div>`;
    })
    .filter(Boolean)
    .join('');
  if (!banners) {
    return '<div class="site-deadline-banners" data-site-deadline-banners hidden></div>';
  }
  return `<div class="site-deadline-banners" data-site-deadline-banners>${banners}</div>`;
}

let caldevSchemaReady = false;
let caldevSchemaPromise = null;

/** Test helper — clears the in-isolate caldev schema memo. */
export function resetCaldevSchemaCache() {
  caldevSchemaReady = false;
  caldevSchemaPromise = null;
}

export async function ensureCaldevSchema(env) {
  if (caldevSchemaReady) return;
  if (!caldevSchemaPromise) {
    caldevSchemaPromise = (async () => {
      await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS caldev_events (
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
      booster_event_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
      for (const sql of [
        "ALTER TABLE caldev_events ADD COLUMN who TEXT NOT NULL DEFAULT ''",
        'ALTER TABLE caldev_events ADD COLUMN booster_event_id INTEGER',
        'ALTER TABLE events ADD COLUMN caldev_event_id INTEGER',
        'CREATE INDEX IF NOT EXISTS idx_caldev_events_start_date ON caldev_events (start_date, start_time, id)',
        // Additive (event manager): series link, series rule JSON, cancelled date.
        'ALTER TABLE caldev_events ADD COLUMN series_id INTEGER',
        'ALTER TABLE caldev_events ADD COLUMN series_rule TEXT',
        'ALTER TABLE caldev_events ADD COLUMN cancelled_at TEXT',
        // Additive (home featured card): optional deal text and must-attend flag.
        'ALTER TABLE caldev_events ADD COLUMN deal_text TEXT',
        'ALTER TABLE caldev_events ADD COLUMN must_attend INTEGER',
        "ALTER TABLE caldev_events ADD COLUMN excluded_dates TEXT NOT NULL DEFAULT '[]'",
      ]) {
        try {
          await env.DB.prepare(sql).run();
        } catch {
          // Column already exists.
        }
      }
      caldevSchemaReady = true;
    })()
      .catch((error) => {
        caldevSchemaReady = false;
        throw error;
      })
      .finally(() => {
        caldevSchemaPromise = null;
      });
  }
  await caldevSchemaPromise;
}

const CALDEV_SELECT = `
  id, title, description, location, who, start_date, end_date, start_time, end_time,
  track, all_day, source_event_id, booster_event_id, excluded_dates, created_at, updated_at,
  series_id, series_rule, cancelled_at, deal_text, must_attend
`;

async function setCaldevBoosterEventId(env, caldevId, boosterEventId) {
  await env.DB.prepare(`
    UPDATE caldev_events SET booster_event_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(boosterEventId, Number(caldevId)).run();
}

/**
 * Remove or unlink the Boosters/events row tied to a Schedule Board event.
 * Bridge-owned rows (events.caldev_event_id) are deleted; linked production
 * booster meetings only lose show_on_boosters.
 */
export async function clearCaldevBoosterBridge(env, caldevEvent) {
  const boosterId = Number(caldevEvent?.booster_event_id);
  const caldevId = Number(caldevEvent?.id);
  const candidates = [];
  if (Number.isFinite(boosterId) && boosterId > 0) candidates.push(boosterId);
  if (Number.isFinite(caldevId) && caldevId > 0) {
    try {
      const byCaldev = await env.DB.prepare(
        'SELECT id FROM events WHERE caldev_event_id = ?',
      ).bind(caldevId).first();
      if (byCaldev?.id) candidates.push(Number(byCaldev.id));
    } catch {
      // caldev_event_id column may not exist yet on older DBs mid-migrate.
    }
  }
  const seen = new Set();
  for (const id of candidates) {
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const row = await env.DB.prepare(
      'SELECT id, caldev_event_id, show_on_boosters FROM events WHERE id = ?',
    ).bind(id).first();
    if (!row) continue;
    const owned = Number(row.caldev_event_id) === caldevId;
    if (owned) {
      await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
    } else if (Number(row.show_on_boosters) === 1) {
      await env.DB.prepare(
        'UPDATE events SET show_on_boosters = 0 WHERE id = ?',
      ).bind(id).run();
    }
  }
  if (Number.isFinite(caldevId) && caldevId > 0) {
    await setCaldevBoosterEventId(env, caldevId, null);
  }
}

/**
 * Keep Boosters meetings in sync: Meetings track + date → events.show_on_boosters=1.
 */
export async function syncCaldevMeetingToBoosters(env, caldevEvent) {
  if (!caldevEvent?.id) return caldevEvent;
  const isMeeting = normalizeCaldevTrack(caldevEvent.track) === 'meeting';
  const parts = isoToProductionDateParts(caldevEvent.start_date);
  if (!isMeeting || !parts || caldevEvent.cancelled_at) {
    await clearCaldevBoosterBridge(env, caldevEvent);
    return getCaldevEventById(env, caldevEvent.id);
  }

  const title = String(caldevEvent.title || 'Booster Meeting').slice(0, 200) || 'Booster Meeting';
  const description = String(caldevEvent.description || title).slice(0, 4000) || title;
  let boosterId = Number(caldevEvent.booster_event_id);
  if (!Number.isFinite(boosterId) || boosterId <= 0) {
    boosterId = null;
  }

  if (boosterId) {
    const existing = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(boosterId).first();
    if (!existing) boosterId = null;
  }

  if (!boosterId && caldevEvent.source_event_id) {
    const linked = await env.DB.prepare(
      'SELECT id FROM events WHERE id = ?',
    ).bind(Number(caldevEvent.source_event_id)).first();
    if (linked) boosterId = Number(linked.id);
  }

  if (boosterId) {
    await env.DB.prepare(`
      UPDATE events SET
        date_label = ?, date_detail = ?, event_year = ?, title = ?, description = ?,
        show_on_boosters = 1, repeat_enabled = 0, caldev_event_id = ?
      WHERE id = ?
    `).bind(
      parts.date_label,
      parts.date_detail,
      parts.event_year,
      title,
      description,
      Number(caldevEvent.id),
      boosterId,
    ).run();
  } else {
    const result = await env.DB.prepare(`
      INSERT INTO events (
        date_label, date_detail, event_year, title, description, sort_order,
        show_on_boosters, created_by, repeat_enabled, repeat_days, repeat_months, repeat_exceptions, caldev_event_id
      ) VALUES (?, ?, ?, ?, ?, 0, 1, NULL, 0, '[]', '[]', '[]', ?)
    `).bind(
      parts.date_label,
      parts.date_detail,
      parts.event_year,
      title,
      description,
      Number(caldevEvent.id),
    ).run();
    boosterId = Number(result.meta.last_row_id);
  }

  await setCaldevBoosterEventId(env, caldevEvent.id, boosterId);
  return getCaldevEventById(env, caldevEvent.id);
}

export async function listCaldevEvents(env) {
  const rows = await env.DB.prepare(`
    SELECT ${CALDEV_SELECT}
    FROM caldev_events
    ORDER BY CASE WHEN start_date = '' THEN 1 ELSE 0 END, start_date ASC, start_time ASC, id ASC
  `).all();
  return (rows.results || []).map(hydrateCaldevRow).filter(Boolean);
}

/**
 * Deadline rows for public banners. track is stored lowercase, and empty
 * dates cannot become banners, so the filter matches idx_caldev_events_track_start.
 * Never seeds or migrates.
 */
export function deadlineCaldevStatement(env) {
  return env.DB.prepare(`
    SELECT ${CALDEV_SELECT}
    FROM caldev_events
    WHERE track = 'deadline' AND start_date != ''
    ORDER BY start_date ASC, start_time ASC, id ASC
  `);
}

export function mapCaldevRows(result) {
  return (result?.results || []).map(hydrateCaldevRow).filter(Boolean);
}

export async function listDeadlineCaldevEvents(env) {
  return mapCaldevRows(await deadlineCaldevStatement(env).all());
}

/**
 * Upcoming Schedule Board rows for homepage highlights.
 * Time-bounded (start_date >= Eastern today) and LIMITed so homepage
 * render never loads the full caldev_events corpus into the Worker.
 */
export async function listUpcomingCaldevEvents(env, {
  todayIso = '',
  limit = CALDEV_UPCOMING_LIMIT_DEFAULT,
} = {}) {
  const today = isIsoDate(todayIso) ? todayIso : easternTodayIso();
  const rowLimit = parseCaldevUpcomingLimit(limit, CALDEV_UPCOMING_LIMIT_DEFAULT);
  if (rowLimit <= 0) return [];
  const rows = await env.DB.prepare(`
    SELECT ${CALDEV_SELECT}
    FROM caldev_events
    WHERE start_date != ''
      AND start_date >= ?
      AND cancelled_at IS NULL
    ORDER BY start_date ASC, start_time ASC, id ASC
    LIMIT ?
  `).bind(today, rowLimit).all();
  return (rows.results || []).map(hydrateCaldevRow).filter(Boolean);
}

export function caldevEventsFromDateStatement(env, { todayIso = '', limit = 80 } = {}) {
  const today = isIsoDate(todayIso) ? todayIso : easternTodayIso();
  const rowLimit = Math.min(Math.max(Number(limit) || 80, 1), 120);
  return env.DB.prepare(`
    SELECT ${CALDEV_SELECT}
    FROM caldev_events
    WHERE start_date != ''
      AND (
        start_date >= ?
        OR (end_date != '' AND end_date >= ?)
      )
      AND cancelled_at IS NULL
    ORDER BY start_date ASC, start_time ASC, id ASC
    LIMIT ?
  `).bind(today, today, rowLimit);
}

/** Wider upcoming window for the home redesign. Not capped by the public highlights limit. */
export async function listCaldevEventsFromDate(env, { todayIso = '', limit = 80 } = {}) {
  return mapCaldevRows(await caldevEventsFromDateStatement(env, { todayIso, limit }).all());
}

export async function getCaldevEventById(env, id) {
  const row = await env.DB.prepare(`
    SELECT ${CALDEV_SELECT}
    FROM caldev_events WHERE id = ?
  `).bind(Number(id)).first();
  return hydrateCaldevRow(row);
}

export async function insertCaldevEvent(env, payload, options = {}) {
  const syncBoosters = options.syncBoosters !== false;
  const p = normalizeCaldevPayload(payload);
  const result = await env.DB.prepare(`
    INSERT INTO caldev_events (
      title, description, location, who, start_date, end_date, start_time, end_time,
      track, all_day, source_event_id, booster_event_id, series_id, series_rule, excluded_dates
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    p.title,
    p.description,
    p.location,
    p.who,
    p.start_date,
    p.end_date,
    p.start_time,
    p.end_time,
    p.track,
    p.all_day,
    p.source_event_id,
    payload?.booster_event_id != null && Number.isFinite(Number(payload.booster_event_id))
      ? Number(payload.booster_event_id)
      : null,
    Number.isInteger(Number(payload?.series_id)) && Number(payload.series_id) > 0 ? Number(payload.series_id) : null,
    payload?.series_rule ? String(payload.series_rule).slice(0, 2000) : null,
    JSON.stringify(p.excluded_dates),
  ).run();
  await saveCaldevCardFields(env, result.meta.last_row_id, payload);
  let created = await getCaldevEventById(env, result.meta.last_row_id);
  if (syncBoosters) {
    created = await syncCaldevMeetingToBoosters(env, created);
  }
  return created;
}

export async function updateCaldevEvent(env, id, payload, existing, options = {}) {
  const syncBoosters = options.syncBoosters !== false;
  const p = normalizeCaldevPayload(payload, existing);
  // Cancelling (or "Just this date") detaches the row from its series.
  let cancelledAfter = existing?.cancelled_at || null;
  if (payload?.cancelled === true || payload?.cancelled === 1) cancelledAfter = cancelledAfter || new Date().toISOString();
  if (payload?.cancelled === false || payload?.cancelled === 0) cancelledAfter = null;
  let seriesAfter = existing?.series_id ?? null;
  if (payload?.detach || (cancelledAfter && !existing?.cancelled_at)) seriesAfter = null;
  await env.DB.prepare(`
    UPDATE caldev_events SET
      title = ?, description = ?, location = ?, who = ?, start_date = ?, end_date = ?,
      start_time = ?, end_time = ?, track = ?, all_day = ?, source_event_id = ?,
      series_id = ?, cancelled_at = ?,
      excluded_dates = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    p.title,
    p.description,
    p.location,
    p.who,
    p.start_date,
    p.end_date,
    p.start_time,
    p.end_time,
    p.track,
    p.all_day,
    p.source_event_id,
    seriesAfter,
    cancelledAfter,
    JSON.stringify(p.excluded_dates),
    Number(id),
  ).run();
  await saveCaldevCardFields(env, id, payload);
  let updated = await getCaldevEventById(env, id);
  if (syncBoosters) {
    updated = await syncCaldevMeetingToBoosters(env, updated);
  }
  return updated;
}

export async function deleteCaldevEvent(env, id) {
  const existing = await getCaldevEventById(env, id);
  if (existing) await clearCaldevBoosterBridge(env, existing);
  await env.DB.prepare('DELETE FROM caldev_events WHERE id = ?').bind(Number(id)).run();
}

export async function clearCaldevEvents(env) {
  const rows = await listCaldevEvents(env);
  for (const event of rows) {
    await clearCaldevBoosterBridge(env, event);
  }
  await env.DB.prepare('DELETE FROM caldev_events').run();
}

export function productionEventToCaldevPayload(event) {
  const title = stripSimpleHtml(event?.title || 'Untitled');
  const description = stripSimpleHtml(event?.description || '');
  const start_date = productionEventToStartDate(event);
  const showOnBoosters = Number(event?.show_on_boosters) === 1;
  return {
    title,
    description,
    location: '',
    who: '',
    start_date,
    end_date: '',
    start_time: '',
    end_time: '',
    track: showOnBoosters ? 'meeting' : inferCaldevTrack(title, description),
    all_day: 1,
    source_event_id: event?.series_id ?? event?.id ?? null,
    booster_event_id: showOnBoosters ? (event?.series_id ?? event?.id ?? null) : null,
  };
}

export async function seedCaldevFromProduction(env, { getEvents, expandRecurringEvent, clear = true } = {}) {
  if (typeof getEvents !== 'function') {
    throw new Error('getEvents is required to seed Schedule Board');
  }
  const production = await getEvents(env, { upcomingOnly: false, expandRepeats: true });
  if (clear) await clearCaldevEvents(env);
  let inserted = 0;
  for (const event of production || []) {
    const payload = productionEventToCaldevPayload(event);
    if (!payload.title) continue;
    await insertCaldevEvent(env, payload, { syncBoosters: false });
    inserted += 1;
  }
  return { inserted, source_count: (production || []).length };
}

// Undo of a delete: put the row back with its original id (event manager).
export async function restoreCaldevEvent(env, row, options = {}) {
  const id = Number(row?.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Restore needs the original id');
  const taken = await env.DB.prepare('SELECT id FROM caldev_events WHERE id = ?').bind(id).first();
  if (taken) throw new Error('That event already exists');
  const p = normalizeCaldevPayload(row);
  await env.DB.prepare(`
    INSERT INTO caldev_events (
      id, title, description, location, who, start_date, end_date, start_time, end_time,
      track, all_day, source_event_id, booster_event_id, series_id, series_rule, cancelled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `).bind(id, p.title, p.description, p.location, p.who, p.start_date, p.end_date,
    p.start_time, p.end_time, p.track, p.all_day, p.source_event_id,
    row.series_id == null ? null : Number(row.series_id),
    row.series_rule == null ? null : String(row.series_rule),
    row.cancelled_at || null).run();
  let restored = await getCaldevEventById(env, id);
  if (options.syncBoosters !== false) restored = await syncCaldevMeetingToBoosters(env, restored);
  return restored;
}

export const CALDEV_SELECT_COLUMNS = CALDEV_SELECT;
