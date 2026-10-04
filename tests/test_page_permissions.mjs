import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  ADMIN_AUDIT_KNOWN_ACTIONS,
  shouldAuditAdminApiRequest,
} from '../worker/src/admin-audit-log.mjs';
import { renderAdminSidebarHtml } from '../worker/src/admin-chrome.mjs';
import {
  migrateStoredUserPermissionGrants,
  normalizePageGrants,
  pageSettingsChanged,
  visualStructureSignature,
} from '../worker/src/page-permissions.mjs';
import {
  applyEnsemblesBodyHtml,
  adminSidebarAllows,
  canEditMeetingMinutes,
  canEditPage,
  canEditPageContent,
  canEditPageLayout,
  canManageMeetingMinutes,
  canManagePageSettings,
  canViewMeetingMinutes,
  MINUTES_EDIT_WINDOW_HOURS,
  minutesEditableUntil,
  minutesWithinEditWindow,
  sanitizeAssignablePermissions,
  userPageCapabilities,
} from '../worker/src/worker.mjs';
import {
  canEditVisualLayout,
  canEditVisualPage,
  renderVisualEditorHtml,
  resetVisualPagesSchemaCache,
  restoreVisualVersion,
  saveVisualPage,
} from '../worker/src/visual-page-editor.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
const visualJs = readFileSync(join(root, 'admin-visual.js'), 'utf8');
const styles = readFileSync(join(root, 'styles.css'), 'utf8');
const migration = readFileSync(join(root, 'migrations/2026-10-04.3.sql'), 'utf8');

const BASE_HTML = [
  '<section class="page-hero" data-visual-block="hero"><h1>Sponsors</h1><p>Intro</p></section>',
  '<section class="content" data-visual-block="body"><p>Body copy</p><ul><li>One</li></ul>',
  '<div class="card"><h2>Card</h2><p>Keep</p></div></section>',
].join('');

function hoursAgoIso(hours, now = new Date('2026-10-04T22:00:00.000Z')) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function sqliteUtc(hours, now = new Date('2026-10-04T22:00:00.000Z')) {
  return hoursAgoIso(hours, now).replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function createVisualEnv(html = BASE_HTML) {
  let queries = 0;
  const versions = [];
  let visual = {
    slug: 'sponsors',
    draft_html: html,
    published_html: html,
    published_at: '2026-10-04T00:00:00.000Z',
  };
  const cms = {
    slug: 'sponsors',
    title: 'Sponsors',
    path: '/sponsors.html',
    body_html: html,
    active: 1,
  };
  const env = {
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            queries += 1;
            if (q.includes('FROM cms_pages')) return cms;
            if (q.includes('FROM visual_pages')) return visual;
            if (q.includes('FROM visual_page_versions')) {
              return versions.find((row) => Number(row.id) === Number(this.binds[0])) || null;
            }
            return null;
          },
          async all() {
            queries += 1;
            return { results: versions.slice().reverse() };
          },
          async run() {
            queries += 1;
            if (q.includes('UPDATE visual_pages')) {
              visual = { ...visual, draft_html: this.binds[0] };
            }
            if (q.includes('INSERT INTO visual_page_versions')) {
              versions.push({
                id: versions.length + 1,
                slug: this.binds[0],
                kind: this.binds[1],
                html: this.binds[2],
              });
            }
            return { success: true };
          },
        };
      },
    },
  };
  return { env, count: () => queries, versions, visual, cms };
}

