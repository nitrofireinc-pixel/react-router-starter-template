import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { DB_SCHEMA_VERSION } from '../worker/src/worker.mjs';
import {
  MAIL_ATTACHMENT_TOTAL_BYTES,
  MAIL_MAX_RECIPIENTS,
  MAIL_RATE_DAY,
  MAIL_RATE_HOUR,
  assertMailRecipientCap,
  buildResendEmailPayload,
  bytesToBase64,
  evaluateStaffMailRate,
  normalizeAdminMailPayload,
  normalizeMailAttachments,
  normalizeMailContactPayload,
  staffMailSchemaStatements,
  uniqueMailEmails,
} from '../worker/src/staff-mail.mjs';
import { incrementalSchemaStatements } from '../worker/src/schema-upgrade.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fakeFile(name, contents, type = 'application/octet-stream') {
  const bytes = typeof contents === 'string' ? new TextEncoder().encode(contents) : contents;
  return {
    name,
    size: bytes.byteLength,
    type,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

test('schema version is 2026-10-04.3 and incremental SQL includes mail tables', () => {
  assert.equal(DB_SCHEMA_VERSION, '2026-10-04.3');
  const sql = incrementalSchemaStatements().join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mail_contacts/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mail_messages/);
  const file = readFileSync(join(root, 'migrations/2026-10-04.3.sql'), 'utf8');
  assert.match(file, /mail_contacts/);
  assert.match(file, /mail_messages/);
  assert.doesNotMatch(file, /ALTER TABLE/);
  assert.doesNotMatch(file, /UPDATE admin_audit_log/);
  assert.doesNotMatch(file, /DELETE FROM admin_audit_log/);
});

test('2026-10-04.3.sql can be applied twice', () => {
  const sqlFile = readFileSync(join(root, 'migrations/2026-10-04.3.sql'), 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.exec(sqlFile);
  db.exec(sqlFile);
  const version = db.prepare("SELECT value FROM site_content WHERE key = 'schema_version'").get();
  assert.equal(version.value, '2026-10-04.3');
  const contacts = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mail_contacts'").get();
  assert.equal(contacts.name, 'mail_contacts');
  db.close();
});

test('chunked base64 matches Node Buffer encoding', () => {
  const bytes = Uint8Array.from({ length: 20_000 }, (_, i) => i % 256);
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
});

test('unique mail emails and 50-address cap', () => {
  assert.deepEqual(uniqueMailEmails(['A@x.com', 'a@x.com', 'b@x.com'], ['b@x.com', 'c@x.com']), ['a@x.com', 'b@x.com', 'c@x.com']);
  assert.equal(assertMailRecipientCap(0).ok, false);
  assert.equal(assertMailRecipientCap(MAIL_MAX_RECIPIENTS).ok, true);
  assert.equal(assertMailRecipientCap(MAIL_MAX_RECIPIENTS + 1).ok, false);
});

test('staff mail rate limits', () => {
  assert.equal(evaluateStaffMailRate(0, 0).ok, true);
  assert.equal(evaluateStaffMailRate(MAIL_RATE_HOUR, 0).ok, false);
  assert.equal(evaluateStaffMailRate(0, MAIL_RATE_DAY).ok, false);
  assert.equal(evaluateStaffMailRate(MAIL_RATE_HOUR - 1, MAIL_RATE_DAY - 1).ok, true);
});

test('typed contact payload rejects invalid email', () => {
  assert.equal(normalizeMailContactPayload({ email: 'not-an-email' }).ok, false);
  const ok = normalizeMailContactPayload({ email: ' Pat@EFHSBand.org ', display_name: 'Pat' });
  assert.equal(ok.ok, true);
  assert.equal(ok.email, 'pat@efhsband.org');
});

test('attachments reject txt/csv and enforce 4 MB total', async () => {
  await assert.rejects(
    () => normalizeMailAttachments([fakeFile('notes.txt', 'hello', 'text/plain')]),
    /Unsupported attachment type/,
  );
  const tooBig = new Uint8Array(MAIL_ATTACHMENT_TOTAL_BYTES + 1);
  await assert.rejects(
    () => normalizeMailAttachments([fakeFile('deck.pdf', tooBig, 'application/pdf')]),
    /4 MB total/,
  );
  const ok = await normalizeMailAttachments([fakeFile('flyer.pdf', 'pdf-bytes', 'application/pdf')]);
  assert.equal(ok[0].filename, 'flyer.pdf');
  assert.equal(ok[0].content, bytesToBase64(new TextEncoder().encode('pdf-bytes')));
});

test('Resend payload includes to/cc/bcc and no attachment bytes in empty send', () => {
  const payload = buildResendEmailPayload({
    fromEmail: 'no-reply@efhsband.org',
    fromName: 'East Forsyth Band Boosters',
    replyTo: 'trevor@example.com',
    to: ['one@example.com'],
    cc: ['two@example.com'],
    bcc: ['hidden@example.com'],
    subject: 'Hello',
    text: 'Hi',
    html: '<p>Hi</p>',
  });
  assert.deepEqual(payload.to, ['one@example.com']);
  assert.deepEqual(payload.cc, ['two@example.com']);
  assert.deepEqual(payload.bcc, ['hidden@example.com']);
  assert.equal(payload.reply_to, 'trevor@example.com');
  assert.equal(payload.from.includes('no-reply@efhsband.org'), true);
});

test('normalizeAdminMailPayload drops duplicate addresses across To/Cc/Bcc', () => {
  const mail = normalizeAdminMailPayload({
    subject: 'Hi',
    html: '<p>Hi</p>',
    to: ['a@x.com'],
    cc: ['a@x.com', 'b@x.com'],
    bcc: ['b@x.com', 'c@x.com'],
    sanitizeHtml: (value) => value,
  });
  assert.deepEqual(mail.to, ['a@x.com']);
  assert.deepEqual(mail.cc, ['b@x.com']);
  assert.deepEqual(mail.bcc, ['c@x.com']);
  assert.equal(mail.unique.length, 3);
});

test('admin HTML ships Gmail-style composer copy', () => {
  const src = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
  assert.match(src, /People in To and Cc can see each other/);
  assert.match(src, /4 MB total/);
  assert.match(src, /Drafts stay in this browser only/);
  assert.match(src, /data-mail-field="bcc"/);
  assert.match(src, /id="mail-address-book-list"/);
  assert.doesNotMatch(src, /10 MB total/);
});
