/** Fundraiser cards: CMS manager, public approved list, calendar auto-drafts. */

import {
  fundraiserDisplayTitle,
  isHomeFundraiserEvent,
  renderFundraisingCardFromCms,
} from './home-redesign.mjs';
import { renderAdminChromeBar, renderAdminSidebarBackdrop, renderAdminSidebarHtml } from './admin-chrome.mjs';
import { repairSilentAuctionDescription } from './page-blocks.mjs';

export const FUNDRAISER_ALERT_EMAILS_KEY = 'fundraiser_alert_emails';
export const FUNDRAISER_CARD_STATUSES = Object.freeze(['draft', 'approved', 'hidden', 'rejected']);
export const FUNDRAISER_PICTURE_MODES = Object.freeze(['image', 'date_tile']);
export const FUNDRAISER_PRIMARY_BUTTONS = Object.freeze(['view_flyer', 'volunteer', 'details', 'link', 'none']);
export const MATTRESS_FLYER_URL = '/uploads/1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6.jpg';
export const FUNDRAISER_SYNC_EVENT_LIMIT = 80;
export const FUNDRAISER_SYNC_WRITE_CAP = 8;

export const FUNDRAISER_CARDS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS fundraiser_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  picture_mode TEXT NOT NULL DEFAULT 'date_tile',
  image_url TEXT NOT NULL DEFAULT '',
  must_attend INTEGER NOT NULL DEFAULT 0,
  volunteers_needed INTEGER NOT NULL DEFAULT 0,
  custom_label TEXT NOT NULL DEFAULT '',
  primary_button TEXT NOT NULL DEFAULT 'details',
  primary_url TEXT NOT NULL DEFAULT '',
  show_add_to_calendar INTEGER NOT NULL DEFAULT 1,
  auto_hide_after_date INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  source_event_id INTEGER,
  calendar_changed INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by INTEGER,
  approved_at TEXT
)
`.trim();

export const FUNDRAISER_CARDS_SOURCE_ACTIVE_INDEX_SQL =
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_fundraiser_cards_source_active ON fundraiser_cards (source_event_id) WHERE source_event_id IS NOT NULL AND status != 'rejected'";

export const FUNDRAISER_CARDS_SOURCE_DATE_INDEX_SQL =
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_fundraiser_cards_source_date ON fundraiser_cards (source_event_id, event_date) WHERE source_event_id IS NOT NULL';

export const FUNDRAISER_CARDS_LIVE_SEED_SQL = `
INSERT INTO fundraiser_cards (
  title, description, event_date, location, picture_mode, image_url,
  must_attend, volunteers_needed, primary_button, status, sort_order, approved_at
)
SELECT 'Mattress Sale', 'Fundraiser at Mattress Warehouse', '2026-10-24',
       '820 S Main St, Kernersville, NC 27284', 'image',
       '/uploads/1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6.jpg',
       1, 0, 'view_flyer', 'approved', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM fundraiser_cards LIMIT 1)
UNION ALL
SELECT 'Silent Auction', 'Students and parents help needed', '2026-11-07', '', 'date_tile', '',
       0, 1, 'volunteer', 'approved', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM fundraiser_cards LIMIT 1)
