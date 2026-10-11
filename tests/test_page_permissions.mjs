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
  contentOnlyForbiddenHtmlViolation,
  contentOnlyHtmlViolation,
  migrateStoredUserPermissionGrants,
  normalizePageGrants,
  pageSettingsChanged,
  visualStructureSignature,
  visualStyleSignature,
} from '../worker/src/page-permissions.mjs';
import worker, {
  applyEnsemblesBodyHtml,
  adminSidebarAllows,
  canAccessBadgeCreator,
  canEditMeetingMinutes,
  canEditPage,
  canEditPageContent,
  canEditPageLayout,
  canManageMeetingMinutes,
  canManagePageSettings,
  canPreviewUnpublishedCmsPage,
  canToggleMaintenanceMode,
  canViewMeetingMinutes,
  DB_SCHEMA_VERSION,
  isDeliberateComingSoonPage,
  makeSession,
  MINUTES_EDIT_WINDOW_HOURS,
  minutesEditableUntil,
  minutesWithinEditWindow,
  resetDbInitCache,
  sanitizeAssignablePermissions,
  shouldServePublicCmsPage,
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
const visualCss = readFileSync(join(root, 'admin-visual.css'), 'utf8');
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
  assert.equal(pageSettingsChanged({ ...existing, title: 'Hacked' }, { ...existing, title: 'Resources' }, { title: 'Hacked' }), true);
  assert.equal(pageSettingsChanged(attempted, existing, { body_html: '<p>x</p>' }), false);
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

test('content-only visual save 403s style-block CSS changes as layout', async () => {
  resetVisualPagesSchemaCache();
  const styled = `${BASE_HTML}<style data-visual-css>#hero{display:block}</style>`;
  const { env, count } = createVisualEnv(styled);
  const copy = styled.replace('Intro', 'Welcome sponsors');
  const saved = await saveVisualPage(env, {
    slug: 'sponsors',
    html: copy,
    action: 'draft',
    user: { id: 8, display_name: 'Jamie' },
    allowStructure: false,
  });
  assert.match(saved.draft_html, /Welcome sponsors/);
  const afterCopy = count();

  const hidden = styled.replace('#hero{display:block}', '#hero{display:none}');
  await assert.rejects(
    () => saveVisualPage(env, {
      slug: 'sponsors',
      html: hidden,
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
  assert.ok(count() - afterCopy <= 3, `style reject used ${count() - afterCopy} queries`);
  assert.equal(visualStyleSignature(styled), visualStyleSignature(copy));
  assert.notEqual(visualStyleSignature(styled), visualStyleSignature(hidden));
});

test('content-only visual save 403s inline style, class, and hidden on a block', async () => {
  resetVisualPagesSchemaCache();
  const { env } = createVisualEnv();
  const hiddenStyle = BASE_HTML.replace(
    '<section class="page-hero" data-visual-block="hero">',
    '<section class="page-hero" data-visual-block="hero" style="display:none">',
  );
  await assert.rejects(
    () => saveVisualPage(env, {
      slug: 'sponsors',
      html: hiddenStyle,
      action: 'draft',
      user: { id: 8, display_name: 'Jamie' },
      allowStructure: false,
    }),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, 'layout_required');
      return true;
    },
  );
  const hiddenAttr = BASE_HTML.replace(
    'data-visual-block="hero"',
    'data-visual-block="hero" hidden',
  );
  await assert.rejects(
    () => saveVisualPage(env, {
      slug: 'sponsors',
      html: hiddenAttr,
      action: 'draft',
      user: { id: 8, display_name: 'Jamie' },
      allowStructure: false,
    }),
    (error) => error.status === 403 && error.code === 'layout_required',
  );
  const classed = BASE_HTML.replace('class="page-hero"', 'class="page-hero is-hidden"');
  await assert.rejects(
    () => saveVisualPage(env, {
      slug: 'sponsors',
      html: classed,
      action: 'draft',
      user: { id: 8, display_name: 'Jamie' },
      allowStructure: false,
    }),
    (error) => error.status === 403 && error.code === 'layout_required',
  );
  assert.notEqual(visualStructureSignature(BASE_HTML), visualStructureSignature(hiddenStyle));
  assert.notEqual(visualStructureSignature(BASE_HTML), visualStructureSignature(hiddenAttr));
});

test('content-only visual save 403s hidden style on an inner paragraph or span', async () => {
  resetVisualPagesSchemaCache();
  const { env } = createVisualEnv();
  const hiddenP = BASE_HTML.replace('<p>Intro</p>', '<p style="display:none">Intro</p>');
  await assert.rejects(
    () => saveVisualPage(env, {
      slug: 'sponsors',
      html: hiddenP,
      action: 'draft',
      user: { id: 8, display_name: 'Jamie' },
      allowStructure: false,
    }),
    (error) => error.status === 403 && error.code === 'layout_required',
  );
  const hiddenSpan = BASE_HTML.replace('<p>Intro</p>', '<p><span style="display:none">Intro</span></p>');
  await assert.rejects(
    () => saveVisualPage(env, {
      slug: 'sponsors',
      html: hiddenSpan,
      action: 'draft',
      user: { id: 8, display_name: 'Jamie' },
      allowStructure: false,
    }),
    (error) => error.status === 403 && error.code === 'layout_required',
  );
  assert.match(contentOnlyHtmlViolation(BASE_HTML, hiddenP), /style is not allowed on <p>/i);
  assert.match(contentOnlyHtmlViolation(BASE_HTML, hiddenSpan), /span|style/i);
  assert.equal(contentOnlyHtmlViolation(BASE_HTML, BASE_HTML.replace('Intro', 'Welcome')), null);
});

test('content-only visual save 403s onclick, data-*, iframe, script, style, and javascript: links', async () => {
  resetVisualPagesSchemaCache();
  const { env, versions } = createVisualEnv();
  const cases = [
    [BASE_HTML.replace('<p>Intro</p>', '<p onclick="alert(1)">Intro</p>'), /onclick/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p>Intro <b onclick="alert(1)">x</b></p>'), /onclick/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p onmouseover="alert(1)">Intro</p>'), /onmouseover/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p data-x="1">Intro</p>'), /data-x/i],
    [`${BASE_HTML}<iframe src="/x"></iframe>`, /iframe/i],
    [`${BASE_HTML}<script>alert(1)</script>`, /script/i],
    [`${BASE_HTML}<style>p{color:red}</style>`, /style/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><a href="javascript:alert(1)">Intro</a></p>'), /javascript/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><a href="javascript&colon;alert(1)">Intro</a></p>'), /javascript/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><a href="&#x6a;avascript:alert(1)">Intro</a></p>'), /javascript/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><a href="&#106;&#9;avascript:alert(1)">Intro</a></p>'), /javascript/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p>Intro <b style="color:red">x</b></p>'), /style/i],
    [`${BASE_HTML}<svg onload="alert(1)"></svg>`, /svg|onload/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><img src="/uploads/a.jpg" alt="x" onerror="alert(1)"></p>'), /onerror/i],
  ];
  for (const [html, detail] of cases) {
    assert.match(
      contentOnlyForbiddenHtmlViolation(BASE_HTML, html) || contentOnlyHtmlViolation(BASE_HTML, html) || '',
      detail,
    );
    await assert.rejects(
      () => saveVisualPage(env, {
        slug: 'sponsors',
        html,
        action: 'draft',
        user: { id: 8, display_name: 'Jamie' },
        allowStructure: false,
      }),
      (error) => {
        assert.equal(error.status, 403);
        assert.match(error.message, detail);
        return true;
      },
    );
  }
  assert.equal(versions.length, 0);
});

function createJoinDraftPutEnv(html = BASE_HTML) {
  const editor = {
    id: 8,
    username: 'jamie@efhsband.org',
    display_name: 'Jamie',
    password_hash: 'x',
    role: 'editor',
    permissions: JSON.stringify(['page:join']),
    active: 1,
  };
  let visual = {
    slug: 'join',
    draft_html: html,
    published_html: html,
    published_at: '2026-10-04T00:00:00.000Z',
    updated_at: '2026-10-04T00:00:00.000Z',
  };
  const cms = {
    slug: 'join',
    title: 'Join the Band',
    path: '/join.html',
    body_html: html,
    active: 1,
  };
  const versions = [];
  const env = {
    EFBAND_SECRET: 'test-session-secret',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            if (q.includes('FROM site_content WHERE key')) return { value: DB_SCHEMA_VERSION };
            if (q.includes('FROM users WHERE id')) return editor;
            if (q.includes('FROM cms_pages')) return cms;
            if (q.includes('FROM visual_pages')) return visual;
            if (q.includes('FROM visual_page_versions')) return null;
            if (q.includes('FROM admin_audit_log')) return null;
            return null;
          },
          async all() { return { results: versions.slice().reverse() }; },
          async run() {
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
      async batch() { return []; },
    },
    ASSETS: { async fetch() { return new Response('missing', { status: 404 }); } },
  };
  return { env, editor, visual: () => visual, versions };
}

test('content-only join draft PUT 403s raw XSS constructs and stores none of them', async () => {
  resetDbInitCache();
  resetVisualPagesSchemaCache();
  const { env, editor, visual, versions } = createJoinDraftPutEnv();
  const cookie = `efband_session=${await makeSession({ id: editor.id, username: editor.username }, env)}`;
  const cases = [
    [BASE_HTML.replace('<p>Intro</p>', '<p onclick="alert(1)">Intro</p>'), /onclick/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p>Intro <b onclick="alert(1)">x</b></p>'), /onclick/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p onmouseover="alert(1)">Intro</p>'), /onmouseover/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p data-x="1">Intro</p>'), /data-x/i],
    [`${BASE_HTML}<iframe src="/x"></iframe>`, /iframe/i],
    [`${BASE_HTML}<script>alert(1)</script>`, /script/i],
    [`${BASE_HTML}<style>p{color:red}</style>`, /style/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><a href="javascript:alert(1)">Intro</a></p>'), /javascript/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><a href="javascript&colon;alert(1)">Intro</a></p>'), /javascript/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><a href="&#x6a;avascript:alert(1)">Intro</a></p>'), /javascript/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><a href="&#106;&#9;avascript:alert(1)">Intro</a></p>'), /javascript/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p>Intro <b style="color:red">x</b></p>'), /style/i],
    [`${BASE_HTML}<svg onload="alert(1)"></svg>`, /svg|onload/i],
    [BASE_HTML.replace('<p>Intro</p>', '<p><img src="/uploads/a.jpg" alt="x" onerror="alert(1)"></p>'), /onerror/i],
  ];
  assert.match(workerSrc, /html: rawHtml/);
  assert.match(workerSrc, /extractEditableJoinHtml\(raw\.html/);
  for (const [html, detail] of cases) {
    const response = await worker.fetch(new Request('https://efhsband.org/api/admin/visual-pages/join', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'draft', html }),
    }), env, { waitUntil() {} });
    assert.equal(response.status, 403, html);
    const payload = await response.json();
    assert.match(payload.detail, detail);
    assert.doesNotMatch(visual().draft_html, /onclick|onmouseover|onerror|onload|javascript:|iframe|data-x/i);
  }
  const allowed = await worker.fetch(new Request('https://efhsband.org/api/admin/visual-pages/join', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'draft',
      html: BASE_HTML.replace('<p>Intro</p>', '<p>Intro <a href="https://example.com/join" target="_blank">Join</a></p>'),
    }),
  }), env, { waitUntil() {} });
  assert.equal(allowed.status, 200);
  const saved = await allowed.json();
  assert.match(saved.draft_html, /target="_blank"/);
  assert.match(saved.draft_html, /rel="noopener noreferrer"/);
  assert.equal(versions.length, 1);
});

