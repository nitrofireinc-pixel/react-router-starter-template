import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOLIDAY_THEMES, normalizeHolidayTheme, renderHolidayThemesFieldset } from '../worker/src/worker.mjs';

const KEYS = ['halloween', 'newyear', 'mlk', 'presidents', 'valentines', 'stpatricks', 'easter', 'memorial', 'juneteenth', 'july4', 'labor', 'indigenous', 'veterans', 'thanksgiving', 'hanukkah', 'winter', 'christmas'];

test('every holiday theme key is accepted and listed in the CMS box', () => {
  assert.deepEqual(HOLIDAY_THEMES.map((t) => t.key).sort(), [...KEYS].sort());
  const html = renderHolidayThemesFieldset();
  for (const key of KEYS) {
    assert.equal(normalizeHolidayTheme(key), key);
    assert.equal(normalizeHolidayTheme(` ${key.toUpperCase()} `), key);
    assert.match(html, new RegExp(`data-holiday-theme="${key}"`));
  }
});

test('unknown holiday theme keys are rejected', () => {
  for (const bad of ['xmas', 'halloween2', '<script>', 'constructor', '__proto__', 'toString', null, undefined, '']) {
    assert.equal(normalizeHolidayTheme(bad), '');
  }
});

test('public site-content mounts every non-halloween key and makes no external requests', () => {
  const src = readFileSync(new URL('../site-content.js', import.meta.url), 'utf8');
  assert.match(src, /halloween: mountHalloweenOverlay, \.\.\.EFHS_HOLIDAY_MOUNTS/);
  const start = src.indexOf('const HT_INK');
  const block = src.slice(start, src.indexOf('// Holiday themes (site.holiday_theme'));
  assert.ok(start > 0);
  assert.doesNotMatch(block, /fetch\(|https?:\/\/|url\(|<image|<script|import\(/);
  assert.match(block, /pointer-events:none/);
  assert.doesNotMatch(block, /ht-badge/);
  assert.match(block, /ht-corner l[\s\S]*ht-corner r[\s\S]*ht-center/);
  assert.match(block, /prefers-reduced-motion/);
  assert.match(block, /max-width:340px\)\{#\$\{id\}\{display:none/);
  assert.match(block, /@media print/);
});
