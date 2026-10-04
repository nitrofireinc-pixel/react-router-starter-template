import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadVisualPageState,
  resetVisualPagesSchemaCache,
  saveVisualPage,
  VISUAL_EDITOR_NOT_YET_SLUGS,
  VISUAL_EDITOR_PATH,
  VISUAL_EDITOR_PATH_PREFIX,
  VISUAL_PILOT_SLUG,
  VISUAL_VERSION_LIMIT,
  canEditVisualPage,
  canEditVisualPilot,
  defaultJoinVisualHtml,
  extractEditableJoinHtml,
  formatNarrowOverflowWarning,
  formatVisualHistoryTime,
  importCmsBodyToVisual,
  isSafeVisualHref,
  isSafeVisualImageSrc,
  isVisualEditorSlug,
  isVisualPilotSlug,
  isVisualPublishedRow,
  normalizeVisualSavePayload,
  overflowElementLabel,
  pageHasVisualPublish,
  renderVisualEditorHtml,
  sanitizeVisualCss,
  sanitizeVisualPageHtml,
  wrapLiveDataAsLocked,
  trimVisualVersions,
} from '../worker/src/visual-page-editor.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('visual editor is generic per slug and keeps Home not yet', () => {
  assert.equal(VISUAL_PILOT_SLUG, 'join');
  assert.equal(VISUAL_EDITOR_PATH, '/admin/visual/join');
  assert.equal(VISUAL_EDITOR_PATH_PREFIX, '/admin/visual');
  assert.deepEqual([...VISUAL_EDITOR_NOT_YET_SLUGS], ['home']);
  assert.equal(isVisualEditorSlug('join'), true);
  assert.equal(isVisualEditorSlug('fundraising'), true);
  assert.equal(isVisualEditorSlug('calendar'), true);
  assert.equal(isVisualEditorSlug('home'), false);
  assert.equal(isVisualPilotSlug('home'), false);
  assert.equal(canEditVisualPage({ id: 1 }, 'join', (user, slug) => slug === 'join'), true);
  assert.equal(canEditVisualPage({ id: 1 }, 'contact', (user, slug) => slug === 'contact'), true);
  assert.equal(canEditVisualPage({ id: 1 }, 'home', () => true), false);
  assert.equal(canEditVisualPage({ id: 1 }, 'contact', (user, slug) => slug === 'join'), false);
  assert.equal(canEditVisualPilot({ id: 1 }, (user, slug) => slug === 'join'), true);
  assert.equal(canEditVisualPilot(null, () => true), false);
});

test('visual page HTML sanitizer strips scripts and unsafe sources', () => {
  const dirty = `
    <section class="page-hero" data-visual-block="hero" onclick="alert(1)">
      <h1>Join</h1>
      <p>Hello <script>alert(1)</script><a href="javascript:alert(1)">bad</a>
      <a href="/contact.html">Contact</a>
      <img src="https://evil.example/x.jpg" alt="nope">
      <img src="/uploads/flyer.jpg" alt="Flyer">
      <img src="/assets/efhs-logo.png" alt="Logo">
    </section>
    <details class="visual-accordion" open><summary>Q</summary><div>A</div></details>
  `;
  const clean = sanitizeVisualPageHtml(dirty);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /onclick/i);
  assert.doesNotMatch(clean, /javascript:/i);
  assert.doesNotMatch(clean, /evil\.example/);
  assert.match(clean, /href="\/contact.html"/);
  assert.match(clean, /src="\/uploads\/flyer.jpg"/);
  assert.match(clean, /src="\/assets\/efhs-logo.png"/);
  assert.match(clean, /<details class="visual-accordion" open>/);
  assert.match(clean, /data-visual-block="hero"/);
});

