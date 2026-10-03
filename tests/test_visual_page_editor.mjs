import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VISUAL_EDITOR_PATH,
  VISUAL_PILOT_SLUG,
  VISUAL_VERSION_LIMIT,
  canEditVisualPilot,
  defaultJoinVisualHtml,
  extractEditableJoinHtml,
  formatVisualHistoryTime,
  isSafeVisualHref,
  isSafeVisualImageSrc,
  isVisualPilotSlug,
  normalizeVisualSavePayload,
  renderVisualEditorHtml,
  sanitizeVisualPageHtml,
  trimVisualVersions,
} from '../worker/src/visual-page-editor.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('visual editor pilot is Join the Band only', () => {
  assert.equal(VISUAL_PILOT_SLUG, 'join');
  assert.equal(VISUAL_EDITOR_PATH, '/admin/visual/join');
  assert.equal(isVisualPilotSlug('join'), true);
  assert.equal(isVisualPilotSlug('home'), false);
  assert.equal(isVisualPilotSlug('fundraising'), false);
  assert.equal(canEditVisualPilot({ id: 1 }, (user, slug) => slug === 'join'), true);
  assert.equal(canEditVisualPilot(null, () => true), false);
  assert.equal(canEditVisualPilot({ id: 1 }, () => false), false);
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

test('visual sanitizer keeps on-page resize and move styles', () => {
  const dirty = `<section class="page-hero" style="width: 420px; height: 180px; margin-top: 12px; position: relative; top: 8px; transform: translate(10px, 4px); background: url(javascript:alert(1))"><h1 style="max-width: 80%">Join</h1><img src="/assets/efhs-logo.png" alt="Logo" class="gjs-selected" style="width: 160px; object-fit: contain"></section>`;
  const clean = sanitizeVisualPageHtml(dirty);
  assert.match(clean, /max-width: 420px/);
  assert.match(clean, /width: 100%/);
  assert.doesNotMatch(clean, /(?:^|[^-])width: 420px/);
  assert.match(clean, /height: 180px/);
  assert.match(clean, /margin-top: 12px/);
  assert.match(clean, /transform: translate\(10px, 4px\)/);
  assert.match(clean, /max-width: 160px/);
  assert.doesNotMatch(clean, /javascript/i);
  assert.doesNotMatch(clean, /gjs-selected/);
});

test('visual save payload requires sanitized HTML and drops page chrome', () => {
  const bad = normalizeVisualSavePayload({ html: '<script>x</script>' });
  assert.equal(bad.ok, false);
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
  const rows = Array.from({ length: 12 }, (_, index) => ({ id: 12 - index }));
  const trimmed = trimVisualVersions(rows, VISUAL_VERSION_LIMIT);
  assert.equal(trimmed.keep.length, 8);
  assert.deepEqual(trimmed.dropIds, [4, 3, 2, 1]);
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
  assert.match(workerSrc, /\/api\/admin\/visual-pages\/join/);
  assert.match(workerSrc, /handleVisualEditorPage/);
  assert.match(workerSrc, /VISUAL_EDITOR_PATH/);
  assert.match(workerSrc, /canEditVisualPilot\(auth\.user, canEditPage\)/);
  assert.match(workerSrc, /canEditPage\(auth\.user, 'join'\)/);
  assert.match(workerSrc, /renderVisualEditorHtml/);
  assert.doesNotMatch(workerSrc, /visual-pages\/home/);
  assert.match(adminJs, /\/admin\/visual\/join/);
  assert.match(editorJs, /grapesjs\.init/);
  assert.match(editorJs, /panels:\s*\{\s*defaults:\s*\[\]/);
  assert.match(editorJs, /setDevice/);
  assert.match(editorJs, /UndoManager/);
  assert.match(editorJs, /\/join\.html/);
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
  assert.match(editorCss, /visual-edit-banner/);
  assert.match(editorCss, /\.gjs-pn-panel/);
  assert.match(editorCss, /min-width:max-content/);
  assert.match(page, /This page is being edited/);
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

test('published Join content stays on the existing public page read', () => {
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const visualSrc = readFileSync(join(root, 'worker/src/visual-page-editor.mjs'), 'utf8');
  assert.match(visualSrc, /UPDATE cms_pages SET body_html/);
  assert.match(workerSrc, /key: `page-path:\$\{path\}`/);
  assert.doesNotMatch(workerSrc, /FROM visual_pages/);
  assert.doesNotMatch(workerSrc, /visual_page_versions/);
});
