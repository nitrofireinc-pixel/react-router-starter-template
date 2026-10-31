import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/worker.mjs';
for (const path of ['/index.html', '/index.html?a=1&b=2', '/index']) {
  test(`${path} 301s to CMS Home keeping the query`, async () => {
    const res = await worker.fetch(new Request('https://efhsband.org' + path), {}, { waitUntil() {} });
    assert.equal(res.status, 301);
    const q = path.includes('?') ? path.slice(path.indexOf('?')) : '';
    assert.equal(res.headers.get('location'), 'https://efhsband.org/' + q);
  });
}
