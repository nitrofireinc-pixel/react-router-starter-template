import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fillLiveSlots, selectEventCards } from '../worker/src/home-redesign.mjs';
import { LIVE_TEMPLATES, LIVE_SOURCES, tweakOpen, validateLayout } from '../worker/src/studio.mjs';

const ev = (id, start, extra = {}) => ({ id, title: `Event ${id}`, start_date: start, end_date: '', track: 'other', description: '', ...extra });
const events = [
  ev(1, '2026-10-01', { track: 'fundraiser', title: 'Old Sale' }),
  ev(2, '2026-11-14', { track: 'fundraiser', title: 'Dewey Store Fundraiser', end_date: '2026-12-24' }),
  ev(3, '2026-11-20', { track: 'game', title: 'Home Game' }),
  ev(4, '2026-12-07', { title: 'Silent Auction', end_date: '2026-12-08' }),
  ev(5, '2026-12-10', { track: 'fundraiser', title: 'Cancelled Sale', cancelled_at: '2026-10-01' }),
];

test('event cards select upcoming, not cancelled, by category and count', () => {
  const ids = (o) => selectEventCards(events, { today: '2026-10-30', ...o }).map((e) => e.id);
  assert.deepEqual(ids({ category: 'fundraiser', limit: 12 }), [2, 4]);
  assert.deepEqual(ids({ category: 'all', limit: 2 }), [2, 3]);
  assert.deepEqual(ids({ category: 'game', limit: 5 }), [3]);
  assert.equal(selectEventCards(events, { today: '2026-10-30', limit: 99 }).length, 3);
});

test('event-cards live block renders with the fundraising card design, per block settings', () => {
  const block = tweakOpen(LIVE_TEMPLATES['event-cards'], { limit: 1, category: 'all' });
  assert.match(block, /data-category="all"/);
  assert.match(block, /data-limit="1"/);
  const html = fillLiveSlots(`${block}${tweakOpen(LIVE_TEMPLATES['event-cards'], { limit: 5, category: 'fundraiser' })}`, { events, today: '2026-10-30' });
  assert.equal((html.match(/class="feature-fund fundraising-card/g) || []).length, 3);
  assert.match(html, /Dewey Store/);
  assert.match(html, /Silent Auction/);
  assert.doesNotMatch(html, /Cancelled Sale|Old Sale/);
  const empty = fillLiveSlots(tweakOpen(LIVE_TEMPLATES['event-cards'], { category: 'trip' }), { events, today: '2026-10-30' });
  assert.match(empty, /No upcoming events right now/);
});

test('event-cards is an insertable, settings-only live source', () => {
  assert.equal(LIVE_SOURCES['event-cards'].limit, true);
  assert.equal(LIVE_SOURCES['event-cards'].category, true);
  const layout = (props) => ({ version: 1, sections: [{ id: 's1', blocks: [{ id: 'b1', type: 'live', x: 0, y: 0, w: 12, h: 6, props: { source: 'event-cards', html: LIVE_TEMPLATES['event-cards'], ...props } }] }] });
  assert.equal(validateLayout(layout({ category: 'fundraiser', limit: 12 }), { allowHtml: false, baseline: null, draft: true }).ok, true);
  assert.equal(validateLayout(layout({ category: 'bogus' }), { allowHtml: false, baseline: null, draft: true }).ok, false);
  assert.equal(validateLayout(layout({ limit: 13 }), { allowHtml: false, baseline: null, draft: true }).ok, false);
  const js = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');
  assert.match(js, /\['eventcards', '🗓️', 'Event cards', liveMake\('event-cards', 3\)/);
  assert.match(js, /kv\('Category'/);
});
