/**
 * Super-admin-only CMS security audit log.
 *
 * ISOLATION CONTRACT (do not weaken):
 * - Independent of public pages, logos, sections, and site content edits.
 * - Append-only INSERT. No UPDATE / DELETE / DROP APIs or helpers.
 * - View / print / PDF export only. Never editable, including by Super Admin.
 * - Access is Super Admin role only — never a grantable permission scope.
 * - Stored in D1 (admin_audit_log) with AES-256-GCM encryption + SHA-256 integrity.
 */

export const ADMIN_AUDIT_TABLE = 'admin_audit_log';
export const ADMIN_AUDIT_ENC_VERSION = 1;
export const SECURITY_LOG_FORBIDDEN_PERMISSIONS = Object.freeze([
  'security-log',
  'security',
  'audit',
  'audit-log',
  'admin-audit',
]);

const TEXT = new TextEncoder();
const READ_TEXT = new TextDecoder();

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'current_password',
  'new_password',
  'confirm_password',
  'token',
  'completion_token',
  'data_base64',
  'content',
  'attachment_content',
  'square_access_token',
  'authorization',
  'cookie',
  'secret',
  'api_key',
  'private_key',
]);

export function isSecurityLogPath(pathname = '') {
  const path = String(pathname || '');
  return path === '/api/admin/security-log'
    || path === '/api/admin/security-log.txt'
    || path === '/api/admin/security-log.pdf'
    || path.startsWith('/api/admin/security-log/');
}

/** Reject any SQL that could alter or erase sealed audit rows. */
export function assertAuditSqlIsAppendOnly(sql = '') {
  const normalized = String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized.includes(ADMIN_AUDIT_TABLE)) return true;
  if (normalized.startsWith('insert into')) return true;
  if (normalized.startsWith('select ')) return true;
  if (normalized.startsWith('create table if not exists')) return true;
  if (normalized.startsWith('alter table') && normalized.includes('add column')) return true;
  throw new Error('Security audit log is append-only (INSERT/SELECT only).');
}

export function isMutatingHttpMethod(method = '') {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

export function shouldAuditAdminApiRequest(pathname = '', method = '') {
  const path = String(pathname || '');
  if (!path.startsWith('/api/admin')) return false;
  if (isSecurityLogPath(path)) return false;
  if (path === '/api/admin/me') return false;
  // Staff mail is logged with recipient/body details in the mail handler.
  if (path === '/api/admin/mail') return false;
  return isMutatingHttpMethod(method);
}

export function auditCategoryFromPath(pathname = '') {
  const path = String(pathname || '');
  if (path.includes('/mail')) return 'mail';
  if (path.includes('/users') || path.includes('/password')) return 'users';
  if (path.includes('/events') || path.includes('/push')) return 'events';
  if (path.includes('/sponsors') || path.includes('/sponsor-applications') || path.includes('/checkout')) return 'sponsors';
  if (path.includes('/ledger')) return 'ledger';
  if (path.includes('/staff')) return 'staff';
  if (path.includes('/booster')) return 'boosters';
  if (path.includes('/minutes')) return 'minutes';
  if (path.includes('/photos')) return 'photos';
  if (path.includes('/contact')) return 'contact';
  if (path.includes('/pages') || path.includes('/ensembles') || path.includes('/fundraising')) return 'pages';
  if (path.includes('/site') || path.includes('/logo') || path.includes('/utility-links') || path.includes('/social') || path.includes('/zernio')) return 'site';
  return 'admin';
}

export function redactAuditValue(key, value, depth = 0) {
  if (depth > 4) return '[truncated]';
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (SENSITIVE_KEYS.has(normalizedKey) || normalizedKey.includes('password') || normalizedKey.endsWith('_base64')) {
    return '[redacted]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item, index) => redactAuditValue(String(index), item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = redactAuditValue(childKey, childValue, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') {
    if (value.length > 1200) return `${value.slice(0, 1200)}…[truncated]`;
    return value;
  }
  return value;
}

export function redactAuditObject(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return redactAuditValue('root', payload);
}

export async function summarizeAdminRequestForAudit(request) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  try {
    if (contentType.includes('application/json')) {
      const text = await request.clone().text();
      if (!text) return { content_type: 'application/json', body: {} };
      const parsed = JSON.parse(text);
      return {
        content_type: 'application/json',
        body: redactAuditObject(parsed),
      };
    }
    if (contentType.includes('multipart/form-data')) {
      const form = await request.clone().formData();
      const fields = {};
      const files = [];
      for (const [key, value] of form.entries()) {
        if (typeof File !== 'undefined' && value instanceof File) {
          files.push({
            field: key,
            filename: value.name || 'upload',
            size: Number(value.size) || 0,
            type: value.type || '',
          });
          continue;
        }
        fields[key] = redactAuditValue(key, String(value ?? ''));
      }
      return {
        content_type: 'multipart/form-data',
        fields,
        files,
      };
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.clone().formData();
      const fields = {};
      for (const [key, value] of form.entries()) {
        fields[key] = redactAuditValue(key, String(value ?? ''));
      }
      return {
        content_type: 'application/x-www-form-urlencoded',
        fields,
      };
    }
  } catch (error) {
    return {
      content_type: contentType || 'unknown',
      parse_error: String(error?.message || error || 'Unable to summarize request'),
    };
  }
  return { content_type: contentType || 'none' };
}