`.trim();

export function fundraiserCardSchemaStatements() {
  return [
    FUNDRAISER_CARDS_TABLE_SQL,
    FUNDRAISER_CARDS_SOURCE_ACTIVE_INDEX_SQL,
    FUNDRAISER_CARDS_SOURCE_DATE_INDEX_SQL,
    FUNDRAISER_CARDS_LIVE_SEED_SQL,
  ];
}

const CARD_DIFF_FIELDS = [
  'title', 'description', 'event_date', 'start_time', 'end_time', 'location',
  'picture_mode', 'image_url', 'must_attend', 'volunteers_needed', 'custom_label',
  'primary_button', 'primary_url', 'show_add_to_calendar', 'auto_hide_after_date',
  'status', 'source_event_id', 'calendar_changed', 'sort_order',
];

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

function plainText(value) {
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
    .trim();
}

export function sanitizeFundraiserUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw.slice(0, 500);
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') return url.toString().slice(0, 500);
  } catch {
    // ignore
  }
  return '';
}

export function parseFundraiserAlertEmails(value) {
  return String(value || '')
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

export function canEditFundraiserCards(user, deps = {}) {
  const canEditPageContent = deps.canEditPageContent;
  if (typeof canEditPageContent === 'function') return Boolean(canEditPageContent(user, 'fundraising'));
  return false;
}

export function canPublishFundraiserCards(user, deps = {}) {
  if (typeof deps.isSuperAdmin === 'function' && deps.isSuperAdmin(user)) return true;
  if (typeof deps.hasPermission === 'function' && deps.hasPermission(user, 'pages')) return true;
  if (typeof deps.canEditPageLayout === 'function' && deps.canEditPageLayout(user, 'fundraising')) return true;
  return false;
}

export function isPublicFundraiserCard(card = {}, today = '') {
  if (String(card.status || '') !== 'approved') return false;
  if (!Number(card.auto_hide_after_date)) return true;
  const date = String(card.event_date || '').trim();
  if (!date) return true;
  return !today || date >= today;
}

export function publicFundraiserCardsStatement(env) {
  return env.DB.prepare(`
    SELECT id, title, description, event_date, start_time, end_time, location,
           picture_mode, image_url, must_attend, volunteers_needed, custom_label,
           primary_button, primary_url, show_add_to_calendar, auto_hide_after_date,
           status, source_event_id, calendar_changed, sort_order
    FROM fundraiser_cards
    WHERE status = 'approved'
    ORDER BY sort_order ASC, event_date ASC, id ASC
  `);
}

export function mapFundraiserCardRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id) || 0,
    title: String(row.title || ''),
    description: String(row.description || ''),
    event_date: String(row.event_date || ''),
    start_time: String(row.start_time || ''),
    end_time: String(row.end_time || ''),
    location: String(row.location || ''),
    picture_mode: FUNDRAISER_PICTURE_MODES.includes(row.picture_mode) ? row.picture_mode : 'date_tile',
    image_url: String(row.image_url || ''),
    must_attend: Number(row.must_attend) ? 1 : 0,
    volunteers_needed: Number(row.volunteers_needed) ? 1 : 0,
    custom_label: String(row.custom_label || ''),
    primary_button: FUNDRAISER_PRIMARY_BUTTONS.includes(row.primary_button) ? row.primary_button : 'details',
    primary_url: String(row.primary_url || ''),
    show_add_to_calendar: row.show_add_to_calendar == null ? 1 : (Number(row.show_add_to_calendar) ? 1 : 0),
    auto_hide_after_date: row.auto_hide_after_date == null ? 1 : (Number(row.auto_hide_after_date) ? 1 : 0),
    status: FUNDRAISER_CARD_STATUSES.includes(row.status) ? row.status : 'draft',
    source_event_id: row.source_event_id == null || row.source_event_id === '' ? null : Number(row.source_event_id),
    calendar_changed: Number(row.calendar_changed) ? 1 : 0,
    sort_order: Number(row.sort_order) || 0,
    created_by: row.created_by == null ? null : Number(row.created_by),
    created_at: row.created_at || '',
    updated_by: row.updated_by == null ? null : Number(row.updated_by),
    updated_at: row.updated_at || '',
    approved_by: row.approved_by == null ? null : Number(row.approved_by),
    approved_at: row.approved_at || '',
  };
}

export function fundraiserCardPublicFields(card, today = '') {
  const mapped = mapFundraiserCardRow(card);
  if (!mapped || !isPublicFundraiserCard(mapped, today)) return null;
  return {
    ...mapped,
    image_url: sanitizeFundraiserUrl(mapped.image_url),
    primary_url: sanitizeFundraiserUrl(mapped.primary_url),
  };
}

function flag(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on' ? 1 : 0;
}

function normalizeClock(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function normalizeIsoDate(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

export function normalizeFundraiserCardPayload(payload = {}, existing = null) {
  const base = existing ? mapFundraiserCardRow(existing) : {};
  const pictureMode = FUNDRAISER_PICTURE_MODES.includes(payload.picture_mode)
    ? payload.picture_mode
    : (base.picture_mode || 'date_tile');
  const primaryButton = FUNDRAISER_PRIMARY_BUTTONS.includes(payload.primary_button)
    ? payload.primary_button
    : (base.primary_button || 'details');
  let status = base.status || 'draft';
  if (payload.status && FUNDRAISER_CARD_STATUSES.includes(payload.status) && payload.status !== 'approved' && payload.status !== 'rejected' && payload.status !== 'hidden') {
    status = payload.status;
  }
  const source = payload.source_event_id === undefined
    ? (base.source_event_id ?? null)
    : (payload.source_event_id === null || payload.source_event_id === '' ? null : Number(payload.source_event_id));
  return {
    title: plainText(payload.title ?? base.title).slice(0, 160) || 'Fundraiser',
    description: plainText(payload.description ?? base.description).slice(0, 800),
    event_date: normalizeIsoDate(payload.event_date ?? base.event_date),
    start_time: normalizeClock(payload.start_time ?? base.start_time),
    end_time: normalizeClock(payload.end_time ?? base.end_time),
    location: plainText(payload.location ?? base.location).slice(0, 200),
    picture_mode: pictureMode,
    image_url: sanitizeFundraiserUrl(payload.image_url ?? base.image_url),
    must_attend: flag(payload.must_attend ?? base.must_attend),
    volunteers_needed: flag(payload.volunteers_needed ?? base.volunteers_needed),
    custom_label: plainText(payload.custom_label ?? base.custom_label).slice(0, 40),
    primary_button: primaryButton,
    primary_url: sanitizeFundraiserUrl(payload.primary_url ?? base.primary_url),
    show_add_to_calendar: payload.show_add_to_calendar === undefined && base.show_add_to_calendar == null
      ? 1
      : flag(payload.show_add_to_calendar ?? base.show_add_to_calendar),
    auto_hide_after_date: payload.auto_hide_after_date === undefined && base.auto_hide_after_date == null
      ? 1
      : flag(payload.auto_hide_after_date ?? base.auto_hide_after_date),
    status,
    source_event_id: Number.isFinite(source) ? source : null,
    calendar_changed: existing ? Number(base.calendar_changed) || 0 : 0,
    sort_order: Number(payload.sort_order ?? base.sort_order) || 0,
  };
}

export function fundraiserCardFieldDiff(before, after) {
  const prev = before ? mapFundraiserCardRow(before) : {};
  const next = after ? mapFundraiserCardRow(after) : {};
  const diff = {};
  for (const key of CARD_DIFF_FIELDS) {
    const left = prev[key] ?? '';
    const right = next[key] ?? '';
    if (String(left) !== String(right)) diff[key] = { from: left, to: right };
  }
  return diff;
}

export function addDaysIso(iso, days) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(days)));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isCalendarFundraiserEvent(event = {}) {
  return String(event.track || '').toLowerCase() === 'fundraiser' || isHomeFundraiserEvent(event);
}

function normalizeLocation(value) {
  return plainText(value)
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calendarEventChanged(event = {}, card = {}) {
  const eventDate = String(event.start_date || event.event_date || '');
  const cardDate = String(card.event_date || '');
  if (eventDate && cardDate && eventDate !== cardDate) return true;
  const eventStart = normalizeClock(event.start_time);
  const eventEnd = normalizeClock(event.end_time);
  if (eventStart && eventStart !== normalizeClock(card.start_time)) return true;
  if (eventEnd && eventEnd !== normalizeClock(card.end_time)) return true;
  const eventWhere = normalizeLocation(event.location);
  const cardWhere = normalizeLocation(card.location);
  if (eventWhere && eventWhere !== cardWhere) return true;
  return false;
}

function draftFromEvent(event = {}, sortOrder = 0) {
  return {
    title: fundraiserDisplayTitle(event.title) || 'Fundraiser',
    description: plainText(event.description).slice(0, 800),
    event_date: normalizeIsoDate(event.start_date),
    start_time: normalizeClock(event.start_time),
    end_time: normalizeClock(event.end_time),
    location: plainText(event.location).slice(0, 200),
    picture_mode: 'date_tile',
    image_url: '',
    must_attend: 0,
    volunteers_needed: 0,
    custom_label: '',
    primary_button: 'details',
    primary_url: '',
    show_add_to_calendar: 1,
    auto_hide_after_date: 1,
    status: 'draft',
    source_event_id: event.id == null ? null : Number(event.id),
    calendar_changed: 0,
    sort_order: sortOrder,
  };
}

const LIVE_IMPORTS = [
  {
    title: 'Mattress Sale',
    event_date: '2026-10-24',
    match: /mattress/i,
    picture_mode: 'image',
    image_url: MATTRESS_FLYER_URL,
    must_attend: 1,
    volunteers_needed: 0,
    primary_button: 'view_flyer',
    location: '820 S Main St, Kernersville, NC 27284',
    description: 'Fundraiser at Mattress Warehouse',
  },
  {
    title: 'Silent Auction',
    event_date: '2026-11-07',
    match: /silent auction|\bauction\b/i,
    picture_mode: 'date_tile',
    image_url: '',
    must_attend: 0,
    volunteers_needed: 1,
    primary_button: 'volunteer',
    location: '',
    description: 'Students and parents help needed',
  },
];

export async function importLiveFundraiserCards(env) {
  if (!env?.DB) return { imported: 0, skipped: true };
  let countRow;
  try {
    countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM fundraiser_cards').first();
  } catch {
    return { imported: 0, skipped: true };
  }
  if (Number(countRow?.n) > 0) return { imported: 0, skipped: true };
  let events = [];
  try {
    const result = await env.DB.prepare(
      `SELECT id, title, start_date, start_time, end_time, location, description
       FROM caldev_events
       WHERE start_date IN ('2026-10-24', '2026-11-07')`,
    ).all();
    events = result?.results || [];
  } catch {
    events = [];
  }
  let imported = 0;
  for (const [index, spec] of LIVE_IMPORTS.entries()) {
    const event = events.find((row) => spec.match.test(String(row.title || '')) && String(row.start_date || '') === spec.event_date)
      || events.find((row) => spec.match.test(String(row.title || '')));
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO fundraiser_cards (
        title, description, event_date, start_time, end_time, location,
        picture_mode, image_url, must_attend, volunteers_needed, custom_label,
        primary_button, primary_url, show_add_to_calendar, auto_hide_after_date,
        status, source_event_id, calendar_changed, sort_order,
        created_at, updated_at, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, '', 1, 1, 'approved', ?, 0, ?, ?, ?, ?)
    `).bind(
      spec.title,
      spec.description || plainText(event?.description),
      spec.event_date,
      normalizeClock(event?.start_time),
      normalizeClock(event?.end_time),
      spec.location || plainText(event?.location),
      spec.picture_mode,
      spec.image_url,
      spec.must_attend,
      spec.volunteers_needed,
      spec.primary_button,
      event?.id == null ? null : Number(event.id),
      index,
      now,
      now,
      now,
    ).run();
    imported += 1;
  }
  return { imported, skipped: false };
}