test('visual sanitizer keeps per-device CSS and element ids', () => {
  const dirty = `<style data-visual-css>@media (max-width: 390px){#ih1{width: 238px; height: 80px}} body{background:url(javascript:alert(1))}</style><h1 id="ih1" style="color: #002142">Join</h1><p>Hello</p>`;
  const clean = sanitizeVisualPageHtml(dirty);
  assert.match(clean, /<style data-visual-css>/);
  assert.match(clean, /@media \(max-width: 390px\)/);
  assert.match(clean, /#ih1\{/);
  assert.match(clean, /max-width: 238px/);
  assert.match(clean, /width: 100%/);
  assert.match(clean, /id="ih1"/);
  assert.doesNotMatch(clean, /javascript/i);
  assert.doesNotMatch(clean, /body\{/);
  const css = sanitizeVisualCss('@media (max-width: 390px){#ih1{width:238px}} #idesktop{max-width:720px;width:100%}');
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /#idesktop\{/);
});

test('visual sanitizer keeps on-page resize and move styles', () => {
  const dirty = `<section class="page-hero" style="width: 420px; height: 180px; margin-top: 12px; position: relative; top: 8px; transform: translate(10px, 4px); background: url(javascript:alert(1))"><h1 style="max-width: 80%">Join</h1><img src="/assets/efhs-logo.png" alt="Logo" class="gjs-selected" style="width: 160px; object-fit: contain"></section>`;
  const clean = sanitizeVisualPageHtml(dirty);
  assert.match(clean, /max-width: 420px/);
  assert.match(clean, /width: 100%/);
  assert.doesNotMatch(clean, /(?:^|[^-])width: 420px/);
  assert.match(clean, /height: 180px/);
  assert.match(clean, /margin-top: 12px/);
  assert.doesNotMatch(clean, /position:\s*absolute/i);
  assert.doesNotMatch(clean, /transform:/i);
  assert.match(clean, /max-width: 160px/);
  assert.doesNotMatch(clean, /javascript/i);
  assert.doesNotMatch(clean, /gjs-selected/);
});

test('visual save payload requires sanitized HTML and drops page chrome', () => {
  const bad = normalizeVisualSavePayload({ html: '<script>x</script>' });
  assert.equal(bad.ok, false);
  const empty = normalizeVisualSavePayload({ html: '<section><p><br></p></section>' });
  assert.equal(empty.ok, false);
  const ok = normalizeVisualSavePayload({ html: '<h1>Join</h1><p>Hi</p>', action: 'publish' });
  assert.equal(ok.ok, true);
  assert.equal(ok.action, 'publish');
  assert.match(ok.html, /<h1>Join<\/h1>/);
  const wrapped = normalizeVisualSavePayload({
    html: '<header class="site-header"><a href="/">Home</a></header><main id="main"><h2>Only this</h2></main><footer class="footer">Foot</footer>',
  });
  assert.equal(wrapped.ok, true);
  assert.match(wrapped.html, /<h2>Only this<\/h2>/);
  assert.doesNotMatch(wrapped.html, /site-header/);
  assert.doesNotMatch(wrapped.html, /<footer/);
});

test('history times render Eastern with a space after Draft', () => {
  const stamp = formatVisualHistoryTime('2026-10-03 13:02:18');
  assert.match(stamp, /Oct 3, 2026/);
  assert.match(stamp, /9:02\sAM/);
  assert.match(stamp, /EDT|EST/);
  assert.doesNotMatch(stamp, /13:02/);
});

test('extractEditableJoinHtml reads only main', () => {
  const html = extractEditableJoinHtml('<div class="utility">x</div><main id="main"><p>Join</p></main><footer class="footer">f</footer>');
  assert.equal(html, '<p>Join</p>');
});

test('visual versions keep the newest few', () => {
  assert.equal(VISUAL_VERSION_LIMIT, 20);
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: 25 - index }));
  const trimmed = trimVisualVersions(rows, VISUAL_VERSION_LIMIT);
  assert.equal(trimmed.keep.length, 20);
  assert.deepEqual(trimmed.dropIds, [5, 4, 3, 2, 1]);
});

test('visual CSS sanitizer drops duplicate GrapesJS body margin rules', () => {
  const once = sanitizeVisualPageHtml('<style data-visual-css>body{margin: 0}</style><h1>Join</h1><p>Hi</p>');
  const twice = sanitizeVisualPageHtml(`<style data-visual-css>body{margin: 0}</style>${once}`);
  assert.equal(twice, once);
  assert.equal((twice.match(/body\{margin: 0\}/g) || []).length, 1);
});

