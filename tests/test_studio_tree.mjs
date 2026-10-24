import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlToLayout, renderLayout, validateLayout, sameSkeleton, tweakOpen, LIVE_TEMPLATES } from '../worker/src/studio.mjs';
import { fillLiveSlots } from '../worker/src/home-redesign.mjs';

const HTML = '<section class="hero"><div class="wrap"><h1>Hello <em>band</em></h1>\n<a class="btn" href="/join.html">Join</a>\n<div class="next" data-home-slot="next-fund"><p>Loading</p></div></div></section>';
const flat = (l) => { const out = []; const walk = (bs) => bs.forEach((b) => { out.push(b); walk(b.props?.children || []); }); l.sections.forEach((s) => walk(s.blocks)); return out; };

test('locked markup becomes editable elements plus live data blocks, byte-identical', () => {
  const l = htmlToLayout(HTML);
  assert.equal(renderLayout(l), HTML);
  const all = flat(l);
  assert.ok(all.some((b) => b.type === 'el' && b.props.html.startsWith('<h1>')));
  assert.ok(all.some((b) => b.type === 'el' && b.props.html.startsWith('<a class="btn"')));
  const live = all.find((b) => b.type === 'live');
  assert.equal(live.props.source, 'next-fund');
  assert.ok(validateLayout(l, { baseline: l }).ok);
});

test('non-admins can change words and links but not live data or structure', () => {
  const base = htmlToLayout(HTML);
  const edit = structuredClone(base);
  const all = flat(edit);
  all.find((b) => b.props.html?.startsWith('<h1>')).props.html = '<h1>Welcome <em>friends</em></h1>';
  all.find((b) => b.props.html?.startsWith('<a ')).props.html = '<a class="btn" href="/donate.html">Give</a>';
  assert.ok(validateLayout(edit, { baseline: base }).ok);
  const bad = structuredClone(base);
  flat(bad).find((b) => b.type === 'live').props.html = '<div class="next" data-home-slot="next-fund"><p>Fake</p></div>';
  assert.equal(validateLayout(bad, { baseline: base }).ok, false);
  const js = structuredClone(base);
  flat(js).find((b) => b.props.html?.startsWith('<a ')).props.html = '<a class="btn" href="javascript:alert(1)">Join</a>';
  assert.equal(validateLayout(js, { baseline: base }).ok, false);
  assert.equal(sameSkeleton('<h1>a</h1>', '<h1 onclick="x">a</h1>'), false);
});

test('live blocks can be hidden, resized and limited', () => {
  const base = htmlToLayout(HTML);
  const l = structuredClone(base);
  const live = flat(l).find((b) => b.type === 'live');
  live.props.hidden = true;
  assert.ok(validateLayout(l, { baseline: base }).ok);
  assert.ok(!renderLayout(l).includes('data-home-slot'));
  assert.equal(tweakOpen('<div data-home-slot="events">x</div>', { limit: 2, span: 6 }), '<div data-home-slot="events" data-limit="2" style="width:50%;max-width:100%">x</div>');
  assert.equal(tweakOpen('<p>x</p>', {}), '<p>x</p>');
  assert.ok(LIVE_TEMPLATES.events.includes('data-home-slot="events"'));
});

test('fillLiveSlots honours data-limit for events', () => {
  const ev = (n) => ({ title: `Event ${n}`, start_date: `2026-11-0${n}`, starts_at: `2026-11-0${n}T18:00:00`, date: `2026-11-0${n}` });
  const data = { events: [1, 2, 3, 4, 5].map(ev), upcomingEvents: [1, 2, 3, 4, 5].map(ev) };
  const all = fillLiveSlots('<div data-home-slot="events"></div>', data);
  const two = fillLiveSlots('<div data-home-slot="events" data-limit="2"></div>', data);
  const count = (h) => (h.match(/Event \d/g) || []).length;
  assert.ok(count(two) <= 2);
  assert.ok(count(all) >= count(two));
});

test('calendar web app is one locked live block with no inner blocks', () => {
  const H = '<section class="page-title"><div class="wrap"><h1>Calendar</h1><p>Upcoming events</p></div></section>\n<section><div class="wrap"><div id="caldev-app" class="caldev-app"><div class="cal-head"><button>Prev</button></div><div class="cal-grid"></div></div></div></section>';
  const l = htmlToLayout(H);
  assert.equal(renderLayout(l), H);
  const all = flat(l);
  const app = all.filter((b) => b.type === 'live');
  assert.equal(app.length, 1);
  assert.equal(app[0].props.source, 'calendar-app');
  assert.equal((app[0].props.children || []).length, 0);
  assert.ok(all.some((b) => b.type !== 'live' && JSON.stringify(b.props).includes('Upcoming events')));
  const bad = structuredClone(l);
  flat(bad).find((b) => b.type === 'live').props.html = '<div id="caldev-app" class="caldev-app"><p>Hacked</p></div>';
  assert.equal(validateLayout(bad, { baseline: l }).ok, false);
  const hide = structuredClone(l);
  flat(hide).find((b) => b.type === 'live').hidden = true;
  assert.ok(validateLayout(hide, { baseline: l }).ok);
});

test('donate and email-list placeholders are live blocks; round-trip byte-identical', () => {
  const H = '<section><div class="wrap"><h2>Give</h2><div class="visual-locked-slot" data-visual-locked="donate"></div>\n<div data-email-list-signup></div><div class="x" data-visual-locked="email-list"></div></div></section>';
  const l = htmlToLayout(H);
  assert.equal(renderLayout(l), H);
  const src = flat(l).filter((b) => b.type === 'live').map((b) => b.props.source);
  assert.deepEqual(src, ['donate', 'email-list', 'email-list']);
  assert.ok(validateLayout(l, { baseline: l }).ok);
});
