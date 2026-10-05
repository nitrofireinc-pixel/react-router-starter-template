import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import worker, {
  DB_SCHEMA_VERSION,
  initDb,
  publicReadJobs,
  publicPhotoUrl,
  resetDbInitCache,
  shouldInvalidatePublicReadCache,
} from '../worker/src/worker.mjs';
import { WORKER_FIRST_ROUTES } from '../worker/src/worker-first-routes.mjs';
import {
  D1_REQUEST_QUERY_SOFT_CAP,
  MAX_D1_QUERIES_PER_INVOCATION,
  PREVIOUS_DB_SCHEMA_VERSION,
  applyIncrementalSchema,
  incrementalSchemaStatements,
  renderIncrementalSchemaSql,
} from '../worker/src/schema-upgrade.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_GET_BUDGET = 12;

const PUBLIC_ROUTES = [
  { path: '/', slug: 'home', title: 'Home', is_home: 1, needsPhotos: true, isHome: true },
  { path: '/fundraising.html', slug: 'fundraising', title: 'Fundraising', is_home: 0, needsEvents: true },
  { path: '/calendar.html', slug: 'calendar', title: 'Calendar', is_home: 0 },
  { path: '/gallery.html', slug: 'gallery', title: 'Gallery', is_home: 0, needsPhotos: true },
  { path: '/sponsors.html', slug: 'sponsors', title: 'Sponsors', is_home: 0 },
  { path: '/join.html', slug: 'join', title: 'Join the Band', is_home: 0 },
];

function createCountingEnv(pages, { schemaVersion = DB_SCHEMA_VERSION } = {}) {
  let queries = 0;
  let rows = 0;
  const pageByPath = new Map(pages.map((page) => [page.path, page]));
  const countRows = (value, type) => {
    if (type === 'first') {
      if (value) rows += 1;
      return;
    }
    rows += Array.isArray(value?.results) ? value.results.length : 0;
  };
  const handleSql = (sql, type, binds = []) => {
    queries += 1;
    const text = String(sql || '');
    let result;
    if (type === 'first' && text.includes('FROM site_content WHERE key')) {
      result = { value: schemaVersion };
    } else if (text.includes('FROM cms_pages WHERE path')) {
      const page = pageByPath.get(binds[0]) || pages.find((item) => item.path === binds[0]) || null;
      result = type === 'first' ? page : { results: page ? [page] : [] };
    } else if (text.includes('FROM cms_pages')) {
      result = type === 'first' ? pages[0] : { results: pages };
    } else if (text.includes('FROM site_content')) {
      result = type === 'first' ? { value: schemaVersion } : { results: [] };
    } else if (text.includes('FROM photos')) {
      result = type === 'first' ? { id: 1, filename: 'a.jpg' } : { results: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, filename: `${i}.jpg` })) };
    } else if (text.includes('FROM sponsors')) {
      result = type === 'first' ? { id: 1 } : { results: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `S${i}` })) };
    } else if (text.includes('FROM caldev_events') || text.includes('FROM events')) {
      result = type === 'first' ? { id: 1 } : { results: Array.from({ length: 5 }, (_, i) => ({ id: i + 1 })) };
    } else {
      result = type === 'first' ? null : { results: [] };
    }
    countRows(result, type);
    return result;
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
      queries += 1;
      return { success: true };
    },
  });
  const session = {
    prepare(sql) {
      return statement(sql);
    },
    async batch(items) {
      return (items || []).map((item) => handleSql(item.sql, 'all', item.binds || []));
    },
    getBookmark() {
      return 'bookmark';
    },
  };
  return {
    count: () => queries,
    rows: () => rows,
    reset() {
      queries = 0;
      rows = 0;
    },
    env: {
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
    },
  };
}

