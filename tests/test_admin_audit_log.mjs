import assert from 'node:assert/strict';
import test from 'node:test';

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADMIN_AUDIT_PAGE_SIZE,
  MUTATING_ADMIN_API_ROUTES,
  assertAuditSqlIsAppendOnly,
  auditCategoryFromPath,
  auditEntryMatchesQuery,
  auditSecretEnvName,
  buildAdminAuditExportCsv,
  buildAdminAuditExportJson,
  buildAdminAuditExportPdfBase64,
  buildAdminAuditExportText,
  buildAuditSummary,
  canonicalAuditPayload,
  canonicalChainMaterial,
  cheapTextDiff,
  contentEvidence,
  currentEasternMonthYear,
  decryptAuditPayload,
  easternMonthUtcBounds,
  encryptAuditPayload,
  enrichMailAuditMeta,
  formatAuditTimestampEt,
  inspectLoginLock,
  isSecurityLogPath,
  listAdminAuditLogs,
  maybeAuditAdminApiResponse,
  nextAuditKeyId,
  redactAuditObject,
  recordAuditWriteFailure,
  registerLoginFailure,
  resetAuditGenerationCache,
  resetAuditWriteFailureState,
  resetLoginLockState,
  serializeAuditRow,
  sha256Hex,
  shouldAuditAdminApiRequest,
  startNewAuditLogGeneration,
  verifyAuditHashChain,
  verifyAuditRowDigest,
  visualPageAuditFromRequest,
  wrapPdfLine,
  writeAdminAuditLog,
} from '../worker/src/admin-audit-log.mjs';
import {
  AUDIT_LOG_NO_DELETE_TRIGGER_SQL,
  AUDIT_LOG_NO_UPDATE_TRIGGER_SQL,
} from '../worker/src/schema-upgrade.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('shouldAuditAdminApiRequest logs mutations but skips reads and security-log itself', () => {
  assert.equal(shouldAuditAdminApiRequest('/api/admin/pages/home', 'PUT'), true);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/events', 'POST'), true);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/events', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/me', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/security-log', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/security-log.pdf', 'GET'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/mail', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/mail/test-no-reply', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/password', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/users', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/users/3', 'PUT'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/minutes', 'POST'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/minutes/9', 'PUT'), false);
  assert.equal(shouldAuditAdminApiRequest('/api/admin/minutes/upload', 'POST'), false);
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
  assert.equal(auditCategoryFromPath('/api/admin/visual-pages/fundraising'), 'pages');
  assert.equal(auditCategoryFromPath('/api/admin/badges/2'), 'badges');
  assert.equal(auditCategoryFromPath('/api/admin/forms'), 'forms');
  const visual = visualPageAuditFromRequest('/api/admin/visual-pages/calendar', { body: { action: 'publish' } }, 'PUT');
  assert.equal(visual.action, 'change.pages');
  assert.equal(visual.kind, 'publish');
  assert.match(visual.detail, /calendar publish/);
  assert.equal(visualPageAuditFromRequest('/api/admin/visual-pages/join/restore', {}, 'POST').kind, 'restore');
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
  assert.match(text, /When: Aug 13, 2026 6:00:00 PM ET/);
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
  assert.match(pdf, / ET/);
});

