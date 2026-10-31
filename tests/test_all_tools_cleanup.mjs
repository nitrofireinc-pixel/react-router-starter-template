import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderAdminSidebarHtml, buildAdminNavModel } from '../worker/src/admin-chrome.mjs';

const allow = () => true;
test('plan 2.30: no All tools grid, Website Guide in Account menu for Super Admin only', () => {
  const worker = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /id="dashboard-cards"/);
  assert.doesNotMatch(admin, /#dashboard-cards|dash-card/);
  const sa = renderAdminSidebarHtml('v', { user: { role: 'admin', display_name: 'Sam' }, allow });
  const ed = renderAdminSidebarHtml('v', { user: { role: 'editor', display_name: 'Ed' }, allow });
  assert.match(sa, /data-website-guide href="\/api\/admin\/website-guide\.pdf[^"]*" download="EFHS-Band-Website-CMS-Guide-Super-Admin\.pdf">Website Guide \(PDF\)/);
  assert.doesNotMatch(ed, /website-guide/);
});
test('plan 2.30: Older forms and Users (classic) dropped; Schedule Board goes to Events', () => {
  const html = renderAdminSidebarHtml('v', { user: { role: 'admin', display_name: 'Sam' }, allow });
  assert.doesNotMatch(html, /Older forms|Users \(classic\)/);
  const keys = buildAdminNavModel({ user: { role: 'admin' }, allow }).sections.flatMap((s) => s.items.map((i) => i.key));
  assert.ok(!keys.includes('forms') && !keys.includes('users'));
  const admin = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  assert.match(admin, /if \(name === 'caldev'\) \{\n    window\.location\.assign\('\/admin\/events-manager'\)/);
});
