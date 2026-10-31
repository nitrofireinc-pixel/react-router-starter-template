import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const w = fs.readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
const a = fs.readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
const s = fs.readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');
const c = fs.readFileSync(new URL('../admin-studio.css', import.meta.url), 'utf8');
test('purge only trashed pages, needs confirm, refuses protected', () => {
  assert.match(w, /export function purgePageStatements/);
  assert.match(w, /retired_at IS NOT NULL/);
  const i = w.indexOf('/purge'); const seg = w.slice(i, i + 2500);
  assert.match(seg, /confirm/); assert.match(seg, /isProtectedCmsPage/);
  assert.match(a, /data-page-purge/); assert.match(a, /forever\?/);
});
test('blank slug derives from title or errors', () => {
  assert.match(a, /Give the page a title \(or a web address\) before saving/);
});
test('publish clears stale save timer; mobile top bar short pill', () => {
  assert.match(s, /saveTimer = 0/); assert.match(s, /st-pill-short/);
  assert.match(c, /\.st-pill-full\{display:none\}\.st-pill-short\{display:inline\}/);
});