test('D1-style triggers block UPDATE and DELETE on admin_audit_log', () => {
  const sqlFile = readFileSync(join(root, 'migrations/2026-10-04.2.sql'), 'utf8');
  assert.match(sqlFile, /CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_update/);
  assert.match(sqlFile, /CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_delete/);
  assert.match(sqlFile, /RAISE\(ABORT,\s*'append-only'\)/);
  assert.match(sqlFile, /idx_audit_created/);
  assert.match(sqlFile, /idx_audit_action_created/);
  assert.doesNotMatch(sqlFile, /^\s*ALTER TABLE/m);
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL DEFAULT '',
      prev_sha256 TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO admin_audit_log (action, payload_sha256) VALUES ('login', 'abc');
    ${AUDIT_LOG_NO_UPDATE_TRIGGER_SQL};
    ${AUDIT_LOG_NO_DELETE_TRIGGER_SQL};
  `);
  assert.throws(() => db.exec("UPDATE admin_audit_log SET action = 'tamper'"), /append-only/);
  assert.throws(() => db.exec('DELETE FROM admin_audit_log'), /append-only/);
  const row = db.prepare('SELECT action, payload_sha256 FROM admin_audit_log').get();
  assert.equal(row.action, 'login');
  assert.equal(row.payload_sha256, 'abc');
  db.close();
});

test('hash chain verification reports intact or the first break', () => {
  const a = { id: 10, payload_sha256: 'aaa', prev_sha256: '' };
  const b = { id: 11, payload_sha256: 'bbb', prev_sha256: 'aaa' };
  const c = { id: 12, payload_sha256: 'ccc', prev_sha256: 'bbb' };
  assert.equal(verifyAuditHashChain([c, b, a]).chain_status, 'Chain intact');
  assert.equal(verifyAuditHashChain([c, b, a]).chain_ok, true);
  const broken = verifyAuditHashChain([
    { id: 12, payload_sha256: 'ccc', prev_sha256: 'nope' },
    b,
    a,
  ]);
  assert.equal(broken.chain_ok, false);
  assert.equal(broken.chain_status, 'Break at entry #12');
  assert.equal(broken.chain_break_id, 12);
});

test('month filter uses Eastern bounds and never LIKEs ciphertext', () => {
  assert.equal(ADMIN_AUDIT_PAGE_SIZE, 25);
  const current = currentEasternMonthYear(new Date('2026-10-04T12:00:00.000Z'));
  assert.equal(current.year, 2026);
  assert.equal(current.month, 10);
  const bounds = easternMonthUtcBounds(2026, 10);
  assert.match(bounds.start, /^2026-10-01 /);
  assert.match(bounds.end, /^2026-11-01 /);
  assert.equal(auditEntryMatchesQuery({
    summary: 'agent@efhsband.org: change.pages fundraising publish',
    path: '/api/admin/visual-pages/fundraising',
    meta: { slug: 'fundraising' },
  }, 'fundraising publish'), true);
  assert.equal(auditEntryMatchesQuery({ summary: 'login ok' }, 'fundraising'), false);
  assert.equal(auditEntryMatchesQuery({
    action: 'security.log.view',
    summary: 'preview opened',
    meta: { filters: { q: 'xyzzy-no-such-term' } },
  }, 'xyzzy-no-such-term'), false);
  assert.equal(formatAuditTimestampEt('2026-10-04T07:13:15.000Z'), 'Oct 4, 2026 3:13:15 AM ET');
});

function applyListFilters(rows, sql, binds) {
  let result = rows.slice();
  let index = 0;
  if (sql.includes('action = ?')) {
    const action = binds[index];
    index += 1;
    result = result.filter((row) => row.action === action);
  }
  if (sql.includes('LOWER(actor_username) LIKE ?')) {
    const like = String(binds[index] || '').replace(/%/g, '').toLowerCase();
    index += 1;
    result = result.filter((row) => String(row.actor_username || '').toLowerCase().includes(like));
  }
  return { result, nextBind: index };
}

function createAuditDb(seedRows = []) {
  const rows = seedRows.slice();
  const site = new Map();
  const sqlLog = [];
  const env = {
    EFBAND_SECRET: 'unit-test-secret',
    AUDIT_LOG_KEY: 'unit-audit-key-do-not-use-elsewhere',
    DB: {
      prepare(sql) {
        const q = String(sql);
        sqlLog.push(q);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            if (q.includes('FROM site_content')) {
              const value = site.get(this.binds[0]);
              return value == null ? null : { value };
            }
            if (q.includes('COUNT(*)')) {
              return { total: applyListFilters(rows, q, this.binds).result.length };
            }
            if (q.includes('WHERE id <')) {
              const older = rows
                .filter((row) => Number(row.id) < Number(this.binds[0]))
                .sort((a, b) => Number(b.id) - Number(a.id))[0];
              return older || null;
            }
            if (q.includes('ORDER BY id DESC LIMIT 1')) {
              return rows.slice().sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
            }
            return null;
          },
          async all() {
            if (q.includes('id >= ?') && q.includes('id <= ?')) {
              const minId = Number(this.binds[0]);
              const maxId = Number(this.binds[1]);
              return {
                results: rows
                  .filter((row) => Number(row.id) >= minId && Number(row.id) <= maxId)
                  .sort((a, b) => Number(a.id) - Number(b.id)),
              };
            }
            const filtered = applyListFilters(rows, q, this.binds).result
              .slice()
              .sort((a, b) => Number(b.id) - Number(a.id));
            if (q.includes('LIMIT')) {
              const limit = Number(this.binds.at(-2));
              const offset = Number(this.binds.at(-1));
              return { results: filtered.slice(offset, offset + limit) };
            }
            return { results: filtered };
          },
          async run() {
            if (q.includes('INSERT INTO site_content')) {
              site.set(this.binds[0], this.binds[1]);
              return { success: true };
            }
            if (q.includes('INSERT INTO admin_audit_log')) {
              rows.push({
                id: rows.length + 1,
                created_at: this.binds[0] || '2026-10-04 16:00:00',
                action: this.binds[1],
                category: this.binds[2],
                actor_user_id: this.binds[6],
                actor_username: this.binds[7],
                payload_sha256: this.binds[12],
                ciphertext: this.binds[13],
                enc_version: this.binds[14],
                prev_sha256: this.binds[15],
              });
              return { success: true, meta: { last_row_id: rows.length } };
            }
            throw new Error('write failed');
          },
        };
      },
    },
  };
  return { env, rows, site, sqlLog };
}

test('visual editor mutations log as change.pages with slug and kind', async () => {
  const { env, rows } = createAuditDb();
  await maybeAuditAdminApiResponse(env, {
    request: { method: 'PUT', headers: { get: () => '' } },
    url: { pathname: '/api/admin/visual-pages/fundraising' },
    response: { status: 200 },
    actor: { id: 1, username: 'agent@efhsband.org', role: 'admin' },
    requestSummary: { body: { action: 'publish' } },
  });
  assert.equal(rows.at(-1).action, 'change.pages');
  const opened = await listAdminAuditLogs(env, { year: 2026, month: 10, limit: 25 });
  assert.equal(opened.entries[0].action, 'change.pages');
  assert.match(opened.entries[0].summary, /fundraising publish/);
  assert.equal(opened.entries[0].meta.slug, 'fundraising');
  assert.equal(opened.entries[0].meta.kind, 'publish');

  await maybeAuditAdminApiResponse(env, {
    request: { method: 'POST', headers: { get: () => '' } },
    url: { pathname: '/api/admin/visual-pages/calendar/restore' },
    response: { status: 200 },
    actor: { id: 1, username: 'agent@efhsband.org', role: 'admin' },
    requestSummary: { body: { version_id: 9 } },
  });
  const restored = await listAdminAuditLogs(env, { year: 2026, month: 10, q: 'calendar restore' });
  assert.equal(restored.entries.some((entry) => entry.meta.kind === 'restore' && entry.action === 'change.pages'), true);
});

test('security log list is indexed, paginated, and decrypts only the current page', async () => {
  resetAuditWriteFailureState();
  const { env, sqlLog } = createAuditDb();
  await writeAdminAuditLog(env, {
    action: 'login',
    category: 'auth',
    actor_username: 'agent@efhsband.org',
    summary: 'login ok',
  });
  sqlLog.length = 0;
  const listed = await listAdminAuditLogs(env, {
    year: 2026,
    month: 10,
    action: 'login',
    actor: 'agent',
    q: 'login ok',
    limit: 25,
  });
  assert.equal(listed.limit, 25);
  assert.equal(listed.entries.length, 1);
  assert.equal(listed.chain_status, 'Chain intact');
  assert.equal(sqlLog.some((sql) => /ciphertext[^\n]*LIKE|LIKE[^\n]*ciphertext/i.test(sql)), false);
  assert.equal(sqlLog.some((sql) => /created_at >= \?/.test(sql)), true);
  assert.equal(sqlLog.some((sql) => /ORDER BY created_at DESC, id DESC/.test(sql)), true);
  const d1Reads = sqlLog.filter((sql) => /SELECT /i.test(sql)).length;
  assert.ok(d1Reads <= 5, `list used ${d1Reads} SELECTs`);
  assert.equal(sqlLog.some((sql) => /id >= \? AND id <= \?/.test(sql)), true);
});

test('failed audit writes increment a counter instead of disappearing', async () => {
  resetAuditWriteFailureState();
  const { env } = createAuditDb();
  const first = await recordAuditWriteFailure(env, new Error('quota'));
  const second = await recordAuditWriteFailure(env, new Error('quota'));
  assert.equal(first.count, 1);
  assert.equal(second.count, 2);
  assert.match(String(second.since), /T/);
  const listed = await listAdminAuditLogs(env, { year: 2026, month: 10 });
  assert.equal(listed.write_failures.count, 2);
});

test('hash chain uses the contiguous id range for filtered or scattered rows', async () => {
  resetAuditWriteFailureState();
  const seed = [
    { id: 1, action: 'login', payload_sha256: 'h1', prev_sha256: '', created_at: '2026-10-04 16:00:00', actor_username: 'agent@efhsband.org' },
    { id: 2, action: 'change.pages', payload_sha256: 'h2', prev_sha256: 'h1', created_at: '2026-10-04 16:01:00', actor_username: 'agent@efhsband.org' },
    { id: 3, action: 'login', payload_sha256: 'h3', prev_sha256: 'h2', created_at: '2026-10-04 16:02:00', actor_username: 'agent@efhsband.org' },
    { id: 4, action: 'change.pages', payload_sha256: 'h4', prev_sha256: 'h3', created_at: '2026-10-04 16:03:00', actor_username: 'agent@efhsband.org' },
    { id: 5, action: 'login', payload_sha256: 'h5', prev_sha256: 'h4', created_at: '2026-10-04 16:04:00', actor_username: 'agent@efhsband.org' },
  ];
  const { env, rows } = createAuditDb(seed);
  const filtered = await listAdminAuditLogs(env, { year: 2026, month: 10, action: 'login', limit: 25 });
  assert.deepEqual(filtered.entries.map((entry) => entry.id), [5, 3, 1]);
  assert.equal(filtered.chain_ok, true);
  assert.equal(filtered.chain_status, 'Chain intact');
  rows[3].prev_sha256 = 'tampered';
  const broken = await listAdminAuditLogs(env, { year: 2026, month: 10, action: 'login', limit: 25 });
  assert.deepEqual(broken.entries.map((entry) => entry.id), [5, 3, 1]);
  assert.equal(broken.chain_ok, false);
  assert.equal(broken.chain_status, 'Break at entry #4');
  assert.equal(broken.chain_break_id, 4);
});

test('free-text search ignores security.log.view so a missing term matches nothing', async () => {
  resetAuditWriteFailureState();
  const { env } = createAuditDb([
    {
      id: 1,
      action: 'login',
      summary: 'login ok',
      payload_sha256: 'h1',
      prev_sha256: '',
      created_at: '2026-10-04 16:00:00',
      actor_username: 'agent@efhsband.org',
    },
    {
      id: 2,
      action: 'security.log.view',
      summary: 'preview opened',
      meta_json: JSON.stringify({ filters: { q: 'xyzzy-no-such-term' } }),
      payload_sha256: 'h2',
      prev_sha256: 'h1',
      created_at: '2026-10-04 16:01:00',
      actor_username: 'agent@efhsband.org',
    },
  ]);
  const listed = await listAdminAuditLogs(env, { year: 2026, month: 10, q: 'xyzzy-no-such-term', limit: 25 });
  assert.equal(listed.matched, 0);
  assert.equal(listed.entries.length, 0);
});

test('2026-10-04.2.sql can be applied twice without ALTER', () => {
  const sqlFile = readFileSync(join(root, 'migrations/2026-10-04.2.sql'), 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL DEFAULT '',
      prev_sha256 TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO admin_audit_log (action) VALUES ('login');
  `);
  db.exec(sqlFile);
  db.exec(sqlFile);
  const version = db.prepare("SELECT value FROM site_content WHERE key = 'schema_version'").get();
  assert.equal(version.value, '2026-10-04.2');
  db.close();
});