test('content-only save allows target=_blank when the server adds rel=noopener noreferrer', async () => {
  resetVisualPagesSchemaCache();
  const { env } = createVisualEnv();
  const withBlank = BASE_HTML.replace(
    '<p>Intro</p>',
    '<p>Intro <a href="https://example.com/join" target="_blank">Join</a></p>',
  );
  assert.equal(contentOnlyHtmlViolation(BASE_HTML, withBlank), null);
  const saved = await saveVisualPage(env, {
    slug: 'sponsors',
    html: withBlank,
    action: 'draft',
    user: { id: 8, display_name: 'Jamie' },
    allowStructure: false,
  });
  assert.match(saved.draft_html, /target="_blank"/);
  assert.match(saved.draft_html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(saved.draft_html, /onclick|javascript:|onerror|onload/i);
});

test('content-only save accepts a plain https link next to an existing classed link', async () => {
  resetVisualPagesSchemaCache();
  const baseline = BASE_HTML.replace('<p>Intro</p>', '<p>Intro <a class="btn" href="/x">Here</a></p>');
  const { env } = createVisualEnv(baseline);
  const added = baseline.replace(
    '<p>Intro <a class="btn" href="/x">Here</a></p>',
    '<p>Intro <a href="https://example.com/join">Join</a> <a class="btn" href="/x">Here</a></p>',
  );
  assert.equal(contentOnlyHtmlViolation(baseline, added), null);
  const saved = await saveVisualPage(env, {
    slug: 'sponsors',
    html: added,
    action: 'draft',
    user: { id: 8, display_name: 'Jamie' },
    allowStructure: false,
  });
  assert.match(saved.draft_html, /https:\/\/example.com\/join/);
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
      assert.match(error.message, /new <section> is not allowed|layout:sponsors|data-visual-block/);
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
  assert.match(visualJs, /if \(canLayout\) \{\s*toolbar\.push\(tool\('tlb-move'/);
  assert.match(visualJs, /if \(canLayout\) \{\s*toolbar\.push\(tool\('tlb-delete'/);
  assert.match(visualJs, /then edit the text/);
  assert.match(visualJs, /styleManager: canLayout \? \{ appendTo: '#visual-gjs-sink' \}/);
  assert.doesNotMatch(editor, /data-visual-style-editor/);
  assert.match(renderVisualEditorHtml('test', { slug: 'sponsors', canLayout: true }), /data-visual-style-editor/);
  assert.match(visualCss, /\.visual-content-only #visual-gjs-sink/);
  assert.match(adminJs, /#new-user[\s\S]*syncPageGrantCovered/);
  assert.match(adminJs, /User saved\.[\s\S]*syncPageGrantCovered/);
  assert.match(adminJs, /const securityLogSelectFilters/);
  assert.match(adminJs, /const securityLogTextFilters/);
});

test('Worker APIs return layout_required and minutes audit actions without double-logging', () => {
  assert.match(workerSrc, /allowStructure: canEditPageLayout\(auth\.user, slug\)/);
  assert.match(workerSrc, /can_layout: canEditVisualLayout/);
  assert.match(workerSrc, /code: 'layout_required'/);
  assert.match(workerSrc, /Permission required: layout:ensembles/);
  assert.match(workerSrc, /SELECT slug FROM cms_pages/);
  assert.match(workerSrc, /capabilities: userPageCapabilities/);
  assert.match(workerSrc, /minutes\.edit\.admin_after_window/);
  assert.match(workerSrc, /if \(!canManageMeetingMinutes\(auth\.user\)\) \{[\s\S]*Permission required: minutes:edit[\s\S]*if \(!canEditMeetingMinutes/);
  assert.match(workerSrc, /within 48 hours of creation/);
  assert.match(workerSrc, /mayEditBoosters = existing\.slug === 'boosters' && hasPermission\(auth\.user, 'boosters'\)/);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/minutes', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/minutes/3', 'PUT'), false);
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('minutes.create'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('minutes.edit'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('minutes.edit.admin_after_window'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('minutes.delete'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('access.denied'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('access.unauthenticated'));
  assert.match(workerSrc, /maybeLogAccessDenial/);
  assert.match(workerSrc, /ASSET_VERSION = 'cms-p1-20261011b'/);
  assert.match(workerSrc, /DB_SCHEMA_VERSION = '2026-10-04\.8'/);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/fundraiser-cards', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/fundraiser-cards/9/reject', 'POST'), false);
  assert.doesNotMatch(workerSrc, /value="minutes:view"/);
});

test('Badge Creator is badges-or-admin only and hidden without the grant', () => {
  assert.equal(canAccessBadgeCreator({ role: 'admin', permissions: [] }), true);
  assert.equal(canAccessBadgeCreator({ role: 'editor', permissions: ['badges'] }), true);
  assert.equal(canAccessBadgeCreator({ role: 'editor', permissions: ['president'] }), false);
  assert.equal(canAccessBadgeCreator({ role: 'editor', permissions: ['vice-president'] }), false);
  assert.equal(canAccessBadgeCreator({ role: 'editor', permissions: ['boosters'] }), false);

  const caps = userPageCapabilities({ role: 'editor', permissions: ['badges'] }, []);
  assert.equal(caps.badges, true);
  assert.equal(userPageCapabilities({ role: 'editor', permissions: ['president'] }, []).badges, false);

  const president = { role: 'editor', permissions: ['president', 'users'] };
  assert.deepEqual(sanitizeAssignablePermissions(president, ['badges', 'president']), ['president']);

  const noBadge = { role: 'editor', permissions: ['page:sponsors', 'minutes:edit'] };
  const allow = (tab) => adminSidebarAllows(noBadge, tab);
  const html = renderAdminSidebarHtml('test', { user: noBadge, allow });
  assert.equal(allow('badge-creator'), false);
  assert.match(html, /data-tab="badge-creator" hidden/);
  assert.match(html, /data-boosters-menu/);
  assert.doesNotMatch(html, /data-boosters-menu hidden/);

  const emptyBoosters = renderAdminSidebarHtml('test', {
    allow: (tab) => tab !== 'booster-members' && tab !== 'minutes' && tab !== 'badge-creator',
  });
  assert.match(emptyBoosters, /data-boosters-menu hidden/);
  assert.match(emptyBoosters, /data-tab="badge-creator" hidden/);

  assert.match(workerSrc, /value="badges"> Badge Creator/);
  assert.match(workerSrc, /'badges'/);
  assert.match(adminJs, /hasPermission\('badges'\)/);
});

function badgeAuthEnv(user) {
  const users = new Map([[Number(user.id), { ...user }]]);
  return {
    EFBAND_SECRET: 'test-session-secret',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            if (q.includes('FROM site_content WHERE key')) return { value: DB_SCHEMA_VERSION };
            if (q.includes('FROM users WHERE id')) return users.get(Number(this.binds[0])) || null;
            return null;
          },
          async all() { return { results: [] }; },
          async run() { return { success: true }; },
        };
      },
      async batch() { return []; },
    },
    ASSETS: { async fetch() { return new Response('missing', { status: 404 }); } },
  };
}

test('inactive CMS pages 404 unless Coming Soon or an editor previews', () => {
  const ensembles = { slug: 'ensembles', title: 'Ensembles', active: 0 };
  const resources = { slug: 'resources', title: 'Student Resources', active: 0 };
  const comingSoon = { slug: 'coming-soon', title: 'Coming Soon', active: 1 };
  const comingSoonOff = { slug: 'coming-soon', title: 'Coming Soon', active: 0 };
  const join = { slug: 'join', title: 'Join the Band', active: 1 };
  const volunteer = { slug: 'volunteer', title: 'Volunteer', active: 0 };
  const editor = { role: 'editor', permissions: ['page:ensembles'] };
  const stranger = { role: 'editor', permissions: ['page:sponsors'] };

  assert.equal(isDeliberateComingSoonPage(comingSoon), true);
  assert.equal(isDeliberateComingSoonPage(join), true);
  assert.equal(isDeliberateComingSoonPage(volunteer), true);
  assert.equal(isDeliberateComingSoonPage(ensembles), false);

  assert.equal(shouldServePublicCmsPage(ensembles, null), false);
  assert.equal(shouldServePublicCmsPage(resources, null), false);
  assert.equal(shouldServePublicCmsPage(comingSoon, null), true);
  assert.equal(shouldServePublicCmsPage(comingSoonOff, null), true);
  assert.equal(shouldServePublicCmsPage(volunteer, null), true);
  assert.equal(shouldServePublicCmsPage(ensembles, editor), true);
  assert.equal(shouldServePublicCmsPage(ensembles, stranger), false);
  assert.equal(canPreviewUnpublishedCmsPage(editor, ensembles), true);
  assert.equal(canPreviewUnpublishedCmsPage(stranger, ensembles), false);
  assert.match(workerSrc, /if \(!shouldServePublicCmsPage\(page, user\)\)/);
  assert.match(workerSrc, /renderPublicNotFound/);
});

test('maintenance mode is Super Admin only and hidden from site editors', () => {
  assert.equal(canToggleMaintenanceMode({ role: 'admin', permissions: [] }), true);
  assert.equal(canToggleMaintenanceMode({ role: 'editor', permissions: ['site'] }), false);
  assert.equal(canToggleMaintenanceMode({ role: 'editor', permissions: ['pages'] }), false);
  assert.equal(canToggleMaintenanceMode(null), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/maintenance', 'POST'), false);
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('change.maintenance'));
  assert.match(workerSrc, /data-maintenance-mode-setting hidden/);
  assert.match(workerSrc, /Only Super Admins can change maintenance mode/);
  assert.match(adminJs, /data-maintenance-mode-setting/);
  assert.match(adminJs, /maintenanceSetting\.hidden = !isSuperAdmin\(\)/);
  assert.match(adminJs, /\/api\/admin\/maintenance/);
  assert.match(adminJs, /delete payload\.maintenance_mode/);
});

test('site editors cannot toggle maintenance mode; Super Admin can', async () => {
  resetDbInitCache();
  const site = new Map([
    ['maintenance_mode', '0'],
    ['title', 'East Forsyth Band'],
  ]);
  const editor = {
    id: 20,
    username: 'site-editor@efhsband.org',
    display_name: 'Site Editor',
    password_hash: 'x',
    role: 'editor',
    permissions: JSON.stringify(['site']),
    active: 1,
  };
  const admin = {
    id: 1,
    username: 'admin@efhsband.org',
    display_name: 'Admin',
    password_hash: 'x',
    role: 'admin',
    permissions: JSON.stringify([]),
    active: 1,
  };
  const audits = [];
  const users = new Map([[editor.id, editor], [admin.id, admin]]);
  const env = {
    EFBAND_SECRET: 'test-session-secret',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            if (q.includes('FROM site_content WHERE key') && !q.includes('IN (')) {
              return { value: DB_SCHEMA_VERSION };
            }
            if (q.includes('FROM users WHERE id')) return users.get(Number(this.binds[0])) || null;
            if (q.includes('FROM site_content') && q.includes('key =')) {
              return { value: site.get(this.binds[0]) || '' };
            }
            if (q.includes('FROM admin_audit_log')) return null;
            return null;
          },
          async all() {
            if (q.includes('FROM site_content')) {
              return { results: [...site.entries()].map(([key, value]) => ({ key, value })) };
            }
            return { results: [] };
          },
          async run() {
            if (q.includes('INSERT INTO site_content') && this.binds[0] === 'maintenance_mode') {
              site.set('maintenance_mode', String(this.binds[1]));
            }
            if (q.includes('INSERT INTO admin_audit_log')) {
              audits.push({ action: this.binds[1] || 'logged' });
            }
            return { success: true };
          },
        };
      },
      async batch() { return []; },
    },
    ASSETS: { async fetch() { return new Response('missing', { status: 404 }); } },
  };

  const editorCookie = `efband_session=${await makeSession({ id: editor.id, username: editor.username }, env)}`;
  const denied = await worker.fetch(new Request('https://efhsband.org/api/admin/maintenance', {
    method: 'POST',
    headers: { cookie: editorCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ maintenance_mode: true }),
  }), env, { waitUntil() {} });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { detail: 'Only Super Admins can change maintenance mode.' });
  assert.equal(site.get('maintenance_mode'), '0');
  assert.deepEqual(audits.map((row) => row.action), ['access.denied']);

  const siteSave = await worker.fetch(new Request('https://efhsband.org/api/admin/site', {
    method: 'POST',
    headers: { cookie: editorCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Hack', maintenance_mode: true }),
  }), env, { waitUntil() {} });
  assert.equal(siteSave.status, 403);
  assert.deepEqual(await siteSave.json(), { detail: 'Only Super Admins can change maintenance mode.' });
  assert.equal(site.get('maintenance_mode'), '0');
  assert.deepEqual(audits.map((row) => row.action), ['access.denied', 'access.denied']);

  const adminCookie = `efband_session=${await makeSession({ id: admin.id, username: admin.username }, env)}`;
  const allowed = await worker.fetch(new Request('https://efhsband.org/api/admin/maintenance', {
    method: 'POST',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ maintenance_mode: true }),
  }), env, { waitUntil() {} });
  assert.equal(allowed.status, 200);
  const saved = await allowed.json();
  assert.equal(Number(saved.maintenance_mode), 1);
  assert.equal(site.get('maintenance_mode'), '1');
  assert.ok(audits.some((row) => row.action === 'change.maintenance'));
});

