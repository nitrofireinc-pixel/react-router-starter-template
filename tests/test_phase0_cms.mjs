import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  assertSafeUserPrivilegeGrant,
  canAccessScheduleBoard,
  canManagePageSettings,
  canNotifyCalendarSubscribers,
  isPublicCmsPageActive,
  lockPageSettingsToExisting,
  publicCmsPageForRender,
  sanitizeAssignablePermissions,
  sanitizeCmsPageHtml,
  serializePagePayload,
} from '../worker/src/worker.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
const adminSrc = readFileSync(join(root, 'admin.js'), 'utf8');

test('Phase 0.1 sanitizeCmsPageHtml strips XSS and keeps normal page markup', () => {
  const dirty = [
    '<section class="content"><div class="wrap">',
    '<p>Hello <strong>band</strong></p>',
    '<script>alert(1)</script>',
    '<a href="javascript:alert(1)">bad</a>',
    '<img src="/uploads/a.jpg" alt="A" onclick="alert(1)">',
    '<form action="/api/contact"><button type="submit">Send</button></form>',
    '</div></section>',
  ].join('');
  const clean = sanitizeCmsPageHtml(dirty);
  assert.match(clean, /<section class="content">/);
  assert.match(clean, /<strong>band<\/strong>/);
  assert.match(clean, /<form action="\/api\/contact">/);
  assert.match(clean, /<button type="submit">Send<\/button>/);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /javascript:/i);
  assert.doesNotMatch(clean, /onclick/i);
  assert.doesNotMatch(clean, /alert\(1\)/);
});

test('Phase 0.1 serializePagePayload sanitizes non-home page HTML on save', () => {
  const page = serializePagePayload({
    slug: 'resources',
    title: 'Student Resources',
    body_html: '<section><p>Safe</p><script>alert(1)</script><a href="javascript:alert(1)">x</a></section>',
  });
  assert.equal(page.slug, 'resources');
  assert.match(page.body_html, /<section>/);
  assert.match(page.body_html, /<p>Safe<\/p>/);
  assert.doesNotMatch(page.body_html, /<script/i);
  assert.doesNotMatch(page.body_html, /javascript:/i);
});

test('Phase 0.2 page-scoped editors cannot change slug, nav order, or home flag', () => {
  const editor = { role: 'editor', permissions: ['page:resources'] };
  const admin = { role: 'admin', permissions: [] };
  const pagesAdmin = { role: 'editor', permissions: ['pages'] };
  assert.equal(canManagePageSettings(editor), false);
  assert.equal(canManagePageSettings(pagesAdmin), true);
  assert.equal(canManagePageSettings(admin), true);

  const existing = {
    slug: 'resources',
    path: '/resources.html',
    nav_order: 8,
    is_home: 0,
    title: 'Student Resources',
    body_html: '<section><p>Keep</p></section>',
  };
  const attempted = serializePagePayload({
    slug: 'hacked',
    path: '/hacked.html',
    nav_order: 1,
    is_home: 1,
    title: 'Student Resources',
    body_html: '<section><p>Edited</p></section>',
  }, existing);
  const locked = lockPageSettingsToExisting(attempted, existing);
  assert.equal(locked.slug, 'resources');
  assert.equal(locked.path, '/resources.html');
  assert.equal(locked.nav_order, 8);
  assert.equal(locked.is_home, 0);
  assert.match(locked.body_html, /Edited/);
  assert.match(workerSrc, /if \(!canManagePageSettings\(auth\.user\)\)/);
  assert.match(workerSrc, /page = lockPageSettingsToExisting\(page, existing\)/);
});

test('Phase 0.3 users permission cannot grant all or Super Admin', () => {
  const usersEditor = { role: 'editor', permissions: ['users'] };
  const superAdmin = { role: 'admin', permissions: [] };

  assert.equal(assertSafeUserPrivilegeGrant(usersEditor, { role: 'admin' }).ok, false);
  assert.equal(assertSafeUserPrivilegeGrant(usersEditor, { role: 'editor', permissions: ['all'] }).ok, false);
  assert.equal(assertSafeUserPrivilegeGrant(usersEditor, { role: 'editor', permissions: ['events'] }).ok, true);
  assert.equal(assertSafeUserPrivilegeGrant(superAdmin, { role: 'admin', permissions: ['all'] }).ok, true);

  assert.deepEqual(sanitizeAssignablePermissions(usersEditor, ['events', 'all', 'page:home']), ['events', 'page:home']);
  assert.deepEqual(sanitizeAssignablePermissions(superAdmin, ['all', 'events']), ['all', 'events']);
  assert.match(workerSrc, /assertSafeUserPrivilegeGrant\(auth\.user, payload\)/);
  assert.match(workerSrc, /sanitizeAssignablePermissions\(auth\.user, payload\.permissions\)/);
});