export async function listFundraiserCards(env) {
  await importLiveFundraiserCards(env);
  await repairSilentAuctionDescription(env);
  const result = await env.DB.prepare(`
    SELECT id, title, description, event_date, start_time, end_time, location,
           picture_mode, image_url, must_attend, volunteers_needed, custom_label,
           primary_button, primary_url, show_add_to_calendar, auto_hide_after_date,
           status, source_event_id, calendar_changed, sort_order,
           created_by, created_at, updated_by, updated_at, approved_by, approved_at
    FROM fundraiser_cards
    ORDER BY CASE status WHEN 'rejected' THEN 1 ELSE 0 END, sort_order ASC, event_date ASC, id ASC
  `).all();
  return (result?.results || []).map(mapFundraiserCardRow);
}

export async function getFundraiserCard(env, id) {
  const row = await env.DB.prepare(`
    SELECT id, title, description, event_date, start_time, end_time, location,
           picture_mode, image_url, must_attend, volunteers_needed, custom_label,
           primary_button, primary_url, show_add_to_calendar, auto_hide_after_date,
           status, source_event_id, calendar_changed, sort_order,
           created_by, created_at, updated_by, updated_at, approved_by, approved_at
    FROM fundraiser_cards WHERE id = ?
  `).bind(Number(id)).first();
  return mapFundraiserCardRow(row);
}

