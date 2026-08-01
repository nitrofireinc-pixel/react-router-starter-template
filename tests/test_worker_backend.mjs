import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

import { escapeHtml, generateStructuredPageHtml, hasPermission, jsonResponse, normalizePageSlug, normalizeSponsorPayload, normalizeStaffPayload, normalizeStaticPath, parsePermissions, renderSponsorsDirectory, renderStaffDirectory, sanitizeRichHtml, serializePagePayload } from '../worker/src/worker.mjs';

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

test('sanitizeRichHtml keeps bold/color/size markup and strips unsafe tags', () => {
  const html = sanitizeRichHtml('<p>Hello <strong>band</strong> <span style="color: #E71321; font-size: 22px">family</span><script>alert(1)</script></p>');
  assert.match(html, /<strong>band<\/strong>/);
  assert.match(html, /style="color: #E71321; font-size: 22px"/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /alert\(1\)/);
});

test('generateStructuredPageHtml preserves sanitized rich body html', () => {
  const html = generateStructuredPageHtml({
    layout: 'standard',
    kicker: 'Program',
    heading: 'Ensembles',
    intro: 'Welcome',
    body_text: '<p>Join the <strong>marching band</strong> this <span style="color: #014990">fall</span>.</p>',
  });
  assert.match(html, /<strong>marching band<\/strong>/);
  assert.match(html, /style="color: #014990"/);
});

test('staff helpers normalize rows and render photo + name cards safely', () => {
  const member = normalizeStaffPayload({
    name: 'Jordan <Smith>',
    role: 'Band Director',
    bio: 'Email & office hours TBD',
    photo_url: '/uploads/jordan.jpg',
    sort_order: '1',
    active: true,
  });
  assert.equal(member.sort_order, 1);
  const html = renderStaffDirectory([member]);
  assert.match(html, /class="person"/);
  assert.match(html, /Jordan &lt;Smith&gt;/);
  assert.match(html, /Email &amp; office hours TBD/);
  assert.match(html, /src="\/uploads\/jordan\.jpg"/);
  assert.doesNotMatch(html, /<Smith>/);
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
