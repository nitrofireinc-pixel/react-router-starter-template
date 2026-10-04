import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { applyHomeFeatureCards, applyHomeCalendarHighlights, homeEventsLimitFromHtml, renderCalendarHighlightArticles, canAccessCheckout, canAccessScheduleBoard, canAccessBadgeCreator, canAccessSecurityLog, canAccessTreasurerLedger, canAccessFormsPage, canCreateEvents, canViewEvents, canManageAllEvents, canMutateEvent, compareEventsByDate, decodeBasicHtmlEntities, describeContactEmailProvider, normalizeCommitteeBadgePayload, ensureCommitteeBadgesSchema, resetCommitteeBadgesSchemaCache, ensureBoosterMeetingsSlot, ensureBoosterMembersSlot, ensureBoostersDuesSlot, stripBoostersDuesSlot, applyBoostersDuesVisibility, isBoostersDuesEnabled, ensureCalendarMonthMount, ensureFundraisingDonateSlot, ensureGalleryPageSlot, ensureHomePhotoGallerySlot, ensureSponsorDonateButton, buildDuesReceipt, recordDuesPaymentLedger, recordDuesFailedLedger, refreshHomeStartHereSection, refreshHomeHeroBrandMark, ensureSponsorTiersSection, escapeHtml, escapeXml, expandRecurringEvent, formatHeaderBrandTitle, extractHomeFeatureCards, extractSponsorTierFields, formatInlineRichText, formatRepeatSummary, formatRichText, formatSponsorAddress, formatSponsorAmountDisplay, formatLedgerAmountDisplay, normalizeLedgerKind, ledgerSignedCents, summarizeLedgerEntries, buildPaymentLedgerXml, buildPaymentLedgerExcelXml, LEDGER_KINDS, LEDGER_INCOME_KINDS, generateStructuredPageHtml, hasPermission, htmlToPlainText, hydrateSponsor, isMaintenanceMode, isUpcomingEvent, isValidEmail, jsonResponse, publicSitePayload, PUBLIC_SITE_KEYS, DEFAULT_SITE, normalizeAdminMailPayload, normalizeBoosterMemberPayload, normalizeBoosterMemberReorderIds, normalizeContactTopicPayload, parseRecipientUserIds, contactTopicHasRecipients, serializeContactTopic, formatContactRecipientLabel, normalizeEventPayload, normalizeHomeFeatureCards, normalizePageSlug, normalizePhotoMetaPayload, normalizeRepeatDays, normalizeRepeatExceptions, normalizeRepeatMonths, normalizeSocialHref, normalizeSocialLinks, normalizeSponsorAdSeconds, normalizeSponsorLevel, normalizeSponsorPayload, normalizeSponsorTier, normalizeSponsorTierFields, normalizeSponsorTierKey, isPublicPurchasableSponsorTier, normalizeStaffPayload, normalizeStaffReorderIds, normalizeStaticPath, normalizePublicHtmlPath, isPublicHtmlPath, normalizeUtilityLinks, parseLegacySponsorAddress, parsePermissions, parseSponsorAmountCents, parseZernioFacebookConnection, parseZernioInstagramConnection, parseZernioUserProfile, normalizeZernioPostPayload, galleryInstagramCaption, isInstagramGalleryAutopostEnabled, isInstagramPublishableImage, resolveZernioApiKey, ZERNIO_API_KEY_CONTENT_KEY, sanitizeAdminReturnPath, parseFacebookEventSyncState, eventFacebookFingerprint, formatFacebookCalendarDigest, clearLegacyFacebookPublishQueueIfNeeded, pickSquareLocationId, SQUARE_SETTINGS_KEY, resolveSquareRuntimeEnv, syncSquareSettingsFromEnv, parseSquareSettings, renderBoosterMembersDirectory, renderBoostersDuesCard, renderContactForm, isDefaultContactTopicLabel, defaultContactTopicId, renderHomeFeatureCardsSection, renderMaintenancePreviewBanner, renderSocialLinks, publicPageShowsSponsorMarquee, renderSponsorMarqueeSection, renderSponsorTiersHtml, renderSponsorsDirectory, sponsorShowsMarquee, sponsorShowsOnPage, renderStaffDirectory, canDeleteMeetingMinutes, canEditMeetingMinutes, canManageMeetingMinutes, canViewMeetingMinutes, formatMeetingDateDisplay, MINUTES_EDIT_WINDOW_DAYS, minutesEditableUntil, normalizeMinutesPayload, parseMeetingDateInput, parseBoostersMinutesDocx, extractMeetingDateFromFilename, extractMeetingDateFromMinutesText, parseBoostersMinutesFieldsFromText, renderMinutesDocumentHtml, extractEnsemblesBodyHtml, applyEnsemblesBodyHtml, sanitizePageSectionHtml, resolveAdminMailSender, resolveContactEmailProvider, resolveSponsorAmountCents, rewriteBecomeSponsorLinks, rewriteSponsorChoiceButtons, sanitizeHomeBodyHtml, sanitizeInlineRichHtml, sanitizeMaintenanceReturnPath, sanitizeRichHtml, serializePagePayload, shouldRedirectToMaintenance, sortPhotosByRecent, sponsorBenefitsFromLevel, sponsorLevelFromTierKey, sponsorMapsUrls, squareApiBase, squareCheckoutConfigured, squareMockPayEnabled, stripSponsorTiersSection, validateSelfPasswordChange, buildSponsorDonationInvoice, SPONSOR_INVOICE_FROM_EMAIL, formatUserLastLoginDisplay, renderNav, HOME_HERO_PHOTO, pickPublicThemePhotoVars, renderPublicThemePhotoStyle, safePublicThemePhotoUrl, renderStaffAuthNavLink, renderUtilityLinks, renderNotifyMeNavControl, renderAddToHomeNavControl, isSessionFresh, sessionCookieHeader, SESSION_TTL_SECONDS, normalizeWebPushSubscription, buildCalendarPushPayload, parseCalendarPushState, normalizeEmailListTopics, wantsEmailListNotify, extractEmailAddress, isEmailListStopRequest, verifyResendWebhookSignature, ensureEmailListSignupSlot, renderEmailListSignup, buildEmailListUpdateMessage, buildEmailListWelcomeMessage, buildEmailListTopicsChangedMessage, formatEmailListTopicsLabel, emailListTopicsEqual, EMAIL_LIST_REPLY_TO, emptyCalendarPushState, normalizeInKindPayload, renderInKindFormHtml, renderInKindPageBody, buildInKindPdfBase64, buildInKindLedgerEntry, normalizeLettermanPayload, normalizeLettermanFormCopy, DEFAULT_LETTERMAN_FORM, createLettermanField, renderLettermanDeadlineBanner, renderLettermanPageBody, buildLettermanPdfBase64, emptyFormDefinition, normalizeFormDefinition, normalizeFormPayload, renderCmsFormPageBody, slugFromFormTitle, isReservedFormSlug, createFormField, isCmsFormPage, DB_SCHEMA_VERSION, initDb, resetDbInitCache, isWorkerStaticAssetPath, publicPhotoUrl, shouldInvalidatePublicReadCache, loginHintCookieHeader, LOGIN_HINT_COOKIE, applyAuthCookies, uploadCacheRequest, uploadCacheKeysForPhoto, PHOTO_BROWSER_CACHE } from '../worker/src/worker.mjs';
import {
  ensureCaldevSchema,
  resetCaldevSchemaCache,
} from '../worker/src/caldev.mjs';
import {
  APPROVED_HERO_SUBTITLE,
  PREVIOUS_HERO_SUBTITLE,
  buildHomeRedesignDocument,
  comingSoonPageHtml,
  decorateFundraisingPage,
  decorateHomeRedesign,
  extractFundraisingMedia,
  injectComingSoonLogos,
  plainHeroSubtitle,
  upgradeHomeBody,
  homeEventTag,
} from '../worker/src/home-redesign.mjs';


test('wrangler worker assets config must stay on worker/public', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  assert.match(toml, /directory\s*=\s*"\.\/worker\/public"/);
  assert.match(toml, /run_worker_first\s*=\s*\[/);
  assert.match(toml, /\/\*\.html/);
  assert.match(toml, /\/uploads\/\*/);
  assert.doesNotMatch(toml, /run_worker_first\s*=\s*true/);
  assert.match(toml, /html_handling\s*=\s*"none"/);
  assert.match(toml, /efhsband\.org\/\*/);
  assert.match(toml, /^name\s*=\s*"efhsband-live"/m);
  assert.doesNotMatch(toml, /directory\s*=\s*"\.\/assets"/);
  assert.doesNotMatch(toml, /DEV_UPLOAD_ORIGIN/);
  assert.doesNotMatch(toml, /^\s*EFBAND_ADMIN_PASSWORD\s*=/m);
});

test('production deploy refuses untracked files in the assets dir', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = readFileSync(join(root, 'package.json'), 'utf8');
  const script = readFileSync(join(root, 'worker/scripts/check-worker-public.mjs'), 'utf8');
  assert.match(pkg, /"check:worker-public": "node worker\/scripts\/check-worker-public\.mjs"/);
  assert.match(pkg, /sync:worker-assets && npm run check:worker-public && wrangler deploy/);
  assert.match(script, /untracked\/unexpected file/);

  const dirty = mkdtempSync(join(tmpdir(), 'efhs-public-'));
  mkdirSync(join(dirty, 'vendor', 'grapesjs'), { recursive: true });
  writeFileSync(join(dirty, 'vendor/grapesjs/extra.min.js'), 'leftover');
  const blocked = spawnSync(process.execPath, [join(root, 'worker/scripts/check-worker-public.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WORKER_PUBLIC_DIR: dirty },
  });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /untracked\/unexpected file/);

  const clean = mkdtempSync(join(tmpdir(), 'efhs-public-'));
  writeFileSync(join(clean, 'styles.css'), 'ok');
  writeFileSync(join(clean, 'admin-visual.js'), 'tracked on this branch');
  const allowed = spawnSync(process.execPath, [join(root, 'worker/scripts/check-worker-public.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WORKER_PUBLIC_DIR: clean },
  });
  assert.equal(allowed.status, 0, allowed.stderr);
});

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

test('public site payload is an allowlist and never includes secrets', () => {
  const leaked = publicSitePayload({
    title: 'East Forsyth Band',
    hero_title: 'Sound. Spirit. Eagle Pride.',
    square_settings: JSON.stringify({ access_token: 'EAABsecret-token', application_id: 'sq0idp-app' }),
    zernio_api_key: 'zn_live_secret',
    web_push_vapid_private: 'vapid-private-key',
    web_push_vapid_public: 'vapid-public-key',
    payment_ledger_xml: '<payment_ledger><entry>Domino</entry></payment_ledger>',
    calendar_push_state: '{"revision":9}',
    letterman_jacket_form: '{"title":"secret form"}',
    letterman_jacket_recipient_user_ids: '[11]',
    forms_recipient_user_ids: '[11]',
    forms_access_user_ids: '[11]',
    zernio_facebook: '{"accountId":"abc"}',
    zernio_facebook_debug: '{"keys":["zn_live_secret"]}',
    zernio_facebook_events: '{"pending":[]}',
    zernio_instagram: '{"accountId":"ig"}',
    zernio_instagram_gallery: '{"pending":[]}',
    zernio_profile_id: 'profile-id',
    schema_version: '99',
    service_mode: '1',
  });
  assert.deepEqual(Object.keys(leaked).sort(), [...PUBLIC_SITE_KEYS].sort());
  assert.equal(leaked.title, 'East Forsyth Band');
  assert.equal(leaked.hero_title, 'Sound. Spirit. Eagle Pride.');
  const serialized = JSON.stringify(leaked);
  for (const secret of [
    'square_settings',
    'access_token',
    'EAABsecret-token',
    'zernio_api_key',
    'zn_live_secret',
    'web_push_vapid_private',
    'vapid-private-key',
    'payment_ledger_xml',
    'letterman_jacket_form',
    'forms_recipient_user_ids',
  ]) {
    assert.equal(serialized.includes(secret), false, `public site JSON must not contain ${secret}`);
  }
  assert.ok(PUBLIC_SITE_KEYS.includes('title'));
  assert.ok(PUBLIC_SITE_KEYS.includes('sponsor_ad_seconds'));
  assert.equal(PUBLIC_SITE_KEYS.includes('square_settings'), false);
  assert.equal(Object.keys(DEFAULT_SITE).includes('zernio_api_key'), false);
});

test('public /api/site is built from the public site allowlist', () => {
  const workerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /if \(url\.pathname === '\/api\/site' && request\.method === 'GET'\)/);
  assert.match(workerSrc, /cachedPublicRead\('site', \(\) => getSite\(env\)\)/);
  assert.match(workerSrc, /const allowed = new Set\(PUBLIC_SITE_KEYS\);/);
  assert.match(workerSrc, /if \(allowed\.has\(row\.key\)\) payload\[row\.key\] = row\.value;/);
  assert.match(workerSrc, /return publicSitePayload\(payload\);/);
});

test('normalizeStaticPath protects root and strips leading slash', () => {
  assert.equal(normalizeStaticPath('/'), '/index.html');
  assert.equal(normalizeStaticPath('/calendar.html'), '/calendar.html');
  assert.equal(normalizeStaticPath('/../secret'), '/index.html');
});

