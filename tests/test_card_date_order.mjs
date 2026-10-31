import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { readFileSync } from 'node:fs';
import { easternTodayIso } from '../worker/src/caldev.mjs';
import { selectEventCards, selectHomeSchedule, fillEventCardSlots } from '../worker/src/home-redesign.mjs';
import { isPublicFundraiserCard, sortFundraiserCardsByDate, renderFundraiserCardsAdminHtml } from '../worker/src/fundraiser-cards.mjs';
import { mergePublicPageBlocks } from '../worker/src/page-blocks.mjs';

const ev = (id, start_date, start_time = '', extra = {}) => ({ id, title: `Fundraiser ${id}`, track: 'fundraiser', start_date, start_time, ...extra });

test('9 PM EDT is still the same New York day (UTC is already tomorrow)', () => {
  const nine = new Date('2026-10-31T01:00:00Z'); // Fri Oct 30, 9:00 PM EDT
  assert.equal(easternTodayIso(nine), '2026-10-30');
  mock.timers.enable({ apis: ['Date'], now: nine });
  try {
    const events = [ev(1, '2026-10-30', '18:00'), ev(2, '2026-10-29', '', { end_date: '2026-10-30' }), ev(3, '2026-10-29'), ev(4, '2026-11-02')];
    assert.deepEqual(selectEventCards(events, { limit: 12 }).map((e) => e.id), [2, 1, 4]);
    assert.deepEqual(selectHomeSchedule(events).fundraisers.map((e) => e.id), [2, 1, 4]);
    const html = fillEventCardSlots('<div data-home-slot="event-cards" data-limit="3"></div>', { events });
    assert.match(html, /Fundraiser 1/);
  } finally { mock.timers.reset(); }
});

test('cards drop off the day after their last day', () => {
  const events = [ev(1, '2026-10-30'), ev(2, '2026-10-28', '', { end_date: '2026-10-30' })];
  assert.deepEqual(selectEventCards(events, { today: '2026-10-30' }).map((e) => e.id), [2, 1]);
  assert.deepEqual(selectEventCards(events, { today: '2026-10-31' }), []);
  assert.equal(isPublicFundraiserCard({ status: 'approved', event_date: '2026-10-30', auto_hide_after_date: 0 }, '2026-10-31'), false);
  assert.equal(isPublicFundraiserCard({ status: 'approved', event_date: '2026-10-28', span_end: '2026-10-30', auto_hide_after_date: 0 }, '2026-10-30'), true);
});

test('strict start date then start time order everywhere', () => {
  const events = [ev(1, '2026-11-05', '18:00'), ev(2, '2026-11-01'), ev(3, '2026-11-05', '09:00')];
  assert.deepEqual(selectEventCards(events, { today: '2026-10-01' }).map((e) => e.id), [2, 3, 1]);
  assert.deepEqual(selectHomeSchedule(events, { today: '2026-10-01' }).fundraisers.map((e) => e.id), [2, 3, 1]);
  const cards = [
    { id: 1, status: 'approved', event_date: '2026-11-05', start_time: '18:00', sort_order: 0 },
    { id: 2, status: 'approved', event_date: '2026-11-01', sort_order: 9 },
    { id: 3, status: 'approved', event_date: '2026-11-05', start_time: '09:00', sort_order: 1 },
  ];
  assert.deepEqual(sortFundraiserCardsByDate(cards).map((c) => c.id), [2, 3, 1]);
  const blocks = [
    { kind: 'hero', title: 'Hero' },
    { kind: 'fundraiser', ref_id: 1 },
    { kind: 'fundraiser', ref_id: 3 },
    { kind: 'fundraiser', ref_id: 2 },
  ];
  const merged = mergePublicPageBlocks(blocks, sortFundraiserCardsByDate(cards));
  assert.equal(merged[0].type, 'hero');
  assert.deepEqual(merged.slice(1).map((m) => m.card.id), [2, 3, 1]);
});

test('admin: no auto-hide toggle or drag reorder; calendar event is required', () => {
  const html = renderFundraiserCardsAdminHtml('t', { canPublish: true });
  assert.doesNotMatch(html, /auto_hide_after_date/);
  assert.match(html, /<select name="source_event_id" required/);
  const js = readFileSync(new URL('../admin-fundraiser-cards.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /draggable|\/reorder|auto_hide_after_date/);
  const worker = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\);\n\s*const reads = await loadPublicCmsReads/);
});