test('page:{slug} is content-only and layout:{slug} implies content', () => {
  const content = { role: 'editor', permissions: ['page:sponsors'] };
  const layout = { role: 'editor', permissions: ['layout:sponsors'] };
  const pages = { role: 'editor', permissions: ['pages'] };
  const admin = { role: 'admin', permissions: [] };
  const other = { role: 'editor', permissions: ['page:gallery'] };

  assert.equal(canEditPageContent(content, 'sponsors'), true);
  assert.equal(canEditPage(content, 'sponsors'), true);
  assert.equal(canEditPageLayout(content, 'sponsors'), false);
  assert.equal(canManagePageSettings(content), false);

  assert.equal(canEditPageContent(layout, 'sponsors'), true);
  assert.equal(canEditPageLayout(layout, 'sponsors'), true);
  assert.equal(canManagePageSettings(layout), false);

  assert.equal(canEditPageLayout(pages, 'sponsors'), true);
  assert.equal(canEditPageLayout(pages, 'home'), true);
  assert.equal(canManagePageSettings(pages), true);

  assert.equal(canEditPageLayout(admin, 'ensembles'), true);
  assert.equal(canEditPageContent(other, 'sponsors'), false);
  assert.equal(canEditPageLayout(other, 'sponsors'), false);
  assert.equal(canEditVisualPage(content, 'sponsors', canEditPage), true);
  assert.equal(canEditVisualLayout(content, 'sponsors', canEditPageLayout), false);
  assert.equal(canEditVisualLayout(layout, 'sponsors', canEditPageLayout), true);
});

test('normalizePageGrants maps minutes, implies page from layout, and drops unknown slugs', () => {
  assert.deepEqual(
    normalizePageGrants(['minutes', 'minutes:view', 'layout:sponsors', 'page:gallery', 'users'], ['sponsors', 'home']),
    ['minutes:edit', 'layout:sponsors', 'users', 'page:sponsors'],
  );
  assert.deepEqual(
    normalizePageGrants(['page:sponsors', 'layout:sponsors']),
    ['page:sponsors', 'layout:sponsors'],
  );
  assert.equal(normalizePageGrants(['page:sponsors']).includes('layout:sponsors'), false);
});

test('non-admins can only grant page and layout keys they already hold', () => {
  const jamie = { role: 'editor', permissions: ['users', 'page:sponsors', 'minutes:edit'] };
  assert.deepEqual(
    sanitizeAssignablePermissions(jamie, ['page:sponsors', 'layout:sponsors', 'minutes:edit', 'users']),
    ['page:sponsors', 'minutes:edit'],
  );
});

test('pageSettingsChanged 403s explicit setting edits and ignores omitted fields', () => {
  const existing = {
    slug: 'resources',
    path: '/resources.html',
    nav_order: 8,
    is_home: 0,
    active: 0,
  };
  const attempted = {
    slug: 'hacked',
    path: '/hacked.html',
    nav_order: 1,
    is_home: 1,
    active: 1,
  };
  assert.equal(pageSettingsChanged(attempted, existing, { slug: 'hacked', title: 'X' }), true);
  assert.equal(pageSettingsChanged(attempted, existing, { title: 'Student Resources', body_html: '<p>x</p>' }), false);
  assert.equal(pageSettingsChanged(attempted, existing), true);
});

test('visualStructureSignature ignores text, links, images, list items, and cards', () => {
  const edited = BASE_HTML
    .replace('Intro', 'Edited intro')
    .replace('src="/uploads/a.jpg"', 'src="/uploads/b.jpg"')
    .replace('<li>One</li>', '<li>One</li><li>Two</li>')
    .replace('Keep', 'Changed card');
  assert.equal(visualStructureSignature(BASE_HTML), visualStructureSignature(edited));
  const added = `${BASE_HTML}<section class="content" data-visual-block="extra"><p>New</p></section>`;
  assert.notEqual(visualStructureSignature(BASE_HTML), visualStructureSignature(added));
});

test('content-only visual save accepts copy edits and 403s a structural save', async () => {
  resetVisualPagesSchemaCache();
  const { env, count } = createVisualEnv();
  const copy = BASE_HTML.replace('Intro', 'Welcome sponsors').replace('<li>One</li>', '<li>One</li><li>Two</li>');
  const saved = await saveVisualPage(env, {
    slug: 'sponsors',
    html: copy,
    action: 'draft',
    user: { id: 8, display_name: 'Jamie' },
    allowStructure: false,
  });
  assert.match(saved.draft_html, /Welcome sponsors/);
  const afterCopy = count();

  const added = `${BASE_HTML}<section class="content" data-visual-block="extra"><p>New block</p></section>`;
  await assert.rejects(
    () => saveVisualPage(env, {
      slug: 'sponsors',
      html: added,
      action: 'draft',
      user: { id: 8, display_name: 'Jamie' },
      allowStructure: false,
    }),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, 'layout_required');
      assert.match(error.message, /layout:sponsors/);
      return true;
    },
  );
  assert.ok(count() - afterCopy <= 3, `structure reject used ${count() - afterCopy} queries`);
});

