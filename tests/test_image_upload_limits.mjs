import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeMailAttachments } from '../worker/src/worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function fakeFile(name, size, type = 'image/jpeg') {
  return {
    name,
    type,
    size,
    arrayBuffer: async () => new ArrayBuffer(Math.min(size, 8)),
  };
}

test('server keeps 2 MB image max and separate 4 MB mail attachment max', () => {
  const worker = readFileSync(join(ROOT, 'worker/src/worker.mjs'), 'utf8');
  assert.match(worker, /const IMAGE_UPLOAD_MAX_BYTES = 1_900_000;/);
  assert.match(worker, /const IMAGE_UPLOAD_MAX_LABEL = '2 MB';/);
  assert.match(worker, /const MAIL_ATTACHMENT_MAX_BYTES = 4_000_000;/);
  assert.match(worker, /exceeds the 4 MB limit/);
  // Mail attachment path must not reuse the image 1.8/2 MB helpers.
  assert.doesNotMatch(worker, /MAIL_ATTACHMENT_MAX_BYTES = 1_[89]00_000/);
});

test('shared client helper targets 1.8 MB for 2 MB image endpoints', async () => {
  const modUrl = pathToFileURL(join(ROOT, 'image-upload.js')).href;
  await import(modUrl);
  const api = globalThis.EfhsImageUpload;
  assert.ok(api, 'EfhsImageUpload should attach to globalThis');
  assert.equal(api.CLIENT_TARGET_BYTES, 1_800_000);
  assert.equal(api.CLIENT_TARGET_LABEL, '1.8 MB');
  assert.equal(api.SERVER_MAX_BYTES, 1_900_000);
  assert.equal(api.SERVER_MAX_LABEL, '2 MB');
});

test('admin and public upload paths use prepareImageFileForUpload for 2 MB images', () => {
  const admin = readFileSync(join(ROOT, 'admin.js'), 'utf8');
  const site = readFileSync(join(ROOT, 'site-content.js'), 'utf8');
  assert.match(admin, /prepareImageFileForUpload/);
  assert.match(admin, /IMAGE_UPLOAD_CLIENT_TARGET_BYTES/);
  assert.match(admin, /#logo-form/);
  assert.match(admin, /#staff-form/);
  assert.match(admin, /#booster-member-form/);
  assert.match(admin, /#photo-form/);
  assert.match(admin, /sponsor-manual-form/);
  // Staff Email attachments stay on FormData without image 1.8 MB compression.
  assert.match(admin, /payload\.append\('attachments', file\)/);
  assert.equal(admin.includes('prepareImageFileForUpload(attachment'), false);
  assert.match(admin, /Staff Email attachments \(4 MB\) must never use these helpers/);
  const workerSource = readFileSync(join(ROOT, 'worker/src/worker.mjs'), 'utf8');
  assert.match(workerSource, /name="attachments"/);
  assert.match(workerSource, /4 MB each/);
  assert.match(site, /EfhsImageUpload/);
  assert.match(site, /prepareImageFileForUpload/);
  assert.match(site, /Compressing logo to fit/);
});

test('4 MB mail attachments remain allowed and oversize images are rejected separately', async () => {
  const under4 = await normalizeMailAttachments([fakeFile('photo.jpg', 3_500_000)]);
  assert.equal(under4.length, 1);
  await assert.rejects(
    () => normalizeMailAttachments([fakeFile('huge.jpg', 4_500_000)]),
    /4 MB/,
  );
});

test('pages and worker HTML load image-upload.js before consumers', () => {
  const worker = readFileSync(join(ROOT, 'worker/src/worker.mjs'), 'utf8');
  assert.match(worker, /image-upload\.js\?v=\$\{ASSET_VERSION\}"><\/script><script src="\/site-content\.js/);
  assert.match(worker, /image-upload\.js\?v=\$\{ASSET_VERSION\}"><\/script><script src="\/admin\.js/);
  for (const page of ['become-a-sponsor.html', 'sponsors.html', 'index.html']) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    assert.match(html, /image-upload\.js[\s\S]*site-content\.js/);
  }
});
