/** Event manager phase 2: repeating series, cancel, overlap check, overlap settings (plan 2.20). */
import {
  CALDEV_SELECT_COLUMNS,
  getCaldevEventById,
  hydrateCaldevRow,
  insertCaldevEvent,
  isIsoDate,
  normalizeCaldevPayload,
  normalizeCaldevTrack,
  pad2,
  syncCaldevMeetingToBoosters,
  clearCaldevBoosterBridge,
} from './caldev.mjs';

export const CONFLICT_MODES = ['evening', 'whole_day', 'skip'];
export const CONFLICT_TRACKS = ['game', 'rehearsal', 'meeting', 'deadline', 'trip', 'other', 'fundraiser'];
export const CONFLICT_DEFAULTS = Object.freeze({
  evening_start: '17:00',
  evening_end: '23:59',
  modes: Object.freeze({
    game: 'evening',
    trip: 'whole_day',
    rehearsal: 'whole_day',
    meeting: 'whole_day',
    fundraiser: 'whole_day',
    other: 'skip',
    deadline: 'skip',
  }),
});
export const CONFLICT_LIST_LIMIT = 5;
export const SERIES_MAX_ROWS = 120;

function clockOk(v) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
}

/** site_content map (key → value) → settings object. Unknown or bad values fall back to defaults. */
export function normalizeConflictSettings(map = {}) {
  const get = (k) => (map instanceof Map ? map.get(k) : map[k]);
  const evening_start = clockOk(get('calendar.evening_start')) ? get('calendar.evening_start') : CONFLICT_DEFAULTS.evening_start;
  let evening_end = clockOk(get('calendar.evening_end')) ? get('calendar.evening_end') : CONFLICT_DEFAULTS.evening_end;
  if (evening_end <= evening_start) evening_end = CONFLICT_DEFAULTS.evening_end;
  const modes = {};
  for (const track of CONFLICT_TRACKS) {
    const v = String(get(`calendar.conflict_mode.${track}`) || '').trim();
    modes[track] = CONFLICT_MODES.includes(v) ? v : CONFLICT_DEFAULTS.modes[track];
  }
  return { evening_start, evening_end, modes };
}

export function conflictSettingsToEntries(settings) {
  const out = {
    'calendar.evening_start': settings.evening_start,
    'calendar.evening_end': settings.evening_end,
  };
  for (const track of CONFLICT_TRACKS) out[`calendar.conflict_mode.${track}`] = settings.modes[track];
  return out;
}

/** Validate an edit from the settings panel. Returns { settings } or { error }. */
export function parseConflictSettingsInput(input = {}, current = normalizeConflictSettings({})) {
  const next = { evening_start: current.evening_start, evening_end: current.evening_end, modes: { ...current.modes } };
  if (input.evening_start !== undefined) {
    if (!clockOk(input.evening_start)) return { error: 'Evening start must be a time like 17:00' };
    next.evening_start = input.evening_start;
  }
  if (input.evening_end !== undefined) {
    if (!clockOk(input.evening_end)) return { error: 'Evening end must be a time like 23:59' };
    next.evening_end = input.evening_end;
  }
  if (next.evening_end <= next.evening_start) return { error: 'Evening end must be after evening start' };
  for (const [track, mode] of Object.entries(input.modes || {})) {
    if (!CONFLICT_TRACKS.includes(track)) return { error: `Unknown category ${track}` };
    if (!CONFLICT_MODES.includes(mode)) return { error: `Unknown mode ${mode}` };
    next.modes[track] = mode;
  }
  return { settings: next };
}

export async function getConflictSettings(env) {
  try {
    const rows = await env.DB.prepare("SELECT key, value FROM site_content WHERE key LIKE 'calendar.%'").all();
    const map = {};
    for (const r of rows?.results || []) map[r.key] = r.value;
    return normalizeConflictSettings(map);
  } catch {
    return normalizeConflictSettings({});
  }
}

function toMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return (h * 60) + m;
}
function endMin(t) {
  return t === '23:59' ? 1440 : toMin(t);
}

