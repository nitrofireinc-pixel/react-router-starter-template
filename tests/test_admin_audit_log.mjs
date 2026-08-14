import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditCategoryFromPath,
  buildAdminAuditExportText,
  buildAuditSummary,
  enrichMailAuditMeta,
  redactAuditObject,
  shouldAuditAdminApiRequest,
  serializeAuditRow,
} from '../worker/src/admin-audit-log.mjs';

test('shouldAuditAdminApiRequest logs mutations but skips reads and security-log itself', () => {
  assert.equal(shouldAuditAdminApiRequest('/api/admin/pages/home', 'PUT'), true);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/events', 'POST'), true);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/events', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/me', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/security-log', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/mail', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/events', 'POST'), false);
});

test('redactAuditObject strips passwords and binary payloads', () => {
  const redacted = redactAuditObject({
    username: 'editor@example.com',
    password: 'secret',
    data_base64: 'AAAA',
    nested: { new_password: 'x', title: 'Hello' },
  });
  assert.equal(redacted.username, 'editor@example.com');
  assert.equal(redacted.password, '[redacted]');
  assert.equal(redacted.data_base64, '[redacted]');
  assert.equal(redacted.nested.new_password, '[redacted]');
  assert.equal(redacted.nested.title, 'Hello');
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
    }),
  ]);
  assert.match(text, /Super Admin only/);
  assert.match(text, /admin@efhsband.org/);
  assert.match(text, /login ok/);
});
