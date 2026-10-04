import { PUBLIC_READ_INDEX_SQL } from './d1-read-policy.mjs';

export const PREVIOUS_DB_SCHEMA_VERSION = '2026-10-03.1';
export const MAX_D1_QUERIES_PER_INVOCATION = 40;

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

/** Idempotent 2026-10-03.1 → 2026-10-04.1 statements. No seed rewrites. Join visual rows stay. */
export function incrementalSchemaStatements() {
  return [
    VISUAL_PAGES_TABLE_SQL,
    VISUAL_PAGE_VERSIONS_TABLE_SQL,
    VISUAL_PAGE_VERSIONS_INDEX_SQL,
    ...PUBLIC_READ_INDEX_SQL,
  ];
}

export function renderIncrementalSchemaSql(targetVersion) {
  const statements = incrementalSchemaStatements();
  const version = String(targetVersion || '').trim();
  return [
    '-- Incremental, idempotent go-live migration: 2026-10-03.1 → 2026-10-04.1',
    '-- Run at deploy time (owner sign-off only):',
    '--   npx wrangler d1 execute efhsband-db --remote --file migrations/2026-10-04.1.sql',
    '-- Do NOT run this against production from a laptop or Cloud Agent.',
    '-- Safe to re-run. Worker initDb applies the same statements when it sees an older schema.',
    '',
    ...statements.map((sql) => `${sql.replace(/\s+/g, ' ').trim()};`),
    '',
    'INSERT INTO site_content (key, value) VALUES (\'schema_version\', '
      + `'${version}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    '',
  ].join('\n');
}

export async function applyIncrementalSchema(env, { writeVersion } = {}) {
  const statements = incrementalSchemaStatements();
  if (statements.length + 1 > MAX_D1_QUERIES_PER_INVOCATION) {
    throw new Error(`incremental schema has ${statements.length + 1} statements; Free plan cap is ${MAX_D1_QUERIES_PER_INVOCATION}`);
  }
  if (typeof env?.DB?.batch === 'function') {
    await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
  } else {
    for (const sql of statements) {
      await env.DB.prepare(sql).run();
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
