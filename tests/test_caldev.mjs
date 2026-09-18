import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compareCaldevEvents,
  caldevEventToHighlight,
  easternTodayIso,
  inferCaldevTrack,
  isoToProductionDateParts,
  listUpcomingCaldevEvents,
  normalizeCaldevPayload,
  normalizeCaldevTrack,
  parseCaldevUpcomingLimit,
  productionEventToCaldevPayload,
  productionEventToStartDate,
  shiftCaldevEventToDate,
  stripSimpleHtml,
} from '../worker/src/caldev.mjs';

test('caldev track normalize and infer from titles', () => {
  assert.equal(normalizeCaldevTrack('GAME'), 'game');
  assert.equal(normalizeCaldevTrack('nope'), 'other');
  assert.equal(inferCaldevTrack('Home Game vs West Forsyth', ''), 'game');
  assert.equal(inferCaldevTrack('Band Camp / Preseason Prep', ''), 'rehearsal');
  assert.equal(inferCaldevTrack('Booster Meeting', ''), 'meeting');
});

test('caldev payload normalization strips html and validates dates', () => {
  const parsed = normalizeCaldevPayload({
    title: '<span>Game Night</span>',
    description: '<p>Away at Parkland</p>',
    who: ' Marching Band ',
    start_date: '2026-10-09',
    end_date: '2026-10-08',
    start_time: '18:30',
    track: 'trip',
    all_day: false,
  });
  assert.equal(parsed.title, 'Game Night');
  assert.equal(parsed.description, 'Away at Parkland');
  assert.equal(parsed.who, 'Marching Band');
  assert.equal(parsed.start_date, '2026-10-09');
  assert.equal(parsed.end_date, '2026-10-09');
  assert.equal(parsed.start_time, '18:30');
  assert.equal(parsed.track, 'trip');
  assert.equal(parsed.all_day, 0);
  assert.equal(stripSimpleHtml('<b>A</b>&nbsp;B'), 'A B');
});

test('production events map into caldev seed payloads', () => {
  assert.equal(productionEventToStartDate({
    date_label: 'Oct',
    date_detail: '09',
    event_year: 2026,
  }), '2026-10-09');
  assert.equal(productionEventToStartDate({
    date_label: 'Oct',
    date_detail: 'TBD',
    event_year: 2026,
  }), '');
  const payload = productionEventToCaldevPayload({
    id: 24,
    title: '<span>Game Night</span>',
    description: '<p>Home Game vs West Forsyth</p>',
    date_label: 'Oct',
    date_detail: '02',
    event_year: 2026,
  });
  assert.equal(payload.title, 'Game Night');
  assert.equal(payload.start_date, '2026-10-02');
  assert.equal(payload.track, 'game');
  assert.equal(payload.source_event_id, 24);
  assert.equal(compareCaldevEvents(
    { start_date: '2026-10-01', title: 'A' },
    { start_date: '2026-10-02', title: 'B' },
  ), -1);
});

test('shiftCaldevEventToDate preserves multi-day span', () => {
  const shifted = shiftCaldevEventToDate({
    start_date: '2026-08-03',
    end_date: '2026-08-05',
    title: 'Spirit week',
  }, '2026-09-10');
  assert.equal(shifted.start_date, '2026-09-10');
  assert.equal(shifted.end_date, '2026-09-12');
});

test('iso dates map to production event date parts for Boosters bridge', () => {
  assert.deepEqual(isoToProductionDateParts('2026-10-09'), {
    event_year: 2026,
    date_label: 'Oct',
    date_detail: '09',
  });
  assert.equal(isoToProductionDateParts('TBD'), null);
});

test('production booster meetings seed as Meetings track', () => {
  const payload = productionEventToCaldevPayload({
    id: 88,
    title: 'October Booster Meeting',
    description: 'Monthly meeting',
    date_label: 'Oct',
    date_detail: '14',
    event_year: 2026,
    show_on_boosters: 1,
  });
  assert.equal(payload.track, 'meeting');
  assert.equal(payload.booster_event_id, 88);
  assert.equal(payload.source_event_id, 88);
});

test('upcoming caldev highlights stay time-bounded and limited', async () => {
  assert.equal(parseCaldevUpcomingLimit('3'), 3);
  assert.equal(parseCaldevUpcomingLimit('99'), 12);
  assert.equal(parseCaldevUpcomingLimit('nope'), 3);
  assert.equal(parseCaldevUpcomingLimit(0), 0);
  const mapped = caldevEventToHighlight({
    id: 7,
    title: 'Home Game vs West Forsyth',
    description: 'Call time 6:00',
    start_date: '2026-09-25',
    start_time: '19:00',
    track: 'game',
    all_day: 0,
  });
  assert.equal(mapped.date_label, 'Sep');
  assert.equal(mapped.date_detail, '25');
  assert.equal(mapped.event_year, 2026);
  assert.equal(mapped.title, 'Home Game vs West Forsyth');
  assert.match(easternTodayIso(new Date('2026-09-18T16:00:00.000Z')), /^\d{4}-\d{2}-\d{2}$/);

  let sql = '';
  let binds = [];
  const env = {
    DB: {
      prepare(text) {
        sql = String(text);
        return {
          bind(...args) {
            binds = args;
            return this;
          },
          async all() {
            return {
              results: [{
                id: 7,
                title: 'Home Game vs West Forsyth',
                description: 'Call time 6:00',
                location: '',
                who: '',
                start_date: '2026-09-25',
                end_date: '',
                start_time: '19:00',
                end_time: '',
                track: 'game',
                all_day: 0,
                source_event_id: null,
                booster_event_id: null,
                created_at: '',
                updated_at: '',
              }],
            };
          },
        };
      },
    },
  };
  const rows = await listUpcomingCaldevEvents(env, { todayIso: '2026-09-18', limit: 3 });
  assert.match(sql, /start_date >= \?/);
  assert.match(sql, /LIMIT \?/);
  assert.doesNotMatch(sql, /SELECT \*/);
  assert.deepEqual(binds, ['2026-09-18', 3]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Home Game vs West Forsyth');
  const none = await listUpcomingCaldevEvents(env, { todayIso: '2026-09-18', limit: 0 });
  assert.deepEqual(none, []);
});
