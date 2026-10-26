import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../admin-forms.js', import.meta.url), 'utf8');

test('form builder palette can insert a line break', () => {
  assert.match(src, /\['break', '↵', 'Line break'\]/);
  assert.match(src, /'break'\]\.includes\(type\) \? 'full'/);
  assert.match(src, /f\.type === 'break' \? ' fb-break'/);
  assert.match(src, /class: 'full fb-preview-break'/);
  assert.match(src, /Puts the next field on a new line/);
});
