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
  createAuditExportSession,
  readAuditExportSession,
  advanceAuditExportSession,
  completeAuditExportSession,
  signAuditChainHead,
  attachD1QueryCounter,
  createD1QueryBudget,
  d1QueryCount,
  resetD1QueryBudget,
  classifyAuditLinkRows,
  ADMIN_AUDIT_ENC_VERSION_V3,
  formatAuditGenerationReport,
  buildAuditGenerationCatalog,
  buildAuditExportManifest,
  verifyAdminAuditBatch,
  verifyAdminAuditRange,
  ACCESS_DENIED_THROTTLE_MS,
  ADMIN_AUDIT_KNOWN_ACTIONS,
  classifyAccessDenial,
  decideAccessDeniedWrite,
  inferRequiredPermissionFromPath,
  isProtectedAuditPath,
  isPublicHttpPath,
  maybeAuditAdminApiResponse,
  maybeLogAccessDenial,
  nextAuditKeyId,
  requestAlreadyWroteAudit,
  requiredPermissionFromDetail,
  resetAccessDeniedThrottleState,
  sanitizeAuditPath,
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
  AUDIT_LOG_LINEAR_INSERT_TRIGGER_SQL,
  AUDIT_LOG_NO_DELETE_TRIGGER_SQL,
  AUDIT_LOG_NO_UPDATE_TRIGGER_SQL,
  AUDIT_LOG_PENDING_NO_DELETE_TRIGGER_SQL,
  AUDIT_LOG_PENDING_NO_UPDATE_TRIGGER_SQL,
  AUDIT_LOG_PENDING_TABLE_SQL,
  applyIncrementalSchema,
  listTableColumnNames,
  readAuditLinearTriggerSql,
  linearTriggerAllowsLegacyNull,
  linearTriggerEnforcesCutoverWindow,
} from '../worker/src/schema-upgrade.mjs';
import {
  buildAuditDeviceMeta,
  compactSessionDevice,
  expandSessionDevice,
  formatAuditDeviceSummary,
  parseSecChUa,
  parseUserAgentDevice,
  sanitizeClientDeviceSnapshot,
  shouldRequestAdminClientHints,
} from '../worker/src/audit-device.mjs';
import {
  DB_SCHEMA_VERSION,
  initDb,
  makeSession,
  requireSecurityLogAccess,
  resetDbInitCache,
} from '../worker/src/worker.mjs';

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
  if (sql.includes('actor_user_id = ?') && !sql.includes('IN (')) {
    const id = Number(binds[index]);
    index += 1;
    result = result.filter((row) => Number(row.actor_user_id) === id);
  }
  if (sql.includes('actor_user_id IN (')) {
    const inList = sql.match(/actor_user_id IN \(([^)]+)\)/i)?.[1] || '';
    const inCount = (inList.match(/\?/g) || []).length;
    const ids = new Set(binds.slice(index, index + inCount).map(Number));
    index += inCount;
    const like = String(binds[index] || '').replace(/%/g, '').toLowerCase();
    index += 1;
    result = result.filter((row) => (
      ids.has(Number(row.actor_user_id))
      || String(row.actor_username || '').toLowerCase().includes(like)
    ));
  } else if (sql.includes("LOWER(COALESCE(actor_username")) {
    const like = String(binds[index] || '').replace(/%/g, '').toLowerCase();
    index += 1;
    result = result.filter((row) => String(row.actor_username || '').toLowerCase().includes(like));
  }
  if (sql.includes('id > ?')) {
    const after = Number(binds[index]);
    index += 1;
    result = result.filter((row) => Number(row.id) > after);
  }
  return { result, nextBind: index };
}

