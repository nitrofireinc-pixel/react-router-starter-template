import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderNav, serializePagePayload, NAV_HIDDEN_ORDER, isHiddenPublicNavPage } from '../worker/src/worker.mjs';

const live = [['home', 0], ['calendar', 1], ['gallery', 2], ['contact', 3], ['directors', 3], ['boosters', 4], ['fundraising', 6], ['sponsors', 7]]
  .map(([slug, nav_order], id) => ({ id, slug, nav_order, path: `/${slug}.html`, title: slug, active: 1 }));

test('new pages default out of the menu; existing pages keep their order', () => {
  assert.equal(NAV_HIDDEN_ORDER, 1000);
  assert.equal(serializePagePayload({ slug: 'zz-new', title: 'New', body_html: '' }).nav_order, 1000);
  assert.equal(serializePagePayload({ slug: 'calendar', title: 'Calendar', body_html: '' }, { nav_order: 1 }).nav_order, 1);
  assert.equal(serializePagePayload({ slug: 'x', title: 'X', body_html: '', nav_order: 5 }).nav_order, 5);
  assert.equal(isHiddenPublicNavPage({ slug: 'zz', nav_order: 1000 }), true);
  assert.equal(isHiddenPublicNavPage({ slug: 'gallery', nav_order: 2 }), false);
});

test('hidden pages stay out of the nav', () => {
  const html = renderNav([...live, { id: 99, slug: 'zz-test', nav_order: 1000, path: '/zz-test.html', title: 'ZZ test', active: 1 }]);
  assert.doesNotMatch(html, /zz-test/);
  assert.match(html, /calendar\.html/);
});

test('footer columns ignore hidden pages and the admin form defaults new pages to hidden', () => {
  const src = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  assert.match(src, /const footerPages = \(Array\.isArray\(pages\) \? pages : \[\]\)\.filter\(\(p\) => !isNavOrderHidden\(p\)\)/);
  assert.match(src, /<h3>Families<\/h3>\$\{footerPages\.slice\(4,7\)/);
  assert.match(src, /name="nav_order" type="number" value="1000"/);
  const footer = live.filter((p) => p.nav_order < 1000).slice(4, 7).map((p) => p.slug);
  assert.deepEqual(footer, ['directors', 'boosters', 'fundraising']);
});
