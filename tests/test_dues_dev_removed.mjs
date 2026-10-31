import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import worker from '../worker/src/worker.mjs';
test('dues-dev is not public', async () => {
  assert.equal(existsSync(new URL('../worker/public/dues-dev.html', import.meta.url)), false);
  assert.doesNotMatch(readFileSync(new URL('../worker/scripts/sync-public.mjs', import.meta.url), 'utf8'), /dues-dev\.html/);
  for (const p of ['/dues-dev.html', '/dues-dev', '/dues-dev/']) {
    const r = await worker.fetch(new Request('https://efhsband.org' + p), {}, { waitUntil() {} });
    assert.equal(r.status, 301); assert.equal(r.headers.get('location'), 'https://efhsband.org/');
  }
});