function createAuditDb(seedRows = [], { users = [], actorNames = [] } = {}) {
  const rows = seedRows.slice();
  const pending = [];
  const names = actorNames.slice();
  const sessions = [];
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
            if (q.includes('pragma_table_info') || q.includes('PRAGMA table_info')) {
              return null;
            }
            if (q.includes("name = 'admin_audit_log_linear_insert'")) {
              return { sql: 'WHEN ( NEW.prev_id IS NOT NULL' };
            }
            if (q.includes('FROM admin_audit_export_sessions')) {
              const sid = String(this.binds[0] || '');
              const found = sessions.find((row) => row.sid === sid && row.kind === 'complete');
              return found || null;
            }
            if (q.includes('COUNT(*)')) {
              return { total: applyListFilters(rows, q, this.binds).result.length };
            }
            if (q.includes('MIN(id)') && q.includes('MAX(id)')) {
              const ids = rows.map((row) => Number(row.id) || 0);
              return {
                min_id: ids.length ? Math.min(...ids) : 0,
                max_id: ids.length ? Math.max(...ids) : 0,
              };
            }
            if (q.includes('MAX(id)')) {
              const max = rows.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0);
              return { max_id: max };
            }
            if (q.includes('WHERE id = ?') && q.includes('payload_sha256')) {
              return rows.find((row) => Number(row.id) === Number(this.binds[0])) || null;
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
            if (q.includes('FROM site_content')) {
              return {
                results: [...site.entries()].map(([key, value]) => ({ key, value })),
              };
            }
            if (q.includes('pragma_table_info') || q.includes('PRAGMA table_info')) {
              return {
                results: ['id', 'created_at', 'action', 'category', 'payload_sha256', 'ciphertext', 'enc_version', 'prev_sha256', 'prev_id', 'source_pending_id']
                  .map((name) => ({ name })),
              };
            }
            if (q.includes('FROM admin_audit_pending')) {
              const drained = new Set(rows.map((row) => Number(row.source_pending_id)).filter(Boolean));
              const open = pending.filter((row) => !drained.has(Number(row.id)));
              const limit = Number(this.binds[0]) || open.length;
              return { results: open.slice(0, limit) };
            }
            if (q.includes('FROM admin_audit_actor_names')) {
              const like = String(this.binds[0] || '').replace(/%/g, '').toLowerCase();
              return {
                results: names
                  .filter((user) => (
                    String(user.username || '').toLowerCase().includes(like)
                    || String(user.display_name || '').toLowerCase().includes(like)
                  ))
                  .map((user) => ({ id: user.user_id })),
              };
            }
            if (q.includes("action = 'log.genesis'")) {
              return {
                results: rows
                  .filter((row) => row.action === 'log.genesis')
                  .sort((a, b) => Number(a.id) - Number(b.id)),
              };
            }
            if (q.includes('FROM users')) {
              const like = String(this.binds[0] || '').replace(/%/g, '').toLowerCase();
              return {
                results: users.filter((user) => (
                  String(user.username || '').toLowerCase().includes(like)
                  || String(user.display_name || '').toLowerCase().includes(like)
                )),
              };
            }
            if (q.includes('id >= ?') && q.includes('id <= ?')) {
              const minId = Number(this.binds[0]);
              const maxId = Number(this.binds[1]);
              return {
                results: rows
                  .filter((row) => Number(row.id) >= minId && Number(row.id) <= maxId)
                  .sort((a, b) => Number(a.id) - Number(b.id)),
              };
            }
            if (q.includes('WHERE id > ?') && q.includes('ORDER BY id ASC')) {
              const after = Number(this.binds[0]);
              const limit = Number(this.binds[1] ?? this.binds.at(-1));
              return {
                results: rows
                  .filter((row) => Number(row.id) > after)
                  .sort((a, b) => Number(a.id) - Number(b.id))
                  .slice(0, limit),
              };
            }
            const filtered = applyListFilters(rows, q, this.binds).result.slice();
            if (q.includes('ORDER BY id ASC')) {
              filtered.sort((a, b) => Number(a.id) - Number(b.id));
            } else {
              filtered.sort((a, b) => Number(b.id) - Number(a.id));
            }
            if (q.includes('LIMIT') && q.includes('OFFSET')) {
              const limit = Number(this.binds.at(-2));
              const offset = Number(this.binds.at(-1));
              return { results: filtered.slice(offset, offset + limit) };
            }
            if (q.includes('LIMIT')) {
              const limit = Number(this.binds.at(-1));
              return { results: filtered.slice(0, limit) };
            }
            return { results: filtered };
          },
          async run() {
            if (q.includes('INSERT INTO site_content')) {
              site.set(this.binds[0], this.binds[1]);
              return { success: true };
            }
            if (q.includes('INSERT INTO admin_audit_pending')) {
              const row = {
                id: pending.length + 1,
                created_at: this.binds[0],
                action: this.binds[1],
                category: this.binds[2],
                actor_user_id: this.binds[3],
                actor_username: this.binds[4],
                payload_sha256: this.binds[5],
                ciphertext: this.binds[6],
                enc_version: this.binds[7],
                key_id: this.binds[8],
              };
              pending.push(row);
              return { success: true, meta: { last_row_id: row.id } };
            }
            if (q.includes('INSERT INTO admin_audit_export_sessions')) {
              const kindMatch = q.match(/kind\s*,\s*token_hash|\?\s*,\s*\?\s*,\s*\?\s*,\s*\?\s*,\s*'([^']+)'/);
              const kind = q.includes("'complete'") ? 'complete'
                : q.includes("'start'") ? 'start'
                  : (kindMatch?.[1] || this.binds[4]);
              sessions.push({
                id: sessions.length + 1,
                sid: this.binds[0],
                actor_id: this.binds[1],
                format: this.binds[2],
                filters_json: this.binds[3],
                kind,
                token_hash: this.binds[this.binds.length - 1],
              });
              return { success: true, meta: { last_row_id: sessions.length } };
            }
            if (q.includes('INSERT INTO admin_audit_actor_names')) {
              names.push({
                user_id: this.binds[0],
                username: this.binds[1],
                display_name: this.binds[2],
              });
              return { success: true };
            }
            if (q.includes('INSERT INTO admin_audit_log')) {
              const cols = (q.match(/INSERT INTO admin_audit_log\s*\(([^)]+)\)/i)?.[1] || '')
                .split(',')
                .map((part) => part.trim());
              const row = { id: (rows.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1) };
              cols.forEach((col, index) => {
                row[col] = this.binds[index];
              });
              if (row.prev_id == null || row.prev_id === '') {
                throw new Error('audit-chain-fork');
              }
              const maxId = rows.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
              if (maxId && Number(row.prev_id) !== maxId) {
                throw new Error('audit-chain-fork');
              }
              if (rows.some((item) => Number(item.prev_id) === Number(row.prev_id))) {
                throw new Error('UNIQUE constraint failed: admin_audit_log.prev_id');
              }
              if (row.source_pending_id != null && rows.some((item) => Number(item.source_pending_id) === Number(row.source_pending_id))) {
                throw new Error('UNIQUE constraint failed: admin_audit_log.source_pending_id');
              }
              rows.push(row);
              return { success: true, meta: { last_row_id: row.id } };
            }
            throw new Error('write failed');
          },
        };
      },
    },
  };
  return { env, rows, pending, names, sessions, site, sqlLog };
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
  assert.match(listed.chain_status, /this page/i);
  assert.equal(listed.chain_ok, null);
  assert.equal(sqlLog.some((sql) => /ciphertext[^\n]*LIKE|LIKE[^\n]*ciphertext/i.test(sql)), false);
  assert.equal(sqlLog.some((sql) => /created_at >= \?/.test(sql)), true);
  assert.equal(sqlLog.some((sql) => /ORDER BY created_at DESC, id DESC/.test(sql)), true);
  const d1Reads = sqlLog.filter((sql) => /SELECT /i.test(sql)).length;
  assert.ok(d1Reads <= 5, `list used ${d1Reads} SELECTs`);
  assert.equal(sqlLog.some((sql) => /id >= \? AND id <= \?/.test(sql)), false);
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
    { id: 1, action: 'login', payload_sha256: 'h1', prev_sha256: '', prev_id: 0, created_at: '2026-10-04 16:00:00', actor_username: 'agent@efhsband.org' },
    { id: 2, action: 'change.pages', payload_sha256: 'h2', prev_sha256: 'h1', prev_id: 1, created_at: '2026-10-04 16:01:00', actor_username: 'agent@efhsband.org' },
    { id: 3, action: 'login', payload_sha256: 'h3', prev_sha256: 'h2', prev_id: 2, created_at: '2026-10-04 16:02:00', actor_username: 'agent@efhsband.org' },
    { id: 4, action: 'change.pages', payload_sha256: 'h4', prev_sha256: 'h3', prev_id: 3, created_at: '2026-10-04 16:03:00', actor_username: 'agent@efhsband.org' },
    { id: 5, action: 'login', payload_sha256: 'h5', prev_sha256: 'h4', prev_id: 4, created_at: '2026-10-04 16:04:00', actor_username: 'agent@efhsband.org' },
  ];
  const { env, rows } = createAuditDb(seed);
  const filtered = await listAdminAuditLogs(env, { year: 2026, month: 10, action: 'login', limit: 25 });
  assert.deepEqual(filtered.entries.map((entry) => entry.id), [5, 3, 1]);
  assert.match(filtered.chain_status, /this page/i);
  assert.equal(filtered.chain_ok, null);
  const whole = await verifyAdminAuditRange(env, {});
  assert.equal(whole.chain_ok, true);
  rows[3].prev_sha256 = 'tampered';
  const brokenList = await listAdminAuditLogs(env, { year: 2026, month: 10, action: 'login', limit: 25 });
  assert.deepEqual(brokenList.entries.map((entry) => entry.id), [5, 3, 1]);
  assert.match(brokenList.chain_status, /this page/i);
  rows[4].prev_sha256 = 'also-bad';
  const broken = await verifyAdminAuditBatch(env, { after_id: 0, limit: 100 });
  assert.equal(broken.chain_ok, false);
  assert.match(broken.chain_status, /#4/);
  assert.match(broken.chain_status, /#5/);
  assert.deepEqual(broken.chain_break_ids, [4, 5]);
  assert.equal(broken.done, true);
  assert.equal(broken.chain_head_id, 5);
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
  assert.equal(rows[0].actor_username, 'agent@efhsband.org');
  const digest = await verifyAuditRowDigest(rows[0]);
  assert.equal(digest.recomputed, true);
  assert.equal(digest.ok, true);
  const expected = await sha256Hex(canonicalChainMaterial({
    created_at: rows[0].created_at,
    action: rows[0].action,
    category: rows[0].category,
    actor_user_id: rows[0].actor_user_id,
    actor_username: rows[0].actor_username,
    key_id: 'k1',
    ciphertext: rows[0].ciphertext,
    prev_id: rows[0].prev_id,
    prev_sha256: rows[0].prev_sha256,
    enc_version: 3,
  }, 3));
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
  assert.match(csv, /client_screen,client_viewport,client_dpr,client_tz,client_language,client_platform/);
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

test('access-denied helpers classify protected 401/403 and skip public 404s', () => {
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('access.denied'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('access.unauthenticated'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('security.log.export.start'));
  assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes('security.log.export.complete'));
  assert.equal(sanitizeAuditPath('/api/admin/users?token=secret#frag'), '/api/admin/users');
  assert.equal(sanitizeAuditPath('https://efhsband.org/admin/visual/home?next=/admin'), '/admin/visual/home');
  assert.equal(isProtectedAuditPath('/admin'), true);
  assert.equal(isProtectedAuditPath('/admin/login'), false);
  assert.equal(isProtectedAuditPath('/api/admin/minutes/3'), true);
  assert.equal(isPublicHttpPath('/ensembles.html'), true);
  assert.equal(isPublicHttpPath('/api/site'), true);
  assert.equal(requiredPermissionFromDetail('Permission required: layout:home'), 'layout:home');
  assert.equal(requiredPermissionFromDetail('Only Super Admins can change maintenance mode.'), 'maintenance');
  assert.equal(requiredPermissionFromDetail('Security log is Super Admin only'), 'security-log');
  assert.equal(inferRequiredPermissionFromPath('/api/admin/badges'), 'badges');
  assert.equal(
    inferRequiredPermissionFromPath('/admin', { url: 'https://efhsband.org/admin?tab=badge-creator' }),
    'badges',
  );
  assert.equal(classifyAccessDenial({
    status: 404,
    method: 'GET',
    path: '/missing-page',
  }), null);
  assert.equal(classifyAccessDenial({
    status: 403,
    method: 'POST',
    path: '/api/contact',
    detail: 'Permission required: contact',
  }), null);
  assert.equal(classifyAccessDenial({
    status: 401,
    method: 'GET',
    path: '/admin/login',
  }), null);
  assert.deepEqual(classifyAccessDenial({
    status: 403,
    method: 'PUT',
    path: '/api/admin/users/3?next=1',
    detail: 'Permission required: users',
  }), {
    action: 'access.denied',
    category: 'security',
    required: 'users',
  });
  assert.deepEqual(classifyAccessDenial({
    status: 401,
    method: 'GET',
    path: '/api/admin/me',
    detail: 'Login required',
  }), {
    action: 'access.unauthenticated',
    category: 'security',
    required: '',
  });
  assert.deepEqual(classifyAccessDenial({
    status: 303,
    method: 'GET',
    path: '/admin',
    location: '/admin/login',
  }), {
    action: 'access.unauthenticated',
    category: 'security',
    required: '',
  });
  assert.deepEqual(classifyAccessDenial({
    status: 401,
    method: 'POST',
    path: '/admin/login',
  }), {
    action: 'login.failed',
    category: 'auth',
    required: '',
  });
  assert.deepEqual(classifyAccessDenial({
    status: 429,
    method: 'POST',
    path: '/admin/login',
  }), {
    action: 'login.locked',
    category: 'auth',
    required: '',
  });
});

test('access-denied throttle collapses repeats and appends a summary row', () => {
  const store = new Map();
  const first = decideAccessDeniedWrite(store, {
    ip: '203.0.113.9',
    path: '/api/admin/users?token=secret',
    action: 'access.denied',
    now: 1_000,
  });
  assert.equal(first.write, 'event');
  assert.equal(first.count, 1);
  const second = decideAccessDeniedWrite(store, {
    ip: '203.0.113.9',
    path: '/api/admin/users',
    action: 'access.denied',
    now: 2_000,
  });
  assert.equal(second.write, null);
  assert.equal(second.suppressed, true);
  assert.equal(second.count, 2);
  const later = decideAccessDeniedWrite(store, {
    ip: '203.0.113.9',
    path: '/api/admin/users',
    action: 'access.denied',
    now: 1_000 + ACCESS_DENIED_THROTTLE_MS + 1,
  });
  assert.equal(later.write, 'summary');
  assert.equal(later.count, 3);
  assert.equal(later.prior_count, 2);
  const other = decideAccessDeniedWrite(store, {
    ip: '198.51.100.2',
    path: '/api/admin/users',
    action: 'access.denied',
    now: 1_000,
  });
  assert.equal(other.write, 'event');
  const sameIpOtherUser = decideAccessDeniedWrite(store, {
    ip: '203.0.113.9',
    path: '/api/admin/users',
    action: 'access.denied',
    actor_user_id: 7,
    now: 1_000,
  });
  assert.equal(sameIpOtherUser.write, 'event');
});

function denialRequest(path, {
  method = 'GET',
  ip = '203.0.113.9',
  country = 'US',
  ua = 'Mozilla/5.0 TestAgent',
} = {}) {
  return new Request(`https://efhsband.org${path}`, {
    method,
    headers: {
      'cf-connecting-ip': ip,
      'cf-ipcountry': country,
      'user-agent': ua,
    },
  });
}

test('maybeLogAccessDenial writes one forensic row and skips public 404s', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  resetAccessDeniedThrottleState();
  const { env, rows } = createAuditDb();
  const request = denialRequest('/api/admin/users?token=abc');
  const response = new Response(JSON.stringify({ detail: 'Permission required: users' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
  const first = await maybeLogAccessDenial(env, {
    request,
    url: new URL(request.url),
    response,
    actor: { id: 9, username: 'editor@efhsband.org' },
    session: { session_id_hash: 'a'.repeat(64), username: 'editor@efhsband.org', uid: 9 },
  });
  assert.equal(first.wrote, true);
  assert.equal(first.action, 'access.denied');
  assert.equal(rows.length, 1);
  assert.equal(requestAlreadyWroteAudit(request), true);
  const again = await maybeLogAccessDenial(env, {
    request,
    url: new URL(request.url),
    response,
    actor: { id: 9, username: 'editor@efhsband.org' },
  });
  assert.equal(again, null);
  assert.equal(rows.length, 1);
  const payload = JSON.parse(await decryptAuditPayload(env, rows[0].ciphertext));
  assert.equal(payload.action, 'access.denied');
  assert.equal(payload.category, 'security');
  assert.equal(payload.method, 'GET');
  assert.equal(payload.path, '/api/admin/users');
  assert.equal(payload.status, 403);
  assert.equal(payload.actor_user_id, 9);
  assert.equal(payload.actor_username, 'editor@efhsband.org');
  assert.equal(payload.ip, '203.0.113.9');
  assert.equal(payload.country, 'US');
  assert.equal(payload.user_agent, 'Mozilla/5.0 TestAgent');
  assert.equal(payload.session_id_hash, 'a'.repeat(64));
  assert.equal(payload.meta.required, 'users');
  assert.equal(payload.meta.count, 1);
  assert.match(String(payload.created_at || ''), /^\d{4}-\d{2}-\d{2} /);

  const public404 = denialRequest('/ensembles.html');
  const skipped = await maybeLogAccessDenial(env, {
    request: public404,
    url: new URL(public404.url),
    response: new Response('missing', { status: 404, headers: { 'content-type': 'text/html' } }),
  });
  assert.equal(skipped, null);
  assert.equal(rows.length, 1);

  const publicApi = denialRequest('/api/contact', { method: 'POST' });
  const publicDenied = await maybeLogAccessDenial(env, {
    request: publicApi,
    url: new URL(publicApi.url),
    response: new Response(JSON.stringify({ detail: 'Permission required: contact' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }),
  });
  assert.equal(publicDenied, null);
  assert.equal(rows.length, 1);
});

test('maybeLogAccessDenial throttles failed logins and 401/403 generic audits', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  resetAccessDeniedThrottleState();
  const { env, rows } = createAuditDb();
  const now = Date.now();
  for (let i = 0; i < 3; i += 1) {
    const request = denialRequest('/admin/login', { method: 'POST' });
    const result = await maybeLogAccessDenial(env, {
      request,
      url: new URL(request.url),
      response: new Response('nope', { status: 401, headers: { 'content-type': 'text/html' } }),
      actor: { username: 'guess@efhsband.org' },
      now,
    });
    if (i === 0) {
      assert.equal(result.wrote, true);
      assert.equal(result.action, 'login.failed');
    } else {
      assert.equal(result.wrote, false);
      assert.equal(result.suppressed, true);
    }
  }
  assert.equal(rows.length, 1);
  const loginRow = JSON.parse(await decryptAuditPayload(env, rows[0].ciphertext));
  assert.equal(loginRow.action, 'login.failed');
  assert.equal(loginRow.category, 'auth');
  assert.equal(loginRow.actor_username, 'guess@efhsband.org');
  assert.equal(loginRow.path, '/admin/login');

  const summary = await maybeLogAccessDenial(env, {
    request: denialRequest('/admin/login', { method: 'POST' }),
    url: { pathname: '/admin/login' },
    response: new Response('nope', { status: 401, headers: { 'content-type': 'text/html' } }),
    actor: { username: 'guess@efhsband.org' },
    now: now + ACCESS_DENIED_THROTTLE_MS + 5,
  });
  assert.equal(summary.wrote, true);
  assert.equal(summary.collapsed, true);
  assert.equal(summary.count, 4);
  assert.equal(rows.length, 2);
  const summaryRow = JSON.parse(await decryptAuditPayload(env, rows[1].ciphertext));
  assert.equal(summaryRow.meta.collapsed, true);
  assert.equal(summaryRow.meta.count, 4);

  resetAccessDeniedThrottleState();
  const before = rows.length;
  await maybeAuditAdminApiResponse(env, {
    request: denialRequest('/api/admin/pages/home', { method: 'PUT' }),
    url: { pathname: '/api/admin/pages/home' },
    response: { status: 403, headers: { get: () => '' } },
    actor: { id: 2, username: 'editor@efhsband.org' },
  });
  await maybeAuditAdminApiResponse(env, {
    request: denialRequest('/api/admin/me'),
    url: { pathname: '/api/admin/me' },
    response: { status: 401, headers: { get: () => '' } },
    actor: null,
  });
  assert.equal(rows.length, before);
});

test('unauthenticated admin redirect and HTML 403 log once with required permission', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  resetAccessDeniedThrottleState();
  const { env, rows } = createAuditDb();
  const adminReq = denialRequest('/admin');
  const redirect = new Response(null, { status: 303, headers: { location: '/admin/login' } });
  const unauth = await maybeLogAccessDenial(env, {
    request: adminReq,
    url: new URL(adminReq.url),
    response: redirect,
  });
  assert.equal(unauth.action, 'access.unauthenticated');
  assert.equal(rows.length, 1);

  resetAccessDeniedThrottleState();
  const badgeReq = denialRequest('/admin?tab=badge-creator');
  const html = await maybeLogAccessDenial(env, {
    request: badgeReq,
    url: new URL(badgeReq.url),
    response: new Response('<p>Permission required: badges</p>', {
      status: 403,
      headers: { 'content-type': 'text/html' },
    }),
    actor: { id: 12, username: 'shirl@efhsband.org' },
    session: { session_id_hash: 'b'.repeat(64) },
    forcedDetail: 'Permission required: badges',
  });
  assert.equal(html.action, 'access.denied');
  const badge = JSON.parse(await decryptAuditPayload(env, rows[1].ciphertext));
  assert.equal(badge.meta.required, 'badges');
  assert.equal(badge.path, '/admin');
  assert.equal(badge.session_id_hash, 'b'.repeat(64));
});

test('lightweight UA and client-hint parser stays local and cheap', () => {
  const chromeWin = parseUserAgentDevice(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  );
  assert.equal(chromeWin.os, 'Windows');
  assert.equal(chromeWin.browser, 'Chrome');
  assert.equal(chromeWin.browser_version, '128.0');
  assert.equal(chromeWin.device_type, 'desktop');

  const safariMac = parseUserAgentDevice(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  );
  assert.equal(safariMac.os, 'macOS');
  assert.equal(safariMac.browser, 'Safari');
  assert.equal(safariMac.device_type, 'desktop');

  const iphone = parseUserAgentDevice(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  );
  assert.equal(iphone.os, 'iOS');
  assert.equal(iphone.os_version, '17.5');
  assert.equal(iphone.device_type, 'mobile');

  const brands = parseSecChUa('"Google Chrome";v="128", "Chromium";v="128", "Not.A/Brand";v="99"');
  const hinted = parseUserAgentDevice(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
    { brands, mobile: false, platform: 'Windows', platformVersion: '15.0.0' },
  );
  assert.equal(hinted.os, 'Windows');
  assert.equal(hinted.os_version, '15.0');
  assert.equal(hinted.browser, 'Google Chrome');
  assert.equal(hinted.device_type, 'desktop');

  const started = performance.now();
  for (let i = 0; i < 200; i += 1) parseUserAgentDevice(chromeWin && 'Mozilla/5.0 Chrome/128.0.0.0');
  assert.ok((performance.now() - started) < 10, 'parser exceeded 10ms for 200 UAs');
});

test('login device snapshot is size-limited and later rows only keep a session ref', () => {
  assert.equal(sanitizeClientDeviceSnapshot('not-json'), null);
  assert.equal(sanitizeClientDeviceSnapshot('x'.repeat(900)), null);
  assert.equal(sanitizeClientDeviceSnapshot({ screen: [0, 0] }), null);
  const clean = sanitizeClientDeviceSnapshot({
    screen: [1920, 1080],
    dpr: 2,
    viewport: [1280, 720],
    tz: 'America/New_York',
    language: 'en-US',
    platform: 'MacIntel',
    extra: 'drop-me',
  });
  assert.deepEqual(clean, {
    screen: '1920x1080',
    viewport: '1280x720',
    dpr: 2,
    tz: 'America/New_York',
    language: 'en-US',
    platform: 'MacIntel',
  });
  const packed = compactSessionDevice(clean);
  assert.deepEqual(expandSessionDevice(packed), clean);
  assert.equal(shouldRequestAdminClientHints('/admin/login'), true);
  assert.equal(shouldRequestAdminClientHints('/'), false);
  assert.equal(shouldRequestAdminClientHints('/api/site'), false);

  const loginDevice = buildAuditDeviceMeta({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    client: clean,
    includeClient: true,
    sessionIdHash: 'c'.repeat(64),
  });
  assert.equal(loginDevice.browser, 'Safari');
  assert.equal(loginDevice.client.screen, '1920x1080');
  const later = buildAuditDeviceMeta({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    client: clean,
    includeClient: false,
    sessionIdHash: 'c'.repeat(64),
  });
  assert.deepEqual(later.client, { ref: 'c'.repeat(64) });
  assert.match(formatAuditDeviceSummary(loginDevice), /Safari/);
  assert.match(formatAuditDeviceSummary(later), /client via session/);
});

test('audit writes encrypt device fields and exports them decoded', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const { env, rows } = createAuditDb();
  const request = new Request('https://efhsband.org/admin/login', {
    method: 'POST',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Google Chrome";v="128", "Chromium";v="128", "Not.A/Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'cf-connecting-ip': '203.0.113.9',
      'cf-ipcountry': 'US',
    },
  });
  await writeAdminAuditLog(env, {
    request,
    action: 'login',
    category: 'auth',
    method: 'POST',
    path: '/admin/login',
    status: 302,
    actor_username: 'agent@efhsband.org',
    user_agent: request.headers.get('user-agent'),
    session_id_hash: 'd'.repeat(64),
    include_device_client: true,
    device_client: {
      screen: [1440, 900],
      dpr: 2,
      viewport: [1200, 800],
      tz: 'America/New_York',
      language: 'en-US',
      platform: 'MacIntel',
    },
  });
  const payload = JSON.parse(await decryptAuditPayload(env, rows[0].ciphertext));
  assert.equal(payload.meta.device.os, 'Windows');
  assert.equal(payload.meta.device.browser, 'Google Chrome');
  assert.equal(payload.meta.device.client.screen, '1440x900');
  assert.equal(payload.meta.device.client.tz, 'America/New_York');
  const listed = {
    ...payload,
    meta: payload.meta,
    user_agent: payload.user_agent,
  };
  const text = buildAdminAuditExportText([listed]);
  assert.match(text, /Device: /);
  assert.match(text, /Google Chrome/);
  const csv = buildAdminAuditExportCsv([{
    ...payload,
    id: 1,
    created_at: payload.created_at,
    integrity_ok: true,
  }]);
  assert.match(csv, /os,os_version,browser/);
  assert.match(csv, /client_screen,client_viewport,client_dpr,client_tz,client_language,client_platform/);
  assert.match(csv, /1440x900/);
  assert.match(csv, /Google Chrome/);
});

test('failed login rows keep the client snapshot and never throw on junk device JSON', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  resetAccessDeniedThrottleState();
  const { env, rows } = createAuditDb();
  const request = denialRequest('/admin/login', { method: 'POST' });
  const result = await maybeLogAccessDenial(env, {
    request,
    url: new URL(request.url),
    response: new Response('nope', { status: 401, headers: { 'content-type': 'text/html' } }),
    actor: { username: 'guess@efhsband.org' },
    deviceClient: sanitizeClientDeviceSnapshot({
      screen: [390, 844],
      dpr: 3,
      viewport: [390, 700],
      tz: 'America/New_York',
      language: 'en-US',
      platform: 'iPhone',
    }),
  });
  assert.equal(result.action, 'login.failed');
  const payload = JSON.parse(await decryptAuditPayload(env, rows[0].ciphertext));
  assert.equal(payload.meta.device.client.screen, '390x844');
  assert.equal(sanitizeClientDeviceSnapshot('{'), null);
  assert.equal(sanitizeClientDeviceSnapshot({ tz: '../etc/passwd' }), null);
});

