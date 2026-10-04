import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import worker, {
  ASSET_VERSION,
  applyWorkerSecurityHeaders,
  WORKER_SECURITY_HEADERS,
  resetDbInitCache,
} from '../worker/src/worker.mjs';
import { renderVisualEditorHtml } from '../worker/src/visual-page-editor.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function createEnv() {
  const pages = [
    {
      id: 1,
      slug: 'home',
      path: '/',
      title: 'Home',
      body_html: '<section class="content"><div class="wrap"><p>Home</p></div></section>',
      nav_order: 1,
      is_home: 1,
      active: 1,
    },
  ];
  const handleSql = (sql, type, binds = []) => {
    const text = String(sql || '');
    if (type === 'first' && text.includes('FROM site_content WHERE key')) {
      return { value: '2026-10-03.1' };
    }
    if (text.includes('FROM cms_pages WHERE path')) {
      const page = pages.find((item) => item.path === binds[0]) || pages[0];
      return type === 'first' ? page : { results: page ? [page] : [] };
    }
    if (text.includes('FROM cms_pages')) {
      return type === 'first' ? pages[0] : { results: pages };
    }
    if (text.includes('FROM site_content')) {
      return type === 'first' ? { value: '0' } : { results: [] };
    }
    return type === 'first' ? null : { results: [] };
  };
  const statement = (sql) => ({
    sql,
    binds: [],
    bind(...args) {
      this.binds = args;
      return this;
    },
    async first() {
      return handleSql(this.sql, 'first', this.binds);
    },
    async all() {
      return handleSql(this.sql, 'all', this.binds);
    },
    async run() {
      return { success: true };
    },
  });
  const session = {
    prepare: (sql) => statement(sql),
    async batch(items) {
      return (items || []).map((item) => handleSql(item.sql, 'all', item.binds || []));
    },
    getBookmark() {
      return 'bookmark';
    },
  };
  return {
    DB: {
      withSession() {
        return session;
      },
      prepare: session.prepare,
      batch: session.batch,
    },
    ASSETS: {
      async fetch() {
        return new Response('missing', { status: 404 });
      },
    },
  };
}

function localCssJsRefs(html) {
  const refs = [];
  const re = /(?:href|src)=["']([^"']+\.(?:css|js|mjs))(?:\?[^"']*)?["']/gi;
  for (const match of html.matchAll(re)) {
    const url = match[1];
    if (/^https?:\/\//i.test(url)) continue;
    refs.push(match[0]);
  }
  return refs;
}

test('Worker security headers match _headers and stay SAMEORIGIN for the editor iframe', () => {
  assert.equal(WORKER_SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.equal(WORKER_SECURITY_HEADERS['X-Frame-Options'], 'SAMEORIGIN');
  assert.equal(WORKER_SECURITY_HEADERS['Referrer-Policy'], 'strict-origin-when-cross-origin');
  const headersFile = readFileSync(join(root, '_headers'), 'utf8');
  for (const [name, value] of Object.entries(WORKER_SECURITY_HEADERS)) {
    assert.match(headersFile, new RegExp(`${name}: ${value}`));
  }
  const applied = applyWorkerSecurityHeaders(new Response('ok', { headers: { 'cache-control': 'no-store' } }));
  assert.equal(applied.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(applied.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(applied.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(applied.headers.get('cache-control'), 'no-store');
});

test('Worker HTML, admin, API, and uploads responses carry the security headers', async () => {
  resetDbInitCache();
  const env = createEnv();
  const ctx = { waitUntil() {} };
  const paths = ['/', '/admin/login', '/api/site', '/uploads/missing.jpg'];
  for (const path of paths) {
    const response = await worker.fetch(new Request(`https://efhsband-dev.example${path}`), env, ctx);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN', path);
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
  }
});

test('every Worker-rendered CSS/JS reference carries the asset version param', () => {
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const visualSrc = readFileSync(join(root, 'worker/src/visual-page-editor.mjs'), 'utf8');
  const page = renderVisualEditorHtml(ASSET_VERSION);
  for (const ref of localCssJsRefs(page)) {
    assert.match(ref, /[?&]v=/, `unversioned editor HTML ref ${ref}`);
  }
  const hrefSrc = /(?:href|src)=["'](\/[^"']+\.(?:css|js|mjs))["']/g;
  for (const src of [workerSrc, visualSrc]) {
    for (const match of src.matchAll(hrefSrc)) {
      assert.match(match[0], /[?&]v=/, `unversioned Worker HTML ref ${match[0]}`);
    }
  }
  assert.equal(ASSET_VERSION, 'cms-p1-20261004b');
});

test('admin-visual canvas stylesheets append the public asset version', () => {
  const editorJs = readFileSync(join(root, 'admin-visual.js'), 'utf8');
  assert.match(editorJs, /function versionedAsset\(/);
  assert.match(editorJs, /versionedAsset\('\/styles\.css'\)/);
  assert.match(editorJs, /versionedAsset\('\/public-theme\.css'\)/);
  assert.match(editorJs, /versionedAsset\('\/home-redesign\.css'\)/);
  assert.match(editorJs, /versionedAsset\('\/admin-visual\.css'\)/);
  assert.doesNotMatch(editorJs, /styles:\s*\[[\s\S]*?['"]\/styles\.css['"]\s*,/);
});

test('_headers keeps immutable for versioned CSS/JS and 1-day cache for images; push-sw detaches Cache-Control', () => {
  const headers = readFileSync(join(root, '_headers'), 'utf8');
  const cssBlock = headers.slice(headers.indexOf('/*.css'), headers.indexOf('/*.js'));
  assert.match(cssBlock, /max-age=31536000, immutable/);
  const pngBlock = headers.slice(headers.indexOf('/*.png'), headers.indexOf('/*.jpg'));
  assert.match(pngBlock, /max-age=86400/);
  assert.doesNotMatch(pngBlock, /immutable/);
  const pushBlock = headers.slice(headers.indexOf('/push-sw.js'));
  assert.match(pushBlock, /! Cache-Control/);
  assert.match(pushBlock, /Cache-Control: no-store/);
  assert.doesNotMatch(pushBlock.slice(pushBlock.indexOf('! Cache-Control')), /immutable/);
});