test('pretty public paths map to CMS .html routes and count as HTML', () => {
  assert.equal(normalizePublicHtmlPath('/ensembles'), '/ensembles.html');
  assert.equal(normalizePublicHtmlPath('/ensembles/'), '/ensembles.html');
  assert.equal(normalizePublicHtmlPath('/ensembles.html'), '/ensembles.html');
  assert.equal(normalizePublicHtmlPath('/directors'), '/directors.html');
  assert.equal(normalizePublicHtmlPath('/'), '/');
  assert.equal(normalizePublicHtmlPath('/styles.css'), '/styles.css');
  assert.equal(normalizePublicHtmlPath('/uploads/photo.jpg'), '/uploads/photo.jpg');
  assert.equal(isPublicHtmlPath('/ensembles'), true);
  assert.equal(isPublicHtmlPath('/ensembles.html'), true);
  assert.equal(isPublicHtmlPath('/directors'), true);
  assert.equal(isPublicHtmlPath('/styles.css'), false);
  assert.equal(isPublicHtmlPath('/'), true);
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
  const viewer = { id: 3, role: 'editor', permissions: ['mail'] };
  assert.equal(canViewEvents(viewer), true);
  assert.equal(canCreateEvents(viewer), false);
  assert.equal(canViewEvents(null), false);
  assert.equal(canViewEvents(undefined), false);

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

test('sanitizeRichHtml keeps safe upload images and strips unsafe image sources', () => {
  const html = sanitizeRichHtml(
    '<p>Campaign</p><p class="cms-body-photo"><img src="/uploads/fundraiser.jpg" alt="Cookie dough" class="cms-body-photo" onerror="alert(1)"></p><img src="javascript:alert(1)"><img src="https://evil.example/x.jpg">',
  );
  assert.match(html, /src="\/uploads\/fundraiser\.jpg"/);
  assert.match(html, /alt="Cookie dough"/);
  assert.match(html, /class="cms-body-photo cms-body-photo-block"/);
  assert.doesNotMatch(html, /onerror/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /evil\.example/);
});

test('sanitizeRichHtml preserves body photo width and float for CMS editing', () => {
  const html = sanitizeRichHtml(
    '<p>Hello <img src="/uploads/a.jpg" alt="A" class="cms-body-photo cms-body-photo-left" style="width: 280px; height: auto;"> world</p>',
  );
  assert.match(html, /cms-body-photo-left/);
  assert.match(html, /Hello/);
  assert.match(html, /world/);
  assert.match(html, /width: 280px/);
});

test('CMS Fundraising page editor can insert and upload body photos', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const adminSrc = readFileSync(join(root, 'admin.js'), 'utf8');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  assert.match(workerSrc, /data-rich-insert-photo/);
  assert.match(workerSrc, /canEditPage\(auth\.user, 'fundraising'\)/);
  assert.match(adminSrc, /function insertPhotoIntoPageBody/);
  assert.match(adminSrc, /function showPagePhotoToast/);
  assert.match(adminSrc, /function uploadAndInsertPagePhoto/);
  assert.match(adminSrc, /data-rich-insert-photo/);
  assert.match(adminSrc, /sortOrder: -600/);
  assert.match(styles, /\.admin-page-photo-toast/);
  assert.match(styles, /\.cms-photo-resize-handles/);
});

test('CMS Home Band information card is one rich editor with lists and photos', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const adminSrc = readFileSync(join(root, 'admin.js'), 'utf8');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  assert.match(adminSrc, /querySelectorAll\('\.hero-card'\)/);
  assert.match(adminSrc, /cms-home-hero-card/);
  assert.match(adminSrc, /dataset\.cmsHomeField = 'hero-card'/);
  assert.match(adminSrc, /el\.closest\('\.hero-card, \.cms-edit-field'\)/);
  assert.match(adminSrc, /inHeroCard \? 'cms-body-photo-block' : 'cms-body-photo-left'/);
  assert.match(adminSrc, /selectedImg\.setAttribute\('src', url\)/);
  assert.match(adminSrc, /#admin-page-photo-toast/);
  assert.match(adminSrc, /function isHomeHeroBrandMarkSrc/);
  assert.match(adminSrc, /function restoreHomeHeroCardUploadSrc/);
  assert.match(adminSrc, /function sanitizeHomeHeroPasteHtml/);
  assert.match(workerSrc, /data-rich="insertUnorderedList"/);
  assert.match(workerSrc, /• List/);
  assert.match(workerSrc, /add or remove bullets/);
  assert.match(styles, /\.page-preview \.hero-card\.cms-edit-rich/);
  assert.match(styles, /\.hero-card img\.cms-body-photo-block/);
  const assetHtml = sanitizeRichHtml('<p><img src="/assets/efhs-blue-regiment-mark.png" alt="Mark"></p>');
  assert.match(assetHtml, /src="\/assets\/efhs-blue-regiment-mark\.png"/);
});

test('generateStructuredPageHtml preserves body photo inserts', () => {
  const html = generateStructuredPageHtml({
    layout: 'standard',
    kicker: 'Support',
    heading: 'Fundraising',
    intro: 'Help the band',
    body_text: '<p>Spring campaign</p><img src="/uploads/spring.jpg" alt="Spring fundraiser" class="cms-body-photo cms-body-photo-left" style="width: 228px; height: auto;" data-photo-width="228">',
  });
  assert.match(html, /data-cms-field="body_text"/);
  assert.match(html, /src="\/uploads\/spring\.jpg"/);
  assert.match(html, /alt="Spring fundraiser"/);
  assert.match(html, /cms-body-photo-left/);
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

  // CMS stores footer_note as block HTML (<p>...</p>). Wrapping that in another <p>
  // makes the browser split the tags, then client hydrate fills the empty one — duplicate text.
  const footerNote = formatRichText('<p>This site has been donated by Nitrofire Computing.</p>');
  const footerHtml = `<div class="footer-note" data-site-field="footer_note">${footerNote}</div>`;
  assert.match(footerHtml, /class="footer-note"/);
  assert.doesNotMatch(footerHtml, /<p[^>]*data-site-field="footer_note"/);
  assert.match(footerHtml, /<div class="footer-note"[^>]*>\s*<p>This site has been donated by Nitrofire Computing\.<\/p>\s*<\/div>/);
  const workerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /<div class="footer-note" data-site-field="footer_note">\$\{formatRichText\(site\.footer_note\)\}<\/div>/);
  assert.doesNotMatch(workerSrc, /<p data-site-field="footer_note">/);
  const indexHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
  assert.match(indexHtml, /<div class="footer-note" data-site-field="footer_note">/);
  assert.doesNotMatch(indexHtml, /<p data-site-field="footer_note">/);
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
  assert.match(page.body_html, /id=["']caldev-app["']/);
  assert.doesNotMatch(page.body_html, /data-events/);
  assert.match(page.body_html, /Use the Calendar tab/);
  assert.doesNotMatch(page.body_html, /<textarea/);
});

test('ensureCalendarMonthMount replaces nested event timelines with the Schedule Board mount', () => {
  const html = '<section class="content soft"><div class="wrap"><div class="timeline" data-events data-limit="5"><article class="event"><div class="datebox">Aug <span>01</span></div><div><h3>Band Camp</h3><p>Details</p></div></article></div></div></section>';
  const next = ensureCalendarMonthMount(html);
  assert.match(next, /id=["']caldev-app["']/);
  assert.match(next, /caldev-section/);
  assert.match(next, /caldev-wrap/);
  assert.doesNotMatch(next, /data-events/);
  assert.doesNotMatch(next, /Band Camp/);
  assert.equal(ensureCalendarMonthMount(next), next);
  const alreadyMounted = ensureCalendarMonthMount('<section class="page-hero" data-cms-layout="calendar"><div class="page-title"><h1>Calendar</h1></div></section><section class="content soft"><div class="wrap"><div id="caldev-app" class="caldev-app" aria-live="polite"></div></div></section>');
  assert.match(alreadyMounted, /class="content soft caldev-section"/);
  assert.match(alreadyMounted, /class="wrap caldev-wrap"/);
  assert.doesNotMatch(alreadyMounted, /page-hero[^>]*caldev-section/);
});

test('homepage calendar highlights fill from Schedule Board upcoming rows', () => {
  const html = '<section class="soft"><div class="wrap"><div class="timeline" data-events data-limit="3"><article class="event"><div class="datebox">Aug <span>01</span></div><div><h3>Band Camp / Preseason Prep</h3></div></article></div></div></section>';
  assert.equal(homeEventsLimitFromHtml(html), 3);
  const filled = applyHomeCalendarHighlights(html, [
    {
      id: 41,
      title: 'Home Game vs West Forsyth',
      description: 'Call time 6:00 p.m.',
      start_date: '2026-09-25',
      start_time: '19:00',
      track: 'game',
    },
  ]);
  assert.match(filled, /data-events data-limit="3"/);
  assert.match(filled, /Home Game vs West Forsyth/);
  assert.match(filled, /Sep/);
  assert.match(filled, />25</);
  assert.doesNotMatch(filled, /Band Camp \/ Preseason Prep/);
  const empty = applyHomeCalendarHighlights(html, []);
  assert.match(empty, /No upcoming events have been published yet/);
  assert.doesNotMatch(empty, /Band Camp \/ Preseason Prep/);
  const articles = renderCalendarHighlightArticles([
    { title: 'Booster Meeting', start_date: '2026-10-14', description: 'Cafeteria' },
  ]);
  assert.match(articles, /Booster Meeting/);
  assert.match(articles, /Oct/);
  assert.match(articles, />14</);

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const siteContent = readFileSync(join(root, 'site-content.js'), 'utf8');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const adminSrc = readFileSync(join(root, 'admin.js'), 'utf8');
  assert.match(siteContent, /\/api\/caldev\/events\?upcoming=1&limit=/);
  assert.match(siteContent, /function highlightEventFromCaldev/);
  assert.match(workerSrc, /url\.searchParams\.get\('upcoming'\) === '1'/);
  assert.match(workerSrc, /listUpcomingCaldevEvents/);
  assert.doesNotMatch(workerSrc, /seedCaldevFromProduction[\s\S]{0,200}upcoming/);
  assert.match(adminSrc, /Managed in Schedule Board/);
});

test('sortPhotosByRecent orders by created_at then id', () => {
  const sorted = sortPhotosByRecent([
    { id: 1, created_at: '2026-08-01T10:00:00.000Z' },
    { id: 3, created_at: '2026-08-07T10:00:00.000Z' },
    { id: 2, created_at: '2026-08-07T10:00:00.000Z' },
  ]);
  assert.deepEqual(sorted.map((item) => item.id), [3, 2, 1]);
});

test('ensureHomePhotoGallerySlot limits home gallery and adds full gallery link', () => {
  const html = '<section><div class="wrap"><div class="gallery" data-photo-gallery><figure class="gallery-item"></figure></div></div></section>';
  const next = ensureHomePhotoGallerySlot(html);
  assert.match(next, /data-limit="6"/);
  assert.match(next, /data-sort="recent"/);
  assert.match(next, /View full gallery/);
  assert.match(next, /href="\/gallery\.html"/);
});

test('ensureGalleryPageSlot clears placeholder images from the gallery mount', () => {
  const html = '<section class="page-hero" data-cms-layout="gallery"></section><section class="content soft photo-gallery-section"><div class="wrap"><div class="photo-gallery" data-photo-gallery data-sort="recent"><figure class="gallery-item"><img src="assets/efhs-photo-1.png" alt="x"></figure></div></div></section>';
  const next = ensureGalleryPageSlot(html);
  assert.match(next, /data-photo-gallery/);
  assert.doesNotMatch(next, /efhs-photo-1\.png/);
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

test('ensureBoostersDuesSlot injects Pay dues button without removing meetings or members hooks', () => {
  const liveStyle = `<section class="page-hero" data-cms-layout="boosters"><div class="page-title"><h1>Band Boosters</h1></div></section><section class="content"><div class="wrap"><div class="card" data-cms-field="body_text"><p>Booster info</p></div><article class="card"><span class="tag">Meetings</span><h3>Booster Meetings</h3><p class="booster-meetings-intro">Upcoming booster meetings are listed below.</p><div class="timeline booster-meetings" data-booster-meetings></div></article></div></section><section class="content soft"><div class="wrap"><div class="directory" data-booster-members></div></div></section>`;
  const html = ensureBoostersDuesSlot(liveStyle);
  assert.match(html, /data-dues-open/);
  assert.match(html, /data-boosters-dues/);
  assert.match(html, />Pay dues</);
  assert.match(html, /Booster info/);
  assert.match(html, /data-booster-meetings/);
  assert.match(html, /data-booster-members/);
  assert.equal(ensureBoostersDuesSlot(html), html);
  assert.match(renderBoostersDuesCard(), /data-dues-open/);
  const structured = generateStructuredPageHtml({
    layout: 'boosters',
    kicker: 'Families',
    heading: 'Band Boosters',
    intro: 'Volunteer and support students.',
    body_text: '<p>Booster body</p>',
  });
  assert.match(structured, /data-dues-open/);
  assert.match(structured, /data-booster-meetings/);
  assert.match(structured, /data-booster-members/);
});

test('boosters dues site setting can hide or restore the Pay dues card', () => {
  assert.equal(isBoostersDuesEnabled({}), true);
  assert.equal(isBoostersDuesEnabled({ boosters_dues_enabled: '1' }), true);
  assert.equal(isBoostersDuesEnabled({ boosters_dues_enabled: 1 }), true);
  assert.equal(isBoostersDuesEnabled({ boosters_dues_enabled: '0' }), false);
  assert.equal(isBoostersDuesEnabled({ boosters_dues_enabled: 0 }), false);

  const withDues = ensureBoostersDuesSlot('<div class="card" data-cms-field="body_text"><p>Info</p></div><article class="card"><span class="tag">Meetings</span></article>');
  assert.match(withDues, /data-boosters-dues/);
  const hidden = applyBoostersDuesVisibility(withDues, false);
  assert.doesNotMatch(hidden, /data-boosters-dues/);
  assert.doesNotMatch(hidden, /data-dues-open/);
  assert.match(hidden, /data-cms-field="body_text"/);
  assert.match(hidden, /Meetings/);
  assert.equal(stripBoostersDuesSlot(withDues), hidden);
  const restored = applyBoostersDuesVisibility(hidden, true);
  assert.match(restored, /data-boosters-dues/);
  assert.match(restored, /data-dues-open/);
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


test('refreshHomeHeroBrandMark leaves Band information card images as saved', () => {
  const html = '<aside class="hero-card"><img src="/assets/efhs-logo.png" alt="East Forsyth logo"><h2>Band information in one place</h2></aside>';
  assert.equal(refreshHomeHeroBrandMark(html), html);
  const custom = '<aside class="hero-card"><img src="/uploads/custom-card.png" alt="Custom"><h2>Band information in one place</h2></aside>';
  assert.equal(refreshHomeHeroBrandMark(custom), custom);
  const workerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /ensureHomePhotoGallerySlot\(restoreHomeHeroCardUploadSrc\(page\.body_html\)\)/);
  assert.doesNotMatch(workerSrc, /ensureHomePhotoGallerySlot\(refreshHomeHeroBrandMark/);
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
  assert.equal(shouldRedirectToMaintenance('/ensembles', on), true);
  assert.equal(shouldRedirectToMaintenance('/ensembles.html', on), true);
  assert.equal(shouldRedirectToMaintenance('/directors', on), true);
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
  assert.equal(sanitizeMaintenanceReturnPath('/ensembles'), '/ensembles.html');
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
  assert.match(html, /data-sponsor-choice-open/);
  assert.match(html, /Sponsor\/In-Kind/);
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

test('Square settings parse from CMS JSON and fall back when env secrets are missing', async () => {
  const parsed = parseSquareSettings(JSON.stringify({
    access_token: 'Bearer "sq0atp-test-token"',
    application_id: 'sq0idp-app',
    location_id: 'LTEST',
    environment: 'sandbox',
  }));
  assert.equal(parsed.access_token, 'sq0atp-test-token');
  assert.equal(parsed.application_id, 'sq0idp-app');
  assert.equal(parsed.location_id, 'LTEST');
  assert.equal(parsed.environment, 'sandbox');
  assert.equal(parseSquareSettings('not-json').access_token, '');

  const prefersEnv = await resolveSquareRuntimeEnv({
    SQUARE_ACCESS_TOKEN: 'env-token',
    SQUARE_APPLICATION_ID: 'env-app',
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async first() {
            return { value: JSON.stringify({ access_token: 'db-token', application_id: 'db-app', location_id: 'LDB' }) };
          },
        };
      },
    },
  });
  assert.equal(prefersEnv.source, 'env');
  assert.equal(prefersEnv.env.SQUARE_ACCESS_TOKEN, 'env-token');
  assert.equal(prefersEnv.env.SQUARE_APPLICATION_ID, 'env-app');
  assert.equal(prefersEnv.env.SQUARE_LOCATION_ID, 'LDB');

  const rows = {
    [SQUARE_SETTINGS_KEY]: JSON.stringify({
      square_access_token: 'db-token-value',
      square_application_id: 'sq0idp-db',
      square_location_id: 'LDB',
      environment: 'production',
    }),
  };
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          if (String(sql).includes('SELECT value FROM site_content')) {
            const key = this.args[0];
            return Object.prototype.hasOwnProperty.call(rows, key) ? { value: rows[key] } : null;
          }
          return null;
        },
      };
    },
  };
  const fromDb = await resolveSquareRuntimeEnv({ DB: db });
  assert.equal(fromDb.source, 'database');
  assert.equal(fromDb.configured, true);
  assert.equal(fromDb.env.SQUARE_ACCESS_TOKEN, 'db-token-value');
  assert.equal(fromDb.env.SQUARE_APPLICATION_ID, 'sq0idp-db');
  assert.equal(fromDb.env.SQUARE_LOCATION_ID, 'LDB');
  assert.equal(fromDb.has_database_settings, true);

  const missing = await resolveSquareRuntimeEnv({});
  assert.equal(missing.configured, false);
  assert.equal(missing.source, '');
});

test('syncSquareSettingsFromEnv copies Pages/Worker secrets into CMS square_settings', async () => {
  const rows = {};
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          if (String(sql).includes('SELECT value FROM site_content')) {
            const key = this.args[0];
            return Object.prototype.hasOwnProperty.call(rows, key) ? { value: rows[key] } : null;
          }
          return null;
        },
        async run() {
          if (String(sql).includes('INSERT INTO site_content')) {
            rows[this.args[0]] = this.args[1];
          }
          return { success: true };
        },
      };
    },
  };
  const wrote = await syncSquareSettingsFromEnv({
    DB: db,
    SQUARE_ACCESS_TOKEN: 'sq0atp-synced-token-value',
    SQUARE_APPLICATION_ID: 'sq0idp-synced',
    SQUARE_LOCATION_ID: 'L3KX1HPXZTVD2',
    SQUARE_ENVIRONMENT: 'production',
  });
  assert.equal(wrote, true);
  const stored = parseSquareSettings(rows[SQUARE_SETTINGS_KEY]);
  assert.equal(stored.access_token, 'sq0atp-synced-token-value');
  assert.equal(stored.application_id, 'sq0idp-synced');
  assert.equal(stored.location_id, 'L3KX1HPXZTVD2');

  const fromDb = await resolveSquareRuntimeEnv({ DB: db });
  assert.equal(fromDb.source, 'database');
  assert.equal(fromDb.configured, true);
  assert.equal(fromDb.env.SQUARE_ACCESS_TOKEN, 'sq0atp-synced-token-value');
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
  assert.match(structured, /data-sponsor-choice-open/);
  assert.match(structured, /Sponsor\/In-Kind/);
});

test('rewriteSponsorChoiceButtons turns Become a sponsor CTAs into the choice control', () => {
  const html = rewriteSponsorChoiceButtons('<a class="btn primary" href="/become-a-sponsor.html">Become a sponsor</a><a href="/become-a-sponsor.html">Become a Sponsor</a>');
  assert.match(html, /<button type="button" class="btn primary" data-sponsor-choice-open>Sponsor\/In-Kind<\/button>/);
  assert.match(html, /data-sponsor-choice-open>Sponsor\/In-Kind<\/a>/);
  assert.doesNotMatch(html, />Become a sponsor</);
});

test('in-kind form payload, page, and PDF use Value of In-kind donation', () => {
  const missing = normalizeInKindPayload({});
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => /Value of In-kind donation/i.test(error)));
  const ok = normalizeInKindPayload({
    business_name: 'Acme Supply',
    first_name: 'Pat',
    last_name: 'Lee',
    email: 'pat@example.com',
    phone: '336-555-0100',
    address1: '100 Main St',
    city: 'Kernersville',
    state: 'NC',
    zip: '27284',
    value: '$250',
    items: 'Water cases for band camp',
  });
  assert.equal(ok.ok, true);
  const form = renderInKindFormHtml();
  assert.match(form, /Value of In-kind donation/);
  assert.match(form, /data-inkind-form/);
  assert.doesNotMatch(form, /Amount of sponsorship/i);
  const page = renderInKindPageBody({ title: 'In-Kind Donation' });
  assert.match(page, /data-cms-layout="in-kind"/);
  const pdf = buildInKindPdfBase64(ok.data);
  const bytes = Buffer.from(pdf, 'base64');
  assert.ok(bytes.toString('latin1').includes('East Forsyth Band'));
  assert.ok(bytes.toString('latin1').includes('Value of In-kind donation') || bytes.includes(Buffer.from('Value of In-kind donation')));
});