test('user search filters in SQL before pagination and updates totals', async () => {
  const users = [
    { id: 2, username: 'trevor@efhsband.org', display_name: 'Trevor' },
    { id: 3, username: 'jamie@efhsband.org', display_name: 'Jamie' },
  ];
  const seed = [];
  for (let i = 1; i <= 4; i += 1) {
    seed.push({
      id: i,
      action: 'login',
      actor_user_id: 2,
      actor_username: '',
      created_at: '2026-10-04 16:00:00',
      payload_sha256: `h${i}`,
      prev_sha256: i === 1 ? '' : `h${i - 1}`,
    });
  }
  for (let i = 5; i <= 44; i += 1) {
    seed.push({
      id: i,
      action: 'login',
      actor_user_id: 3,
      actor_username: '',
      created_at: '2026-10-04 16:00:00',
      payload_sha256: `h${i}`,
      prev_sha256: `h${i - 1}`,
    });
  }
  seed.push({
    id: 45,
    action: 'login',
    actor_user_id: 99,
    actor_username: 'gone@efhsband.org',
    created_at: '2026-10-04 16:00:00',
    payload_sha256: 'h45',
    prev_sha256: 'h44',
  });
  const { env, sqlLog } = createAuditDb(seed, { users });
  const unfiltered = await listAdminAuditLogs(env, { year: 2026, month: 10, limit: 25 });
  assert.equal(unfiltered.total, 45);
  assert.equal(unfiltered.entries.some((entry) => entry.actor_user_id === 2), false);
  sqlLog.length = 0;
  const listed = await listAdminAuditLogs(env, {
    year: 2026,
    month: 10,
    actor: 'trevor@efhsband.org',
    limit: 25,
  });
  assert.equal(listed.total, 4);
  assert.equal(listed.entries.length, 4);
  assert.equal(listed.entries.every((entry) => entry.actor_user_id === 2), true);
  assert.equal(sqlLog.some((sql) => /actor_user_id IN/.test(sql)), true);
  const deleted = await listAdminAuditLogs(env, {
    year: 2026,
    month: 10,
    actor: 'gone@efhsband.org',
    limit: 25,
  });
  assert.equal(deleted.total, 1);
  assert.equal(deleted.entries[0].actor_username, 'gone@efhsband.org');
});

