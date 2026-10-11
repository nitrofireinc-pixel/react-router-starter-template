import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  listAdminNavTargets,
  renderAdminSidebarHtml,
} from '../worker/src/admin-chrome.mjs';
import { renderFundraiserCardsAdminHtml } from '../worker/src/fundraiser-cards.mjs';
import { renderVisualEditorHtml } from '../worker/src/visual-page-editor.mjs';
import worker, { adminSidebarAllows, ASSET_VERSION, resetDbInitCache } from '../worker/src/worker.mjs';
import { DEFAULT_CMS_PAGES } from '../worker/src/default-pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');

const SUPER_ADMIN = { id: 1, role: 'admin', username: 'agent@efhsband.org', display_name: 'Trevor', permissions: [] };
const PAGES = DEFAULT_CMS_PAGES.map((page) => ({
  slug: page.slug,
  path: page.path,
  title: page.title,
  nav_order: page.nav_order,
  active: page.active,
}));

function navOptions(current = {}) {
  return {
    user: SUPER_ADMIN,
    allow: (tab) => adminSidebarAllows(SUPER_ADMIN, tab),
    pages: PAGES,
    fundraiserDraftCount: 1,
    roleLabel: 'Super Admin',
    current,
  };
}

function navCore(html) {
  const start = html.indexOf('class="admin-tabs admin-menu"');
  const end = html.indexOf('admin-sidebar-footer');
  assert.ok(start > 0 && end > start, 'sidebar nav markers');
  return html.slice(start, end)
    .replace(/ active/g, '')
    .replace(/ data-nav-current="[^"]*"/g, '')
    .replace(/aria-expanded="[^"]*"/g, 'aria-expanded="*"')
    .replace(/data-nav-group-sub="([^"]+)"\s*(hidden)?/g, 'data-nav-group-sub="$1"');
}

function knownAdminTabs() {
  const tabs = new Set();
  for (const match of workerSrc.matchAll(/id="tab-([a-z0-9-]+)"/g)) {
    tabs.add(match[1]);
  }
  return tabs;
}

function createEnv() {
  const pages = PAGES.map((page, index) => ({ id: index + 1, ...page, body_html: '' }));
  const handleSql = (sql, type) => {
    const text = String(sql || '');
    if (text.includes('FROM cms_pages')) return type === 'first' ? pages[0] : { results: pages };
    if (text.includes('FROM fundraiser_cards')) return type === 'first' ? { n: 1 } : { results: [] };
    if (text.includes('FROM site_content WHERE key')) return { value: '2026-10-04.8' };
    if (text.includes('FROM site_content')) return type === 'first' ? { value: '0' } : { results: [] };
    return type === 'first' ? null : { results: [] };
  };
  const statement = (sql) => ({
    sql,
    binds: [],
    bind(...args) { this.binds = args; return this; },
    async first() { return handleSql(this.sql, 'first'); },
    async all() { return handleSql(this.sql, 'all'); },
    async run() { return { success: true }; },
  });
  const session = {
    prepare: (sql) => statement(sql),
    async batch(items) { return (items || []).map((item) => handleSql(item.sql, 'all')); },
    getBookmark() { return 'bookmark'; },
  };
  return {
    DB: {
      withSession() { return session; },
      prepare: session.prepare,
      batch: session.batch,
    },
    ASSETS: { async fetch() { return new Response('missing', { status: 404 }); } },
  };
}

test('reorganized sidebar is identical on /admin, visual, and fundraiser-cards', () => {
  const opts = navOptions();
  const admin = renderAdminSidebarHtml(ASSET_VERSION, { ...opts, current: { route: 'admin' } });
  const visual = renderVisualEditorHtml(ASSET_VERSION, { ...opts, slug: 'fundraising', title: 'Fundraising', path: '/fundraising.html', active: 1 });
  const cards = renderFundraiserCardsAdminHtml(ASSET_VERSION, { ...opts, current: { route: 'fundraiser-cards' } });
  assert.match(admin, /data-admin-nav-v2/);
  assert.match(admin, /data-admin-nav-search/);
  assert.match(admin, /admin-role-pill/);
  assert.match(admin, /Fundraiser cards/);
  assert.match(admin, /admin-nav-badge/);
  assert.equal(navCore(admin), navCore(visual));
  assert.equal(navCore(admin), navCore(cards));
});

test('every Super Admin sidebar item has a working tab or admin URL', async () => {
  const tabs = knownAdminTabs();
  const targets = listAdminNavTargets(navOptions({ route: 'admin' }));
  assert.ok(targets.length >= 12, `expected a full Super Admin menu, got ${targets.length}`);

  resetDbInitCache();
  const env = createEnv();
  const ctx = { waitUntil() {} };

  for (const item of targets) {
    const href = String(item.href || '');
    assert.ok(href.startsWith('/admin'), `${item.label} missing admin href`);
    if (item.tab && item.tab !== 'fundraiser-cards' && item.tab !== 'pages') {
      assert.ok(tabs.has(item.tab), `${item.label} missing #tab-${item.tab}`);
    }
    if (href.startsWith('/admin/visual/')) {
      const slug = decodeURIComponent(href.slice('/admin/visual/'.length));
      assert.ok(/^[a-z0-9-]+$/.test(slug), `${item.label} bad visual slug`);
      assert.match(workerSrc, /VISUAL_EDITOR_PATH_PREFIX/);
    }
    if (href === '/admin/fundraiser-cards') {
      assert.match(workerSrc, /pathname === '\/admin\/fundraiser-cards'/);
    }
    const url = new URL(href, 'https://efhsband-dev.example');
    const response = await worker.fetch(new Request(url), env, ctx);
    const location = response.headers.get('location') || '';
    const redirected = response.status >= 300 && response.status < 400 && /\/admin/.test(location);
    assert.notEqual(response.status, 404, `${item.label} ${href} returned 404`);
    assert.ok(
      response.status === 200 || redirected || response.status === 401 || response.status === 403,
      `${item.label} ${href} returned ${response.status} ${location}`,
    );
  }
});