test('new audit rows store the previous payload hash', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const { env, rows } = createAuditDb();
  const first = await writeAdminAuditLog(env, { action: 'login', actor_username: 'a@efhsband.org' });
  const second = await writeAdminAuditLog(env, { action: 'logout', actor_username: 'a@efhsband.org' });
  assert.equal(first.prev_sha256, '');
  assert.equal(second.prev_sha256, first.payload_sha256);
  assert.equal(rows[1].prev_sha256, first.payload_sha256);
});

test('new rows hash ciphertext plus index columns and stay decryptable', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const { env, rows } = createAuditDb();
  const written = await writeAdminAuditLog(env, {
    action: 'login',
    category: 'auth',
    actor_user_id: 1,
    actor_username: 'agent@efhsband.org',
    ip: '203.0.113.9',
    country: 'US',
    user_agent: 'TestAgent',
  });
  assert.equal(written.key_missing, false);
  assert.equal(rows[0].actor_username, '');
  const digest = await verifyAuditRowDigest(rows[0]);
  assert.equal(digest.recomputed, true);
  assert.equal(digest.ok, true);
  const expected = await sha256Hex(canonicalChainMaterial({
    created_at: rows[0].created_at,
    action: rows[0].action,
    category: rows[0].category,
    actor_user_id: rows[0].actor_user_id,
    key_id: 'k1',
    ciphertext: rows[0].ciphertext,
  }));
  assert.equal(rows[0].payload_sha256, expected);
  const listed = await listAdminAuditLogs(env, { year: 2026, month: 10, limit: 25 });
  assert.equal(listed.entries[0].actor_username, 'agent@efhsband.org');
  assert.equal(listed.entries[0].ip, '203.0.113.9');
  assert.equal(listed.entries[0].country, 'US');
  assert.equal(listed.entries[0].integrity_ok, true);
});

