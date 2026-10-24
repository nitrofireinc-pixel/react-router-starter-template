import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validateLayout, renderLayout, isContentOnlyChange, comingSoonLayout, textSkeleton,
  studioTableStatements, STUDIO_CMS_PAGE_COLUMNS, ensureStudioSchema, resetStudioSchemaMemo,
  STUDIO_SCHEMA_KEY, renderRichText, handleStudioApi,
} from '../worker/src/studio.mjs';
import { comingSoonPageHtml, injectComingSoonLogos } from '../worker/src/home-redesign.mjs';
import { DB_SCHEMA_VERSION } from '../worker/src/worker.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));

test('Studio does not bump the main schema version (audit schema never re-runs)', () => {
  assert.equal(DB_SCHEMA_VERSION, '2026-10-04.8');
});

test('Studio schema is additive and never touches audit tables', () => {
  const all = [...studioTableStatements(), ...STUDIO_CMS_PAGE_COLUMNS.map(([, sql]) => sql),
    readFileSync(new URL('../migrations/2026-10-24.s1-studio.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')].join('\n');
  assert.doesNotMatch(all, /\b(DROP|DELETE|RENAME|UPDATE|TRIGGER)\b/i);
  assert.doesNotMatch(all, /audit/i);
});

test('coming-soon layout validates and matches the legacy page text', () => {
  const layout = comingSoonLayout({ mark: '/assets/efhs-blue-regiment-mark.png' });
  assert.deepEqual(validateLayout(layout), { ok: true, errors: [] });
  const legacy = injectComingSoonLogos(comingSoonPageHtml({ title: 'Coming soon', heading: 'Coming soon', intro: 'This page is on the way. Check back soon, or contact the band office.' }));
  assert.equal(textSkeleton(renderLayout(layout)), textSkeleton(legacy));
});

test('overlapping blocks, bad links and out-of-grid blocks are rejected', () => {
  const layout = comingSoonLayout();
  const bad = clone(layout);
  bad.sections[0].blocks[1].y = 1; // overlaps logos (h=2)
  assert.match(validateLayout(bad).errors.join(), /overlaps logos/);
  const wide = clone(layout); wide.sections[1].blocks[0].x = 6;
  assert.match(validateLayout(wide).errors.join(), /past column/);
  const js = clone(layout); js.sections[1].blocks[1].props.href = 'javascript:alert(1)';
  assert.equal(validateLayout(js).ok, false);
});

test('html block is Super Admin only and rich text never passes raw HTML', () => {
  const layout = comingSoonLayout();
  layout.sections[1].blocks.push({ id: 'raw', type: 'html', x: 0, y: 2, w: 12, h: 1, props: { html: '<b>x</b>' } });
  assert.equal(validateLayout(layout).ok, false);
  assert.equal(validateLayout(layout, { allowHtml: true }).ok, true);
  assert.equal(renderRichText({ paragraphs: [[{ text: '<script>x</script>' }]] }), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
});

test('content-only diff: words may change, positions may not', () => {
  const a = comingSoonLayout();
  const words = clone(a); words.sections[0].blocks[2].props.text = 'Join us';
  assert.equal(isContentOnlyChange(a, words), true);
  const moved = clone(a); moved.sections[1].blocks[1].w = 6;
  assert.equal(isContentOnlyChange(a, moved), false);
  const added = clone(a); added.sections[1].blocks.push({ id: 'n', type: 'divider', x: 0, y: 3, w: 12, h: 1 });
  assert.equal(isContentOnlyChange(a, added), false);
});

function fakeDb({ version = null, columns = ['id', 'slug'] } = {}) {
  const ran = [];
  return {
    ran,
    prepare(sql) {
      return {
        sql,
        bind() { return this; },
        async first() { return sql.includes('site_content') ? (version ? { value: version } : null) : null; },
        async all() { return { results: sql.startsWith('PRAGMA') ? columns.map((name) => ({ name })) : [] }; },
        async run() { ran.push(sql); return {}; },
      };
    },
    async batch(stmts) { ran.push(...stmts.map((s) => s.sql)); return []; },
  };
}

test('ensureStudioSchema runs once, skips existing columns, uses its own key', async () => {
  resetStudioSchemaMemo();
  const db = fakeDb({ columns: ['id', 'slug', 'editor'] });
  await ensureStudioSchema({ DB: db });
  assert.ok(!db.ran.some((s) => /ADD COLUMN editor/.test(s)));
  assert.ok(db.ran.some((s) => /ADD COLUMN live_version_id/.test(s)));
  assert.ok(db.ran.some((s) => s.includes('site_content')));
  assert.equal(STUDIO_SCHEMA_KEY, 'studio_schema_version');
  const before = db.ran.length;
  await ensureStudioSchema({ DB: db });
  assert.equal(db.ran.length, before);
  resetStudioSchemaMemo();
});

test('Studio API: content editors cannot change layout or flip the flag', async () => {
  resetStudioSchemaMemo();
  const live = comingSoonLayout();
  const db = {
    prepare(sql) {
      return {
        sql, bind() { return this; },
        async first() {
          if (sql.includes('site_content')) return { value: '2026-10-24.s1' };
          if (sql.startsWith('SELECT slug, editor')) return { slug: 'coming-soon', editor: 'legacy', live_version_id: null };
          if (sql.includes('FROM page_drafts')) return { layout_json: JSON.stringify(live) };
          return null;
        },
        async all() { return { results: [] }; }, async run() { return {}; },
      };
    },
    async batch() { return []; },
  };
  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const deps = (user) => ({
    requireLogin: async () => ({ user }), jsonResponse,
    canEditPageContent: () => true,
    canEditPageLayout: () => user.role === 'admin',
    isSuperAdmin: (u) => u.role === 'admin',
  });
  const editor = { id: 2, username: 'e@x.org', role: 'user' };
  const req = (path, body) => new Request(`https://x${path}`, { method: 'POST', body: JSON.stringify(body) });
  const moved = clone(live); moved.sections[1].blocks[1].w = 6;
  let r = await handleStudioApi(req('/api/admin/studio/pages/coming-soon/publish', { layout: moved }), { DB: db }, new URL('https://x/api/admin/studio/pages/coming-soon/publish'), deps(editor));
  assert.equal(r.status, 403);
  r = await handleStudioApi(req('/api/admin/studio/pages/coming-soon/editor', { editor: 'v2' }), { DB: db }, new URL('https://x/api/admin/studio/pages/coming-soon/editor'), deps(editor));
  assert.equal(r.status, 403);
  r = await handleStudioApi(req('/api/admin/studio/pages/coming-soon/editor', { editor: 'v2' }), { DB: db }, new URL('https://x/api/admin/studio/pages/coming-soon/editor'), deps({ id: 1, role: 'admin' }));
  assert.equal(r.status, 409); // must publish first
  resetStudioSchemaMemo();
});
