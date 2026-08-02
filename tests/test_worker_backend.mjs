import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

import { escapeHtml, generateStructuredPageHtml, hasPermission, jsonResponse, normalizePageSlug, normalizeSponsorPayload, normalizeStaticPath, parsePermissions, renderSponsorPageBody, renderSponsorsDirectory, replaceSponsorDirectory, serializePagePayload } from '../worker/src/worker.mjs';

test('escapeHtml escapes user-provided values used in admin templates', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('jsonResponse returns JSON with status and content-type', async () => {
  const response = jsonResponse({ ok: true }, 201);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.deepEqual(await response.json(), { ok: true });
});

test('normalizeStaticPath protects root and strips leading slash', () => {
  assert.equal(normalizeStaticPath('/'), '/index.html');
  assert.equal(normalizeStaticPath('/calendar.html'), '/calendar.html');
  assert.equal(normalizeStaticPath('/../secret'), '/index.html');
});

test('normalizePageSlug creates safe stable slugs for CMS pages', () => {
  assert.equal(normalizePageSlug('Booster Info!'), 'booster-info');
  assert.equal(normalizePageSlug('/Calendar.html'), 'calendar');
  assert.equal(normalizePageSlug('   '), 'page');
});

test('permission checks support admin all-access and page-specific scopes', () => {
  const limited = { role: 'editor', permissions: ['events', 'page:boosters'] };
  const admin = { role: 'admin', permissions: [] };
  assert.equal(hasPermission(admin, 'users'), true);
  assert.equal(hasPermission(limited, 'events'), true);
  assert.equal(hasPermission(limited, 'page:boosters'), true);
  assert.equal(hasPermission(limited, 'page:home'), false);
  assert.deepEqual(parsePermissions('["events","page:boosters"]'), ['events', 'page:boosters']);
  assert.deepEqual(parsePermissions('not-json'), []);
});

test('generateStructuredPageHtml builds safe page sections from text fields instead of raw HTML', () => {
  const html = generateStructuredPageHtml({
    layout: 'info-cards',
    kicker: 'Families',
    heading: 'Band <Boosters>',
    intro: 'Help students & volunteer.',
    body_text: 'First paragraph.\n\nSecond paragraph.',
    callout_title: 'Need forms?',
    callout_text: 'Email <script>alert(1)</script>',
  });

  assert.match(html, /<section class="page-hero"/);
  assert.match(html, /Band &lt;Boosters&gt;/);
  assert.match(html, /Help students &amp; volunteer\./);
  assert.match(html, /First paragraph\./);
  assert.match(html, /Second paragraph\./);
  assert.match(html, /Need forms\?/);
  assert.doesNotMatch(html, /<script>/);
});

test('serializePagePayload turns structured CMS fields into generated HTML', () => {
  const page = serializePagePayload({
    title: 'Calendar',
    slug: 'calendar',
    layout: 'calendar',
    kicker: 'Schedule',
    heading: 'Calendar',
    intro: 'Rehearsals and performances',
    body_text: 'Use the Calendar tab to add events with month and day dropdowns.',
  });

  assert.equal(page.slug, 'calendar');
  assert.equal(page.path, '/calendar.html');
  assert.match(page.body_html, /data-events/);
  assert.match(page.body_html, /Use the Calendar tab/);
  assert.doesNotMatch(page.body_html, /<textarea/);
});

test('sponsor helpers normalize editable rows and render safe sponsor cards', () => {
  const sponsor = normalizeSponsorPayload({
    name: 'Kernersville <Music>',
    address: 'Kernersville & NC',
    level: 'Gold Sponsor',
    sort_order: '2',
    active: true,
  });

  assert.equal(sponsor.mark_text, 'KM');
  assert.equal(sponsor.sort_order, 2);
  const html = renderSponsorsDirectory([sponsor]);
  assert.match(html, /sponsor-card sponsor-featured/);
  assert.match(html, /Kernersville &lt;Music&gt;/);
  assert.match(html, /Kernersville &amp; NC/);
  assert.doesNotMatch(html, /<Music>/);
});

test('replaceSponsorDirectory swaps placeholder and nested directory blocks', () => {
  const directory = '<div class="sponsor-directory" data-sponsors><article class="sponsor-card"><div><h3>Acme</h3></div></article></div>';
  const withAttr = '<section><div class="sponsor-directory" aria-label="Sponsor recognition"><article class="sponsor-card"><div><h3>Your business here</h3><p>Placeholder</p></div></article></div><aside class="sponsor-cta">cta</aside></section>';
  const replaced = replaceSponsorDirectory(withAttr, directory);
  assert.match(replaced, /Acme/);
  assert.doesNotMatch(replaced, /Your business here/);
  assert.match(replaced, /sponsor-cta/);

  const nested = '<div class="sponsor-directory" data-sponsors><article class="sponsor-card"><div><h3>Old</h3></div></article></div>';
  assert.equal(replaceSponsorDirectory(nested, directory), directory);
});

test('renderSponsorPageBody injects CMS sponsors into the public page body', () => {
  const body = renderSponsorPageBody(
    {
      title: 'Sponsors',
      body_html: '<section class="content sponsor-content"><div class="wrap"><div class="sponsor-directory" aria-label="Sponsor recognition"><article class="sponsor-card"><div><h3>Your business here</h3></div></article></div><aside class="sponsor-cta">cta</aside></div></section>',
    },
    [{ id: 7, name: 'Eagle Financial Partners', address: 'Kernersville, NC', level: 'Navy Sponsor', mark_text: 'EFP', logo_url: '' }],
  );
  assert.match(body, /Eagle Financial Partners/);
  assert.match(body, /data-sponsors/);
  assert.doesNotMatch(body, /Your business here/);
});

test('serializePagePayload keeps a sponsors directory hook for the sponsors slug', () => {
  const page = serializePagePayload({
    title: 'Sponsors',
    slug: 'sponsors',
    kicker: 'Community Partners',
    heading: 'Our Sponsors',
    intro: 'Thank you to our partners.',
    body_text: 'Community support takes center stage.',
  });
  assert.match(page.body_html, /data-sponsors/);
  assert.match(page.body_html, /sponsor-directory/);
});