test('minutes PUT without minutes:edit returns Permission required, not the 48h window', async () => {
  resetDbInitCache();
  const viewer = {
    id: 9,
    username: 'viewer@efhsband.org',
    display_name: 'Viewer',
    password_hash: 'x',
    role: 'editor',
    permissions: JSON.stringify(['page:sponsors']),
    active: 1,
  };
  const minutes = {
    id: 3,
    meeting_date: '2026-10-01',
    body_html: '<p>Notes</p>',
    created_by: 1,
    created_at: '2026-10-04 21:00:00',
    updated_at: '2026-10-04 21:00:00',
    created_by_name: 'Admin',
  };
  const audits = [];
  const env = {
    EFBAND_SECRET: 'test-session-secret',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            if (q.includes('FROM site_content WHERE key')) return { value: DB_SCHEMA_VERSION };
            if (q.includes('FROM users WHERE id')) return viewer;
            if (q.includes('FROM booster_meeting_minutes')) return minutes;
            if (q.includes('FROM admin_audit_log')) return null;
            return null;
          },
          async all() { return { results: [] }; },
          async run() {
            if (q.includes('INSERT INTO admin_audit_log')) {
              audits.push({ action: this.binds[1] });
            }
            return { success: true };
          },
        };
      },
      async batch() { return []; },
    },
    ASSETS: { async fetch() { return new Response('missing', { status: 404 }); } },
  };
  const cookie = `efband_session=${await makeSession({ id: viewer.id, username: viewer.username }, env)}`;
  const response = await worker.fetch(new Request('https://efhsband.org/api/admin/minutes/3', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ meeting_date: '2026-10-01', body_html: '<p>Hack</p>' }),
  }), env, { waitUntil() {} });
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.detail, 'Permission required: minutes:edit');
  assert.doesNotMatch(payload.detail, /48 hours/);
  assert.deepEqual(audits.map((row) => row.action), ['access.denied']);
});