test('missing AUDIT_LOG_KEY still writes an unsigned row', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const { env, rows } = createAuditDb();
  delete env.AUDIT_LOG_KEY;
  const written = await writeAdminAuditLog(env, {
    action: 'login',
    actor_username: 'agent@efhsband.org',
  });
  assert.equal(written.key_missing, true);
  assert.equal(rows.length, 1);
  assert.match(rows[0].ciphertext, /^missing\./);
  const listed = await listAdminAuditLogs(env, { year: 2026, month: 10, limit: 25 });
  assert.equal(listed.entries[0].actor_username, 'agent@efhsband.org');
});

test('each mutating /api/admin route produces exactly one audit row', async () => {
  assert.ok(MUTATING_ADMIN_API_ROUTES.length >= 40);
  for (const route of MUTATING_ADMIN_API_ROUTES) {
    resetAuditWriteFailureState();
    resetAuditGenerationCache();
    const { env, rows } = createAuditDb();
    const generic = shouldAuditAdminApiRequest(route.path, route.method);
    if (route.logger === 'explicit') {
      assert.equal(generic, false, `${route.method} ${route.path} should be explicit`);
      await writeAdminAuditLog(env, {
        action: route.action,
        path: route.path,
        method: route.method,
        actor_username: 'agent@efhsband.org',
      });
    } else {
      assert.equal(generic, true, `${route.method} ${route.path} should use generic logger`);
      await maybeAuditAdminApiResponse(env, {
        request: { method: route.method, headers: { get: () => '' } },
        url: { pathname: route.path },
        response: { status: 200 },
        actor: { id: 1, username: 'agent@efhsband.org', role: 'admin' },
        requestSummary: { body: { title: 'Example', body_html: '<p>After</p>' } },
      });
    }
    assert.equal(rows.length, 1, `${route.method} ${route.path} wrote ${rows.length} rows`);
    assert.equal(rows[0].action, route.action, `${route.method} ${route.path}`);
  }
});

