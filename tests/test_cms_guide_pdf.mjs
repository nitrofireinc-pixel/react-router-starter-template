import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  canAccessWebsiteGuide,
  isCmsWebsiteGuidePath,
  isSuperAdmin,
} from '../worker/src/worker.mjs';

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
  assert.match(admin, /isSuperAdmin\(\) && \['Website Guide'/);
  assert.match(admin, /website-guide-superadmin-20260816/);

  const worker = readFileSync(join(ROOT, 'worker/src/worker.mjs'), 'utf8');
  assert.match(worker, /content-type', 'application\/pdf'/);
  assert.match(worker, /canAccessWebsiteGuide/);
  assert.match(worker, /isCmsWebsiteGuidePath/);
  assert.match(worker, /private, no-store/);
  assert.match(worker, /EFHS-Band-Website-CMS-Guide\.doc[\s\S]*Response\.redirect/);
});

test('Website Guide HTML covers Super Admin topics', () => {
  const html = readFileSync(join(ROOT, 'assets/downloads/EFHS-Band-Website-CMS-Guide.html'), 'utf8');
  assert.match(html, /Super Admins only/i);
  assert.match(html, /Security Audit Log/i);
  assert.match(html, /append-only/i);
  assert.match(html, /AES-256-GCM/);
  assert.match(html, /page:ensembles/);
  assert.match(html, /events:manage/);
  assert.match(html, /Never grantable/i);
  assert.match(html, /Browse by month/);
  assert.match(html, /Meeting Minutes/);
  assert.match(html, /Last login/);
  assert.match(html, /maintenance mode/i);
  assert.match(html, /Notify Me/);
});

test('Website Guide access helpers are Super Admin only', () => {
  const admin = { role: 'admin', permissions: [] };
  const editor = { role: 'editor', permissions: ['users', 'site', 'pages', 'security-log'] };
  assert.equal(isSuperAdmin(admin), true);
  assert.equal(canAccessWebsiteGuide(admin), true);
  assert.equal(canAccessWebsiteGuide(editor), false);
  assert.equal(canAccessWebsiteGuide(null), false);
  assert.equal(isCmsWebsiteGuidePath('/assets/downloads/EFHS-Band-Website-CMS-Guide.pdf'), true);
  assert.equal(isCmsWebsiteGuidePath('/assets/downloads/EFHS-Band-Website-CMS-Guide.html'), true);
  assert.equal(isCmsWebsiteGuidePath('/assets/downloads/EFHS-Band-Website-CMS-Guide'), true);
  assert.equal(isCmsWebsiteGuidePath('/assets/downloads/other.pdf'), false);
});