test('in-kind form submissions map company and donated items onto the ledger', () => {
  const entry = buildInKindLedgerEntry({
    business_name: 'Acme Supply',
    first_name: 'Pat',
    last_name: 'Lee',
    email: 'pat@example.com',
    phone: '336-555-0100',
    address1: '100 Main St',
    city: 'Kernersville',
    state: 'NC',
    zip: '27284',
    value: '$250',
    items: 'Water cases for band camp',
  }, { id: 17, paidAt: '2026-09-01T14:00:00.000Z' });
  assert.equal(entry.kind, 'sponsor');
  assert.equal(entry.refType, 'inkind_form');
  assert.equal(entry.refId, 17);
  assert.equal(entry.name, 'Acme Supply');
  assert.equal(entry.address, '100 Main St, Kernersville, NC 27284');
  assert.equal(entry.amountCents, 25000);
  assert.equal(entry.amountDisplay, '$250');
  assert.equal(entry.packageLabel, 'Water cases for band camp');
  assert.match(entry.note, /Pat Lee/);
  assert.equal(entry.moneyExchanged, false);
  const summary = summarizeLedgerEntries([{
    kind: entry.kind,
    amount_cents: entry.amountCents,
    money_exchanged: entry.moneyExchanged,
  }]);
  assert.equal(summary.in_kind_cents, 25000);
  assert.equal(summary.cash_cents, 0);
  assert.equal(summary.sponsors_cents, 25000);
  const workerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /recordInKindFormLedger/);
  assert.match(workerSrc, /\/api\/inkind/);
});

test('forms page access is Super Admin, President, Forms role, or selected users', () => {
  assert.equal(canAccessFormsPage({ id: 1, role: 'admin' }, []), true);
  assert.equal(canAccessFormsPage({ id: 2, role: 'editor', permissions: ['president'] }, []), true);
  assert.equal(canAccessFormsPage({ id: 3, role: 'editor', permissions: ['forms'] }, []), true);
  assert.equal(canAccessFormsPage({ id: 4, role: 'editor' }, [4, 9]), true);
  assert.equal(canAccessFormsPage({ id: 5, role: 'editor' }, [4, 9]), false);
  assert.equal(canAccessFormsPage(null, [1]), false);
});

test('form builder title becomes a public page slug and hides from nav', () => {
  assert.equal(slugFromFormTitle('Band Trip Form'), 'band-trip-form');
  assert.equal(slugFromFormTitle('  Jackets & Patches  '), 'jackets-and-patches');
  assert.equal(isReservedFormSlug('contact'), true);
  assert.equal(isReservedFormSlug('band-trip-form'), false);
  const extra = createFormField('text');
  extra.label = 'Allergies';
  extra.required = true;
  const definition = normalizeFormDefinition({
    title: 'Band Trip Form',
    intro: 'Please complete this form.',
    fields: [
      { type: 'heading', label: 'Student' },
      { id: 'student_name', type: 'text', label: 'Student name', required: true },
      extra,
      { type: 'dropdown', label: 'Bus', options: ['Bus 1', 'Bus 2'] },
    ],
  });
  assert.equal(definition.title, 'Band Trip Form');
  const page = renderCmsFormPageBody({ title: 'Band Trip Form', slug: 'band-trip-form' }, definition, 'band-trip-form');
  assert.match(page, /data-cms-form="band-trip-form"/);
  assert.match(page, /Student name/);
  assert.match(page, /Allergies/);
  assert.equal(isCmsFormPage({ body_html: page }), true);
  const missing = normalizeFormPayload({ student_name: 'Jordan' }, definition);
  assert.equal(missing.ok, false);
  const busField = definition.fields.find((field) => field.label === 'Bus');
  const okNamed = normalizeFormPayload({ student_name: 'Jordan', [extra.id]: 'None', [busField.id]: 'Bus 1' }, definition);
  assert.equal(okNamed.ok, true);
  const empty = emptyFormDefinition('Spirit Wear');
  assert.match(renderCmsFormPageBody({ title: empty.title }, empty, 'spirit-wear'), /data-cms-form="spirit-wear"/);
  const nav = renderNav([
    { slug: 'home', path: '/', title: 'Home' },
    { slug: 'band-trip-form', path: '/band-trip-form.html', title: 'Band Trip Form', body_html: page },
    { slug: 'contact', path: '/contact.html', title: 'Contact' },
  ]);
  assert.match(nav, />Home</);
  assert.match(nav, />Contact</);
  assert.doesNotMatch(nav, /Band Trip Form/);
  const workerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /from '\.\/form-builder\.mjs'/);
  assert.match(workerSrc, /CREATE TABLE IF NOT EXISTS cms_forms/);
  assert.match(workerSrc, /id=["']forms-builder-view["']/);
  assert.match(workerSrc, /value="forms"/);
});

test('letterman jacket form matches the paper order and builds a PDF', () => {
  const missing = normalizeLettermanPayload({});
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => /Student name/i.test(error)));
  const ok = normalizeLettermanPayload({
    student_name: 'Jordan Smith',
    grade: '11',
    parent_name: 'Alex Smith',
    phone: '336-555-0142',
    email: 'alex@example.com',
    order_date: '2026-09-01',
    embroidered_name: 'Jordan',
    second_embroidery: 'Trumpet 2027',
    jacket_size: 'L',
    payment_method: 'Check',
    amount_enclosed: '$52.00',
    parent_signature: 'Alex Smith',
    parent_sign_date: '2026-09-01',
    student_signature: 'Jordan Smith',
    student_sign_date: '2026-09-01',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.jacket_size, 'L');
  const copy = normalizeLettermanFormCopy({ deadline: 'September 5th, 2026', pricing_s_xl: '$52.00' });
  assert.equal(copy.fields.find((field) => field.id === 'deadline')?.text, 'Deadline: September 5th, 2026');
  assert.equal(copy.heading, DEFAULT_LETTERMAN_FORM.heading);
  const page = renderLettermanPageBody({ title: 'Letterman Jacket Order Form' }, copy);
  assert.match(page, /data-letterman-form/);
  assert.match(page, /Name to be embroidered/);
  assert.match(page, /\$52\.00/);
  assert.match(page, /drop box in the band room/);
  assert.doesNotMatch(page, /Kuropas|Mrs\. Murphy/);
  const paymentAt = page.indexOf('>Payment<');
  const depositAt = page.indexOf('drop box in the band room');
  const methodAt = page.indexOf('Payment method');
  assert.ok(paymentAt >= 0 && depositAt > paymentAt && methodAt > depositAt);
  const pdf = buildLettermanPdfBase64(ok.data, { copy });
  const bytes = Buffer.from(pdf, 'base64').toString('latin1');
  assert.match(bytes, /Letterman Jacket Order Form|East Forsyth Band/);
});

test('letterman form drops the old contact line and keeps the band-room deposit note', () => {
  const migrated = normalizeLettermanFormCopy({
    fields: [
      { id: 'payment_section', type: 'heading', label: 'Payment' },
      { id: 'payment_method', type: 'choice', label: 'Payment method', options: ['Cash', 'Check'] },
      { id: 'questions', type: 'note', text: 'Please speak to a Band Booster Board Member, Mr. Kuropas or Mrs. Murphy.' },
    ],
  });
  assert.equal(migrated.fields.some((field) => field.id === 'questions'), false);
  assert.equal(migrated.fields[0].id, 'payment_section');
  assert.equal(migrated.fields[1].id, 'payment_deposit');
  assert.match(migrated.fields[1].text, /drop box in the band room/);
});

test('letterman form editor can add, remove, retitle, and reorder fields', () => {
  const extra = createLettermanField({ type: 'text', label: 'Allergies', required: true });
  const custom = normalizeLettermanFormCopy({
    title: 'Jacket Order',
    fields: [
      { id: 'student_name', type: 'text', label: 'Student', required: true },
      extra,
      { id: 'grade', type: 'text', label: 'Grade level', required: true },
      { id: 'note_one', type: 'note', text: 'Bring payment to boosters.' },
    ],
  });
  assert.equal(custom.title, 'Jacket Order');
  assert.deepEqual(custom.fields.map((field) => field.id), ['student_name', extra.id, 'grade', 'note_one']);
  assert.equal(custom.fields[1].label, 'Allergies');
  const page = renderLettermanPageBody({}, custom);
  assert.match(page, /Allergies/);
  assert.match(page, /Grade level/);
  assert.match(page, /Bring payment to boosters/);
  assert.ok(page.indexOf('Allergies') < page.indexOf('Grade level'));
  const missing = normalizeLettermanPayload({ student_name: 'Jordan' }, custom);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => /Allergies/i.test(error)));
  const withoutGrade = normalizeLettermanFormCopy({
    fields: custom.fields.filter((field) => field.id !== 'grade'),
  });
  assert.equal(withoutGrade.fields.some((field) => field.id === 'grade'), false);
  const ok = normalizeLettermanPayload({ student_name: 'Jordan', [extra.id]: 'None' }, withoutGrade);
  assert.equal(ok.ok, true);
  assert.equal(ok.data[extra.id], 'None');
  assert.equal(Object.hasOwn(ok.data, 'grade'), false);
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
    recipient_user_ids: ['8', 8, 0, 'x', 11],
    sort_order: '3',
    active: true,
  });
  assert.equal(topic.label, 'Sponsor inquiry');
  assert.equal(topic.email, 'boosters@example.com');
  assert.deepEqual(topic.recipient_user_ids, [8, 11]);
  assert.equal(topic.sort_order, 0);
  assert.equal(isValidEmail(topic.email), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.deepEqual(parseRecipientUserIds('[11,8,8]'), [11, 8]);
  assert.equal(contactTopicHasRecipients({ recipient_user_ids: [8] }), true);
  assert.equal(contactTopicHasRecipients({ email: 'jamie@efhsband.org' }), true);
  assert.equal(contactTopicHasRecipients({ email: '', recipient_user_ids: [] }), false);
  const serialized = serializeContactTopic(
    { id: 2, label: 'Sponsor inquiry', email: 'jamie@efhsband.org', recipient_user_ids: '[8,11]', sort_order: 0, active: 1 },
    {
      emails: ['jamie@efhsband.org', 'trevor@efhsband.org'],
      recipient_user_ids: [8, 11],
      recipients: [
        { id: 8, display_name: 'Jamie Olsen', username: 'jamie@efhsband.org', email: 'jamie@efhsband.org' },
        { id: 11, display_name: 'Trevor Olsen', username: 'trevor@efhsband.org', email: 'trevor@efhsband.org' },
      ],
    },
  );
  assert.equal(serialized.email, 'jamie@efhsband.org, trevor@efhsband.org');
  assert.equal(serialized.recipients.length, 2);
  assert.equal(formatContactRecipientLabel(serialized.recipients[0]), 'Jamie Olsen <jamie@efhsband.org>');
  const html = renderContactForm([
    { id: 3, label: 'Band camp' },
    { id: 9, label: 'General question' },
    { id: 4, label: 'Volunteer interest' },
  ]);
  assert.match(html, /data-contact-form/);
  assert.match(html, /value="9" selected/);
  assert.match(html, /General question/);
  assert.doesNotMatch(html, /value="3" selected/);
  assert.equal(isDefaultContactTopicLabel('General Questions'), true);
  assert.equal(defaultContactTopicId([{ id: 4, label: 'Volunteer interest' }, { id: 11, label: 'General Questions' }]), 11);
  assert.equal(serializeContactTopic({ id: 7, label: 'Fundrasing', email: 'jamie@efhsband.org' }).label, 'Fundraising');
});

