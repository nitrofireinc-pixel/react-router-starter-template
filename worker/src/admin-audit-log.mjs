/**
 * Super-admin-only CMS security audit log.
 * Stored in D1 (admin_audit_log) — not a public asset folder.
 */

export const ADMIN_AUDIT_TABLE = 'admin_audit_log';

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

export function isMutatingHttpMethod(method = '') {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

export function shouldAuditAdminApiRequest(pathname = '', method = '') {
  const path = String(pathname || '');
  if (!path.startsWith('/api/admin')) return false;
  if (path === '/api/admin/security-log' || path === '/api/admin/security-log.txt') return false;
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
  let metaJson = '{}';
  try {
    metaJson = JSON.stringify(entry.meta && typeof entry.meta === 'object' ? redactAuditObject(entry.meta) : {});
  } catch {
    metaJson = '{}';
  }
  if (metaJson.length > 12000) {
    metaJson = JSON.stringify({ truncated: true, preview: metaJson.slice(0, 4000) });
  }
  try {
    const result = await env.DB.prepare(
      `INSERT INTO ${ADMIN_AUDIT_TABLE}
        (action, category, method, path, status, actor_user_id, actor_username, ip, user_agent, summary, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      action,
      category,
      method,
      path,
      Number.isFinite(status) ? status : null,
      Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
      actorUsername,
      ip,
      userAgent,
      summary,
      metaJson,
    ).run();
    return { id: result?.meta?.last_row_id || null };
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

export async function listAdminAuditLogs(env, {
  limit = 200,
  offset = 0,
  action = '',
  actor = '',
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
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
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM ${ADMIN_AUDIT_TABLE} ${where}`,
  ).bind(...binds).first();
  const rows = await env.DB.prepare(
    `SELECT id, created_at, action, category, method, path, status, actor_user_id, actor_username,
            ip, user_agent, summary, meta_json
     FROM ${ADMIN_AUDIT_TABLE}
     ${where}
     ORDER BY datetime(created_at) DESC, id DESC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, safeLimit, safeOffset).all();
  return {
    total: Number(countRow?.total) || 0,
    limit: safeLimit,
    offset: safeOffset,
    entries: (rows.results || []).map(serializeAuditRow),
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
  };
}

export function buildAdminAuditExportText(entries = []) {
  const lines = [
    'EFHS Band CMS Security Audit Log',
    `Generated: ${new Date().toISOString()}`,
    'Access: Super Admin only — stored in secured server-side database (not a public folder).',
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
