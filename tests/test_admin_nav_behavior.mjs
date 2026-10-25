import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

import {
  renderAdminChromeBar,
  renderAdminSidebarBackdrop,
  renderAdminSidebarHtml,
} from '../worker/src/admin-chrome.mjs';

const ADMIN = { id: 1, role: 'admin', username: 'agent@efhsband.org', display_name: 'Trevor', permissions: [] };
const NAV = { user: ADMIN, allow: () => true, roleLabel: 'Super Admin', pages: [{ slug: 'fundraising', path: '/fundraising.html', title: 'Fundraising', active: 1 }] };
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
};

function dashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/public-theme.css">
  <link rel="stylesheet" href="/home-redesign.css">
  <link rel="stylesheet" href="/admin-nav.css">
</head>
<body class="admin-body sn-body">
<main class="admin-shell cms-shell image-admin-shell">
${renderAdminChromeBar()}
${renderAdminSidebarBackdrop()}
${renderAdminSidebarHtml('test', NAV)}
<div class="admin-workspace"><h1>Dashboard</h1></div>
</main>
<script src="/admin-nav.js"></script>
</body>
</html>`;
}

function visualHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/admin-nav.css">
</head>
<body class="visual-editor-body sn-body">
${renderAdminChromeBar()}
${renderAdminSidebarBackdrop()}
${renderAdminSidebarHtml('test', NAV)}
<div class="visual-editor-main"><h1>Visual page</h1></div>
<script src="/admin-nav.js"></script>
</body>
</html>`;
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/admin') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(dashboardHtml());
        return;
      }
      if (url.pathname === '/admin/visual/join') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(visualHtml());
        return;
      }
      const file = join(root, url.pathname.replace(/^\/+/, ''));
      if (existsSync(file) && file.startsWith(root)) {
        const ext = extname(file);
        res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
        res.end(readFileSync(file));
        return;
      }
      res.writeHead(404);
      res.end('missing');
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}


async function waitForFocusInSidebar(page) {
  await page.waitForFunction(() => {
    const sidebar = document.getElementById('admin-sidebar');
    const active = document.activeElement;
    return Boolean(sidebar && active && sidebar.contains(active) && active !== document.body);
  }, null, { timeout: 2000 });
}

async function withPage(t, width, height, path, fn) {
  if (!existsSync(chromePath)) { t.skip('Chrome is not installed for Playwright'); return; }
  const { server, origin } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.efhsAdminNav);
    await fn(page);
  } finally {
    await browser?.close();
    server.close();
  }
}

const geom = (page) => page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), r: Math.round(b.right) }; };
  const side = document.getElementById('admin-sidebar');
  return {
    rail: r(document.querySelector('.sn-rail')),
    side: r(side),
    sideVisible: getComputedStyle(side).visibility === 'visible',
    ws: r(document.querySelector('.admin-workspace, .visual-editor-main')),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

for (const width of [1280, 980]) {
  test(`${width}: 68px rail always visible; icon opens a tile flyout (440px, 520px at >=1200) over the page without shrinking it`, async (t) => {
    await withPage(t, width, 900, '/admin', async (page) => {
      const closed = await geom(page);
      assert.equal(closed.rail.w, 68);
      assert.equal(closed.rail.x, 0);
      assert.equal(closed.sideVisible, false);
      assert.ok(closed.ws.x >= 68, `workspace x ${closed.ws.x}`);
      assert.ok(closed.overflowX <= 0);
      assert.equal(await page.isVisible('.sn-top'), false);
      assert.equal(await page.isVisible('.sn-bottom'), false);
      await page.click('[data-sn-fly-key="money"]');
      await page.waitForTimeout(220);
      const open = await geom(page);
      assert.equal(open.sideVisible, true);
      assert.equal(open.side.x, 68);
      assert.equal(open.side.w, width >= 1200 ? 520 : 440);
      assert.deepEqual(open.ws, closed.ws, 'page width never changes');
      assert.equal(await page.getAttribute('[data-sn-fly-key="money"]', 'aria-expanded'), 'true');
      const shown = await page.evaluate(() => [...document.querySelectorAll('#admin-sidebar [data-nav-item]')].filter((el) => el.offsetParent).map((el) => el.dataset.navItem));
      assert.ok(shown.includes('ledger') && !shown.includes('pages'), shown.join(','));
      // tooltip for another icon sits right of the flyout, never over it
      await page.hover('[data-sn-fly-key="sponsors"]');
      const tip = await page.evaluate(() => { const el = document.querySelector('.sn-tip'); return el && !el.hidden ? Math.round(el.getBoundingClientRect().x) : null; });
      assert.ok(tip !== null && tip >= open.side.r, `tip x ${tip} vs flyout right ${open.side.r}`);
      // click outside closes
      await page.mouse.click(width - 40, 600);
      await page.waitForTimeout(220);
      assert.equal((await geom(page)).sideVisible, false);
    });
  });
}

test('1280: keyboard - arrows move on the rail, Enter/→ opens and focuses first link, Esc closes back to icon', async (t) => {
  await withPage(t, 1280, 900, '/admin', async (page) => {
    await page.focus('[data-sn-fly-key="money"]');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.snFlyKey), 'sponsors');
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
    assert.equal(ring, '3px');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.activeElement.closest('.sn-section')?.dataset.navSection), 'sponsors');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.snFlyKey), 'sponsors');
    assert.equal(await page.evaluate(() => document.body.classList.contains('sn-fly')), false);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.body.classList.contains('sn-fly')), true);
    assert.equal(await page.evaluate(() => document.activeElement.closest('.sn-section')?.dataset.navSection), 'sponsors');
  });
  await withPage(t, 1280, 900, '/admin/visual/join', async (page) => {
    const x = await page.evaluate(() => Math.round(document.querySelector('.visual-editor-main').getBoundingClientRect().x));
    assert.ok(x >= 68, `visual main x ${x}`);
  });
});

