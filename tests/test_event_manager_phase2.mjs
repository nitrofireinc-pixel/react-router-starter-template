// Event manager phase 2 (plan 2.20): overlap check, settings, series, cancel, log labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  CONFLICT_DEFAULTS, normalizeConflictSettings, parseConflictSettingsInput, conflictSettingsToEntries,
  findCaldevConflicts, checkCaldevConflicts, summarizeConflicts, planSeriesChange, createCaldevSeries,
  applySeriesChange, deleteSeriesFrom, groupAsSeries, putRowsBack, seriesRows, findSimilarRows,
} from '../worker/src/caldev-series.mjs';
import { updateCaldevEvent, getCaldevEventById, listUpcomingCaldevEvents, caldevEventsFromDateStatement, mapCaldevRows } from '../worker/src/caldev.mjs';
import { syncCalendarEventToFundraiserCard } from '../worker/src/fundraiser-cards.mjs';
import { withEventLog, overlapLog } from '../worker/src/worker.mjs';
import { eventLogFromResponse } from '../worker/src/admin-audit-log.mjs';

const S = normalizeConflictSettings({});
let nextId = 1;
const ev = (o) => ({ id: nextId++, title: 'x', track: 'rehearsal', start_date: '2026-11-13', end_date: '', start_time: '', end_time: '', all_day: 1, ...o });
const timed = (start_time, end_time, o = {}) => ev({ all_day: 0, start_time, end_time, ...o });

// Tiny D1 stand-in over node:sqlite, counting queries.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE caldev_events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '', who TEXT NOT NULL DEFAULT '', start_date TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '',
    start_time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '', track TEXT NOT NULL DEFAULT 'other', all_day INTEGER NOT NULL DEFAULT 1,
    source_event_id INTEGER, booster_event_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    series_id INTEGER, series_rule TEXT, cancelled_at TEXT, deal_text TEXT, must_attend INTEGER, excluded_dates TEXT);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, date_label TEXT, date_detail TEXT, event_year INTEGER, title TEXT, description TEXT,
    sort_order INTEGER, show_on_boosters INTEGER, created_by INTEGER, repeat_enabled INTEGER, repeat_days TEXT, repeat_months TEXT, repeat_exceptions TEXT, caldev_event_id INTEGER);
    CREATE TABLE site_content (key TEXT PRIMARY KEY, value TEXT);`);
  const log = [];
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    all: async () => { log.push(sql); return { results: db.prepare(sql).all(...args) }; },
    first: async () => { log.push(sql); return db.prepare(sql).get(...args) ?? null; },
    run: async () => { log.push(sql); const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
  });
  return {
    log, db,
    DB: {
      prepare: (sql) => stmt(sql),
      batch: async (list) => { log.push('BATCH'); db.exec('BEGIN'); try { for (const s of list) db.prepare(s.sql).run(...s.args); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return []; },
    },
  };
}
function insert(env, o) {
  const r = env.db.prepare(`INSERT INTO caldev_events (title, start_date, end_date, start_time, end_time, track, all_day, series_id, cancelled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(o.title || 'x', o.start_date, o.end_date || '', o.start_time || '', o.end_time || '', o.track || 'rehearsal',
    o.all_day ?? 1, o.series_id ?? null, o.cancelled_at ?? null);
  return Number(r.lastInsertRowid);
}

test('back-to-back timed events are not an overlap (half-open ranges)', () => {
  const a = timed('15:00', '17:00');
  const b = timed('17:00', '19:00');
  assert.equal(findCaldevConflicts([b], [a], S).length, 0);
  const c = timed('16:59', '18:00');
  assert.equal(findCaldevConflicts([c], [a], S).length, 1);
});

test('untimed game counts only in the evening window (17:00-23:59 default)', () => {
  const game = ev({ track: 'game', title: 'Game Night' });
  assert.equal(findCaldevConflicts([timed('15:00', '17:00', { track: 'rehearsal' })], [game], S).length, 0);
  const hit = findCaldevConflicts([timed('18:00', '19:00', { track: 'meeting' })], [game], S);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].existing.window.kind, 'evening');
  assert.deepEqual(hit[0].overlap, { start: 1080, end: 1140 });
});