test('content-only restore of a different section structure is rejected', async () => {
  resetVisualPagesSchemaCache();
  const { env, versions } = createVisualEnv();
  versions.push({
    id: 9,
    slug: 'sponsors',
    kind: 'draft',
    html: `${BASE_HTML}<section class="content" data-visual-block="extra"><p>Old layout</p></section>`,
  });
  await assert.rejects(
    () => restoreVisualVersion(env, 9, { id: 8 }, 'sponsors', { allowStructure: false }),
    (error) => error.status === 403 && error.code === 'layout_required',
  );
});

test('ensemble body content stays editable; added sections need layout:ensembles', () => {
  const existing = [
    '<section class="page-hero"><h1>Ensembles</h1></section>',
    '<section class="content" data-ensembles-body><div class="wrap">',
    '<div class="card"><h2>Jazz</h2><p>Hi</p></div>',
    '</div></section>',
  ].join('');
  const cards = applyEnsemblesBodyHtml(existing, '<div class="card"><h2>Jazz</h2><p>Edited</p></div><div class="card"><h2>Concert</h2><p>New card</p></div>');
  assert.equal(visualStructureSignature(existing), visualStructureSignature(cards));
  const extraSection = applyEnsemblesBodyHtml(existing, '<section class="extra" data-visual-block="extra"><p>Nope</p></section>');
  assert.notEqual(visualStructureSignature(existing), visualStructureSignature(extraSection));
});

test('minutes:edit is 48h from created_at UTC; admin can edit after the window', () => {
  assert.equal(MINUTES_EDIT_WINDOW_HOURS, 48);
  const now = new Date('2026-10-04T22:00:00.000Z');
  const editor = { role: 'editor', permissions: ['minutes:edit'] };
  const admin = { role: 'admin', permissions: [] };
  const viewer = { role: 'editor', permissions: ['mail'] };
  const fresh = { meeting_date: '2026-08-01', created_at: sqliteUtc(47, now) };
  const locked = { meeting_date: '2026-08-01', created_at: sqliteUtc(49, now) };

  assert.equal(canViewMeetingMinutes(viewer), true);
  assert.equal(canManageMeetingMinutes(editor), true);
  assert.equal(canManageMeetingMinutes(viewer), false);
  assert.equal(minutesWithinEditWindow(fresh, now), true);
  assert.equal(minutesWithinEditWindow(locked, now), false);
  assert.equal(canEditMeetingMinutes(editor, fresh, now), true);
  assert.equal(canEditMeetingMinutes(editor, locked, now), false);
  assert.equal(canEditMeetingMinutes(admin, locked, now), true);
  assert.equal(minutesEditableUntil(fresh)?.toISOString(), new Date(Date.parse(`${fresh.created_at.replace(' ', 'T')}Z`) + 48 * 3600 * 1000).toISOString());
});

test('capabilities expose content vs layout slugs and minutes_edit', () => {
  const jamie = { role: 'editor', permissions: ['page:gallery', 'page:sponsors', 'minutes'] };
  const caps = userPageCapabilities(jamie, ['gallery', 'sponsors', 'ensembles', 'home']);
  assert.equal(caps.pages, false);
  assert.deepEqual(caps.content_slugs, ['gallery', 'sponsors']);
  assert.deepEqual(caps.layout_slugs, []);
  assert.equal(caps.minutes_edit, true);
});