test('default Join starter uses site logos and no invented photos', () => {
  const html = defaultJoinVisualHtml();
  assert.match(html, /\/assets\/efhs-logo.png/);
  assert.match(html, /\/assets\/efhs-blue-regiment-mark.png/);
  assert.match(html, /Join the Band/);
  assert.match(html, /visual-accordion/);
  assert.doesNotMatch(html, /https:\/\/.*openai|generated|dall-e/i);
  assert.equal(isSafeVisualImageSrc('/assets/efhs-logo.png'), true);
  assert.equal(isSafeVisualHref('/contact.html'), true);
  assert.equal(isSafeVisualHref('javascript:alert(1)'), false);
});

test('worker wires Join visual editor behind page-edit permission', () => {
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
  const editorJs = readFileSync(join(root, 'admin-visual.js'), 'utf8');
  const editorCss = readFileSync(join(root, 'admin-visual.css'), 'utf8');
  const themeSrc = readFileSync(join(root, 'public-theme.css'), 'utf8');
  const visualSrc = readFileSync(join(root, 'worker/src/visual-page-editor.mjs'), 'utf8');
  const syncSrc = readFileSync(join(root, 'worker/scripts/sync-public.mjs'), 'utf8');
  const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  const devToml = readFileSync(join(root, 'wrangler.dev.toml'), 'utf8');
  const page = renderVisualEditorHtml('test');
  assert.match(page, /Visitors still see the published page until you publish/);
  assert.doesNotMatch(page, /Preview Worker only/);
  assert.match(editorJs, /Published to the live page\./);
  assert.match(editorJs, /Keeps the last 20 saves\./);
  assert.match(editorJs, /Publishing replaces this page's content on the live page\./);
  assert.doesNotMatch(editorJs, /Published to the preview site/);
  assert.match(workerSrc, /visual-pages/);
  assert.match(workerSrc, /VISUAL_EDITOR_PATH_PREFIX/);
  assert.match(workerSrc, /handleVisualEditorPage/);
  assert.match(workerSrc, /VISUAL_EDITOR_PATH_PREFIX/);
  assert.match(workerSrc, /canEditVisualPage\(auth\.user, slug, canEditPage\)/);
  assert.match(workerSrc, /canEditVisualPage\(user, key, canEditPage\)/);
  assert.match(workerSrc, /renderVisualEditorHtml/);
  assert.match(workerSrc, /pageHasVisualPublish/);
  assert.match(adminJs, /\/admin\/visual\//);
  assert.match(adminJs, /admin-page-settings/);
  assert.doesNotMatch(adminJs, /Join visual editor/);
  assert.match(editorJs, /versionedAsset\('\/styles\.css'\)/);
  assert.match(editorJs, /grapesjs\.init/);
  assert.match(editorJs, /panels:\s*\{\s*defaults:\s*\[\]/);
  assert.match(editorJs, /setDevice/);
  assert.match(editorJs, /UndoManager/);
  assert.match(editorJs, /UndoManager\?\.clear|UndoManager\.clear/);
  assert.match(editorJs, /hasUndo/);
  assert.match(editorJs, /canvasIsNearEmpty/);
  assert.match(editorJs, /Add some page content before saving/);
  assert.match(editorJs, /pagePath \|\| '\/join\.html'/);
  assert.match(editorJs, /exportEditableHtml/);
  assert.match(editorJs, /data-add-block/);
  assert.match(editorJs, /visual-parent/);
  assert.match(editorJs, /Select parent/);
  assert.match(editorJs, /SITE_PHOTOS/);
  assert.match(editorJs, /\/assets\/home\/mattress-flyer\.jpg/);
  assert.match(editorJs, /unsaved changes/);
  assert.match(editorJs, /visual-join-wrap/);
  assert.match(editorJs, /America\/New_York/);
  assert.match(editorJs, /makeWidthResponsive/);
  assert.match(editorJs, /writeDeviceBox/);
  assert.match(editorJs, /setIdRule/);
  assert.match(editorJs, /avoidInlineStyle:\s*true/);
  assert.match(editorJs, /widthMedia:\s*'390px'/);
  assert.match(editorJs, /widthMedia:\s*'320px'/);
  assert.match(editorJs, /type === 'start'/);
  assert.match(editorJs, /UndoManager\.skip/);
  assert.match(editorJs, /clampSelectionToolbar/);
  assert.match(editorJs, /data-visual-css/);
  assert.match(editorCss, /visual-edit-banner/);
  assert.match(editorCss, /a\.visual-banner-btn/);
  assert.match(editorCss, /font-size:13px/);
  assert.match(editorCss, /flex-wrap:wrap/);
  assert.match(editorCss, /@media \(max-width:1024px\)/);
  assert.match(editorCss, /\.gjs-pn-panel/);
  assert.match(editorCss, /min-width:36px/);
  assert.match(editorCss, /\.gjs-toolbar\{[\s\S]*?flex-wrap:nowrap/);
  assert.match(editorCss, /\.gjs-toolbar\{[\s\S]*?min-width:240px/);
  assert.match(editorCss, /max-width:min\(100%,304px\)/);
  assert.match(editorCss, /visual-phone-gate/);
  assert.match(editorCss, /@media \(max-width:767px\)/);
  assert.match(editorJs, /PHONE_EDITOR_MAX = 767/);
  assert.match(editorJs, /checkNarrowOverflow/);
  assert.match(editorJs, /Publish anyway/);
  assert.match(page, /This page is being edited/);
  assert.match(page, /Please edit pages on a computer or tablet/);
  assert.match(page, /Phones are too small for the editor/);
  assert.match(page, /View live page/);
  assert.match(page, /Back to CMS/);
  assert.match(page, /This layout is too wide for phones/);
  assert.match(page, /Publish anyway/);
  assert.match(page, /Go back/);
  assert.match(page, /Add a section/);
  assert.match(page, /data-visual-device-select/);
  assert.match(page, /data-visual-exit/);
  assert.match(themeSrc, /coming-soon-page \.hero-card/);
  assert.match(page, /type="text" name="href"/);
  assert.doesNotMatch(page, /type="url" name="href"/);
  assert.match(page, /\/vendor\/grapesjs\/grapes\.min\.js/);
  assert.match(page, /\/vendor\/grapesjs\/grapes\.min\.css/);
  assert.doesNotMatch(page, /unpkg\.com/);
  assert.doesNotMatch(visualSrc, /unpkg\.com\/grapesjs/);
  assert.match(syncSrc, /vendor\/grapesjs\/grapes\.min\.js/);
  assert.equal(existsSync(join(root, 'vendor/grapesjs/grapes.min.js')), true);
  assert.equal(existsSync(join(root, 'vendor/grapesjs/grapes.min.css')), true);
  assert.match(readFileSync(join(root, 'vendor/grapesjs/grapes.min.js'), 'utf8'), /grapesjs - 0\.21\.13/);
  assert.match(toml, /^name\s*=\s*"efhsband-live"/m);
  assert.match(toml, /efhsband-db/);
  assert.doesNotMatch(toml, /visual-pages/);
  assert.match(devToml, /^name\s*=\s*"efhsband-dev"/m);
  assert.match(devToml, /efhsband-dev-db/);
});

test('visual editor action bar uses inline SVG icons', () => {
  const visualJs = readFileSync(join(root, 'admin-visual.js'), 'utf8');
  const visualCss = readFileSync(join(root, 'admin-visual.css'), 'utf8');
  assert.match(visualJs, /class="visual-tool-icon"/);
  assert.match(visualJs, /tlb-clone', 'Copy'/);
  assert.doesNotMatch(visualJs, /⧉/);
  assert.match(visualCss, /\.visual-tool-icon/);
  assert.match(visualJs, /const minWidth = 240/);
  assert.match(visualCss, /min-width:240px/);
});

test('published visual content stays on the existing public page read', () => {
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const visualSrc = readFileSync(join(root, 'worker/src/visual-page-editor.mjs'), 'utf8');
  assert.match(visualSrc, /UPDATE cms_pages SET body_html/);
  assert.match(workerSrc, /key: `page-path:\$\{path\}`/);
  assert.doesNotMatch(workerSrc, /FROM visual_pages/);
  assert.doesNotMatch(workerSrc, /visual_page_versions/);
});

test('first-open import wraps live-data sections as locked blocks', () => {
  const html = importCmsBodyToVisual(
    '<main><h1>Contact</h1><p>Call us</p><div data-contact-form-slot><form><input name="n"><button>Send</button></form></div></main>',
    'contact',
  );
  assert.match(html, /<h1>Contact<\/h1>/);
  assert.match(html, /data-visual-locked="contact-form"/);
  assert.match(html, /<form/i);
  assert.match(html, /<input/i);
  assert.match(html, /<button/i);
  const calendar = wrapLiveDataAsLocked('<div id="caldev-app" class="caldev-app"></div>');
  assert.match(calendar, /data-visual-locked="calendar"/);
});

test('visual sanitizer keeps locked forms and still strips scripts', () => {
  const dirty = `<section><h2>Give</h2><div data-visual-locked="donate"><button type="button" data-donate-open>Donate</button><script>alert(1)</script></div></section>`;
  const clean = sanitizeVisualPageHtml(dirty);
  assert.match(clean, /data-visual-locked="donate"/);
  assert.match(clean, /<button type="button" data-donate-open>Donate<\/button>/);
  assert.doesNotMatch(clean, /<script/i);
});

test('visual publish guard treats published_at as locked', () => {
  assert.equal(isVisualPublishedRow({ published_at: '2026-10-04T12:00:00.000Z' }), true);
  assert.equal(isVisualPublishedRow({ published_at: null }), false);
  assert.equal(isVisualPublishedRow({}), false);
});

test('narrow overflow warning names the wide element', () => {
  assert.equal(overflowElementLabel({ heading: 'Hero title', tag: 'section' }), 'Hero title');
  const message = formatNarrowOverflowWarning([
    { heading: 'Hero title', width: 820, viewportWidth: 390 },
  ]);
  assert.match(message, /At 390px/);
  assert.match(message, /Hero title/);
  assert.match(message, /820px/);
});

test('pageHasVisualPublish is a no-write lookup', async () => {
  const sql = [];
  const env = {
    DB: {
      prepare(text) {
        sql.push(String(text));
        return {
          bind() { return this; },
          async first() { return { published_at: '2026-10-04T00:00:00.000Z' }; },
          async run() { return { success: true }; },
        };
      },
    },
  };
  assert.equal(await pageHasVisualPublish(env, 'boosters'), true);
  assert.equal(sql.some((item) => /UPDATE|DELETE|INSERT/i.test(item) && !/CREATE TABLE/i.test(item)), false);
});

test('visual editor load, save, and publish stay under 50 D1 queries', async () => {
  let queries = 0;
  const versions = [];
  let visual = null;
  const cms = { slug: 'join', title: 'Join the Band', path: '/join.html', body_html: '<h1>Join</h1><p>Hi</p>' };
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
            return null;
          },
          async all() {
            queries += 1;
            return { results: versions.slice().reverse() };
          },
          async run() {
            queries += 1;
            if (q.includes('INSERT INTO visual_pages')) {
              visual = { slug: this.binds[0], draft_html: this.binds[1], published_html: this.binds[2], published_at: this.binds[3] };
            }
            if (q.includes('UPDATE visual_pages')) {
              visual = { ...(visual || {}), draft_html: this.binds[0], published_at: visual?.published_at || 'now' };
            }
            if (q.includes('INSERT INTO visual_page_versions')) {
              versions.push({ id: versions.length + 1, slug: this.binds[0], kind: this.binds[1], html: this.binds[2] });
            }
            if (q.includes('UPDATE cms_pages SET body_html')) {
              cms.body_html = this.binds[0];
            }
            return { success: true };
          },
        };
      },
    },
  };
  resetVisualPagesSchemaCache();
  const opened = await loadVisualPageState(env, 'join');
  const openQueries = queries;
  assert.ok(opened.draft_html.includes('Join'));
  assert.ok(openQueries <= 50, `open used ${openQueries}`);
  queries = 0;
  resetVisualPagesSchemaCache();
  await saveVisualPage(env, { slug: 'join', html: '<h1>Join</h1><p>Draft</p>', action: 'draft', user: { id: 1, display_name: 'Admin' } });
  const saveQueries = queries;
  assert.ok(saveQueries <= 50, `save used ${saveQueries}`);
  queries = 0;
  resetVisualPagesSchemaCache();
  const published = await saveVisualPage(env, { slug: 'join', html: '<h1>Join</h1><p>Live</p>', action: 'publish', user: { id: 1, display_name: 'Admin' } });
  const publishQueries = queries;
  assert.ok(publishQueries <= 50, `publish used ${publishQueries}`);
  assert.match(published.draft_html, /Live/);
  console.log('visual_editor_d1', { openQueries, saveQueries, publishQueries });
});