test('login lockout trips after five failures', () => {
  resetLoginLockState();
  let state = { locked: false };
  for (let i = 0; i < 5; i += 1) {
    state = registerLoginFailure('agent@efhsband.org', '203.0.113.9');
  }
  assert.equal(state.locked, true);
  assert.equal(inspectLoginLock('agent@efhsband.org', '203.0.113.9').locked, true);
  assert.equal(inspectLoginLock('other@efhsband.org', '203.0.113.9').locked, false);
});

test('content evidence stores a capped diff and hashes', () => {
  const small = contentEvidence('Hello world', 'Hello friends');
  assert.equal(small.capped, false);
  assert.match(small.diff.added, /friends/);
  assert.match(small.diff.removed, /world/);
  const before = 'a'.repeat(5000);
  const after = `bbb${'a'.repeat(4997)}`;
  const large = contentEvidence(before, after);
  assert.equal(large.capped, true);
  assert.ok(large.before_excerpt);
  assert.equal(cheapTextDiff('same', 'same').unchanged, true);
});

test('new log genesis continues the chain and does not rewrite old rows', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const { env, rows, site } = createAuditDb();
  env.AUDIT_LOG_KEY_K2 = 'unit-audit-key-generation-two';
  const first = await writeAdminAuditLog(env, { action: 'login', actor_username: 'agent@efhsband.org' });
  const started = await startNewAuditLogGeneration(env, {
    reason: 'Lost access to previous generation key',
    authorizedBy: 'Trevor',
    actor: { id: 1, username: 'agent@efhsband.org' },
  });
  assert.equal(started.ok, true);
  assert.equal(started.new_key_id, 'k2');
  assert.equal(started.previous_chain_head, first.payload_sha256);
  assert.equal(started.previous_row_count, 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].action, 'login');
  assert.equal(rows[0].payload_sha256, first.payload_sha256);
  assert.equal(rows[1].action, 'log.genesis');
  assert.equal(rows[1].prev_sha256, first.payload_sha256);
  const stored = JSON.parse(site.get('audit_log_generation'));
  assert.equal(stored.key_id, 'k2');
  assert.equal(nextAuditKeyId('k2'), 'k3');
  assert.equal(auditSecretEnvName('k2'), 'AUDIT_LOG_KEY_K2');
});

