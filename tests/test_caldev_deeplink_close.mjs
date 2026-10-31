import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const js = readFileSync(new URL('../caldev.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
test('?event= deep-link detail popup has a visible 44px X, Esc and backdrop close', () => {
  assert.match(js, /get\('event'\)/);
  assert.match(js, /class="sponsor-flyin-close caldev-detail-close" data-caldev-close aria-label="Close event details"/);
  assert.match(js, /caldev-detail-backdrop" data-caldev-close/);
  assert.match(js, /event\.key === 'Escape' && state\.selectedId != null/);
  const rule = css.match(/\.caldev-detail-panel \.caldev-detail-close\{[^}]*\}/)[0];
  assert.match(rule, /width:44px;height:44px/);
  assert.match(rule, /color:#002142/);
  assert.doesNotMatch(rule, /color:#fff/);
});
