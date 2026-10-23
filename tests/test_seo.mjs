import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSeoHead, renderRobotsTxt, renderSitemapXml, SEO_PAGE_DEFAULTS, normalizePageSeo } from '../worker/src/seo.mjs';
import { isWorkerStaticAssetPath } from '../worker/src/worker.mjs';

test('seo defaults are 140-160 char descriptions', () => {
  for (const [slug, v] of Object.entries(SEO_PAGE_DEFAULTS)) {
    assert.ok(v.description.length >= 140 && v.description.length <= 160, slug);
  }
});
test('home head has canonical, og, JSON-LD; CMS override wins', () => {
  const { title, head } = renderSeoHead({ slug: 'home', is_home: 1 }, { page_seo: { home: { title: 'Custom' } }, social_links: [{ platform: 'x', href: 'https://x.com/EFBlueRegiment' }] });
  assert.equal(title, 'Custom');
  assert.match(head, /rel="canonical" href="https:\/\/efhsband.org\/"/);
  assert.match(head, /og:image/);
  assert.match(head, /"NGO"/);
  assert.match(head, /sameAs/);
});
test('fundraising has DonateAction; noindex pages skip canonical', () => {
  assert.match(renderSeoHead({ slug: 'fundraising', path: '/fundraising.html' }).head, /DonateAction/);
  assert.doesNotMatch(renderSeoHead({ slug: 'not-found' }, {}, { noindex: true }).head, /canonical/);
});
test('robots and sitemap exclude admin', () => {
  assert.match(renderRobotsTxt(), /Disallow: \/admin/);
  assert.match(renderRobotsTxt(), /Sitemap: https:\/\/efhsband.org\/sitemap.xml/);
  const xml = renderSitemapXml([{ slug: 'home', is_home: 1, path: '/index.html', active: 1 }, { slug: 'not-found', path: '/404.html', active: 1 }, { slug: 'gallery', path: '/gallery.html', active: 1 }]);
  assert.match(xml, /gallery.html/);
  assert.doesNotMatch(xml, /404/);
  assert.equal(isWorkerStaticAssetPath('/robots.txt'), false);
  assert.equal(isWorkerStaticAssetPath('/sitemap.xml'), false);
});
test('normalizePageSeo trims junk', () => {
  assert.deepEqual(normalizePageSeo('{"Home!":{"title":" a "}}'), { home: { title: 'a', description: '' } });
});
