import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveHolidayTheme, normalizeHolidayMonthMap, studioThemeCss, normalizeStudioTheme } from '../worker/src/worker.mjs';
import { checkPasswordRule, nextLockState, lockStatus } from '../worker/src/account-lock.mjs';
import { sniffImageType } from '../worker/src/studio.mjs';

test('12-month holiday table uses Eastern whole months; manual mode unchanged', () => {
  const map = normalizeHolidayMonthMap(['newyear', '', '', '', '', '', '', '', '', 'halloween', 'thanksgiving', 'christmas']);
  assert.equal(map.length, 12);
  // 2026-11-01 03:00Z is still Oct 31 in New York.
  assert.equal(resolveHolidayTheme({ holiday_theme_mode: 'monthly', holiday_month_map: map }, new Date('2026-11-01T03:00:00Z')), 'halloween');
  assert.equal(resolveHolidayTheme({ holiday_theme_mode: 'monthly', holiday_month_map: map }, new Date('2026-11-01T05:00:00Z')), 'thanksgiving');
  assert.equal(resolveHolidayTheme({ holiday_theme: 'july4', holiday_theme_mode: 'manual', holiday_month_map: map }), 'july4');
  assert.equal(normalizeHolidayMonthMap('["bogus"]')[0], '');
});

test('site theme is off by default and only allows hex colors', () => {
  assert.equal(studioThemeCss(''), '');
  assert.equal(studioThemeCss({ active: false, colors: { primary: '#ff0000' } }), '');
  const css = studioThemeCss({ active: true, style: 'modern', colors: { primary: '#FF0000', accent: 'red;}body{x' } });
  assert.match(css, /--efhs-navy:#ff0000/);
  assert.doesNotMatch(css, /body\{x/);
  assert.equal(normalizeStudioTheme({ style: 'nope' }).style, 'classic');
});

test('password rule: 8+, letter, number, capital, special', () => {
  assert.equal(checkPasswordRule('Short1!').ok, false);
  assert.equal(checkPasswordRule('alllower1!').ok, false);
  assert.equal(checkPasswordRule('NoNumber!!').ok, false);
  assert.equal(checkPasswordRule('NoSpecial12').ok, false);
  assert.equal(checkPasswordRule('Good-pass1').ok, true);
});

test('3 fails in 15 min lock 30 min; a second lock inside 24h needs a reset', () => {
  let row = null; const t0 = Date.parse('2026-10-24T12:00:00Z');
  for (let i = 0; i < 3; i += 1) row = nextLockState(row, { now: t0 + i * 1000, ip: '1.2.3.4' });
  let st = lockStatus(row, t0 + 5000);
  assert.equal(st.locked, true);
  assert.equal(lockStatus(row, t0 + 31 * 60 * 1000).locked, false);
  const t1 = t0 + 2 * 60 * 60 * 1000;
  for (let i = 0; i < 3; i += 1) row = nextLockState(row, { now: t1 + i * 1000 });
  st = lockStatus(row, t1 + 10 * 24 * 60 * 60 * 1000);
  assert.equal(st.locked, true);
  assert.equal(st.reset_required, true);
});

test('studio upload sniffs real image bytes', () => {
  assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0])), 'image/png');
  assert.equal(sniffImageType(new TextEncoder().encode('<svg>')), '');
});

test('minutes: 10-day own-edit window, uploaded files admin-only, magic-byte sniff', async () => {
  const { canEditMeetingMinutes, MINUTES_EDIT_WINDOW_HOURS } = await import('../worker/src/worker.mjs');
  const { sniffMinutesFile, MINUTES_UPLOAD_MAX_BYTES } = await import('../worker/src/minutes-files.mjs');
  assert.equal(MINUTES_EDIT_WINDOW_HOURS, 240);
  assert.equal(MINUTES_UPLOAD_MAX_BYTES, 10 * 1024 * 1024);
  const now = new Date('2026-10-24T12:00:00Z');
  const sec = { id: 8, role: 'editor', permissions: ['minutes'] };
  const admin = { id: 1, role: 'admin', permissions: [] };
  const mine = { created_by: 8, created_at: '2026-10-20 12:00:00' };
  assert.equal(canEditMeetingMinutes(sec, mine, now), true);
  assert.equal(canEditMeetingMinutes(sec, { ...mine, created_by: 10 }, now), false);
  assert.equal(canEditMeetingMinutes(sec, { ...mine, created_at: '2026-10-13 12:00:00' }, now), false);
  assert.equal(canEditMeetingMinutes(sec, { ...mine, uploaded_file: { filename: 'a.pdf' } }, now), false);
  assert.equal(canEditMeetingMinutes(admin, { ...mine, uploaded_file: { filename: 'a.pdf' } }, now), true);
  assert.equal(sniffMinutesFile(new TextEncoder().encode('%PDF-1.7'), 'm.pdf').ext, 'pdf');
  assert.equal(sniffMinutesFile(new TextEncoder().encode('%PDF-1.7'), 'm.docx'), null);
  assert.equal(sniffMinutesFile(new Uint8Array([0x50, 0x4b, 3, 4]), 'm.docx').ext, 'docx');
  assert.equal(sniffMinutesFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'm.doc').ext, 'doc');
  assert.equal(sniffMinutesFile(new TextEncoder().encode('<html>'), 'm.pdf'), null);
});
