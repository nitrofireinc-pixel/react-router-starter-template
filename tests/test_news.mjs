import test from 'node:test';
import assert from 'node:assert/strict';
import { pickHomeNews, sortNews, renderHomeNewsStripHtml, validateNewsImage, normalizeNewsPayload, NEWS_IMAGE_MAX_BYTES, routeNewsApi } from '../worker/src/news.mjs';

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
  assert.match(html, /All news →/);
});
test('pinned first', () => {
  const s = sortNews([{ id: 1, pinned: 0, news_date: '2026-10-30' }, { id: 2, pinned: 1, news_date: '2026-01-01' }]);
  assert.equal(s[0].id, 2);
});
test('image validation: 10 MB max, image types only', () => {
  assert.equal(validateNewsImage(NEWS_IMAGE_MAX_BYTES, png).mime, 'image/png');
  assert.match(validateNewsImage(NEWS_IMAGE_MAX_BYTES + 1, png).error, /10 MB/);
  assert.match(validateNewsImage(100, new TextEncoder().encode('<svg onload=x>')).error, /Only JPG/);
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
  const env = { FILES: { put: async (k) => puts.push(k) } };
  const deps = { requireNews: async () => ({ user: { id: 1 } }), sameOrigin: () => true, json: (b, s = 200) => Response.json(b, { status: s }), audit: async () => {}, purge: async () => {} };
  const big = new FormData(); big.append('file', new File([new Uint8Array(NEWS_IMAGE_MAX_BYTES + 1)], 'a.png'));
  const r1 = await routeNewsApi(new Request('https://x/api/admin/news/upload', { method: 'POST', body: big }), env, new URL('https://x/api/admin/news/upload'), deps);
  assert.ok(r1.status === 413 || r1.status === 422);
  const ok = new FormData(); ok.append('file', new File([png], 'a.png', { type: 'image/png' }));
  const r2 = await routeNewsApi(new Request('https://x/api/admin/news/upload', { method: 'POST', body: ok }), env, new URL('https://x/api/admin/news/upload'), deps);
  assert.equal(r2.status, 201);
  assert.match(puts[0], /^news\/[a-f0-9-]{36}\.png$/);
});