test('CMS View Site stays in the same window and Schedule Board uses What', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const adminCaldev = readFileSync(join(root, 'admin-caldev.js'), 'utf8');
  const siteContent = readFileSync(join(root, 'site-content.js'), 'utf8');
  assert.match(workerSrc, /<a class="btn primary" href="\/">View Site<\/a>/);
  assert.doesNotMatch(workerSrc, /href="\/" target="_blank" rel="noreferrer">View Site/);
  assert.match(workerSrc, /Events with What set to <b>Meetings<\/b>/);
  assert.match(adminCaldev, /<label>What/);
  assert.doesNotMatch(adminCaldev, /<label>Who/);
  assert.match(adminCaldev, /What → Meetings/);
  assert.match(adminCaldev, /data-cms-caldev-desc-link/);
  assert.match(adminCaldev, /data-cms-caldev-link-text/);
  assert.match(adminCaldev, /function applyDescLink/);
  assert.match(adminCaldev, /Click Here/);
  assert.match(adminCaldev, /data-cms-caldev-deadline-banners/);
  assert.match(adminCaldev, /function renderDeadlineBanners/);
  assert.match(siteContent, /isDefaultContactTopicLabel/);
  assert.match(siteContent, /selectedId/);
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

test('renderSponsorMarqueeSection applies tier color classes', () => {
  const html = renderSponsorMarqueeSection([
    { name: 'Gold Co', level: 'Gold Sponsor', active: 1 },
    { name: 'Silver Co', tier: 'silver', active: 1 },
    { name: 'Bronze Co', level: 'Bronze Sponsor', active: 1 },
  ]);
  assert.match(html, /class="sponsor-marquee-item tier-gold"[^>]*data-sponsor-tier="gold"/);
  assert.match(html, /class="sponsor-marquee-item tier-silver"[^>]*data-sponsor-tier="silver"/);
  assert.match(html, /class="sponsor-marquee-item tier-bronze"[^>]*data-sponsor-tier="bronze"/);
});

test('sponsor marquee stays on named public pages and off generic CMS pages', () => {
  assert.equal(publicPageShowsSponsorMarquee({ slug: 'home', is_home: 1 }), true);
  assert.equal(publicPageShowsSponsorMarquee({ slug: 'calendar' }), true);
  assert.equal(publicPageShowsSponsorMarquee({ slug: 'fundraising' }), true);
  assert.equal(publicPageShowsSponsorMarquee({ slug: 'sponsors' }), true);
  assert.equal(publicPageShowsSponsorMarquee({ slug: 'coming-soon' }), true);
  assert.equal(publicPageShowsSponsorMarquee({ slug: 'join' }), true);
  assert.equal(publicPageShowsSponsorMarquee({ slug: 'volunteer' }), true);
  for (const slug of ['gallery', 'contact', 'boosters', 'resources', 'become-a-sponsor', 'directors', 'ensembles', 'in-kind', 'letterman-jacket', 'custom-page']) {
    assert.equal(publicPageShowsSponsorMarquee({ slug }), false, slug);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const siteContent = readFileSync(join(root, 'site-content.js'), 'utf8');
  assert.match(workerSrc, /publicPageShowsSponsorMarquee\(page\)/);
  assert.match(workerSrc, /showSponsorMarquee: true/);
  assert.match(workerSrc, /slug: 'not-found'/);
  assert.match(workerSrc, /loadPublicChromeReads/);
  assert.match(workerSrc, /data-sponsor-marquee="\$\{marqueeFlag\}"/);
  assert.match(siteContent, /function sponsorMarqueeEnabled\(/);
  assert.match(siteContent, /dataset\?\.sponsorMarquee/);
  assert.match(siteContent, /function querySponsorMarqueeSlots\(/);
  assert.match(siteContent, /\[data-sponsor-marquee\]:not\(html\):not\(body\)/);
  assert.match(siteContent, /function canPlaceInSiteChrome\(/);
  assert.doesNotMatch(siteContent, /querySelector(?:All)?\('\[data-sponsor-marquee\]'\)/);
  const maintenanceStart = workerSrc.indexOf('function renderMaintenancePage');
  const maintenanceEnd = workerSrc.indexOf('function isPublicDocumentRequest');
  assert.ok(maintenanceStart > 0 && maintenanceEnd > maintenanceStart);
  assert.doesNotMatch(workerSrc.slice(maintenanceStart, maintenanceEnd), /data-sponsor-marquee/);
  const adminStart = workerSrc.indexOf('const ADMIN_HTML');
  assert.ok(adminStart > 0);
  assert.doesNotMatch(workerSrc.slice(adminStart), /data-sponsor-marquee|sponsor-marquee-section/);
});

test('page-hidden bronze sponsors stay on the marquee but leave the directory', () => {
  const hiddenBronze = { name: "Domino's Pizza", level: 'Bronze Sponsor', active: 0, logo_url: '/uploads/dominos.png' };
  const listedGold = { name: 'Kernersville Shop', level: 'Gold Sponsor', active: 1 };
  assert.equal(sponsorShowsOnPage(hiddenBronze), false);
  assert.equal(sponsorShowsMarquee(hiddenBronze), true);
  assert.equal(sponsorShowsOnPage(listedGold), true);
  const marquee = renderSponsorMarqueeSection([hiddenBronze, listedGold]);
  assert.match(marquee, /Domino/);
  assert.match(marquee, /Kernersville Shop/);
  const directory = renderSponsorsDirectory([hiddenBronze, listedGold]);
  assert.doesNotMatch(directory, /Domino/);
  assert.match(directory, /Kernersville Shop/);
  const emptyDirectory = renderSponsorsDirectory([hiddenBronze]);
  assert.match(emptyDirectory, /sponsor-empty/);
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

test('Honorable Mention is CMS-only and keeps paid public packages unchanged', () => {
  assert.equal(normalizeSponsorTier('Honorable Mention'), 'honorable');
  assert.equal(normalizeSponsorTier('honorable-mention'), 'honorable');
  assert.equal(normalizeSponsorLevel('Honorable Mention'), 'Honorable Mention');
  assert.equal(normalizeSponsorLevel('navy partner'), 'Bronze Sponsor');
  assert.equal(normalizeSponsorLevel('Community Sponsor', { homepageAd: 1 }), 'Silver Sponsor');
  assert.equal(normalizeSponsorTierKey('Honorable Mention'), '');
  assert.equal(normalizeSponsorTierKey('honorable'), '');
  assert.equal(isPublicPurchasableSponsorTier('honorable'), false);
  assert.equal(isPublicPurchasableSponsorTier('gold'), true);

  const honorable = normalizeSponsorPayload({
    name: 'Thank You Shop',
    level: 'Honorable Mention',
    homepage_ad: 1,
  });
  assert.equal(honorable.level, 'Honorable Mention');
  assert.equal(honorable.homepage_ad, 0);
  const benefits = sponsorBenefitsFromLevel('Honorable Mention');
  assert.equal(benefits.tier, 'honorable');
  assert.equal(benefits.tier_label, 'Honorable Mention');
  assert.equal(benefits.show_marquee, true);
  assert.equal(benefits.show_flyin, false);
  assert.equal(benefits.show_game_announcement, false);

  const preserved = normalizeSponsorPayload({ name: 'Thank You Shop' }, { level: 'Honorable Mention', city: 'Kernersville' });
  assert.equal(preserved.level, 'Honorable Mention');
  const paidAgain = normalizeSponsorPayload({
    name: 'Thank You Shop',
    level: 'Silver Sponsor',
  }, { level: 'Honorable Mention' });
  assert.equal(paidAgain.level, 'Silver Sponsor');
  assert.equal(paidAgain.homepage_ad, 1);

  const hydrated = hydrateSponsor({ name: 'Thank You Shop', level: 'Honorable Mention', homepage_ad: 1, city: 'Kernersville', state: 'NC' });
  assert.equal(hydrated.tier, 'honorable');
  assert.equal(hydrated.tier_label, 'Honorable Mention');
  assert.equal(hydrated.homepage_ad, 0);

  const marquee = renderSponsorMarqueeSection([
    { name: 'Mention Co', level: 'Honorable Mention', active: 1 },
    { name: 'Gold Co', level: 'Gold Sponsor', active: 1 },
    { name: 'Bronze Co', level: 'Bronze Sponsor', active: 1 },
  ]);
  const goldAt = marquee.indexOf('Gold Co');
  const mentionAt = marquee.indexOf('Mention Co');
  assert.ok(goldAt > -1 && mentionAt > goldAt);
  assert.match(marquee, /class="sponsor-marquee-item tier-honorable"[^>]*data-sponsor-tier="honorable"/);
  assert.match(marquee, /class="sponsor-marquee-item tier-gold"[^>]*data-sponsor-tier="gold"/);

  const directory = renderSponsorsDirectory([
    { name: 'Mention Co', level: 'Honorable Mention', active: 1 },
    { name: 'Gold Co', level: 'Gold Sponsor', active: 1 },
  ]);
  assert.match(directory, /sponsor-tier-badge tier-honorable/);
  assert.match(directory, /Honorable Mention/);
  assert.ok(directory.indexOf('Gold Co') < directory.indexOf('Mention Co'));

  const publicTiers = renderSponsorTiersHtml();
  assert.doesNotMatch(publicTiers, /Honorable Mention/i);
  assert.doesNotMatch(publicTiers, /data-tier="honorable"/);

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
  const siteContent = readFileSync(join(root, 'site-content.js'), 'utf8');
  const becomeHtml = readFileSync(join(root, 'become-a-sponsor.html'), 'utf8');
  const adminStart = workerSrc.indexOf('const ADMIN_HTML');
  assert.ok(adminStart > 0);
  const adminHtml = workerSrc.slice(adminStart);
  assert.match(adminHtml, /<option value="Honorable Mention">Honorable Mention<\/option>/);
  assert.doesNotMatch(adminHtml, /name="honorable_mention"/);
  assert.doesNotMatch(adminHtml, /data-honorable-mention-field/);
  assert.doesNotMatch(adminJs, /name="honorable_mention"/);
  assert.match(siteContent, /honorable/);
  assert.match(siteContent, /efhs-sponsor-marquee-v4/);
  assert.doesNotMatch(becomeHtml, /Honorable Mention/i);
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

  const heroCard = sanitizeHomeBodyHtml(`
    <aside class="hero-card cms-edit-field cms-edit-rich cms-home-hero-card is-focused" contenteditable="true" aria-multiline="true" data-cms-home-field="hero-card" data-edit-label="Band information card">
      <img src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment" class="cms-body-photo cms-body-photo-block is-selected" style="width: 170px; height: auto;" data-photo-width="170">
      <h2>Band information in one place</h2>
      <ul>
        <li>Ensembles and program overview</li>
        <li></li>
        <li>Upcoming events and rehearsal notes</li>
      </ul>
    </aside>
  `);
  assert.match(heroCard, /<aside class="hero-card">/);
  assert.match(heroCard, /<ul>/);
  assert.match(heroCard, /Ensembles and program overview/);
  assert.match(heroCard, /Upcoming events and rehearsal notes/);
  assert.match(heroCard, /src="\/assets\/efhs-blue-regiment-mark\.png"/);
  assert.match(heroCard, /width: 170px/);
  assert.doesNotMatch(heroCard, /contenteditable|cms-edit-field|cms-home-hero-card|is-selected|data-cms-home-field|aria-multiline/);
  assert.doesNotMatch(heroCard, /<li>\s*<\/li>/);

  const replaced = sanitizeHomeBodyHtml(`
    <aside class="hero-card">
      <img src="/assets/efhs-blue-regiment-mark.png?v=old" alt="1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6">
      <img src="/uploads/1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6.jpg" alt="Custom photo">
      <h2>Band information</h2>
    </aside>
  `);
  assert.match(replaced, /\/uploads\/1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6\.jpg/);
  assert.doesNotMatch(replaced, /efhs-blue-regiment-mark/);

  const stuck = sanitizeHomeBodyHtml(`
    <aside class="hero-card"><img src="/assets/efhs-blue-regiment-mark.png?v=fundraising-cms-photos-20260823" alt="1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6" class="cms-body-photo cms-body-photo-block" style="width: 211px; height: auto;" data-photo-width="211"><br></aside>
  `);
  assert.match(stuck, /src="\/uploads\/1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6\.jpg"/);
  assert.doesNotMatch(stuck, /efhs-blue-regiment-mark/);
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

  assert.equal(canAccessScheduleBoard({ role: 'admin', permissions: [] }), true);
  assert.equal(canAccessScheduleBoard({ role: 'editor', permissions: ['president'] }), true);
  assert.equal(canAccessScheduleBoard({ role: 'editor', permissions: ['vice-president'] }), true);
  assert.equal(canAccessScheduleBoard({ role: 'editor', permissions: ['treasurer'] }), false);
  assert.equal(canAccessScheduleBoard({ role: 'editor', permissions: ['events'] }), true);

  assert.equal(canAccessBadgeCreator({ role: 'admin', permissions: [] }), true);
  assert.equal(canAccessBadgeCreator({ role: 'editor', permissions: ['president'] }), true);
  assert.equal(canAccessBadgeCreator({ role: 'editor', permissions: ['vice-president'] }), true);
  assert.equal(canAccessBadgeCreator({ role: 'editor', permissions: ['treasurer'] }), false);
  assert.equal(canAccessBadgeCreator({ role: 'editor', permissions: ['boosters'] }), false);

  assert.equal(canAccessTreasurerLedger({ role: 'admin' }), true);
  assert.equal(canAccessTreasurerLedger({ role: 'editor', permissions: ['treasurer'] }), true);
  assert.equal(canAccessTreasurerLedger({ role: 'editor', permissions: ['president'] }), true);
  // Vice President can access Checkout but not the Ledger.
  assert.equal(canAccessTreasurerLedger({ role: 'editor', permissions: ['vice-president'] }), false);
  assert.equal(canAccessTreasurerLedger({ role: 'editor', permissions: ['sponsors'] }), false);

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

test('resolveZernioApiKey prefers env then site_content fallback', async () => {
  assert.equal(ZERNIO_API_KEY_CONTENT_KEY, 'zernio_api_key');
  const fromEnv = await resolveZernioApiKey({ ZERNIO_API_KEY: ' env-key-123 ', DB: null });
  assert.deepEqual(fromEnv, { key: 'env-key-123', source: 'env' });

  const values = { zernio_api_key: ' db-key-456 ' };
  const env = {
    ZERNIO_API_KEY: '',
    DB: {
      prepare() {
        return {
          bind(key) {
            return {
              async first() {
                return values[key] == null ? null : { value: values[key] };
              },
            };
          },
        };
      },
    },
  };
  assert.deepEqual(await resolveZernioApiKey(env), { key: 'db-key-456', source: 'database' });

  values.zernio_api_key = '';
  assert.deepEqual(await resolveZernioApiKey(env), { key: '', source: 'none' });
});

test('normalizeZernioPostPayload builds Instagram gallery posts with required media', () => {
  const account = { accountId: 'ig_123', platform: 'instagram', username: 'efhsband' };
  assert.throws(
    () => normalizeZernioPostPayload({ content: 'Hello' }, account, 'instagram'),
    /Instagram posts require an image URL/,
  );
  assert.throws(
    () => normalizeZernioPostPayload({ content: 'Hello', media_url: 'https://efhsband.org/uploads/a.jpg' }, null, 'instagram'),
    /Connect Instagram before posting/,
  );
  const body = normalizeZernioPostPayload({
    content: 'New photo from East Forsyth Band',
    media_url: 'https://efhsband.org/uploads/a.jpg',
    publish_now: true,
  }, account, 'instagram');
  assert.deepEqual(body.platforms, [{ platform: 'instagram', accountId: 'ig_123' }]);
  assert.deepEqual(body.mediaItems, [{ type: 'image', url: 'https://efhsband.org/uploads/a.jpg' }]);
  assert.equal(body.publishNow, true);
});

test('gallery Instagram helpers pick captions and skip unsupported images', () => {
  assert.equal(galleryInstagramCaption({ caption: '<b>Halftime</b>', alt_text: 'Alt' }), 'Halftime');
  assert.equal(galleryInstagramCaption({ alt_text: 'Field show' }), 'Field show');
  assert.equal(galleryInstagramCaption({}), 'New photo from East Forsyth Band');
  assert.equal(isInstagramPublishableImage({ filename: 'a.jpg' }), true);
  assert.equal(isInstagramPublishableImage({ filename: 'logo.svg' }), false);
  assert.equal(isInstagramGalleryAutopostEnabled(''), true);
  assert.equal(isInstagramGalleryAutopostEnabled('0'), false);
  assert.equal(isInstagramGalleryAutopostEnabled('1'), true);
});


test('formatUserLastLoginDisplay formats Eastern timestamps and empty values', () => {
  assert.equal(formatUserLastLoginDisplay(''), 'Never logged in');
  assert.equal(formatUserLastLoginDisplay(null), 'Never logged in');
  const label = formatUserLastLoginDisplay('2026-08-16T18:05:00.000Z');
  assert.match(label, /^Last login /);
  assert.match(label, /ET$/);
  assert.match(label, /2026/);
});

test('letterman deadline banner is not rendered on public pages', () => {
  assert.equal(renderLettermanDeadlineBanner(), '');
});

test('calendar deadline banners mount under the public sponsor marquee', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const siteContent = readFileSync(join(root, 'site-content.js'), 'utf8');
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  const caldevSrc = readFileSync(join(root, 'caldev.js'), 'utf8');
  assert.match(workerSrc, /deadlineHtml/);
  assert.match(workerSrc, /renderSiteDeadlineBannersHtml/);
  assert.match(workerSrc, /\/api\/caldev\/deadline-banners/);
  assert.match(workerSrc, /listDeadlineCaldevEvents/);
  assert.match(siteContent, /function loadSiteDeadlineBanners/);
  assert.match(siteContent, /\/api\/caldev\/deadline-banners/);
  assert.match(siteContent, /ensureSiteDeadlineBannersMount/);
  assert.match(styles, /\.site-deadline-banners\{/);
  assert.match(caldevSrc, /function renderDeadlineBanners/);
  const marqueeAt = workerSrc.indexOf('${marqueeHtml}');
  const deadlineAt = workerSrc.indexOf('${deadlineHtml}');
  const mainAt = workerSrc.indexOf('<main id="main">');
  assert.ok(marqueeAt > 0 && deadlineAt > marqueeAt && mainAt > deadlineAt);
});

test('notify me nav control is rendered in public navigation', () => {
  assert.match(renderNotifyMeNavControl(), /nav-notify-bell/);
  assert.match(renderNotifyMeNavControl(), /data-notify-me/);
  assert.match(renderAddToHomeNavControl(), /data-add-home/);
  assert.match(renderAddToHomeNavControl(), /nav-add-home-mark/);
  const nav = renderNav([
    { slug: 'home', path: '/', title: 'Home' },
    { slug: 'become-a-sponsor', path: '/become-a-sponsor.html', title: 'Become a Sponsor' },
    { slug: 'in-kind', path: '/in-kind.html', title: 'In-Kind Donation' },
    { slug: 'letterman-jacket', path: '/letterman-jacket.html', title: 'Letterman Jacket Order Form' },
    { slug: 'contact', path: '/contact.html', title: 'Contact' },
  ]);
  assert.match(nav, />Home</);
  assert.match(nav, />Contact</);
  assert.doesNotMatch(nav, /Become a Sponsor/);
  assert.doesNotMatch(nav, /In-Kind Donation/);
  assert.doesNotMatch(nav, /Letterman Jacket/);
  assert.doesNotMatch(nav, /data-staff-auth-link/);
  assert.doesNotMatch(nav, />Login</);
  assert.doesNotMatch(nav, /Staff Menu/);
  assert.match(nav, /data-notify-me/);
  assert.match(nav, /Notify Me/);
  assert.match(nav, /data-add-home/);
  assert.ok(nav.indexOf('data-notify-me') < nav.indexOf('data-add-home'));
  const loggedInNav = renderNav([
    { slug: 'home', path: '/', title: 'Home' },
  ], { loggedIn: true });
  assert.doesNotMatch(loggedInNav, /Staff Menu/);
  assert.doesNotMatch(loggedInNav, /data-staff-auth-link/);
  const currentNav = renderNav([
    { slug: 'home', path: '/', title: 'Home' },
    { slug: 'contact', path: '/contact.html', title: 'Contact' },
  ], { currentPath: '/contact.html' });
  assert.match(currentNav, /href="\/contact\.html" aria-current="page"/);
  assert.doesNotMatch(currentNav, /href="\/" aria-current="page"/);
});

test('public nav groups Boosters, Fundraising, and Sponsors under Support the Band', () => {
  const pages = [
    { slug: 'home', path: '/', title: 'Home' },
    { slug: 'calendar', path: '/calendar.html', title: 'Calendar' },
    { slug: 'gallery', path: '/gallery.html', title: 'Gallery' },
    { slug: 'directors', path: '/directors.html', title: 'Directors & Staff' },
    { slug: 'sponsors', path: '/sponsors.html', title: 'Sponsors' },
    { slug: 'boosters', path: '/boosters.html', title: 'Boosters' },
    { slug: 'fundraising', path: '/fundraising.html', title: 'Fundraising' },
    { slug: 'contact', path: '/contact.html', title: 'Contact' },
    { slug: 'become-a-sponsor', path: '/become-a-sponsor.html', title: 'Become a Sponsor' },
  ];
  const nav = renderNav(pages);
  assert.match(nav, /data-nav-support/);
  assert.match(nav, /aria-controls="nav-support-menu"/);
  assert.match(nav, /aria-expanded="false"/);
  assert.match(nav, /aria-haspopup="true"/);
  assert.match(nav, />Support the Band </);
  assert.match(nav, /href="\/boosters\.html"/);
  assert.match(nav, /href="\/fundraising\.html"/);
  assert.match(nav, /href="\/sponsors\.html"/);
  assert.doesNotMatch(nav, /support-the-band\.html/);
  assert.doesNotMatch(nav, /role="menu"/);
  assert.equal((nav.match(/href="\/boosters\.html"/g) || []).length, 1);
  assert.equal((nav.match(/href="\/fundraising\.html"/g) || []).length, 1);
  assert.equal((nav.match(/href="\/sponsors\.html"/g) || []).length, 1);
  const homeAt = nav.indexOf('href="/"');
  const calendarAt = nav.indexOf('href="/calendar.html"');
  const galleryAt = nav.indexOf('href="/gallery.html"');
  const directorsAt = nav.indexOf('href="/directors.html"');
  const supportAt = nav.indexOf('data-nav-support');
  const boostersAt = nav.indexOf('href="/boosters.html"');
  const fundraisingAt = nav.indexOf('href="/fundraising.html"');
  const sponsorsAt = nav.indexOf('href="/sponsors.html"');
  const contactAt = nav.indexOf('href="/contact.html"');
  assert.ok(homeAt < calendarAt && calendarAt < galleryAt && galleryAt < directorsAt);
  assert.ok(directorsAt < supportAt && supportAt < contactAt);
  assert.ok(supportAt < boostersAt && boostersAt < fundraisingAt && fundraisingAt < sponsorsAt && sponsorsAt < contactAt);
  const currentNav = renderNav(pages, { currentPath: '/boosters.html' });
  assert.match(currentNav, /nav-support is-current/);
  assert.match(currentNav, /href="\/boosters\.html" aria-current="page"/);
  assert.doesNotMatch(currentNav, /href="\/fundraising\.html" aria-current="page"/);
  const missingSponsors = renderNav(pages.filter((page) => page.slug !== 'sponsors'));
  assert.match(missingSponsors, /href="\/boosters\.html"/);
  assert.match(missingSponsors, /href="\/fundraising\.html"/);
  assert.doesNotMatch(missingSponsors, /href="\/sponsors\.html"/);
  const emptySupport = renderNav(pages.filter((page) => !['boosters', 'fundraising', 'sponsors'].includes(page.slug)));
  assert.doesNotMatch(emptySupport, /data-nav-support/);
  assert.match(emptySupport, />Home</);
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const script = readFileSync(join(root, 'script.js'), 'utf8');
  const themeCss = readFileSync(join(root, 'public-theme.css'), 'utf8');
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  assert.match(script, /function bindSupportNav/);
  assert.match(script, /closeOpenSupportNav/);
  assert.match(script, /aria-expanded/);
  assert.match(themeCss, /\.nav-support-menu/);
  assert.match(themeCss, /\.nav-support-toggle/);
  assert.match(styles, /\.nav-support-menu/);
  assert.match(styles, /@media \(max-width:760px\)/);
});

test('public visual theme is CSS-only and uses CMS photograph URLs', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const themeCss = readFileSync(join(root, 'public-theme.css'), 'utf8');
  const syncSrc = readFileSync(join(root, 'worker/scripts/sync-public.mjs'), 'utf8');
  const siteContent = readFileSync(join(root, 'site-content.js'), 'utf8');
  const homeHeroBytes = readFileSync(join(root, 'assets/efhs-home-hero.jpg'));
  const headerBannerBytes = readFileSync(join(root, 'assets/efhs-header-banner.jpg'));
  assert.match(workerSrc, /href="\/public-theme\.css\?v=/);
  assert.match(workerSrc, /bodyClasses = \['efhs-theme'\]/);
  assert.match(workerSrc, /normalizePublicHtmlPath\(url\.pathname\)/);
  assert.match(workerSrc, /pageByPathStatement\(env, path\)/);
  assert.match(workerSrc, /FROM cms_pages WHERE path = \?`/);
  assert.match(workerSrc, /pageSlug === 'ensembles'/);
  assert.match(workerSrc, /HOME_HERO_PHOTO = '\/assets\/efhs-home-hero\.jpg\?v=hero-kids-frame-20260918'/);
  assert.match(syncSrc, /'public-theme\.css'/);
  assert.match(syncSrc, /cpSync\(join\(ROOT, 'assets'\), assetsDest/);
  assert.match(siteContent, /function applyPublicThemePhotos/);
  assert.match(siteContent, /\/assets\/efhs-home-hero\.jpg\?v=hero-kids-frame-20260918/);
  assert.match(themeCss, /body\.efhs-theme/);
  assert.match(themeCss, /#page-preview \.hero/);
  assert.match(themeCss, /--efhs-hero-photo:url\("\/assets\/efhs-home-hero\.jpg\?v=hero-kids-frame-20260918"\)/);
  assert.match(themeCss, /--efhs-header-banner:url\("\/assets\/header-banner-gen\.jpg\?v=home-redesign-20261002"\)/);
  assert.match(workerSrc, /ASSET_VERSION = 'cms-rc-20261004c'/);
  assert.match(themeCss, /background-size:100% 100%,100% 100%,100% 100%,100% 100%,100% 100%,100% 100%,125% auto/);
  assert.match(themeCss, /background-size:100% 100%,100% 100%,100% 100%,100% 100%,100% 100%,100% 100%,cover/);
  assert.match(themeCss, /background-position:center,center,center,center,center,center,46% 44%/);
  assert.match(themeCss, /background-position:center,center,center,center,center,center,50% 46%/);
  assert.doesNotMatch(themeCss, /50% auto/);
  assert.doesNotMatch(themeCss, /118%/);
  assert.doesNotMatch(themeCss, /72% auto/);
  assert.doesNotMatch(themeCss, /78% auto/);
  assert.match(themeCss, /mask-image:linear-gradient\(108deg/);
  assert.match(themeCss, /radial-gradient\(ellipse 36% 42% at 86% 6%/);
  assert.match(themeCss, /var\(--efhs-hero-photo, none\)/);
  assert.doesNotMatch(themeCss, /DISCIPLINE|CHARACTER|OPPORTUNITY|COMMUNITY|ONE BAND A BRIGHTER TOMORROW|MUSIC BUILDS MORE THAN MUSICIANS/);
  assert.match(themeCss, /prefers-reduced-motion/);
  assert.match(themeCss, /\.nav-support/);
  assert.doesNotMatch(themeCss, /Jason Reynolds|Allison Carter|Mattress Warehouse/);
  assert.equal(homeHeroBytes[0], 0xff);
  assert.equal(homeHeroBytes[1], 0xd8);
  assert.ok(homeHeroBytes.length > 50_000);
  assert.equal(headerBannerBytes[0], 0xff);
  assert.equal(headerBannerBytes[1], 0xd8);
  assert.ok(headerBannerBytes.length > 20_000);
  assert.ok(headerBannerBytes.length < 400_000);
  let heroWidth = 0;
  let heroHeight = 0;
  for (let i = 0; i < homeHeroBytes.length - 8; i++) {
    if (homeHeroBytes[i] === 0xff && (homeHeroBytes[i + 1] === 0xc0 || homeHeroBytes[i + 1] === 0xc1 || homeHeroBytes[i + 1] === 0xc2)) {
      heroHeight = homeHeroBytes.readUInt16BE(i + 5);
      heroWidth = homeHeroBytes.readUInt16BE(i + 7);
      break;
    }
  }
  assert.equal(heroWidth, 1468, 'Home Game Performance (4) should stay 1468px wide');
  assert.equal(heroHeight, 788, 'Home Game Performance (4) should stay 788px tall');
  const open = (themeCss.match(/\{/g) || []).length;
  const close = (themeCss.match(/\}/g) || []).length;
  assert.equal(open - close, 0, `public-theme.css brace delta should be 0, got ${open - close}`);
  assert.equal(safePublicThemePhotoUrl('/uploads/march.jpg'), '/uploads/march.jpg');
  assert.equal(safePublicThemePhotoUrl('/assets/efhs-home-hero.jpg?v=hero-kids-frame-20260918'), '/assets/efhs-home-hero.jpg?v=hero-kids-frame-20260918');
  assert.equal(safePublicThemePhotoUrl('https://evil.example/x.jpg'), '');
  assert.equal(safePublicThemePhotoUrl('javascript:alert(1)'), '');
  const vars = pickPublicThemePhotoVars([
    { url: '/uploads/march.jpg', caption: 'March on!' },
    { url: 'https://evil.example/x.jpg', caption: 'Away game' },
    { url: '/uploads/game.jpg', alt_text: 'Away game at Glenn' },
  ], { slug: 'home' });
  assert.equal(HOME_HERO_PHOTO, '/assets/efhs-home-hero.jpg?v=hero-kids-frame-20260918');
  assert.equal(vars.hero, HOME_HERO_PHOTO);
  assert.notEqual(vars.hero, '/uploads/march.jpg');
  const css = renderPublicThemePhotoStyle(vars);
  assert.match(css, /url\("\/assets\/efhs-home-hero\.jpg\?v=hero-kids-frame-20260918"\)/);
  assert.match(css, /url\("\/uploads\/march\.jpg"\)/);
  assert.doesNotMatch(css, /evil\.example/);
  const calendarVars = pickPublicThemePhotoVars([
    { url: '/uploads/march.jpg', caption: 'March on!' },
    { url: '/uploads/game.jpg', alt_text: 'Away game at Glenn' },
  ], { slug: 'calendar' });
  assert.equal(calendarVars.hero, HOME_HERO_PHOTO);
  assert.ok(calendarVars.page === '/uploads/march.jpg' || calendarVars.page === '/uploads/game.jpg');
  const ensembleVars = pickPublicThemePhotoVars([
    { url: '/uploads/staff.jpg', caption: 'Directors' },
    { url: '/uploads/marching.jpg', alt_text: 'Marching band on the field' },
  ], { slug: 'ensembles' });
  assert.equal(ensembleVars.hero, HOME_HERO_PHOTO);
  assert.equal(ensembleVars.page, '/uploads/marching.jpg');
});

test('staff auth lives in the utility bar, not the main public nav', () => {
  const utility = renderUtilityLinks({
    utility_links: JSON.stringify([
      { label: 'Upcoming Events', href: '/calendar.html' },
      { label: 'Contact', href: '/contact.html' },
    ]),
  });
  assert.match(utility, /utility-links/);
  assert.match(utility, /Upcoming Events/);
  assert.match(utility, /data-staff-auth-link/);
  assert.match(utility, /class="utility-auth"/);
  assert.match(utility, />Login</);
  assert.match(utility, /\/admin\/login/);
  assert.ok(utility.indexOf('utility-links') < utility.indexOf('data-staff-auth-link'));
  const loggedIn = renderUtilityLinks({ utility_links: '[]' }, { loggedIn: true });
  assert.match(loggedIn, /Staff Menu/);
  assert.match(loggedIn, /href="\/admin"/);
  assert.doesNotMatch(loggedIn, /\/admin\/login/);

  const pages = [
    { slug: 'home', path: '/', title: 'Home' },
    { slug: 'calendar', path: '/calendar.html', title: 'Calendar' },
    { slug: 'gallery', path: '/gallery.html', title: 'Gallery' },
    { slug: 'directors', path: '/directors.html', title: 'Directors & Staff' },
    { slug: 'sponsors', path: '/sponsors.html', title: 'Sponsors' },
    { slug: 'boosters', path: '/boosters.html', title: 'Boosters' },
    { slug: 'fundraising', path: '/fundraising.html', title: 'Fundraising' },
    { slug: 'contact', path: '/contact.html', title: 'Contact' },
  ];
  const nav = renderNav(pages);
  assert.doesNotMatch(nav, /data-staff-auth-link/);
  assert.doesNotMatch(nav, />Login</);
  assert.match(nav, /data-nav-support/);
  assert.match(nav, />Support the Band </);
  assert.match(nav, /href="\/boosters\.html"/);
  assert.match(nav, /href="\/fundraising\.html"/);
  assert.match(nav, /href="\/sponsors\.html"/);

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const script = readFileSync(join(root, 'script.js'), 'utf8');
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  const themeCss = readFileSync(join(root, 'public-theme.css'), 'utf8');
  assert.match(workerSrc, /renderUtilityLinks\(site, \{ loggedIn \}\)/);
  assert.doesNotMatch(workerSrc, /site-utility-rule/);
  assert.doesNotMatch(workerSrc, /<hr class=/);
  assert.doesNotMatch(workerSrc, /renderStaffAuthNavLink\(loggedIn\)\}?\$\{renderNotifyMeNavControl/);
  assert.match(script, /function utilityAuthHost/);
  assert.match(script, /\[data-header-quick-actions\]/);
  assert.match(script, /\[data-staff-auth-link\]/);
  assert.match(styles, /header-quick-actions \.utility-auth/);
  assert.match(themeCss, /border-top:1px solid #fff/);
  assert.match(themeCss, /header-quick-actions \.utility-auth/);
  assert.match(styles, /body\.maintenance-preview \.site-chrome header\.site-header\{top:auto\}/);
});

test('mobile header shows the full site name on two lines', () => {
  assert.equal(
    formatHeaderBrandTitle('East Forsyth Blue Regiment Band'),
    '<small>East Forsyth</small><span class="brand-title-rest">Blue Regiment Band</span>',
  );
  assert.equal(formatHeaderBrandTitle('East Forsyth'), 'East Forsyth');
  assert.match(formatHeaderBrandTitle('East Forsyth Band & Guard'), /Band &amp; Guard/);
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const themeCss = readFileSync(join(root, 'public-theme.css'), 'utf8');
  const siteContent = readFileSync(join(root, 'site-content.js'), 'utf8');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /formatHeaderBrandTitle\(site\.title\)/);
  assert.match(siteContent, /element\.closest\('a\.brand'\)/);
  assert.match(siteContent, /formatHeaderBrandTitle\(value\)/);
  assert.doesNotMatch(themeCss, /-webkit-line-clamp/);
  assert.match(themeCss, /\.brand-title-rest\{[^}]*white-space:nowrap/);
});

test('public homepage uses a single-row cover banner and hides the hero card', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const themeCss = readFileSync(join(root, 'public-theme.css'), 'utf8');
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  const homeCss = readFileSync(join(root, 'home-redesign.css'), 'utf8');
  const headerHtml = workerSrc.match(/<div class="utility">[\s\S]*?<\/header>/)?.[0] || '';
  assert.doesNotMatch(headerHtml, /<hr class=/);
  assert.doesNotMatch(headerHtml, /site-utility-rule/);
  assert.ok(headerHtml.indexOf('class="utility"') < headerHtml.indexOf('class="header-inner"'));
  assert.ok(headerHtml.indexOf('class="header-inner"') < headerHtml.indexOf('id="site-nav"'));
  assert.match(headerHtml, /class="brand-logo"/);
  assert.match(headerHtml, /class="brand-mark"/);
  assert.match(headerHtml, /class="btn gold header-donate"/);
  assert.match(headerHtml, /data-donate-open/);
  assert.match(themeCss, /border-top:1px solid #fff/);
  assert.match(themeCss, /body\.efhs-theme header\.site-header\{[\s\S]*?display:flex/);
  assert.match(themeCss, /body\.efhs-theme header\.site-header\{[\s\S]*?min-height:84px/);
  assert.match(themeCss, /body\.efhs-theme header\.site-header\{[\s\S]*?background-image:[\s\S]*?var\(--efhs-header-banner\)/);
  assert.match(themeCss, /body\.efhs-theme header\.site-header\{[\s\S]*?background-size:cover/);
  assert.match(themeCss, /body\.efhs-theme header\.site-header\{[\s\S]*?background-position:center 20%/);
  assert.match(themeCss, /body\.efhs-theme \.site-chrome header\.site-header\{[^}]*background-color:#01244a/);
  assert.doesNotMatch(themeCss, /body\.efhs-theme \.site-chrome header\.site-header\{[^}]*background:#01244a/);
  assert.doesNotMatch(themeCss, /grid-template-areas:"brand" "nav"/);
  assert.doesNotMatch(themeCss, /body\.efhs-theme \.header-inner\{[^}]*background-size:100% 100%/);
  assert.doesNotMatch(themeCss, /body\.efhs-theme \.header-inner\{[^}]*min-height:120px/);
  assert.match(themeCss, /body\.efhs-theme \.header-inner\{[^}]*min-height:84px/);
  assert.match(themeCss, /body\.efhs-theme header\.site-header nav\{[\s\S]*?background:transparent/);
  assert.match(themeCss, /@media \(max-width:767px\)\{[\s\S]*?#site-nav\{[\s\S]*?background:#fff/);
  assert.match(themeCss, /@media \(max-width:767px\)\{[\s\S]*?#site-nav\{[\s\S]*?color:var\(--efhs-navy\)/);
  assert.match(themeCss, /@media \(max-width:767px\)\{[\s\S]*?#site-nav a,[\s\S]*?\.nav-support-toggle\{[\s\S]*?color:var\(--efhs-navy\)/);
  assert.match(themeCss, /@media \(max-width:767px\)\{[\s\S]*?#site-nav a:hover,[\s\S]*?background:#eef3fa/);
  assert.match(themeCss, /@media \(max-width:767px\)\{[\s\S]*?#site-nav a\[aria-current="page"\],[\s\S]*?background:#eef3fa/);
  assert.match(themeCss, /@media \(max-width:767px\)\{[\s\S]*?grid-template-areas:"menu brand actions"/);
  assert.match(themeCss, /@media \(max-width:767px\) and \(max-height:500px\) and \(orientation:landscape\)/);
  assert.match(themeCss, /@media \(orientation:landscape\) and \(max-height:500px\)\{[\s\S]*?height:52px/);
  assert.match(themeCss, /@media \(orientation:landscape\) and \(max-height:500px\)\{[\s\S]*?\.menu-button\{[\s\S]*?display:inline-flex/);
  assert.match(themeCss, /@media \(orientation:landscape\) and \(max-height:500px\)\{[\s\S]*?nav \.header-donate/);
  assert.match(styles, /@media \(orientation:landscape\) and \(max-height:500px\)\{[\s\S]*?\.header-quick-actions \.utility-auth\{[\s\S]*?text-transform:uppercase/);
  assert.match(themeCss, /@media \(orientation:landscape\) and \(max-height:500px\)\{[\s\S]*?\.header-quick-actions \.utility-auth\{[\s\S]*?text-transform:uppercase/);
  assert.match(styles, /html\.nav-use-hamburger \.header-quick-actions \.utility-auth\{[\s\S]*?text-transform:uppercase/);
  assert.match(themeCss, /html\.nav-use-hamburger body\.efhs-theme \.header-quick-actions \.utility-auth\{[\s\S]*?text-transform:uppercase/);
  const scriptSrc = readFileSync(join(root, 'script.js'), 'utf8');
  assert.match(scriptSrc, /COMPACT_NAV_MEDIA/);
  assert.match(scriptSrc, /orientation: landscape\) and \(max-height: 500px/);
  assert.match(scriptSrc, /placeDonateInDrawer\(nav, donate\)/);
  assert.match(scriptSrc, /nav\.insertBefore\(donate, nav\.firstChild\)/);
  assert.match(scriptSrc, /placeUtilitiesInDrawer/);
  assert.match(scriptSrc, /headerUtilityFits/);
  assert.match(scriptSrc, /MIN_NAV_FONT_PX = 12/);
  assert.match(scriptSrc, /nav-use-hamburger/);
  assert.match(scriptSrc, /--efhs-sticky-header-height/);
  assert.match(scriptSrc, /syncStickyHeaderHeight/);
  assert.match(scriptSrc, /querySelector\('\.site-chrome'\)/);
  assert.match(scriptSrc, /const stack = chrome \|\| header/);
  assert.match(scriptSrc, /watchStickyStack/);
  assert.match(scriptSrc, /ResizeObserver/);
  assert.match(themeCss, /@media \(max-width:360px\)\{[\s\S]*?grid-template-columns:minmax\(3\.75rem,1fr\)/);
  assert.match(themeCss, /body\.efhs-theme \.brand\{[\s\S]*?justify-content:flex-start/);
  assert.match(themeCss, /body\.efhs-theme \.brand\{[\s\S]*?gap:8px/);
  assert.match(themeCss, /flex:0 1 auto/);
  assert.match(headerHtml, /class="menu-button"/);
  assert.ok(headerHtml.indexOf('class="menu-button"') < headerHtml.indexOf('class="header-inner"'));
  assert.ok(headerHtml.indexOf('class="header-inner"') < headerHtml.indexOf('data-header-quick-actions'));
  assert.match(themeCss, /body\.efhs-theme header\.site-header nav\{[\s\S]*?justify-content:flex-end/);
  assert.match(themeCss, /body\.efhs-theme header\.site-header nav a,[\s\S]*?\.nav-support-toggle\{[\s\S]*?font-weight:800/);
  assert.match(themeCss, /body\.efhs-theme \.nav-support-toggle\{[\s\S]*?font-weight:800/);
  assert.match(homeCss, /\.home-redesign \.logo-lockup\{display:none!important/);
  assert.match(homeCss, /@media \(max-width:767px\)\{[\s\S]*?body\.home-page \.header-donate\{display:none\}[\s\S]*?nav \.header-donate\{display:inline-flex!important\}/);
  assert.match(homeCss, /body\.home-page,[\s\S]*?overflow-x:clip/);
  assert.match(homeCss, /@media \(max-width:1100px\)\{[\s\S]*?quick-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(homeCss, /\.home-redesign \.impact ul\{[\s\S]*?flex-wrap:wrap/);
  assert.match(themeCss, /@media \(min-width:1200px\) and \(max-width:1339px\)\{[\s\S]*?\.header-donate\{[\s\S]*?display:inline-flex/);
  assert.match(themeCss, /html\.nav-use-hamburger body\.efhs-theme \.header-donate\{display:none!important\}/);
  assert.match(themeCss, /@media \(max-width:767px\)\{[\s\S]*?nav \.header-donate,[\s\S]*?display:inline-flex!important/);
  assert.match(themeCss, /html\.nav-use-hamburger body\.efhs-theme header\.site-header nav a,[\s\S]*?text-shadow:none/);
  assert.match(themeCss, /html\.nav-use-hamburger body\.efhs-theme header\.site-header nav \.utility-auth[\s\S]*?display:flex!important/);
  assert.doesNotMatch(styles, /html\.nav-use-hamburger header\.site-header nav \.nav-notify-me,\s*html\.nav-use-hamburger header\.site-header nav \.nav-add-home\{display:none!important\}/);
  const midStart = themeCss.indexOf('@media (min-width:768px) and (max-width:1199px)');
  const midEnd = themeCss.indexOf('@media (min-width:1200px) and (max-width:1339px)');
  const midWidth = midStart >= 0 && midEnd > midStart ? themeCss.slice(midStart, midEnd) : '';
  assert.ok(midWidth, '768-1199 header breakpoint missing');
  assert.match(midWidth, /font-size:12px/);
  assert.match(midWidth, /body\.efhs-theme \.header-donate\{[\s\S]*?display:inline-flex/);
  assert.doesNotMatch(midWidth, /header-donate\{display:none/);
  assert.match(themeCss, /nav \.header-donate,[\s\S]*?order:-1/);
  assert.match(themeCss, /max-height:calc\(100dvh - 52px - 6\.75rem\)/);
  assert.match(styles, /html\.nav-use-hamburger/);
  assert.match(styles, /order:-1/);
  assert.match(themeCss, /body\.efhs-theme\.home-page \.hero-card,[\s\S]*?display:none!important/);
  assert.match(themeCss, /body\.efhs-theme\.coming-soon-page \.hero-card,[\s\S]*?display:block!important/);
  assert.doesNotMatch(themeCss, /#page-preview \.hero-card\{[^}]*display:none/);
  assert.match(themeCss, /body\.efhs-theme \.hero \.wrap\{[\s\S]*?text-align:left/);
  assert.match(themeCss, /body\.efhs-theme \.hero \.button-row,[\s\S]*?#page-preview \.hero \.button-row\{[\s\S]*?justify-content:flex-start/);
  assert.match(themeCss, /body\.efhs-theme \.hero h1::first-line/);
  assert.match(styles, /\.nav-support-toggle\{[\s\S]*?font-weight:800/);
  assert.match(styles, /header\.site-header nav a,\s*header\.site-header nav \.nav-support-toggle\{[^}]*font-weight:800/);
});

test('home redesign upgrades old CMS HTML and binds fundraisers without inventing a time', () => {
  const old = '<section class="hero"><aside class="hero-card"><h2>Keep me</h2></aside></section>';
  const upgraded = upgradeHomeBody(old);
  assert.match(upgraded, /data-home-redesign/);
  assert.doesNotMatch(upgraded, /logo-lockup/);
  assert.match(upgraded, /<h2>Keep me<\/h2>/);
  assert.match(upgraded, /data-home-slot="next-fund"/);
  assert.match(upgraded, /data-home-deal/);
  assert.doesNotMatch(upgraded, /class="amt"/);
  assert.equal(homeEventTag({ track: 'deadline', title: 'Jacket forms' }).label, 'IMPORTANT');
  assert.equal(homeEventTag({ track: 'deadline', title: 'Jacket forms' }).className, 'ev-deadline');
  assert.equal(upgradeHomeBody(upgraded), upgraded);
  assert.equal(plainHeroSubtitle(`<p>${PREVIOUS_HERO_SUBTITLE}</p>`), PREVIOUS_HERO_SUBTITLE);
  assert.equal(APPROVED_HERO_SUBTITLE.includes('Blue Regiment'), true);

  const decorated = decorateHomeRedesign(buildHomeRedesignDocument(), {
    events: [{
      title: 'Fundraiser/Mattress Sale',
      description: 'Fundraiser at Mattress Warehouse. Students must attend.',
      location: '820 S Main St, Kernersville, NC 27284',
      start_date: '2026-10-24',
      track: 'deadline',
      all_day: 1,
    }, {
      title: 'Band Practice',
      description: 'Rehearsal',
      start_date: '2026-10-05',
      track: 'rehearsal',
      all_day: 0,
      start_time: '16:15',
      end_time: '18:30',
    }],
    members: [{ name: 'Name TBD', role: 'President' }],
    sponsors: [{ name: 'Placeholder Co', level: 'Bronze Sponsor', logo_url: '' }],
  });
  assert.doesNotMatch(buildHomeRedesignDocument(), /logo-lockup/);
  assert.doesNotMatch(upgradeHomeBody(buildHomeRedesignDocument().replace('<div class="eyebrow">', '<div class="logo-lockup"><img class="lock-eagle" alt="x"></div><div class="eyebrow">')), /logo-lockup/);
  assert.match(decorated, /Mattress Sale/);
  assert.doesNotMatch(decorated, /10 AM/);
  assert.match(decorated, /Jamie Olsen/);
  assert.match(decorated, /aireserv\.jpg/);
  assert.match(decorated, /data-home-slot="events"/);
  assert.match(decorated, /class="final"/);
  const withTiers = decorateHomeRedesign(buildHomeRedesignDocument(), {
    tiers: {
      bronze_label: 'Bronze',
      bronze_amount: '$250',
      bronze_blurb: 'Online',
      bronze_benefits: '<ul><li>Marquee</li></ul>',
      silver_label: 'Silver',
      silver_amount: '$500',
      silver_blurb: 'Fly-in',
      silver_benefits: '<ul><li>Fly-in</li></ul>',
      gold_label: 'Gold',
      gold_amount: '$1000',
      gold_blurb: 'Game day',
      gold_benefits: '<ul><li>Press box</li></ul>',
    },
  });
  assert.match(withTiers, /Choose Bronze/);
  assert.match(withTiers, /id="join"/);
  assert.match(withTiers, /Be part of the sound/);
  const soon = injectComingSoonLogos(comingSoonPageHtml({ heading: 'Join the Band', intro: 'Soon.' }));
  assert.match(soon, /coming-soon-logos/);
  assert.match(soon, /efhs-logo\.png/);
  assert.match(soon, /efhs-blue-regiment-mark\.png/);
  assert.match(soon, /data-cms-field="heading"/);
});

test('fundraising page cards use CMS flyer and event data without inventing a time', () => {
  const liveStyle = `<section class="page-hero" data-cms-layout="standard"><div class="page-title"><div class="kicker" data-cms-field="kicker">Support</div><h1 data-cms-field="heading">Fundraising</h1><p data-cms-field="intro">Our fundraising efforts help provide students with the equipment, experiences, and opportunities needed to continue growing as musicians. Discover how you can make a difference through giving, sponsorships, and participation.</p></div></section><section class="content"><div class="wrap"><div class="card" data-cms-field="body_text"><p><img src="/uploads/1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6.jpg" alt="14599" class="cms-body-photo cms-body-photo-left" style="width: 280px; height: auto;" data-photo-width="280"><br></p><p><br></p><p><br></p><p><br></p><p><br></p><p><br></p><p><br></p><p><br></p><p><br></p><p><br></p><p><br></p><p>Band members <u>MUST</u> attend!</p></div><article class="card accent-card square-donate-card" data-square-donate>
  <span class="tag">Donate</span>
  <h3>Direct Support</h3>
  <p>Give securely online to support instruments, travel, meals, uniforms, and student opportunities.</p>
  <div class="square-donate">
    <button type="button" class="btn primary" data-donate-open>Donate</button>
  </div>
</article></div></section><section class="content email-list-signup" data-email-list-signup data-email-list-topics="fundraising,calendar">
  <div class="wrap email-list-signup-inner">
    <div class="email-list-signup-copy">
      <h2>Email fundraising updates</h2>
      <p>Get campaign notes by email. Reply STOP to any message to unsubscribe.</p>
    </div>
    <div class="email-list-signup-action">
      <button type="button" class="btn primary" data-email-list-open>Subscribe</button>
    </div>
  </div>
</section>`;
  const media = extractFundraisingMedia(liveStyle);
  assert.equal(media.images[0].src, '/uploads/1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6.jpg');
  assert.equal(media.mustAttend, true);
  assert.equal(media.description, '');

  const html = decorateFundraisingPage(liveStyle, {
    events: [{
      id: 51,
      title: 'Fundraiser/Mattress Sale',
      description: 'Fundraiser at Mattress Warehouse Students must attend 820 S Main St, Kernersville, NC 27284',
      location: '',
      start_date: '2026-10-24',
      track: 'deadline',
      all_day: 1,
    }, {
      id: 61,
      title: 'Fundraiser/Silent Auction',
      description: 'Silent Auction Students and Parents Help Needed Location TBD',
      location: '',
      start_date: '2026-11-07',
      track: 'other',
      all_day: 1,
    }, {
      title: 'Band Practice',
      start_date: '2026-10-05',
      track: 'rehearsal',
    }],
  });
  assert.match(html, /data-fundraising-cards/);
  assert.match(html, /class="content fundraising-cards"/);
  assert.match(html, /Fundraiser\/Mattress Sale/);
  assert.match(html, /Fundraiser\/Silent Auction/);
  assert.match(html, /fundraising-card no-flyer/);
  assert.match(html, /Sat, Oct 24, 2026/);
  assert.match(html, /820 S Main St, Kernersville, NC 27284/);
  assert.match(html, /Fundraiser at Mattress Warehouse/);
  assert.match(html, /data-photo-open/);
  assert.match(html, /data-photo-caption="Fundraiser\/Mattress Sale"/);
  assert.match(html, /aria-label="Fundraiser\/Mattress Sale"/);
  assert.doesNotMatch(html, /Open Fundraiser\/Mattress Sale flyer/);
  assert.match(html, /data-donate-open/);
  assert.match(html, />Support</);
  assert.match(html, />Details</);
  assert.match(html, /Band members must attend/);
  assert.doesNotMatch(html, /10 AM/);
  assert.doesNotMatch(html, /cms-body-photo-left/);
  assert.doesNotMatch(html, /style="width: 280px; height: auto;"/);
  assert.doesNotMatch(html, /<p><br><\/p>/);
  assert.match(html, /data-square-donate/);
  assert.match(html, /data-email-list-signup/);
  assert.equal(decorateFundraisingPage(html, { events: [] }), html);

  const withDonate = ensureFundraisingDonateSlot(html);
  assert.match(withDonate, /data-square-donate|Direct Support/);
  assert.match(withDonate, /data-fundraising-cards/);
  assert.match(withDonate, /Mattress Sale/);

  const workerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'worker/src/worker.mjs'), 'utf8');
  const siteContent = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'site-content.js'), 'utf8');
  const styles = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'home-redesign.css'), 'utf8');
  assert.match(workerSrc, /decorateFundraisingPage\(page\.body_html/);
  assert.match(workerSrc, /needsEvents: isHome \|\| isFundraising/);
  assert.match(workerSrc, /if \(isHome \|\| needsEvents\)/);
  assert.match(workerSrc, /key: `home-events:\${today}`/);
  assert.doesNotMatch(workerSrc, /fundraising-events/);
  assert.match(workerSrc, /fundraising-page/);
  assert.match(siteContent, /\[data-photo-open\]/);
  assert.match(siteContent, /\[data-photo-gallery\]/);
  assert.match(siteContent, /openPhotoLightbox/);
  assert.match(siteContent, /data-photo-caption/);
  assert.match(styles, /\.fundraising-cards \.fundraising-card/);
  assert.match(styles, /@media \(max-width:767px\)\{[\s\S]*?\.fundraising-cards \.fundraising-card/);
  assert.match(styles, /@media \(min-width:1280px\)\{[\s\S]*?justify-content:center/);
  assert.match(styles, /@media \(orientation:landscape\) and \(max-height:500px\)\{[\s\S]*?max-height:calc\(100dvh - var\(--efhs-sticky-header-height, 52px\)\) !important/);
  assert.match(styles, /max-height:calc\(100dvh - var\(--efhs-sticky-header-height, 84px\)\)/);
  assert.match(styles, /@media \(orientation:landscape\) and \(max-height:500px\)\{[\s\S]*?overflow:visible/);
  assert.match(styles, /\.fundraising-card:not\(:has\(\.ff-media\)\)/);
  assert.match(styles, /object-fit:contain/);
  assert.doesNotMatch(styles, /@media \(max-width:980px\)\{[\s\S]*?\.fundraising-cards \.fundraising-card[\s\S]*?grid-template-columns:1fr/);
  assert.match(styles, /overflow-x:clip/);
  assert.match(styles, /html:has\(body\.fundraising-page\)/);
  assert.match(styles, /@media \(max-width:420px\)/);
  assert.match(styles, /width:100% !important/);
  assert.match(styles, /p:has\(> br:only-child\)/);
  assert.doesNotMatch(workerSrc, /DEV_UPLOAD_ORIGIN/);
  assert.match(workerSrc, /\/admin\/visual\/join/);
});

test('join, volunteer, and coming soon stay out of the public nav', () => {
  const nav = renderNav([
    { slug: 'home', path: '/', title: 'Home', is_home: 1 },
    { slug: 'join', path: '/join.html', title: 'Join the Band' },
    { slug: 'volunteer', path: '/volunteer.html', title: 'Volunteer' },
    { slug: 'coming-soon', path: '/coming-soon.html', title: 'Coming Soon' },
    { slug: 'contact', path: '/contact.html', title: 'Contact' },
  ]);
  assert.match(nav, /href="\/"/);
  assert.match(nav, /href="\/contact\.html"/);
  assert.doesNotMatch(nav, /join\.html/);
  assert.doesNotMatch(nav, /volunteer\.html/);
  assert.doesNotMatch(nav, /coming-soon\.html/);
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
  assert.match(sessionCookieHeader('abc.token'), /HttpOnly/);
  const hint = loginHintCookieHeader(true);
  assert.match(hint, new RegExp(`${LOGIN_HINT_COOKIE}=1`));
  assert.match(hint, /Max-Age=86400/);
  assert.match(hint, /SameSite=Lax/);
  assert.match(hint, /Secure/);
  assert.doesNotMatch(hint, /HttpOnly/);
  assert.match(loginHintCookieHeader(false), /Max-Age=0/);
  const cookies = new Response(null);
  applyAuthCookies(cookies, { token: 'abc.token', maxAge: SESSION_TTL_SECONDS });
  const setCookies = typeof cookies.headers.getSetCookie === 'function'
    ? cookies.headers.getSetCookie()
    : String(cookies.headers.get('set-cookie') || '').split(/,(?=\s*[^;]+=)/);
  assert.equal(setCookies.some((row) => row.startsWith('efband_session=') && /HttpOnly/.test(row)), true);
  assert.equal(setCookies.some((row) => row.startsWith('efhs_li=1') && !/HttpOnly/.test(row)), true);
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
  assert.match(styles, /events-view-only/);
  assert.match(styles, /events-view-only-note/);
  assert.match(styles, /\.month-calendar-shell/);
  assert.match(styles, /\.calendar-day-toast/);
  assert.match(script, /placeHeaderQuickActions|enhanceMenuButton/);
  assert.match(script, /function placeMenuButtonLeading/);
  assert.doesNotMatch(script, /placeMenuButtonInTray/);
  assert.match(script, /window\.matchMedia\('\(max-width: 767px\)'\)/);
  assert.match(styles, /@media\(max-width:767px\)\{[\s\S]*?grid-template-areas:"menu brand actions"/);
  assert.match(styles, /@media\(min-width:768px\)\{[\s\S]*?header\.site-header nav\{/);
  const themeCssNav = readFileSync(join(root, 'public-theme.css'), 'utf8');
  assert.match(themeCssNav, /@media \(min-width:768px\) and \(max-width:1199px\)/);
  const siteContent = readFileSync(join(root, 'site-content.js'), 'utf8');
  assert.match(styles, /\.photo-gallery\{/);
  assert.match(styles, /\.photo-lightbox/);
  assert.match(siteContent, /initMonthCalendars/);
  assert.match(siteContent, /findNextDayWithEvents/);
  assert.match(siteContent, /autoOpenCalendarDayToast/);
  assert.match(siteContent, /\/api\/calendar-events/);
  assert.match(siteContent, /data-month-calendar/);
  const caldevSrc = readFileSync(join(root, 'caldev.js'), 'utf8');
  assert.match(caldevSrc, /id: 'deadline', label: 'IMPORTANT'/);
  assert.match(caldevSrc, /autoOpenLandingEvents/);
  assert.match(caldevSrc, /findNextDayIsoWithEvents/);
  assert.match(caldevSrc, /showCalendarDayToast/);
  assert.match(caldevSrc, /America\/New_York/);
  assert.match(caldevSrc, /function renderDeadlineBanners/);
  assert.match(caldevSrc, /DEADLINE_BANNER_LEAD_DAYS = 7/);
  assert.match(caldevSrc, /caldev-deadline-banner/);
  assert.match(siteContent, /renderPhotoGallery/);
  assert.match(siteContent, /openPhotoLightbox/);
  assert.match(siteContent, /bindPhotoGalleries/);
  const adminSrc = readFileSync(join(root, 'admin.js'), 'utf8');
  assert.match(adminSrc, /function canViewEvents/);
  assert.match(adminSrc, /function canAccessScheduleBoard/);
  assert.match(adminSrc, /if \(button\.dataset\.tab === 'events'\) allowed = false;/);
  assert.match(adminSrc, /\/api\/admin\/checkout\/settings/);
  assert.match(adminSrc, /sandbox\.web\.squarecdn\.com\/v1\/square\.js/);
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /mobile-nav-tray/);
  assert.match(workerSrc, /menu-button-icon/);
  assert.match(workerSrc, /ASSET_VERSION/);
  assert.match(workerSrc, /square-connect-form/);
  assert.match(workerSrc, /\/api\/admin\/checkout\/settings/);
  assert.match(workerSrc, /\/api\/calendar-events/);
  assert.match(workerSrc, /ensureCalendarMonthMount/);
  assert.match(workerSrc, /ensureGalleryPageSlot/);
  assert.match(workerSrc, /ensureHomePhotoGallerySlot/);
  assert.match(workerSrc, /canAccessWebsiteGuide/);
  assert.match(workerSrc, /isCmsWebsiteGuidePath/);
  assert.match(workerSrc, /\/api\/admin\/website-guide\.pdf/);
  assert.match(workerSrc, /recipient_user_ids/);
  assert.match(workerSrc, /contact-topic-recipient-boxes/);
  assert.match(workerSrc, /Deliver messages to/);
  assert.match(workerSrc, /canViewEvents/);
  assert.match(workerSrc, /events-view-only-note/);
  assert.match(workerSrc, /All CMS users can browse events by month/);
  assert.match(workerSrc, /events-month-nav/);
  assert.match(workerSrc, /events-month-prev/);
  assert.match(workerSrc, /Events by month/);
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
  assert.match(adminJs, /renderEventsList/);
  assert.match(adminJs, /eventsViewMonth/);
  assert.match(adminJs, /shiftEventsMonthView/);
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
  assert.match(styles, /\.events-month-nav/);
  assert.match(styles, /events-month-nav \.btn/);
  assert.match(styles, /grid-template-columns:auto minmax\(0,1fr\) auto/);
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
  assert.match(workerSrc, /zernio-facebook-events-publish/);
  assert.match(workerSrc, /Post calendar updates to Facebook/);
  assert.doesNotMatch(workerSrc, /Calendar updates are no longer posted to Facebook/);
  assert.doesNotMatch(workerSrc, /gold-tier-benefits-card/);
  assert.doesNotMatch(workerSrc, /id="sponsor-preview"/);
});

test('band dues receipt builder covers paid and failed outcomes', () => {
  const paid = buildDuesReceipt({
    id: 12,
    student_name: 'Alex Eagle',
    email: 'parent@example.com',
    amount_cents: 5000,
    amount_display: '$50',
    paid_at: '2026-08-20T12:00:00.000Z',
  });
  assert.equal(paid.to, 'parent@example.com');
  assert.match(paid.subject, /Band dues payment receipt/);
  assert.match(paid.text, /Alex Eagle/);
  assert.match(paid.text, /Paid/);
  assert.match(paid.html, /DU-12/);

  const failed = buildDuesReceipt({
    id: 13,
    student_name: 'Alex Eagle',
    email: 'parent@example.com',
    amount_cents: 5000,
    amount_display: '$50',
    failure_detail: 'Card declined',
    updated_at: '2026-08-20T12:05:00.000Z',
  }, { failed: true });
  assert.match(failed.subject, /unsuccessful/);
  assert.match(failed.text, /Card declined/);
  assert.match(failed.text, /Failed/);
  assert.match(failed.html, /DU-13/);
});

test('dues payment helpers and Boosters Pay dues entry are present', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const siteContent = readFileSync(join(root, 'site-content.js'), 'utf8');
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  const duesDev = readFileSync(join(root, 'dues-dev.html'), 'utf8');
  const boosters = readFileSync(join(root, 'boosters.html'), 'utf8');
  assert.match(workerSrc, /CREATE TABLE IF NOT EXISTS dues_payments/);
  assert.match(workerSrc, /\/api\/dues/);
  assert.match(workerSrc, /recordDuesPaymentLedger/);
  assert.match(workerSrc, /recordInKindFormLedger/);
  assert.match(workerSrc, /recordDuesFailedLedger/);
  assert.match(workerSrc, /sendDuesReceipt/);
  assert.match(workerSrc, /ensureBoostersDuesSlot/);
  assert.match(workerSrc, /applyBoostersDuesVisibility/);
  assert.match(workerSrc, /boosters_dues_enabled/);
  assert.match(workerSrc, /site-settings-switches/);
  assert.match(workerSrc, /data-password-toggle/);
  assert.match(workerSrc, /admin-password-toggle/);
  assert.match(workerSrc, /ASSET_VERSION/);
  assert.match(siteContent, /function openDuesModal/);
  assert.match(siteContent, /function bindDuesButtons/);
  assert.match(siteContent, /data-dues-open/);
  assert.match(siteContent, /boosters_dues_enabled/);
  assert.match(siteContent, /\/api\/dues/);
  assert.match(styles, /\.boosters-dues-card/);
  assert.match(styles, /\.site-settings-switches/);
  assert.match(styles, /\.admin-password-toggle/);
  assert.match(styles, /dues-toast\.is-failed/);
  assert.match(boosters, /data-dues-open/);
  assert.match(boosters, />Pay dues</);
  assert.match(boosters, /data-booster-meetings/);
  assert.match(boosters, /data-booster-members/);
  assert.match(duesDev, /data-dues-open/);
  assert.match(duesDev, /noindex/);
  assert.match(duesDev, /Preview only/);
  const adminSrc = readFileSync(join(root, 'admin.js'), 'utf8');
  assert.match(adminSrc, /boosters_dues_enabled/);
  assert.match(adminSrc, /data-boosters-dues-setting/);
});

test('Treasurer Ledger CMS feature is restored with permissions, XML/Excel export, and dues', () => {
  assert.deepEqual(LEDGER_KINDS, ['sponsor', 'donor', 'fundraiser', 'dues', 'expense']);
  assert.deepEqual(LEDGER_INCOME_KINDS, ['sponsor', 'donor', 'fundraiser', 'dues']);

  assert.equal(canAccessTreasurerLedger({ role: 'admin' }), true);
  assert.equal(canAccessTreasurerLedger({ role: 'editor', permissions: ['treasurer'] }), true);
  assert.equal(canAccessTreasurerLedger({ role: 'editor', permissions: ['president'] }), true);
  // Vice President can access Checkout but not the Ledger (checked exactly per the ledger branch).
  assert.equal(canAccessTreasurerLedger({ role: 'editor', permissions: ['vice-president'] }), false);
  assert.equal(canAccessTreasurerLedger({ role: 'editor', permissions: ['sponsors'] }), false);
  assert.equal(canAccessTreasurerLedger(null), false);

  assert.equal(escapeXml('A & B <C>'), 'A &amp; B &lt;C&gt;');
  assert.equal(formatLedgerAmountDisplay(12345), '$123.45');
  assert.equal(normalizeLedgerKind('DUES'), 'dues');
  assert.equal(normalizeLedgerKind('unknown'), '');
  assert.equal(ledgerSignedCents({ kind: 'expense', amount_cents: 500 }), -500);
  assert.equal(ledgerSignedCents({ kind: 'dues', amount_cents: 500 }), 500);

  const summary = summarizeLedgerEntries([
    { kind: 'sponsor', amount_cents: 50000 },
    { kind: 'donor', amount_cents: 2500 },
    { kind: 'dues', amount_cents: 7500 },
    { kind: 'expense', amount_cents: 4500 },
  ]);
  assert.equal(summary.income_cents, 60000);
  assert.equal(summary.expense_cents, 4500);
  assert.equal(summary.net_cents, 55500);
  assert.equal(summary.dues_cents, 7500);
  assert.equal(summary.counts.dues, 1);

  const xml = buildPaymentLedgerXml({
    generatedAt: '2026-08-16T12:00:00.000Z',
    sponsors: [{
      id: 12,
      name: 'Acme Music & Co',
      address: '100 Band Way, Kernersville, NC',
      amount_cents: 50000,
      amount_display: '$500',
      package: 'Gold Sponsor',
      paid_at: '2026-08-10T11:00:00.000Z',
    }],
    donors: [{
      id: 3,
      name: 'Jane Donor',
      amount_cents: 2500,
      amount_display: '$25',
      paid_at: '2026-08-10T11:30:00.000Z',
    }],
    dues: [{
      id: 10,
      kind: 'dues',
      name: 'Alex Student',
      amount_cents: 7500,
      amount_display: '$75.00',
      package: 'Dues',
      paid_at: '2026-08-07T10:00:00.000Z',
    }],
    expenses: [{
      id: 9,
      kind: 'expense',
      name: 'Trailer hitch',
      amount_cents: 4500,
      amount_display: '-$45.00',
      package: 'Expense',
      paid_at: '2026-08-08T10:00:00.000Z',
    }],
  });
  assert.match(xml, /<\?xml version="1.0"/);
  assert.match(xml, /<sponsors count="1" total_cents="50000" total_display="\$500\.00">/);
  assert.match(xml, /<donors count="1" total_cents="2500" total_display="\$25\.00">/);
  assert.match(xml, /<dues count="1" total_cents="7500" total_display="\$75\.00">/);
  assert.match(xml, /<expenses count="1" total_cents="-4500" total_display="-\$45\.00">/);
  assert.match(xml, /Acme Music &amp; Co/);
  assert.match(xml, /Jane Donor/);
  assert.match(xml, /Alex Student/);
  assert.match(xml, /Trailer hitch/);
  assert.match(xml, /<package>Gold Sponsor<\/package>/);
  assert.match(xml, /income cents="60000" display="\$600\.00"/);
  assert.match(xml, /net_total cents="55500" display="\$555\.00"/);

  const excel = buildPaymentLedgerExcelXml([
    { id: 1, kind: 'dues', name: 'Alex Student', amount_cents: 7500, amount_display: '$75.00', money_exchanged: true, paid_at: '2026-08-07' },
    { id: 2, kind: 'expense', name: 'Trailer hitch', amount_cents: 4500, amount_display: '-$45.00', money_exchanged: true, paid_at: '2026-08-08' },
  ], { generatedAt: '2026-08-16T12:00:00.000Z' });
  assert.match(excel, /Excel\.Sheet/);
  assert.match(excel, /EFHS Ledger/);
  assert.match(excel, /Alex Student/);
  assert.match(excel, /Trailer hitch/);
  assert.match(excel, /Cash net/);

  // ADMIN_HTML, worker routes, and admin.js wiring for the Ledger CMS tab.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /id="tab-ledger"/);
  assert.match(workerSrc, /data-tab="ledger"/);
  assert.match(workerSrc, /id="ledger-summary"/);
  assert.match(workerSrc, /id="ledger-table-body"/);
  assert.match(workerSrc, /id="download-ledger-excel"/);
  assert.match(workerSrc, /id="refresh-ledger"/);
  assert.match(workerSrc, /id="new-ledger-entry"/);
  assert.match(workerSrc, /CREATE TABLE IF NOT EXISTS payment_ledger/);
  assert.match(workerSrc, /\/api\/admin\/ledger\.xls/);
  assert.match(workerSrc, /\/api\/admin\/ledger\.xml/);
  assert.match(workerSrc, /canAccessTreasurerLedger\(auth\.user\)/);
  assert.match(workerSrc, /Treasurer \(Ledger \+ Square Checkout\)/);
  assert.match(workerSrc, /President \(Ledger \+ Square Checkout\)/);
  const permissionsDeclLedger = workerSrc.match(/const GLOBAL_PERMISSIONS = \[([^\]]+)\]/);
  assert.ok(permissionsDeclLedger);
  assert.match(permissionsDeclLedger[1], /'treasurer'/);
  assert.match(permissionsDeclLedger[1], /'president'/);

  const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
  assert.match(adminJs, /function canAccessLedger/);
  assert.match(adminJs, /async function loadLedger/);
  assert.match(adminJs, /ledger: canAccessLedger\(\)/);
  assert.match(adminJs, /'Ledger', 'Record donors, sponsors, fundraisers, dues, and expenses/);

  const stylesSrc = readFileSync(join(root, 'styles.css'), 'utf8');
  assert.match(stylesSrc, /Treasurer ledger/);
  assert.match(stylesSrc, /\.ledger-summary-grid/);
  assert.match(stylesSrc, /\.ledger-table/);
  assert.match(stylesSrc, /\.page-hero\{[^}]*padding:22px 20px/);
  assert.match(stylesSrc, /\.page-title\{[^}]*padding:8px 20px/);
  assert.match(stylesSrc, /\.page-preview \.page-hero\{padding:22px 0\}/);
});

test('email list topics normalize and default to both topics', () => {
  assert.deepEqual(normalizeEmailListTopics(['calendar', 'calendar', 'nope']), ['calendar']);
  assert.deepEqual(normalizeEmailListTopics([], { defaultAll: true }), ['calendar', 'fundraising']);
  assert.deepEqual(normalizeEmailListTopics([], { defaultAll: false }), []);
});

test('wantsEmailListNotify defaults on and accepts explicit off', () => {
  assert.equal(wantsEmailListNotify({}), true);
  assert.equal(wantsEmailListNotify({ notify_email_subscribers: true }), true);
  assert.equal(wantsEmailListNotify({ notify_email_subscribers: false }), false);
  assert.equal(wantsEmailListNotify({ notify_email_subscribers: '0' }), false);
});

test('extractEmailAddress and STOP detection', () => {
  assert.equal(extractEmailAddress('Parent Name <parent@example.com>'), 'parent@example.com');
  assert.equal(isEmailListStopRequest({ subject: 'Re: update', text: 'STOP' }), true);
  assert.equal(isEmailListStopRequest({ subject: 'Hello', text: 'Thanks for the note' }), false);
  assert.equal(isEmailListStopRequest({ subject: 'Please unsubscribe me', text: '' }), true);
});

test('ensureEmailListSignupSlot injects once', () => {
  const first = ensureEmailListSignupSlot('<section class="content soft"></section>');
  assert.match(first, /data-email-list-signup/);
  assert.match(first, /data-email-list-open/);
  assert.doesNotMatch(first, /email-list-signup-qr/);
  assert.doesNotMatch(first, /data-email-list-form/);
  assert.equal(ensureEmailListSignupSlot(first), first);
  assert.match(renderEmailListSignup(), /Subscribe/);
  const upgraded = ensureEmailListSignupSlot('<section class="content email-list-signup" data-email-list-signup><form data-email-list-form></form></section>');
  assert.match(upgraded, /data-email-list-open/);
  assert.doesNotMatch(upgraded, /data-email-list-form/);
});

test('buildEmailListUpdateMessage includes reply-stop guidance', () => {
  const calendar = buildEmailListUpdateMessage({ topic: 'calendar', action: 'created', event: { title: 'Band Concert', date_label: 'Sep', date_detail: '12', event_year: 2026 } });
  assert.match(calendar.subject, /New calendar event/);
  assert.match(calendar.text, /STOP/);
  assert.equal(EMAIL_LIST_REPLY_TO, 'list@updates.efhsband.org');
  const fundraising = buildEmailListUpdateMessage({ topic: 'fundraising', pageTitle: 'Spirit Night' });
  assert.match(fundraising.subject, /Fundraising update/);
  const finished = buildEmailListUpdateMessage({ topic: 'calendar', action: 'finished' });
  assert.match(finished.subject, /Band calendar updated/);
  assert.match(finished.text, /calendar\.html/);
  assert.match(finished.html, /STOP/);
  assert.doesNotMatch(finished.html, /fundraising/);
});

test('email list topic helpers label and compare subscriptions', () => {
  assert.equal(formatEmailListTopicsLabel(['calendar']), 'Calendar');
  assert.equal(formatEmailListTopicsLabel(['fundraising']), 'Fundraising');
  assert.equal(formatEmailListTopicsLabel(['calendar', 'fundraising']), 'Calendar and Fundraising');
  assert.equal(emailListTopicsEqual(['fundraising', 'calendar'], ['calendar', 'fundraising']), true);
  assert.equal(emailListTopicsEqual(['calendar'], ['calendar', 'fundraising']), false);
});

test('buildEmailListTopicsChangedMessage explains before and after topics', () => {
  const message = buildEmailListTopicsChangedMessage({
    previousTopics: ['calendar'],
    topics: ['calendar', 'fundraising'],
    unsubscribeToken: 'tok123',
  });
  assert.match(message.subject, /preferences were updated/i);
  assert.match(message.text, /Before: Calendar/);
  assert.match(message.text, /Now: Calendar and Fundraising/);
  assert.match(message.text, /STOP/);
  assert.match(message.html, /tok123/);
});

test('buildEmailListWelcomeMessage confirms signup and explains unsubscribe', () => {
  const welcome = buildEmailListWelcomeMessage({
    topics: ['calendar'],
    unsubscribeToken: 'abc123',
  });
  assert.match(welcome.subject, /Welcome/);
  assert.match(welcome.text, /subscribed/i);
  assert.match(welcome.text, /STOP/);
  assert.match(welcome.text, /email-unsubscribe\?token=abc123/);
  assert.match(welcome.html, /STOP/);
  assert.match(welcome.html, /Unsubscribe with one click/);
});

test('verifyResendWebhookSignature accepts known Svix example', async () => {
  const secret = 'whsec_plJ3nmyCDGBKInavdOK15jsl';
  const payload = '{"event_type":"ping","data":{"success":true}}';
  const id = 'msg_loFOjxBNrRLzqYUf';
  // Use a fresh timestamp so skew checks pass; recompute signature like production.
  const timestamp = String(Math.floor(Date.now() / 1000));
  const { createHmac } = await import('node:crypto');
  const secretBytes = Buffer.from(secret.split('_')[1], 'base64');
  const signature = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${payload}`).digest('base64');
  const ok = await verifyResendWebhookSignature(payload, {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  }, secret);
  assert.equal(ok.ok, true);
  const bad = await verifyResendWebhookSignature(payload, {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': 'v1,not-a-real-signature====',
  }, secret);
  assert.equal(bad.ok, false);
});

test('subscribe deep link and print-only QR assets are wired', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /pathname === '\/subscribe'/);
  assert.match(workerSrc, /pathname === '\/sponsor'/);
  assert.match(workerSrc, /pathname === '\/donate'/);
  assert.doesNotMatch(renderEmailListSignup(), /email-list-signup-qr|subscribe-qr\.png/);
  assert.match(readFileSync(join(root, 'script.js'), 'utf8'), /shouldAutoOpenSubscribe|subscribe=1/);
  assert.match(readFileSync(join(root, 'site-content.js'), 'utf8'), /maybeAutoOpenDonate|donate=1/);
  assert.match(readFileSync(join(root, 'assets/email-list-subscribe-qr.png')).slice(0, 8).toString('hex'), /^89504e47/);
  assert.match(readFileSync(join(root, 'assets/sponsor-qr.png')).slice(0, 8).toString('hex'), /^89504e47/);
  assert.match(readFileSync(join(root, 'assets/donate-qr.png')).slice(0, 8).toString('hex'), /^89504e47/);
  const qrPage = readFileSync(join(root, 'qr.html'), 'utf8');
  assert.match(qrPage, /Sponsor!/);
  assert.match(qrPage, /Donate!/);
  assert.match(qrPage, /Subscribe!/);
  assert.doesNotMatch(readFileSync(join(root, 'calendar.html'), 'utf8'), /email-list-signup-qr|sponsor-qr\.png|donate-qr\.png/);
  assert.doesNotMatch(readFileSync(join(root, 'fundraising.html'), 'utf8'), /email-list-signup-qr|sponsor-qr\.png|donate-qr\.png/);
});

test('styles.css brace balance stays closed so public Schedule Board CSS applies', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const css = readFileSync(join(root, 'styles.css'), 'utf8');
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  assert.equal(open - close, 0, `styles.css brace delta should be 0, got ${open - close}`);
  assert.match(css, /\.cms-managed-body-note\{[\s\S]*?background:#f5f9ff;\s*\}/);
  assert.match(css, /\.caldev-board\{/);
  assert.match(css, /\.caldev-deadline-banner,/);
  assert.match(css, /\.cms-caldev-editor-overlay\{/);
  assert.match(css, /\.cms-caldev-editor-toast\[hidden\]\{display:none!important\}/);
});

test('mobile Schedule Board stays inside the phone viewport', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const css = readFileSync(join(root, 'styles.css'), 'utf8');
  const js = readFileSync(join(root, 'caldev.js'), 'utf8');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(css, /\.caldev-app\{display:grid;gap:16px;min-width:0;max-width:100%\}/);
  assert.match(css, /\.caldev-section,\s*\.caldev-app,\s*\.caldev-board\{overflow-x:clip\}/);
  assert.match(css, /\.caldev-month-grid\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\);gap:3px\}/);
  assert.match(css, /\.caldev-view-switch\{display:flex;flex-wrap:wrap/);
  assert.match(js, /<div class="caldev-week-col/);
  assert.doesNotMatch(js, /<section class="caldev-week-col/);
  assert.match(workerSrc, /caldev-body/);
});

test('mobile public header and chrome scroll with the page instead of staying sticky', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const css = readFileSync(join(root, 'styles.css'), 'utf8');
  const mobile = css.match(/@media\(max-width:767px\)\{[\s\S]*?body\.nav-drawer-open\{overflow:hidden\}/);
  assert.ok(mobile, 'expected the compact header/nav media query');
  assert.match(mobile[0], /header\.site-header,\s*\.site-chrome\{\s*position:relative;\s*top:auto;/);
  assert.doesNotMatch(mobile[0], /position:\s*sticky/);
  assert.match(css, /header\.site-header\{position:sticky;top:0;/);
  assert.match(css, /\.site-chrome\{\s*position:sticky;/);
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:500px\)\{[\s\S]*?\.site-chrome,[\s\S]*?position:relative;/);
});

test('initDb skips heavy migrate work when schema_version matches', async () => {
  resetDbInitCache();
  const calls = [];
  const store = new Map([['schema_version', DB_SCHEMA_VERSION]]);
  const env = {
    DB: {
      prepare(sql) {
        const statement = {
          sql,
          binds: [],
          bind(...args) {
            this.binds = args;
            return this;
          },
          async first() {
            calls.push({ type: 'first', sql });
            if (String(sql).includes('FROM site_content WHERE key')) {
              const key = this.binds[0];
              if (!store.has(key)) return null;
              return { value: store.get(key) };
            }
            throw new Error(`unexpected first(): ${sql}`);
          },
          async run() {
            calls.push({ type: 'run', sql });
            throw new Error(`unexpected run(): ${sql}`);
          },
          async all() {
            calls.push({ type: 'all', sql });
            throw new Error(`unexpected all(): ${sql}`);
          },
        };
        return statement;
      },
      async batch() {
        calls.push({ type: 'batch' });
        throw new Error('unexpected batch()');
      },
    },
  };
  await initDb(env);
  await initDb(env);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'first');
  assert.match(calls[0].sql, /site_content/);
});

test('initDb memoizes after first successful schema check in-isolate', async () => {
  resetDbInitCache();
  let reads = 0;
  const env = {
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async first() {
            reads += 1;
            return { value: DB_SCHEMA_VERSION };
          },
          async run() { throw new Error('unexpected run'); },
          async all() { throw new Error('unexpected all'); },
        };
      },
      async batch() { throw new Error('unexpected batch'); },
    },
  };
  await initDb(env);
  await initDb(env);
  await initDb(env);
  assert.equal(reads, 1);
});

test('initDb does not migrate when schema_version read fails transiently', async () => {
  resetDbInitCache();
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            calls.push({ type: 'first', sql });
            throw new Error('D1_ERROR: network timeout');
          },
          async run() {
            calls.push({ type: 'run', sql });
            throw new Error('unexpected run');
          },
        };
      },
      async batch() {
        calls.push({ type: 'batch' });
        throw new Error('unexpected batch');
      },
    },
  };
  await initDb(env);
  assert.equal(calls.some((call) => call.type === 'batch'), false);
  assert.equal(calls.filter((call) => call.type === 'run').length, 0);
  assert.equal(calls.length, 1);
});

test('initDb applies the incremental upgrade on 2026-10-02.1 without the full seed', async () => {
  resetDbInitCache();
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            calls.push({ type: 'first', sql });
            if (String(sql).includes('FROM site_content WHERE key')) {
              return { value: '2026-10-02.1' };
            }
            return null;
          },
          async run() {
            calls.push({ type: 'run', sql: String(sql).slice(0, 80) });
            return { success: true };
          },
          async all() {
            calls.push({ type: 'all' });
            return { results: [] };
          },
        };
      },
      async batch(items) {
        calls.push({ type: 'batch', count: items?.length || 0 });
        return (items || []).map(() => ({ success: true }));
      },
    },
  };
  await initDb(env);
  const batches = calls.filter((call) => call.type === 'batch');
  assert.equal(batches.length, 1);
  assert.ok(batches[0].count <= 40);
  assert.ok(batches[0].count < 20, 'incremental upgrade must not recreate every table');
  assert.equal(calls.some((call) => call.type === 'run' && /schema_version|site_content/.test(call.sql)), true);
  await initDb(env);
  assert.equal(calls.filter((call) => call.type === 'batch').length, 1);
});

