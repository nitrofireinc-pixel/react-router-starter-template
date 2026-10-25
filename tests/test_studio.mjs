import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validateLayout, renderLayout, isContentOnlyChange, comingSoonLayout, textSkeleton,
  studioTableStatements, STUDIO_CMS_PAGE_COLUMNS, ensureStudioSchema, resetStudioSchemaMemo,
  STUDIO_SCHEMA_KEY, renderRichText, handleStudioApi, htmlToLayout, STUDIO_EXTRA_COLUMNS,
} from '../worker/src/studio.mjs';
import { comingSoonPageHtml, injectComingSoonLogos } from '../worker/src/home-redesign.mjs';
import { DB_SCHEMA_VERSION } from '../worker/src/worker.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));

test('Studio does not bump the main schema version (audit schema never re-runs)', () => {
  assert.equal(DB_SCHEMA_VERSION, '2026-10-04.8');
});

test('Studio schema is additive and never touches audit tables', () => {
  const all = [...studioTableStatements(), ...STUDIO_CMS_PAGE_COLUMNS.map(([, sql]) => sql),
    ...STUDIO_EXTRA_COLUMNS.map(([, , sql]) => sql),
    ...['s1', 's2'].map((v) => readFileSync(new URL(`../migrations/2026-10-24.${v}-studio.sql`, import.meta.url), 'utf8').replace(/--.*$/gm, ''))].join('\n');
  assert.doesNotMatch(all, /\b(DROP|DELETE|RENAME|UPDATE|TRIGGER)\b/i);
  assert.doesNotMatch(all, /audit/i);
});

test('coming-soon layout validates and matches the legacy page text', () => {
  const layout = comingSoonLayout({ mark: '/assets/efhs-blue-regiment-mark.png' });
  assert.deepEqual(validateLayout(layout), { ok: true, errors: [] });
  const legacy = injectComingSoonLogos(comingSoonPageHtml({ title: 'Coming soon', heading: 'Coming soon', intro: 'This page is on the way. Check back soon, or contact the band office.' }));
  assert.equal(textSkeleton(renderLayout(layout)), textSkeleton(legacy));
  // Byte for byte: logos auto-placed, intro keeps its field tag, button inside the card, no grid wrapper.
  assert.equal(renderLayout(layout), legacy);
});

test('legacy HTML migrates to a layout that renders byte-identical', () => {
  const ctx = { logo: '/assets/efhs-logo.png', mark: '/assets/efhs-blue-regiment-mark.png' };
  const legacy = injectComingSoonLogos(comingSoonPageHtml({ heading: 'Gallery', intro: 'Soon.' }), ctx);
  const layout = htmlToLayout(legacy, ctx);
  assert.equal(validateLayout(layout, { allowHtml: true }).ok, true);
  assert.equal(renderLayout(layout, ctx), legacy);
  assert.ok(layout.sections[0].blocks.some((b) => b.type === 'logos'));
  const odd = '<div class="x">loose</div><section class="content"><div class="wrap"><p>Hi</p></div></section>';
  assert.equal(renderLayout(htmlToLayout(odd)), odd);
});

test('non-admins keep locked migrated html unchanged but cannot edit it', () => {
  const base = htmlToLayout('<section class="content"><div class="wrap"><table><tr><td>1</td></tr></table></div></section>');
  assert.equal(validateLayout(base, { baseline: base }).ok, true);
  const edited = clone(base); edited.sections[0].blocks[0].props.html = '<b>x</b>';
  assert.equal(validateLayout(edited, { baseline: base }).ok, false);
});

test('overlapping blocks, bad links and out-of-grid blocks are rejected', () => {
  const layout = comingSoonLayout();
  const bad = clone(layout);
  bad.sections[0].blocks[1].y = 1; // overlaps logos (h=2)
  assert.match(validateLayout(bad).errors.join(), /overlaps logos/);
  const wide = clone(layout); wide.sections[1].blocks[0].x = 6;
  assert.match(validateLayout(wide).errors.join(), /past column/);
  const js = clone(layout); js.sections[1].blocks[0].props.children[1].props.href = 'javascript:alert(1)';
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
  const moved = clone(a); moved.sections[1].blocks[0].w = 6;
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
          if (sql.startsWith('SELECT slug, path, editor')) return { slug: 'coming-soon', editor: 'legacy', live_version_id: null };
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
  const moved = clone(live); moved.sections[1].blocks[0].w = 6;
  let r = await handleStudioApi(req('/api/admin/studio/pages/coming-soon/publish', { layout: moved }), { DB: db }, new URL('https://x/api/admin/studio/pages/coming-soon/publish'), deps(editor));
  assert.equal(r.status, 403);
  r = await handleStudioApi(req('/api/admin/studio/pages/coming-soon/editor', { editor: 'v2' }), { DB: db }, new URL('https://x/api/admin/studio/pages/coming-soon/editor'), deps(editor));
  assert.equal(r.status, 403);
  r = await handleStudioApi(req('/api/admin/studio/pages/coming-soon/editor', { editor: 'v2' }), { DB: db }, new URL('https://x/api/admin/studio/pages/coming-soon/editor'), deps({ id: 1, role: 'admin' }));
  assert.equal(r.status, 409); // must publish first
  resetStudioSchemaMemo();
});

