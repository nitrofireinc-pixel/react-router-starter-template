import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { applyHomeFeatureCards, canAccessCheckout, canAccessSecurityLog, canCreateEvents, canManageAllEvents, canMutateEvent, compareEventsByDate, decodeBasicHtmlEntities, describeContactEmailProvider, ensureBoosterMeetingsSlot, ensureBoosterMembersSlot, ensureFundraisingDonateSlot, ensureSponsorDonateButton, refreshHomeStartHereSection, refreshHomeHeroBrandMark, ensureSponsorTiersSection, escapeHtml, expandRecurringEvent, extractHomeFeatureCards, extractSponsorTierFields, formatInlineRichText, formatRepeatSummary, formatRichText, formatSponsorAddress, formatSponsorAmountDisplay, generateStructuredPageHtml, hasPermission, htmlToPlainText, hydrateSponsor, isMaintenanceMode, isUpcomingEvent, isValidEmail, jsonResponse, normalizeAdminMailPayload, normalizeBoosterMemberPayload, normalizeBoosterMemberReorderIds, normalizeContactTopicPayload, normalizeEventPayload, normalizeHomeFeatureCards, normalizePageSlug, normalizePhotoMetaPayload, normalizeRepeatDays, normalizeRepeatExceptions, normalizeRepeatMonths, normalizeSocialHref, normalizeSocialLinks, normalizeSponsorAdSeconds, normalizeSponsorLevel, normalizeSponsorPayload, normalizeSponsorTier, normalizeSponsorTierFields, normalizeSponsorTierKey, normalizeStaffPayload, normalizeStaffReorderIds, normalizeStaticPath, normalizeUtilityLinks, parseLegacySponsorAddress, parsePermissions, parseSponsorAmountCents, parseZernioFacebookConnection, parseZernioUserProfile, normalizeZernioPostPayload, sanitizeAdminReturnPath, parseFacebookEventSyncState, eventFacebookFingerprint, formatFacebookCalendarDigest, clearLegacyFacebookPublishQueueIfNeeded, pickSquareLocationId, renderBoosterMembersDirectory, renderContactForm, renderHomeFeatureCardsSection, renderMaintenancePreviewBanner, renderSocialLinks, renderSponsorTiersHtml, renderSponsorsDirectory, renderStaffDirectory, canDeleteMeetingMinutes, canEditMeetingMinutes, canManageMeetingMinutes, canViewMeetingMinutes, formatMeetingDateDisplay, MINUTES_EDIT_WINDOW_DAYS, minutesEditableUntil, normalizeMinutesPayload, parseMeetingDateInput, parseBoostersMinutesDocx, extractMeetingDateFromFilename, extractMeetingDateFromMinutesText, parseBoostersMinutesFieldsFromText, renderMinutesDocumentHtml, extractEnsemblesBodyHtml, applyEnsemblesBodyHtml, sanitizePageSectionHtml, resolveAdminMailSender, resolveContactEmailProvider, resolveSponsorAmountCents, rewriteBecomeSponsorLinks, sanitizeHomeBodyHtml, sanitizeInlineRichHtml, sanitizeMaintenanceReturnPath, sanitizeRichHtml, serializePagePayload, shouldRedirectToMaintenance, sponsorBenefitsFromLevel, sponsorLevelFromTierKey, sponsorMapsUrls, squareApiBase, squareCheckoutConfigured, squareMockPayEnabled, stripSponsorTiersSection, validateSelfPasswordChange, buildSponsorDonationInvoice, SPONSOR_INVOICE_FROM_EMAIL, formatUserLastLoginDisplay, renderNav, renderStaffAuthNavLink, renderNotifyMeNavControl, renderAddToHomeNavControl, isSessionFresh, sessionCookieHeader, SESSION_TTL_SECONDS, normalizeWebPushSubscription, buildCalendarPushPayload, parseCalendarPushState, emptyCalendarPushState } from '../worker/src/worker.mjs';