test('photo URLs include a version and public forms do not purge the read cache', () => {
  const url = publicPhotoUrl({ id: 12, filename: 'flyer.jpg', created_at: '2026-10-03T12:00:00.000Z' });
  assert.match(url, /^\/uploads\/flyer\.jpg\?v=12-/);
  assert.equal(shouldInvalidatePublicReadCache('/api/email-subscribe', 'POST'), false);
  assert.equal(shouldInvalidatePublicReadCache('/api/contact', 'POST'), false);
  assert.equal(shouldInvalidatePublicReadCache('/api/push/subscribe', 'POST'), false);
  assert.equal(shouldInvalidatePublicReadCache('/api/inkind', 'POST'), false);
  assert.equal(shouldInvalidatePublicReadCache('/api/admin/pages', 'PUT'), true);
  assert.equal(shouldInvalidatePublicReadCache('/api/admin/pages', 'GET'), false);
});

test('upload cache keys ignore junk v and photo delete purges Cache API entries', () => {
  const workerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'worker/src/worker.mjs'), 'utf8');
  const scriptSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'script.js'), 'utf8');
  const plain = uploadCacheRequest('https://efhsband.internal/uploads/flyer.jpg');
  const junk = uploadCacheRequest('https://efhsband.internal/uploads/flyer.jpg?v=random-junk');
  const canon = uploadCacheRequest('https://efhsband.internal/uploads/flyer.jpg?v=12-20261003T120000000Z');
  assert.equal(new URL(plain.url).searchParams.get('v'), null);
  assert.equal(plain.url, junk.url);
  assert.equal(plain.url, canon.url);
  assert.equal(PHOTO_BROWSER_CACHE, 'public, max-age=86400, s-maxage=0');
  const photo = { id: 12, filename: 'flyer.jpg', created_at: '2026-10-03T12:00:00.000Z' };
  const keys = uploadCacheKeysForPhoto(photo).map((request) => request.url);
  assert.equal(keys.includes(plain.url), true);
  assert.equal(keys.some((url) => url.includes('v=12-')), true);
  assert.match(workerSrc, /await purgeUploadCache\(photo\)/);
  assert.match(scriptSrc, /function hasLoginHint/);
  assert.match(scriptSrc, /if \(!hasLoginHint\(\)\) return;/);
});