test('parallel audit writes form a single linear prev_id chain', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'admin',
      method TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      status INTEGER,
      actor_user_id INTEGER,
      actor_username TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      meta_json TEXT NOT NULL DEFAULT '{}',
      payload_sha256 TEXT NOT NULL DEFAULT '',
      ciphertext TEXT NOT NULL DEFAULT '',
      enc_version INTEGER NOT NULL DEFAULT 1,
      key_id TEXT NOT NULL DEFAULT '',
      prev_sha256 TEXT NOT NULL DEFAULT '',
      prev_id INTEGER,
      source_pending_id INTEGER
    );
    CREATE UNIQUE INDEX idx_audit_prev_id ON admin_audit_log(prev_id) WHERE prev_id IS NOT NULL;
    CREATE UNIQUE INDEX idx_audit_source_pending ON admin_audit_log(source_pending_id) WHERE source_pending_id IS NOT NULL;
    CREATE TABLE site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO site_content (key, value) VALUES ('audit_chain_cutover_id', '0');
    ${AUDIT_LOG_PENDING_TABLE_SQL};
    ${AUDIT_LOG_LINEAR_INSERT_TRIGGER_SQL};
    ${AUDIT_LOG_NO_UPDATE_TRIGGER_SQL};
    ${AUDIT_LOG_NO_DELETE_TRIGGER_SQL};
    ${AUDIT_LOG_PENDING_NO_UPDATE_TRIGGER_SQL};
    ${AUDIT_LOG_PENDING_NO_DELETE_TRIGGER_SQL};
  `);
  const env = {
    EFBAND_SECRET: 'unit-test-secret',
    AUDIT_LOG_KEY: 'unit-audit-key-do-not-use-elsewhere',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            if (String(sql).includes('ORDER BY id DESC LIMIT 1')) {
              await new Promise((resolve) => setImmediate(resolve));
            }
            return stmt.get(...this.binds) || null;
          },
          async all() {
            return { results: stmt.all(...this.binds) };
          },
          async run() {
            try {
              const info = stmt.run(...this.binds);
              return { success: true, meta: { last_row_id: Number(info.lastInsertRowid) } };
            } catch (error) {
              throw new Error(error?.message || String(error));
            }
          },
        };
      },
    },
  };
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => writeAdminAuditLog(env, {
    action: 'login',
    actor_username: `writer${index}@efhsband.org`,
  })));
  assert.equal(results.every(Boolean), true);
  const rows = db.prepare('SELECT id, payload_sha256, prev_sha256, prev_id FROM admin_audit_log ORDER BY id').all();
  const pendingCount = Number(db.prepare('SELECT COUNT(*) AS total FROM admin_audit_pending').get().total) || 0;
  assert.equal(rows.length + pendingCount, 12);
  if (pendingCount) {
    const later = await writeAdminAuditLog(env, { action: 'login', actor_username: 'drainer@efhsband.org' });
    assert.equal(Boolean(later?.id), true);
  }
  const linear = db.prepare('SELECT id, payload_sha256, prev_sha256, prev_id FROM admin_audit_log ORDER BY id').all();
  assert.ok(linear.length >= 12);
  assert.equal(linear.every((row) => row.prev_id != null), true);
  const prevIds = new Set();
  for (let i = 0; i < linear.length; i += 1) {
    if (i === 0) {
      assert.equal(Number(linear[i].prev_id), 0);
      continue;
    }
    assert.equal(linear[i].prev_sha256, linear[i - 1].payload_sha256, `row ${linear[i].id} fork`);
    assert.equal(Number(linear[i].prev_id), Number(linear[i - 1].id));
    assert.equal(prevIds.has(Number(linear[i].prev_id)), false);
    prevIds.add(Number(linear[i].prev_id));
  }
  const verified = await verifyAdminAuditRange(env, {});
  assert.equal(verified.chain_ok, true);
  assert.equal(verified.checked, linear.length);
  db.close();
});

test('verify batches walk the whole chain and list stays cheap', async () => {
  resetAuditWriteFailureState();
  const seed = Array.from({ length: 120 }, (_, index) => ({
    id: index + 1,
    action: 'login',
    actor_username: 'agent@efhsband.org',
    created_at: '2026-10-04 16:00:00',
    payload_sha256: `h${index + 1}`,
    prev_sha256: index === 0 ? '' : `h${index}`,
    prev_id: index === 0 ? 0 : index,
  }));
  const { env, sqlLog } = createAuditDb(seed);
  const listStarted = performance.now();
  const listed = await listAdminAuditLogs(env, { year: 2026, month: 10, limit: 25 });
  const listMs = performance.now() - listStarted;
  assert.equal(listed.entries.length, 25);
  assert.match(listed.chain_status, /this page/i);
  assert.equal(sqlLog.some((sql) => /id >= \? AND id <= \?/.test(sql)), false);

  const first = await verifyAdminAuditBatch(env, { after_id: 0, limit: 100 });
  assert.equal(first.checked, 100);
  assert.equal(first.done, false);
  assert.equal(first.chain_ok, true);
  const second = await verifyAdminAuditBatch(env, {
    after_id: first.next_after_id,
    expected_prev: first.next_expected_prev,
    limit: 100,
  });
  assert.equal(second.checked, 20);
  assert.equal(second.done, true);
  assert.equal(second.chain_ok, true);

  const exportStarted = performance.now();
  const exported = await listAdminAuditLogs(env, {
    year: 2026,
    month: 10,
    after_id: 0,
    order: 'asc',
    limit: 50,
  });
  const exportMs = performance.now() - exportStarted;
  assert.equal(exported.entries.length, 50);
  assert.equal(exported.entries[0].id, 1);

  const writeStarted = performance.now();
  await writeAdminAuditLog(env, { action: 'logout', actor_username: 'agent@efhsband.org' });
  const writeMs = performance.now() - writeStarted;
  console.log(JSON.stringify({
    cpu_ms: {
      list_25: Number(listMs.toFixed(3)),
      verify_batch_100: Number(first.elapsed_ms),
      export_batch_50: Number(exportMs.toFixed(3)),
      audited_write: Number(writeMs.toFixed(3)),
    },
  }));
  assert.ok(listMs < 45, `list took ${listMs.toFixed(2)}ms`);
  assert.ok((first.elapsed_ms || 0) < 10, `verify batch took ${first.elapsed_ms}ms`);
});

test('admin.js verify walks batches and does not double-bind select filters', () => {
  const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
  assert.match(adminJs, /securityLogSelectFilters/);
  assert.match(adminJs, /securityLogTextFilters/);
  assert.match(adminJs, /Checking the whole log/);
  assert.match(adminJs, /This page — not a full-chain verify/);
  assert.match(adminJs, /downloadSecurityLogExport/);
  assert.match(adminJs, /security-log\/export\/start/);
  assert.match(adminJs, /session_id/);
  assert.match(adminJs, /security-log-court/);
  assert.match(adminJs, /Export downloaded and logged/);
  assert.match(adminJs, /\/api\/admin\/security-log\/verify/);
  assert.match(adminJs, /\/api\/admin\/security-log\/export/);
  assert.match(adminJs, /showSavedToast\(finished\.chain_status/);
  assert.match(adminJs, /couldn't be saved since/);
  assert.match(adminJs, /Started \$\{/);
  assert.match(adminJs, /previous site version during the update/);
  assert.doesNotMatch(adminJs, /Current log: INTACT/);
  assert.doesNotMatch(adminJs, /original security-log build/);
  const selectBlock = adminJs.slice(
    adminJs.indexOf('const securityLogSelectFilters'),
    adminJs.indexOf('securityLogTextFilters.forEach'),
  );
  assert.doesNotMatch(selectBlock, /addEventListener\('input'/);
});

test('2026-10-04.4.sql is idempotent on a database that already has prev_sha256', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      actor_username TEXT NOT NULL DEFAULT '',
      actor_user_id INTEGER,
      payload_sha256 TEXT NOT NULL DEFAULT '',
      prev_sha256 TEXT NOT NULL DEFAULT '',
      prev_id INTEGER
    );
    CREATE TABLE site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  db.exec(readFileSync(join(root, 'migrations/2026-10-04.4.sql'), 'utf8'));
  db.exec(readFileSync(join(root, 'migrations/2026-10-04.4.sql'), 'utf8'));
  const version = db.prepare("SELECT value FROM site_content WHERE key = 'schema_version'").get();
  assert.equal(version.value, '2026-10-04.4');
  db.close();
});

test('deleted-user display-name search uses the actor name map', async () => {
  resetAuditWriteFailureState();
  const seed = [{
    id: 1,
    action: 'login',
    actor_user_id: 44,
    actor_username: 'old-login@efhsband.org',
    created_at: '2026-10-04 16:00:00',
    payload_sha256: 'h1',
    prev_sha256: '',
  }];
  const { env } = createAuditDb(seed, {
    users: [],
    actorNames: [{ user_id: 44, username: 'old-login@efhsband.org', display_name: 'Pat Deleted' }],
  });
  const listed = await listAdminAuditLogs(env, {
    year: 2026,
    month: 10,
    actor: 'Pat Deleted',
    limit: 25,
  });
  assert.equal(listed.total, 1);
  assert.equal(listed.entries[0].actor_user_id, 44);
});

test('export session is signed and required', async () => {
  const { env } = createAuditDb();
  const started = await createAuditExportSession(env, {
    actorId: 1,
    format: 'csv',
    filters: { month: 10, year: 2026 },
  });
  assert.match(started.session_id, /\./);
  const ok = await readAuditExportSession(env, started.session_id, { actorId: 1, format: 'csv', filters: { month: 10, year: 2026 } });
  assert.equal(ok.ok, true);
  assert.equal(ok.session.format, 'csv');
  const other = await readAuditExportSession(env, started.session_id, { actorId: 99 });
  assert.equal(other.ok, false);
  const missing = await readAuditExportSession(env, '');
  assert.equal(missing.ok, false);
  const bad = await readAuditExportSession(env, `${started.session_id}x`);
  assert.equal(bad.ok, false);
  const advanced = await advanceAuditExportSession(env, started.session_id, {
    actorId: 1,
    format: 'csv',
    filters: { month: 10, year: 2026 },
    entries: [{ id: 1, payload_sha256: 'abc' }],
  });
  assert.equal(advanced.ok, true);
  const empty = await completeAuditExportSession(env, started.session_id, { actorId: 1 });
  assert.equal(empty.ok, false);
  assert.equal(empty.status, 400);
  const done = await completeAuditExportSession(env, advanced.session_id, { actorId: 1 });
  assert.equal(done.ok, true);
  const replay = await completeAuditExportSession(env, started.session_id, { actorId: 1 });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
});

test('export manifest keeps every generation even when the last batch starts mid-chain', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const seed = [
    { id: 1, action: 'login', payload_sha256: 'h1', prev_sha256: '', prev_id: null, created_at: '2026-10-04 16:00:00' },
    { id: 790, action: 'login', payload_sha256: 'h790', prev_sha256: 'wrong', prev_id: 789, created_at: '2026-10-04 16:00:00' },
    {
      id: 953,
      action: 'log.genesis',
      actor_username: 'Trevor',
      payload_sha256: 'h953',
      prev_sha256: 'h952',
      prev_id: 952,
      created_at: '2026-10-05T00:42:51.143Z',
      key_id: 'k2',
      meta_json: JSON.stringify({
        generation: 2,
        new_key_id: 'k2',
        authorized_by: 'Trevor',
        reason: 'DEV test',
      }),
    },
    { id: 1011, action: 'login', payload_sha256: 'h1011', prev_sha256: 'h1010', prev_id: 1010, created_at: '2026-10-05 01:00:00' },
  ];
  const { env, site } = createAuditDb(seed);
  site.set('audit_chain_cutover_id', '996');
  const manifest = await buildAuditExportManifest(env, {
    min_id: 971,
    max_id: 1011,
    count: 41,
    running_hash: 'abc',
    breaks: [{ id: 790 }],
  });
  assert.equal(manifest.chain_head_id, 1011);
  assert.equal(manifest.min_id, 971);
  assert.match(manifest.signed_manifest || '', /./);
  assert.equal(manifest.generation_report.length, 2);
  assert.match(manifest.generation_report[0], /Generation 1 \(historical, closed by genesis #953\)/);
  assert.match(manifest.generation_report[0], /#790/);
  assert.match(manifest.generation_report[1], /Generation 2 \(k2\)/);
  assert.match(manifest.generation_report[1], /Trevor/);
  assert.match(manifest.generation_report[1], /INTACT/);
});

test('generation report is court-readable and lists every break', () => {
  const catalog = buildAuditGenerationCatalog({
    genesisRows: [{
      id: 953,
      generation: 2,
      new_key_id: 'k2',
      created_at: '2026-10-05T00:45:00.000Z',
      authorized_by: 'Trevor',
      reason: 'rotate',
    }],
    minId: 1,
    maxId: 960,
  });
  const report = formatAuditGenerationReport(catalog, [
    { id: 790 },
    { id: 865 },
  ]);
  assert.match(report[0], /Generation 1 \(historical, closed by genesis #953\)/);
  assert.match(report[0], /#790/);
  assert.match(report[0], /#865/);
  assert.match(report[1], /Generation 2 \(k2\)/);
  assert.match(report[1], /Trevor/);
  assert.match(report[1], /INTACT/);
});

test('50 parallel SQLite writes stay a single linear chain with zero NULL prev_id', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'admin',
      method TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      status INTEGER,
      actor_user_id INTEGER,
      actor_username TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      meta_json TEXT NOT NULL DEFAULT '{}',
      payload_sha256 TEXT NOT NULL DEFAULT '',
      ciphertext TEXT NOT NULL DEFAULT '',
      enc_version INTEGER NOT NULL DEFAULT 1,
      key_id TEXT NOT NULL DEFAULT '',
      prev_sha256 TEXT NOT NULL DEFAULT '',
      prev_id INTEGER,
      source_pending_id INTEGER
    );
    CREATE UNIQUE INDEX idx_audit_prev_id ON admin_audit_log(prev_id) WHERE prev_id IS NOT NULL;
    CREATE UNIQUE INDEX idx_audit_source_pending ON admin_audit_log(source_pending_id) WHERE source_pending_id IS NOT NULL;
    CREATE TABLE site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO site_content (key, value) VALUES ('audit_chain_cutover_id', '0');
    ${AUDIT_LOG_PENDING_TABLE_SQL};
    ${AUDIT_LOG_LINEAR_INSERT_TRIGGER_SQL};
    ${AUDIT_LOG_NO_UPDATE_TRIGGER_SQL};
    ${AUDIT_LOG_NO_DELETE_TRIGGER_SQL};
    ${AUDIT_LOG_PENDING_NO_UPDATE_TRIGGER_SQL};
    ${AUDIT_LOG_PENDING_NO_DELETE_TRIGGER_SQL};
  `);
  const env = {
    EFBAND_SECRET: 'unit-test-secret',
    AUDIT_LOG_KEY: 'unit-audit-key-do-not-use-elsewhere',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            if (String(sql).includes('ORDER BY id DESC LIMIT 1')) {
              await new Promise((resolve) => setImmediate(resolve));
            }
            return stmt.get(...this.binds) || null;
          },
          async all() {
            return { results: stmt.all(...this.binds) };
          },
          async run() {
            try {
              const info = stmt.run(...this.binds);
              return { success: true, meta: { last_row_id: Number(info.lastInsertRowid) } };
            } catch (error) {
              throw new Error(error?.message || String(error));
            }
          },
        };
      },
    },
  };
  const requested = 56;
  const writeStarted = performance.now();
  const results = await Promise.all(Array.from({ length: requested }, (_, index) => writeAdminAuditLog(env, {
    action: 'login',
    actor_username: `writer${index}@efhsband.org`,
  })));
  const writeMs = performance.now() - writeStarted;
  assert.equal(results.every(Boolean), true);
  let pending = Number(db.prepare('SELECT COUNT(*) AS total FROM admin_audit_pending').get().total) || 0;
  if (pending) {
    await writeAdminAuditLog(env, { action: 'login', actor_username: 'drain@efhsband.org' });
  }
  const linear = db.prepare('SELECT id, payload_sha256, prev_sha256, prev_id, source_pending_id FROM admin_audit_log ORDER BY id').all();
  const consumed = new Set(linear.map((row) => Number(row.source_pending_id)).filter(Boolean));
  const openPending = db.prepare('SELECT id FROM admin_audit_pending').all()
    .filter((row) => !consumed.has(Number(row.id)));
  assert.equal(openPending.length, 0);
  const drainExtra = linear.some((row) => row.source_pending_id) || results.some((row) => row?.queued)
    ? Number(db.prepare("SELECT COUNT(*) AS total FROM admin_audit_log WHERE actor_username = 'drain@efhsband.org'").get().total) || 0
    : 0;
  assert.equal(linear.length, requested + drainExtra);
  assert.equal(linear.every((row) => row.prev_id != null), true);
  for (let i = 1; i < linear.length; i += 1) {
    assert.equal(Number(linear[i].prev_id), Number(linear[i - 1].id));
    assert.equal(linear[i].prev_sha256, linear[i - 1].payload_sha256);
  }
  const verified = await verifyAdminAuditRange(env, {});
  assert.equal(verified.chain_ok, true);
  assert.equal(verified.checked, linear.length);
  const perWrite = writeMs / requested;
  console.log(JSON.stringify({
    parallel_write_test: {
      requested,
      chained: linear.length,
      open_pending: openPending.length,
      null_prev_id: linear.filter((row) => row.prev_id == null).length,
      cpu_ms_per_write_wall: Number(perWrite.toFixed(3)),
      chain_ok: verified.chain_ok,
    },
  }));
  db.close();
});

