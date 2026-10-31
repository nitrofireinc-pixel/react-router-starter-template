import test from 'node:test';
import assert from 'node:assert/strict';
import { readCachedPublicValue, EDGE_CACHE_SCHEMA } from '../worker/src/d1-read-policy.mjs';
test('edge cache hit is not re-put (TTL does not restart) and keys carry schema', async () => {
  const puts = []; const urls = [];
  globalThis.caches = { default: {
    match: async (req) => { urls.push(req.url); return new Response(JSON.stringify([1, 2])); },
    put: async (req) => { puts.push(req.url); },
  } };
  try {
    const r = await readCachedPublicValue('edge-test-key-' + Date.now());
    assert.equal(r.hit, true);
    assert.deepEqual(r.value, [1, 2]);
    await new Promise((res) => setTimeout(res, 10));
    assert.equal(puts.length, 0);
    assert.ok(urls[0].includes(`/d1-public/${EDGE_CACHE_SCHEMA}/`));
  } finally { delete globalThis.caches; }
});