test('untimed trip/rehearsal/meeting/fundraiser block the whole day', () => {
  for (const track of ['trip', 'rehearsal', 'meeting', 'fundraiser']) {
    const all = ev({ track });
    assert.equal(findCaldevConflicts([timed('08:00', '09:00', { track: 'meeting' })], [all], S).length, 1, track);
  }
});

test('IMPORTANT (deadline) and Other never conflict, timed or not', () => {
  for (const track of ['deadline', 'other']) {
    assert.equal(findCaldevConflicts([timed('18:00', '19:00', { track: 'meeting' })], [timed('18:00', '19:00', { track })], S).length, 0);
    assert.equal(findCaldevConflicts([ev({ track })], [ev({ track: 'trip' })], S).length, 0);
  }
});

test('multi-day untimed events apply the rule on each day', () => {
  const trip = ev({ track: 'trip', start_date: '2026-11-13', end_date: '2026-11-15' });
  const hits = findCaldevConflicts([trip], [timed('10:00', '11:00', { start_date: '2026-11-14' }), timed('10:00', '11:00', { start_date: '2026-11-16' })], S);
  assert.deepEqual(hits.map((h) => h.date), ['2026-11-14']);
});

test('cancelled rows, the row being edited and same-series rows are ignored', () => {
  const me = timed('18:00', '19:00', { series_id: 4 });
  const cancelled = timed('18:00', '19:00', { cancelled_at: '2026-10-24T00:00:00Z' });
  const sibling = timed('18:00', '19:00', { series_id: 4 });
  assert.equal(findCaldevConflicts([me], [me, cancelled], S, { ignoreIds: [me.id] }).length, 0);
  assert.equal(findCaldevConflicts([me], [sibling], S, { ignoreSeriesId: 4 }).length, 0);
  assert.equal(findCaldevConflicts([me], [sibling], S).length, 1);
});

test('settings: parsed, validated, applied to the check, and stored as calendar.* keys', () => {
  assert.equal(S.evening_start, CONFLICT_DEFAULTS.evening_start);
  assert.ok(parseConflictSettingsInput({ evening_start: '25:00' }, S).error);
  assert.ok(parseConflictSettingsInput({ evening_start: '20:00', evening_end: '19:00' }, S).error);
  assert.ok(parseConflictSettingsInput({ modes: { game: 'always' } }, S).error);
  const { settings } = parseConflictSettingsInput({ evening_start: '19:00', modes: { other: 'whole_day' } }, S);
  const entries = conflictSettingsToEntries(settings);
  assert.equal(entries['calendar.evening_start'], '19:00');
  assert.equal(entries['calendar.conflict_mode.other'], 'whole_day');
  const roundTrip = normalizeConflictSettings(entries);
  const game = ev({ track: 'game' });
  assert.equal(findCaldevConflicts([timed('18:00', '19:00')], [game], roundTrip).length, 0, 'window moved to 19:00');
  assert.equal(findCaldevConflicts([timed('18:00', '19:00')], [ev({ track: 'other' })], roundTrip).length, 1, 'other now whole day');
});

test('settings change is logged with before and after values', () => {
  const before = conflictSettingsToEntries(S);
  const after = conflictSettingsToEntries(parseConflictSettingsInput({ evening_start: '18:00' }, S).settings);
  const changes = Object.fromEntries(Object.keys(after).filter((k) => before[k] !== after[k]).map((k) => [k, { before: before[k], after: after[k] }]));
  const res = withEventLog(new Response('{}'), { label: 'Overlap settings changed', meta: { changes } });
  const log = eventLogFromResponse('/api/admin/caldev/overlap-settings', res);
  assert.equal(log.label, 'Overlap settings changed');
  assert.deepEqual(log.meta.changes, { 'calendar.evening_start': { before: '17:00', after: '18:00' } });
  assert.equal(eventLogFromResponse('/api/admin/pages/home', res), null, 'only caldev routes use the label');
});

