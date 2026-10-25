import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { renderFundraiserCardsAdminHtml } from '../worker/src/fundraiser-cards.mjs';
import { renderVisualEditorHtml } from '../worker/src/visual-page-editor.mjs';
import {
  ADMIN_NAV_REV,
  adminNavAssetVersion,
  buildAdminNavModel,
  renderAdminChromeBar,
  renderAdminSidebarBackdrop,
  renderAdminSidebarHtml,
} from '../worker/src/admin-chrome.mjs';
import { ASSET_VERSION, ADMIN_NAV_VERSION, adminSidebarAllows } from '../worker/src/worker.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jamie = { id: 5, username: 'jamie', display_name: 'Jamie', role: 'editor', permissions: JSON.stringify(['calendar']) };
const admin = { id: 1, username: 'agent@efhsband.org', display_name: 'Trevor', role: 'admin', permissions: '[]' };
const navFor = (user, extra = {}) => ({ user, allow: (tab) => adminSidebarAllows(user, tab), ...extra });

test('14c flat sidebar: no folding groups, plain section labels, Ctrl K search on top', () => {
  const chrome = renderAdminChromeBar({ assetVersion: 'test', user: admin });
  const sidebar = renderAdminSidebarHtml('test', navFor(admin, { current: { route: 'admin' } }));
  assert.match(chrome, /class="admin-nav-toggle sn-menu-btn"/);
  assert.match(chrome, /aria-controls="admin-sidebar"/);
  assert.match(chrome, /admin-nav-toggle-label">Menu</);
  assert.match(chrome, /data-sn-launch/);
  assert.match(renderAdminSidebarBackdrop(), /data-admin-nav-backdrop/);
  assert.match(sidebar, /id="admin-sidebar"/);
  assert.match(sidebar, /data-admin-nav-v2/);
  assert.match(sidebar, /data-admin-nav-close/);
  assert.match(sidebar, /Site Studio<\/b><small>EFHS BAND</);
  assert.match(sidebar, /efhs-admin-mark\.png[\s\S]*efhs-blue-regiment-mark\.png/);
  assert.match(sidebar, /placeholder="Find a page…"/);
  assert.match(sidebar, /Ctrl K/);
  // no accordions / chevrons
  assert.doesNotMatch(sidebar, /data-nav-group|admin-menu-parent|admin-menu-sub|aria-expanded/);
  const heads = [...sidebar.matchAll(/<h2 class="sn-head[^>]*>([^<]+)/g)].map((m) => m[1].trim().replace(/&amp;/g, '&'));
  assert.deepEqual(heads, ['Website', 'Calendar', 'Money', 'Sponsors', 'Boosters', 'People', 'Photos & Social', 'Forms & Mail', 'Admin']);
  assert.match(sidebar, /Admin <span class="sn-admin-only">ADMIN ONLY<\/span>/);
  // current item
  assert.match(sidebar, /data-nav-item="dashboard"[^>]*aria-current="page"/);
  assert.equal((sidebar.match(/aria-current="page"/g) || []).length, 1);
  // keep data-nav-item / data-nav-href hooks
  assert.match(sidebar, /data-nav-item="fundraiser-cards"[^>]*data-nav-href="\/admin\/fundraiser-cards"/);
  assert.match(sidebar, /data-tab="security-log"/);
  // per-page shortcuts are gone from the menu
  assert.doesNotMatch(sidebar, /admin-page-shortcuts|admin-page-edit/);
});

test('admin-only items carry the red ADMIN pill', () => {
  const model = buildAdminNavModel(navFor(admin));
  const tagged = model.items.filter((item) => item.admin && !item.hidden).map((item) => item.key);
  assert.deepEqual(tagged, ['themes', 'users', 'site', 'security-log']);
  const sidebar = renderAdminSidebarHtml('test', navFor(admin));
  for (const key of tagged) {
    assert.match(sidebar, new RegExp(`data-nav-item="${key}"[^>]*>[^]*?sn-admin-pill`));
  }
});

test('Jamie (calendar only) sees Home, Calendar and Minutes only', () => {
  const sidebar = renderAdminSidebarHtml('test', navFor(jamie));
  const items = [...sidebar.matchAll(/data-nav-item="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(items, ['dashboard', 'events-manager', 'caldev', 'banners', 'minutes']);
  const heads = [...sidebar.matchAll(/<h2 class="sn-head[^>]*>([^<]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(heads, ['Calendar']);
  // Boosters has one allowed item -> direct link, no heading
  assert.match(sidebar, /sn-section-direct" data-nav-section="boosters"/);
  assert.match(sidebar, /data-nav-item="minutes"[^>]*data-nav-section-label="Boosters"/);
  assert.doesNotMatch(sidebar, /sn-admin-pill|ADMIN ONLY/);
});

test('assets use an admin-only cache key; public ASSET_VERSION untouched', () => {
  assert.equal(ADMIN_NAV_VERSION, `${ASSET_VERSION}-${ADMIN_NAV_REV}`);
  assert.equal(adminNavAssetVersion('x'), `x-${ADMIN_NAV_REV}`);
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /admin-nav\.css\?v=\$\{ADMIN_NAV_VERSION\}/);
  assert.match(workerSrc, /admin-nav\.js\?v=\$\{ADMIN_NAV_VERSION\}/);
  assert.match(workerSrc, /renderAdminSidebarHtml\(ASSET_VERSION, \{/);

  const editor = renderVisualEditorHtml(ASSET_VERSION);
  assert.match(editor, /class="admin-nav-toggle/);
  assert.match(editor, /id="admin-sidebar"/);
  assert.match(editor, /class="visual-editor-main"/);
  assert.match(editor, new RegExp(`admin-nav\\.css\\?v=${ADMIN_NAV_VERSION}`));
  assert.match(editor, new RegExp(`admin-nav\\.js\\?v=${ADMIN_NAV_VERSION}`));
  assert.match(editor, /visual-editor-body sn-body/);

  const cardsAdmin = renderFundraiserCardsAdminHtml(ASSET_VERSION);
  assert.match(cardsAdmin, /class="admin-shell cms-shell image-admin-shell"/);
  assert.match(cardsAdmin, /id="admin-sidebar"/);
  assert.match(cardsAdmin, new RegExp(`admin-nav\\.css\\?v=${ADMIN_NAV_VERSION}`));
  assert.match(cardsAdmin, /sn-body/);
});

test('nav script: 1100px drawer, Ctrl K + / launcher with combobox/listbox, Esc returns focus', () => {
  const js = readFileSync(join(root, 'admin-nav.js'), 'utf8');
  assert.match(js, /max-width: 1099px/);
  assert.match(js, /max-width: 600px/);
  assert.match(js, /role="dialog"/);
  assert.match(js, /role="combobox"/);
  assert.match(js, /role="listbox"/);
  assert.match(js, /aria-activedescendant/);
  assert.match(js, /BEST MATCHES/);
  assert.match(js, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(js, /key === '\/'/);
  assert.match(js, /returnFocus/);
  assert.match(js, /efhs-admin-nav-change/);
  assert.match(js, /function isStandaloneAdminPage/);
  assert.match(js, /function wireAdminNavLinks/);
  assert.doesNotMatch(js, /fetch\(/, 'launcher must not hit the network');
  const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
  assert.match(adminJs, /efhsAdminNav\?\.isOverlay/);
  const visualJs = readFileSync(join(root, 'admin-visual.js'), 'utf8');
  assert.match(visualJs, /efhs-admin-nav-change/);
});

test('nav CSS: light 250px sidebar, gold current edge, 3px gold focus, 44px phone targets, reduced motion', () => {
  const css = readFileSync(join(root, 'admin-nav.css'), 'utf8');
  assert.match(css, /--sn-w:250px/);
  assert.match(css, /\.sn-side\{[^}]*background:#fff/);
  assert.match(css, /aria-current="page"\]\{[^}]*border-left-color:var\(--sn-gold\)/);
  assert.match(css, /outline:3px solid var\(--sn-gold\)/);
  assert.match(css, /@media \(max-width:1099px\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  const syncSrc = readFileSync(join(root, 'worker/scripts/sync-public.mjs'), 'utf8');
  assert.match(syncSrc, /'admin-nav\.js'/);
  assert.match(syncSrc, /'admin-nav\.css'/);
});