test('escapeHtml escapes user-provided values used in admin templates', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('validateSelfPasswordChange requires length match and confirmation', () => {
  assert.equal(validateSelfPasswordChange({
    current_password: 'oldpass12',
    new_password: 'short',
    confirm_password: 'short',
  }).ok, false);
  assert.equal(validateSelfPasswordChange({
    current_password: 'oldpass12',
    new_password: 'newpass99',
    confirm_password: 'newpass98',
  }).detail, 'New password and confirmation do not match');
  const ok = validateSelfPasswordChange({
    current_password: 'oldpass12',
    new_password: 'newpass99',
    confirm_password: 'newpass99',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.new_password, 'newpass99');
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

test('normalizePhotoMetaPayload updates gallery title and alt text', () => {
  const existing = { alt_text: 'Old alt', caption: 'Old title' };
  assert.deepEqual(
    normalizePhotoMetaPayload({ alt_text: '  Field show  ', caption: 'Friday night lights' }, existing),
    { alt_text: 'Field show', caption: 'Friday night lights' },
  );
  assert.deepEqual(
    normalizePhotoMetaPayload({ caption: '<b>Bold title</b>' }, existing),
    { alt_text: 'Old alt', caption: '<b>Bold title</b>' },
  );
  assert.deepEqual(
    normalizePhotoMetaPayload({ alt_text: 'Keep image', caption: '   ' }, existing),
    { alt_text: 'Keep image', caption: '' },
  );
  assert.equal(normalizePhotoMetaPayload({ caption: 'Only title' }, existing).alt_text, 'Old alt');
});

test('permission checks support admin all-access and page-specific scopes', () => {
  const limited = { role: 'editor', permissions: ['events', 'page:boosters', 'security-log', 'audit'] };
  const admin = { role: 'admin', permissions: [] };
  assert.equal(hasPermission(admin, 'users'), true);
  assert.equal(hasPermission(limited, 'events'), true);
  assert.equal(hasPermission(limited, 'page:boosters'), true);
  assert.equal(hasPermission(limited, 'page:home'), false);
  assert.deepEqual(parsePermissions('["events","page:boosters"]'), ['events', 'page:boosters']);
  assert.deepEqual(parsePermissions('not-json'), []);
  // Security log must never be grantable via permissions JSON.
  assert.deepEqual(parsePermissions(limited.permissions), ['events', 'page:boosters']);
  assert.equal(canAccessSecurityLog(limited), false);
  assert.equal(canAccessSecurityLog(admin), true);
  assert.equal(hasPermission(limited, 'security-log'), false);
  assert.equal(hasPermission(admin, 'security-log'), true);
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
  assert.equal(canMutateEvent(owner, orphan), true);
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

test('repeat helpers normalize days, months, and exceptions', () => {
  assert.deepEqual(normalizeRepeatDays(['Mon', 3, '3', 9, 'friday']), [1, 3, 5]);
  assert.deepEqual(normalizeRepeatMonths(['Aug', 8, '13', 1]), [1, 8]);
  assert.deepEqual(normalizeRepeatExceptions(['2026-09-01', 'bad', '2026-09-01', '2026-08-15']), [
    '2026-08-15',
    '2026-09-01',
  ]);
});

test('normalizeEventPayload forces boosters off for repeating series', () => {
  const event = normalizeEventPayload({
    title: 'Rehearsal',
    description: 'Weekly',
    event_year: 2026,
    repeat_enabled: 1,
    repeat_days: [1, 3],
    repeat_months: [8, 9],
    show_on_boosters: 1,
  });
  assert.equal(event.repeat_enabled, 1);
  assert.deepEqual(event.repeat_days, [1, 3]);
  assert.deepEqual(event.repeat_months, [8, 9]);
  assert.equal(event.show_on_boosters, 0);
  assert.equal(event.date_label, 'Aug');
  assert.equal(event.date_detail, '01');
  assert.match(formatRepeatSummary(event), /Mon, Wed/);
  assert.match(formatRepeatSummary(event), /Aug, Sep/);
});

test('expandRecurringEvent creates dated rows and skips exceptions', () => {
  const series = {
    id: 42,
    title: 'Practice',
    description: 'After school',
    event_year: 2026,
    repeat_enabled: 1,
    repeat_days: [1], // Mondays
    repeat_months: [9], // September 2026
    repeat_exceptions: ['2026-09-07'],
    show_on_boosters: 1,
  };
  const occurrences = expandRecurringEvent(series);
  assert.ok(occurrences.length > 0);
  assert.deepEqual(occurrences.map((item) => item.occurrence_date), [
    '2026-09-14',
    '2026-09-21',
    '2026-09-28',
  ]);
  assert.ok(occurrences.every((item) => item.is_occurrence === true));
  assert.ok(occurrences.every((item) => item.series_id === 42));
  assert.ok(occurrences.every((item) => item.show_on_boosters === 0));
  assert.equal(occurrences[0].date_label, 'Sep');
  assert.equal(occurrences[0].date_detail, '14');

  const single = expandRecurringEvent({
    id: 7,
    date_label: 'Oct',
    date_detail: '05',
    event_year: 2026,
    title: 'One-off',
    repeat_enabled: 0,
  });
  assert.equal(single.length, 1);
  assert.equal(single[0].is_occurrence, false);
  assert.equal(single[0].series_id, 7);
});

test('ensureBoosterMeetingsSlot injects meetings list hook into Boosters card', () => {
  const html = ensureBoosterMeetingsSlot('<article class="card"><span class="tag">Meetings</span><h3>Booster Meetings</h3><p>Placeholder for monthly meeting schedule.</p></article>');
  assert.match(html, /data-booster-meetings/);
  assert.match(html, /Booster Meetings/);
  assert.equal(ensureBoosterMeetingsSlot(html), html);
});

test('ensureFundraisingDonateSlot injects popup donate button into CMS fundraising body', () => {
  const liveStyle = `<section class="page-hero" data-cms-layout="standard"><div class="page-title"><h1>Fundraising</h1></div></section><section class="content"><div class="wrap"><div class="card" data-cms-field="body_text"><p>Buy a raffle ticket</p></div></div></section>`;
  const html = ensureFundraisingDonateSlot(liveStyle);
  assert.match(html, /data-donate-open/);
  assert.match(html, /Direct Support/);
  assert.doesNotMatch(html, /data-square-checkout/);
  assert.doesNotMatch(html, /square\.link\/u\/IIGMHqVQ/);
  assert.match(html, /Buy a raffle ticket/);
  assert.equal(ensureFundraisingDonateSlot(html), html);

  const legacy = `<article class="card accent-card square-donate-card" data-square-donate><h3>Direct Support</h3><a class="btn primary" data-square-checkout data-url="https://square.link/u/IIGMHqVQ?src=embd" href="https://square.link/u/IIGMHqVQ?src=embed" target="_blank">Donate</a></article>`;
  const rewritten = ensureFundraisingDonateSlot(legacy);
  assert.match(rewritten, /data-donate-open/);
  assert.doesNotMatch(rewritten, /data-square-checkout/);
});


test('refreshHomeHeroBrandMark updates the Band information card logo', () => {
  const html = '<aside class="hero-card"><img src="/assets/efhs-logo.png" alt="East Forsyth logo"><h2>Band information in one place</h2></aside>';
  const next = refreshHomeHeroBrandMark(html);
  assert.match(next, /efhs-blue-regiment-mark\.png\?v=security-log-pager-20260816/);
  assert.doesNotMatch(next, /efhs-logo\.png/);
  assert.match(next, /Band information in one place/);
});

test('refreshHomeStartHereSection updates outdated Start here copy', () => {
  const stale = `<section><div class="wrap"><div class="section-head"><div><div class="kicker">Start here</div><h2>Built around the pages families expect.</h2></div><p>Modeled after a full high-school band program site structure, with East Forsyth branding and easy paths for students, parents, sponsors, and visitors.</p></div><div class="grid cards"><article class="card red-card"><span class="tag">Program</span><h3>Ensembles</h3><p>Marching band, concert bands, percussion, color guard, jazz, and chamber opportunities.</p></article><article class="card red-card"><span class="tag">Families</span><h3>Resources</h3><p>Forms, handbook links, rehearsal expectations, fees, uniforms, and travel information.</p></article><article class="card red-card"><span class="tag">Community</span><h3>Sponsors</h3><p>A place for local businesses and alumni to support the program and be recognized.</p></article></div></div></section>`;
  const html = refreshHomeStartHereSection(stale);
  assert.match(html, /Everything families need, all in one place\./);
  assert.match(html, /East Forsyth Blue Regiment/);
  assert.match(html, /Explore our marching band/);
  assert.match(html, /Find forms, handbooks/);
  assert.match(html, /Discover the businesses and community partners/);
  assert.doesNotMatch(html, /Built around the pages families expect\./);
  assert.equal(refreshHomeStartHereSection(html), html);
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
  assert.equal(shouldRedirectToMaintenance('/contact.html', on, { bypass: true }), false);
  assert.equal(shouldRedirectToMaintenance('/', on, { bypass: true }), false);
  // Non-super-admin visitors still redirect when bypass is false.
  assert.equal(shouldRedirectToMaintenance('/sponsors.html', on, { bypass: false }), true);
  const banner = renderMaintenancePreviewBanner();
  assert.match(banner, /Maintenance mode is on/);
  assert.match(banner, /Super Admin preview/);
  assert.match(banner, /data-maintenance-preview-banner/);
  assert.match(banner, /\/admin/);
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
  assert.match(html, /data-cms-field="bronze_amount"/);
  assert.match(html, /Custom Bronze/);
  assert.match(html, /\$100/);
  assert.match(html, /\$250/);
  assert.match(html, /\$500/);
  assert.match(html, /Top package for &lt;partners&gt;\./);
  assert.match(html, /Silver Sponsor/);
  assert.match(html, /become-sponsor-panel/);
  assert.match(html, /data-contact-form-slot/);
  assert.doesNotMatch(html, /data-sponsors/);
  const extracted = extractSponsorTierFields(html);
  assert.equal(normalizeSponsorTierFields(extracted).bronze_title, 'Custom Bronze');
  assert.equal(normalizeSponsorTierFields(extracted).bronze_amount, '$100');
  assert.match(extracted.gold_blurb, /Top package for/);
});

test('become-sponsor save payload persists custom tier dollar amounts', () => {
  const html = generateStructuredPageHtml({
    layout: 'become-sponsor',
    kicker: 'Support',
    heading: 'Become a Sponsor',
    intro: 'Choose a package.',
    body_text: 'Ready to partner.',
    bronze_amount: '$175',
    silver_amount: '$325',
    gold_amount: '$750',
  });
  assert.match(html, /\$175/);
  assert.match(html, /\$325/);
  assert.match(html, /\$750/);
  const extracted = normalizeSponsorTierFields(extractSponsorTierFields(html));
  assert.equal(extracted.bronze_amount, '$175');
  assert.equal(extracted.silver_amount, '$325');
  assert.equal(extracted.gold_amount, '$750');
  const rebuilt = ensureSponsorTiersSection(html);
  const rebuiltFields = normalizeSponsorTierFields(extractSponsorTierFields(rebuilt));
  assert.equal(rebuiltFields.bronze_amount, '$175');
  assert.equal(rebuiltFields.gold_amount, '$750');
});

test('sponsor amount helpers parse display currency into cents', () => {
  assert.equal(parseSponsorAmountCents('$100'), 10000);
  assert.equal(parseSponsorAmountCents('$250.50'), 25050);
  assert.equal(parseSponsorAmountCents('bogus'), 0);
  assert.equal(resolveSponsorAmountCents({ amountCents: 10000, amountDisplay: '$100' }), 10000);
  assert.equal(resolveSponsorAmountCents({ amountCents: '25000' }), 25000);
  assert.equal(resolveSponsorAmountCents({ amountDisplay: '$175' }), 17500);
  assert.equal(formatSponsorAmountDisplay(10000), '$100');
  assert.equal(formatSponsorAmountDisplay(25050), '$250.50');
  assert.equal(normalizeSponsorTierKey('Gold'), 'gold');
  assert.equal(normalizeSponsorTierKey('platinum'), '');
  assert.equal(squareCheckoutConfigured({}), false);
  assert.equal(squareCheckoutConfigured({
    SQUARE_ACCESS_TOKEN: 'tok',
  }), true);
  assert.equal(pickSquareLocationId([
    { id: 'LINACTIVE', status: 'INACTIVE' },
    { id: 'LACTIVE', status: 'ACTIVE' },
  ]), 'LACTIVE');
  assert.equal(pickSquareLocationId([
    { id: 'LA', status: 'ACTIVE' },
    { id: 'LB', status: 'ACTIVE' },
  ], 'LB'), 'LB');
  assert.equal(squareApiBase({ SQUARE_ENVIRONMENT: 'sandbox' }), 'https://connect.squareupsandbox.com');
  assert.equal(squareApiBase({}), 'https://connect.squareup.com');
  assert.equal(sponsorLevelFromTierKey('gold'), 'Gold Sponsor');
  assert.equal(sponsorBenefitsFromLevel('Silver Sponsor').show_flyin, true);
  assert.equal(sponsorBenefitsFromLevel('Bronze Sponsor').show_flyin, false);
  assert.equal(sponsorBenefitsFromLevel('Gold Sponsor').show_game_announcement, true);
  assert.equal(squareMockPayEnabled({}), false);
  assert.equal(squareMockPayEnabled({ SQUARE_ALLOW_MOCK_PAY: '1' }), true);
  assert.equal(squareMockPayEnabled({ SQUARE_ALLOW_MOCK_PAY: '0' }), false);
});

test('ensureSponsorTiersSection injects Bronze Silver Gold packages once', () => {
  const tiers = renderSponsorTiersHtml();
  assert.match(tiers, /home football games/);
  assert.match(tiers, /Homepage fly-in advert/);
  assert.match(tiers, /website sponsor marquee/);
  assert.match(tiers, /sponsor-tier-amount/);
  assert.match(tiers, /\$100/);
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

test('ensureSponsorDonateButton adds Donate control beside Become a sponsor', () => {
  const bare = '<div class="sponsor-intro"><div data-cms-field="body_text"><p>Thanks</p></div><a class="btn primary" href="/become-a-sponsor.html">Become a sponsor</a></div><div class="sponsor-directory" data-sponsors></div>';
  const withDonate = ensureSponsorDonateButton(bare);
  assert.match(withDonate, /data-donate-open/);
  assert.match(withDonate, /sponsor-intro-actions/);
  assert.equal(ensureSponsorDonateButton(withDonate), withDonate);
  const structured = generateStructuredPageHtml({
    layout: 'sponsors',
    title: 'Sponsors',
    kicker: 'Community',
    heading: 'Our Sponsors',
    intro: 'Support the band.',
    body_text: '<p>Thanks</p>',
    callout_title: 'Want your business here?',
    callout_text: '<p>Packages available.</p>',
  });
  assert.match(structured, /data-donate-open/);
  assert.match(structured, /Become a sponsor/);
});

test('buildSponsorDonationInvoice describes Band Boosters donation from no-reply sender', () => {
  const invoice = buildSponsorDonationInvoice({
    id: 42,
    tier: 'gold',
    amount_cents: 50000,
    amount_display: '$500',
    business_name: 'Acme Music',
    address: '100 Band Way, Kernersville, NC',
    phone: '(336) 555-0100',
    email: 'billing@acme.example',
    paid_at: '2026-08-05T15:00:00.000Z',
  });
  assert.equal(invoice.from_email, SPONSOR_INVOICE_FROM_EMAIL);
  assert.equal(invoice.from_email, 'no-reply@efhsband.org');
  assert.equal(invoice.to, 'billing@acme.example');
  assert.match(invoice.subject, /East Forsyth Band Boosters/);
  assert.match(invoice.text, /donation to the East Forsyth Band Boosters/i);
  assert.match(invoice.text, /Acme Music/);
  assert.match(invoice.text, /\$500/);
  assert.match(invoice.html, /East Forsyth Band Boosters/);
  assert.equal(invoice.invoice_number, 'SP-42');
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
  assert.equal(links[1].platform, 'x');
  assert.equal(links[1].href, '');
  assert.equal(links[2].platform, 'instagram');
  assert.equal(links[2].href, 'https://instagram.com/efhsband');
  assert.equal(links[3].href, 'https://youtube.com/@efhsband');
  const html = renderSocialLinks({ social_links: links });
  assert.match(html, /footer-social/);
  assert.match(html, /instagram\.com\/efhsband/);
  assert.match(html, /aria-label="Instagram"/);
  assert.match(html, /is-placeholder/);
  assert.doesNotMatch(html, /javascript:/);
  const emptyHtml = renderSocialLinks({ social_links: [] });
  assert.match(emptyHtml, /footer-social/);
  assert.match(emptyHtml, /is-placeholder/);
  assert.doesNotMatch(emptyHtml, /href=/);
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

test('resolveAdminMailSender uses logged-in user email for Reply-To', () => {
  const ok = resolveAdminMailSender({ username: 'Jamie@EFHSBand.org', display_name: 'Jamie Olsen' });
  assert.equal(ok.ok, true);
  assert.equal(ok.replyTo, 'jamie@efhsband.org');
  assert.equal(ok.fromName, 'Jamie Olsen');
  const missing = resolveAdminMailSender({ username: 'not-an-email', display_name: 'Staff' });
  assert.equal(missing.ok, false);
  assert.match(missing.detail, /valid email/i);
  const fallback = resolveAdminMailSender({ username: 'admin@efhsband.org', display_name: '  ' });
  assert.equal(fallback.fromName, 'admin@efhsband.org');
});

test('meeting minutes dates and secretary edit window', () => {
  assert.equal(parseMeetingDateInput('08/04/2026'), '2026-08-04');
  assert.equal(parseMeetingDateInput('08042026'), '2026-08-04');
  assert.equal(parseMeetingDateInput('2026-08-04'), '2026-08-04');
  assert.equal(parseMeetingDateInput('13/40/2026'), null);
  assert.equal(parseMeetingDateInput('13402026'), null);
  assert.equal(formatMeetingDateDisplay('2026-08-04'), '08/04/2026');
  const payload = normalizeMinutesPayload({
    meeting_date: '08/04/2026',
    body_html: '<p>Called to order</p><script>alert(1)</script>',
  });
  assert.equal(payload.meeting_date, '2026-08-04');
  assert.equal(normalizeMinutesPayload({ meeting_date: '08042026', body_html: '<p>x</p>' }).meeting_date, '2026-08-04');
  assert.match(payload.body_html, /Called to order/);
  assert.doesNotMatch(payload.body_html, /script/i);
  assert.equal(MINUTES_EDIT_WINDOW_DAYS, 10);

  const secretary = { role: 'editor', permissions: ['minutes'] };
  const viewer = { role: 'editor', permissions: ['minutes:view'] };
  const outsider = { role: 'editor', permissions: ['mail'] };
  const admin = { role: 'admin', permissions: [] };
  const today = new Date();
  const freshMeetingDate = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  const staleDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 11));
  const staleMeetingDate = `${staleDay.getUTCFullYear()}-${String(staleDay.getUTCMonth() + 1).padStart(2, '0')}-${String(staleDay.getUTCDate()).padStart(2, '0')}`;
  const fresh = { meeting_date: freshMeetingDate, created_at: new Date().toISOString() };
  const stale = { meeting_date: staleMeetingDate, created_at: new Date().toISOString() };
  assert.equal(canViewMeetingMinutes(secretary), true);
  assert.equal(canViewMeetingMinutes(viewer), true);
  assert.equal(canViewMeetingMinutes(outsider), true);
  assert.equal(canViewMeetingMinutes(null), false);
  assert.equal(canManageMeetingMinutes(secretary), true);
  assert.equal(canManageMeetingMinutes(viewer), false);
  assert.equal(canEditMeetingMinutes(secretary, fresh), true);
  assert.equal(canEditMeetingMinutes(secretary, stale), false);
  assert.equal(canEditMeetingMinutes(viewer, fresh), false);
  assert.equal(canEditMeetingMinutes(admin, stale), true);
  assert.equal(canDeleteMeetingMinutes(secretary), false);
  assert.equal(canDeleteMeetingMinutes(viewer), false);
  assert.equal(canDeleteMeetingMinutes(admin), true);
  // Editors with broad permissions still cannot delete — Super Admin role only.
  assert.equal(canDeleteMeetingMinutes({ role: 'editor', permissions: ['all'] }), false);
  assert.equal(canDeleteMeetingMinutes({ role: 'editor', permissions: ['minutes', 'minutes:view', 'users'] }), false);
  assert.equal(canDeleteMeetingMinutes(null), false);
  assert.ok(minutesEditableUntil(fresh.meeting_date) instanceof Date);
  assert.equal(minutesEditableUntil('2026-08-04')?.toISOString(), '2026-08-14T00:00:00.000Z');
  // Recently uploaded minutes for an older meeting date are still locked for secretaries.
  assert.equal(canEditMeetingMinutes(secretary, {
    meeting_date: '2026-07-01',
    created_at: new Date().toISOString(),
  }), false);

  assert.equal(canAccessCheckout({ role: 'editor', permissions: ['treasurer'] }), true);
  assert.equal(canAccessCheckout({ role: 'editor', permissions: ['president'] }), true);
  assert.equal(canAccessCheckout({ role: 'editor', permissions: ['vice-president'] }), true);
  assert.equal(canAccessCheckout({ role: 'editor', permissions: ['sponsors'] }), false);
  assert.equal(canAccessCheckout({ role: 'admin', permissions: [] }), true);

  const documentHtml = renderMinutesDocumentHtml(
    { title: 'East Forsyth Band' },
    {
      meeting_date: '2026-08-04',
      created_by_name: 'Secretary Sue',
      body_html: '<p>Called to order</p><script>alert(1)</script>',
    },
  );
  assert.match(documentHtml, /Booster Meeting Minutes/);
  assert.match(documentHtml, /08\/04\/2026/);
  assert.match(documentHtml, /Secretary Sue/);
  assert.match(documentHtml, /Called to order/);
  assert.doesNotMatch(documentHtml, /<script/i);
  assert.match(documentHtml, /window\.print\(\)/);
  assert.doesNotMatch(documentHtml, /efhs-blue-regiment-mark/);
  assert.doesNotMatch(documentHtml, /letterhead-mark/);

  const docxBody = sanitizeRichHtml(`<div class="minutes-docx"><div class="draft">MINUTES_FIELDS_V1:eyJ2IjoxfQ==</div><div class="kicker">East Forsyth Band Boosters</div><h2>Meeting Minutes</h2><h3>Call to Order</h3><p>Called to order.</p></div>`);
  assert.match(docxBody, /minutes-docx/);
  assert.match(docxBody, /MINUTES_FIELDS_V1:eyJ2IjoxfQ==/);
  assert.match(docxBody, /class="draft"/);
  assert.match(docxBody, /class="kicker"/);
  const docxDocument = renderMinutesDocumentHtml(
    { title: 'East Forsyth Band' },
    {
      meeting_date: '2026-08-04',
      created_by_name: 'Secretary Sue',
      body_html: docxBody,
    },
  );
  assert.match(docxDocument, /minutes-template\/letterhead-banner/);
  assert.match(docxDocument, /Meeting Minutes/);
  assert.match(docxDocument, /Call to Order/);
  assert.doesNotMatch(docxDocument, /Booster Meeting Minutes/);
  assert.match(docxDocument, /\.draft\s*\{\s*display:\s*none/);
});



test('DOCX minutes upload extracts meeting date and structured fields', async () => {
  assert.equal(extractMeetingDateFromFilename('Boosters_Minutes_09-15-2026.docx'), '2026-09-15');
  assert.equal(extractMeetingDateFromFilename('minutes-2026_08_04.docx'), '2026-08-04');
  assert.equal(extractMeetingDateFromMinutesText('MEETING MINUTES\nDate: 08/04/2026\nTime: 7pm\nNEXT MEETING\nDate: 09/01/2026'), '2026-08-04');
  assert.equal(extractMeetingDateFromMinutesText('Date: ________\nNEXT MEETING\nDate: 09/01/2026', 'Minutes_08-12-2026.docx'), '2026-08-12');

  const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'boosters-minutes-dated.docx');
  const buf = readFileSync(fixturePath);
  const parsed = await parseBoostersMinutesDocx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'boosters-minutes-dated.docx');
  assert.equal(parsed.meeting_date, '2026-08-04');
  assert.equal(parsed.meeting_date_display, '08/04/2026');
  assert.equal(parsed.fields.location, 'Band Room');
  assert.equal(parsed.fields.treasurer_report, 'Balance is healthy.');
  assert.equal(parsed.fields.action_item_1, 'Send reminder email');
  assert.equal(parsed.fields.next_meeting_date, '09/01/2026');
  assert.equal(parsed.fields.next_meeting_time, '7:00 PM');
  assert.equal(parsed.fields.submitted_by, 'Secretary Sue');
  assert.match(parsed.body_html, /minutes-docx/);
  assert.match(parsed.body_html, /MINUTES_FIELDS_V1:/);
  assert.match(parsed.body_html, /Band Room/);

  const fields = parseBoostersMinutesFieldsFromText(parsed.plain_text);
  assert.equal(fields.call_to_order_by, 'Jane President');
  assert.match(fields.members_present, /Alice/);
});

test('ensemble body helpers extract and replace only the content section', () => {
  const page = '<section class="page-hero"><h1>Ensembles</h1></section><section class="content"><div class="wrap"><div class="grid cards"><article class="card"><h3>Marching</h3></article></div></div></section>';
  const body = extractEnsemblesBodyHtml(page);
  assert.match(body, /Marching/);
  assert.doesNotMatch(body, /page-hero/);
  const next = applyEnsemblesBodyHtml(page, '<div class="grid cards"><article class="card"><h3>Jazz</h3><script>alert(1)</script></article></div>');
  assert.match(next, /page-hero/);
  assert.match(next, /data-ensembles-body/);
  assert.match(next, /Jazz/);
  assert.doesNotMatch(next, /Marching/);
  assert.doesNotMatch(next, /<script/i);
  assert.equal(sanitizePageSectionHtml('<p>Hi</p><script>x</script>'), '<p>Hi</p>');
});

test('parseZernioFacebookConnection reads stored page connection', () => {
  assert.equal(parseZernioFacebookConnection(''), null);
  assert.equal(parseZernioFacebookConnection('{"platform":"facebook"}'), null);
  const parsed = parseZernioFacebookConnection(JSON.stringify({
    accountId: 'acc_123',
    profileId: 'prof_456',
    name: 'East Forsyth Band',
    username: 'efhsband',
    connectedAt: '2026-08-05T00:00:00.000Z',
  }));
  assert.equal(parsed.accountId, 'acc_123');
  assert.equal(parsed.profileId, 'prof_456');
  assert.equal(parsed.name, 'East Forsyth Band');
  assert.equal(parsed.platform, 'facebook');
});

test('parseZernioUserProfile reads OAuth callback profile JSON', () => {
  assert.equal(parseZernioUserProfile(''), null);
  const profile = parseZernioUserProfile(JSON.stringify({ id: '99', name: 'Band Admin' }));
  assert.equal(profile.id, '99');
  assert.equal(profile.name, 'Band Admin');
});

test('sanitizeAdminReturnPath only allows admin return paths', () => {
  assert.equal(sanitizeAdminReturnPath('/admin?tab=social&zernio=facebook_select'), '/admin?tab=social&zernio=facebook_select');
  assert.equal(sanitizeAdminReturnPath('https://evil.example/admin'), '/admin');
  assert.equal(sanitizeAdminReturnPath('/api/admin/me'), '/admin');
});

test('formatFacebookCalendarDigest lists queued events for Facebook', () => {
  const state = parseFacebookEventSyncState('');
  assert.equal(state.seeded, false);
  assert.deepEqual(state.pending, {});
  assert.deepEqual(state.ignored, {});
  assert.equal(state.publishDisabledCleared, false);
  const digest = formatFacebookCalendarDigest([
    { id: 1, date_label: 'Aug', date_detail: '15', event_year: 2026, title: 'Band Camp', description: 'All day at the school.' },
    { id: 2, repeat_enabled: 1, repeat_days: [5], repeat_months: [8, 9], event_year: 2026, title: 'Football Friday', description: 'Pre-game.' },
  ], { calendarUrl: 'https://efhsband.org/calendar.html' });
  assert.match(digest, /East Forsyth Band — calendar updates/);
  assert.match(digest, /Aug 15, 2026 — Band Camp/);
  assert.match(digest, /Football Friday/);
  assert.match(digest, /Full calendar: https:\/\/efhsband\.org\/calendar\.html/);
  const fingerprint = eventFacebookFingerprint({
    date_label: 'Aug',
    date_detail: '15',
    event_year: 2026,
    title: 'Band Camp',
    description: 'All day at the school.',
  });
  assert.match(fingerprint, /Band Camp/);
});


test('facebook calendar suggestion ignore state can clear legacy queue', async () => {
  const cleared = await clearLegacyFacebookPublishQueueIfNeeded({ DB: null }, {
    pending: {
      10: { fingerprint: 'fp-a', queuedAt: '2026-08-01T00:00:00.000Z', reason: 'seed' },
      11: { fingerprint: 'fp-b', queuedAt: '2026-08-01T00:00:00.000Z', reason: 'new' },
    },
    posted: {},
    ignored: {},
    seeded: true,
    publishDisabledCleared: false,
  });
  assert.equal(cleared.publishDisabledCleared, true);
  assert.deepEqual(cleared.pending, {});
  assert.equal(cleared.ignored['10'].fingerprint, 'fp-a');
  assert.equal(cleared.ignored['11'].reason, 'cleared');
  const again = await clearLegacyFacebookPublishQueueIfNeeded({ DB: null }, cleared);
  assert.deepEqual(again.pending, {});
  assert.equal(again.publishDisabledCleared, true);
});

test('normalizeZernioPostPayload builds publish-now and scheduled Facebook posts', () => {
  const account = { accountId: 'acc_123', name: 'East Forsyth Band' };
  assert.throws(() => normalizeZernioPostPayload({ content: '' }, account), /Post content is required/);
  assert.throws(() => normalizeZernioPostPayload({ content: 'Hello' }, null), /Connect a Facebook Page/);
  const now = normalizeZernioPostPayload({
    content: 'Game day Friday',
    media_url: 'https://example.com/band.jpg',
    publish_now: true,
  }, account);
  assert.equal(now.content, 'Game day Friday');
  assert.equal(now.publishNow, true);
  assert.deepEqual(now.platforms, [{ platform: 'facebook', accountId: 'acc_123' }]);
  assert.deepEqual(now.mediaItems, [{ type: 'image', url: 'https://example.com/band.jpg' }]);
  const scheduled = normalizeZernioPostPayload({
    content: 'Rehearsal reminder',
    publish_now: false,
    scheduled_for: '2026-08-10T18:30',
    timezone: 'America/New_York',
  }, account);
  assert.equal(scheduled.publishNow, undefined);
  assert.equal(scheduled.scheduledFor, '2026-08-10T18:30');
  assert.equal(scheduled.timezone, 'America/New_York');
});


test('formatUserLastLoginDisplay formats Eastern timestamps and empty values', () => {
  assert.equal(formatUserLastLoginDisplay(''), 'Never logged in');
  assert.equal(formatUserLastLoginDisplay(null), 'Never logged in');
  const label = formatUserLastLoginDisplay('2026-08-16T18:05:00.000Z');
  assert.match(label, /^Last login /);
  assert.match(label, /ET$/);
  assert.match(label, /2026/);
});

test('notify me nav control is rendered in public navigation', () => {
  assert.match(renderNotifyMeNavControl(), /nav-notify-bell/);
  assert.match(renderNotifyMeNavControl(), /data-notify-me/);
  assert.match(renderAddToHomeNavControl(), /data-add-home/);
  assert.match(renderAddToHomeNavControl(), /nav-add-home-mark/);
  const nav = renderNav([
    { slug: 'home', path: '/', title: 'Home' },
    { slug: 'become-a-sponsor', path: '/become-a-sponsor.html', title: 'Become a Sponsor' },
    { slug: 'contact', path: '/contact.html', title: 'Contact' },
  ]);
  assert.match(nav, />Home</);
  assert.match(nav, />Contact</);
  assert.doesNotMatch(nav, /Become a Sponsor/);
  assert.match(nav, /data-staff-auth-link/);
  assert.match(nav, />Login</);
  assert.match(nav, /data-notify-me/);
  assert.match(nav, /Notify Me/);
  assert.match(nav, /data-add-home/);
  assert.ok(nav.indexOf('data-staff-auth-link') < nav.indexOf('data-notify-me'));
  assert.ok(nav.indexOf('data-notify-me') < nav.indexOf('data-add-home'));
  const loggedInNav = renderNav([
    { slug: 'home', path: '/', title: 'Home' },
  ], { loggedIn: true });
  assert.match(loggedInNav, /Staff Menu/);
  assert.match(loggedInNav, /href="\/admin"/);
});

test('admin sessions stay fresh for 24 hours and public nav reflects login state', () => {
  assert.equal(SESSION_TTL_SECONDS, 24 * 60 * 60);
  const now = 1_700_000_000;
  assert.equal(isSessionFresh(now - 60, now), true);
  assert.equal(isSessionFresh(now - SESSION_TTL_SECONDS, now), true);
  assert.equal(isSessionFresh(now - SESSION_TTL_SECONDS - 1, now), false);
  assert.equal(isSessionFresh(now + 120, now), false);
  assert.match(sessionCookieHeader('abc.token'), /Max-Age=86400/);
  assert.match(sessionCookieHeader('', { maxAge: 0 }), /Max-Age=0/);
  assert.match(renderStaffAuthNavLink(false), /Login/);
  assert.match(renderStaffAuthNavLink(false), /\/admin\/login/);
  assert.match(renderStaffAuthNavLink(true), /Staff Menu/);
  assert.match(renderStaffAuthNavLink(true), /href="\/admin"/);
});

test('normalizeWebPushSubscription validates browser push endpoints and keys', () => {
  assert.equal(normalizeWebPushSubscription({}).ok, false);
  assert.equal(normalizeWebPushSubscription({
    endpoint: 'http://example.com/push',
    keys: { p256dh: 'a'.repeat(40), auth: 'b'.repeat(16) },
  }).ok, false);
  const ok = normalizeWebPushSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'a'.repeat(40), auth: 'b'.repeat(16) },
    user_agent: 'Mozilla/5.0',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.endpoint, 'https://fcm.googleapis.com/fcm/send/abc123');
  assert.equal(ok.p256dh.length, 40);
  assert.equal(ok.auth.length, 16);
  assert.equal(ok.user_agent, 'Mozilla/5.0');
});

test('calendar web push helpers build notification payloads and parse state', () => {
  const created = buildCalendarPushPayload({
    action: 'created',
    event: { id: 40, title: '<span>Band Practice</span>' },
  });
  assert.equal(created.action, 'created');
  assert.equal(created.title, 'Band Practice');
  assert.equal(created.notification_title, 'New calendar event');
  assert.equal(created.url, '/calendar.html');
  assert.equal(parseCalendarPushState('{"revision":2,"action":"updated","title":"Spirit Week"}').revision, 2);
  assert.equal(emptyCalendarPushState().revision, 0);
});

test('push service worker and web app manifest assets exist', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sw = readFileSync(join(root, 'push-sw.js'), 'utf8');
  const manifest = readFileSync(join(root, 'manifest.webmanifest'), 'utf8');
  assert.match(sw, /showNotification/);
  assert.match(sw, /notificationclick/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /efhs-blue-regiment-mark\.png/);
  const script = readFileSync(join(root, 'script.js'), 'utf8');
  assert.match(script, /bindNotifyMeNavControl|data-notify-me|enableNotifyMe/);
  assert.match(script, /bindAddToHomeNavControl|data-add-home|ensureAddToHomeNavControl/);
  assert.match(script, /data-staff-auth-link|syncStaffAuthNavLink|Staff Menu/);
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  assert.match(styles, /nav-notify-me/);
  assert.match(styles, /nav-add-home/);
  assert.match(styles, /add-home-sheet/);
  assert.match(styles, /nav-bell-ring/);
  assert.match(styles, /menu-button-icon/);
  assert.match(styles, /mobile-nav-tray/);
  assert.match(styles, /header-quick-actions/);
  assert.match(script, /placeHeaderQuickActions|enhanceMenuButton/);
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /mobile-nav-tray/);
  assert.match(workerSrc, /menu-button-icon/);
  assert.match(workerSrc, /security-log-pager-20260816/);
  assert.match(workerSrc, /minutes-view-card/);
  assert.match(workerSrc, /minutes-view-back/);
  assert.match(workerSrc, /embed = false/);
  assert.match(workerSrc, /body\.is-embed/);
  assert.match(workerSrc, /tab-security-log/);
  assert.match(workerSrc, /admin_audit_log/);
  assert.match(workerSrc, /requireSecurityLogAccess/);
  assert.match(workerSrc, /canAccessSecurityLog/);
  assert.match(workerSrc, /security\.log\.view/);
  assert.match(workerSrc, /security-log-pager/);
  assert.match(workerSrc, /total_pages/);
  assert.match(workerSrc, /view and print only/i);
  assert.doesNotMatch(workerSrc, /minutes-view-modal/);
  // Security log must never appear as a grantable GLOBAL_PERMISSIONS scope.
  const permissionsDecl = workerSrc.match(/const GLOBAL_PERMISSIONS = \[([^\]]+)\]/);
  assert.ok(permissionsDecl);
  assert.doesNotMatch(permissionsDecl[1], /security-log/);
  assert.match(workerSrc, /last_login_at/);
  assert.match(workerSrc, /UPDATE users SET last_login_at/);
  const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
  assert.match(adminJs, /formatUserLastLoginLabel/);
  assert.match(adminJs, /user-last-login/);
  assert.match(adminJs, /#minutes-view/);
  assert.match(adminJs, /syncMinutesMobileViewing/);
  assert.match(adminJs, /embed=1/);
  assert.match(adminJs, /loadSecurityLog/);
  assert.match(adminJs, /renderSecurityLogPager/);
  assert.match(adminJs, /securityLogPage/);
  assert.match(adminJs, /security-log/);
  assert.match(adminJs, /tab', 'security'/);
  assert.match(adminJs, /Always pin Security Log/);
  assert.match(adminJs, /Security log is Super Admin only/);
  assert.doesNotMatch(adminJs, /minutes-view-modal/);
  assert.match(styles, /\.user-admin-row \.user-last-login/);
  assert.match(styles, /is-minutes-viewing/);
  assert.match(styles, /minutes-mobile-viewing/);
  assert.match(styles, /\.security-log-entry/);
  assert.match(styles, /\.dash-card-security/);
  assert.match(styles, /order:9999/);
  assert.match(styles, /\.security-log-pager/);
  assert.match(styles, /\.security-log-page-btn/);
  const markBytes = readFileSync(join(root, 'assets/efhs-blue-regiment-mark.png'));
  // Updated circular mark from the restored upload (not the Aug 5 letterhead crop).
  assert.notEqual(createHash('md5').update(markBytes).digest('hex'), '0de3ab10f088d89df03c43e88dc2bb58');
  assert.equal(createHash('md5').update(markBytes).digest('hex'), '5d14e214a88f632e2ad56559f2f36520');
  assert.doesNotMatch(workerSrc, /MINUTES_LETTERHEAD_MARK/);
  assert.doesNotMatch(workerSrc, /letterhead-mark/);

  assert.match(workerSrc, /Suggested calendar updates/);
  assert.match(workerSrc, /zernio-facebook-events-ignore-all/);
  assert.doesNotMatch(workerSrc, /zernio-facebook-events-publish/);
  assert.doesNotMatch(workerSrc, /gold-tier-benefits-card/);
  assert.doesNotMatch(workerSrc, /id="sponsor-preview"/);
});
