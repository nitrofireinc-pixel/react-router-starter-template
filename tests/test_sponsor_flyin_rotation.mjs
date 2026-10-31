import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ASSET_VERSION, normalizeFlyinWeightValue } from '../worker/src/worker.mjs';

const src = readFileSync(new URL('../site-content.js', import.meta.url), 'utf8');
function fnBlock(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = src.indexOf('\n}\n', start);
  return src.slice(start, end + 3);
}
const rotation = src.slice(src.indexOf('const SPONSOR_FLYIN_CURSOR_KEY'), src.indexOf('function dismissSponsorAd'));
const ctx = vm.createContext({});
vm.runInContext(`${fnBlock('resolveSponsorTierKey')}\n${fnBlock('sponsorShowsFlyin')}\n${rotation}\nthis.api={buildSponsorFlyinRotation,sponsorFlyinTiers,pickRotatingSponsor};`, ctx);
const { buildSponsorFlyinRotation, sponsorFlyinTiers, pickRotatingSponsor } = ctx.api;

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const G = { id: 1, name: 'Nitrofire', level: 'Gold Sponsor', active: 1 };
const S = { id: 2, name: 'Silver Co', level: 'Silver Sponsor', active: 1 };
const B = { id: 3, name: 'Aire Serv', level: 'Bronze Sponsor', active: 1 };
const H = { id: 4, name: 'Dominos', level: 'Honorable Mention', active: 1 };

test('asset version', () => assert.equal(ASSET_VERSION, 'cms-p2-20261031zf'));

test('weights 2:1 give G S G', () => {
  assert.deepEqual([...buildSponsorFlyinRotation([G], [S], { gold: 2, silver: 1 }).map((s) => s.id)], [1, 2, 1]);
});

test('bronze and honorable never fly in; empty tiers get house ads', () => {
  const { gold, silver } = sponsorFlyinTiers([G, B, H], {});
  assert.deepEqual([...gold.map((s) => s.id)], [1]);
  assert.equal(silver.length, 1);
  assert.equal(silver[0].is_house_ad, true);
  assert.equal(silver[0].flyin_href, '/become-a-sponsor.html');
});

test('house ads disabled and removed once a real sponsor exists', () => {
  const off = sponsorFlyinTiers([G], { sponsor_flyin_house_ad: 0 });
  assert.equal(off.silver.length, 0);
  const real = sponsorFlyinTiers([G, S], {});
  assert.ok(!real.silver.some((s) => s.is_house_ad));
});

test('per-visitor cursor advances through rotation', () => {
  const st = store();
  const picks = [0, 1, 2, 3].map(() => pickRotatingSponsor([G, S], {}, st).id);
  assert.deepEqual([...picks], [1, 2, 1, 1]);
});

test('server weight normalization', () => {
  assert.equal(normalizeFlyinWeightValue('', 2), 2);
  assert.equal(normalizeFlyinWeightValue('99', 2), 10);
  assert.equal(normalizeFlyinWeightValue('-3', 1), 0);
  assert.equal(normalizeFlyinWeightValue('x', 1), 1);
});

test('footer carries the independent-nonprofit disclaimer once', async () => {
  const w = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  const line = 'East Forsyth Band Boosters is an independent 501(c)(3) nonprofit organization and is not affiliated with or endorsed by East Forsyth High School or Winston-Salem/Forsyth County Schools.';
  assert.equal(w.split(`<p class="footer-disclaimer">${line}</p></footer>`).length, 2);
});

test('sponsor popup dismissal lasts one visit, legacy flag no longer silences returning browsers', () => {
  const block = src.slice(src.indexOf("const SPONSOR_POPUP_DISMISSED_KEY"), src.indexOf('const SPONSOR_TAP_SHIELD_MS'));
  const mem = new Map();
  const sessionStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let now = 1_000_000_000;
  const c = vm.createContext({ sessionStorage, Date: { now: () => now }, JSON, Number });
  vm.runInContext(`${block}\nthis.api={sponsorPopupDismissedForSession,rememberSponsorPopupDismissed};`, c);
  const { sponsorPopupDismissedForSession: dismissed, rememberSponsorPopupDismissed: remember } = c.api;
  mem.set('efhs-sponsor-popup-dismissed-v1', '1');
  assert.equal(dismissed(), false, 'legacy flag ignored');
  assert.equal(mem.has('efhs-sponsor-popup-dismissed-v1'), false);
  remember();
  now += 10 * 60 * 1000; assert.equal(dismissed(), true, 'same visit stays quiet');
  now += 25 * 60 * 1000; assert.equal(dismissed(), true, 'activity extends the visit');
  now += 31 * 60 * 1000; assert.equal(dismissed(), false, 'new visit shows it again');
});

test('sponsor popup swallows presses and raises a tap shield above the News tab', () => {
  assert.match(src, /root\.addEventListener\(type,[\s\S]{0,400}capture: true/);
  assert.match(src, /raiseSponsorTapShield\(SPONSOR_FLYIN_FADE_MS \+ SPONSOR_TAP_SHIELD_MS\)/);
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.sponsor-flyin\{z-index:2147482000\}/);
  assert.match(css, /\.sponsor-flyin-shield\{position:fixed;inset:0;z-index:2147483000/);
});
