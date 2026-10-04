#!/usr/bin/env node
/**
 * Playwright: phone notice, tablet canvas scroll, overflow warning.
 * Uses system Chrome. Run: node tests/visual-editor-playwright.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import { renderVisualEditorHtml } from '../worker/src/visual-page-editor.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join('/opt/cursor/artifacts/screenshots');
mkdirSync(shots, { recursive: true });

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const WIDE_HTML = '<section class="page-hero" data-visual-block="hero"><div class="page-title"><h1>Join the Band</h1><p>Scroll past this hero to reach the rest of the page.</p></div></section><section class="content"><div class="wrap"><div class="card" data-visual-block="text"><h2>How to get started</h2><p>Call the band office or send a message through the contact form.</p></div><div data-visual-block="wide-test" style="min-width: 900px">Wide test block</div><p>Bottom of the page.</p></div></section>';

function startServer() {
  const editorHtml = renderVisualEditorHtml('test', {
    slug: 'join',
    title: 'Join the Band',
    path: '/join.html',
  });
  const joinHtml = `<!doctype html><html><body class="efhs-theme coming-soon-page"><header class="site-header"></header><main id="main"></main><footer class="footer"></footer></body></html>`;
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/admin/visual/')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(editorHtml);
        return;
      }
      if (url.pathname.startsWith('/api/admin/visual-pages/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        if (req.method === 'PUT') {
          res.end(JSON.stringify({
            slug: 'join',
            path: '/join.html',
            title: 'Join the Band',
            draft_html: WIDE_HTML,
            versions: [],
          }));
          return;
        }
        res.end(JSON.stringify({
          slug: 'join',
          path: '/join.html',
          title: 'Join the Band',
          draft_html: WIDE_HTML,
          versions: [],
        }));
        return;
      }
      if (url.pathname === '/join.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(joinHtml);
        return;
      }
      if (url.pathname === '/api/photos') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('[]');
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
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function run() {
  const { server, origin } = await startServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const failures = [];

  try {
    const phone = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await phone.goto(`${origin}/admin/visual/join`, { waitUntil: 'networkidle' });
    const notice = phone.locator('[data-visual-phone-gate]');
    await notice.waitFor({ state: 'visible' });
    const text = await phone.locator('.visual-phone-gate-card').innerText();
    if (!/Please edit pages on a computer or tablet/.test(text)) failures.push('phone notice missing copy');
    if (!/Phones are too small for the editor/.test(text)) failures.push('phone notice missing reason');
    const live = phone.locator('[data-visual-view-live]');
    const back = phone.locator('[data-visual-back-cms]');
    if (!(await live.isVisible()) || !(await back.isVisible())) failures.push('phone notice missing buttons');
    if (await phone.locator('[data-visual-banner]').isVisible()) failures.push('phone still shows editor banner');
    await phone.screenshot({ path: join(shots, 'visual-editor-phone-390.png'), fullPage: true });
    await phone.close();

    const tablet = await browser.newPage({
      viewport: { width: 768, height: 1024 },
      isMobile: true,
      hasTouch: true,
    });
    await tablet.goto(`${origin}/admin/visual/join`, { waitUntil: 'networkidle' });
    await tablet.waitForSelector('#gjs', { timeout: 20000 });
    if (await tablet.locator('[data-visual-phone-gate]').isVisible()) {
      failures.push('tablet should not show phone notice');
    }
    await tablet.waitForTimeout(1500);
    await tablet.screenshot({ path: join(shots, 'visual-editor-tablet-768.png') });
    await tablet.locator('[data-visual-device-select]').selectOption('Phone');
    await tablet.waitForTimeout(400);
    const scrolled = await tablet.evaluate(async () => {
      const stage = document.querySelector('.visual-editor-stage, .gjs-cv-canvas, .gjs-cv-canvas__frames');
      if (!stage) return { ok: false, reason: 'no stage' };
      const before = stage.scrollTop;
      stage.scrollTop = stage.scrollHeight;
      return { ok: stage.scrollHeight > stage.clientHeight + 20, before, after: stage.scrollTop, height: stage.scrollHeight };
    });
    if (!scrolled.ok && scrolled.after === 0) {
      const frame = tablet.frameLocator('iframe').first();
      const bottom = frame.locator('text=Bottom of the page');
      await bottom.scrollIntoViewIfNeeded().catch(() => {});
    }
    await tablet.screenshot({ path: join(shots, 'visual-editor-tablet-390-preview.png') });

    tablet.once('dialog', (dialog) => dialog.dismiss().catch(() => {}));
    await tablet.locator('[data-visual-draft]').click();
    const overflow = tablet.locator('[data-visual-overflow-modal]');
    await overflow.waitFor({ state: 'visible', timeout: 15000 });
    const detail = await tablet.locator('[data-visual-overflow-detail]').innerText();
    if (!/390px|320px/.test(detail)) failures.push(`overflow warning missing width: ${detail}`);
    if (!/Wide test/i.test(detail)) failures.push(`overflow warning missing element name: ${detail}`);
    await tablet.screenshot({ path: join(shots, 'visual-editor-overflow-warning.png') });
    await tablet.locator('[data-visual-overflow-back]').click();
    await tablet.close();
  } catch (error) {
    failures.push(String(error?.stack || error));
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('visual editor playwright passed', { shots });
}

run();
