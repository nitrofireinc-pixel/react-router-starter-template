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
  <link rel="stylesheet" href="/public-theme.css">
  <link rel="stylesheet" href="/home-redesign.css">
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

    await dashboard.evaluate(() => {
      document.querySelector('[data-sponsors-menu]').hidden = false;
      document.querySelector('[data-boosters-menu]').hidden = false;
    });
    await dashboard.locator('.admin-nav-toggle').click();
    await waitForFocusInSidebar(dashboard);
    const overlayChildren = await dashboard.evaluate(() => {
      const labels = [...document.querySelectorAll('.admin-menu button')]
        .filter((button) => {
          if (button.hidden) return false;
          const style = getComputedStyle(button);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })
        .map((button) => button.textContent.trim());
      const sponsorsSub = document.querySelector('[data-sponsors-sub]');
      const boostersSub = document.querySelector('[data-boosters-sub]');
      return {
        labels,
        sponsorsSubHidden: Boolean(sponsorsSub?.hidden),
        boostersSubHidden: Boolean(boostersSub?.hidden),
        sponsorsExpanded: document.querySelector('[data-sponsors-toggle]')?.getAttribute('aria-expanded'),
        boostersExpanded: document.querySelector('[data-boosters-toggle]')?.getAttribute('aria-expanded'),
      };
    });
    assert.equal(overlayChildren.sponsorsSubHidden, false);
    assert.equal(overlayChildren.boostersSubHidden, false);
    assert.equal(overlayChildren.sponsorsExpanded, 'true');
    assert.equal(overlayChildren.boostersExpanded, 'true');
    assert.ok(overlayChildren.labels.includes('Manage sponsors'), `missing Manage sponsors in ${overlayChildren.labels.join(', ')}`);
    assert.ok(overlayChildren.labels.includes('Booster Members'), `missing Booster Members in ${overlayChildren.labels.join(', ')}`);
    assert.ok(overlayChildren.labels.includes('Meeting Minutes'), `missing Meeting Minutes in ${overlayChildren.labels.join(', ')}`);
    assert.ok(overlayChildren.labels.includes('Badge Creator'), `missing Badge Creator in ${overlayChildren.labels.join(', ')}`);
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

    await dashboard.setViewportSize({ width: 390, height: 844 });
    await dashboard.evaluate(() => {
      document.querySelector('[data-sponsors-menu]').hidden = false;
      document.querySelector('[data-boosters-menu]').hidden = false;
      window.efhsAdminNav.open();
      window.efhsAdminNav.revealOverlaySubmenus();
    });
    await dashboard.waitForTimeout(260);
    const phoneChildren = await dashboard.evaluate(() => ({
      manage: !document.querySelector('[data-tab="sponsors"]')?.hidden
        && getComputedStyle(document.querySelector('[data-tab="sponsors"]')).display !== 'none',
      members: !document.querySelector('[data-tab="booster-members"]')?.hidden
        && getComputedStyle(document.querySelector('[data-tab="booster-members"]')).display !== 'none',
    }));
    assert.equal(phoneChildren.manage, true, 'Manage sponsors should stay visible on phone overlay');
    assert.equal(phoneChildren.members, true, 'Booster Members should stay visible on phone overlay');

    await dashboard.close();
    await visual.close();
  } finally {
    await browser?.close();
    server.close();
  }
});

function prepareOverlayMenu() {
  const pages = document.querySelector('#admin-page-shortcuts');
  const pagesLabel = document.querySelector('[data-page-shortcuts-label]');
  if (pagesLabel) pagesLabel.hidden = false;
  if (pages) {
    pages.innerHTML = `
      <div class="admin-page-row"><a class="admin-page-edit" href="#fundraising">Fundraising</a><a class="admin-page-settings" href="#settings" aria-label="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8.5A3.5 3.5 0 1 1 12 15.5 3.5 3.5 0 0 1 12 8.5Z"/></svg></a></div>
      <div class="admin-page-row"><a class="admin-page-edit" href="#sponsors">Sponsors (page layout)</a><a class="admin-page-settings" href="#settings" aria-label="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8.5A3.5 3.5 0 1 1 12 15.5 3.5 3.5 0 0 1 12 8.5Z"/></svg></a></div>
      <div class="admin-page-row"><a class="admin-page-edit" href="#become">Become a Sponsor</a><a class="admin-page-settings" href="#settings" aria-label="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8.5A3.5 3.5 0 1 1 12 15.5 3.5 3.5 0 0 1 12 8.5Z"/></svg></a></div>
      <div class="admin-page-row"><a class="admin-page-edit" href="#ensembles">Ensembles</a><a class="admin-page-settings" href="#settings" aria-label="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8.5A3.5 3.5 0 1 1 12 15.5 3.5 3.5 0 0 1 12 8.5Z"/></svg></a></div>
    `;
  }
  const ensemble = document.querySelector('[data-tab="ensembles"]');
  if (ensemble) ensemble.hidden = false;
  const contact = document.querySelector('[data-tab="contact"]');
  if (contact) contact.hidden = false;
  document.querySelector('[data-sponsors-menu]').hidden = false;
  document.querySelector('[data-boosters-menu]').hidden = false;
  window.efhsAdminNav.open();
  window.efhsAdminNav.revealOverlaySubmenus();
}