async function nextSortOrder(env) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM fundraiser_cards WHERE status != 'rejected'",
  ).first();
  return Number(row?.n) || 0;
}

const INSERT_SQL = `
  INSERT INTO fundraiser_cards (
    title, description, event_date, start_time, end_time, location,
    picture_mode, image_url, must_attend, volunteers_needed, custom_label,
    primary_button, primary_url, show_add_to_calendar, auto_hide_after_date,
    status, source_event_id, calendar_changed, sort_order,
    created_by, updated_by, created_at, updated_at, approved_by, approved_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function bindCardRow(card, { createdBy = null, updatedBy = null, approvedBy = null, approvedAt = null, now = '' } = {}) {
  const stamp = now || new Date().toISOString();
  return [
    card.title,
    card.description,
    card.event_date,
    card.start_time,
    card.end_time,
    card.location,
    card.picture_mode,
    card.image_url,
    card.must_attend,
    card.volunteers_needed,
    card.custom_label,
    card.primary_button,
    card.primary_url,
    card.show_add_to_calendar,
    card.auto_hide_after_date,
    card.status,
    card.source_event_id,
    card.calendar_changed,
    card.sort_order,
    createdBy,
    updatedBy,
    stamp,
    stamp,
    approvedBy,
    approvedAt,
  ];
}

export async function createFundraiserCard(env, payload, { user = null, now = '' } = {}) {
  const card = normalizeFundraiserCardPayload(payload);
  card.status = 'draft';
  card.calendar_changed = 0;
  if (!card.sort_order) card.sort_order = await nextSortOrder(env);
  const result = await env.DB.prepare(INSERT_SQL).bind(...bindCardRow(card, {
    createdBy: user?.id ?? null,
    updatedBy: user?.id ?? null,
    now,
  })).run();
  const id = Number(result?.meta?.last_row_id) || 0;
  return getFundraiserCard(env, id);
}

export async function updateFundraiserCard(env, id, payload, { user = null } = {}) {
  const existing = await getFundraiserCard(env, id);
  if (!existing) {
    const error = new Error('Fundraiser card not found');
    error.status = 404;
    throw error;
  }
  const card = normalizeFundraiserCardPayload(payload, existing);
  card.status = existing.status;
  card.calendar_changed = existing.calendar_changed;
  card.source_event_id = existing.source_event_id;
  await env.DB.prepare(`
    UPDATE fundraiser_cards SET
      title=?, description=?, event_date=?, start_time=?, end_time=?, location=?,
      picture_mode=?, image_url=?, must_attend=?, volunteers_needed=?, custom_label=?,
      primary_button=?, primary_url=?, show_add_to_calendar=?, auto_hide_after_date=?,
      updated_by=?, updated_at=?
    WHERE id=?
  `).bind(
    card.title, card.description, card.event_date, card.start_time, card.end_time, card.location,
    card.picture_mode, card.image_url, card.must_attend, card.volunteers_needed, card.custom_label,
    card.primary_button, card.primary_url, card.show_add_to_calendar, card.auto_hide_after_date,
    user?.id ?? null, new Date().toISOString(), Number(id),
  ).run();
  return getFundraiserCard(env, id);
}

export async function reorderFundraiserCards(env, ids = [], { user = null } = {}) {
  const list = (Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  const existing = await listFundraiserCards(env);
  const active = existing.filter((card) => card.status !== 'rejected');
  if (!list.length || list.length !== active.length || list.some((id) => !active.some((card) => card.id === id))) {
    const error = new Error('Order must include every non-rejected card exactly once');
    error.status = 422;
    throw error;
  }
  const now = new Date().toISOString();
  for (const [index, id] of list.entries()) {
    await env.DB.prepare('UPDATE fundraiser_cards SET sort_order=?, updated_by=?, updated_at=? WHERE id=?')
      .bind(index, user?.id ?? null, now, id)
      .run();
  }
  return listFundraiserCards(env);
}

export async function setFundraiserCardStatus(env, id, status, { user = null } = {}) {
  const existing = await getFundraiserCard(env, id);
  if (!existing) {
    const error = new Error('Fundraiser card not found');
    error.status = 404;
    throw error;
  }
  if (!FUNDRAISER_CARD_STATUSES.includes(status)) {
    const error = new Error('Invalid status');
    error.status = 422;
    throw error;
  }
  if (status === 'draft' && existing.status === 'rejected' && existing.source_event_id != null) {
    const clash = await env.DB.prepare(
      "SELECT id FROM fundraiser_cards WHERE source_event_id = ? AND status != 'rejected' AND id != ? LIMIT 1",
    ).bind(existing.source_event_id, Number(id)).first();
    if (clash) {
      const error = new Error('A draft already exists for this calendar event. Reject or delete that draft before restoring.');
      error.status = 409;
      throw error;
    }
  }
  const now = new Date().toISOString();
  const approvedBy = status === 'approved' ? (user?.id ?? null) : existing.approved_by;
  const approvedAt = status === 'approved' ? now : existing.approved_at;
  await env.DB.prepare(`
    UPDATE fundraiser_cards
    SET status=?, calendar_changed=?, updated_by=?, updated_at=?, approved_by=?, approved_at=?
    WHERE id=?
  `).bind(
    status,
    status === 'approved' ? 0 : existing.calendar_changed,
    user?.id ?? null,
    now,
    approvedBy,
    approvedAt,
    Number(id),
  ).run();
  return getFundraiserCard(env, id);
}

export async function deleteFundraiserCard(env, id) {
  const existing = await getFundraiserCard(env, id);
  if (!existing) {
    const error = new Error('Fundraiser card not found');
    error.status = 404;
    throw error;
  }
  await env.DB.prepare('DELETE FROM fundraiser_cards WHERE id = ?').bind(Number(id)).run();
  return existing;
}

export function fundraiserDraftEmail({ card, origin, reason = '', isDev = false }) {
  const title = card.title || 'Fundraiser';
  const date = card.event_date || 'Date TBA';
  const link = `${String(origin || '').replace(/\/$/, '')}/admin/fundraiser-cards?id=${Number(card.id) || ''}`;
  const subject = `${isDev ? '[DEV] ' : ''}Fundraiser draft needs approval: ${title}`;
  const why = reason ? `\n\n${reason}` : '';
  const text = [
    `${title} is ready as a draft fundraiser card.`,
    `Date: ${date}`,
    card.location ? `Location: ${card.location}` : '',
    `Open the CMS (normal login — this is not a one-click approve link):`,
    link,
    why,
  ].filter(Boolean).join('\n');
  return { subject, text, html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>` };
}

