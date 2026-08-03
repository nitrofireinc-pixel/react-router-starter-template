import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

import { applyHomeFeatureCards, canCreateEvents, canManageAllEvents, canMutateEvent, compareEventsByDate, decodeBasicHtmlEntities, describeContactEmailProvider, ensureBoosterMeetingsSlot, ensureBoosterMembersSlot, ensureFundraisingDonateSlot, ensureSponsorTiersSection, escapeHtml, extractHomeFeatureCards, extractSponsorTierFields, formatInlineRichText, formatRichText, formatSponsorAddress, generateStructuredPageHtml, hasPermission, htmlToPlainText, hydrateSponsor, isMaintenanceMode, isUpcomingEvent, isValidEmail, jsonResponse, normalizeAdminMailPayload, normalizeBoosterMemberPayload, normalizeBoosterMemberReorderIds, normalizeContactTopicPayload, normalizeEventPayload, normalizeHomeFeatureCards, normalizePageSlug, normalizeSocialHref, normalizeSocialLinks, normalizeSponsorAdSeconds, normalizeSponsorLevel, normalizeSponsorPayload, normalizeSponsorTier, normalizeSponsorTierFields, normalizeStaffPayload, normalizeStaffReorderIds, normalizeStaticPath, normalizeUtilityLinks, parseLegacySponsorAddress, parsePermissions, renderBoosterMembersDirectory, renderContactForm, renderHomeFeatureCardsSection, renderSocialLinks, renderSponsorTiersHtml, renderSponsorsDirectory, renderStaffDirectory, resolveContactEmailProvider, rewriteBecomeSponsorLinks, sanitizeHomeBodyHtml, sanitizeInlineRichHtml, sanitizeMaintenanceReturnPath, sanitizeRichHtml, serializePagePayload, shouldRedirectToMaintenance, sponsorBenefitsFromLevel, sponsorMapsUrls, stripSponsorTiersSection } from '../worker/src/worker.mjs';

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

