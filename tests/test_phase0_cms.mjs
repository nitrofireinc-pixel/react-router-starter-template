import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import worker, {
  assertSafeSelfPrivilegeEdit,
  assertSafeUserPrivilegeGrant,
  canAccessScheduleBoard,
  canManagePageSettings,
  canNotifyCalendarSubscribers,
  DB_SCHEMA_VERSION,
  isPublicCmsPageActive,
  lockPageSettingsToExisting,
  makeSession,
  publicCmsPageForRender,
  publicFormSubmitGate,
  renderPageBody,
  resetDbInitCache,
  sanitizeAssignablePermissions,
  sanitizeCmsPageHtml,
  sanitizeHomeBodyHtml,
  serializePagePayload,
} from '../worker/src/worker.mjs';
import { sanitizeAllowlistHtml, sanitizeHomeAllowlistHtml } from '../worker/src/html-sanitizer.mjs';

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
    active: 0,
    title: 'Student Resources',
    body_html: '<section><p>Keep</p></section>',
  };
  const attempted = serializePagePayload({
    slug: 'hacked',
    path: '/hacked.html',
    nav_order: 1,
    is_home: 1,
    active: 1,
    title: 'Student Resources',
    body_html: '<section><p>Edited</p></section>',
  }, existing);
  const locked = lockPageSettingsToExisting(attempted, existing);
  assert.equal(locked.slug, 'resources');
  assert.equal(locked.path, '/resources.html');
  assert.equal(locked.nav_order, 8);
  assert.equal(locked.is_home, 0);
  assert.equal(locked.active, 0);
  assert.match(locked.body_html, /Edited/);
  assert.match(workerSrc, /if \(!canManagePageSettings\(auth\.user\)\)/);
  assert.match(workerSrc, /page = lockPageSettingsToExisting\(page, existing\)/);
});