test('Phase 0.4 inactive CMS pages render Coming Soon instead of their body', () => {
  const inactive = {
    slug: 'resources',
    path: '/resources.html',
    title: 'Student Resources',
    active: 0,
    body_html: '<section><p>Secret handbook text</p></section>',
  };
  assert.equal(isPublicCmsPageActive(inactive), false);
  assert.equal(isPublicCmsPageActive({ ...inactive, active: 1 }), true);
  const publicPage = publicCmsPageForRender(inactive);
  assert.match(publicPage.body_html, /Coming soon/i);
  assert.match(publicPage.body_html, /Student Resources/);
  assert.doesNotMatch(publicPage.body_html, /Secret handbook text/);
  assert.equal(publicCmsPageForRender({ ...inactive, active: 1 }).body_html, inactive.body_html);
  assert.match(workerSrc, /const livePage = publicCmsPageForRender\(page\)/);
});

test('Phase 0.5 migrateAndSeedDb never overwrites an existing cms_pages body', () => {
  const migrate = workerSrc.match(/async function migrateAndSeedDb\(env\) \{[\s\S]*?\nexport function isMaintenanceMode/);
  assert.ok(migrate, 'migrateAndSeedDb source not found');
  assert.doesNotMatch(migrate[0], /UPDATE cms_pages SET body_html/);
  assert.match(migrate[0], /Never rewrite an existing cms_pages\.body_html/);
  assert.match(workerSrc, /WHERE id = \? AND \(body_html IS NULL OR trim\(body_html\) = ''\)/);
});

test('Phase 0.6 calendar or events permission opens Schedule Board, not the legacy events tab', () => {
  const calendarEditor = { role: 'editor', permissions: ['events'] };
  const calendarAlias = { role: 'editor', permissions: ['calendar'] };
  const treasurer = { role: 'editor', permissions: ['treasurer'] };
  assert.equal(canAccessScheduleBoard(calendarEditor), true);
  assert.equal(canAccessScheduleBoard(calendarAlias), true);
  assert.equal(canAccessScheduleBoard(treasurer), false);
  assert.equal(canNotifyCalendarSubscribers(calendarEditor), false);
  assert.equal(canNotifyCalendarSubscribers({ role: 'admin' }), true);
  assert.equal(canNotifyCalendarSubscribers({ role: 'editor', permissions: ['president'] }), true);

  assert.match(adminSrc, /function isScheduleBoardOnlyUser/);
  assert.match(adminSrc, /if \(name === 'caldev'\) \{\s*if \(!canAccessScheduleBoard\(\)\) return;/);
  assert.match(adminSrc, /if \(button\.dataset\.tab === 'events'\) allowed = false;/);
  assert.match(workerSrc, /data-tab="events" hidden/);
  assert.match(workerSrc, /canNotifyCalendarSubscribers\(auth\.user\)/);
  assert.doesNotMatch(adminSrc, /\['Calendar Events'/);
});

test('Phase 0.7 public calendar feed is cached and busted on writes', () => {
  assert.match(workerSrc, /cachedPublicRead\('caldev-events', \(\) => listCaldevEvents\(env\)\)/);
  assert.match(workerSrc, /invalidatePublicReadCache\(\)/);
  const publicGet = workerSrc.match(/if \(url\.pathname === '\/api\/caldev\/events' && request\.method === 'GET'\) \{[\s\S]*?\n  \}/);
  assert.ok(publicGet, 'public caldev GET block not found');
  assert.match(publicGet[0], /cachedPublicRead\('caldev-events'/);
  assert.doesNotMatch(publicGet[0], /seedCaldevFromProduction/);
});