function measureOverlayStack() {
  const sidebar = document.getElementById('admin-sidebar');
  const menu = document.querySelector('.admin-menu');
  const menuStyle = getComputedStyle(menu);
  const items = [...menu.querySelectorAll(':scope > button, :scope > .admin-menu-label, :scope .admin-page-edit, :scope .admin-menu-sub button, :scope .admin-menu-parent')]
    .filter((el) => {
      if (el.hidden || el.closest('[hidden]')) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
    });
  const boxes = items.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      text: el.textContent.trim(),
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
    };
  });
  const sideBySide = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapY > 6 && Math.abs(a.left - b.left) > 48) {
        sideBySide.push(`${a.text} || ${b.text}`);
      }
    }
  }
  const gears = [...document.querySelectorAll('.admin-page-row')].map((row) => {
    const label = row.querySelector('.admin-page-edit, button');
    const gear = row.querySelector('.admin-page-settings');
    const labelRect = label?.getBoundingClientRect();
    const gearRect = gear?.getBoundingClientRect();
    return {
      text: label?.textContent.trim() || '',
      overlap: Boolean(labelRect && gearRect && labelRect.right > gearRect.left + 1),
      gearLeft: gearRect?.left || 0,
      labelRight: labelRect?.right || 0,
    };
  });
  const wrapSample = document.querySelector('.admin-page-edit[href="#become"]') || items.find((el) => /Become a Sponsor/i.test(el.textContent));
  let becomeLines = 0;
  if (wrapSample) {
    const range = document.createRange();
    range.selectNodeContents(wrapSample);
    becomeLines = range.getClientRects().length;
  }
  const becomeStyle = wrapSample ? getComputedStyle(wrapSample) : null;
  return {
    display: menuStyle.display,
    flexDirection: menuStyle.flexDirection,
    flexWrap: menuStyle.flexWrap,
    overflowX: Math.max(
      sidebar.scrollWidth - sidebar.clientWidth,
      menu.scrollWidth - menu.clientWidth,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    menuScrollWidth: menu.scrollWidth,
    menuClientWidth: menu.clientWidth,
    sideBySide,
    gears,
    becomeLines,
    wordBreak: becomeStyle?.wordBreak || '',
    overflowWrap: becomeStyle?.overflowWrap || '',
    order: boxes.map((box) => box.text),
  };
}

test('overlay drawer stays a single column at 360, 390, 768, and 1000', async (t) => {
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

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => localStorage.removeItem('efhsAdminNavOpen'));
    await page.goto(`${origin}/admin`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.efhsAdminNav);

    for (const width of [360, 390, 768, 1000, 1440]) {
      await page.setViewportSize({ width, height: width >= 768 ? 1024 : 844 });
      await page.evaluate(prepareOverlayMenu);
      await page.waitForTimeout(280);
      const stack = await page.evaluate(measureOverlayStack);
      assert.equal(stack.display, 'flex', `${width}px display ${stack.display}`);
      assert.equal(stack.flexDirection, 'column', `${width}px flex-direction ${stack.flexDirection}`);
      assert.equal(stack.flexWrap, 'nowrap', `${width}px flex-wrap ${stack.flexWrap}`);
      assert.equal(stack.sideBySide.length, 0, `${width}px side-by-side items: ${stack.sideBySide.join('; ')}`);
      assert.ok(stack.overflowX <= 0, `${width}px menu overflow ${stack.overflowX} (${stack.menuScrollWidth}/${stack.menuClientWidth})`);
      assert.equal(stack.wordBreak, 'normal', `${width}px word-break ${stack.wordBreak}`);
      assert.equal(stack.overflowWrap, 'break-word', `${width}px overflow-wrap ${stack.overflowWrap}`);
      assert.ok(stack.becomeLines > 0 && stack.becomeLines <= 3, `${width}px Become a Sponsor used ${stack.becomeLines} lines`);
      const overlappingGear = stack.gears.find((row) => row.overlap);
      assert.equal(overlappingGear, undefined, `${width}px gear overlap on ${overlappingGear?.text}`);
      const joined = stack.order.join(' | ');
      assert.match(joined, /Band Boosters[\s\S]*Booster Members[\s\S]*Meeting Minutes[\s\S]*Badge Creator/);
      assert.match(joined, /Sponsors[\s\S]*Manage sponsors/);
      assert.match(joined, /PAGES[\s\S]*Fundraising[\s\S]*Sponsors \(page layout\)/i);
      assert.doesNotMatch(joined, /Calendar Events/);
    }

    const visual = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await visual.addInitScript(() => localStorage.removeItem('efhsAdminNavOpen'));
    await visual.goto(`${origin}/admin/visual/join`, { waitUntil: 'networkidle' });
    await visual.waitForFunction(() => window.efhsAdminNav);
    await visual.evaluate(prepareOverlayMenu);
    await visual.waitForTimeout(280);
    const visualStack = await visual.evaluate(measureOverlayStack);
    assert.ok(visualStack.overflowX <= 0, `visual 1440 menu overflow ${visualStack.overflowX} (${visualStack.menuScrollWidth}/${visualStack.menuClientWidth})`);
    await visual.close();

    await page.close();
  } finally {
    await browser?.close();
    server.close();
  }
});