test('initDb migrates when site_content table is missing', async () => {
  resetDbInitCache();
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            calls.push({ type: 'first', sql });
            if (String(sql).includes('FROM site_content WHERE key')) {
              throw new Error('no such table: site_content');
            }
            return { count: 1 };
          },
          async run() {
            calls.push({ type: 'run', sql: String(sql).slice(0, 80) });
          },
          async all() {
            calls.push({ type: 'all', sql: String(sql).slice(0, 80) });
            return { results: [] };
          },
        };
      },
      async batch(items) {
        calls.push({ type: 'batch', count: items?.length || 0 });
        throw new Error('stop-after-migrate-start');
      },
    },
  };
  await assert.rejects(() => initDb(env), /stop-after-migrate-start/);
  assert.equal(calls.some((call) => call.type === 'batch'), true);
});

test('static asset paths skip D1 and website-guide stays gated', () => {
  assert.equal(isWorkerStaticAssetPath('/styles.css'), true);
  assert.equal(isWorkerStaticAssetPath('/script.js?v=1'), true);
  assert.equal(isWorkerStaticAssetPath('/assets/efhs-logo.png'), true);
  assert.equal(isWorkerStaticAssetPath('/home-redesign.css'), true);
  assert.equal(isWorkerStaticAssetPath('/'), false);
  assert.equal(isWorkerStaticAssetPath('/fundraising.html'), false);
  assert.equal(isWorkerStaticAssetPath('/admin'), false);
  assert.equal(isWorkerStaticAssetPath('/uploads/flyer.jpg'), false);
  assert.equal(isWorkerStaticAssetPath('/assets/downloads/EFHS-Band-Website-CMS-Guide-Super-Admin.pdf'), false);
  const workerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /isWorkerStaticAssetPath/);
  assert.match(workerSrc, /serveBundledStaticAsset/);
  assert.match(workerSrc, /initDb_schema_read_failed/);
  assert.match(workerSrc, /look like "needs migrate"/);
});

