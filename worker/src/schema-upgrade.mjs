import { PUBLIC_READ_INDEX_SQL } from './d1-read-policy.mjs';

export const PREVIOUS_DB_SCHEMA_VERSION = '2026-10-03.1';
export const MAX_D1_QUERIES_PER_INVOCATION = 40;

export const AUDIT_LOG_PREV_SHA_COLUMN_SQL =
  "ALTER TABLE admin_audit_log ADD COLUMN prev_sha256 TEXT NOT NULL DEFAULT ''";

export const AUDIT_LOG_CREATED_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log (created_at, id)';

export const AUDIT_LOG_ACTION_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_audit_action_created ON admin_audit_log (action, created_at)';

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
    AUDIT_LOG_CREATED_INDEX_SQL,
    AUDIT_LOG_ACTION_INDEX_SQL,
    AUDIT_LOG_NO_UPDATE_TRIGGER_SQL,
    AUDIT_LOG_NO_DELETE_TRIGGER_SQL,
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
    '-- Incremental, idempotent go-live migration: 2026-10-03.1 → 2026-10-04.2',
    '-- Run at deploy time (owner sign-off only):',
    '--   npx wrangler d1 execute efhsband-db --remote --file migrations/2026-10-04.2.sql',
    '-- Do NOT run this against production from a laptop or Cloud Agent.',
    '-- migrations/2026-10-04.2.sql is IF NOT EXISTS only (safe to re-run).',
    '-- prev_sha256 ALTER is applied by Worker initDb / applyIncrementalSchema.',
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
  if (typeof env?.DB?.batch === 'function' && rest.length) {
    await env.DB.batch(rest.map((sql) => env.DB.prepare(sql)));
  } else {
    for (const sql of rest) {
      await env.DB.prepare(sql).run();
    }
  }
  for (const sql of alters) {
    try {
      await env.DB.prepare(sql).run();
    } catch (error) {
      if (isIdempotentSchemaError(error)) continue;
      throw error;
    }
  }
  if (typeof writeVersion === 'function') await writeVersion(env);
}

export function schemaNeedsIncrementalUpgrade(currentValue, targetVersion) {
  const current = currentValue == null ? '' : String(currentValue);
  const target = String(targetVersion || '');
  if (!target) return false;
  if (!current) return true;
  return current !== target;
}
