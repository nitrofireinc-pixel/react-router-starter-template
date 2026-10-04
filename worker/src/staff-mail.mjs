/** Staff Email helpers — Gmail-style To/Cc/Bcc, per-user contacts, sent history. */

export const MAIL_ATTACHMENT_MAX_FILES = 5;
export const MAIL_ATTACHMENT_TOTAL_BYTES = 4_000_000;
export const MAIL_MAX_RECIPIENTS = 50;
export const MAIL_RATE_HOUR = 10;
export const MAIL_RATE_DAY = 30;

export const MAIL_ATTACHMENT_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip',
]);

export const MAIL_CONTACTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS mail_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'typed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_user_id, email)
)
`.trim();

export const MAIL_MESSAGES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS mail_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  subject TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  resend_id TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
)
`.trim();

export const MAIL_CONTACTS_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_mail_contacts_owner ON mail_contacts (owner_user_id, email)';

export const MAIL_MESSAGES_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_mail_messages_owner_created ON mail_messages (owner_user_id, created_at)';

export function staffMailSchemaStatements() {
  return [
    MAIL_CONTACTS_TABLE_SQL,
    MAIL_MESSAGES_TABLE_SQL,
    MAIL_CONTACTS_INDEX_SQL,
    MAIL_MESSAGES_INDEX_SQL,
  ];
}

export function isValidStaffMailEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

/** Chunked base64 so a 4 MB attachment does not walk Worker CPU byte-by-byte. */
export function bytesToBase64(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input || []);
  const chunkSize = 0x2000;
  const chunks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, slice));
  }
  return btoa(chunks.join(''));
}

export function extensionOfFilename(filename) {
  const name = String(filename || '').trim().toLowerCase();
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx) : '';
}