test('Badge Creator stores photo paths only and stays off the full D1 migrate path', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const adminSrc = readFileSync(join(root, 'admin.js'), 'utf8');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const styles = readFileSync(join(root, 'styles.css'), 'utf8');
  const badgeJs = readFileSync(join(root, 'badge-creator.js'), 'utf8');
  const badgeAdmin = readFileSync(join(root, 'badge-creator-admin.js'), 'utf8');
  const syncSrc = readFileSync(join(root, 'worker/scripts/sync-public.mjs'), 'utf8');

  assert.match(workerSrc, /data-tab="badge-creator"/);
  assert.match(workerSrc, /id="tab-badge-creator"/);
  assert.match(workerSrc, /id="badge-creator-print"/);
  assert.match(workerSrc, /badge-creator\.js/);
  assert.match(workerSrc, /\/api\/admin\/badges/);
  assert.match(workerSrc, /CREATE TABLE IF NOT EXISTS committee_badges/);
  assert.match(workerSrc, /photo_url TEXT NOT NULL DEFAULT ''/);
  assert.doesNotMatch(workerSrc, /committee_badges[\s\S]{0,400}data_base64/);
  assert.match(adminSrc, /function canAccessBadgeCreator/);
  assert.match(adminSrc, /window\.canAccessBadgeCreator/);
  assert.match(adminSrc, /initBadgeCreatorPanel/);
  assert.match(badgeAdmin, /badge-creator-print-selected/);
  assert.match(badgeAdmin, /MAX_PRINT_SELECTION = 3/);
  assert.match(badgeJs, /function renderBadge/);
  assert.match(badgeJs, /function printBadges/);
  assert.match(styles, /\.badge-creator-preview-wrap/);
  assert.match(styles, /\.badge-creator-preview-wrap\.is-gold-border/);
  assert.match(syncSrc, /badge-creator\.js/);
  assert.match(syncSrc, /badge-creator-admin\.js/);

  const saved = normalizeCommitteeBadgePayload({
    member_name: 'Jordan Smith',
    role: 'President',
    school_year: '2026-2027',
    photo_url: '/uploads/badge-jordan.jpg',
    photo_zoom: 1.5,
    photo_offset_x: 0.2,
    photo_offset_y: -0.1,
  });
  assert.equal(saved.member_name, 'Jordan Smith');
  assert.equal(saved.role, 'President');
  assert.equal(saved.photo_url, '/uploads/badge-jordan.jpg');
  assert.equal(saved.photo_zoom, 1.5);
  const unsafe = normalizeCommitteeBadgePayload({
    member_name: 'Pat',
    role: 'Hacker',
    school_year: '2026-2027',
    photo_url: 'javascript:alert(1)',
  });
  assert.equal(unsafe.role, 'Committee Member');
  assert.equal(unsafe.photo_url, '');

  resetCommitteeBadgesSchemaCache();
  let runs = 0;
  const env = {
    DB: {
      prepare(sql) {
        return {
          async run() {
            runs += 1;
            if (String(sql).includes('ALTER TABLE')) throw new Error('duplicate column name');
          },
        };
      },
    },
  };
  await ensureCommitteeBadgesSchema(env);
  await ensureCommitteeBadgesSchema(env);
  assert.equal(runs, 4); // 1 CREATE + 3 ALTER attempts
});

