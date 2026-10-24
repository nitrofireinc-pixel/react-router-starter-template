-- Site Studio Phase 1-2 (studio_schema_version = 2026-10-24.s2).
-- Documentation only. Applied by ensureStudioSchema() in worker/src/studio.mjs
-- and ensureAccountLockSchema() in worker/src/account-lock.mjs.
-- Additive only. Audit/security tables are untouched.

CREATE TABLE IF NOT EXISTS studio_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'image',
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  original_name TEXT NOT NULL DEFAULT '',
  uploaded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Each skipped when the column already exists or the table is not there yet.
ALTER TABLE themes ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE booster_meeting_minutes ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'html';
ALTER TABLE booster_meeting_minutes ADD COLUMN file_key TEXT NOT NULL DEFAULT '';
ALTER TABLE booster_meeting_minutes ADD COLUMN file_mime TEXT NOT NULL DEFAULT '';
ALTER TABLE booster_meeting_minutes ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE booster_meeting_minutes ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE booster_meeting_minutes ADD COLUMN doc_json TEXT NOT NULL DEFAULT '';

-- Account lockout (worker/src/account-lock.mjs). Not an audit table.
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, first_fail_at TEXT, locked_at TEXT,
  lock_until TEXT, lock_reason TEXT, prev_locked_at TEXT, last_ip TEXT, last_city TEXT,
  last_region TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS unlock_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT, expires_at TEXT, used_at TEXT, requested_ip TEXT
);
