import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { visibleStudioTiles, buildBadgeSql, formatBadges, loadStudioHome, greetingFor, STUDIO_HOME_TILES } from '../worker/src/studio-home.mjs';
import { studioHomePermissions } from '../worker/src/worker.mjs';

const user = (permissions, role = 'editor') => ({ id: 5, username: 'jamie', role, permissions: JSON.stringify(permissions) });

test('Jamie (calendar only) sees Calendar and Minutes only', () => {
  const tiles = visibleStudioTiles(studioHomePermissions(user(['calendar']))).map((t) => t.key);
  assert.deepEqual(tiles, ['calendar', 'minutes']);
});

test('Super Admin sees every tile including Forms; admin tiles are marked', () => {
  const tiles = visibleStudioTiles(studioHomePermissions(user([], 'admin')));
  assert.equal(tiles.length, STUDIO_HOME_TILES.length);
  assert.ok(tiles.find((t) => t.key === 'forms'));
  assert.deepEqual(tiles.filter((t) => t.admin).map((t) => t.key), ['themes', 'users']);
});

test('forms tile follows the Form Builder access list', () => {
  assert.equal(studioHomePermissions(user([]), { formsAccessIds: [] }).forms, false);
  assert.equal(studioHomePermissions(user([]), { formsAccessIds: [5] }).forms, true);
});

test('badge SQL is one statement and only for allowed tiles', () => {
  const sql = buildBadgeSql(['calendar', 'minutes']);
  assert.match(sql, /b_calendar/); assert.match(sql, /b_minutes/);
  assert.doesNotMatch(sql, /sponsors|form_submissions|cms_pages/);
  assert.equal(buildBadgeSql([]), '');
  assert.doesNotMatch(buildBadgeSql(STUDIO_HOME_TILES.map((t) => t.key)), /\b(INSERT|UPDATE|DELETE)\b/i);
});

test('badges format; zero new minutes/sign-ups show no badge', () => {
  const b = formatBadges({ b_pages: 14, b_calendar: 3, b_sponsors: 22, b_fundraisers: 2, b_minutes: 0, b_forms: 1, b_themes: '{"active":true,"style":"blue-regiment"}' },
    ['pages', 'calendar', 'sponsors', 'fundraisers', 'minutes', 'forms', 'themes']);
  assert.deepEqual(b, { pages: '14 pages', calendar: '3 this week', sponsors: '22 active', fundraisers: '2 running', forms: '1 new sign-up', themes: 'Blue Regiment' });
});

test('loadStudioHome uses at most 3 D1 statements and filters drafts by permission', async () => {
  let n = 0;
  const env = { DB: { prepare(sql) { n += 1; return {
    bind() { return this; },
    first: async () => ({ b_pages: 4 }),
    all: async () => ({ results: sql.includes('page_drafts') ? [{ slug: 'home', title: 'Home' }, { slug: 'fundraising', title: 'Fundraising' }] : [{ id: 1, title: 'Rehearsal', start_date: '2026-10-27', start_time: '18:00', all_day: 0 }] }),
  }; } } };
  const out = await loadStudioHome(env, { perms: { pages: true, minutes: true }, canEditSlug: (s) => s === 'home' });
  assert.ok(n <= 3); assert.ok(out.queries <= 6);
  assert.deepEqual(out.drafts.map((d) => d.slug), ['home']);
  assert.equal(out.upcoming[0].time, '18:00');
});

test('greeting by New York time', () => {
  assert.equal(greetingFor(new Date('2026-10-25T00:43:00Z')), 'Good evening');
  assert.equal(greetingFor(new Date('2026-10-24T13:00:00Z')), 'Good morning');
});

test('admin shell loads home assets with admin-only version; public assets untouched', () => {
  const src = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  assert.match(src, /admin-home\.css\?v=\$\{ADMIN_HOME_VERSION\}/);
  assert.match(src, /id="sh-tiles"/);
  assert.match(src, /id="dashboard-cards"/); // All tools kept
});