test('Ctrl+K opens the quick search; arrows + Enter pick, Esc returns focus', async (t) => {
  await withPage(t, 1280, 900, '/admin', async (page) => {
    await page.focus('.sn-rail-logo');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.sn-launch:not([hidden])');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('role')), 'combobox');
    await page.keyboard.type('minu');
    const first = await page.evaluate(() => document.querySelector('#sn-launch-list [role="option"]')?.textContent || '');
    assert.match(first, /Meeting Minutes[\s\S]*Boosters/);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('fundrai');
    const labels = await page.evaluate(() => [...document.querySelectorAll('#sn-launch-list [role="option"]')].map((li) => li.textContent));
    assert.ok(labels.some((l) => /Fundraising/.test(l)), labels.join('|'));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sn-launch', { state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('sn-rail-logo')), true);
  });
});

test('390: bottom bar (Home, section, Find, More); More sheet = icon grid, Close first, 44px targets', async (t) => {
  await withPage(t, 390, 844, '/admin', async (page) => {
    assert.equal(await page.isVisible('.sn-rail'), false);
    const bb = await page.evaluate(() => [...document.querySelectorAll('.sn-bottom .sn-bb-btn')].map((el) => ({ t: el.textContent.trim(), h: el.getBoundingClientRect().height })));
    assert.equal(bb.length, 4);
    assert.ok(bb.every((b) => b.h >= 44));
    await page.click('.admin-nav-toggle');
    await page.waitForTimeout(260);
    const m = await page.evaluate(() => {
      const side = document.getElementById('admin-sidebar');
      const r = side.getBoundingClientRect();
      const first = side.querySelector('a,button,input');
      const small = [...side.querySelectorAll('.sn-item')].filter((el) => el.offsetParent && el.getBoundingClientRect().height < 44).length;
      return { w: Math.round(r.width), x: Math.round(r.x), firstClose: first.matches('[data-admin-nav-close]'), small,
        items: [...side.querySelectorAll('[data-nav-item]')].filter((el) => el.offsetParent).length,
        tiles: [...side.querySelectorAll('[data-sn-more-key]')].filter((el) => el.offsetParent).length,
        tileMinH: Math.min(...[...side.querySelectorAll('[data-sn-more-key]')].filter((el) => el.offsetParent).map((el) => el.getBoundingClientRect().height)),
        overflowX: side.scrollWidth - side.clientWidth, focusClose: document.activeElement.matches('[data-admin-nav-close]') };
    });
    assert.equal(m.w, 390);
    assert.equal(m.x, 0);
    assert.equal(m.firstClose, true);
    assert.equal(m.focusClose, true);
    assert.equal(m.small, 0);
    assert.equal(m.items, 0, 'grid hides the long list');
    assert.ok(m.tiles >= 8, `tiles ${m.tiles}`);
    assert.ok(m.tileMinH >= 44);
    assert.ok(m.overflowX <= 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(260);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('admin-nav-toggle')), true);
  });
});

for (const w of [1024, 1280]) {
  test(`${w}: Website flyout shows the flat list, no phone More grid or back button`, async (t) => {
    await withPage(t, w, 900, '/admin', async (page) => {
      await page.click('.sn-rail button[data-rail-section="website"]');
      await page.waitForTimeout(260);
      assert.equal(await page.isVisible('.sn-section[data-nav-section="website"]'), true);
      const v = await page.evaluate(() => ({
        more: [...document.querySelectorAll('.sn-more,.sn-more-back')].filter((el) => el.offsetParent).length,
      }));
      assert.equal(v.more, 0);
    });
  });
}
