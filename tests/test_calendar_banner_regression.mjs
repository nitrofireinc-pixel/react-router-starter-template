// Red IMPORTANT banner must not change (plan 2.20). Compares today's code to the
// frozen pre-change caldev.mjs (dc8a801) over every day of 2025-2027 using the
// real dev events, plus the fixed cases from the plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as NEW from '../worker/src/caldev.mjs';
import * as OLD from './fixtures/caldev-banner-baseline.mjs';

const DEV = JSON.parse(readFileSync(new URL('./fixtures/caldev-dev-events-20261024.json', import.meta.url)));
const hydN = DEV.map(NEW.hydrateCaldevRow);
const hydO = DEV.map(OLD.hydrateCaldevRow);
const days = [];
for (let d = '2025-01-01'; d <= '2027-12-31'; d = NEW.shiftIsoDate(d, 1)) days.push(d);

test('snapshot: banner items and HTML identical to pre-change code for every day 2025-2027 (dev data)', () => {
  let shown = 0;
  for (const day of days) {
    const a = OLD.buildDeadlineBannerItems(hydO, day);
    const b = NEW.buildDeadlineBannerItems(hydN, day);
    assert.deepEqual(b, a, day);
    assert.equal(NEW.renderSiteDeadlineBannersHtml(b), OLD.renderSiteDeadlineBannersHtml(a), day);
    shown += a.length;
  }
  assert.ok(shown > 0, 'fixture has banner days');
});

test('dev snapshot on 2026-10-24 is the captured live output', () => {
  const items = NEW.buildDeadlineBannerItems(hydN, '2026-10-24');
  assert.deepEqual(items, [{ text: 'IMPORTANT: Fundraiser/Mattress Sale October 24th, 2026!', href: '/calendar.html', cta: 'View details' }]);
});

const ev = (o) => NEW.hydrateCaldevRow({ id: 1, title: 'Dues', description: '', track: 'deadline', start_date: '2026-11-10', end_date: '', all_day: 1, ...o });
const T = '2026-11-03';
test('due today+7 shows, today+8 does not', () => {
  assert.equal(NEW.buildDeadlineBannerItems([ev({ start_date: NEW.shiftIsoDate(T, 7) })], T).length, 1);
  assert.equal(NEW.buildDeadlineBannerItems([ev({ start_date: NEW.shiftIsoDate(T, 8) })], T).length, 0);
});
test('due today shows, gone next day', () => {
  assert.equal(NEW.buildDeadlineBannerItems([ev({ start_date: T })], T).length, 1);
  assert.equal(NEW.buildDeadlineBannerItems([ev({ start_date: T })], NEW.shiftIsoDate(T, 1)).length, 0);
});
test('end-date fallback', () => {
  assert.equal(NEW.deadlineDueIso(ev({ start_date: '2026-11-01', end_date: '2026-11-05' })), '2026-11-05');
  assert.equal(NEW.deadlineDueIso(ev({ start_date: '2026-11-05', end_date: '2026-11-01' })), '2026-11-05');
  assert.equal(NEW.buildDeadlineBannerItems([ev({ start_date: '2026-10-20', end_date: T })], T).length, 1);
});
test('exact text, link and labels', () => {
  assert.deepEqual(NEW.buildDeadlineBannerItems([ev({ title: 'Dues', start_date: '2026-11-03' })], T),
    [{ text: 'IMPORTANT: Dues November 3rd, 2026!', href: '/calendar.html', cta: 'View details' }]);
  assert.deepEqual(NEW.buildDeadlineBannerItems([ev({ description: 'Pay <a href="https://example.org/pay">here</a>', start_date: '2026-11-03' })], T),
    [{ text: 'IMPORTANT: Dues November 3rd, 2026!', href: 'https://example.org/pay', cta: 'Click Here' }]);
  assert.equal(NEW.renderSiteDeadlineBannersHtml(NEW.buildDeadlineBannerItems([ev({ start_date: T })], T)),
    '<div class="site-deadline-banners" data-site-deadline-banners><div class="caldev-deadline-banner" role="status">IMPORTANT: Dues November 3rd, 2026! <a href="/calendar.html">View details</a></div></div>');
});
test('order by due date', () => {
  const items = NEW.buildDeadlineBannerItems([ev({ id: 1, title: 'B', start_date: '2026-11-06' }), ev({ id: 2, title: 'A', start_date: '2026-11-04' })], T);
  assert.deepEqual(items.map((i) => i.text.split(' ')[1]), ['A', 'B']);
});
test('Eastern midnight boundary', () => {
  // 2026-11-04 03:30Z is still Nov 3 in New York (EST, UTC-5); 05:30Z is Nov 4.
  assert.equal(NEW.easternTodayIso(new Date('2026-11-04T03:30:00Z')), '2026-11-03');
  assert.equal(NEW.easternTodayIso(new Date('2026-11-04T05:30:00Z')), '2026-11-04');
  assert.equal(NEW.easternTodayIso(new Date('2026-07-04T03:59:00Z')), '2026-07-03');
  assert.equal(NEW.easternTodayIso(new Date('2026-07-04T04:00:00Z')), '2026-07-04');
});
test('cancelled event gives no banner', () => {
  assert.equal(NEW.buildDeadlineBannerItems([ev({ start_date: T, cancelled_at: '2026-11-01 10:00:00' })], T).length, 0);
});
test('fundraiser event gives no banner and is kept as its own category', () => {
  assert.equal(NEW.normalizeCaldevTrack('fundraiser'), 'fundraiser');
  assert.equal(NEW.buildDeadlineBannerItems([ev({ track: 'fundraiser', start_date: T })], T).length, 0);
});
test('banner SQL path unchanged: deadline rows only', () => {
  let sql = '';
  NEW.deadlineCaldevStatement({ DB: { prepare: (s) => { sql = s; return {}; } } });
  assert.match(sql, /WHERE track = 'deadline' AND start_date != ''/);
  assert.match(sql, /ORDER BY start_date ASC, start_time ASC, id ASC/);
});
