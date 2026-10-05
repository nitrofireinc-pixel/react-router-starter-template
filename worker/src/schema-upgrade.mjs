import { PUBLIC_READ_INDEX_SQL } from './d1-read-policy.mjs';
import { migrateStoredUserPermissionGrants } from './page-permissions.mjs';

export const PREVIOUS_DB_SCHEMA_VERSION = '2026-10-03.1';
export const MAX_D1_QUERIES_PER_INVOCATION = 40;
export const D1_REQUEST_QUERY_CAP = 50;
export const D1_REQUEST_QUERY_SOFT_CAP = 45;

export const AUDIT_LOG_PREV_SHA_COLUMN_SQL =
  "ALTER TABLE admin_audit_log ADD COLUMN prev_sha256 TEXT NOT NULL DEFAULT ''";

export const AUDIT_LOG_PREV_ID_COLUMN_SQL =
  'ALTER TABLE admin_audit_log ADD COLUMN prev_id INTEGER';

export const AUDIT_LOG_SOURCE_PENDING_COLUMN_SQL =
  'ALTER TABLE admin_audit_log ADD COLUMN source_pending_id INTEGER';

export const AUDIT_LOG_PENDING_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS admin_audit_pending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'admin',
  actor_user_id INTEGER,
  actor_username TEXT NOT NULL DEFAULT '',
  payload_sha256 TEXT NOT NULL DEFAULT '',
  ciphertext TEXT NOT NULL DEFAULT '',
  enc_version INTEGER NOT NULL DEFAULT 0,
  key_id TEXT NOT NULL DEFAULT '',
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`.trim();

export const AUDIT_LOG_ACTOR_NAMES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS admin_audit_actor_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`.trim();

export const AUDIT_LOG_ACTOR_NAMES_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_audit_actor_names_user ON admin_audit_actor_names (user_id, id)';

export const AUDIT_CHAIN_CUTOVER_KEY = 'audit_chain_cutover_id';

export const AUDIT_LOG_LINEAR_INSERT_TRIGGER_DROP_SQL =
  'DROP TRIGGER IF EXISTS admin_audit_log_linear_insert';

/** Old Workers omit prev_id (NULL). New Workers always send prev_id = MAX(id). */
export const AUDIT_LOG_LINEAR_INSERT_TRIGGER_SQL = `
CREATE TRIGGER IF NOT EXISTS admin_audit_log_linear_insert
BEFORE INSERT ON admin_audit_log
WHEN (
  NEW.prev_id IS NOT NULL
  AND (SELECT COALESCE(MAX(id), 0) FROM admin_audit_log)
  >=
  COALESCE((SELECT CAST(value AS INTEGER) FROM site_content WHERE key = 'audit_chain_cutover_id'), 0)
)
BEGIN
  SELECT RAISE(ABORT, 'audit-chain-fork')
  WHERE CASE
    WHEN (SELECT MAX(id) FROM admin_audit_log) IS NULL THEN
      NEW.prev_id != 0 OR NEW.prev_sha256 != ''
    ELSE
      NEW.prev_id != (SELECT MAX(id) FROM admin_audit_log)
      OR NEW.prev_sha256 != (SELECT payload_sha256 FROM admin_audit_log WHERE id = (SELECT MAX(id) FROM admin_audit_log))
  END;
END
`.trim();

export const AUDIT_LOG_EXPORT_SESSIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS admin_audit_export_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sid TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  format TEXT NOT NULL DEFAULT '',
  filters_json TEXT NOT NULL DEFAULT '{}',
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`.trim();

export const AUDIT_LOG_EXPORT_SESSIONS_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_audit_export_sid ON admin_audit_export_sessions (sid, id)';

export const AUDIT_LOG_REQUIRED_COLUMNS = Object.freeze([
  { name: 'prev_sha256', sql: "ALTER TABLE admin_audit_log ADD COLUMN prev_sha256 TEXT NOT NULL DEFAULT ''" },
  { name: 'prev_id', sql: 'ALTER TABLE admin_audit_log ADD COLUMN prev_id INTEGER' },
  { name: 'source_pending_id', sql: 'ALTER TABLE admin_audit_log ADD COLUMN source_pending_id INTEGER' },
]);

export const AUDIT_LOG_PENDING_NO_UPDATE_TRIGGER_SQL = `
CREATE TRIGGER IF NOT EXISTS admin_audit_pending_no_update
BEFORE UPDATE ON admin_audit_pending
BEGIN
  SELECT RAISE(ABORT, 'append-only');
END
`.trim();

export const AUDIT_LOG_PENDING_NO_DELETE_TRIGGER_SQL = `
CREATE TRIGGER IF NOT EXISTS admin_audit_pending_no_delete
BEFORE DELETE ON admin_audit_pending
BEGIN
  SELECT RAISE(ABORT, 'append-only');
