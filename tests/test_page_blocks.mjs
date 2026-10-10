import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { decorateFundraisingPage } from '../worker/src/home-redesign.mjs';
import {
  PAGE_BLOCKS_ENABLED_SLUGS,
  defaultHeroCardFields,
  mergePublicPageBlocks,
  pageBlockFieldDiffs,
  pageBlockLayoutChanged,
  pageBlocksEnabled,
  renderHeroCardHtml,
  sanitizeBlockLink,
  sanitizePageBlock,
  sanitizePageBlockList,
} from '../worker/src/page-blocks.mjs';
import { ensureFundraisingVisualSlot, renderVisualEditorHtml } from '../worker/src/visual-page-editor.mjs';
import { renderAdminSidebarHtml } from '../worker/src/admin-chrome.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('page blocks enable line is fundraising only', () => {
  assert.deepEqual([...PAGE_BLOCKS_ENABLED_SLUGS], ['fundraising']);
  assert.equal(pageBlocksEnabled('fundraising'), true);
  assert.equal(pageBlocksEnabled('join'), false);
  assert.equal(pageBlocksEnabled('home'), false);
});

test('hero card text is escaped and links are https or site-relative', () => {
  const html = renderHeroCardHtml({
    corner_tag: '<img src=x onerror=alert(1)>',
    label: 'Goal',
    title: 'Uniforms & <script>bad</script> Friends',
    body: 'Help the band',
    highlight: '$1',
    button_text: 'Give',
    button_link: 'javascript:alert(1)',
  });
  assert.match(html, /Uniforms &amp; Friends/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /<img /);
  assert.equal(sanitizeBlockLink('https://efhsband.org/give'), 'https://efhsband.org/give');
  assert.equal(sanitizeBlockLink('/boosters.html'), '/boosters.html');
  assert.equal(sanitizeBlockLink('donate'), 'donate');
  assert.equal(sanitizeBlockLink('javascript:alert(1)'), '');
  assert.equal(sanitizeBlockLink('http://evil.example'), '');
  assert.match(renderHeroCardHtml({ ...defaultHeroCardFields(), button_link: 'donate' }), /data-donate-open/);
});

test('layout change is add delete or reorder; field diffs cover hide and edit', () => {
  const mattress = { kind: 'fundraiser', ref_id: 1, hidden: 0, sort_order: 0 };
  const hero = { kind: 'hero', id: 9, title: 'Uniforms', hidden: 0, sort_order: 1 };
  const auction = { kind: 'fundraiser', ref_id: 2, hidden: 0, sort_order: 2 };
  assert.equal(pageBlockLayoutChanged([mattress, hero, auction], [mattress, auction, hero]), true);
  assert.equal(pageBlockLayoutChanged([mattress, hero], [mattress, hero]), false);
  assert.equal(pageBlockLayoutChanged([mattress, hero], [mattress, hero, defaultHeroCardFields()]), true);
  const diffs = pageBlockFieldDiffs(
    [mattress, { ...hero, title: 'Old' }],
    [mattress, { ...hero, title: 'New', hidden: 1 }],
  );
  assert.equal(diffs.some((item) => item.op === 'edit' || item.op === 'hide'), true);
  assert.equal(sanitizePageBlock({ kind: 'hero', title: '<b>Hi</b>', button_link: 'https://ok.example' }).title, 'Hi');
  assert.equal(sanitizePageBlockList([{ kind: 'nope' }, { kind: 'hero', title: 'A' }]).length, 1);
});

test('public fundraising keeps hero and fundraiser cards in one order', () => {
  const html = decorateFundraisingPage(
    '<section class="page-hero"><h1>Fundraising</h1><p data-cms-field="intro">Our fundraising efforts help provide students.</p></section><section class="content"><div class="wrap"><div data-cms-field="body_text"></div></div></section>',
    {
      blocks: mergePublicPageBlocks(
        [
          { kind: 'fundraiser', ref_id: 1, hidden: 0, sort_order: 0 },
          { kind: 'hero', title: 'New marching uniforms', label: 'Fundraising goal', button_text: 'Give toward uniforms', button_link: 'donate', hidden: 0, sort_order: 1 },
          { kind: 'fundraiser', ref_id: 2, hidden: 0, sort_order: 2 },
        ],
        [
          { id: 1, title: 'Mattress Sale', description: 'Fundraiser at Mattress Warehouse', event_date: '2026-10-24', picture_mode: 'date_tile', status: 'approved' },
          { id: 2, title: 'Silent Auction', description: '', event_date: '2026-11-07', picture_mode: 'date_tile', volunteers_needed: 1, status: 'approved' },
        ],
      ),
      cards: [
        { id: 1, title: 'Mattress Sale', description: 'Fundraiser at Mattress Warehouse', event_date: '2026-10-24', picture_mode: 'date_tile', status: 'approved' },
        { id: 2, title: 'Silent Auction', description: '', event_date: '2026-11-07', picture_mode: 'date_tile', volunteers_needed: 1, status: 'approved' },
      ],
    },
  );
  const mattress = html.indexOf('Mattress Sale');
  const hero = html.indexOf('New marching uniforms');
  const auction = html.indexOf('Silent Auction');
  assert.ok(mattress >= 0 && hero > mattress && auction > hero);
  assert.match(html, /fundraising-hero-card/);
  assert.match(html, /Students and parents help needed/);
  assert.match(html, /data-donate-open/);
});

test('fundraising visual drafts get a cards slot when missing', () => {
  const html = ensureFundraisingVisualSlot('<section class="content"><div class="wrap"><div data-cms-field="body_text"></div></div></section>');
  assert.match(html, /data-fundraising-cards/);
  assert.match(html, /data-visual-locked="fundraiser"/);
  assert.equal(ensureFundraisingVisualSlot(html), html);
  const visualJs = readFileSync(join(root, 'admin-visual.js'), 'utf8');
  assert.match(visualJs, /function ensureFundraisingSlotHtml/);
  assert.match(visualJs, /fundraising-cards fundraising-card-list/);
  assert.match(visualJs, /ff-facts/);
  assert.match(html, /fundraising-cards fundraising-card-list/);
});

test('fundraising visual editor has add hero card and sidebar page settings', () => {
  const editor = renderVisualEditorHtml('test', { slug: 'fundraising', title: 'Fundraising', canLayout: true });
  assert.match(editor, /data-visual-add-callout/);
  assert.match(editor, /data-visual-add-hero>\+ Add hero card/);
  assert.doesNotMatch(renderVisualEditorHtml('test', { slug: 'join', canLayout: true }), /data-visual-add-hero/);
  const sidebar = renderAdminSidebarHtml('test', { allow: (tab) => tab === 'page-settings' || tab === 'pages' });
  assert.match(sidebar, /data-page-settings-menu/);
  assert.match(sidebar, /data-page-settings-link="fundraising">Fundraising/);
  const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
  assert.match(adminJs, /page\.slug !== 'fundraising'/);
  assert.match(adminJs, /bindPageSettingsMenu/);
});
