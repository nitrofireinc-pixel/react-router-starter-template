import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import worker, {
  ASSET_VERSION,
  DEFAULT_ERROR_PAGES,
  DEFAULT_INSTAGRAM_HREF,
  ERROR_DEFAULTS,
  mergeErrorCopy,
  normalizeErrorPages,
  publicSitePayload,
  renderErrorPage,
  renderLiteErrorHtml,
  resetDbInitCache,
} from '../worker/src/worker.mjs';
import { resetPublicReadCache } from '../worker/src/d1-read-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function createErrorEnv({
  maintenanceOn = false,
  throwOnDb = false,
  queryCounter = { n: 0 },
  errorPages = null,
  instagram = DEFAULT_INSTAGRAM_HREF,
  extraEnv = {},
  extraPages = [],
} = {}) {
  const home = {
    id: 1,
    slug: 'home',
    path: '/',
    title: 'Home',
    body_html: '<section class="content"><div class="wrap"><p>Home</p></div></section>',
    nav_order: 1,
    is_home: 1,
    active: 1,
  };
  const pages = [home, ...extraPages];
  const handleSql = (sql, type, binds = []) => {
    queryCounter.n += 1;
    if (throwOnDb) throw new Error('d1 exploded');
    const text = String(sql || '');
    if (type === 'first' && text.includes('FROM site_content WHERE key')) {
      return { value: '2026-10-04.6' };
    }
    if (text.includes('FROM site_content WHERE key IN')) {
      const results = [
        { key: 'title', value: 'East Forsyth Band' },
        { key: 'maintenance_mode', value: maintenanceOn ? '1' : '0' },
        { key: 'social_links', value: JSON.stringify([{ platform: 'instagram', href: instagram }]) },
      ];
      if (errorPages) results.push({ key: 'error_pages', value: JSON.stringify(errorPages) });
      return { results };
    }
    if (text.includes('FROM cms_pages WHERE path')) {
      const match = pages.find((page) => page.path === binds[0]) || null;
      return type === 'first' ? match : { results: match ? [match] : [] };
    }
    if (text.includes('FROM cms_pages')) {
      return type === 'first' ? home : { results: pages };
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
      queryCounter.n += 1;
      return { success: true };
    },
  });
  const session = {
    prepare: (sql) => statement(sql),
    async batch(items) {
      return (items || []).map((item) => handleSql(item.sql, 'all', item.binds || []));
    },
    getBookmark() {
      return '';
    },
  };
  return {
    queryCounter,
    env: {
      EFBAND_SECRET: 'test-session-secret',
      DB: {
        withSession() { return session; },
        prepare: session.prepare,
        batch: session.batch,
      },
      ASSETS: {
        async fetch() {
          return new Response('missing', { status: 404 });
        },
      },
      ...extraEnv,
    },
  };
}

function resetCaches() {
  resetDbInitCache();
  resetPublicReadCache();
}

test('error page defaults merge CMS overrides and keep Instagram fallback', () => {
  const merged = mergeErrorCopy(404, {
    error_pages: { 404: { title: 'Custom 404', copy: '', link_label: 'Calendar', link_href: '/calendar.html' } },
  });
  assert.equal(merged.title, 'Custom 404');
  assert.equal(merged.copy, ERROR_DEFAULTS[404].copy);
  const denied = mergeErrorCopy(403, {});
  assert.equal(denied.title, 'Access Denied');
  const down = mergeErrorCopy(503, { social_links: [] });
  assert.equal(down.link_href, DEFAULT_INSTAGRAM_HREF);
  const social = mergeErrorCopy(503, {
    social_links: [{ platform: 'instagram', href: 'https://www.instagram.com/customband' }],
    error_pages: { 503: { link_href: '' } },
  });
  assert.equal(social.link_href, 'https://www.instagram.com/customband');
  assert.deepEqual(Object.keys(normalizeErrorPages(null)).sort(), ['401', '403', '404', '429', '500', '503']);
  assert.equal(publicSitePayload({}).error_pages['404'].title, DEFAULT_ERROR_PAGES['404'].title);
});

test('inactive unpublished pages use the branded 404; Coming Soon slugs stay public', async () => {
  resetCaches();
  const boxed = createErrorEnv({
    extraPages: [
      {
        id: 9,
        slug: 'ensembles',
        path: '/ensembles.html',
        title: 'Ensembles',
        body_html: '<section><p>Secret draft ensembles</p></section>',
        nav_order: 9,
        is_home: 0,
        active: 0,
      },
      {
        id: 22,
        slug: 'coming-soon',
        path: '/coming-soon.html',
        title: 'Coming Soon',
        body_html: '<section><h1>Coming soon</h1><p>This page is on the way.</p></section>',
        nav_order: 22,
        is_home: 0,
        active: 1,
      },
    ],
  });
  const hidden = await worker.fetch(new Request('https://efhsband.org/ensembles.html'), boxed.env, { waitUntil() {} });
  assert.equal(hidden.status, 404);
  const hiddenHtml = await hidden.text();
  assert.match(hiddenHtml, /error-page error-404/);
  assert.match(hiddenHtml, /Page Not Found/);
  assert.doesNotMatch(hiddenHtml, /Secret draft ensembles/);
  assert.doesNotMatch(hiddenHtml, /This page is on the way/);

  const soon = await worker.fetch(new Request('https://efhsband.org/coming-soon.html'), boxed.env, { waitUntil() {} });
  assert.equal(soon.status, 200);
  const soonHtml = await soon.text();
  assert.match(soonHtml, /Coming soon/i);
  assert.doesNotMatch(soonHtml, /error-page error-404/);
});