test('warning lists 5 then "and N more"', () => {
  const existing = Array.from({ length: 8 }, (_, i) => timed('18:00', '19:00', { start_date: `2026-11-1${i}` }));
  const cands = existing.map((e) => timed('18:30', '19:30', { start_date: e.start_date }));
  const sum = summarizeConflicts(findCaldevConflicts(cands, existing, S));
  assert.equal(sum.count, 8);
  assert.equal(sum.conflicts.length, 5);
  assert.equal(sum.more, 3);
  assert.equal(sum.ids.length, 5);
});

test('force logs the overlap count and the first 5 ids', () => {
  const existing = Array.from({ length: 7 }, (_, i) => timed('18:00', '19:00', { start_date: `2026-12-0${i + 1}` }));
  const conflicts = findCaldevConflicts(existing.map((e) => timed('18:00', '19:00', { start_date: e.start_date })), existing, S);
  const res = withEventLog(new Response('{}'), overlapLog(conflicts, { id: 9 }));
  const log = eventLogFromResponse('/api/admin/caldev/events', res);
  assert.equal(log.label, 'Saved with 7 overlaps');
  assert.equal(log.meta.conflicts, 7);
  assert.deepEqual(log.meta.conflict_ids, existing.slice(0, 5).map((e) => e.id));
});

test('series check uses ONE range query (from-31 .. to, not cancelled)', async () => {
  const env = fakeD1();
  insert(env, { start_date: '2026-10-20', end_date: '2026-11-05', track: 'trip' }); // long trip starting before range
  insert(env, { start_date: '2026-11-03', start_time: '18:00', end_time: '19:00', all_day: 0 });
  insert(env, { start_date: '2026-11-10', start_time: '18:00', end_time: '19:00', all_day: 0, cancelled_at: 'x' });
  const dates = ['2026-11-03', '2026-11-04', '2026-11-10', '2026-11-17'];
  const before = env.log.length;
  const hits = await checkCaldevConflicts(env, dates.map((d) => ({ title: 'Practice', track: 'rehearsal', start_date: d, start_time: '18:30', end_time: '20:00', all_day: 0 })), { settings: S });
  const queries = env.log.slice(before);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /BETWEEN \? AND \? AND cancelled_at IS NULL/);
  assert.deepEqual(hits.map((h) => h.date), ['2026-11-03', '2026-11-03', '2026-11-04']);
});

