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
  <link rel="stylesheet" href="/admin-nav.css">
</head>
<body class="admin-body">
<main class="admin-shell cms-shell image-admin-shell">
${renderAdminChromeBar()}
${renderAdminSidebarBackdrop()}
${renderAdminSidebarHtml('test')}
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
<body class="visual-editor-body">
${renderAdminChromeBar()}
${renderAdminSidebarBackdrop()}
${renderAdminSidebarHtml('test')}
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

test('overlay open focuses the drawer after the transition and matches visual 768 layout', async (t) => {
  if (!existsSync(chromePath)) {
    t.skip('Chrome is not installed for Playwright');
    return;
  }

  const { server, origin } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const dashboard = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    await dashboard.addInitScript(() => localStorage.removeItem('efhsAdminNavOpen'));
    await dashboard.goto(`${origin}/admin`, { waitUntil: 'networkidle' });
    await dashboard.waitForFunction(() => window.efhsAdminNav);

    const visual = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    await visual.addInitScript(() => localStorage.removeItem('efhsAdminNavOpen'));
    await visual.goto(`${origin}/admin/visual/join`, { waitUntil: 'networkidle' });
    await visual.waitForFunction(() => window.efhsAdminNav);

    const measure = (page) => page.evaluate(() => {
      const workspace = document.querySelector('.admin-workspace, .visual-editor-main');
      const col = getComputedStyle(document.body).getPropertyValue('--admin-nav-col').trim();
      const grid = getComputedStyle(document.querySelector('.image-admin-shell, body.visual-editor-body')).gridTemplateColumns;
      return {
        workspaceWidth: workspace ? Math.round(workspace.getBoundingClientRect().width) : 0,
        col,
        grid,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    const dashClosed = await (async () => {
      await dashboard.evaluate(() => window.efhsAdminNav.close());
      await dashboard.waitForTimeout(260);
      return measure(dashboard);
    })();
    const visualClosed = await (async () => {
      await visual.evaluate(() => window.efhsAdminNav.close());
      await visual.waitForTimeout(260);
      return measure(visual);
    })();

    assert.equal(dashClosed.col, '0px');
    assert.equal(visualClosed.col, '0px');
    assert.ok(dashClosed.workspaceWidth >= 740, `dashboard workspace should be full width at 768, got ${dashClosed.workspaceWidth}`);
    assert.ok(visualClosed.workspaceWidth >= 740, `visual workspace should be full width at 768, got ${visualClosed.workspaceWidth}`);
    assert.ok(Math.abs(dashClosed.workspaceWidth - visualClosed.workspaceWidth) <= 24, 'dashboard and visual closed widths should match');
    assert.ok(dashClosed.overflowX <= 1, `dashboard overflowX ${dashClosed.overflowX}`);
    assert.ok(visualClosed.overflowX <= 1, `visual overflowX ${visualClosed.overflowX}`);

    await dashboard.locator('.admin-nav-toggle').click();
    await waitForFocusInSidebar(dashboard);
    const focused = await dashboard.evaluate(() => {
      const sidebar = document.getElementById('admin-sidebar');
      const active = document.activeElement;
      return {
        inSidebar: Boolean(sidebar && active && sidebar.contains(active)),
        tag: active?.tagName || '',
        close: active?.hasAttribute('data-admin-nav-close') || false,
        visibility: getComputedStyle(sidebar).visibility,
        overlay: document.body.classList.contains('admin-nav-overlay'),
      };
    });
    assert.equal(focused.inSidebar, true);
    assert.equal(focused.close, true);
    assert.equal(focused.visibility, 'visible');
    assert.equal(focused.overlay, true);

    const firstId = await dashboard.evaluate(() => document.activeElement?.getAttribute('data-admin-nav-close'));
    assert.equal(firstId, '');
    await dashboard.keyboard.press('Shift+Tab');
    const wrappedToLast = await dashboard.evaluate(() => {
      const sidebar = document.getElementById('admin-sidebar');
      const items = [...sidebar.querySelectorAll('a[href], button:not([disabled])')].filter((el) => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      return document.activeElement === items[items.length - 1];
    });
    assert.equal(wrappedToLast, true, 'Shift+Tab from the first drawer control should wrap to the last');

    await dashboard.keyboard.press('Tab');
    const wrappedToFirst = await dashboard.evaluate(() => (
      document.activeElement?.hasAttribute('data-admin-nav-close')
    ));
    assert.equal(wrappedToFirst, true, 'Tab from the last drawer control should wrap to the close button');

    const dashOpen = await measure(dashboard);
    await visual.locator('.admin-nav-toggle').click();
    await waitForFocusInSidebar(visual);
    const visualOpen = await measure(visual);
    assert.equal(dashOpen.col, '0px');
    assert.equal(visualOpen.col, '0px');
    assert.ok(dashOpen.workspaceWidth >= 740, `open dashboard should stay full width, got ${dashOpen.workspaceWidth}`);
    assert.ok(visualOpen.workspaceWidth >= 740, `open visual should stay full width, got ${visualOpen.workspaceWidth}`);
    assert.ok(Math.abs(dashOpen.workspaceWidth - visualOpen.workspaceWidth) <= 24);

    await dashboard.close();
    await visual.close();
  } finally {
    await browser?.close();
    server.close();
  }
});
