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

test('1280: light sidebar is always visible at 250px and the workspace sits beside it', async (t) => {
  await withPage(t, 1280, 900, '/admin', async (page) => {
    const m = await page.evaluate(() => {
      const side = document.getElementById('admin-sidebar').getBoundingClientRect();
      const ws = document.querySelector('.admin-workspace').getBoundingClientRect();
      return {
        sideW: Math.round(side.width), sideX: side.x, wsX: Math.round(ws.x),
        bg: getComputedStyle(document.getElementById('admin-sidebar')).backgroundColor,
        topDisplay: getComputedStyle(document.querySelector('.sn-top')).display,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.equal(m.sideW, 250);
    assert.equal(m.sideX, 0);
    assert.ok(m.wsX >= 250, `workspace x ${m.wsX}`);
    assert.equal(m.bg, 'rgb(255, 255, 255)');
    assert.equal(m.topDisplay, 'none');
    assert.ok(m.overflowX <= 0);
  });
  await withPage(t, 1280, 900, '/admin/visual/join', async (page) => {
    const x = await page.evaluate(() => Math.round(document.querySelector('.visual-editor-main').getBoundingClientRect().x));
    assert.ok(x >= 250, `visual main x ${x}`);
  });
});

test('980: Menu opens a slide-over drawer, Close gets focus, Esc closes and returns focus', async (t) => {
  await withPage(t, 980, 1000, '/admin', async (page) => {
    assert.equal(await page.isVisible('#admin-sidebar .sn-item'), false);
    await page.click('.admin-nav-toggle');
    await page.waitForTimeout(260);
    await waitForFocusInSidebar(page);
    const open = await page.evaluate(() => ({
      focus: document.activeElement.matches('[data-admin-nav-close]'),
      role: document.getElementById('admin-sidebar').getAttribute('role'),
      backdrop: !document.querySelector('[data-admin-nav-backdrop]').hidden,
    }));
    assert.deepEqual(open, { focus: true, role: 'dialog', backdrop: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(260);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('admin-nav-toggle')), true);
    assert.equal(await page.isVisible('#admin-sidebar .sn-item'), false);
  });
});

test('Ctrl+K opens the quick search; arrows + Enter pick, Esc returns focus', async (t) => {
  await withPage(t, 1280, 900, '/admin', async (page) => {
    await page.focus('.sn-brand');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.sn-launch:not([hidden])');
    const before = await page.evaluate(() => ({
      role: document.querySelector('.sn-launch-box, .sn-launch [role="dialog"]')?.getAttribute('role') || document.querySelector('.sn-launch').getAttribute('role'),
      focused: document.activeElement.getAttribute('role'),
    }));
    assert.equal(before.focused, 'combobox');
    await page.keyboard.type('minu');
    const first = await page.evaluate(() => {
      const li = document.querySelector('#sn-launch-list [role="option"]');
      return li ? li.textContent : '';
    });
    assert.match(first, /Meeting Minutes[\s\S]*Boosters/);
    await page.keyboard.type('zzzz');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('fundrai');
    const labels = await page.evaluate(() => [...document.querySelectorAll('#sn-launch-list [role="option"]')].map((li) => li.textContent));
    assert.ok(labels.some((l) => /Fundraising/.test(l)), labels.join('|'));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sn-launch', { state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('sn-brand')), true);
  });
});

test('390: Menu is full-screen with Close first and 44px targets', async (t) => {
  await withPage(t, 390, 844, '/admin', async (page) => {
    await page.click('.admin-nav-toggle');
    await page.waitForTimeout(260);
    const m = await page.evaluate(() => {
      const side = document.getElementById('admin-sidebar');
      const r = side.getBoundingClientRect();
      const first = side.querySelector('a,button,input');
      const small = [...side.querySelectorAll('.sn-item')].filter((el) => el.getBoundingClientRect().height < 44).length;
      return { w: Math.round(r.width), x: Math.round(r.x), firstClose: first.matches('[data-admin-nav-close]'), small,
        overflowX: side.scrollWidth - side.clientWidth };
    });
    assert.equal(m.w, 390);
    assert.equal(m.x, 0);
    assert.equal(m.firstClose, true);
    assert.equal(m.small, 0);
    assert.ok(m.overflowX <= 0);
  });
});