test('studio editor: undo capped at 3, visible undo/redo + discard, mobile sheets', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../admin-studio.css', import.meta.url), 'utf8');
  const w = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  const st = readFileSync(new URL('../worker/src/studio.mjs', import.meta.url), 'utf8');
  assert.match(js, /const UNDO_CAP = 3;/);
  assert.match(js, /while \(undoStack\.length > UNDO_CAP\) undoStack\.shift\(\)/);
  assert.doesNotMatch(js, /undoStack\.length > 100/);
  assert.match(w, /title="Undo \(up to 3 changes\)/);
  assert.match(w, /class="st-btn st-danger" data-act="discard"[^>]*disabled>/);
  assert.doesNotMatch(w, /<button type="button" data-act="discard">Discard unpublished changes/);
  assert.match(js, /Throw away all unpublished changes and go back to the live page\?/);
  assert.match(js, /call\(`\$\{api\}\/draft`, 'DELETE'\)/);
  assert.match(st, /action === 'draft' && method === 'DELETE'[\s\S]{0,200}DELETE FROM page_drafts WHERE slug = \?/);
  assert.match(css, /@media \(max-width:900px\)\{[\s\S]*\.st-bottom\{display:grid/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(w, /class="st-bottom"[\s\S]*data-sheet="add"[\s\S]*data-sheet="edit"[\s\S]*data-act="preview"[\s\S]*data-sheet="history"/);
});

test('studio desktop panels load collapsed, toggle only via toolbar, no auto-open', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../admin-studio.css', import.meta.url), 'utf8');
  const w = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  assert.match(w, /<body class="studio-app st-lc st-rc"/);
  assert.match(w, /data-panel-toggle="left" aria-pressed="false"/);
  assert.match(w, /data-panel-toggle="right" aria-pressed="false"/);
  assert.match(css, /body\.st-lc \.st-main\{--st-lw:56px\}/);
  assert.match(css, /body\.st-rc \.st-right \[data-inspector\]\{display:none\}/);
  assert.match(js, /localStorage\.setItem\(panelKey\(\)/);
  assert.doesNotMatch(js, /openSheet\('edit'\); revealSelected/);
  assert.doesNotMatch(js, /toast\(`\$\{name\} added`\); openSheet/);
  assert.match(js, /closest\('button\[data-sheet\]'\)/);
});

test('studio mobile: Add sheet (only) closes after adding and reveals the new block', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');
  const fn = js.slice(js.indexOf('function addAfter('), js.indexOf('function addAfter(') + 1600);
  assert.match(fn, /toast\(`\$\{name\} added`\);\n\s*\/\/ Add sheet only[^\n]*\n\s*closeSheet\(\); requestAnimationFrame/);
  assert.doesNotMatch(fn, /openSheet\('edit'\)/);
});

test('studio mobile: compact toolbar (small font, 40px icon squares, flexible page select, short Publish)', () => {
  const css = readFileSync(new URL('../admin-studio.css', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');
  const m = css.slice(css.indexOf('Compact mobile toolbar'));
  assert.match(m, /\.st-ib,\.st-danger,\.st-more>\.st-btn\{height:44px;width:40px/);
  assert.match(m, /\.st-page-pick\{flex:1 1 auto;min-width:0/);
  assert.match(m, /\.st-publish\[data-state="dirty"\]::before\{content:"Publish"/);
  assert.match(js, /pub\.dataset\.state = dirty \? 'dirty' : 'clean'/);
});

test('studio: Move up/down always gives feedback and re-selects + reveals the moved block', () => {
  const js = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');
  const n = js.slice(js.indexOf('function nudge('), js.indexOf('function del('));
  assert.match(n, /Already at the top\./); assert.match(n, /Already at the bottom\./);
  assert.match(n, /selected = b\.id; scrollToSel = true; changed\(\); toast\(msg\); requestAnimationFrame/);
  assert.doesNotMatch(n, /j >= order\.length\) return;/);
  assert.match(n, /swap places with the previous\/next block in reading order/);
});

test('studio mobile: long-press / Move tap picks a block up; vertical touch drag with drop line, cancel and edge auto-scroll', () => {
  const js = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');
  assert.match(js, /lp = setTimeout\(\(\) => \{ lp = null; startPick\(b\.dataset\.scBlock\)/);
  assert.match(js, /\}, 450\);/);
  assert.match(js, /navigator\.vibrate\?\.\(15\)/);
  assert.match(js, /isMobile\(\) && h\.dataset\.scHandle === 'move'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); startPick\(selected\)/);
  assert.match(js, /addEventListener\('touchmove', \(e\) => \{[\s\S]*?if \(pick && dragging\) \{ e\.preventDefault\(\)/);
  assert.match(js, /\{ passive: false \}/);
  assert.match(js, /\.sc-lifted\{opacity:\.5!important/);
  assert.match(js, /body\.sc-picked\{touch-action:none/);
  assert.match(js, /#sc-dropline\{/);
  assert.match(js, /'data-pick-cancel': '', text: 'Cancel'/);
  assert.match(js, /pushed down so nothing overlaps/);
});

test('phones: new pages open Studio with the Add block sheet; adding works on an empty layout', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  const w = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  assert.match(js, /if \(!section\) \{ section = \{ id: 'main'/);
  assert.match(js, /has\('new'\)\) \{ if \(isMobile\(\) && canLayout\(\)\) openSheet\('add'\)/);
  assert.match(admin, /\/admin\/studio\/\$\{encodeURIComponent\(String\(payload\.slug\)/);
  assert.match(w, /data-sheet="add" aria-label="Add block"><span aria-hidden="true">➕<\/span>Add block</);
});
