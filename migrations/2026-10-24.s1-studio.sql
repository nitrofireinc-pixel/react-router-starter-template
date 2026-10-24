-- Site Studio Phase 0 (studio_schema_version = 2026-10-24.s1).
-- Documentation only. Do NOT run by hand: the Worker applies this through
-- ensureStudioSchema() in worker/src/studio.mjs, under its own version key,
-- so DB_SCHEMA_VERSION (and the audit-log schema code) is never re-run.
-- Additive only. Audit/security tables are untouched.

ALTER TABLE cms_pages ADD COLUMN editor TEXT NOT NULL DEFAULT 'legacy'; -- skipped when present
ALTER TABLE cms_pages ADD COLUMN live_version_id INTEGER;              -- skipped when present

CREATE TABLE IF NOT EXISTS page_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  html_cache TEXT NOT NULL DEFAULT '',
  theme_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'publish',
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_versions_slug ON page_versions (slug, id);

CREATE TABLE IF NOT EXISTS page_drafts (
  slug TEXT PRIMARY KEY,
  layout_json TEXT NOT NULL,
  base_version_id INTEGER,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tokens_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
