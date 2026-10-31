import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('Studio home has no "Pages waiting to publish" card', () => {
  for (const f of ['worker/src/worker.mjs', 'admin.js', 'admin-home.css']) {
    assert.doesNotMatch(r(f), /sh-drafts|Pages waiting to publish/);
  }
  assert.match(r('worker/src/worker.mjs'), /id="sh-coming"/);
});