test('Badge Creator APIs and HTML tab 403 without badges', async () => {
  resetDbInitCache();
  const editor = {
    id: 12,
    username: 'shirl@efhsband.org',
    display_name: 'Shirl Johnson',
    password_hash: 'x',
    role: 'editor',
    permissions: JSON.stringify(['vice-president']),
    active: 1,
  };
  const env = badgeAuthEnv(editor);
  const cookie = `efband_session=${await makeSession({ id: editor.id, username: editor.username }, env)}`;
  const api = await worker.fetch(new Request('https://efhsband.org/api/admin/badges', {
    headers: { cookie },
  }), env, { waitUntil() {} });
  assert.equal(api.status, 403);
  assert.deepEqual(await api.json(), { detail: 'Permission required: badges' });

  const html = await worker.fetch(new Request('https://efhsband.org/admin?tab=badge-creator', {
    headers: { cookie },
  }), env, { waitUntil() {} });
  assert.equal(html.status, 403);
  const body = await html.text();
  assert.match(body, /error-page error-403/);
  assert.match(body, /Permission required: badges|Access Denied|not allowed|Sign-In Needed|off limits|403/i);
});

test('login POST ignores junk device JSON and public pages do not collect it', async () => {
  resetDbInitCache();
  assert.match(workerSrc, /name="device"/);
  assert.match(adminJs, /collectAdminDeviceSnapshot/);
  assert.doesNotMatch(readFileSync(join(root, 'script.js'), 'utf8'), /collectAdminDeviceSnapshot/);
  const env = {
    EFBAND_SECRET: 'test-session-secret',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            if (q.includes('FROM site_content WHERE key')) return { value: DB_SCHEMA_VERSION };
            if (q.includes('FROM users')) return null;
            if (q.includes('FROM admin_audit_log')) return null;
            return null;
          },
          async all() { return { results: [] }; },
          async run() { return { success: true }; },
        };
      },
      async batch() { return []; },
    },
    ASSETS: { async fetch() { return new Response('missing', { status: 404 }); } },
  };
  const response = await worker.fetch(new Request('https://efhsband.org/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: 'nobody@efhsband.org',
      password: 'nope',
      device: `{${'x'.repeat(4000)}`,
    }),
  }), env, { waitUntil() {} });
  assert.equal(response.status, 401);
  assert.match(await response.text(), /Invalid username or password/);
});