function sqliteEnv(db) {
  return {
    EFBAND_SECRET: 'unit-test-secret',
    AUDIT_LOG_KEY: 'unit-audit-key-do-not-use-elsewhere',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            try { return stmt.get(...this.binds) || null; } catch { return null; }
          },
          async all() {
            try { return { results: stmt.all(...this.binds) }; } catch { return { results: [] }; }
          },
          async run() {
            const info = stmt.run(...this.binds);
            return { success: true, meta: { last_row_id: Number(info.lastInsertRowid) } };
          },
        };
      },
      async batch(items) {
        const out = [];
        for (const item of items || []) out.push(await item.run());
        return out;
      },
    },
  };
}

function createProdAtDot2() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, display_name TEXT, permissions TEXT);
    CREATE TABLE photos (id INTEGER PRIMARY KEY, filename TEXT, sort_order INTEGER, created_at TEXT);
    CREATE TABLE sponsors (id INTEGER PRIMARY KEY, active INTEGER, sort_order INTEGER);
    CREATE TABLE booster_members (id INTEGER PRIMARY KEY, active INTEGER, sort_order INTEGER);
    CREATE TABLE staff_members (id INTEGER PRIMARY KEY, active INTEGER, sort_order INTEGER);
    CREATE TABLE caldev_events (id INTEGER PRIMARY KEY, track TEXT, start_date TEXT, start_time TEXT);
    CREATE TABLE events (id INTEGER PRIMARY KEY, show_on_boosters INTEGER, event_year INTEGER);
    CREATE TABLE admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'admin',
      method TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      status INTEGER,
      actor_user_id INTEGER,
      actor_username TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      meta_json TEXT NOT NULL DEFAULT '{}',
      payload_sha256 TEXT NOT NULL DEFAULT '',
      ciphertext TEXT NOT NULL DEFAULT '',
      enc_version INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.2');
    INSERT INTO admin_audit_log (action, payload_sha256) VALUES ('login', 'seed');
  `);
  return db;
}

test('hand-running .4 then .5 on prod-at-.2 does not add columns; Worker repair does', async () => {
  const db = createProdAtDot2();
  db.exec(readFileSync(join(root, 'migrations/2026-10-04.4.sql'), 'utf8'));
  db.exec(readFileSync(join(root, 'migrations/2026-10-04.5.sql'), 'utf8'));
  const version = db.prepare("SELECT value FROM site_content WHERE key = 'schema_version'").get().value;
  assert.equal(version, '2026-10-04.5');
  const before = db.prepare('PRAGMA table_info(admin_audit_log)').all().map((col) => col.name);
  assert.equal(before.includes('prev_id'), false);
  await applyIncrementalSchema(sqliteEnv(db), {
    writeVersion: async (env) => {
      await env.DB.prepare("INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.6') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    },
  });
  const after = db.prepare('PRAGMA table_info(admin_audit_log)').all().map((col) => col.name);
  assert.equal(after.includes('prev_id'), true);
  assert.equal(after.includes('prev_sha256'), true);
  assert.equal(after.includes('source_pending_id'), true);
  const trigger = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='admin_audit_log_linear_insert'").get();
  assert.equal(linearTriggerEnforcesCutoverWindow(trigger.sql), true);
  assert.equal(linearTriggerAllowsLegacyNull(trigger.sql), true);
  db.prepare("INSERT INTO admin_audit_log (action, payload_sha256, prev_id, prev_sha256) VALUES ('old', 'x', NULL, '')").run();
  assert.throws(
    () => db.prepare("INSERT INTO admin_audit_log (action, payload_sha256, prev_id, prev_sha256) VALUES ('fork', 'y', 1, 'nope')").run(),
    /audit-chain-fork/,
  );
  db.close();
});

test('new Worker self-migrates prod-at-.2 without hand-run SQL', async () => {
  const db = createProdAtDot2();
  await applyIncrementalSchema(sqliteEnv(db), {
    writeVersion: async (env) => {
      await env.DB.prepare("INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.6') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    },
  });
  const names = [...await listTableColumnNames(sqliteEnv(db), 'admin_audit_log')];
  assert.equal(names.includes('prev_id'), true);
  const sql = await readAuditLinearTriggerSql(sqliteEnv(db));
  assert.equal(linearTriggerEnforcesCutoverWindow(sql), true);
  assert.equal(linearTriggerAllowsLegacyNull(sql), true);
  db.close();
});

test('v3 digest covers prev_id and prev_sha256; v2 rows keep their own rule', async () => {
  const v3 = canonicalChainMaterial({
    enc_version: ADMIN_AUDIT_ENC_VERSION_V3,
    created_at: 't',
    action: 'login',
    category: 'auth',
    actor_user_id: 5,
    key_id: 'k1',
    ciphertext: 'ciph',
    prev_id: 9,
    prev_sha256: 'prev',
  }, ADMIN_AUDIT_ENC_VERSION_V3);
  assert.match(v3, /"v":3/);
  assert.match(v3, /"prev_id":9/);
  assert.match(v3, /"prev_sha256":"prev"/);
  const v2 = canonicalChainMaterial({
    enc_version: 2,
    created_at: 't',
    action: 'login',
    category: 'auth',
    actor_user_id: 5,
    key_id: 'k1',
    ciphertext: 'ciph',
    prev_id: 9,
    prev_sha256: 'prev',
  }, 2);
  assert.match(v2, /"v":2/);
  assert.doesNotMatch(v2, /prev_id/);
});

test('verify labels in-window hash-correct NULL prev_id as previous site version', async () => {
  resetAuditWriteFailureState();
  const seed = [
    { id: 10, action: 'login', payload_sha256: 'h10', prev_sha256: 'h9', prev_id: 9, created_at: '2026-10-04 16:00:00', enc_version: 1 },
    { id: 11, action: 'login', payload_sha256: 'h11', prev_sha256: 'h10', prev_id: null, created_at: '2026-10-04 16:05:00', enc_version: 1 },
    { id: 12, action: 'login', payload_sha256: 'h12', prev_sha256: 'h11', prev_id: 11, created_at: '2026-10-04 16:06:00', enc_version: 1 },
  ];
  const { env, site } = createAuditDb(seed);
  site.set('audit_chain_cutover_id', '9');
  site.set('audit_chain_cutover_at', '2026-10-04 16:00:00');
  const batch = await verifyAdminAuditBatch(env, { after_id: 0, limit: 40 });
  assert.equal(batch.breaks.some((item) => item.id === 11), false);
  assert.equal(batch.compatibility.some((item) => item.id === 11), true);
  assert.match(batch.compatibility[0].reason, /previous site version/);
  assert.match(batch.court_report.compatibility_heading, /update on Oct 4, 2026/);
  assert.equal(batch.breaks.some((item) => item.id === 12), false);
});

test('audited write under forced conflicts stays at or under 45 queries and queues pending', async () => {
  resetAuditWriteFailureState();
  resetAuditGenerationCache();
  const { env, pending } = createAuditDb([{
    id: 1,
    action: 'login',
    payload_sha256: 'h1',
    prev_sha256: '',
    prev_id: 0,
    created_at: '2026-10-04 16:00:00',
  }]);
  attachD1QueryCounter(env);
  resetD1QueryBudget(env, 17);
  const origPrepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    const stmt = origPrepare(sql);
    if (String(sql).includes('INSERT INTO admin_audit_log')) {
      stmt.run = async () => {
        throw new Error('UNIQUE constraint failed: admin_audit_log.prev_id');
      };
    }
    return stmt;
  };
  const written = await writeAdminAuditLog(env, { action: 'change.pages', actor_username: 'agent@efhsband.org' });
  assert.equal(written?.queued, true);
  assert.ok(pending.length >= 1);
  assert.ok(d1QueryCount(env) <= 45, `used ${d1QueryCount(env)} queries`);
  console.log(JSON.stringify({ audited_save_forced_conflicts: { queries: d1QueryCount(env), pending: pending.length } }));
});

test('initDb repairs a claimed .5 database that is missing columns and the linear trigger', async () => {
  const db = createProdAtDot2();
  db.exec(readFileSync(join(root, 'migrations/2026-10-04.4.sql'), 'utf8'));
  db.exec(readFileSync(join(root, 'migrations/2026-10-04.5.sql'), 'utf8'));
  assert.equal(db.prepare("SELECT value FROM site_content WHERE key = 'schema_version'").get().value, '2026-10-04.5');
  resetDbInitCache();
  await initDb(sqliteEnv(db));
  const names = db.prepare('PRAGMA table_info(admin_audit_log)').all().map((col) => col.name);
  assert.equal(names.includes('prev_id'), true);
  assert.equal(names.includes('prev_sha256'), true);
  const version = db.prepare("SELECT value FROM site_content WHERE key = 'schema_version'").get().value;
  assert.equal(version, DB_SCHEMA_VERSION);
  const trigger = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='admin_audit_log_linear_insert'").get();
  assert.equal(linearTriggerEnforcesCutoverWindow(trigger.sql), true);
  assert.equal(linearTriggerAllowsLegacyNull(trigger.sql), true);
  db.close();
});

test('full-walk verify court report is not the last batch slogan', async () => {
  resetAuditWriteFailureState();
  const seed = [];
  for (let id = 1; id <= 45; id += 1) {
    seed.push({
      id,
      action: 'login',
      payload_sha256: `h${id}`,
      prev_sha256: id === 1 ? '' : (id === 2 ? 'WRONG' : `h${id - 1}`),
      prev_id: id === 1 ? 0 : id - 1,
      created_at: '2026-10-04 16:00:00',
      enc_version: 1,
    });
  }
  const { env, site } = createAuditDb(seed);
  site.set('audit_chain_cutover_id', '0');
  const walked = await verifyAdminAuditRange(env, { limit: 20 });
  assert.equal(walked.checked, 45);
  assert.equal(walked.chain_ok, false);
  assert.equal(walked.breaks.some((item) => item.id === 2), true);
  assert.doesNotMatch(walked.chain_status, /Whole chain intact/i);
  assert.match(walked.court_report.current.title, /link breaks|INTACT/i);
  const csv = buildAdminAuditExportCsv(seed.slice(0, 2), walked);
  assert.match(csv, /chain_ok,false/);
});

test('NULL-prev wrong hash or outside the 15-minute window is a break', async () => {
  const seed = [
    { id: 393, action: 'login', payload_sha256: 'h393', prev_sha256: 'h392', prev_id: 392, created_at: '2026-10-04 16:00:00', enc_version: 1 },
    { id: 394, action: 'login', payload_sha256: 'h394', prev_sha256: 'WRONG', prev_id: null, created_at: '2026-10-04 16:05:00', enc_version: 1 },
  ];
  const { env, site } = createAuditDb(seed);
  site.set('audit_chain_cutover_id', '392');
  site.set('audit_chain_cutover_at', '2026-10-04 16:00:00');
  const inWindowWrong = classifyAuditLinkRows(seed, { cutoverAt: '2026-10-04 16:00:00' });
  assert.equal(inWindowWrong.breaks.some((item) => item.id === 394), true);
  assert.equal(inWindowWrong.compatibility.some((item) => item.id === 394), false);

  const later = [
    { id: 393, action: 'login', payload_sha256: 'h393', prev_sha256: 'h392', prev_id: 392, created_at: '2026-10-04 16:00:00', enc_version: 1 },
    { id: 394, action: 'login', payload_sha256: 'h394', prev_sha256: 'h393', prev_id: null, created_at: '2026-10-04 17:00:00', enc_version: 1 },
  ];
  const outside = classifyAuditLinkRows(later, { cutoverAt: '2026-10-04 16:00:00' });
  assert.equal(outside.breaks.some((item) => item.id === 394), true);
  assert.match(outside.breaks.find((item) => item.id === 394).reason, /window/i);
});

test('legacy range is the unlinked prefix and does not overlap breaks', async () => {
  const seed = [];
  for (let id = 1; id <= 12; id += 1) {
    seed.push({
      id,
      action: 'login',
      payload_sha256: `h${id}`,
      prev_sha256: id <= 9 ? '' : (id === 11 ? 'WRONG' : `h${id - 1}`),
      prev_id: id <= 9 ? null : id - 1,
      created_at: '2026-10-03 14:00:00',
      enc_version: 1,
    });
  }
  const classified = classifyAuditLinkRows(seed, { cutoverAt: '2026-10-04 16:00:00' });
  assert.deepEqual(classified.legacy.map((item) => item.id), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(classified.legacy.some((item) => classified.breaks.some((brk) => brk.id === item.id)), false);
  assert.equal(classified.breaks.some((item) => item.id === 11), true);
  const { env, site } = createAuditDb(seed);
  site.set('audit_chain_cutover_id', '12');
  site.set('audit_chain_cutover_at', '2026-10-04 16:00:00');
  const walked = await verifyAdminAuditRange(env, {});
  assert.equal(walked.legacy.at(-1).id, 9);
  assert.match(walked.court_report.legacy.guarantee, /Entries #1-#9 were recorded before tamper-proof linking/);
  assert.match(walked.court_report.current.started_label, /Started Oct 3, 2026, when the Security log was first set up/);
  assert.doesNotMatch(walked.court_report.current.title, /Current log/);
  const manifest = await buildAuditExportManifest(env, { count: 12 });
  assert.equal(manifest.court_report.legacy.start_id, 1);
  assert.equal(manifest.court_report.legacy.end_id, 9);
  assert.equal(manifest.legacy.at(-1).id, 9);
});

test('verify complete uses a constant number of D1 queries regardless of row count', async () => {
  const small = [];
  for (let id = 1; id <= 20; id += 1) {
    small.push({
      id,
      action: 'login',
      payload_sha256: `h${id}`,
      prev_sha256: id === 1 ? '' : `h${id - 1}`,
      prev_id: id === 1 ? 0 : id - 1,
      created_at: '2026-10-03 14:00:00',
      enc_version: 1,
    });
  }
  const large = [];
  for (let id = 1; id <= 220; id += 1) {
    large.push({
      id,
      action: 'login',
      payload_sha256: `h${id}`,
      prev_sha256: id === 1 ? '' : `h${id - 1}`,
      prev_id: id === 1 ? 0 : id - 1,
      created_at: '2026-10-03 14:00:00',
      enc_version: 1,
    });
  }
  const a = createAuditDb(small);
  const b = createAuditDb(large);
  a.site.set('audit_chain_cutover_at', '2026-10-04 16:00:00');
  b.site.set('audit_chain_cutover_at', '2026-10-04 16:00:00');
  const beforeA = a.sqlLog.length;
  await verifyAdminAuditRange(a.env, {});
  const queriesA = a.sqlLog.length - beforeA;
  const beforeB = b.sqlLog.length;
  await verifyAdminAuditRange(b.env, {});
  const queriesB = b.sqlLog.length - beforeB;
  assert.equal(queriesA, queriesB);
  assert.ok(queriesA <= 8, `verify complete used ${queriesA} queries`);
});

test('D1 query counter is per-request and does not freeze on env', async () => {
  const hits = { n: 0 };
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async first() {
          hits.n += 1;
          return null;
        },
        async all() { return { results: [] }; },
        async run() { return { success: true }; },
      };
    },
  };
  const env = { DB: db };
  const first = createD1QueryBudget();
  attachD1QueryCounter(env, first);
  await env.DB.prepare('SELECT 1').first();
  await env.DB.prepare('SELECT 2').first();
  const second = createD1QueryBudget();
  attachD1QueryCounter(env, second);
  await env.DB.prepare('SELECT 3').first();
  assert.equal(first.count, 2);
  assert.equal(second.count, 1);
  assert.equal(d1QueryCount(env), 1);
  assert.equal(hits.n, 3);
});

test('linear trigger rejects NULL prev_id after the 15-minute window', async () => {
  const db = createProdAtDot2();
  await applyIncrementalSchema(sqliteEnv(db));
  const at = db.prepare("SELECT value FROM site_content WHERE key = 'audit_chain_cutover_at'").get();
  assert.ok(at?.value);
  db.prepare("INSERT INTO admin_audit_log (action, payload_sha256, prev_id, prev_sha256) VALUES ('old', 'x', NULL, '')").run();
  db.prepare("UPDATE site_content SET value = datetime('now', '-20 minutes') WHERE key = 'audit_chain_cutover_at'").run();
  assert.throws(
    () => db.prepare("INSERT INTO admin_audit_log (action, payload_sha256, prev_id, prev_sha256) VALUES ('late', 'y', NULL, '')").run(),
    /audit-chain-fork/,
  );
  db.close();
});

test('export session expiry copy tells the admin to start again', async () => {
  const { env } = createAuditDb();
  const started = await createAuditExportSession(env, { actorId: 1, format: 'csv', filters: {} });
  const raw = await readAuditExportSession(env, started.session_id);
  const payload = JSON.stringify({ ...raw.session, exp: Date.now() - 10 });
  const signed = `${Buffer.from(payload, 'utf8').toString('base64')}.${await signAuditChainHead(env, payload)}`;
  const stale = await readAuditExportSession(env, signed);
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 403);
  assert.equal(stale.detail, 'Export session expired, start again');
});

test('session D1 errors return 503 with Retry-After, not 401', async () => {
  const env = {
    EFBAND_SECRET: 'unit-test-secret',
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async first() { throw new Error('D1 unavailable'); },
          async all() { throw new Error('D1 unavailable'); },
        };
      },
    },
  };
  const token = await makeSession({ id: 1, username: 'agent@efhsband.org' }, env);
  const request = new Request('https://efhsband-dev.example/api/admin/security-log', {
    headers: { cookie: `efband_session=${token}` },
  });
  const auth = await requireSecurityLogAccess(request, env);
  assert.equal(auth.response.status, 503);
  assert.equal(auth.response.headers.get('retry-after'), '2');
  const body = await auth.response.json();
  assert.match(body.detail, /temporarily unavailable/i);
});

test('409 page saves log as access.denied, not change.pages', async () => {
  resetAuditWriteFailureState();
  const { env, rows } = createAuditDb();
  const request = new Request('https://efhsband-dev.example/api/admin/pages/join', { method: 'PUT' });
  const response = new Response(JSON.stringify({ detail: 'Use the visual editor for this page' }), { status: 409 });
  await maybeAuditAdminApiResponse(env, {
    request,
    url: new URL(request.url),
    response,
    actor: { id: 1, username: 'agent@efhsband.org' },
  });
  assert.equal(rows.some((row) => row.action === 'change.pages'), false);
  const denied = await maybeLogAccessDenial(env, {
    request,
    url: new URL(request.url),
    response,
    actor: { id: 1, username: 'agent@efhsband.org' },
  });
  assert.equal(denied.wrote, true);
  assert.equal(denied.action, 'access.denied');
  assert.equal(rows.at(-1).action, 'access.denied');
});
