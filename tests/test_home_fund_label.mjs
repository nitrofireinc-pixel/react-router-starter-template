import test from 'node:test'; import assert from 'node:assert/strict';
import { fillLiveSlots } from '../worker/src/home-redesign.mjs';
const html = '<div data-home-slot="other-funds" data-home-dynamic><article><div class="fc-top"><span class="pill pill-light">Fundraiser · Nov 7</span></div><h3>X</h3></article></div>';
test('other-funds pill follows calendar', () => {
  const ev = { id: 61, title: 'Fundraiser/Silent Auction', start_date: '2099-11-14', track: 'fundraiser', all_day: 1 };
  const out = fillLiveSlots(html, { events: [ev] });
  assert.match(out, /Fundraiser · Nov 14</); assert.doesNotMatch(out, /Nov 7/);
});
test('pill hidden when no fundraiser', () => {
  const out = fillLiveSlots(html, { events: [] });
  assert.doesNotMatch(out, /fc-top/); assert.match(out, /<h3>X/);
});