export function normalizeMailEmailList(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/);
  const seen = new Set();
  const emails = [];
  for (const item of raw) {
    const email = String(typeof item === 'object' && item ? (item.email || item.address || '') : item)
      .trim()
      .toLowerCase();
    if (!email || !isValidStaffMailEmail(email) || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export function uniqueMailEmails(...lists) {
  const seen = new Set();
  const emails = [];
  for (const list of lists) {
    for (const email of normalizeMailEmailList(list)) {
      if (seen.has(email)) continue;
      seen.add(email);
      emails.push(email);
    }
  }
  return emails;
}

export function assertMailRecipientCap(uniqueCount, max = MAIL_MAX_RECIPIENTS) {
  const count = Number(uniqueCount) || 0;
  if (count < 1) {
    return { ok: false, status: 422, detail: 'Add at least one To recipient.' };
  }
  if (count > max) {
    return { ok: false, status: 422, detail: `You can send to at most ${max} unique addresses (To, Cc, and Bcc combined).` };
  }
  return { ok: true };
}

export function normalizeAdminMailPayload({
  subject,
  html,
  text,
  to,
  cc,
  bcc,
  userIds,
  sanitizeHtml,
} = {}) {
  const cleanSubject = String(subject || '').trim();
  const sanitize = typeof sanitizeHtml === 'function' ? sanitizeHtml : ((value) => String(value || ''));
  const cleanHtml = sanitize(html || '');
  const toList = uniqueMailEmails(to);
  const ccList = uniqueMailEmails(cc).filter((email) => !toList.includes(email));
  const bccList = uniqueMailEmails(bcc).filter((email) => !toList.includes(email) && !ccList.includes(email));
  const unique = uniqueMailEmails(toList, ccList, bccList);
  return {
    subject: cleanSubject,
    html: cleanHtml,
    text: String(text || '').trim(),
    to: toList,
    cc: ccList,
    bcc: bccList,
    unique,
    user_ids: [...new Set((Array.isArray(userIds) ? userIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0))],
  };
}

export async function normalizeMailAttachments(files = []) {
  const list = Array.isArray(files) ? files : [];
  if (list.length > MAIL_ATTACHMENT_MAX_FILES) {
    throw new Error(`You can attach up to ${MAIL_ATTACHMENT_MAX_FILES} files.`);
  }
  let total = 0;
  const attachments = [];
  for (const file of list) {
    if (!file || typeof file.arrayBuffer !== 'function') continue;
    const filename = String(file.name || 'attachment').trim() || 'attachment';
    const ext = extensionOfFilename(filename);
    if (!MAIL_ATTACHMENT_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported attachment type for ${filename}. Allowed: PDF, Office, images, ZIP.`);
    }
    const size = Number(file.size || 0);
    if (size <= 0) throw new Error(`Attachment ${filename} is empty.`);
    total += size;
    if (total > MAIL_ATTACHMENT_TOTAL_BYTES) {
      throw new Error('Attachments exceed the 4 MB total limit.');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    attachments.push({
      filename,
      content: bytesToBase64(bytes),
      content_type: String(file.type || '').trim() || undefined,
      size,
    });
  }
  return attachments;
}

export function buildResendEmailPayload({
  to,
  cc,
  bcc,
  replyTo,
  subject,
  text,
  html,
  fromEmail,
  fromName,
  attachments,
} = {}) {
  const recipients = uniqueMailEmails(to);
  const payload = {
    from: `${fromName} <${fromEmail}>`,
    to: recipients,
    reply_to: replyTo || undefined,
    subject,
    text,
  };
  const ccList = uniqueMailEmails(cc);
  const bccList = uniqueMailEmails(bcc);
  if (ccList.length) payload.cc = ccList;
  if (bccList.length) payload.bcc = bccList;
  if (html) payload.html = html;
  if (Array.isArray(attachments) && attachments.length) {
    payload.attachments = attachments.map((file) => ({
      filename: file.filename,
      content: file.content,
      content_type: file.content_type || undefined,
    }));
  }
  return payload;
}

export function evaluateStaffMailRate(hourCount, dayCount, {
  hourLimit = MAIL_RATE_HOUR,
  dayLimit = MAIL_RATE_DAY,
} = {}) {
  const hour = Number(hourCount) || 0;
  const day = Number(dayCount) || 0;
  if (hour >= hourLimit) {
    return {
      ok: false,
      status: 429,
      detail: `You can send ${hourLimit} staff emails per hour. Try again later.`,
      hour,
      day,
    };
  }
  if (day >= dayLimit) {
    return {
      ok: false,
      status: 429,
      detail: `You can send ${dayLimit} staff emails per day. Try again tomorrow.`,
      hour,
      day,
    };
  }
  return { ok: true, hour, day };
}

export async function loadStaffMailRate(env, userId) {
  const row = await env.DB.prepare(
    `SELECT
        SUM(CASE WHEN created_at >= datetime('now', '-1 hour') THEN 1 ELSE 0 END) AS hour_n,
        SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS day_n
       FROM mail_messages
       WHERE owner_user_id = ? AND created_at >= datetime('now', '-1 day')`,
  ).bind(Number(userId)).first();
  return evaluateStaffMailRate(row?.hour_n, row?.day_n);
}

export function normalizeMailContactPayload({ email, display_name, source } = {}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidStaffMailEmail(cleanEmail)) {
    return { ok: false, status: 422, detail: 'Enter a valid email address.' };
  }
  const name = String(display_name || '').trim().slice(0, 120);
  const src = source === 'user' ? 'user' : 'typed';
  return { ok: true, email: cleanEmail, display_name: name, source: src };
}

export function parseJsonEmailList(value) {
  if (Array.isArray(value)) return normalizeMailEmailList(value);
  try {
    return normalizeMailEmailList(JSON.parse(String(value || '[]')));
  } catch {
    return [];
  }
}

export function summarizeMailMessageRow(row = {}) {
  const to = parseJsonEmailList(row.to_json);
  const cc = parseJsonEmailList(row.cc_json);
  const bcc = parseJsonEmailList(row.bcc_json);
  let attachments = [];
  try {
    attachments = JSON.parse(row.attachments_json || '[]');
  } catch {
    attachments = [];
  }
  return {
    id: Number(row.id) || 0,
    status: String(row.status || 'sent'),
    subject: String(row.subject || ''),
    html: String(row.html || ''),
    text: String(row.text || ''),
    to,
    cc,
    bcc,
    attachments: (Array.isArray(attachments) ? attachments : []).map((file) => ({
      filename: String(file?.filename || 'attachment'),
      size: Number(file?.size) || 0,
      type: String(file?.type || file?.content_type || ''),
    })),
    resend_id: String(row.resend_id || ''),
    error: String(row.error || ''),
    created_at: row.created_at || '',
    sent_at: row.sent_at || row.created_at || '',
  };
}
