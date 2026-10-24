// Uploaded meeting-minutes originals (doc, docx, pdf) kept in R2. Additive table only;
// booster_meeting_minutes is not altered. Uploaded minutes are readable by every signed-in
// user but only a Super Admin may change or remove them.

export const MINUTES_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const MINUTES_UPLOAD_MAX_LABEL = '10 MB';

export function minutesFilesTableSql() {
  return `CREATE TABLE IF NOT EXISTS minutes_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minutes_id INTEGER NOT NULL UNIQUE,
    r2_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
}

/** Identify a minutes upload from its bytes, never from the name alone. */
export function sniffMinutesFile(bytes, filename = '') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const ext = String(filename).toLowerCase().split('.').pop();
  const is = (...sig) => sig.every((v, i) => b[i] === v);
  if (is(0x25, 0x50, 0x44, 0x46, 0x2d) && ext === 'pdf') return { ext: 'pdf', mime: 'application/pdf' };
  if (is(0x50, 0x4b, 0x03, 0x04) && ext === 'docx') return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (is(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1) && ext === 'doc') return { ext: 'doc', mime: 'application/msword' };
  return null;
}

let ready = false;
export async function ensureMinutesFiles(env) {
  if (ready) return;
  await env.DB.prepare(minutesFilesTableSql()).run();
  ready = true;
}

export async function getMinutesFile(env, minutesId) {
  try {
    await ensureMinutesFiles(env);
    return await env.DB.prepare('SELECT * FROM minutes_files WHERE minutes_id = ?').bind(minutesId).first() || null;
  } catch { return null; }
}

export async function listMinutesFileIds(env) {
  try {
    await ensureMinutesFiles(env);
    const rows = await env.DB.prepare('SELECT minutes_id, filename, mime FROM minutes_files').all();
    return new Map((rows.results || []).map((r) => [Number(r.minutes_id), r]));
  } catch { return new Map(); }
}

export async function saveMinutesFile(env, row) {
  await ensureMinutesFiles(env);
  await env.DB.prepare('INSERT INTO minutes_files (minutes_id, r2_key, filename, mime, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(row.minutes_id, row.r2_key, row.filename, row.mime, row.size, row.uploaded_by ?? null).run();
}

export async function deleteMinutesFile(env, minutesId) {
  const file = await getMinutesFile(env, minutesId);
  if (!file) return;
  try { await env.FILES?.delete(file.r2_key); } catch { /* best effort */ }
  try { await env.DB.prepare('DELETE FROM minutes_files WHERE minutes_id = ?').bind(minutesId).run(); } catch { /* ignore */ }
}
