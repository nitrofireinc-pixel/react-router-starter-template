import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('public calendar JS has no admin/editor notes', () => {
  const js = readFileSync('caldev.js', 'utf8');
  for (const bad of ['View only on the public site', 'Super Admins edit', 'Schedule Board tab', 'Schedule Board events']) {
    assert.ok(!js.includes(bad), bad);
  }
});