test('run_worker_first lists only Worker routes in both wrangler files', () => {
  const live = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  const dev = readFileSync(join(root, 'wrangler.dev.toml'), 'utf8');
  for (const route of WORKER_FIRST_ROUTES) {
    assert.equal(live.includes(`"${route}"`), true, `wrangler.toml missing ${route}`);
    assert.equal(dev.includes(`"${route}"`), true, `wrangler.dev.toml missing ${route}`);
  }
  assert.doesNotMatch(live, /run_worker_first\s*=\s*true/);
  assert.doesNotMatch(dev, /run_worker_first\s*=\s*true/);
  const headers = readFileSync(join(root, '_headers'), 'utf8');
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /Cache-Control: public, max-age=86400/);
  assert.match(headers, /! Cache-Control/);
  assert.match(headers, /Service-Worker-Allowed: \//);
});

test('public pages keep photo list jobs off every route except home and gallery', () => {
  const stub = { DB: { prepare() { return { bind() { return this; } }; } } };
  const calendar = publicReadJobs(stub, { path: '/calendar.html', today: '2026-10-04' });
  assert.equal(calendar.some((job) => job.key === 'photos'), false);
  const home = publicReadJobs(stub, { path: '/', today: '2026-10-04', isHome: true, needsPhotos: true });
  assert.equal(home.some((job) => job.key === 'photos'), true);
  const gallery = publicReadJobs(stub, { path: '/gallery.html', today: '2026-10-04', needsPhotos: true });
  assert.equal(gallery.some((job) => job.key === 'photos'), true);
  assert.ok(calendar.length <= PUBLIC_GET_BUDGET);
  assert.ok(home.length <= PUBLIC_GET_BUDGET);
});

test('public GET routes stay at or under 10 D1 queries; no request exceeds 40', async () => {
  const pages = PUBLIC_ROUTES.map((route) => ({
    id: route.slug.length,
    slug: route.slug,
    path: route.path,
    title: route.title,
    body_html: `<section class="content"><div class="wrap"><p>${route.title}</p></div></section>`,
    nav_order: 1,
    is_home: route.is_home,
    active: 1,
  }));
  const counts = {};
  for (const route of PUBLIC_ROUTES) {
    resetDbInitCache();
    const boxed = createCountingEnv(pages);
    const request = new Request(`https://efhsband-dev.example${route.path}`);
    const cold = await worker.fetch(request, boxed.env, { waitUntil() {} });
    assert.ok(cold.status < 500, `${route.path} cold status ${cold.status}`);
    const coldQueries = boxed.count();
    const coldRows = boxed.rows();
    assert.ok(coldQueries <= PUBLIC_GET_BUDGET, `${route.path} cold used ${coldQueries} D1 queries`);
    assert.ok(coldQueries <= MAX_D1_QUERIES_PER_INVOCATION, `${route.path} cold exceeded 40`);
    boxed.reset();
    const warm = await worker.fetch(request, boxed.env, { waitUntil() {} });
    assert.ok(warm.status < 500, `${route.path} warm status ${warm.status}`);
    const warmQueries = boxed.count();
    const warmRows = boxed.rows();
    assert.ok(warmQueries <= PUBLIC_GET_BUDGET, `${route.path} warm used ${warmQueries} D1 queries`);
    counts[route.path] = {
      cold: coldQueries,
      warm: warmQueries,
      coldRows,
      warmRows,
      status: cold.status,
    };
  }
  console.log('d1_query_budget', JSON.stringify(counts));
  const contact = createCountingEnv(pages);
  resetDbInitCache();
  const posted = await worker.fetch(new Request('https://efhsband-dev.example/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Pat', email: 'pat@example.com', message: 'Hello', topic_id: 1 }),
  }), contact.env, { waitUntil() {} });
  assert.ok(contact.count() <= MAX_D1_QUERIES_PER_INVOCATION, `contact POST used ${contact.count()}`);
  assert.ok(posted.status < 500 || posted.status === 422);
});

