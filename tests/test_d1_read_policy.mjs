import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PUBLIC_READ_INDEX_SQL,
  PUBLIC_READ_PENDING_TIMEOUT_MS,
  attachD1Bookmark,
  cachedPublicRead,
  d1SessionBookmark,
  invalidatePublicReadCache,
  openD1Session,
  peekPublicRead,
  readCachedQueryBatch,
  renderPublicReadBootstrap,
  resetPublicReadCache,
} from '../worker/src/d1-read-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('public reads use an unconstrained session and writes stay on the primary', () => {
  const home = new Request('https://efhsband.org/');
  const post = new Request('https://efhsband.org/api/admin/pages', { method: 'POST' });
  const adminGet = new Request('https://efhsband.org/admin');
  const upload = new Request('https://efhsband.org/uploads/photo.jpg');
  const continued = new Request('https://efhsband.org/', { headers: { 'x-d1-bookmark': 'bookmark-1' } });
  assert.equal(d1SessionBookmark(home), 'first-unconstrained');
  assert.equal(d1SessionBookmark(post), 'first-primary');
  assert.equal(d1SessionBookmark(adminGet), 'first-primary');
  assert.equal(d1SessionBookmark(upload), 'first-primary');
  assert.equal(d1SessionBookmark(continued), 'bookmark-1');
});

test('openD1Session binds withSession when the driver supports it', async () => {
  const seen = [];
  const session = {
    prepare(sql) {
      seen.push(sql);
      return session;
    },
    getBookmark() {
      return 'bookmark-2';
    },
  };
  const env = {
    DB: {
      withSession(bookmark) {
        seen.push(bookmark);
        return session;
      },
    },
    ASSETS: { fetch() {} },
  };
  const opened = openD1Session(new Request('https://efhsband.org/'), env);
  assert.equal(opened.bookmark, 'first-unconstrained');
  assert.equal(opened.env.DB, session);
  assert.equal(opened.env.ASSETS, env.ASSETS);
  opened.env.DB.prepare('SELECT 1');
  assert.deepEqual(seen, ['first-unconstrained', 'SELECT 1']);
  const response = attachD1Bookmark(new Response('ok'), opened.session);
  assert.equal(response.headers.get('x-d1-bookmark'), 'bookmark-2');
  const plain = openD1Session(new Request('https://efhsband.org/'), { DB: { prepare() {} } });
  assert.equal(plain.session, null);
  assert.equal(plain.env.DB, plain.env.DB);
});

test('public read cache coalesces misses and drops after a write', async () => {
  resetPublicReadCache();
  let loads = 0;
  const loader = async () => {
    loads += 1;
    return { title: 'East Forsyth Band' };
  };
  const [first, second] = await Promise.all([
    cachedPublicRead('site', loader),
    cachedPublicRead('site', loader),
  ]);
  assert.equal(loads, 1);
  assert.equal(first.title, 'East Forsyth Band');
  assert.equal(second.title, first.title);
  assert.equal((await cachedPublicRead('site', loader)).title, 'East Forsyth Band');
  assert.equal(loads, 1);
  await invalidatePublicReadCache();
  assert.equal((await cachedPublicRead('site', loader)).title, 'East Forsyth Band');
  assert.equal(loads, 2);
});

test('cache misses for one page load share a single D1 batch', async () => {
  resetPublicReadCache();
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          sql,
          all() {
            calls.push(`all:${sql}`);
            return Promise.resolve({ results: [{ sql }] });
          },
        };
      },
      batch(statements) {
        calls.push(`batch:${statements.length}`);
        return Promise.resolve(statements.map((statement) => ({ results: [{ sql: statement.sql }] })));
      },
    },
  };
  const jobs = [
    {
      key: 'sponsors',
      statement: () => env.DB.prepare('SELECT sponsors'),
      parse: (result) => result.results,
    },
    {
      key: 'photos',
      statement: () => env.DB.prepare('SELECT photos'),
      parse: (result) => result.results,
    },
  ];
  const first = await readCachedQueryBatch(env, jobs);
  const second = await readCachedQueryBatch(env, jobs);
  assert.deepEqual(calls, ['batch:2']);
  assert.equal(first.get('sponsors')[0].sql, 'SELECT sponsors');
  assert.equal(second.get('photos')[0].sql, 'SELECT photos');
});

test('stuck pending public reads time out, evict, and fall back to a direct read', async () => {
  resetPublicReadCache();
  let loads = 0;
  const result = await cachedPublicRead('stuck-site', async () => {
    loads += 1;
    if (loads === 1) return new Promise(() => {});
    return { title: 'recovered' };
  }, { timeoutMs: 40 });
  assert.equal(result.title, 'recovered');
  assert.equal(loads, 2);
  assert.equal(peekPublicRead('stuck-site').hit, true);
  assert.equal((await cachedPublicRead('stuck-site', async () => {
    loads += 1;
    return { title: 'should-not-run' };
  }, { timeoutMs: 40 })).title, 'recovered');
  assert.equal(loads, 2);
});

test('concurrent waiters on a stuck pending time out and fall back to a direct read', async () => {
  resetPublicReadCache();
  let loads = 0;
  const loader = async () => {
    loads += 1;
    if (loads === 1) return new Promise(() => {});
    return { title: `recovered-${loads}` };
  };
  const [first, second] = await Promise.all([
    cachedPublicRead('shared-stuck', loader, { timeoutMs: 40 }),
    cachedPublicRead('shared-stuck', loader, { timeoutMs: 40 }),
  ]);
  assert.match(first.title, /^recovered-/);
  assert.match(second.title, /^recovered-/);
  assert.ok(loads >= 2, `expected a fallback load, got ${loads}`);
  assert.equal(peekPublicRead('shared-stuck').hit, true);
});

