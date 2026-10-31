import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('super-admin guide no longer mentions Calendar changed badge', () => {
  const g = readFileSync('assets/downloads/EFHS-Band-Website-CMS-Guide-Super-Admin.html', 'utf8');
  assert.ok(!g.includes('<b>Calendar changed</b>'));
  assert.ok(g.includes('always shows that event’s current date'));
  const js = readFileSync('admin-fundraiser-cards.js', 'utf8');
  assert.ok(!js.includes('Calendar changed'));
});