END
`.trim();

export const AUDIT_LOG_CREATED_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log (created_at, id)';

export const AUDIT_LOG_ACTION_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_audit_action_created ON admin_audit_log (action, created_at)';

export const AUDIT_LOG_PREV_ID_UNIQUE_SQL =
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_prev_id ON admin_audit_log (prev_id) WHERE prev_id IS NOT NULL';

export const AUDIT_LOG_SOURCE_PENDING_UNIQUE_SQL =
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_source_pending ON admin_audit_log (source_pending_id) WHERE source_pending_id IS NOT NULL';

export const AUDIT_LOG_ACTOR_USERNAME_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_audit_actor_username ON admin_audit_log (actor_username)';

export const AUDIT_LOG_ACTOR_USER_ID_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_audit_actor_user_id ON admin_audit_log (actor_user_id)';

export const AUDIT_LOG_NO_UPDATE_TRIGGER_SQL = `
CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_update
BEFORE UPDATE ON admin_audit_log
BEGIN
  SELECT RAISE(ABORT, 'append-only');
END
`.trim();

export const AUDIT_LOG_NO_DELETE_TRIGGER_SQL = `
CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_delete
BEFORE DELETE ON admin_audit_log
BEGIN
  SELECT RAISE(ABORT, 'append-only');
END
`.trim();

export function auditLogSchemaStatements() {
  return [
    AUDIT_LOG_PENDING_TABLE_SQL,
    AUDIT_LOG_ACTOR_NAMES_TABLE_SQL,
    AUDIT_LOG_EXPORT_SESSIONS_TABLE_SQL,
    AUDIT_LOG_ACTOR_NAMES_INDEX_SQL,
    AUDIT_LOG_EXPORT_SESSIONS_INDEX_SQL,
    AUDIT_LOG_CREATED_INDEX_SQL,
    AUDIT_LOG_ACTION_INDEX_SQL,
    AUDIT_LOG_PREV_ID_UNIQUE_SQL,
    AUDIT_LOG_SOURCE_PENDING_UNIQUE_SQL,
    AUDIT_LOG_ACTOR_USERNAME_INDEX_SQL,
    AUDIT_LOG_ACTOR_USER_ID_INDEX_SQL,
    AUDIT_LOG_NO_UPDATE_TRIGGER_SQL,
    AUDIT_LOG_NO_DELETE_TRIGGER_SQL,
    AUDIT_LOG_LINEAR_INSERT_TRIGGER_DROP_SQL,
    AUDIT_LOG_LINEAR_INSERT_TRIGGER_SQL,
    AUDIT_LOG_PENDING_NO_UPDATE_TRIGGER_SQL,
    AUDIT_LOG_PENDING_NO_DELETE_TRIGGER_SQL,
  ];
}

export const VISUAL_PAGES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS visual_pages (
  slug TEXT PRIMARY KEY,
  draft_html TEXT NOT NULL DEFAULT '',
  published_html TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER
)
`.trim();

export const VISUAL_PAGE_VERSIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS visual_page_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'draft',
  html TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  created_by_name TEXT NOT NULL DEFAULT ''
)
`.trim();

export const VISUAL_PAGE_VERSIONS_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_visual_page_versions_slug ON visual_page_versions (slug, id)';

/** Idempotent 2026-10-03.1 → current statements. No seed rewrites. Join visual rows stay. */
export function incrementalSchemaStatements() {
  return [
    VISUAL_PAGES_TABLE_SQL,
    VISUAL_PAGE_VERSIONS_TABLE_SQL,
    VISUAL_PAGE_VERSIONS_INDEX_SQL,
    ...PUBLIC_READ_INDEX_SQL,
    ...auditLogSchemaStatements(),
  ];
}

export function renderIncrementalSchemaSql(targetVersion) {
  const statements = incrementalSchemaStatements();
  const version = String(targetVersion || '').trim();
  return [
    '-- Incremental, idempotent go-live migration: 2026-10-03.1 → 2026-10-04.6',
    '-- Safe deploy: maintenance on, deploy the new Worker, let initDb self-migrate',
    '-- on the first request. Do NOT run these SQL files by hand on D1.',
    '-- Column ALTERs are Worker-only (pragma_table_info). SQL files have no bare ALTERs.',
    '',
    ...statements.map((sql) => `${sql.replace(/\s+/g, ' ').trim()};`),
    '',
    'INSERT INTO site_content (key, value) VALUES (\'schema_version\', '
      + `'${version}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    '',
  ].join('\n');
}

function isIdempotentSchemaError(error) {
  return /duplicate column|already exists|duplicate object name/i.test(String(error?.message || error || ''));
}

function isSkippableSchemaError(error) {
  return isIdempotentSchemaError(error)
    || /no such table|no such column/i.test(String(error?.message || error || ''));
}

