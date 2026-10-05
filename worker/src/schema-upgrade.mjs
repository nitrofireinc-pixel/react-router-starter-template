import { PUBLIC_READ_INDEX_SQL } from './d1-read-policy.mjs';
import { migrateStoredUserPermissionGrants } from './page-permissions.mjs';

export const PREVIOUS_DB_SCHEMA_VERSION = '2026-10-03.1';
export const MAX_D1_QUERIES_PER_INVOCATION = 40;

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

export const AUDIT_LOG_LINEAR_INSERT_TRIGGER_SQL = `
CREATE TRIGGER IF NOT EXISTS admin_audit_log_linear_insert
BEFORE INSERT ON admin_audit_log
WHEN (
  (SELECT COALESCE(MAX(id), 0) FROM admin_audit_log)
  >=
  COALESCE((SELECT CAST(value AS INTEGER) FROM site_content WHERE key = 'audit_chain_cutover_id'), 0)
)
BEGIN
  SELECT RAISE(ABORT, 'audit-chain-fork')
  WHERE CASE
    WHEN (SELECT MAX(id) FROM admin_audit_log) IS NULL THEN
      NEW.prev_id IS NULL OR NEW.prev_id != 0 OR NEW.prev_sha256 != ''
    ELSE
      NEW.prev_id IS NULL
      OR NEW.prev_id != (SELECT MAX(id) FROM admin_audit_log)
      OR NEW.prev_sha256 != (SELECT payload_sha256 FROM admin_audit_log WHERE id = (SELECT MAX(id) FROM admin_audit_log))
  END;
END
`.trim();

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
    AUDIT_LOG_PREV_SHA_COLUMN_SQL,
    AUDIT_LOG_PREV_ID_COLUMN_SQL,
    AUDIT_LOG_SOURCE_PENDING_COLUMN_SQL,
    AUDIT_LOG_PENDING_TABLE_SQL,
    AUDIT_LOG_ACTOR_NAMES_TABLE_SQL,
    AUDIT_LOG_ACTOR_NAMES_INDEX_SQL,
    AUDIT_LOG_CREATED_INDEX_SQL,
    AUDIT_LOG_ACTION_INDEX_SQL,
    AUDIT_LOG_PREV_ID_UNIQUE_SQL,
    AUDIT_LOG_SOURCE_PENDING_UNIQUE_SQL,
    AUDIT_LOG_ACTOR_USERNAME_INDEX_SQL,
    AUDIT_LOG_ACTOR_USER_ID_INDEX_SQL,
    AUDIT_LOG_NO_UPDATE_TRIGGER_SQL,
    AUDIT_LOG_NO_DELETE_TRIGGER_SQL,
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
    '-- Incremental, idempotent go-live migration: 2026-10-03.1 → 2026-10-04.5',
    '-- Run at deploy time (owner sign-off only):',
    '--   npx wrangler d1 execute efhsband-db --remote --file migrations/2026-10-04.5.sql',
    '-- Do NOT run this against production from a laptop or Cloud Agent.',
    '-- migrations/2026-10-04.2.sql is IF NOT EXISTS only (safe to re-run).',
    '-- Column ALTERs are in the SQL files and also applied by Worker try/catch.',
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

export async function applyIncrementalSchema(env, { writeVersion } = {}) {
  const statements = incrementalSchemaStatements();
  if (statements.length + 1 > MAX_D1_QUERIES_PER_INVOCATION) {
    throw new Error(`incremental schema has ${statements.length + 1} statements; Free plan cap is ${MAX_D1_QUERIES_PER_INVOCATION}`);
  }
  const alters = statements.filter((sql) => /^\s*ALTER TABLE/i.test(sql));
  const rest = statements.filter((sql) => !/^\s*ALTER TABLE/i.test(sql));
  for (const sql of alters) {
    try {
      await env.DB.prepare(sql).run();
    } catch (error) {
      if (isIdempotentSchemaError(error)) continue;
      throw error;
    }
  }
  if (typeof env?.DB?.batch === 'function' && rest.length) {
    await env.DB.batch(rest.map((sql) => env.DB.prepare(sql)));
  } else {
    for (const sql of rest) {
      await env.DB.prepare(sql).run();
    }
  }
  await migrateStoredUserPermissionGrants(env);
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