test('ensureCaldevSchema only migrates once per isolate', async () => {
  resetCaldevSchemaCache();
  let runs = 0;
  const env = {
    DB: {
      prepare(sql) {
        return {
          async run() {
            runs += 1;
            if (String(sql).includes('ALTER TABLE')) {
              throw new Error('duplicate column name');
            }
          },
        };
      },
    },
  };
  await ensureCaldevSchema(env);
  await ensureCaldevSchema(env);
  assert.equal(runs, 5); // 1 CREATE TABLE + 3 ALTER + 1 start_date index
});

test('worker source gates initDb behind schema_version', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSrc, /export const DB_SCHEMA_VERSION/);
  assert.match(workerSrc, /async function migrateAndSeedDb/);
  assert.match(workerSrc, /export async function initDb/);
  assert.match(workerSrc, /resetDbInitCache/);
  assert.match(workerSrc, /isMissingSchemaTableError/);
  assert.match(workerSrc, /isWorkerStaticAssetPath\(url\.pathname\)/);
  assert.match(workerSrc, /PHOTO_BYTE_CACHE_VERSION/);
  const caldevSrc = readFileSync(join(root, 'worker/src/caldev.mjs'), 'utf8');
  assert.match(caldevSrc, /resetCaldevSchemaCache/);
  assert.match(caldevSrc, /caldevSchemaReady/);
});
