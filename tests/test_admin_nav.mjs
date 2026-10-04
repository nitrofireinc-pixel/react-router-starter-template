import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { renderVisualEditorHtml } from '../worker/src/visual-page-editor.mjs';
import {
  renderAdminChromeBar,
  renderAdminSidebarBackdrop,
  renderAdminSidebarHtml,
} from '../worker/src/admin-chrome.mjs';
import { ASSET_VERSION } from '../worker/src/worker.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('collapsible admin nav chrome is shared by CMS and visual editor', () => {
  const chrome = renderAdminChromeBar();
  const sidebar = renderAdminSidebarHtml('test');
  assert.match(chrome, /class="admin-nav-toggle"/);
  assert.match(chrome, /aria-controls="admin-sidebar"/);
  assert.match(chrome, /admin-nav-toggle-label">Menu</);
  assert.match(renderAdminSidebarBackdrop(), /data-admin-nav-backdrop/);
  assert.match(sidebar, /id="admin-sidebar"/);
  assert.match(sidebar, /data-admin-nav-close/);
  assert.match(sidebar, /data-tab="dashboard"/);
  assert.match(sidebar, /data-tab="security-log"/);

  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /renderAdminChromeBar\(\)/);
  assert.match(workerSrc, /renderAdminSidebarHtml\(ASSET_VERSION\)/);
  assert.match(workerSrc, /admin-nav\.css\?v=\$\{ASSET_VERSION\}/);
  assert.match(workerSrc, /admin-nav\.js\?v=\$\{ASSET_VERSION\}/);

  const editor = renderVisualEditorHtml(ASSET_VERSION);
  assert.match(editor, /class="admin-nav-toggle"/);
  assert.match(editor, /id="admin-sidebar"/);
  assert.match(editor, /class="visual-editor-main"/);
  assert.match(editor, /admin-nav\.css\?v=/);
  assert.match(editor, /admin-nav\.js\?v=/);
  assert.match(editor, /data-visual-banner/);
});

test('admin nav script stores desktop preference and traps overlay focus', () => {
  const navJs = readFileSync(join(root, 'admin-nav.js'), 'utf8');
  assert.match(navJs, /efhsAdminNavOpen/);
  assert.match(navJs, /max-width: 767px/);
  assert.match(navJs, /max-width: 1023px/);
  assert.match(navJs, /Escape/);
  assert.match(navJs, /efhs-admin-nav-change/);
  assert.match(navJs, /TRANSITION_MS = 200/);
  assert.match(navJs, /aria-expanded/);
  assert.match(navJs, /aria-controls/);
  assert.match(navJs, /focusable/);
  assert.match(navJs, /scheduleDrawerFocus/);
  assert.match(navJs, /transitionend/);
  assert.match(navJs, /TRANSITION_MS \+ 80/);
  assert.doesNotMatch(navJs, /requestAnimationFrame\(\(\) => first\?\.focus/);
  const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
  assert.match(adminJs, /efhsAdminNav\?\.isOverlay/);
  assert.match(adminJs, /requestedTab/);
  assert.match(adminJs, /get\('tab'\)/);
  const visualJs = readFileSync(join(root, 'admin-visual.js'), 'utf8');
  assert.match(visualJs, /efhs-admin-nav-change/);
  assert.match(visualJs, /relayoutVisualCanvas|editor\.refresh/);
});

test('admin nav CSS pushes at 1024 and overlays below, with reduced motion', () => {
  const css = readFileSync(join(root, 'admin-nav.css'), 'utf8');
  assert.match(css, /--admin-nav-duration:\.2s/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /@media \(max-width:1023px\)/);
  assert.match(css, /admin-nav-scroll-lock\{overflow:hidden\}/);
  assert.match(css, /--admin-nav-col:0px/);
  assert.match(css, /admin-sidebar-backdrop/);
  assert.doesNotMatch(css, /transition:[^;]*visibility var\(--admin-nav-duration\)/);
  const overlayBlock = css.slice(css.indexOf('@media (max-width:1023px)'));
  assert.match(overlayBlock, /html\.admin-nav-open[\s\S]*?--admin-nav-col:0px/);
  const syncSrc = readFileSync(join(root, 'worker/scripts/sync-public.mjs'), 'utf8');
  assert.match(syncSrc, /'admin-nav\.js'/);
  assert.match(syncSrc, /'admin-nav\.css'/);
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  assert.doesNotMatch(styles, /@media\(max-width:980px\)\{[\s\S]*?\.admin-sidebar\{display:none!important\}/);
  assert.match(styles, /@media\(min-width:1024px\) and \(max-width:1280px\)\{\.image-admin-shell\{grid-template-columns:var\(--admin-nav-col/);
  assert.doesNotMatch(styles, /@media\(max-width:1280px\)\{\.image-admin-shell\{grid-template-columns:var\(--admin-nav-col/);
});