test('go-live SQL matches the incremental statements and stays under 40 queries with 20 concurrent first requests', async () => {
  const sqlFile = [
    readFileSync(join(root, 'migrations/2026-10-04.1.sql'), 'utf8'),
    readFileSync(join(root, 'migrations/2026-10-04.2.sql'), 'utf8'),
    readFileSync(join(root, 'migrations/2026-10-04.3.sql'), 'utf8'),
    readFileSync(join(root, 'migrations/2026-10-04.4.sql'), 'utf8'),
    readFileSync(join(root, 'migrations/2026-10-04.5.sql'), 'utf8'),
    readFileSync(join(root, 'migrations/2026-10-04.6.sql'), 'utf8'),
  ].join('\n');
  const rendered = renderIncrementalSchemaSql(DB_SCHEMA_VERSION);
  const normalize = (value) => value.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(normalize(sqlFile).includes('CREATE TABLE IF NOT EXISTS visual_pages'), true);
  assert.equal(normalize(sqlFile).includes('CREATE TABLE IF NOT EXISTS visual_page_versions'), true);
  assert.equal(normalize(sqlFile).includes('CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_update'), true);
  assert.equal(normalize(sqlFile).includes('idx_audit_created'), true);
  assert.equal(sqlFile.includes('prev_sha256'), true);
  assert.equal(normalize(sqlFile).includes('ALTER TABLE admin_audit_log ADD COLUMN'), false);
  assert.equal(normalize(sqlFile).includes('admin_audit_export_sessions'), true);
  assert.equal(normalize(sqlFile).includes("schema_version"), true);
  for (const statement of incrementalSchemaStatements()) {
    if (/^\s*ALTER TABLE/i.test(statement)) continue;
    if (/admin_audit_log_linear_insert/i.test(statement)) continue;
    if (/idx_audit_prev_id|idx_audit_source_pending/i.test(statement)) continue;
    assert.equal(normalize(sqlFile).includes(normalize(statement)), true, statement.slice(0, 60));
  }
  assert.equal(normalize(rendered).includes('visual_pages'), true);
  assert.ok(incrementalSchemaStatements().length + 1 <= MAX_D1_QUERIES_PER_INVOCATION);

  const results = await Promise.all(Array.from({ length: 20 }, async () => {
    let queries = 0;
    const env = {
      DB: {
        prepare(sql) {
          return {
            bind() { return this; },
            async first() {
              queries += 1;
              return null;
            },
            async all() {
              queries += 1;
              return { results: [] };
            },
            async run() {
              queries += 1;
              return { success: true };
            },
          };
        },
        async batch(items) {
          queries += items?.length || 0;
          return (items || []).map(() => ({ success: true }));
        },
      },
    };
    await applyIncrementalSchema(env, {
      writeVersion: async () => {
        queries += 1;
      },
    });
    return queries;
  }));
  assert.equal(results.length, 20);
  for (const count of results) {
    assert.ok(count <= MAX_D1_QUERIES_PER_INVOCATION, `concurrent upgrade used ${count}`);
    assert.ok(count >= incrementalSchemaStatements().length);
  }

  resetDbInitCache();
  let sharedQueries = 0;
  const shared = {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            sharedQueries += 1;
            if (String(sql).includes('FROM site_content WHERE key')) {
              return { value: PREVIOUS_DB_SCHEMA_VERSION };
            }
            return null;
          },
          async all() {
            sharedQueries += 1;
            return { results: [] };
          },
          async run() {
            sharedQueries += 1;
            return { success: true };
          },
        };
      },
      async batch(items) {
        sharedQueries += items?.length || 0;
        return (items || []).map(() => ({ success: true }));
      },
    },
  };
  await Promise.all(Array.from({ length: 20 }, () => initDb(shared)));
  assert.ok(sharedQueries <= MAX_D1_QUERIES_PER_INVOCATION, `shared isolate used ${sharedQueries}`);
});