test('calendar event mutation respects ownership and elevated manage access', () => {
  const owner = { id: 4, role: 'editor', permissions: ['events'] };
  const other = { id: 9, role: 'editor', permissions: ['events'] };
  const manager = { id: 11, role: 'editor', permissions: ['events:manage'] };
  const admin = { id: 1, role: 'admin', permissions: [] };
  const owned = { id: 20, created_by: 4 };
  const orphan = { id: 21, created_by: null };

  assert.equal(canCreateEvents(owner), true);
  assert.equal(canCreateEvents(manager), true);
  assert.equal(canManageAllEvents(manager), true);
  assert.equal(canManageAllEvents(owner), false);

  assert.equal(canMutateEvent(owner, owned), true);
  assert.equal(canMutateEvent(other, owned), false);
  assert.equal(canMutateEvent(manager, owned), true);
  assert.equal(canMutateEvent(admin, owned), true);
  assert.equal(canMutateEvent(owner, orphan), false);
  assert.equal(canMutateEvent(manager, orphan), true);
  assert.equal(canMutateEvent(admin, orphan), true);
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

test('sanitizeRichHtml converts CSS bold/italic spans into semantic tags', () => {
  const html = sanitizeRichHtml('<p><span style="font-weight: bold">Our Sponsors</span> and <span style="font-style: italic">more</span></p>');
  assert.match(html, /<strong>Our Sponsors<\/strong>/);
  assert.match(html, /<em>more<\/em>/);
  assert.doesNotMatch(html, /font-weight/);
  assert.doesNotMatch(html, /font-style/);
});

test('sanitizeInlineRichHtml keeps color spans for headings without block wrappers', () => {
  const html = sanitizeInlineRichHtml('<span style="color: #E71321">Fundraising</span><script>alert(1)</script><p>extra</p>');
  assert.match(html, /style="color: #E71321"/);
  assert.match(html, /Fundraising/);
  assert.doesNotMatch(html, /<p>/);
  assert.doesNotMatch(html, /<script>/);
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

test('generateStructuredPageHtml preserves inline heading and intro colors', () => {
  const html = generateStructuredPageHtml({
    layout: 'standard',
    kicker: 'Families',
    heading: '<span style="color: #E71321">Fundraising</span>',
    intro: 'Centralize <strong>active campaigns</strong> and giving links.',
    body_text: 'Details here.',
  });
  assert.match(html, /data-cms-field="heading"><span style="color: #E71321">Fundraising<\/span>/);
  assert.match(html, /<strong>active campaigns<\/strong>/);
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
  assert.equal(member._assign_sort_order, false);
  const html = renderStaffDirectory([member]);
  assert.match(html, /class="person"/);
  assert.match(html, /Jordan &lt;Smith&gt;/);
  assert.match(html, /Email &amp; office hours TBD/);
  assert.match(html, /src="\/uploads\/jordan\.jpg"/);
  assert.doesNotMatch(html, /<Smith>/);

  const rich = normalizeStaffPayload({
    name: 'Casey Lee',
    role: 'Assistant <strong>Director</strong>',
    bio: '<p>Office hours <span style="color: #E71321">Mon–Thu</span></p><script>alert(1)</script>',
  });
  assert.match(rich.role, /<strong>Director<\/strong>/);
  assert.match(rich.bio, /<span style="color: #E71321">Mon–Thu<\/span>/);
  assert.doesNotMatch(rich.bio, /<script>/i);
  const richHtml = renderStaffDirectory([{ ...rich, id: 9, active: 1 }]);
  assert.match(richHtml, /<strong>Director<\/strong>/);
  assert.match(richHtml, /person-bio/);

  const created = normalizeStaffPayload({ name: 'Alex Reed', role: 'Percussion' });
  assert.equal(created._assign_sort_order, true);
  const preserved = normalizeStaffPayload({ name: 'Alex Reed', role: 'Percussion' }, { sort_order: 4, active: 1 });
  assert.equal(preserved.sort_order, 4);
  assert.equal(preserved._assign_sort_order, false);
  assert.deepEqual(normalizeStaffReorderIds({ ids: ['3', 1, 1, 2, 'x'] }), [3, 1, 2]);
});

test('booster member helpers mirror staff normalize/render and inject page slot', () => {
  const member = normalizeBoosterMemberPayload({
    name: 'Pat <Lee>',
    role: 'Booster <strong>President</strong>',
    bio: '<p>Email & meetings</p><script>alert(1)</script>',
    photo_url: '/uploads/pat.jpg',
    sort_order: '2',
    active: true,
  });
  assert.equal(member.sort_order, 2);
  assert.match(member.role, /<strong>President<\/strong>/);
  assert.doesNotMatch(member.bio, /<script>/i);
  const html = renderBoosterMembersDirectory([{ ...member, id: 4, active: 1 }]);
  assert.match(html, /Pat &lt;Lee&gt;/);
  assert.match(html, /data-booster-member-id="4"/);
  assert.match(html, /src="\/uploads\/pat\.jpg"/);
  assert.deepEqual(normalizeBoosterMemberReorderIds({ ids: ['2', 2, 5] }), [2, 5]);

  const withSlot = ensureBoosterMembersSlot('<section class="content"><div class="wrap">Meetings</div></section>');
  assert.match(withSlot, /data-booster-members/);
  assert.equal(ensureBoosterMembersSlot(withSlot), withSlot);
});

test('event helpers keep rich text titles and descriptions', () => {
  const event = normalizeEventPayload({
    date_label: 'Aug',
    date_detail: '01',
    event_year: 2026,
    title: 'Band Camp <strong>Kickoff</strong>',
    description: '<p>Bring <em>water</em> and sunscreen.</p><img src=x onerror=alert(1)>',
  });
  assert.match(event.title, /<strong>Kickoff<\/strong>/);
  assert.match(event.description, /<em>water<\/em>/);
  assert.doesNotMatch(event.description, /<img/i);
});

test('event helpers decode contenteditable entities instead of showing &amp; / &nbsp;', () => {
  assert.equal(decodeBasicHtmlEntities('Band &amp; Guard'), 'Band & Guard');
  assert.equal(decodeBasicHtmlEntities('Hello&nbsp;World'), 'Hello World');
  assert.equal(decodeBasicHtmlEntities('A &amp;amp; B'), 'A & B');

  const event = normalizeEventPayload({
    date_label: 'Aug',
    date_detail: '01',
    event_year: 2026,
    title: 'Band &amp; Guard',
    description: 'Meet&nbsp;at&nbsp;the&nbsp;field',
  });
  assert.equal(event.title, 'Band & Guard');
  assert.equal(event.description, 'Meet at the field');

  assert.equal(formatInlineRichText('Band &amp; Guard'), 'Band &amp; Guard');
  assert.equal(formatInlineRichText('Hello&nbsp;World'), 'Hello World');
  assert.match(formatRichText('Meet&nbsp;at the field'), /<p>Meet at the field<\/p>/);
  assert.doesNotMatch(formatInlineRichText('Band &amp; Guard'), /&amp;amp;/);
  assert.doesNotMatch(formatInlineRichText('Hello&nbsp;World'), /&nbsp;/);
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

test('events sort by year, month, and day instead of editor sort_order', () => {
  const events = [
    { id: 1, date_label: 'Jan', date_detail: '05', event_year: 2027, title: 'Next year', sort_order: 1 },
    { id: 2, date_label: 'Dec', date_detail: '20', event_year: 2026, title: 'December', sort_order: 2 },
    { id: 3, date_label: 'Aug', date_detail: '01', event_year: 2026, title: 'August first', sort_order: 99 },
    { id: 4, date_label: 'Aug', date_detail: 'TBD', event_year: 2026, title: 'August TBD', sort_order: 0 },
    { id: 5, date_label: 'Aug', date_detail: 'FRI', event_year: 2026, title: 'August Friday', sort_order: 3 },
  ];
  const ordered = [...events].sort(compareEventsByDate).map((event) => event.title);
  assert.deepEqual(ordered, [
    'August first',
    'August Friday',
    'August TBD',
    'December',
    'Next year',
  ]);
});

test('normalizeEventPayload stores year for ordering and ignores sort_order', () => {
  const event = normalizeEventPayload({
    date_label: 'Jan',
    date_detail: '12',
    event_year: '2027',
    title: 'Winter Concert',
    description: 'Evening performance',
    sort_order: 42,
  });
  assert.equal(event.event_year, 2027);
  assert.equal(event.sort_order, 0);
  assert.equal(event.date_label, 'Jan');
  assert.equal(event.date_detail, '12');
  assert.equal(event.show_on_boosters, 0);
  const booster = normalizeEventPayload({
    date_label: 'Sep',
    date_detail: '10',
    event_year: 2026,
    title: 'Booster Meeting',
    description: 'Monthly meeting',
    show_on_boosters: '1',
  });
  assert.equal(booster.show_on_boosters, 1);
  const preserved = normalizeEventPayload({
    date_label: 'Sep',
    date_detail: '10',
    event_year: 2026,
    title: 'Booster Meeting',
    description: 'Monthly meeting',
  }, { show_on_boosters: 1 });
  assert.equal(preserved.show_on_boosters, 1);
});

test('ensureBoosterMeetingsSlot injects meetings list hook into Boosters card', () => {
  const html = ensureBoosterMeetingsSlot('<article class="card"><span class="tag">Meetings</span><h3>Booster Meetings</h3><p>Placeholder for monthly meeting schedule.</p></article>');
  assert.match(html, /data-booster-meetings/);
  assert.match(html, /Booster Meetings/);
  assert.equal(ensureBoosterMeetingsSlot(html), html);
});

test('ensureFundraisingDonateSlot injects Square donate button into CMS fundraising body', () => {
  const liveStyle = `<section class="page-hero" data-cms-layout="standard"><div class="page-title"><h1>Fundraising</h1></div></section><section class="content"><div class="wrap"><div class="card" data-cms-field="body_text"><p>Buy a raffle ticket</p></div></div></section>`;
  const html = ensureFundraisingDonateSlot(liveStyle);
  assert.match(html, /data-square-checkout/);
  assert.match(html, /square\.link\/u\/IIGMHqVQ/);
  assert.match(html, /Buy a raffle ticket/);
  assert.match(html, /Direct Support/);
  assert.equal(ensureFundraisingDonateSlot(html), html);
});

test('isMaintenanceMode treats common truthy site setting values as enabled', () => {
  assert.equal(isMaintenanceMode({ maintenance_mode: 1 }), true);
  assert.equal(isMaintenanceMode({ maintenance_mode: '1' }), true);
  assert.equal(isMaintenanceMode({ maintenance_mode: true }), true);
  assert.equal(isMaintenanceMode({ maintenance_mode: '0' }), false);
  assert.equal(isMaintenanceMode({ maintenance_mode: 0 }), false);
  assert.equal(isMaintenanceMode({}), false);
});

test('maintenance mode redirects all public HTML pages except maintenance itself', () => {
  const on = { maintenance_mode: 1 };
  const off = { maintenance_mode: 0 };
  assert.equal(shouldRedirectToMaintenance('/', on), true);
  assert.equal(shouldRedirectToMaintenance('/contact.html', on), true);
  assert.equal(shouldRedirectToMaintenance('/boosters.html', on), true);
  assert.equal(shouldRedirectToMaintenance('/maintenance.html', on), false);
  assert.equal(shouldRedirectToMaintenance('/styles.css', on), false);
  assert.equal(shouldRedirectToMaintenance('/contact.html', off), false);
});

test('maintenance return path cookie values are sanitized to safe same-site pages', () => {
  assert.equal(sanitizeMaintenanceReturnPath('/contact.html'), '/contact.html');
  assert.equal(sanitizeMaintenanceReturnPath('/boosters.html?from=nav'), '/boosters.html?from=nav');
  assert.equal(sanitizeMaintenanceReturnPath('/index.html'), '/');
  assert.equal(sanitizeMaintenanceReturnPath('https://evil.example/'), '/');
  assert.equal(sanitizeMaintenanceReturnPath('//evil.example'), '/');
  assert.equal(sanitizeMaintenanceReturnPath('/maintenance.html'), '/');
  assert.equal(sanitizeMaintenanceReturnPath('/admin'), '/');
  assert.equal(sanitizeMaintenanceReturnPath('/styles.css'), '/');
});

test('isUpcomingEvent hides past dates and keeps today and future dates public', () => {
  const now = new Date('2026-08-01T15:00:00Z'); // afternoon UTC = still Aug 1 in Eastern
  assert.equal(isUpcomingEvent({ date_label: 'Jul', date_detail: '31', event_year: 2026 }, now), false);
  assert.equal(isUpcomingEvent({ date_label: 'Aug', date_detail: '01', event_year: 2026 }, now), true);
  assert.equal(isUpcomingEvent({ date_label: 'Aug', date_detail: '02', event_year: 2026 }, now), true);
  assert.equal(isUpcomingEvent({ date_label: 'Aug', date_detail: 'TBD', event_year: 2026 }, now), true);
  assert.equal(isUpcomingEvent({ date_label: 'Jul', date_detail: 'TBD', event_year: 2026 }, now), false);
  assert.equal(isUpcomingEvent({ date_label: 'Dec', date_detail: '20', event_year: 2025 }, now), false);
  assert.equal(isUpcomingEvent({ date_label: 'Jan', date_detail: '05', event_year: 2027 }, now), true);
});

test('sponsors layout keeps directory placeholder and page copy editable', () => {
  const html = generateStructuredPageHtml({
    layout: 'sponsors',
    kicker: 'Community Partners',
    heading: 'Our <Sponsors>',
    intro: 'Support the band.',
    body_text: 'Thank you to our community partners.',
    callout_title: 'Become a sponsor',
    callout_text: 'Ask about levels & benefits.',
  });
  assert.match(html, /data-cms-layout="sponsors"/);
  assert.match(html, /sponsor-hero/);
  assert.match(html, /Our &lt;Sponsors&gt;/);
  assert.match(html, /data-sponsors/);
  assert.doesNotMatch(html, /data-sponsor-tiers/);
  assert.match(html, /become-a-sponsor\.html/);
  assert.match(html, /sponsor-cta/);
  assert.match(html, /Ask about levels &amp; benefits\./);
  assert.doesNotMatch(html, /<Sponsors>/);
});

test('become-sponsor layout includes packages and contact form slot', () => {
  const html = generateStructuredPageHtml({
    layout: 'become-sponsor',
    kicker: 'Support',
    heading: 'Become a Sponsor',
    intro: 'Choose a package.',
    body_text: 'Ready to partner with Eagle Pride?',
    bronze_title: 'Custom Bronze',
    gold_blurb: 'Top package for <partners>.',
  });
  assert.match(html, /data-cms-layout="become-sponsor"/);
  assert.match(html, /data-sponsor-tiers/);
  assert.match(html, /data-cms-field="bronze_title"/);
  assert.match(html, /Custom Bronze/);
  assert.match(html, /Top package for &lt;partners&gt;\./);
  assert.match(html, /Silver Sponsor/);
  assert.match(html, /become-sponsor-panel/);
  assert.match(html, /data-contact-form-slot/);
  assert.doesNotMatch(html, /data-sponsors/);
  const extracted = extractSponsorTierFields(html);
  assert.equal(normalizeSponsorTierFields(extracted).bronze_title, 'Custom Bronze');
  assert.match(extracted.gold_blurb, /Top package for/);
});

test('ensureSponsorTiersSection injects Bronze Silver Gold packages once', () => {
  const tiers = renderSponsorTiersHtml();
  assert.match(tiers, /home football games/);
  assert.match(tiers, /Homepage fly-in advert/);
  assert.match(tiers, /website sponsor marquee/);
  const bare = '<div class="wrap"><div class="sponsor-intro"></div><div class="sponsor-directory" data-sponsors></div></div>';
  const injected = ensureSponsorTiersSection(bare);
  assert.match(injected, /data-sponsor-tiers/);
  assert.equal(ensureSponsorTiersSection(injected), injected);
});

test('stripSponsorTiersSection removes packages and rewriteBecomeSponsorLinks updates CTAs', () => {
  const withTiers = `${renderSponsorTiersHtml()}<a class="btn primary" href="contact.html">Become a sponsor</a><a class="btn secondary" href="/sponsors.html#sponsor-packages">Ask about sponsoring</a>`;
  const stripped = stripSponsorTiersSection(withTiers);
  assert.doesNotMatch(stripped, /data-sponsor-tiers/);
  const rewritten = rewriteBecomeSponsorLinks(stripped);
  assert.match(rewritten, /href="\/become-a-sponsor\.html">Become a sponsor/);
  assert.match(rewritten, /href="\/become-a-sponsor\.html">Ask about sponsoring/);
});

test('sponsor helpers normalize editable rows and render safe sponsor cards', () => {
  const sponsor = normalizeSponsorPayload({
    name: 'Kernersville <Music>',
    address: '123 main street',
    city: 'kernersville',
    state: 'nc',
    level: 'Gold Sponsor',
    sort_order: '2',
    active: true,
  });

  assert.equal(sponsor.mark_text, 'KM');
  assert.equal(sponsor.sort_order, 2);
  assert.equal(sponsor.level, 'Gold Sponsor');
  assert.equal(sponsor.homepage_ad, 1);
  assert.equal(sponsor.address, '123 Main Street');
  assert.equal(sponsor.city, 'Kernersville');
  assert.equal(sponsor.state, 'NC');
  const html = renderSponsorsDirectory([sponsor]);
  assert.match(html, /sponsor-card sponsor-featured/);
  assert.match(html, /Kernersville &lt;Music&gt;/);
  assert.match(html, /123 Main Street, Kernersville, NC/);
  assert.match(html, /data-sponsor-map-directions/);
  assert.doesNotMatch(html, /<Music>/);
});

test('formatSponsorAddress capitalizes parts and uses proper commas', () => {
  assert.equal(
    formatSponsorAddress({ address: '123 main street', city: 'kernersville', state: 'nc' }),
    '123 Main Street, Kernersville, NC',
  );
  assert.equal(
    formatSponsorAddress({ address: '', city: 'kernersville', state: 'NC' }),
    'Kernersville, NC',
  );
  const parsed = parseLegacySponsorAddress('450 oak ave, winston-salem, north carolina');
  assert.equal(parsed.state, 'NC');
  assert.equal(parsed.city, 'Winston-Salem');
  assert.equal(parsed.address, '450 oak ave');
  const maps = sponsorMapsUrls('123 Main Street, Kernersville, NC');
  assert.match(maps.directionsUrl, /google\.com\/maps\/dir/);
  assert.match(maps.embedUrl, /output=embed/);
});

test('contact email provider prefers Resend, then Mailchannels API key', () => {
  assert.equal(resolveContactEmailProvider({ RESEND_API_KEY: 're_test' }), 'resend');
  assert.equal(resolveContactEmailProvider({ MAILCHANNELS_API_KEY: 'mc_test' }), 'mailchannels');
  assert.equal(resolveContactEmailProvider({}), 'none');
  assert.equal(resolveContactEmailProvider({ CONTACT_EMAIL_PROVIDER: 'formsubmit' }), 'formsubmit');
  assert.equal(describeContactEmailProvider('none').configured, false);
  assert.equal(describeContactEmailProvider('resend').configured, true);
});

test('contact topics require labels and valid delivery emails', () => {
  const topic = normalizeContactTopicPayload({
    label: ' Sponsor inquiry ',
    email: 'Boosters@Example.com',
    sort_order: '3',
    active: true,
  });
  assert.equal(topic.label, 'Sponsor inquiry');
  assert.equal(topic.email, 'boosters@example.com');
  assert.equal(topic.sort_order, 0);
  assert.equal(isValidEmail(topic.email), true);
  assert.equal(isValidEmail('not-an-email'), false);
  const html = renderContactForm([{ id: 9, label: 'General question' }]);
  assert.match(html, /data-contact-form/);
  assert.match(html, /value="9"/);
  assert.match(html, /General question/);
});

test('contact layout keeps a form slot beside page copy', () => {
  const html = generateStructuredPageHtml({
    layout: 'contact',
    kicker: 'Connect',
    heading: 'Contact',
    intro: 'Reach the band office.',
    body_text: 'Add office hours here.',
  });
  assert.match(html, /data-cms-layout="contact"/);
  assert.match(html, /data-contact-form-slot/);
  assert.match(html, /Add office hours here/);
});

test('sponsor tiers drive marquee, fly-in, and game-day benefits', () => {
  assert.equal(normalizeSponsorTier('Gold Sponsor'), 'gold');
  assert.equal(normalizeSponsorLevel('Community Sponsor', { homepageAd: 1 }), 'Silver Sponsor');
  assert.equal(normalizeSponsorLevel('navy partner'), 'Bronze Sponsor');
  const gold = sponsorBenefitsFromLevel('Gold Sponsor');
  assert.equal(gold.show_marquee, true);
  assert.equal(gold.show_flyin, true);
  assert.equal(gold.show_game_announcement, true);
  const silver = sponsorBenefitsFromLevel('Silver Sponsor');
  assert.equal(silver.show_flyin, true);
  assert.equal(silver.show_game_announcement, false);
  const bronze = sponsorBenefitsFromLevel('Bronze Sponsor');
  assert.equal(bronze.show_flyin, false);
  assert.equal(bronze.show_marquee, true);
  const hydrated = hydrateSponsor({ name: 'Eagle Financial Partners', level: 'Gold Sponsor', homepage_ad: 0, city: 'Kernersville', state: 'NC' });
  assert.equal(hydrated.tier, 'gold');
  assert.equal(hydrated.homepage_ad, 1);
  assert.equal(hydrated.show_game_announcement, true);
});

test('normalizeSponsorPayload derives fly-in eligibility from tier', () => {
  const gold = normalizeSponsorPayload({
    name: 'Eagle Financial Partners',
    level: 'Gold Sponsor',
    active: true,
  });
  assert.equal(gold.homepage_ad, 1);
  assert.equal(gold.level, 'Gold Sponsor');
  assert.equal(gold.city, 'Kernersville');
  assert.equal(gold.state, 'NC');
  assert.equal(gold._assign_sort_order, true);
  const bronze = normalizeSponsorPayload({ name: 'Local Shop', level: 'Bronze Sponsor' }, { homepage_ad: 1, active: 1, city: 'Greensboro', state: 'NC', sort_order: 4 });
  assert.equal(bronze.homepage_ad, 0);
  assert.equal(bronze.city, 'Greensboro');
  assert.equal(bronze.sort_order, 4);
  assert.equal(bronze._assign_sort_order, false);
  const legacy = normalizeSponsorPayload({ name: 'Legacy Co', homepage_ad: true }, { level: 'Community Sponsor' });
  assert.equal(legacy.level, 'Silver Sponsor');
  assert.equal(legacy.homepage_ad, 1);
});

test('normalizeSponsorAdSeconds clamps homepage fly-in duration', () => {
  assert.equal(normalizeSponsorAdSeconds(6), 6);
  assert.equal(normalizeSponsorAdSeconds('9'), 9);
  assert.equal(normalizeSponsorAdSeconds(1), 2);
  assert.equal(normalizeSponsorAdSeconds(99), 30);
  assert.equal(normalizeSponsorAdSeconds('nope', 6), 6);
});

test('normalizeUtilityLinks cleans top-right utility bar links', () => {
  const links = normalizeUtilityLinks(JSON.stringify([
    { label: ' Upcoming Events ', href: 'calendar.html' },
    { label: 'Contact', href: 'javascript:alert(1)', target: '_parent' },
    { label: 'Resources', href: 'https://example.com/resources', target: '_blank' },
  ]));
  assert.equal(links.length, 3);
  assert.equal(links[0].href, '/calendar.html');
  assert.equal(links[0].target, '_self');
  assert.equal(links[1].href, '#');
  assert.equal(links[1].target, '_self');
  assert.equal(links[2].href, 'https://example.com/resources');
  assert.equal(links[2].target, '_blank');
  assert.equal(normalizeUtilityLinks(null)[0].label, 'Upcoming Events');
  assert.equal(normalizeUtilityLinks(null)[0].target, '_self');
});

test('normalizeSocialLinks keeps platform order and cleans URLs', () => {
  assert.equal(normalizeSocialHref('javascript:alert(1)'), '');
  assert.equal(normalizeSocialHref('facebook.com/efhsband'), 'https://facebook.com/efhsband');
  const links = normalizeSocialLinks(JSON.stringify([
    { platform: 'instagram', href: 'https://instagram.com/efhsband' },
    { platform: 'facebook', href: 'javascript:alert(1)' },
    { platform: 'youtube', href: 'youtube.com/@efhsband' },
  ]));
  assert.equal(links.length, 5);
  assert.equal(links[0].platform, 'facebook');
  assert.equal(links[0].href, '');
  assert.equal(links[1].platform, 'instagram');
  assert.equal(links[1].href, 'https://instagram.com/efhsband');
  assert.equal(links[2].href, 'https://youtube.com/@efhsband');
  const html = renderSocialLinks({ social_links: links });
  assert.match(html, /footer-social/);
  assert.match(html, /instagram\.com\/efhsband/);
  assert.match(html, /aria-label="Instagram"/);
  assert.doesNotMatch(html, /javascript:/);
  assert.equal(renderSocialLinks({ social_links: [] }), '');
});

test('home feature cards extract, normalize, and patch without wiping the page', () => {
  const cards = normalizeHomeFeatureCards({
    boosters_tag: '  Boosters Club ',
    boosters_heading: 'Parents lead.',
    boosters_body: 'Volunteer and fundraising details go here.',
    boosters_button: 'Learn more',
    boosters_href: 'boosters.html',
    launch_tag: 'Note',
    launch_heading: 'Draft site',
    launch_body: 'Replace placeholders soon.',
    launch_footer: 'Ready for review.',
  });
  assert.equal(cards.boosters_tag, 'Boosters Club');
  assert.equal(cards.boosters_href, 'boosters.html');

  const seed = `${renderHomeFeatureCardsSection()}`;
  const extracted = extractHomeFeatureCards(seed);
  assert.equal(extracted.boosters_heading, 'Parents make the program move.');
  assert.equal(extracted.launch_footer.includes('Ready for review'), true);

  const page = '<section class="hero"><h1>Keep me</h1></section>\n' + seed;
  const updated = applyHomeFeatureCards(page, cards);
  assert.match(updated, /Keep me/);
  assert.match(updated, /Parents lead\./);
  assert.match(updated, /Draft site/);
  assert.match(updated, /href="boosters\.html"/);
  assert.doesNotMatch(updated, /page-hero/);

  const saved = serializePagePayload({
    slug: 'home',
    title: 'Home',
    layout: 'home',
    heading: 'Home',
    ...cards,
  }, { body_html: page, slug: 'home', is_home: 1 });
  assert.match(saved.body_html, /Keep me/);
  assert.match(saved.body_html, /Parents lead\./);
  assert.equal(saved.path, '/');

  const fullHome = sanitizeHomeBodyHtml(`
    <section class="hero"><h1 data-site-field="hero_title" class="cms-edit-field is-focused" contenteditable="true">New Hero</h1></section>
    <section><div class="kicker" data-cms-home-field="1">Start here</div><h2>Families expect this.</h2>
      <article class="card red-card"><span class="tag">Program</span><h3>Ensembles</h3><p>Updated copy.</p></article>
    </section>
    <div class="cms-home-preview-note"><p>ignore me</p></div>
  `);
  assert.match(fullHome, /New Hero/);
  assert.match(fullHome, /Families expect this/);
  assert.match(fullHome, /Updated copy/);
  assert.doesNotMatch(fullHome, /cms-edit-field|contenteditable|cms-home-preview-note/);

  const savedFull = serializePagePayload({
    slug: 'home',
    title: 'Home',
    body_html: fullHome,
  }, { body_html: page, slug: 'home' });
  assert.match(savedFull.body_html, /Families expect this/);
  assert.match(savedFull.body_html, /Updated copy/);
});

test('admin mail payload sanitizes rich html and builds plain text', () => {
  const mail = normalizeAdminMailPayload({
    subject: '  Practice update  ',
    html: '<p>Hello <strong>team</strong></p><script>alert(1)</script><p>See you Thursday.</p>',
    userIds: ['3', 3, 7, 'nope'],
  });
  assert.equal(mail.subject, 'Practice update');
  assert.deepEqual(mail.user_ids, [3, 7]);
  assert.match(mail.html, /<strong>team<\/strong>/);
  assert.doesNotMatch(mail.html, /script/i);
  assert.match(mail.text, /Hello team/);
  assert.match(mail.text, /See you Thursday/);
  assert.equal(htmlToPlainText('<p>Line one</p><br>Line two'), 'Line one\n\nLine two');
});