export function addDaysIso(iso, days) {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`) + (Number(days) * 86400000));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function eventDays(ev) {
  const start = String(ev?.start_date || '');
  if (!isIsoDate(start)) return [];
  const end = isIsoDate(ev?.end_date) && ev.end_date > start ? ev.end_date : start;
  const out = [];
  for (let d = start; d <= end && out.length < 31; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

/**
 * The minutes an event takes on one of its days, for the overlap check.
 * Timed events use their own times (half-open: end is not included).
 * Untimed events follow their category mode. Returns null when not checked.
 */
export function eventWindow(ev, settings) {
  const track = normalizeCaldevTrack(ev?.track);
  const mode = settings.modes[track] || 'skip';
  if (mode === 'skip') return null;
  const timed = !Number(ev?.all_day) && clockOk(String(ev?.start_time || '').slice(0, 5));
  if (timed) {
    const start = toMin(ev.start_time.slice(0, 5));
    let end = clockOk(String(ev.end_time || '').slice(0, 5)) ? endMin(ev.end_time.slice(0, 5)) : start + 60;
    if (end <= start) end = Math.min(start + 60, 1440);
    return { start, end, kind: 'timed' };
  }
  if (mode === 'evening') {
    return { start: toMin(settings.evening_start), end: endMin(settings.evening_end), kind: 'evening' };
  }
  return { start: 0, end: 1440, kind: 'whole_day' };
}

function brief(ev) {
  return {
    id: ev.id == null ? null : Number(ev.id),
    title: String(ev.title || ''),
    track: normalizeCaldevTrack(ev.track),
    start_date: String(ev.start_date || ''),
    end_date: String(ev.end_date || ''),
    start_time: String(ev.start_time || ''),
    end_time: String(ev.end_time || ''),
    all_day: Number(ev.all_day) ? 1 : 0,
    series_id: ev.series_id == null ? null : Number(ev.series_id),
  };
}

/**
 * Pure overlap check. candidates: rows being added or changed. existing: rows from the range query.
 * Ignores cancelled rows, ids in ignoreIds, and rows in ignoreSeriesId. Never blocks a save.
 */
export function findCaldevConflicts(candidates = [], existing = [], settings = normalizeConflictSettings({}), options = {}) {
  const ignoreIds = new Set((options.ignoreIds || []).map(Number));
  const ignoreSeries = options.ignoreSeriesId == null ? null : Number(options.ignoreSeriesId);
  const byDay = new Map();
  for (const row of existing) {
    if (!row || row.cancelled_at) continue;
    if (ignoreIds.has(Number(row.id))) continue;
    if (ignoreSeries != null && Number(row.series_id) === ignoreSeries) continue;
    const win = eventWindow(row, settings);
    if (!win) continue;
    for (const day of eventDays(row)) {
      const list = byDay.get(day) || [];
      list.push({ row, win });
      byDay.set(day, list);
    }
  }
  const conflicts = [];
  candidates.forEach((cand, index) => {
    if (!cand || cand.cancelled_at) return;
    const win = eventWindow(cand, settings);
    if (!win) return;
    for (const day of eventDays(cand)) {
      for (const { row, win: other } of byDay.get(day) || []) {
        const start = Math.max(win.start, other.start);
        const end = Math.min(win.end, other.end);
        if (start >= end) continue; // half-open: back-to-back is fine
        conflicts.push({
          date: day,
          candidate_index: index,
          adding: { ...brief(cand), window: win },
          existing: { ...brief(row), window: other },
          overlap: { start, end },
        });
      }
    }
  });
  conflicts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.overlap.start - b.overlap.start));
  return conflicts;
}

/** The one range query: start_date BETWEEN from−31 AND to, not cancelled. */
export function conflictRangeStatement(env, fromIso, toIso) {
  return env.DB.prepare(`
    SELECT ${CALDEV_SELECT_COLUMNS}
    FROM caldev_events
    WHERE start_date BETWEEN ? AND ? AND cancelled_at IS NULL
  `).bind(addDaysIso(fromIso, -31), toIso);
}

export async function checkCaldevConflicts(env, candidates, options = {}) {
  const dated = candidates.filter((c) => isIsoDate(c?.start_date));
  if (!dated.length) return [];
  let from = dated[0].start_date;
  let to = from;
  for (const c of dated) {
    const days = eventDays(c);
    if (days[0] < from) from = days[0];
    if (days[days.length - 1] > to) to = days[days.length - 1];
  }
  const settings = options.settings || await getConflictSettings(env);
  const rows = await conflictRangeStatement(env, from, to).all();
  const existing = (rows?.results || []).map(hydrateCaldevRow).filter(Boolean);
  return findCaldevConflicts(candidates, existing, settings, options);
}

/** Response summary: total + first 5 + how many more. */
export function summarizeConflicts(conflicts = []) {
  return {
    count: conflicts.length,
    conflicts: conflicts.slice(0, CONFLICT_LIST_LIMIT),
    all: conflicts,
    more: Math.max(0, conflicts.length - CONFLICT_LIST_LIMIT),
    ids: [...new Set(conflicts.map((c) => c.existing.id))].slice(0, CONFLICT_LIST_LIMIT),
  };
}

// ---------- Series ----------

const WEEKDAY = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Move one date by a weekday difference inside its own week (Sun–Sat). */
export function shiftDateByWeekday(iso, fromDow, toDow) {
  return addDaysIso(iso, Number(toDow) - Number(fromDow));
}

/**
 * Plan a whole-series change: rows from today on. dayShift: {from, to} weekdays (0=Sun) or null.
 * Returns [{ id, old_date, new_date, before, after }].
 */
export function planSeriesChange(rows = [], fields = {}, dayShift = null, todayIso = '') {
  const plan = [];
  for (const row of rows) {
    if (!row || row.cancelled_at) continue;
    if (todayIso && String(row.start_date) < todayIso) continue;
    let start = row.start_date;
    let end = row.end_date || '';
    if (dayShift && WEEKDAY(row.start_date) === Number(dayShift.from)) {
      const delta = Number(dayShift.to) - Number(dayShift.from);
      start = addDaysIso(row.start_date, delta);
      if (end) end = addDaysIso(end, delta);
    }
    const after = normalizeCaldevPayload({ ...fields, start_date: start, end_date: end }, row);
    plan.push({ id: Number(row.id), old_date: row.start_date, new_date: start, before: row, after });
  }
  return plan;
}

export async function seriesRows(env, seriesId) {
  const rows = await env.DB.prepare(`
    SELECT ${CALDEV_SELECT_COLUMNS} FROM caldev_events WHERE series_id = ?
    ORDER BY start_date ASC, id ASC
  `).bind(Number(seriesId)).all();
  return (rows?.results || []).map(hydrateCaldevRow).filter(Boolean);
}

export async function nextSeriesId(env) {
  const row = await env.DB.prepare('SELECT COALESCE(MAX(series_id), 0) + 1 AS n FROM caldev_events').first();
  return Number(row?.n) || 1;
}

export function seriesRuleFromRows(rows = []) {
  const dates = rows.map((r) => r.start_date).filter(isIsoDate).sort();
  const days = [...new Set(dates.map(WEEKDAY))].sort();
  return JSON.stringify({ kind: 'grouped', days, from: dates[0] || '', until: dates[dates.length - 1] || '', count: dates.length });
}

/** Create a closed series in one batch. Boosters sync per meeting row afterwards. */
export async function createCaldevSeries(env, base = {}, dates = [], rule = null) {
  const clean = [...new Set(dates.filter(isIsoDate))].sort().slice(0, SERIES_MAX_ROWS);
  if (!clean.length) throw new Error('Pick at least one date');
  const seriesId = await nextSeriesId(env);
  const spanDays = isIsoDate(base.end_date) && isIsoDate(base.start_date) && base.end_date > base.start_date
    ? Math.round((Date.parse(base.end_date) - Date.parse(base.start_date)) / 86400000) : 0;
  const statements = clean.map((date, i) => {
    const p = normalizeCaldevPayload({ ...base, start_date: date, end_date: spanDays ? addDaysIso(date, spanDays) : '' });
    return env.DB.prepare(`
      INSERT INTO caldev_events (
        title, description, location, who, start_date, end_date, start_time, end_time,
        track, all_day, source_event_id, booster_event_id, series_id, series_rule
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).bind(p.title, p.description, p.location, p.who, p.start_date, p.end_date, p.start_time, p.end_time,
      p.track, p.all_day, seriesId, i === 0 ? String(rule ? JSON.stringify(rule) : seriesRuleFromRows(clean.map((d) => ({ start_date: d })))).slice(0, 2000) : null);
  });
  await env.DB.batch(statements);
  let rows = await seriesRows(env, seriesId);
  if (normalizeCaldevTrack(base.track) === 'meeting') {
    const synced = [];
    for (const row of rows) synced.push(await syncCaldevMeetingToBoosters(env, row));
    rows = synced;
  }
  return { series_id: seriesId, rows };
}

