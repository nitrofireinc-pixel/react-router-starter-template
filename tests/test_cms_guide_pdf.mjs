import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('CMS Website Guide ships as a real PDF download', () => {
  const pdfPath = join(ROOT, 'assets/downloads/EFHS-Band-Website-CMS-Guide.pdf');
  const htmlPath = join(ROOT, 'assets/downloads/EFHS-Band-Website-CMS-Guide.html');
  const legacyDoc = join(ROOT, 'assets/downloads/EFHS-Band-Website-CMS-Guide.doc');
  assert.equal(existsSync(pdfPath), true, 'PDF guide missing');
  assert.equal(existsSync(htmlPath), true, 'HTML source missing');
  assert.equal(existsSync(legacyDoc), false, 'legacy .doc guide should be removed');

  const pdf = readFileSync(pdfPath);
  assert.equal(pdf.subarray(0, 5).toString('utf8'), '%PDF-');
  assert.ok(pdf.byteLength > 50_000, 'PDF looks too small');

  const admin = readFileSync(join(ROOT, 'admin.js'), 'utf8');
  assert.match(admin, /EFHS-Band-Website-CMS-Guide\.pdf/);
  assert.doesNotMatch(admin, /EFHS-Band-Website-CMS-Guide\.doc/);

  const worker = readFileSync(join(ROOT, 'worker/src/worker.mjs'), 'utf8');
  assert.match(worker, /content-type', 'application\/pdf'/);
  assert.match(worker, /EFHS-Band-Website-CMS-Guide\.doc[\s\S]*Response\.redirect/);
});
