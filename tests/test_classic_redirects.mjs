import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSIC_EDITOR_SLUGS, classicPageRedirectTarget } from '../worker/src/worker.mjs';
import { pageEditorHref } from '../worker/src/admin-chrome.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 3: only In-Kind keeps the classic (settings-only) path', () => {
  assert.deepEqual([...CLASSIC_EDITOR_SLUGS], ['in-kind']);
  for (const slug of ['home', 'letterman-jacket', 'resources', 'ensembles', 'coming-soon', 'fundraising']) {
    assert.equal(classicPageRedirectTarget(slug), `/admin/studio/${slug}`);
    assert.equal(pageEditorHref(slug), `/admin/studio/${slug}`);
  }
  assert.equal(classicPageRedirectTarget('in-kind'), '/admin?tab=pages&page=in-kind');
  assert.equal(pageEditorHref('in-kind'), '/admin?tab=pages&settings=in-kind');
});

test('Phase 3: old visual editor and classic content editor are gone', () => {
  const worker = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  const admin = readFileSync(join(root, 'admin.js'), 'utf8');
  const nav = readFileSync(join(root, 'admin-nav.js'), 'utf8');
  assert.doesNotMatch(worker, /handleVisualEditorPage|renderVisualEditorHtml|'\/api\/admin\/visual-pages\//);
  assert.doesNotMatch(worker, /id="page-preview"|id="rich-text-toolbar"/);
  assert.doesNotMatch(admin, /function bindPageVisualEditor|function buildEditableHomePreview|function insertPhotoIntoPageBody/);
  assert.match(admin, /tab=pages&settings=/);
  assert.doesNotMatch(nav, /'letterman-jacket'\]\.includes/);
  assert.doesNotMatch(nav, /settingsHref: canManage \? `\/admin\?tab=pages&page=/);
});
