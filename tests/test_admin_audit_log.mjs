import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAuditSqlIsAppendOnly,
  auditCategoryFromPath,
  buildAdminAuditExportPdfBase64,
  buildAdminAuditExportText,
  buildAuditSummary,
  canonicalAuditPayload,
  decryptAuditPayload,
  encryptAuditPayload,
  enrichMailAuditMeta,
  isSecurityLogPath,
  redactAuditObject,
  serializeAuditRow,
  sha256Hex,
  shouldAuditAdminApiRequest,
  wrapPdfLine,
} from '../worker/src/admin-audit-log.mjs';

test('shouldAuditAdminApiRequest logs mutations but skips reads and security-log itself', () => {
  assert.equal(shouldAuditAdminApiRequest('/api/admin/pages/home', 'PUT'), true);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/events', 'POST'), true);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/events', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/me', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/security-log', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/security-log.pdf', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/mail', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/events', 'POST'), false);
});

test('security log paths are recognized for mutation blocking', () => {
  assert.equal(isSecurityLogPath('/api/admin/security-log'), true);
  assert.equal(isSecurityLogPath('/api/admin/security-log.pdf'), true);
  assert.equal(isSecurityLogPath('/api/admin/security-log/extra'), true);
  assert.equal(isSecurityLogPath('/api/admin/users'), false);
});

test('audit SQL guard allows insert/select and rejects update/delete', () => {
  assert.equal(assertAuditSqlIsAppendOnly('INSERT INTO admin_audit_log (action) VALUES (?)'), true);
  assert.equal(assertAuditSqlIsAppendOnly('SELECT id FROM admin_audit_log'), true);
  assert.throws(() => assertAuditSqlIsAppendOnly('UPDATE admin_audit_log SET summary = ?'), /append-only/);
  assert.throws(() => assertAuditSqlIsAppendOnly('DELETE FROM admin_audit_log'), /append-only/);
  assert.throws(() => assertAuditSqlIsAppendOnly('DROP TABLE admin_audit_log'), /append-only/);
});

test('redactAuditObject strips passwords and binary payloads', () => {
  const redacted = redactAuditObject({
    username: 'editor@example.com',
    password: 'secret',
    data_base64: 'AAAA',
    nested: { new_password: 'x', title: 'Hello' },
    square_access_token: 'sq0atp-secret',
    access_token: 'also-secret',
  });
  assert.equal(redacted.username, 'editor@example.com');
  assert.equal(redacted.password, '[redacted]');
  assert.equal(redacted.data_base64, '[redacted]');
  assert.equal(redacted.nested.new_password, '[redacted]');
  assert.equal(redacted.nested.title, 'Hello');
  assert.equal(redacted.square_access_token, '[redacted]');
  assert.equal(redacted.access_token, '[redacted]');
});

test('mail audit meta captures subject recipients and body excerpt', () => {
  const meta = enrichMailAuditMeta({
    subject: 'Band update',
    html: '<p>Practice moved to <b>Thursday</b></p>',
    recipients: [{ user_id: 3, email: 'a@example.com' }],
    attachments: [{ filename: 'notes.pdf', size: 1200, type: 'application/pdf' }],
    replyTo: 'sender@example.com',
    results: [{ user_id: 3, email: 'a@example.com', ok: true }],
  });
  assert.equal(meta.subject, 'Band update');
  assert.equal(meta.reply_to, 'sender@example.com');
  assert.match(meta.body_excerpt, /Practice moved to Thursday/);
  assert.equal(meta.recipients[0].email, 'a@example.com');
  assert.equal(meta.attachments[0].filename, 'notes.pdf');
  assert.equal(meta.results[0].ok, true);
});

test('audit helpers categorize paths and build export text', () => {
  assert.equal(auditCategoryFromPath('/api/admin/sponsors/manual'), 'sponsors');
  assert.equal(auditCategoryFromPath('/api/admin/minutes/9'), 'minutes');
  const summary = buildAuditSummary({
    action: 'login',
    method: 'POST',
    path: '/admin/login',
    status: 302,
    actorUsername: 'admin@efhsband.org',
    detail: 'session started',
  });
  assert.match(summary, /admin@efhsband.org: login/);
  const text = buildAdminAuditExportText([
    serializeAuditRow({
      id: 1,
      created_at: '2026-08-13T22:00:00.000Z',
      action: 'login',
      category: 'auth',
      method: 'POST',
      path: '/admin/login',
      status: 302,
      actor_user_id: 1,
      actor_username: 'admin@efhsband.org',
      ip: '1.2.3.4',
      user_agent: 'Test',
      summary: 'login ok',
      meta_json: '{"role":"admin"}',
      payload_sha256: 'abc',
    }),
  ]);
  assert.match(text, /Super Admin only/);
  assert.match(text, /admin@efhsband.org/);
  assert.match(text, /login ok/);
  assert.match(text, /SHA-256/);
});

test('audit payload encrypts with AES-GCM and verifies SHA-256', async () => {
  const env = { EFBAND_SECRET: 'unit-test-secret' };
  const payload = canonicalAuditPayload({
    action: 'login',
    category: 'auth',
    method: 'POST',
    path: '/admin/login',
    status: 302,
    actor_user_id: 1,
    actor_username: 'admin@efhsband.org',
    ip: '1.2.3.4',
    user_agent: 'Test',
    summary: 'login ok',
    meta: { role: 'admin' },
  });
  const digest = await sha256Hex(payload);
  assert.equal(digest.length, 64);
  const ciphertext = await encryptAuditPayload(env, payload);
  assert.match(ciphertext, /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  const decrypted = await decryptAuditPayload(env, ciphertext);
  assert.equal(decrypted, payload);
  assert.equal(await sha256Hex(decrypted), digest);
});

test('security audit log PDF export is a multi-page PDF', () => {
  assert.deepEqual(wrapPdfLine('short'), ['short']);
  assert.equal(wrapPdfLine('x'.repeat(200), 50).length > 1, true);
  const entries = Array.from({ length: 8 }, (_, i) => ({
    created_at: `2026-08-14T0${i}:00:00.000Z`,
    action: 'login',
    category: 'auth',
    method: 'POST',
    path: '/admin/login',
    status: 200,
    actor_username: `user${i}@efhsband.org`,
    actor_user_id: i + 1,
    ip: '1.2.3.4',
    user_agent: 'TestAgent',
    summary: `login ok ${i}`,
    meta: { note: `detail-${i}` },
    payload_sha256: 'a'.repeat(64),
    integrity_ok: true,
  }));
  const pdf = Buffer.from(buildAdminAuditExportPdfBase64(entries), 'base64').toString('latin1');
  assert.match(pdf, /^%PDF-/);
  assert.match(pdf, /Security Audit Log/);
  assert.match(pdf, /user0@efhsband\.org/);
  assert.match(pdf, /login ok 0/);
});