async function runSchemaStatements(env, statements = []) {
  if (typeof env?.DB?.batch === 'function' && statements.length) {
    try {
      await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
      return;
    } catch (error) {
      if (!isSkippableSchemaError(error)) throw error;
    }
  }
  for (const sql of statements) {
    try {
      await env.DB.prepare(sql).run();
    } catch (error) {
      if (isSkippableSchemaError(error)) continue;
      throw error;
    }
  }
}

export async function listTableColumnNames(env, table = 'admin_audit_log') {
  const names = new Set();
  if (!env?.DB?.prepare) return names;
  const sql = `SELECT name FROM pragma_table_info('${String(table).replace(/[^a-z0-9_]/gi, '')}')`;
  try {
    const fetched = await env.DB.prepare(sql).all();
    for (const row of fetched?.results || []) {
      if (row?.name) names.add(String(row.name));
    }
  } catch {
    try {
      const fetched = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
      for (const row of fetched?.results || []) {
        if (row?.name) names.add(String(row.name));
      }
    } catch {
      return names;
    }
  }
  return names;
}

export async function ensureAuditLogColumns(env) {
  const names = await listTableColumnNames(env, 'admin_audit_log');
  if (!names.size) return { added: [], existing: [] };
  const added = [];
  for (const column of AUDIT_LOG_REQUIRED_COLUMNS) {
    if (names.has(column.name)) continue;
    try {
      await env.DB.prepare(column.sql).run();
      names.add(column.name);
      added.push(column.name);
    } catch (error) {
      if (isIdempotentSchemaError(error)) {
        names.add(column.name);
        continue;
      }
      throw error;
    }
  }
  return { added, existing: [...names] };
}

export async function readAuditLinearTriggerSql(env) {
  try {
    const row = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'admin_audit_log_linear_insert'",
    ).first();
    return String(row?.sql || '');
  } catch {
    return '';
  }
}

export function linearTriggerAllowsLegacyNull(sql = '') {
  return /NEW\.prev_id IS NOT NULL/i.test(String(sql || ''));
}

export async function auditSchemaNeedsRepair(env) {
  const names = await listTableColumnNames(env, 'admin_audit_log');
  if (!names.size) return false;
  if (AUDIT_LOG_REQUIRED_COLUMNS.some((column) => !names.has(column.name))) return true;
  const triggerSql = await readAuditLinearTriggerSql(env);
  if (!linearTriggerAllowsLegacyNull(triggerSql)) return true;
  return false;
}

export async function applyIncrementalSchema(env, { writeVersion } = {}) {
  await ensureAuditLogColumns(env);
  const statements = incrementalSchemaStatements();
  if (statements.length + 4 > MAX_D1_QUERIES_PER_INVOCATION) {
    throw new Error(`incremental schema has ${statements.length + 4} statements; Free plan cap is ${MAX_D1_QUERIES_PER_INVOCATION}`);
  }
  await runSchemaStatements(env, statements);
  try {
    await migrateStoredUserPermissionGrants(env);
  } catch {
    // users.permissions may be missing on partial fixtures
  }
  await ensureAuditChainCutover(env);
  await backfillAuditActorNames(env);
  if (typeof writeVersion === 'function') await writeVersion(env);
}

export async function ensureAuditChainCutover(env) {
  if (!env?.DB?.prepare) return null;
  try {
    const existing = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?')
      .bind(AUDIT_CHAIN_CUTOVER_KEY)
      .first();
    if (existing?.value != null && String(existing.value).trim() !== '') {
      return Number(existing.value) || 0;
    }
  } catch {
    // site_content may be missing in unit mocks
  }
  let cutover = 0;
  try {
    const max = await env.DB.prepare('SELECT MAX(id) AS max_id FROM admin_audit_log').first();
    cutover = Number(max?.max_id) || 0;
  } catch {
    cutover = 0;
  }
  try {
    await env.DB.prepare(
      'INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
    ).bind(AUDIT_CHAIN_CUTOVER_KEY, String(cutover)).run();
  } catch {
    // ignore
  }
  return cutover;
}

export async function backfillAuditActorNames(env) {
  if (!env?.DB?.prepare) return { inserted: 0 };
  try {
    await env.DB.prepare(`
      INSERT INTO admin_audit_actor_names (user_id, username, display_name)
      SELECT id, username, display_name FROM users
      WHERE id NOT IN (SELECT user_id FROM admin_audit_actor_names)
    `).run();
  } catch {
    return { inserted: 0 };
  }
  return { inserted: 1 };
}

export function schemaNeedsIncrementalUpgrade(currentValue, targetVersion) {
  const current = currentValue == null ? '' : String(currentValue);
  const target = String(targetVersion || '');
  if (!target) return false;
  if (!current) return true;
  return current !== target;
}
