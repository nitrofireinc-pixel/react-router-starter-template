import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');

test('site studio can link the selected element and leave for the CMS', () => {
  assert.match(src, /text: current \? 'Edit link' : 'Add link'/);
  assert.match(src, /function normalizeHref/);
  assert.match(src, /function writeHref/);
  assert.match(src, /data-exit-cms/);
  assert.match(src, /href: '\/admin'/);
  assert.match(src, /contextmenu/);
});