test('admin login gate answers GET and HEAD without invoking form parsing', async () => {
  const boxed = createCountingEnv(PUBLIC_ROUTES.map((route) => ({
    id: 1,
    slug: route.slug,
    path: route.path,
    title: route.title,
    body_html: '<p>x</p>',
    nav_order: 1,
    is_home: route.is_home,
    active: 1,
  })));
  resetDbInitCache();
  const get = await worker.fetch(new Request('https://efhsband-dev.example/admin/login'), boxed.env, { waitUntil() {} });
  assert.equal(get.status, 200);
  assert.match(await get.text(), /Admin Login/);
  boxed.reset();
  const head = await worker.fetch(new Request('https://efhsband-dev.example/admin/login', { method: 'HEAD' }), boxed.env, { waitUntil() {} });
  assert.ok(head.status < 500, `HEAD /admin/login returned ${head.status}`);
  assert.ok(boxed.count() <= MAX_D1_QUERIES_PER_INVOCATION);
});

test('photo cache headers and purge rules stay on the Free-plan path', () => {
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const clientSrc = readFileSync(join(root, 'site-content.js'), 'utf8');
  assert.match(workerSrc, /max-age=86400, s-maxage=0/);
  assert.match(workerSrc, /PHOTO_CACHE_API_TTL = 'public, s-maxage=3600'/);
  assert.match(workerSrc, /needsPhotos: pageIsLive && \(isHome \|\| page\.slug === 'gallery'\)/);
  assert.match(workerSrc, /shouldInvalidatePublicReadCache/);
  assert.match(workerSrc, /matchUploadCache/);
  assert.match(clientSrc, /data-photo-gallery/);
  assert.equal(shouldInvalidatePublicReadCache('/api/email-subscribe', 'POST'), false);
  assert.equal(shouldInvalidatePublicReadCache('/api/admin/site', 'POST'), true);
  assert.equal(shouldInvalidatePublicReadCache('/api/admin/maintenance', 'POST'), true);
  assert.match(publicPhotoUrl({ id: 1, filename: 'a.jpg', created_at: '2026-01-01' }), /\?v=1-/);
});

test('every worker route stays at or under 45 D1 queries including retries', async () => {
  const pages = PUBLIC_ROUTES.map((route) => ({
    id: route.slug.length,
    slug: route.slug,
    path: route.path,
    title: route.title,
    body_html: `<section class="content"><div class="wrap"><p>${route.title}</p></div></section>`,
    nav_order: 1,
    is_home: route.is_home,
    active: 1,
  }));
  const routes = [
    ...PUBLIC_ROUTES.map((route) => ({ path: route.path, method: 'GET' })),
    { path: '/missing-page-404', method: 'GET' },
    { path: '/admin/login', method: 'GET' },
    { path: '/admin/login', method: 'POST', body: 'username=nope&password=nope', headers: { 'content-type': 'application/x-www-form-urlencoded' } },
    { path: '/admin/logout', method: 'GET' },
    { path: '/admin/visual/join', method: 'GET' },
    { path: '/api/admin/security-log/verify/complete', method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } },
    { path: '/api/admin/security-log/export/complete', method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } },
    { path: '/api/admin/pages/join', method: 'PUT', body: '{"body_html":"<p>x</p>"}', headers: { 'content-type': 'application/json' } },
  ];
  const counts = {};
  for (const route of routes) {
    resetDbInitCache();
    const boxed = createCountingEnv(pages);
    const request = new Request(`https://efhsband-dev.example${route.path}`, {
      method: route.method,
      headers: route.headers,
      body: route.body,
    });
    const response = await worker.fetch(request, boxed.env, { waitUntil() {} });
    assert.ok(response.status < 500, `${route.method} ${route.path} status ${response.status}`);
    const used = boxed.count();
    assert.ok(used <= D1_REQUEST_QUERY_SOFT_CAP, `${route.method} ${route.path} used ${used} D1 queries`);
    counts[`${route.method} ${route.path}`] = { queries: used, status: response.status };
  }
  console.log(JSON.stringify({ max_d1_queries_per_route: counts }));
});