test('public 404 uses the hero copy, not Coming Soon, with no-store and noindex', async () => {
  resetCaches();
  const boxed = createErrorEnv();
  const response = await worker.fetch(new Request('https://efhsband.org/no-such-page.html'), boxed.env, { waitUntil() {} });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /error-page error-404/);
  assert.match(html, /marched off the field/);
  assert.match(html, /err-code/);
  assert.match(html, /efhs-blue-regiment-mark/);
  assert.match(html, /error-page\.css\?v=/);
  assert.doesNotMatch(html, /COMING SOON|Coming soon|This page is on the way/);
  assert.match(html, /active: 1|error-404/);
});

test('403 and 401 HTML pages set the right headers and 401 has no WWW-Authenticate', async () => {
  resetCaches();
  const boxed = createErrorEnv();
  const forbidden = await renderErrorPage(403, {
    env: boxed.env,
    url: new URL('https://efhsband.org/admin/visual/secret'),
    detail: 'Site settings permission is required.',
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'no-store');
  assert.equal(forbidden.headers.get('x-robots-tag'), 'noindex');
  assert.equal(forbidden.headers.get('www-authenticate'), null);
  const forbiddenHtml = await forbidden.text();
  assert.match(forbiddenHtml, /Access Denied|backstage/);
  assert.match(forbiddenHtml, /Site settings permission is required/);

  const signin = await renderErrorPage(401, {
    env: boxed.env,
    url: new URL('https://efhsband.org/minutes.html'),
  });
  assert.equal(signin.status, 401);
  assert.equal(signin.headers.get('www-authenticate'), null);
  assert.equal(signin.headers.get('x-robots-tag'), 'noindex');
  const signinHtml = await signin.text();
  assert.match(signinHtml, /Sign-In Needed|sign in to continue/i);
  assert.match(signinHtml, /\/admin\/login\?next=/);
});

test('lite 500, 503, and 429 never touch D1 and send Retry-After', async () => {
  const html500 = renderLiteErrorHtml(500, mergeErrorCopy(500, {}, { path: '/join.html' }));
  assert.match(html500, /error-500 lite/);
  assert.match(html500, /wrong note/);
  assert.match(html500, /lite-bar/);
  assert.doesNotMatch(html500, /site-header|sponsor-marquee/);

  resetCaches();
  const boxed = createErrorEnv({ maintenanceOn: true });
  const before = boxed.queryCounter.n;
  const unavailable = await worker.fetch(new Request('https://efhsband.org/'), boxed.env, { waitUntil() {} });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('retry-after'), '600');
  assert.equal(unavailable.headers.get('x-robots-tag'), 'noindex');
  const maintHtml = await unavailable.text();
  assert.match(maintHtml, /error-503 lite/);
  assert.match(maintHtml, /tuning up the site/);
  assert.match(maintHtml, /instagram\.com/);
  assert.match(maintHtml, /location\.reload/);
  assert.ok(boxed.queryCounter.n > before);

  const limited = await renderErrorPage(429, { url: new URL('https://efhsband.org/calendar.html'), shell: 'lite' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.match(await limited.text(), /double time/);
});

test('/api and /health stay JSON, including the top-level 500 catch', async () => {
  resetCaches();
  const boxed = createErrorEnv();
  const missing = await worker.fetch(new Request('https://efhsband.org/api/does-not-exist'), boxed.env, { waitUntil() {} });
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await missing.json(), { detail: 'Not found' });

  const health = await worker.fetch(new Request('https://efhsband.org/health'), boxed.env, { waitUntil() {} });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  resetCaches();
  const down = createErrorEnv({ throwOnDb: true });
  const apiFail = await worker.fetch(new Request('https://efhsband.org/api/site'), down.env, { waitUntil() {} });
  assert.equal(apiFail.status, 500);
  assert.match(apiFail.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await apiFail.json(), { detail: 'Server error' });
});

test('D1 query count on 404 stays within the public GET budget and does not add an error_pages query', async () => {
  resetCaches();
  const boxed = createErrorEnv();
  const first = await worker.fetch(new Request('https://efhsband.org/missing-page.html'), boxed.env, { waitUntil() {} });
  assert.equal(first.status, 404);
  const cold = boxed.queryCounter.n;
  assert.ok(cold <= 12, `404 cold used ${cold} D1 queries`);
  boxed.queryCounter.n = 0;
  const second = await worker.fetch(new Request('https://efhsband.org/missing-page.html'), boxed.env, { waitUntil() {} });
  assert.equal(second.status, 404);
  const warm = boxed.queryCounter.n;
  assert.ok(warm <= cold, `404 warm ${warm} should not exceed cold ${cold}`);
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.doesNotMatch(workerSrc, /FROM site_content WHERE key = ['"]error_pages['"]/);
  assert.match(workerSrc, /error_pages: JSON.stringify\(DEFAULT_ERROR_PAGES\)/);
  assert.match(workerSrc, /active: 1/);
});

test('a thrown D1 read returns the lite 500 instead of Cloudflare 1101', async () => {
  resetCaches();
  const boxed = createErrorEnv({ throwOnDb: true });
  const response = await worker.fetch(new Request('https://efhsband.org/join.html'), boxed.env, { waitUntil() {} });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  const html = await response.text();
  assert.match(html, /error-page error-500 lite/);
  assert.match(html, /wrong note/);
  assert.match(html, /Return Home/);
  assert.doesNotMatch(html, /1101|Error 1101/);
});

test('error assets, CMS gate, and worker wiring are in source', () => {
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const adminSrc = readFileSync(join(root, 'admin.js'), 'utf8');
  const syncSrc = readFileSync(join(root, 'worker/scripts/sync-public.mjs'), 'utf8');
  assert.equal(ASSET_VERSION, 'cms-p1-20261005f');
  assert.match(workerSrc, /export async function renderErrorPage/);
  assert.match(workerSrc, /liteErrorResponse\(500/);
  assert.match(workerSrc, /Error pages/);
  assert.match(workerSrc, /data-error-pages-card/);
  assert.match(adminSrc, /collectErrorPages/);
  assert.match(adminSrc, /payload\.error_pages/);
  assert.match(syncSrc, /'error-page\.css'/);
  assert.equal(existsSync(join(root, 'error-page.css')), true);
  assert.equal(existsSync(join(root, 'assets/error/instrument-hero.webp')), true);
  assert.equal(existsSync(join(root, 'assets/error/instrument-hero-480.webp')), true);
  assert.match(readFileSync(join(root, 'error-page.css'), 'utf8'), /instrument-hero/);
  assert.match(workerSrc, /shell: 'lite'/);
  assert.doesNotMatch(workerSrc, /WWW-Authenticate|www-authenticate/);
  assert.match(workerSrc, /DEV_ERROR_HOOK/);
  assert.match(workerSrc, /DEV_ERROR_HOOK_RE/);
  assert.match(workerSrc, /__dev\\\/error\\\/\(401\|403\|404\|429\|500\|503\)/);
  const liveToml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  const devToml = readFileSync(join(root, 'wrangler.dev.toml'), 'utf8');
  assert.doesNotMatch(liveToml, /DEV_ERROR_HOOK/);
  assert.doesNotMatch(liveToml, /\/__dev\//);
  assert.match(devToml, /DEV_ERROR_HOOK\s*=\s*"1"/);
  assert.match(devToml, /"\/__dev\/\*"/);
});

test('DEV error hook is disabled without DEV_ERROR_HOOK and renders branded pages when enabled', async () => {
  resetCaches();
  const off = createErrorEnv();
  const hidden = await worker.fetch(new Request('https://efhsband.org/__dev/error/500'), off.env, { waitUntil() {} });
  assert.equal(hidden.status, 404);
  assert.match(await hidden.text(), /error-page error-404/);

  resetCaches();
  const on = createErrorEnv({ extraEnv: { DEV_ERROR_HOOK: '1' } });
  const ctx = { waitUntil() {} };
  const page500 = await worker.fetch(new Request('https://efhsband.org/__dev/error/500'), on.env, ctx);
  assert.equal(page500.status, 500);
  assert.match(await page500.text(), /error-page error-500 lite/);

  const page503 = await worker.fetch(new Request('https://efhsband.org/__dev/error/503'), on.env, ctx);
  assert.equal(page503.status, 503);
  assert.equal(page503.headers.get('retry-after'), '600');
  const hook503 = await page503.text();
  assert.match(hook503, /error-page error-503 lite/);
  assert.doesNotMatch(hook503, /location\.reload/);

  const page403 = await worker.fetch(new Request('https://efhsband.org/__dev/error/403'), on.env, ctx);
  assert.equal(page403.status, 403);
  assert.match(await page403.text(), /error-page error-403/);

  const page404 = await worker.fetch(new Request('https://efhsband.org/__dev/error/404'), on.env, ctx);
  assert.equal(page404.status, 404);
  assert.match(await page404.text(), /error-page error-404/);

  const unknown = await worker.fetch(new Request('https://efhsband.org/__dev/error/418'), on.env, ctx);
  assert.equal(unknown.status, 404);
});
