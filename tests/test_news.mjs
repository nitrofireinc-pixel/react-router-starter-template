import test from 'node:test';
import assert from 'node:assert/strict';
import { pickHomeNews, sortNews, renderHomeNewsStripHtml, validateNewsImage, normalizeNewsPayload, NEWS_IMAGE_MAX_BYTES, routeNewsApi, sanitizeNewsBodyHtml, renderNewsAdminHtml, renderNewsItemBody, NEWS_ADMIN_JS } from '../worker/src/news.mjs';

const T = '2026-10-30';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);

test('strip hidden when no items', () => {
  assert.equal(pickHomeNews([], T), null);
  assert.equal(renderHomeNewsStripHtml(null), '');
});
test('expired, draft and not-on-home items are hidden; newest wins', () => {
  const items = [
    { id: 1, published: 1, show_on_home: 1, news_date: '2026-10-29', expires_at: '2026-10-29' },
    { id: 2, published: 0, show_on_home: 1, news_date: '2026-10-30' },
    { id: 3, published: 1, show_on_home: 0, news_date: '2026-10-30' },
    { id: 4, published: 1, show_on_home: 1, news_date: '2026-10-20' },
    { id: 5, published: 1, show_on_home: 1, news_date: '2026-10-25', expires_at: T },
  ];
  assert.equal(pickHomeNews(items, T).id, 5);
  const html = renderHomeNewsStripHtml({ id: 5, headline: '<b>Hi</b>', teaser: 't', news_date: '2026-10-25' });
  assert.match(html, /href="\/news\/5"/);
  assert.match(html, /&lt;b&gt;Hi/);
  assert.match(html, /All news <\/span>→/);
  assert.match(html, /📰<\/span> NEWS/);
  assert.match(html, /\.news-all{flex:none;width:34px;height:34px;border-radius:50%;background:#f2c200/);
  assert.match(html, /\.news-all-txt\{display:none\}/); // Q80 phone arrow
});
test('pinned first', () => {
  const s = sortNews([{ id: 1, pinned: 0, news_date: '2026-10-30' }, { id: 2, pinned: 1, news_date: '2026-01-01' }]);
  assert.equal(s[0].id, 2);
});
test('image validation: 10 MB max, image types only', () => {
  assert.equal(validateNewsImage(NEWS_IMAGE_MAX_BYTES, png).mime, 'image/png');
  assert.match(validateNewsImage(NEWS_IMAGE_MAX_BYTES + 1, png).error, /10 MB/);
  assert.match(validateNewsImage(100, new TextEncoder().encode('<svg onload=x>')).error, /Only JPG/);
  assert.ok(validateNewsImage(100, new TextEncoder().encode('GIF89a')).error, 'GIF dropped for news');
});
test('payload rejects typed external links and photo URLs', () => {
  const n = normalizeNewsPayload({ headline: 'X', link_url: 'https://evil.example', photo_url: 'javascript:x', teaser: 'a'.repeat(300) });
  assert.equal(n.link_url, '');
  assert.equal(n.photo_url, '');
  assert.equal(n.teaser.length, 160);
  assert.throws(() => normalizeNewsPayload({ headline: ' ' }));
});
test('upload requires admin auth', async () => {
  const res = await routeNewsApi(new Request('https://x/api/admin/news/upload', { method: 'POST' }), {}, new URL('https://x/api/admin/news/upload'), {
    requireNews: async () => ({ response: new Response('', { status: 401 }) }),
  });
  assert.equal(res.status, 401);
});
test('upload rejects oversize and stores valid image in R2', async () => {
  const puts = [];
  const rows = [];
  const env = { FILES: { put: async (k) => puts.push(k) }, DB: { prepare: () => ({ bind: (...a) => ({ run: async () => rows.push(a) }) }) } };
  const deps = { requireNews: async () => ({ user: { id: 1 } }), sameOrigin: () => true, json: (b, s = 200) => Response.json(b, { status: s }), audit: async () => {}, purge: async () => {} };
  const big = new FormData(); big.append('file', new File([new Uint8Array(NEWS_IMAGE_MAX_BYTES + 1)], 'a.png'));
  const r1 = await routeNewsApi(new Request('https://x/api/admin/news/upload', { method: 'POST', body: big }), env, new URL('https://x/api/admin/news/upload'), deps);
  assert.ok(r1.status === 413 || r1.status === 422);
  const ok = new FormData(); ok.append('file', new File([png], 'a.png', { type: 'image/png' }));
  const r2 = await routeNewsApi(new Request('https://x/api/admin/news/upload', { method: 'POST', body: ok }), env, new URL('https://x/api/admin/news/upload'), deps);
  assert.equal(r2.status, 201);
  assert.match(puts[0], /^news\/[a-f0-9-]{36}\.png$/);
  assert.equal(rows[0][0], puts[0]); // joins the library
});
test('library lists studio uploads and gallery photos as thumbnails', async () => {
  const env = { DB: { prepare: (sql) => ({ all: async () => ({ results: /studio_files/.test(sql) ? [{ r2_key: 'news/11111111-1111-1111-1111-111111111111.jpg' }] : [{ filename: '123-abc.jpg' }] }) }) } };
  const deps = { requireNews: async () => ({ user: { id: 1 } }), sameOrigin: () => true, json: (b, s = 200) => Response.json(b, { status: s }) };
  const r = await routeNewsApi(new Request('https://x/api/admin/news/library'), env, new URL('https://x/api/admin/news/library'), deps);
  assert.deepEqual((await r.json()).photos, ['/api/news/image/11111111-1111-1111-1111-111111111111.jpg', '/uploads/123-abc.jpg']);
});
test('Escape closes the link list only and refocuses the trigger', async () => {
  const { NEWS_ADMIN_JS } = await import('../worker/src/news.mjs');
  assert.match(NEWS_ADMIN_JS, /e\.key !== 'Escape' \|\| \$\('#nw-link-menu'\)\.hidden\) return; e\.preventDefault\(\); e\.stopImmediatePropagation\(\); \$\('#nw-link-menu'\)\.hidden = true; \$\('#nw-link-btn'\)\.focus\(\);/);
});

test('body sanitizer: allowlist keeps formatting, lists, safe links', () => {
  const out = sanitizeNewsBodyHtml('<p>Hi <b>b</b><strong>s</strong><i>i</i><em>e</em><u>u</u><br><span style="color: rgb(255, 0, 0); position:fixed; font-size: 18px">c</span></p><ul><li>a</li></ul><ol><li>b</li></ol><a href="/forms/sign-up">f</a><a href="https://x.org" target="_blank">x</a><a href="mailto:a@b.org">m</a>');
  assert.match(out, /<p>Hi <b>b<\/b><strong>s<\/strong><i>i<\/i><em>e<\/em><u>u<\/u><br>/);
  assert.match(out, /<span style="color: rgb\(255, 0, 0\); font-size: 18px">c<\/span>/);
  assert.match(out, /<ul><li>a<\/li><\/ul><ol><li>b<\/li><\/ol>/);
  assert.match(out, /<a href="\/forms\/sign-up">f<\/a>/);
  assert.match(out, /<a href="https:\/\/x.org" target="_blank" rel="noopener noreferrer">x<\/a>/);
  assert.match(out, /<a href="mailto:a@b.org">m<\/a>/);
});
test('body sanitizer: strips scripts, handlers, bad schemes, other tags', () => {
  const out = sanitizeNewsBodyHtml('<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)" onclick="x">j</a><a href="//evil.com">e</a><div class="k">d</div><h2>H</h2><span style="background:url(x)">s</span><iframe src="x"></iframe>');
  assert.doesNotMatch(out, /script|img|onerror|onclick|javascript|evil|iframe|<h2|class=|url\(/i);
  assert.match(out, /H/);
});
test('existing bodies still render; editor has toolbar, picker with forms', () => {
  assert.match(renderNewsItemBody({ headline: 'h', body_html: '<p>Old <b>body</b></p>' }, (h) => h), /<p>Old <b>body<\/b><\/p>/);
  assert.equal(sanitizeNewsBodyHtml('<p>Example — dev only.</p>'), '<p>Example — dev only.</p>');
  const html = renderNewsAdminHtml('v', {}, [{ title: 'Home', path: '/' }], [{ title: 'Volunteer', path: '/forms/volunteer' }]);
  for (const k of ['data-nw-cmd="bold"', 'insertOrderedList', 'insertUnorderedList', 'data-nw-color', 'data-nw-size', 'data-nw-link-blank', 'data-nw-link-remove', 'cms-caldev-desc-toolbar']) assert.ok(html.includes(k), k);
  assert.match(html, /<option value="\/forms\/volunteer">Form: Volunteer<\/option>/);
  assert.doesNotThrow(() => new Function(NEWS_ADMIN_JS));
});