export function fundraiserChangedEmail({ card, origin, event, isDev = false }) {
  const title = card.title || 'Fundraiser';
  const link = `${String(origin || '').replace(/\/$/, '')}/admin/fundraiser-cards?id=${Number(card.id) || ''}`;
  const subject = `${isDev ? '[DEV] ' : ''}Fundraiser calendar changed: ${title}`;
  const text = [
    `The linked calendar event for "${title}" changed date, time, or location.`,
    `The published card was not edited. Review it in the CMS:`,
    link,
    event?.start_date ? `New event date: ${event.start_date}` : '',
  ].filter(Boolean).join('\n');
  return { subject, text, html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>` };
}

async function resolveAlertEmails(env, { isDev = false } = {}) {
  const admin = await env.DB.prepare(
    "SELECT username FROM users WHERE role = 'admin' AND active = 1 ORDER BY id ASC LIMIT 1",
  ).first();
  const fallback = parseFundraiserAlertEmails(admin?.username);
  if (isDev) return fallback.slice(0, 1);
  try {
    const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?')
      .bind(FUNDRAISER_ALERT_EMAILS_KEY)
      .first();
    const listed = parseFundraiserAlertEmails(row?.value);
    if (listed.length) return listed;
  } catch {
    // setting missing
  }
  return fallback;
}

async function insertDraftCard(env, card, { user = null, now = '' } = {}) {
  const result = await env.DB.prepare(INSERT_SQL).bind(...bindCardRow(card, {
    createdBy: user?.id ?? null,
    updatedBy: user?.id ?? null,
    now,
  })).run();
  const id = Number(result?.meta?.last_row_id) || 0;
  return id ? getFundraiserCard(env, id) : { ...card, id };
}

export async function runFundraiserCardCalendarSync(env, options = {}) {
  const {
    sendEmail,
    isDev = false,
    origin = 'https://efhsband.org',
    today = '',
    horizonDays = 60,
    logAudit,
    actor = null,
  } = options;
  const todayIso = today || new Date().toISOString().slice(0, 10);
  const horizon = addDaysIso(todayIso, horizonDays);
  const eventResult = await env.DB.prepare(`
    SELECT id, title, description, location, start_date, end_date, start_time, end_time, track, all_day
    FROM caldev_events
    WHERE start_date != '' AND start_date >= ? AND start_date <= ?
    ORDER BY start_date ASC, start_time ASC, id ASC
    LIMIT ?
  `).bind(todayIso, horizon, FUNDRAISER_SYNC_EVENT_LIMIT).all();
  const events = (eventResult?.results || []).filter(isCalendarFundraiserEvent);
  const cardResult = await env.DB.prepare(`
    SELECT id, title, description, event_date, start_time, end_time, location, status,
           source_event_id, calendar_changed, sort_order
    FROM fundraiser_cards
  `).all();
  const allCards = (cardResult?.results || []).map(mapFundraiserCardRow);
  const bySource = new Map();
  for (const row of allCards) {
    if (!row.source_event_id) continue;
    const list = bySource.get(row.source_event_id) || [];
    list.push(row);
    bySource.set(row.source_event_id, list);
  }
  const matchCard = (event) => allCards.find((card) => (
    card.event_date === String(event.start_date || '')
    && fundraiserDisplayTitle(card.title) === fundraiserDisplayTitle(event.title)
  ));
  const created = [];
  const flagged = [];
  const emails = [];
  let writes = 0;
  let sort = await nextSortOrder(env);

  for (const event of events) {
    let existing = bySource.get(Number(event.id)) || [];
    if (!existing.length) {
      const named = matchCard(event);
      if (named) {
        if (!named.source_event_id && writes < FUNDRAISER_SYNC_WRITE_CAP) {
          await env.DB.prepare('UPDATE fundraiser_cards SET source_event_id = ?, updated_at = ? WHERE id = ?')
            .bind(Number(event.id), new Date().toISOString(), named.id)
            .run();
          writes += 1;
          named.source_event_id = Number(event.id);
        }
        existing = [named];
        bySource.set(Number(event.id), existing);
      }
    }
    const active = existing.filter((card) => card.status !== 'rejected');
    const rejected = existing.filter((card) => card.status === 'rejected');
    if (active.length) {
      const approved = active.find((card) => card.status === 'approved');
      if (approved) {
        const changed = calendarEventChanged(event, approved);
        if (changed && !approved.calendar_changed) {
          if (writes >= FUNDRAISER_SYNC_WRITE_CAP) continue;
          await env.DB.prepare('UPDATE fundraiser_cards SET calendar_changed = 1, updated_at = ? WHERE id = ?')
            .bind(new Date().toISOString(), approved.id)
            .run();
          writes += 1;
          flagged.push(approved.id);
          emails.push({ kind: 'changed', card: { ...approved, calendar_changed: 1 }, event });
        } else if (!changed && approved.calendar_changed) {
          if (writes >= FUNDRAISER_SYNC_WRITE_CAP) continue;
          await env.DB.prepare('UPDATE fundraiser_cards SET calendar_changed = 0, updated_at = ? WHERE id = ?')
            .bind(new Date().toISOString(), approved.id)
            .run();
          writes += 1;
          approved.calendar_changed = 0;
        }
      }
      continue;
    }
    if (rejected.some((card) => card.event_date === String(event.start_date || ''))) {
      continue;
    }
    if (writes >= FUNDRAISER_SYNC_WRITE_CAP) continue;
    const card = draftFromEvent(event, sort);
    sort += 1;
    const saved = await insertDraftCard(env, card, { user: actor });
    writes += 1;
    created.push(saved);
    bySource.set(Number(event.id), [...existing, saved]);
    const prior = rejected[0];
    const reason = prior
      ? `A new draft was created because the calendar event date changed from ${prior.event_date} to ${event.start_date} after this fundraiser was rejected.`
      : '';
    emails.push({ kind: 'draft', card: saved, event, reason });
    if (typeof logAudit === 'function') {
      await logAudit({
        action: 'fundraiser.draft.auto',
        card: saved,
        meta: { source_event_id: event.id, reason: reason || 'new_calendar_event' },
      });
    }
  }

  const recipients = emails.length ? await resolveAlertEmails(env, { isDev }) : [];
  const outbound = [];
  if (typeof sendEmail === 'function' && recipients.length) {
    const toSend = isDev ? emails.slice(0, 1) : emails;
    for (const item of toSend) {
      const payload = item.kind === 'changed'
        ? fundraiserChangedEmail({ card: item.card, origin, event: item.event, isDev })
        : fundraiserDraftEmail({ card: item.card, origin, reason: item.reason, isDev });
      await sendEmail({
        to: recipients,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      outbound.push({ to: recipients, subject: payload.subject, text: payload.text, kind: item.kind });
    }
  }

  return {
    created: created.length,
    flagged: flagged.length,
    emails: outbound.length,
    created_ids: created.map((card) => card.id),
    flagged_ids: flagged,
    outbound,
  };
}

export async function getFundraiserAlertEmails(env) {
  try {
    const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?')
      .bind(FUNDRAISER_ALERT_EMAILS_KEY)
      .first();
    return String(row?.value || '');
  } catch {
    return '';
  }
}

export async function setFundraiserAlertEmails(env, value) {
  const emails = parseFundraiserAlertEmails(value).join(', ');
  await env.DB.prepare(
    'INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).bind(FUNDRAISER_ALERT_EMAILS_KEY, emails).run();
  return emails;
}

export function renderFundraiserCardsAdminHtml(assetVersion = 'dev', options = {}) {
  const v = escapeAttr(assetVersion);
  const canPublish = options.canPublish ? '1' : '0';
  const alertEmails = escapeAttr(options.alertEmails || '');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fundraiser cards | EFHS Band CMS</title>
  <link rel="stylesheet" href="/styles.css?v=${v}">
  <link rel="stylesheet" href="/public-theme.css?v=${v}">
  <link rel="stylesheet" href="/home-redesign.css?v=${v}">
  <link rel="stylesheet" href="/admin-nav.css?v=${v}">
  <link rel="stylesheet" href="/admin-fundraiser-cards.css?v=${v}">
</head>
<body class="admin-body fc-admin-body" data-can-publish="${canPublish}">
<main class="admin-shell cms-shell image-admin-shell">
  ${renderAdminChromeBar()}
  ${renderAdminSidebarBackdrop()}
  ${renderAdminSidebarHtml(v, { user: options.user, allow: options.allow })}
  <section class="admin-workspace">
  <div class="fc-phone-gate" data-fc-phone-gate>
    <div class="fc-phone-gate-card">
      <h1>Please edit fundraiser cards on a computer or tablet.</h1>
      <p>Phones are too small for the editor.</p>
      <div class="fc-phone-gate-actions">
        <a class="btn primary" href="/fundraising.html">View live page</a>
        <a class="btn outline" href="/admin">Back to CMS</a>
      </div>
    </div>
  </div>
  <div class="fc-main">
    <header class="fc-head">
      <div>
        <p class="kicker">Pages · Fundraising</p>
        <h1>Fundraiser cards</h1>
        <p>Drafts stay off the public page until a Super Admin, Pages, or Fundraising layout editor approves them.</p>
      </div>
      <div class="fc-head-actions">
        <button type="button" class="btn outline" data-fc-sync ${options.canPublish ? '' : 'hidden'}>Check calendar now</button>
        <a class="btn outline" href="/fundraising.html">View page</a>
      </div>
    </header>
    <section class="fc-layout">
      <aside class="fc-list-col">
        <div class="fc-list-toolbar">
          <h2>Cards</h2>
          <button type="button" class="btn primary" data-fc-add>+ Add fundraiser</button>
        </div>
        <div class="fc-list" data-fc-list></div>
        <details class="fc-rejected" data-fc-rejected hidden>
          <summary>Rejected</summary>
          <div data-fc-rejected-list></div>
        </details>
        <form class="fc-alert-form" data-fc-alert-form ${options.canPublish ? '' : 'hidden'}>
          <label>Fundraiser alert email(s)
            <input name="alert_emails" type="text" value="${alertEmails}" placeholder="you@efhsband.org">
          </label>
          <button type="submit" class="btn outline">Save alert emails</button>
        </form>
      </aside>
      <section class="fc-editor-col">
        <form class="fc-editor" data-fc-editor hidden>
          <input type="hidden" name="id">
          <div class="fc-editor-head">
            <h2 data-fc-editor-title>Edit fundraiser</h2>
            <p class="fc-status-line" data-fc-status-line></p>
          </div>
          <label>Title <input name="title" required maxlength="160"></label>
          <label>Short description <textarea name="description" rows="3" maxlength="800"></textarea></label>
          <div class="fc-grid-2">
            <label>Date <input name="event_date" type="date"></label>
            <label>Where <input name="location" maxlength="200"></label>
          </div>
          <div class="fc-grid-2">
            <label>Start time <small>optional</small> <input name="start_time" type="time"></label>
            <label>End time <small>optional</small> <input name="end_time" type="time"></label>
          </div>
          <fieldset class="fc-picture">
            <legend>Card picture</legend>
            <label class="fc-radio"><input type="radio" name="picture_mode" value="image"> Flyer / image</label>
            <label class="fc-radio"><input type="radio" name="picture_mode" value="date_tile" checked> Date tile</label>
            <div class="fc-image-actions" data-fc-image-actions hidden>
              <input type="hidden" name="image_url">
              <button type="button" class="btn outline" data-fc-replace>Replace</button>
              <button type="button" class="btn outline" data-fc-gallery>Choose from Gallery</button>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-fc-file hidden>
            </div>
          </fieldset>
          <fieldset class="fc-labels">
            <legend>Labels</legend>
            <label class="fc-check"><input type="checkbox" name="must_attend"> Band members must attend</label>
            <label class="fc-check"><input type="checkbox" name="volunteers_needed"> Volunteers needed</label>
            <label>Custom label <input name="custom_label" maxlength="40" placeholder="Optional"></label>
          </fieldset>
          <div class="fc-grid-2">
            <label>Main button
              <select name="primary_button">
                <option value="view_flyer">View flyer</option>
                <option value="volunteer">Volunteer</option>
                <option value="details">View details</option>
                <option value="link">Custom link</option>
                <option value="none">None</option>
              </select>
            </label>
            <label>Button URL <input name="primary_url" placeholder="https:// or /page.html"></label>
          </div>
          <label class="fc-check"><input type="checkbox" name="show_add_to_calendar" checked> Add to calendar</label>
          <label class="fc-check"><input type="checkbox" name="auto_hide_after_date" checked> Auto-hide after the date</label>
          <div class="fc-editor-actions">
            <button type="submit" class="btn primary">Save</button>
            <button type="button" class="btn outline" data-fc-approve hidden>Approve</button>
            <button type="button" class="btn outline" data-fc-reject hidden>Reject</button>
            <button type="button" class="btn outline" data-fc-hide hidden>Hide</button>
            <button type="button" class="btn outline" data-fc-unhide hidden>Show</button>
            <button type="button" class="btn danger" data-fc-delete hidden>Delete</button>
          </div>
          <p class="fc-editor-note" data-fc-note></p>
        </form>
        <div class="fc-preview-wrap">
          <h2>Live preview</h2>
          <div class="content fundraising-cards fc-preview" data-fc-preview>
            <p class="fc-preview-empty">Select a card or add a fundraiser.</p>
          </div>
        </div>
      </section>
    </section>
    <dialog class="fc-gallery" data-fc-gallery-dialog>
      <form method="dialog">
        <h2>Choose from Gallery</h2>
        <div class="fc-gallery-grid" data-fc-gallery-grid></div>
        <button type="submit" class="btn outline">Close</button>
      </form>
    </dialog>
  </div>
  </section>
</main>
  <script src="/admin-nav.js?v=${v}"></script>
  <script src="/admin-fundraiser-cards.js?v=${v}"></script>
</body>
</html>`;
}

export { renderFundraisingCardFromCms };
