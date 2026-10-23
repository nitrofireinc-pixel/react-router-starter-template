import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotoVariantPath, publicPhotoVariantUrl, uploadCacheKeysForPhoto } from '../worker/src/worker.mjs';

test('photo variant URLs map to /uploads/<variant>/<file>.webp and parse back', () => {
  const photo = { id: 5, filename: 'a b.jpg', created_at: '2026-10-22T01:02:03.000Z' };
  const url = publicPhotoVariantUrl(photo, 'thumb');
  assert.match(url, /^\/uploads\/thumb\/a%20b\.jpg\.webp\?v=5-/);
  assert.deepEqual(parsePhotoVariantPath(url.split('?')[0]), { variant: 'thumb', filename: 'a b.jpg' });
  assert.equal(publicPhotoVariantUrl(photo, 'huge'), '');
  assert.equal(parsePhotoVariantPath('/uploads/x.jpg'), null);
  assert.equal(parsePhotoVariantPath('/uploads/thumb/../x.webp'), null);
});

test('photo cache purge includes variant keys', () => {
  const keys = uploadCacheKeysForPhoto({ id: 1, filename: 'x.jpg' }).map((r) => r.url);
  assert.ok(keys.some((k) => k.includes('/uploads/thumb/x.jpg.webp')));
  assert.ok(keys.some((k) => k.includes('/uploads/full/x.jpg.webp')));
});
