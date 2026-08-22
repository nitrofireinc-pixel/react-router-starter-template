/** Schedule Board (caldev) — isolated test calendar, separate from production events. */

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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  try {
    await env.DB.prepare("ALTER TABLE caldev_events ADD COLUMN who TEXT NOT NULL DEFAULT ''").run();
  } catch {
    // Column already exists.
  }
}

const CALDEV_SELECT = `
  id, title, description, location, who, start_date, end_date, start_time, end_time,
  track, all_day, source_event_id, created_at, updated_at
`;

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

export async function insertCaldevEvent(env, payload) {
  const p = normalizeCaldevPayload(payload);
  const result = await env.DB.prepare(`
    INSERT INTO caldev_events (
      title, description, location, who, start_date, end_date, start_time, end_time,
      track, all_day, source_event_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  ).run();
  return getCaldevEventById(env, result.meta.last_row_id);
}

export async function updateCaldevEvent(env, id, payload, existing) {
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
  return getCaldevEventById(env, id);
}

export async function deleteCaldevEvent(env, id) {
  await env.DB.prepare('DELETE FROM caldev_events WHERE id = ?').bind(Number(id)).run();
}

export async function clearCaldevEvents(env) {
  await env.DB.prepare('DELETE FROM caldev_events').run();
}

export function productionEventToCaldevPayload(event) {
  const title = stripSimpleHtml(event?.title || 'Untitled');
  const description = stripSimpleHtml(event?.description || '');
  const start_date = productionEventToStartDate(event);
  return {
    title,
    description,
    location: '',
    who: '',
    start_date,
    end_date: '',
    start_time: '',
    end_time: '',
    track: inferCaldevTrack(title, description),
    all_day: 1,
    source_event_id: event?.series_id ?? event?.id ?? null,
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
    await insertCaldevEvent(env, payload);
    inserted += 1;
  }
  return { inserted, source_count: (production || []).length };
}