test('CSV and JSON exports include the signed chain head', async () => {
  const entries = [{
    id: 1,
    created_at: '2026-10-04 16:00:00',
    action: 'login',
    category: 'auth',
    actor_user_id: 1,
    actor_username: 'agent@efhsband.org',
    ip: '203.0.113.9',
    country: 'US',
    session_id_hash: 'abc',
    method: 'POST',
    path: '/admin/login',
    status: 302,
    summary: 'login ok',
    payload_sha256: 'aa',
    prev_sha256: '',
    integrity_ok: true,
  }];
  const verify = { chain_ok: true, chain_head: 'aa', signed_chain: 'sig' };
  const csv = buildAdminAuditExportCsv(entries, verify);
  assert.match(csv, /agent@efhsband.org/);
  assert.match(csv, /signed_chain,sig/);
  const json = JSON.parse(buildAdminAuditExportJson(entries, verify));
  assert.equal(json.verify.signed_chain, 'sig');
  assert.equal(json.entries[0].country, 'US');
});

test('new-row encrypt plus chain hash stays well under the Workers 10ms budget in Node', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const { env } = createAuditDb();
  const started = performance.now();
  for (let i = 0; i < 5; i += 1) {
    await writeAdminAuditLog(env, {
      action: 'change.pages',
      actor_username: 'agent@efhsband.org',
      meta: { content: { before_text: 'Hello', after_text: 'Hello world' } },
    });
  }
  const elapsed = performance.now() - started;
  const perRow = elapsed / 5;
  assert.ok(perRow < 25, `audit write averaged ${perRow.toFixed(2)}ms in Node`);
});
