/** Schedule Board (caldev) — public calendar store. Meetings track syncs to Boosters via events.show_on_boosters. */

export const CALDEV_TRACKS = [
  { id: 'game', label: 'Games', color: '#E71321' },
  { id: 'rehearsal', label: 'Rehearsals', color: '#014990' },
  { id: 'meeting', label: 'Meetings', color: '#002142' },
  { id: 'deadline', label: 'Deadlines', color: '#FDD703' },
  { id: 'trip', label: 'Trips', color: '#7c3aed' },
  { id: 'other', label: 'Other', color: '#5b6472' },
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

export function normalizeCaldevPayload(payload = {}, existing = null) {
  const title = stripSimpleHtml(payload.title ?? existing?.title ?? '').slice(0, 200);
  const description = stripSimpleHtml(payload.description ?? existing?.description ?? '').slice(0, 4000);
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
  };
}

/** Move an event to a new start date while preserving multi-day span. */
export function shiftCaldevEventToDate(event, nextStartDate) {
  if (!isIsoDate(nextStartDate)) return null;
  const currentStart = String(event?.start_date || '');
  const currentEnd = String(event?.end_date || '');
  let end_date = '';
  if (currentStart && currentEnd && currentEnd >= currentStart) {
    const startMs = Date.parse(`${currentStart}T00:00:00Z`);
    const endMs = Date.parse(`${currentEnd}T00:00:00Z`);
    const nextMs = Date.parse(`${nextStartDate}T00:00:00Z`);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && Number.isFinite(nextMs)) {
      const spanDays = Math.round((endMs - startMs) / 86400000);
      const shifted = new Date(nextMs + (spanDays * 86400000));
      end_date = `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
    }
  }
  return {
    ...event,
    start_date: nextStartDate,
    end_date,
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
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
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

export async function ensureCaldevSchema(env) {
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
  ]) {
    try {
      await env.DB.prepare(sql).run();
    } catch {
      // Column already exists.
    }
  }
}

const CALDEV_SELECT = `
  id, title, description, location, who, start_date, end_date, start_time, end_time,
  track, all_day, source_event_id, booster_event_id, created_at, updated_at
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
  if (!isMeeting || !parts) {
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
      track, all_day, source_event_id, booster_event_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  ).run();
  let created = await getCaldevEventById(env, result.meta.last_row_id);
  if (syncBoosters) {
    created = await syncCaldevMeetingToBoosters(env, created);
  }
  return created;
}

export async function updateCaldevEvent(env, id, payload, existing, options = {}) {
  const syncBoosters = options.syncBoosters !== false;
  const p = normalizeCaldevPayload(payload, existing);
  await env.DB.prepare(`
    UPDATE caldev_events SET
      title = ?, description = ?, location = ?, who = ?, start_date = ?, end_date = ?,
      start_time = ?, end_time = ?, track = ?, all_day = ?, source_event_id = ?,
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
    Number(id),
  ).run();
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

/** Escape text for iCalendar property values. */
export function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Fold ICS content lines to ≤75 octets (RFC 5545). */
export function foldIcsLine(line) {
  const raw = String(line ?? '');
  if (raw.length <= 75) return raw;
  const parts = [];
  let remaining = raw;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return parts.join('\r\n');
}

function icsDateStamp(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return icsDateStamp(new Date());
  }
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function icsCompactDate(dateStr) {
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}${match[2]}${match[3]}` : '';
}

function icsCompactDateTime(dateStr, timeStr) {
  const day = icsCompactDate(dateStr);
  if (!day) return '';
  const match = String(timeStr || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hh = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, '0');
  const mi = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, '0');
  return `${day}T${hh}${mi}00`;
}

function addDaysYmd(dateStr, days) {
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addHoursHm(timeStr, hours) {
  const match = String(timeStr || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '01:00';
  const total = (Number(match[1]) * 60 + Number(match[2])) + (Number(hours || 0) * 60);
  const wrapped = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const mi = String(wrapped % 60).padStart(2, '0');
  return `${hh}:${mi}`;
}

const AMERICA_NY_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'X-LIC-LOCATION:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/**
 * Build a VCALENDAR feed from Schedule Board (caldev) events for Apple Calendar / iCal.
 */
export function buildCaldevIcsFeed(events = [], options = {}) {
  const calendarName = String(options.calendarName || 'East Forsyth Band').trim() || 'East Forsyth Band';
  const siteUrl = String(options.siteUrl || 'https://efhsband.org').replace(/\/$/, '');
  const now = icsDateStamp(options.now || new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//East Forsyth Band//Schedule Board//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:America/New_York',
    ...AMERICA_NY_VTIMEZONE,
  ];

  for (const event of events || []) {
    const startDate = String(event?.start_date || '').trim();
    const title = String(event?.title || '').trim();
    if (!startDate || !title || !icsCompactDate(startDate)) continue;

    const id = event?.id == null ? `tmp-${startDate}-${title}` : event.id;
    const uid = `caldev-${id}@efhsband.org`;
    const endDate = String(event?.end_date || startDate).trim() || startDate;
    const allDay = Number(event?.all_day) === 1 || !String(event?.start_time || '').trim();
    const descriptionParts = [
      String(event?.description || '').trim(),
      String(event?.who || '').trim() ? `Who: ${String(event.who).trim()}` : '',
    ].filter(Boolean);
    const description = descriptionParts.join('\n');
    const location = String(event?.location || '').trim();
    const updated = event?.updated_at ? icsDateStamp(event.updated_at) : now;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`LAST-MODIFIED:${updated}`);
    lines.push(`SUMMARY:${escapeIcsText(title)}`);
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
    lines.push(`URL:${siteUrl}/calendar.html`);
    lines.push('CATEGORIES:East Forsyth Band');

    if (allDay) {
      const exclusiveEnd = addDaysYmd(endDate, 1) || addDaysYmd(startDate, 1);
      lines.push(`DTSTART;VALUE=DATE:${icsCompactDate(startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${icsCompactDate(exclusiveEnd)}`);
    } else {
      const startTime = String(event.start_time || '').trim();
      const endTime = String(event.end_time || '').trim() || addHoursHm(startTime, 1);
      const dtStart = icsCompactDateTime(startDate, startTime);
      let dtEnd = icsCompactDateTime(endDate, endTime);
      if (!dtEnd || dtEnd < dtStart) {
        dtEnd = icsCompactDateTime(startDate, addHoursHm(startTime, 1));
      }
      lines.push(`DTSTART;TZID=America/New_York:${dtStart}`);
      lines.push(`DTEND;TZID=America/New_York:${dtEnd}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