export function buildAuditSummary({
  action = '',
  method = '',
  path = '',
  status = null,
  actorUsername = '',
  detail = '',
} = {}) {
  const who = String(actorUsername || 'unknown').trim() || 'unknown';
  const verb = String(action || 'change').trim() || 'change';
  const route = `${String(method || '').toUpperCase()} ${String(path || '')}`.trim();
  const statusPart = status == null ? '' : ` → ${status}`;
  const extra = String(detail || '').trim();
  return [
    `${who}: ${verb}`,
    route ? `(${route}${statusPart})` : '',
    extra,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function bytesToBase64(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function auditLogSecretMaterial(env = {}) {
  return String(env.EFBAND_SECRET || env.AUDIT_LOG_SECRET || 'change-me-before-launch');
}

/** SHA-256 digest as lowercase hex (integrity fingerprint). */
export async function sha256Hex(value = '') {
  const digest = await crypto.subtle.digest('SHA-256', TEXT.encode(String(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Derive an AES-256 key from SHA-256(secret + purpose). */
export async function deriveAuditAesKey(env) {
  const material = `${auditLogSecretMaterial(env)}:admin-audit-log:v${ADMIN_AUDIT_ENC_VERSION}`;
  const digest = await crypto.subtle.digest('SHA-256', TEXT.encode(material));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function canonicalAuditPayload(entry = {}) {
  const meta = entry.meta && typeof entry.meta === 'object' ? entry.meta : {};
  return JSON.stringify({
    action: String(entry.action || ''),
    category: String(entry.category || ''),
    method: String(entry.method || ''),
    path: String(entry.path || ''),
    status: entry.status == null ? null : Number(entry.status),
    actor_user_id: entry.actor_user_id == null ? null : Number(entry.actor_user_id),
    actor_username: String(entry.actor_username || ''),
    ip: String(entry.ip || ''),
    user_agent: String(entry.user_agent || ''),
    summary: String(entry.summary || ''),
    meta,
  });
}

export async function encryptAuditPayload(env, plaintext = '') {
  const key = await deriveAuditAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, TEXT.encode(String(plaintext)));
  return `${bytesToBase64(iv)}.${bytesToBase64(encrypted)}`;
}

export async function decryptAuditPayload(env, ciphertext = '') {
  const raw = String(ciphertext || '');
  const [ivB64, dataB64] = raw.split('.');
  if (!ivB64 || !dataB64) throw new Error('Invalid ciphertext');
  const key = await deriveAuditAesKey(env);
  const iv = base64ToBytes(ivB64);
  const data = base64ToBytes(dataB64);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return READ_TEXT.decode(decrypted);
}

export async function writeAdminAuditLog(env, entry = {}) {
  if (!env?.DB) return null;
  const action = String(entry.action || 'change').trim().slice(0, 80) || 'change';
  const category = String(entry.category || auditCategoryFromPath(entry.path || '')).trim().slice(0, 40) || 'admin';
  const method = String(entry.method || '').trim().toUpperCase().slice(0, 12);
  const path = String(entry.path || '').trim().slice(0, 300);
  const status = entry.status == null || entry.status === '' ? null : Number(entry.status);
  const actorUserId = entry.actor_user_id == null || entry.actor_user_id === ''
    ? null
    : Number(entry.actor_user_id);
  const actorUsername = String(entry.actor_username || '').trim().slice(0, 190);
  const ip = String(entry.ip || '').trim().slice(0, 80);
  const userAgent = String(entry.user_agent || '').trim().slice(0, 400);
  const summary = String(entry.summary || buildAuditSummary({
    action,
    method,
    path,
    status,
    actorUsername,
  })).trim().slice(0, 700);
  let meta = {};
  try {
    meta = entry.meta && typeof entry.meta === 'object' ? redactAuditObject(entry.meta) : {};
  } catch {
    meta = {};
  }
  const record = {
    action,
    category,
    method,
    path,
    status: Number.isFinite(status) ? status : null,
    actor_user_id: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
    actor_username: actorUsername,
    ip,
    user_agent: userAgent,
    summary,
    meta,
  };
  const canonical = canonicalAuditPayload(record);
  let payloadSha256 = '';
  let ciphertext = '';
  try {
    payloadSha256 = await sha256Hex(canonical);
    ciphertext = await encryptAuditPayload(env, canonical);
  } catch (error) {
    console.error('admin audit log encrypt failed', error?.message || error);
    return null;
  }
  try {
    const insertSql = `INSERT INTO ${ADMIN_AUDIT_TABLE}
        (action, category, method, path, status, actor_user_id, actor_username, ip, user_agent, summary, meta_json, payload_sha256, ciphertext, enc_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    assertAuditSqlIsAppendOnly(insertSql);
    const result = await env.DB.prepare(insertSql).bind(
      // Index fields only (needed for Super Admin filters). Details are sealed in ciphertext.
      action,
      category,
      '',
      '',
      record.status,
      record.actor_user_id,
      actorUsername,
      '',
      '',
      '',
      '{}',
      payloadSha256,
      ciphertext,
      ADMIN_AUDIT_ENC_VERSION,
    ).run();
    return { id: result?.meta?.last_row_id || null, payload_sha256: payloadSha256 };
  } catch (error) {
    console.error('admin audit log write failed', error?.message || error);
    return null;
  }
}

export function requestClientIp(request) {
  return String(
    request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || '',
  ).split(',')[0].trim();
}

export async function maybeAuditAdminApiResponse(env, {
  request,
  url,
  response,
  actor = null,
  requestSummary = null,
  ctx = null,
} = {}) {
  if (!shouldAuditAdminApiRequest(url?.pathname, request?.method)) return;
  const path = String(url?.pathname || '');
  const method = String(request?.method || '').toUpperCase();
  const status = Number(response?.status) || 0;
  const category = auditCategoryFromPath(path);
  const action = category === 'mail' && path.endsWith('/mail') ? 'mail.send' : `change.${category}`;
  const detail = status >= 400 ? `failed (${status})` : 'saved';
  const write = writeAdminAuditLog(env, {
    action,
    category,
    method,
    path,
    status,
    actor_user_id: actor?.id,
    actor_username: actor?.username || actor?.display_name || '',
    ip: requestClientIp(request),
    user_agent: request.headers.get('user-agent') || '',
    summary: buildAuditSummary({
      action,
      method,
      path,
      status,
      actorUsername: actor?.username || actor?.display_name || '',
      detail,
    }),
    meta: {
      request: requestSummary || null,
      actor_role: actor?.role || '',
    },
  });
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(write);
    return;
  }
  await write;
}

export async function deserializeEncryptedAuditRow(env, row = {}) {
  const base = {
    id: Number(row.id) || 0,
    created_at: String(row.created_at || ''),
    action: String(row.action || ''),
    category: String(row.category || ''),
    method: String(row.method || ''),
    path: String(row.path || ''),
    status: row.status == null ? null : Number(row.status),
    actor_user_id: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actor_username: String(row.actor_username || ''),
    ip: String(row.ip || ''),
    user_agent: String(row.user_agent || ''),
    summary: String(row.summary || ''),
    meta: {},
    payload_sha256: String(row.payload_sha256 || ''),
    integrity_ok: false,
    encrypted: Boolean(row.ciphertext),
  };

  if (row.ciphertext) {
    try {
      const plaintext = await decryptAuditPayload(env, row.ciphertext);
      const expected = String(row.payload_sha256 || '');
      const actual = await sha256Hex(plaintext);
      if (expected && expected !== actual) {
        return {
          ...base,
          summary: '[integrity check failed — entry sealed]',
          integrity_ok: false,
          integrity_error: 'sha256_mismatch',
        };
      }
      const parsed = JSON.parse(plaintext);
      return {
        ...base,
        action: String(parsed.action || base.action),
        category: String(parsed.category || base.category),
        method: String(parsed.method || ''),
        path: String(parsed.path || ''),
        status: parsed.status == null ? null : Number(parsed.status),
        actor_user_id: parsed.actor_user_id == null ? null : Number(parsed.actor_user_id),
        actor_username: String(parsed.actor_username || base.actor_username),
        ip: String(parsed.ip || ''),
        user_agent: String(parsed.user_agent || ''),
        summary: String(parsed.summary || ''),
        meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
        integrity_ok: true,
      };
    } catch (error) {
      return {
        ...base,
        summary: '[unable to decrypt sealed entry]',
        integrity_ok: false,
        integrity_error: String(error?.message || error || 'decrypt_failed'),
      };
    }
  }

  // Legacy plaintext rows (if any) — still viewable.
  let meta = {};
  try {
    meta = JSON.parse(String(row.meta_json || '{}'));
  } catch {
    meta = {};
  }
  return {
    ...base,
    meta,
    integrity_ok: !row.payload_sha256,
    encrypted: false,
  };
}

export function serializeAuditRow(row = {}) {
  let meta = {};
  try {
    meta = JSON.parse(String(row.meta_json || '{}'));
  } catch {
    meta = {};
  }
  return {
    id: Number(row.id) || 0,
    created_at: String(row.created_at || ''),
    action: String(row.action || ''),
    category: String(row.category || ''),
    method: String(row.method || ''),
    path: String(row.path || ''),
    status: row.status == null ? null : Number(row.status),
    actor_user_id: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actor_username: String(row.actor_username || ''),
    ip: String(row.ip || ''),
    user_agent: String(row.user_agent || ''),
    summary: String(row.summary || ''),
    meta,
    payload_sha256: String(row.payload_sha256 || ''),
    integrity_ok: true,
    encrypted: Boolean(row.ciphertext),
  };
}

export async function listAdminAuditLogs(env, {
  limit = 200,
  offset = 0,
  action = '',
  actor = '',
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 2000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const clauses = [];
  const binds = [];
  const actionFilter = String(action || '').trim();
  const actorFilter = String(actor || '').trim().toLowerCase();
  if (actionFilter) {
    clauses.push('action = ?');
    binds.push(actionFilter);
  }
  if (actorFilter) {
    clauses.push('LOWER(actor_username) LIKE ?');
    binds.push(`%${actorFilter}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const countSql = `SELECT COUNT(*) AS total FROM ${ADMIN_AUDIT_TABLE} ${where}`;
  const listSql = `SELECT id, created_at, action, category, method, path, status, actor_user_id, actor_username,
            ip, user_agent, summary, meta_json, payload_sha256, ciphertext, enc_version
     FROM ${ADMIN_AUDIT_TABLE}
     ${where}
     ORDER BY datetime(created_at) DESC, id DESC
     LIMIT ? OFFSET ?`;
  assertAuditSqlIsAppendOnly(countSql);
  assertAuditSqlIsAppendOnly(listSql);
  const countRow = await env.DB.prepare(countSql).bind(...binds).first();
  const rows = await env.DB.prepare(listSql).bind(...binds, safeLimit, safeOffset).all();
  const entries = [];
  for (const row of rows.results || []) {
    entries.push(await deserializeEncryptedAuditRow(env, row));
  }
  return {
    total: Number(countRow?.total) || 0,
    limit: safeLimit,
    offset: safeOffset,
    entries,
    storage: 'encrypted-d1',
    integrity: 'sha-256',
    encryption: 'aes-256-gcm',
    access: 'super_admin_only',
    mode: 'view_print_only',
    editable: false,
  };
}

export function buildAdminAuditExportText(entries = []) {
  const lines = [
    'EFHS Band CMS Security Audit Log',
    `Generated: ${new Date().toISOString()}`,
    'Access: Super Admin only — encrypted server-side database (AES-256-GCM + SHA-256 integrity).',
    'Mode: View / print only. Not editable.',
    '',
  ];
  for (const entry of entries) {
    lines.push('='.repeat(72));
    lines.push(`When: ${entry.created_at || ''}`);
    lines.push(`Action: ${entry.action || ''}`);
    lines.push(`Category: ${entry.category || ''}`);
    lines.push(`User: ${entry.actor_username || 'unknown'}${entry.actor_user_id ? ` (#${entry.actor_user_id})` : ''}`);
    lines.push(`Request: ${entry.method || ''} ${entry.path || ''}`.trim());
    lines.push(`Status: ${entry.status == null ? '' : entry.status}`);
    lines.push(`IP: ${entry.ip || ''}`);
    lines.push(`Summary: ${entry.summary || ''}`);
    if (entry.payload_sha256) lines.push(`SHA-256: ${entry.payload_sha256}`);
    if (entry.integrity_ok === false) lines.push('Integrity: FAILED');
    if (entry.user_agent) lines.push(`User-Agent: ${entry.user_agent}`);
    if (entry.meta && Object.keys(entry.meta).length) {
      lines.push('Details:');
      lines.push(JSON.stringify(entry.meta, null, 2));
    }
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

export function enrichMailAuditMeta({
  subject = '',
  html = '',
  text = '',
  recipients = [],
  attachments = [],
  replyTo = '',
  results = [],
} = {}) {
  const bodyText = String(text || '').trim()
    || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    subject: String(subject || '').trim(),
    reply_to: String(replyTo || '').trim(),
    body_excerpt: bodyText.slice(0, 1500),
    body_length: bodyText.length,
    recipients: (Array.isArray(recipients) ? recipients : []).map((item) => ({
      user_id: item?.user_id ?? null,
      email: String(item?.email || '').trim().toLowerCase(),
    })),
    attachments: (Array.isArray(attachments) ? attachments : []).map((file) => ({
      filename: String(file?.filename || file?.name || 'attachment'),
      size: Number(file?.size) || 0,
      type: String(file?.type || file?.content_type || ''),
    })),
    results: (Array.isArray(results) ? results : []).map((item) => ({
      user_id: item?.user_id ?? null,
      email: String(item?.email || '').trim().toLowerCase(),
      ok: Boolean(item?.ok),
      error: item?.error ? String(item.error) : '',
    })),
  };
}

/* ---- PDF export helpers (kept inside this module so site/page work cannot alter them) ---- */

export function pdfSafeText(value = '') {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function assemblePdfBase64(objects = []) {
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  let binary = '';
  for (let i = 0; i < pdf.length; i += 1) binary += String.fromCharCode(pdf.charCodeAt(i) & 0xff);
  return btoa(binary);
}

export function wrapPdfLine(text = '', maxChars = 96) {
  const raw = String(text ?? '');
  if (!raw) return [''];
  if (raw.length <= maxChars) return [raw];
  const out = [];
  let remaining = raw;
  while (remaining.length > maxChars) {
    let breakAt = remaining.lastIndexOf(' ', maxChars);
    if (breakAt < Math.floor(maxChars * 0.45)) breakAt = maxChars;
    out.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).replace(/^\s+/, '');
  }
  if (remaining) out.push(remaining);
  return out;
}

export function buildMultiPageTextPdfBase64(lines = [], { title = 'Document' } = {}) {
  const topY = 742;
  const bottomY = 48;
  const lineHeight = 11;
  const titleSize = 16;
  const bodySize = 9;
  const maxChars = 96;
  const wrapped = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    for (const part of String(line ?? '').split('\n')) {
      wrapped.push(...wrapPdfLine(part, maxChars));
    }
  }

  const pages = [];
  let bucket = [];
  let y = topY - 28;
  const pushPage = () => {
    pages.push(bucket);
    bucket = [];
    y = topY;
  };

  for (const line of wrapped) {
    if (y - lineHeight < bottomY) pushPage();
    bucket.push(line);
    y -= lineHeight;
  }
  if (bucket.length || !pages.length) pages.push(bucket);

  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageObjNumbers = pages.map((_, index) => 3 + index * 2);
  const fontObjNum = 3 + pages.length * 2;
  objects.push(`<< /Type /Pages /Kids [${pageObjNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);

  pages.forEach((pageLines, pageIndex) => {
    const contentOps = [];
    if (pageIndex === 0) {
      contentOps.push(`BT /F1 ${titleSize} Tf 48 ${topY} Td (${pdfSafeText(title)}) Tj ET`);
    } else {
      contentOps.push(`BT /F1 10 Tf 48 ${topY} Td (${pdfSafeText(`${title} (continued)`)}) Tj ET`);
    }
    let cursorY = topY - 28;
    for (const line of pageLines) {
      contentOps.push(`BT /F1 ${bodySize} Tf 48 ${cursorY} Td (${pdfSafeText(line)}) Tj ET`);
      cursorY -= lineHeight;
    }
    const stream = `${contentOps.join('\n')}\n`;
    const pageObjNum = pageObjNumbers[pageIndex];
    const contentObjNum = pageObjNum + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources<< /Font<< /F1 ${fontObjNum} 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${stream.length} >>stream\n${stream}endstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const numbered = objects.map((body, index) => `${index + 1} 0 obj${body}endobj\n`);
  return assemblePdfBase64(numbered);
}

export function buildAdminAuditExportPdfBase64(entries = []) {
  const text = buildAdminAuditExportText(entries);
  const lines = String(text || '')
    .split('\n')
    .filter((line, index) => !(index === 0 && /security audit log/i.test(line)));
  return buildMultiPageTextPdfBase64(lines, { title: 'EFHS Band CMS Security Audit Log' });
}