test('migration rewrites minutes grants and never invents layout:*', async () => {
  const users = [
    { id: 8, permissions: JSON.stringify(['page:gallery', 'page:sponsors', 'minutes', 'users']) },
    { id: 10, permissions: JSON.stringify(['page:ensembles']) },
    { id: 13, permissions: JSON.stringify(['minutes']) },
  ];
  const env = {
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async all() { return { results: users }; },
          async run() {
            if (q.includes('UPDATE users SET permissions')) {
              const row = users.find((item) => item.id === this.binds[1]);
              if (row) row.permissions = this.binds[0];
            }
            return { success: true };
          },
        };
      },
    },
  };
  const result = await migrateStoredUserPermissionGrants(env);
  assert.equal(result.updated, 2);
  assert.deepEqual(JSON.parse(users[0].permissions).sort(), ['minutes:edit', 'page:gallery', 'page:sponsors', 'users']);
  assert.deepEqual(JSON.parse(users[1].permissions), ['page:ensembles']);
  assert.deepEqual(JSON.parse(users[2].permissions), ['minutes:edit']);
  assert.equal(users.every((row) => !String(row.permissions).includes('layout:')), true);
  assert.match(migration, /2026-10-04\.3/);
  assert.match(migration, /Nobody receives layout:\*/);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE/);
});

test('server sidebar hide uses allow(); content-only users keep Minutes visible', () => {
  const jamie = { role: 'editor', permissions: ['page:sponsors', 'users', 'minutes:edit'] };
  const allow = (tab) => adminSidebarAllows(jamie, tab);
  const html = renderAdminSidebarHtml('test', { user: jamie, allow });
  assert.match(html, /data-tab="dashboard"/);
  assert.match(html, /data-tab="minutes"/);
  assert.match(html, /data-tab="users"/);
  assert.doesNotMatch(html, /data-tab="security-log"(?! hidden)/);
  assert.match(html, /data-tab="ledger" hidden/);
  assert.equal(allow('minutes'), true);
  assert.equal(allow('sponsors-page'), true);
  assert.equal(allow('ensembles'), false);
  assert.equal(allow('security-log'), false);
});

test('Users form and visual editor hide layout for content-only users', () => {
  assert.match(workerSrc, /<legend>Page layout<\/legend>/);
  assert.match(workerSrc, /<legend>Content managers<\/legend>/);
  assert.match(workerSrc, /value="minutes:edit"/);
  assert.match(workerSrc, /id="page-permission-boxes"/);
  assert.match(adminJs, /class="page-grant-table"/);
  assert.match(adminJs, /data-layout-slug/);
  assert.match(adminJs, /Ticking layout also ticks content|layoutBox\.checked/);
  assert.match(styles, /\.page-grant-table/);
  assert.match(styles, /\.user-grant-group/);

  const editor = renderVisualEditorHtml('test', {
    slug: 'sponsors',
    canLayout: false,
    canSettings: false,
  });
  assert.match(editor, /visual-content-only/);
  assert.match(editor, /data-can-layout="0"/);
  assert.match(editor, /data-can-settings="0"/);
  assert.doesNotMatch(editor, /data-visual-add>/);
  assert.doesNotMatch(editor, /data-visual-history>/);
  assert.match(visualJs, /draggable: canLayout/);
  assert.match(visualJs, /copyable: canLayout/);
  assert.match(visualJs, /removable: canLayout/);
});

test('Worker APIs return layout_required and minutes audit actions without double-logging', () => {
  assert.match(workerSrc, /allowStructure: canEditPageLayout\(auth\.user, slug\)/);
  assert.match(workerSrc, /can_layout: canEditVisualLayout/);
  assert.match(workerSrc, /code: 'layout_required'/);
  assert.match(workerSrc, /Permission required: layout:ensembles/);
  assert.match(workerSrc, /SELECT slug FROM cms_pages/);
  assert.match(workerSrc, /capabilities: userPageCapabilities/);
  assert.match(workerSrc, /minutes\.edit\.admin_after_window/);
  assert.match(workerSrc, /within 48 hours of creation/);
  assert.match(workerSrc, /mayEditBoosters = existing\.slug === 'boosters' && hasPermission\(auth\.user, 'boosters'\)/);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/minutes', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/minutes/3', 'PUT'), false);
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('minutes.create'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('minutes.edit'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('minutes.edit.admin_after_window'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('minutes.delete'));
  assert.match(workerSrc, /ASSET_VERSION = 'cms-p1-20261004t'/);
  assert.match(workerSrc, /DB_SCHEMA_VERSION = '2026-10-04\.3'/);
  assert.doesNotMatch(workerSrc, /value="minutes:view"/);
});