test('series: create closed series in one batch, whole-series change from today, delete future, undo put-back', async () => {
  const env = fakeD1();
  const made = await createCaldevSeries(env, { title: 'Band Practice', track: 'rehearsal', start_time: '16:30', end_time: '18:30', all_day: 0 },
    ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'], { kind: 'weekly', days: [2] });
  assert.equal(made.rows.length, 4);
  assert.ok(made.rows.every((r) => r.series_id === made.series_id));
  assert.ok(made.rows[0].series_rule && !made.rows[1].series_rule, 'rule only on the first row');
  const plan = planSeriesChange(made.rows, { start_time: '17:00' }, { from: 2, to: 4 }, '2026-10-24');
  assert.deepEqual(plan.map((p) => [p.old_date, p.new_date]), [['2026-10-27', '2026-10-29'], ['2026-11-03', '2026-11-05'], ['2026-11-10', '2026-11-12']]);
  const n = env.log.filter((x) => x === 'BATCH').length;
  await applySeriesChange(env, plan);
  assert.equal(env.log.filter((x) => x === 'BATCH').length, n + 1, 'one batch');
  const rows = await seriesRows(env, made.series_id);
  assert.equal(rows[0].start_date, '2026-10-20', 'past row untouched');
  assert.equal(rows[1].start_time, '17:00');
  await putRowsBack(env, plan.map((p) => p.before));
  assert.equal((await seriesRows(env, made.series_id))[1].start_date, '2026-10-27', 'undo puts rows back');
  const deleted = await deleteSeriesFrom(env, made.series_id, '2026-10-24');
  assert.equal(deleted.length, 3);
  assert.equal((await seriesRows(env, made.series_id)).length, 1);
  await putRowsBack(env, deleted);
  assert.equal((await seriesRows(env, made.series_id)).length, 4, 'undo delete restores same ids');
});

test('cancel detaches from the series, restore clears it; cancelled rows leave Home lists', async () => {
  const env = fakeD1();
  const id = insert(env, { title: 'Game', start_date: '2026-11-20', series_id: 7, track: 'game' });
  insert(env, { title: 'Other', start_date: '2026-11-21', track: 'game' });
  const before = await getCaldevEventById(env, id);
  const after = await updateCaldevEvent(env, id, { cancelled: true }, before, { syncBoosters: false });
  assert.ok(after.cancelled_at);
  assert.equal(after.series_id, null);
  const home = mapCaldevRows(await caldevEventsFromDateStatement(env, { todayIso: '2026-10-24' }).all());
  assert.deepEqual(home.map((r) => r.title), ['Other']);
  assert.deepEqual((await listUpcomingCaldevEvents(env, { todayIso: '2026-10-24', limit: 10 })).map((r) => r.title), ['Other']);
  const back = await updateCaldevEvent(env, id, { cancelled: false }, after, { syncBoosters: false });
  assert.equal(back.cancelled_at, null);
  const detached = await updateCaldevEvent(env, id, { detach: true }, { ...back, series_id: 7 }, { syncBoosters: false });
  assert.equal(detached.series_id, null);
});

test('group as series: sets one new series id, refuses rows already in a series; find similar', async () => {
  const env = fakeD1();
  const a = insert(env, { title: 'Sectionals', start_date: '2026-11-02', start_time: '15:00', all_day: 0 });
  const b = insert(env, { title: 'Sectionals', start_date: '2026-11-09', start_time: '15:00', all_day: 0 });
  const c = insert(env, { title: 'Sectionals', start_date: '2026-11-16', series_id: 3 });
  const all = [await getCaldevEventById(env, a), await getCaldevEventById(env, b), await getCaldevEventById(env, c)];
  assert.deepEqual(findSimilarRows(all, all[0]).map((r) => r.id), [a, b]);
  assert.ok((await groupAsSeries(env, [a, c])).error);
  const res = await groupAsSeries(env, [a, b]);
  assert.equal(res.rows.length, 2);
  assert.ok(res.series_id > 3);
  await putRowsBack(env, res.before);
  assert.equal((await getCaldevEventById(env, a)).series_id, null, 'undo ungroups');
});

test('fundraiser card sync: one draft per event, updates it, skips cancelled', async () => {
  const env = fakeD1();
  env.db.exec(`CREATE TABLE fundraiser_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, event_date TEXT, start_time TEXT, end_time TEXT,
    location TEXT, picture_mode TEXT, image_url TEXT, must_attend INTEGER, volunteers_needed INTEGER, custom_label TEXT, primary_button TEXT, primary_url TEXT,
    show_add_to_calendar INTEGER, auto_hide_after_date INTEGER, status TEXT, source_event_id INTEGER, calendar_changed INTEGER DEFAULT 0, sort_order INTEGER,
    created_by INTEGER, updated_by INTEGER, created_at TEXT, updated_at TEXT, approved_at TEXT, approved_by INTEGER, rejected_at TEXT, rejected_by INTEGER, reject_reason TEXT)`);
  const event = { id: 50, title: 'Mattress Sale', track: 'fundraiser', start_date: '2026-11-21', start_time: '09:00', end_time: '15:00', location: 'EFHS' };
  assert.equal((await syncCalendarEventToFundraiserCard(env, event)).action, 'created');
  assert.equal((await syncCalendarEventToFundraiserCard(env, event)).action, 'unchanged');
  assert.equal((await syncCalendarEventToFundraiserCard(env, { ...event, start_time: '10:00' })).action, 'updated');
  assert.equal((await syncCalendarEventToFundraiserCard(env, { ...event, id: 51, cancelled_at: 'x' })).action, 'skipped');
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM fundraiser_cards').get().n, 1);
});