test('Phase 0.3 users permission cannot grant all or Super Admin', () => {
  const usersEditor = { role: 'editor', permissions: ['users'] };
  const superAdmin = { role: 'admin', permissions: [] };

  assert.equal(assertSafeUserPrivilegeGrant(usersEditor, { role: 'admin' }).ok, false);
  assert.equal(assertSafeUserPrivilegeGrant(usersEditor, { role: 'editor', permissions: ['all'] }).ok, false);
  assert.equal(assertSafeUserPrivilegeGrant(usersEditor, { role: 'editor', permissions: ['events'] }).ok, false);
  assert.equal(assertSafeUserPrivilegeGrant(superAdmin, { role: 'admin', permissions: ['all'] }).ok, true);

  assert.deepEqual(sanitizeAssignablePermissions(usersEditor, ['events', 'all', 'page:home']), []);
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
  assert.match(adminSrc, /function canOpenAdminTab/);
  assert.match(adminSrc, /if \(tab === 'users'\) return hasPermission\('users'\)/);
  assert.match(adminSrc, /if \(tab === 'caldev'\) return canAccessScheduleBoard\(\)/);
  assert.match(adminSrc, /if \(!canOpenAdminTab\(name\)\)/);
  assert.match(adminSrc, /#caldev-finished-top, \[data-cms-caldev-finished\], \.cms-caldev-finished-bar/);
  const stylesSrc = readFileSync(join(root, 'styles.css'), 'utf8');
  assert.match(stylesSrc, /#caldev-finished-top\[hidden\]/);
  assert.match(adminSrc, /Add and edit events for the public Calendar/);
  assert.match(workerSrc, /Add and edit events for the public Calendar/);
  assert.doesNotMatch(workerSrc, /President, Vice President, and Super Admin editing for the public Calendar/);
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

const XSS_BYPASSES = [
  ['slash-separated img onerror', '<img/src=x/onerror=alert(1)>', /onerror|alert\(1\)/i],
  ['slash-separated svg onload', '<svg/onload=alert(1)>', /onload|alert\(1\)/i],
  ['no-space quoted onerror', '<img src="x"onerror=alert(1)>', /onerror|alert\(1\)/i],
  ['entity-encoded javascript href', '<a href="javascript&#58;alert(1)">x</a>', /javascript|alert\(1\)/i],
  ['hex entity javascript src', '<img src="javascrip&#x74;:alert(1)">', /javascript|alert\(1\)/i],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>', /iframe|srcdoc|script|alert\(1\)/i],
  ['object data URL', '<object data="data:text/html,<script>alert(1)</script>"></object>', /object|data:text\/html|script|alert\(1\)/i],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">', /meta|refresh|javascript|alert\(1\)/i],
  ['base href', '<base href="https://evil.example/">', /<base/i],
  ['off-site form action', '<form action="https://evil.example/steal"><input name="x"><button>Go</button></form>', /evil\.example/i],
];

test('Phase 0 follow-up sanitizer blocks listed XSS bypasses on page and home HTML', () => {
  for (const [label, dirty, banned] of XSS_BYPASSES) {
    const page = sanitizeCmsPageHtml(`<section class="content"><p>Safe</p>${dirty}</section>`);
    assert.match(page, /<section class="content">/, label);
    assert.match(page, /<p>Safe<\/p>/, label);
    assert.doesNotMatch(page, banned, `${label} leaked through page sanitizer`);

    const home = sanitizeHomeBodyHtml(`<section class="hero"><h1>Home</h1>${dirty}</section>`);
    assert.match(home, /<h1>Home<\/h1>/, label);
    assert.doesNotMatch(home, banned, `${label} leaked through home sanitizer`);
    assert.doesNotMatch(sanitizeAllowlistHtml(dirty, { profile: 'cms' }), banned, `${label} leaked through allowlist`);
  }
  const kept = sanitizeCmsPageHtml('<form action="/api/contact"><button type="submit">Send</button></form>');
  assert.match(kept, /<form action="\/api\/contact">/);
  assert.match(kept, /<button type="submit">Send<\/button>/);
});

test('Phase 0 follow-up users permission cannot edit own role or permissions', () => {
  const self = { id: 7, role: 'editor', permissions: ['users'] };
  const blocked = assertSafeSelfPrivilegeEdit(self, 7, {
    role: 'editor',
    permissions: ['users', 'pages', 'events'],
  }, self);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 403);

  const same = assertSafeSelfPrivilegeEdit(self, 7, {
    role: 'editor',
    permissions: ['users'],
    display_name: 'Self',
  }, self);
  assert.equal(same.ok, true);

  const nameOnly = assertSafeSelfPrivilegeEdit(self, 7, {
    display_name: 'Own Name',
    username: 'self@example.com',
    password: 'new-password-ok',
  }, self);
  assert.equal(nameOnly.ok, true);
  assert.deepEqual(nameOnly.payload.permissions, ['users']);

  const other = assertSafeSelfPrivilegeEdit(self, 9, {
    role: 'editor',
    permissions: ['users', 'pages'],
  }, { id: 9, role: 'editor', permissions: ['events'] });
  assert.equal(other.ok, true);

  const admin = assertSafeSelfPrivilegeEdit({ id: 1, role: 'admin' }, 1, {
    role: 'admin',
    permissions: ['all'],
  }, { id: 1, role: 'admin', permissions: [] });
  assert.equal(admin.ok, true);
  assert.match(workerSrc, /assertSafeSelfPrivilegeEdit\(auth\.user, id, payload, existing\)/);
  assert.match(adminSrc, /You cannot change your own role or permissions|lockOwnPrivileges|editingSelf && !isSuperAdmin/);
});

test('Phase 0 follow-up inactive built-in form pages render Coming Soon, not the form', () => {
  const slugs = ['in-kind', 'letterman-jacket', 'become-a-sponsor', 'contact', 'directors', 'boosters', 'fundraising'];
  for (const slug of slugs) {
    const page = {
      slug,
      title: slug,
      active: 0,
      body_html: '<section><form action="/api/contact"><p>LIVE FORM</p><button>Send</button></form></section>',
    };
    const html = renderPageBody(page, [], [], [], { logo_url: '/assets/efhs-logo.png' });
    assert.match(html, /Coming soon/i, slug);
    assert.doesNotMatch(html, /LIVE FORM/, slug);
    assert.doesNotMatch(html, /<form/i, slug);
  }
  assert.match(workerSrc, /if \(!isPublicCmsPageActive\(page\)\)/);
});

test('Phase 0 users permission can only grant held flags and never Users', () => {
  const usersOnly = { role: 'editor', permissions: ['users'] };
  const usersAndMore = { role: 'editor', permissions: ['users', 'events', 'page:home', 'treasurer'] };
  const superAdmin = { role: 'admin', permissions: [] };

  assert.equal(assertSafeUserPrivilegeGrant(usersOnly, {
    role: 'editor',
    permissions: ['users', 'pages', 'president', 'treasurer', 'events'],
  }).ok, false);
  assert.equal(assertSafeUserPrivilegeGrant(usersAndMore, {
    role: 'editor',
    permissions: ['users'],
  }).ok, false);
  assert.equal(assertSafeUserPrivilegeGrant(usersAndMore, {
    role: 'editor',
    permissions: ['events', 'page:home'],
  }).ok, true);
  assert.equal(assertSafeUserPrivilegeGrant(usersAndMore, {
    role: 'editor',
    permissions: ['events', 'pages'],
  }).ok, false);
  assert.equal(assertSafeUserPrivilegeGrant(superAdmin, {
    role: 'editor',
    permissions: ['users', 'pages'],
  }).ok, true);

  assert.deepEqual(
    sanitizeAssignablePermissions(usersAndMore, ['users', 'events', 'pages', 'all', 'treasurer']),
    ['events', 'treasurer'],
  );
  assert.deepEqual(sanitizeAssignablePermissions(usersOnly, ['users', 'events']), []);
});

test('Phase 0 inactive in-kind and letterman submit endpoints follow Coming Soon', () => {
  assert.deepEqual(publicFormSubmitGate({ slug: 'in-kind', active: 0 }), {
    ok: false,
    status: 403,
    detail: 'Coming soon',
  });
  assert.deepEqual(publicFormSubmitGate({ slug: 'letterman-jacket', active: 0 }), {
    ok: false,
    status: 403,
    detail: 'Coming soon',
  });
  assert.deepEqual(publicFormSubmitGate(null), {
    ok: false,
    status: 403,
    detail: 'Coming soon',
  });
  assert.equal(publicFormSubmitGate({ slug: 'in-kind', active: 1 }).ok, true);
  assert.match(workerSrc, /rejectInactivePublicFormPage\(env, 'in-kind'\)/);
  assert.match(workerSrc, /rejectInactivePublicFormPage\(env, 'contact'\)/);
  assert.match(workerSrc, /rejectInactivePublicFormPage\(env, 'fundraising'\)/);
  assert.match(workerSrc, /rejectInactivePublicFormPage\(env, 'boosters'\)/);
  assert.match(workerSrc, /rejectInactivePublicFormPage\(env, 'become-a-sponsor'\)/);
  assert.match(workerSrc, /formSlug === 'letterman-jacket' \|\| formSlug === 'in-kind'/);
});

test('Phase 0 sanitizer keeps SVG, relative URLs, fieldsets, visual CSS, and stays idempotent', () => {
  const svg = sanitizeHomeAllowlistHtml(
    '<a class="btn" href="/join.html"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" onload="alert(1)"><path d="M12 21s-7"/><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject><use href="#ok"></use><use href="https://evil.example/x"></use></svg></a>',
  );
  assert.match(svg, /<svg class="ic" viewbox="0 0 24 24" aria-hidden="true">/);
  assert.match(svg, /<path d="M12 21s-7">/);
  assert.match(svg, /<use href="#ok">/);
  assert.doesNotMatch(svg, /onload|foreignObject|iframe|evil\.example|javascript/i);

  const urls = sanitizeCmsPageHtml(
    '<a href="contact.html">C</a><a href="./x">D</a><a href="../x">E</a><img src="assets/x.png" alt="A &amp; B"><a href="javascript:alert(1)">bad</a><img src="data:text/html,x">',
  );
  assert.match(urls, /href="contact.html"/);
  assert.match(urls, /href="\.\/x"/);
  assert.match(urls, /href="\.\.\/x"/);
  assert.match(urls, /src="assets\/x.png"/);
  assert.match(urls, /alt="A &amp; B"/);
  assert.doesNotMatch(urls, /javascript|data:text/);
  assert.equal(sanitizeCmsPageHtml(urls), urls);
  assert.doesNotMatch(urls, /&amp;amp;/);

  const fields = sanitizeCmsPageHtml(
    '<form action="/api/letterman-jacket"><fieldset data-x class="full"><legend>Size</legend><p>M</p></fieldset></form>',
  );
  assert.match(fields, /<fieldset data-x class="full">/);
  assert.match(fields, /<legend>Size<\/legend>/);
  assert.doesNotMatch(fields, /data-x="data-x"/);

  const visual = sanitizeCmsPageHtml(
    '<style data-visual-css>@media (max-width: 390px){#ih1{width:238px;height:80px}} #idesktop{max-width:720px;width:100%}</style><h1 id="ih1">Join</h1>',
  );
  assert.match(visual, /<style data-visual-css>/);
  assert.match(visual, /@media \(max-width: 390px\)/);
  assert.match(visual, /#ih1\{/);
  assert.match(visual, /#idesktop\{/);
  assert.doesNotMatch(visual, /width: 238px; height: 80px/);
});

test('Phase 0 sanitizer round-trips every current DEV CMS page body', () => {
  const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/dev-cms-page-bodies.json'), 'utf8'));
  const slugs = [
    'become-a-sponsor', 'boosters', 'calendar', 'coming-soon', 'contact', 'directors',
    'ensembles', 'fundraising', 'gallery', 'home', 'in-kind', 'join', 'letterman-jacket',
    'sponsors', 'student-resources', 'volunteer',
  ];
  assert.deepEqual(Object.keys(fixture).sort(), [...slugs].sort());

  for (const slug of slugs) {
    const raw = String(fixture[slug].body_html || '');
    const once = slug === 'home' ? sanitizeHomeBodyHtml(raw) : sanitizeCmsPageHtml(raw);
    const twice = slug === 'home' ? sanitizeHomeBodyHtml(once) : sanitizeCmsPageHtml(once);
    assert.equal(once, twice, `${slug} is not idempotent`);
    assert.doesNotMatch(once, /&amp;amp;/, `${slug} double-encoded &amp;`);

    const rawSvgs = (raw.match(/<svg\b/gi) || []).length;
    const cleanSvgs = (once.match(/<svg\b/gi) || []).length;
    assert.equal(cleanSvgs, rawSvgs, `${slug} lost SVG icons (${rawSvgs} -> ${cleanSvgs})`);

    const rawFields = (raw.match(/<fieldset\b/gi) || []).length;
    const cleanFields = (once.match(/<fieldset\b/gi) || []).length;
    assert.equal(cleanFields, rawFields, `${slug} lost fieldsets (${rawFields} -> ${cleanFields})`);
  }

  const home = sanitizeHomeBodyHtml(fixture.home.body_html);
  assert.equal((home.match(/<svg\b/gi) || []).length, 17);
  assert.match(home, /Support the Band/);
  assert.match(home, /Join the Band/);
  assert.equal((home.match(/--img:\s*url\('/g) || []).length, 5);
  assert.match(home, /role="img"/);
  assert.match(home, /aria-label="The Blue Regiment on the field at a home game performance"/);

  const letterman = sanitizeCmsPageHtml(fixture['letterman-jacket'].body_html);
  assert.equal((letterman.match(/<fieldset\b/gi) || []).length, 2);
  assert.match(letterman, /<legend>/);

  const joinSample = sanitizeCmsPageHtml(
    `${fixture.join.body_html}<style data-visual-css>@media (max-width: 390px){#ih1{width:238px}}</style>`,
  );
  assert.match(joinSample, /<style data-visual-css>/);
  assert.match(joinSample, /#ih1\{/);
});

test('Phase 0 old Pages editor cannot save visual-managed Join', () => {
  assert.match(workerSrc, /isVisualPilotSlug\(existing\.slug\)/);
  assert.match(workerSrc, /Join the Band is edited in the visual editor/);
  assert.match(workerSrc, /function isVisualPilotSlug|isVisualPilotSlug,/);
  assert.match(adminSrc, /original === 'join' \|\| payload\.slug === 'join'/);
  assert.match(adminSrc, /Open the Join visual editor/);
});

const SVG_STYLE_XSS = '<svg><style>color: red<img src=x onerror=alert(1)></style></svg>';

async function renderedSvgStyleFiresAlert(html) {
  try {
    const { JSDOM } = await import('jsdom');
    let fired = false;
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
      runScripts: 'dangerously',
      beforeParse(window) {
        window.alert = () => { fired = true; };
      },
    });
    const imgs = [...dom.window.document.querySelectorAll('img[onerror], img[src="x"]')];
    return fired || imgs.length > 0;
  } catch {
    return null;
  }
}

test('Phase 0 sanitizer drops SVG style foreign-content XSS and unsafe urls', async () => {
  const clean = sanitizeCmsPageHtml(`<section>${SVG_STYLE_XSS}<p>Safe</p></section>`);
  assert.match(clean, /<p>Safe<\/p>/);
  assert.doesNotMatch(clean, /<style/i);
  assert.doesNotMatch(clean, /onerror/i);
  assert.doesNotMatch(clean, /alert\(1\)/);
  const home = sanitizeHomeBodyHtml(`<section class="hero">${SVG_STYLE_XSS}<h1>Home</h1></section>`);
  assert.match(home, /<h1>Home<\/h1>/);
  assert.doesNotMatch(home, /<style/i);
  assert.doesNotMatch(home, /onerror|alert\(1\)/);

  const painted = await renderedSvgStyleFiresAlert(clean);
  if (painted != null) assert.equal(painted, false);

  const rawXss = await renderedSvgStyleFiresAlert(SVG_STYLE_XSS);
  if (rawXss != null) assert.equal(rawXss, true);

  const svgPaint = sanitizeCmsPageHtml(
    '<svg><path fill="url(http://evil.example/x)" stroke="url(https://evil.example/y)"></path><path fill="url(#ok)" stroke="red"></path></svg>',
  );
  assert.match(svgPaint, /fill="url\(#ok\)"/);
  assert.match(svgPaint, /stroke="red"/);
  assert.doesNotMatch(svgPaint, /evil\.example/);

  const actions = sanitizeCmsPageHtml(
    '<form action="//evil.example/steal"><button>A</button></form><form action="/\\evil"><button>B</button></form><form action="/api/contact"><button>C</button></form>',
  );
  assert.doesNotMatch(actions, /evil/);
  assert.doesNotMatch(actions, /action="\/\//);
  assert.doesNotMatch(actions, /action="\/\\/);
  assert.match(actions, /<form action="\/api\/contact">/);

  const images = sanitizeCmsPageHtml(
    '<div style="background-image:image-set(\'http://evil.example/a.jpg\')"></div><div style="background-image:url(\'//evil.example/b.jpg\')"></div><div style="background-image:url(\'/\\evil\')"></div><div style="background-image:url(\'/assets/home/x.jpg\')"></div>',
  );
  assert.doesNotMatch(images, /image-set/i);
  assert.doesNotMatch(images, /evil/);
  assert.match(images, /background-image: url\('\/assets\/home\/x.jpg'\)/);

  const homeKeep = sanitizeHomeBodyHtml(
    '<div class="hero-photo" role="img" aria-label="Band on the field"></div><article style="--img:url(\'/assets/home/home2-13.jpg\')"></article>',
  );
  assert.match(homeKeep, /role="img"/);
  assert.match(homeKeep, /aria-label="Band on the field"/);
  assert.match(homeKeep, /--img: url\('\/assets\/home\/home2-13.jpg'\)/);
});

function pageRow(slug, { active = 1, id = 10, body_html = '<p>Hi</p>' } = {}) {
  return {
    id,
    slug,
    path: slug === 'home' ? '/' : `/${slug}.html`,
    title: slug,
    body_html,
    nav_order: 10,
    is_home: slug === 'home' ? 1 : 0,
    active,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

function createWorkerTestEnv({
  user = {
    id: 1,
    username: 'admin@efhsband.org',
    display_name: 'Admin',
    password_hash: 'x',
    role: 'admin',
    permissions: '[]',
    active: 1,
    last_login_at: null,
  },
  pages = {},
} = {}) {
  const users = new Map([[Number(user.id), { ...user }]]);
  const pageStore = new Map(Object.entries(pages));
  return {
    EFBAND_SECRET: 'test-session-secret',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          binds: [],
          bind(...args) {
            this.binds = args;
            return this;
          },
          async first() {
            if (q.includes('FROM site_content WHERE key')) {
              return { value: DB_SCHEMA_VERSION };
            }
            if (q.includes('FROM users WHERE id')) {
              return users.get(Number(this.binds[0])) || null;
            }
            if (q.includes('FROM cms_pages WHERE slug')) {
              return pageStore.get(String(this.binds[0])) || null;
            }
            return null;
          },
          async run() {
            if (q.startsWith('UPDATE cms_pages')) {
              const [slug, path, title, body, nav, isHome, active, id] = this.binds;
              const current = [...pageStore.values()].find((row) => Number(row.id) === Number(id));
              if (current) {
                Object.assign(current, {
                  slug, path, title, body_html: body, nav_order: nav, is_home: isHome, active,
                });
                pageStore.set(slug, current);
              }
            }
            if (q.startsWith('UPDATE users SET')) {
              const [username, displayName, role, permissions, active, id] = this.binds;
              const row = users.get(Number(id));
              if (row) {
                Object.assign(row, {
                  username,
                  display_name: displayName,
                  role,
                  permissions,
                  active,
                });
              }
            }
            return { meta: { last_row_id: 1 } };
          },
          async all() {
            return { results: [] };
          },
        };
      },
      async batch() {
        return [];
      },
    },
    ASSETS: {
      async fetch() {
        return new Response('missing', { status: 404 });
      },
    },
  };
}

test('Pages API fetch handler blocks Join and saves a normal page', async () => {
  resetDbInitCache();
  const env = createWorkerTestEnv({
    pages: {
      join: pageRow('join', { id: 2, body_html: '<p>Join</p>' }),
      contact: pageRow('contact', { id: 3, body_html: '<p>Contact</p>' }),
    },
  });
  const cookie = `efband_session=${await makeSession({ id: 1, username: 'admin@efhsband.org' }, env)}`;
  const joinRes = await worker.fetch(new Request('https://efhsband.org/api/admin/pages/join', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Join the Band', body_html: '<p>Hacked</p>' }),
  }), env, {});
  assert.equal(joinRes.status, 409);
  const joinBody = await joinRes.json();
  assert.match(String(joinBody.detail || ''), /visual editor/i);

  const saveRes = await worker.fetch(new Request('https://efhsband.org/api/admin/pages/contact', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Contact',
      slug: 'contact',
      path: '/contact.html',
      body_html: '<section><p>Updated contact</p></section>',
      active: true,
    }),
  }), env, {});
  assert.equal(saveRes.status, 200, await saveRes.clone().text());
  const saved = await saveRes.json();
  assert.equal(saved.slug, 'contact');
  assert.match(String(saved.body_html || ''), /Updated contact/);
});

test('inactive CMS pages reject matching public form POSTs with Coming soon', async () => {
  resetDbInitCache();
  const env = createWorkerTestEnv({
    pages: {
      contact: pageRow('contact', { active: 0, id: 4 }),
      fundraising: pageRow('fundraising', { active: 0, id: 5 }),
      boosters: pageRow('boosters', { active: 0, id: 6 }),
      'become-a-sponsor': pageRow('become-a-sponsor', { active: 0, id: 7 }),
      volunteer: pageRow('volunteer', { active: 0, id: 8 }),
    },
  });
  const cases = [
    ['/api/contact', { name: 'A', email: 'a@b.co', message: 'Hi', topic_id: 1 }],
    ['/api/donations', { donor_name: 'A', amount_cents: 1000 }],
    ['/api/dues', { student_name: 'A', email: 'a@b.co', amount_cents: 1000 }],
    ['/api/sponsor-applications', { business_name: 'A', address: '1 Main', phone: '555', email: 'a@b.co', tier: 'bronze', amount_cents: 25000 }],
    ['/api/forms/volunteer', { email: 'a@b.co' }],
  ];
  for (const [path, body] of cases) {
    const res = await worker.fetch(new Request(`https://efhsband.org${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), env, {});
    assert.equal(res.status, 403, path);
    const payload = await res.json();
    assert.equal(payload.detail, 'Coming soon', path);
  }
});

test('Users-permission holder can save their own name and password through the Users API', async () => {
  resetDbInitCache();
  const user = {
    id: 7,
    username: 'editor@efhsband.org',
    display_name: 'Editor',
    password_hash: 'x',
    role: 'editor',
    permissions: JSON.stringify(['users']),
    active: 1,
    last_login_at: null,
  };
  const env = createWorkerTestEnv({ user });
  const cookie = `efband_session=${await makeSession({ id: 7, username: user.username }, env)}`;
  const res = await worker.fetch(new Request('https://efhsband.org/api/admin/users/7', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'editor@efhsband.org',
      display_name: 'Editor Updated',
      password: 'brand-new-pass',
      role: 'editor',
      permissions: ['users'],
      active: true,
    }),
  }), env, {});
  assert.equal(res.status, 200, await res.clone().text());
  const saved = await res.json();
  assert.equal(saved.display_name, 'Editor Updated');
  assert.deepEqual(saved.permissions, ['users']);

  const blocked = await worker.fetch(new Request('https://efhsband.org/api/admin/users/7', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'editor@efhsband.org',
      display_name: 'Editor Updated',
      role: 'admin',
      permissions: ['users', 'pages'],
      active: true,
    }),
  }), env, {});
  assert.equal(blocked.status, 403);
});