test('edge cache writes use ctx.waitUntil and do not block the request path', async () => {
  resetPublicReadCache();
  const waited = [];
  const ctx = {
    waitUntil(promise) {
      waited.push(promise);
    },
  };
  let putStarted;
  const putBegan = new Promise((resolve) => {
    putStarted = resolve;
  });
  const originalCaches = globalThis.caches;
  globalThis.caches = {
    default: {
      async match() {
        return undefined;
      },
      put() {
        putStarted();
        return new Promise(() => {});
      },
    },
  };
  try {
    const value = await cachedPublicRead('wait-until-site', async () => ({ ok: true }), { ctx });
    assert.deepEqual(value, { ok: true });
    assert.equal(waited.length, 1);
    assert.equal(typeof waited[0]?.then, 'function');
    await putBegan;
    resetPublicReadCache();
    const noCtx = await cachedPublicRead('void-fallback-site', async () => ({ ok: true }));
    assert.deepEqual(noCtx, { ok: true });
  } finally {
    globalThis.caches = originalCaches;
    resetPublicReadCache();
  }
});

test('rejected public reads are evicted so the next caller can load again', async () => {
  resetPublicReadCache();
  let loads = 0;
  await assert.rejects(
    () => cachedPublicRead('bad-site', async () => {
      loads += 1;
      throw new Error('d1 failed');
    }, { timeoutMs: 40 }),
    /d1 failed|public-read-timeout/,
  );
  assert.equal(peekPublicRead('bad-site').hit, false);
  const recovered = await cachedPublicRead('bad-site', async () => {
    loads += 1;
    return { title: 'ok' };
  }, { timeoutMs: 40 });
  assert.equal(recovered.title, 'ok');
  assert.equal(loads, 2);
});

test('bootstrap JSON cannot close the script tag', () => {
  const html = renderPublicReadBootstrap({
    site: { title: 'East Forsyth Band' },
    sponsors: [],
    photos: [{ caption: '</script><img src=x onerror=alert(1)>' }],
    deadlineBanners: [],
  });
  assert.match(html, /id="efhs-public-read"/);
  assert.doesNotMatch(html, /<\/script><img/);
  const json = html.match(/<script type="application\/json" id="efhs-public-read">([\s\S]*)<\/script>/)[1];
  const parsed = JSON.parse(json);
  assert.equal(parsed.photos[0].caption, '</script><img src=x onerror=alert(1)>');
  assert.equal(parsed.square, null);
});

test('worker source follows the public D1 read policy', () => {
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const caldevSrc = readFileSync(join(root, 'worker/src/caldev.mjs'), 'utf8');
  const clientSrc = readFileSync(join(root, 'site-content.js'), 'utf8');
  assert.equal(workerSrc.includes("export const DB_SCHEMA_VERSION = '2026-10-04.4'"), true);
  assert.match(workerSrc, /SELECT key, value FROM site_content WHERE key IN/);
  assert.match(workerSrc, /error_pages/);
  assert.match(workerSrc, /loadPublicCmsReads\(env/);
  assert.match(workerSrc, /serveStaticOrCms\(request, env, url, ctx\)/);
  assert.match(workerSrc, /cachedPublicRead\('site', \(\) => getSite\(env\), \{ ctx \}\)/);
  assert.match(workerSrc, /id="efhs-public-read"|renderPublicReadBootstrap/);
  assert.match(workerSrc, /openD1Session\(request, env\)/);
  assert.match(workerSrc, /invalidatePublicReadCache\(\)/);
  assert.doesNotMatch(workerSrc, /SELECT \* FROM cms_pages/);
  assert.match(workerSrc, /ORDER BY sort_order ASC, created_at DESC, id DESC/);
  assert.doesNotMatch(workerSrc, /datetime\(created_at\)/);
  assert.match(workerSrc, /PUBLIC_READ_INDEX_SQL\.map/);
  const policySrc = readFileSync(join(root, 'worker/src/d1-read-policy.mjs'), 'utf8');
  assert.match(policySrc, /PUBLIC_READ_PENDING_TIMEOUT_MS/);
  assert.equal(PUBLIC_READ_PENDING_TIMEOUT_MS >= 1000, true);
  assert.match(policySrc, /public-read-timeout/);
  assert.match(policySrc, /evictIfPending/);
  assert.match(policySrc, /scheduleEdgeCacheWrite/);
  assert.match(policySrc, /ctx\.waitUntil\(write\)/);
  assert.match(policySrc, /else void write/);
  for (const sql of PUBLIC_READ_INDEX_SQL) {
    assert.equal(policySrc.includes(sql), true, sql);
  }
  assert.match(caldevSrc, /WHERE track = 'deadline' AND start_date != ''/);
  assert.doesNotMatch(caldevSrc, /lower\(track\) = 'deadline'/);
  assert.match(clientSrc, /function readPublicBootstrap\(/);
  assert.match(clientSrc, /Array\.isArray\(bootstrap\?\.sponsors\)/);
  assert.match(clientSrc, /Array\.isArray\(bootstrap\?\.photos\)/);
  assert.match(clientSrc, /Array\.isArray\(bootstrap\?\.deadlineBanners\)/);
  const navSrc = readFileSync(join(root, 'script.js'), 'utf8');
  assert.match(navSrc, /function readBootstrapSite\(/);
  assert.match(navSrc, /getElementById\('efhs-public-read'\)/);
});