function updateRowStatement(env, id, p, extra = {}) {
  return env.DB.prepare(`
    UPDATE caldev_events SET
      title = ?, description = ?, location = ?, who = ?, start_date = ?, end_date = ?,
      start_time = ?, end_time = ?, track = ?, all_day = ?,
      series_id = ?, series_rule = ?, cancelled_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(p.title, p.description, p.location, p.who, p.start_date, p.end_date, p.start_time, p.end_time,
    p.track, p.all_day, extra.series_id ?? null, extra.series_rule ?? null, extra.cancelled_at ?? null, Number(id));
}

async function resyncBoosters(env, ids, beforeRows = []) {
  const wasMeeting = new Set(beforeRows.filter((r) => r.track === 'meeting' || r.booster_event_id).map((r) => Number(r.id)));
  const out = [];
  for (const id of ids) {
    const row = await getCaldevEventById(env, id);
    if (!row) continue;
    if (row.track === 'meeting' || wasMeeting.has(Number(id))) out.push(await syncCaldevMeetingToBoosters(env, row));
    else out.push(row);
  }
  return out;
}

export async function applySeriesChange(env, plan = []) {
  if (!plan.length) return [];
  await env.DB.batch(plan.map((item) => updateRowStatement(env, item.id, item.after, {
    series_id: item.before.series_id,
    series_rule: item.before.series_rule,
    cancelled_at: null,
  })));
  return resyncBoosters(env, plan.map((p) => p.id), plan.map((p) => p.before));
}

/** Delete rows still in the series from today on. Returns the deleted rows (for Undo). */
export async function deleteSeriesFrom(env, seriesId, todayIso) {
  const rows = (await seriesRows(env, seriesId)).filter((r) => !r.cancelled_at && r.start_date >= todayIso);
  for (const row of rows) if (row.booster_event_id) await clearCaldevBoosterBridge(env, row);
  if (rows.length) {
    await env.DB.batch(rows.map((r) => env.DB.prepare('DELETE FROM caldev_events WHERE id = ?').bind(r.id)));
  }
  return rows;
}

/** Group old separate rows into a new series. Rows already in a series are refused (series are closed). */
export async function groupAsSeries(env, ids = []) {
  const unique = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, SERIES_MAX_ROWS);
  if (unique.length < 2) return { error: 'Pick at least two events to group' };
  const rows = [];
  for (const id of unique) {
    const row = await getCaldevEventById(env, id);
    if (!row) return { error: `Event ${id} no longer exists` };
    if (row.series_id != null) return { error: `"${row.title}" on ${row.start_date} is already in a series` };
    if (row.cancelled_at) return { error: `"${row.title}" on ${row.start_date} is cancelled` };
    rows.push(row);
  }
  rows.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const seriesId = await nextSeriesId(env);
  const rule = seriesRuleFromRows(rows);
  await env.DB.batch(rows.map((r, i) => env.DB.prepare(
    'UPDATE caldev_events SET series_id = ?, series_rule = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).bind(seriesId, i === 0 ? rule : null, r.id)));
  return { series_id: seriesId, before: rows, rows: await seriesRows(env, seriesId) };
}

/** "Find similar": same title, category and time as the picked row; not already in a series or cancelled. */
export function findSimilarRows(all = [], seed) {
  if (!seed) return [];
  const key = (r) => `${String(r.title).trim().toLowerCase()}|${r.track}|${r.start_time}|${r.end_time}`;
  const k = key(seed);
  return all.filter((r) => r && !r.cancelled_at && r.series_id == null && key(r) === k);
}

/**
 * Undo primitive: put rows back exactly (by id), deleting ids that the change created.
 * One batch, one log entry ("Change undone").
 */
export async function putRowsBack(env, rows = [], deleteIds = []) {
  const statements = [];
  const touched = [];
  for (const id of deleteIds.map(Number).filter((n) => n > 0)) {
    const row = await getCaldevEventById(env, id);
    if (row?.booster_event_id) await clearCaldevBoosterBridge(env, row);
    statements.push(env.DB.prepare('DELETE FROM caldev_events WHERE id = ?').bind(id));
  }
  for (const row of rows.slice(0, SERIES_MAX_ROWS)) {
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const p = normalizeCaldevPayload(row);
    const extra = {
      series_id: row.series_id == null ? null : Number(row.series_id),
      series_rule: row.series_rule == null ? null : String(row.series_rule),
      cancelled_at: row.cancelled_at || null,
    };
    const exists = await env.DB.prepare('SELECT id FROM caldev_events WHERE id = ?').bind(id).first();
    if (exists) {
      statements.push(updateRowStatement(env, id, p, extra));
    } else {
      statements.push(env.DB.prepare(`
        INSERT INTO caldev_events (
          id, title, description, location, who, start_date, end_date, start_time, end_time,
          track, all_day, source_event_id, booster_event_id, series_id, series_rule, cancelled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      `).bind(id, p.title, p.description, p.location, p.who, p.start_date, p.end_date, p.start_time, p.end_time,
        p.track, p.all_day, p.source_event_id, extra.series_id, extra.series_rule, extra.cancelled_at));
    }
    touched.push(row);
  }
  if (statements.length) await env.DB.batch(statements);
  return resyncBoosters(env, touched.map((r) => Number(r.id)), touched);
}

export { insertCaldevEvent };
