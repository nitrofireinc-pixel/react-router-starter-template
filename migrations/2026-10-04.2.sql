-- Incremental, idempotent DEV/prod-ready migration: 2026-10-04.1 → 2026-10-04.2
-- Security audit log: append-only triggers and lookup indexes.
-- Existing admin_audit_log rows are not updated or deleted.
--
-- This file is safe to run twice. It contains only CREATE IF NOT EXISTS /
-- INSERT ON CONFLICT statements. SQLite/D1 cannot ADD COLUMN IF NOT EXISTS,
-- so prev_sha256 is added by Worker initDb / applyIncrementalSchema (ALTER
-- wrapped in try/catch; duplicate-column is ignored).
--
-- DEV:
--   npx wrangler d1 execute efhsband-dev-db --remote -c wrangler.dev.toml --file migrations/2026-10-04.2.sql
-- Prod (owner sign-off only, after merge to main):
--   1. Deploy Worker efhsband-live from main.
--   2. First request runs initDb → applyIncrementalSchema, which adds
--      prev_sha256 if missing and applies the same indexes/triggers.
--   3. Optional: run this file against efhsband-db for indexes/triggers only.
--      Do not add an unguarded ALTER here.
--
-- Worker initDb applies the same IF NOT EXISTS statements when it sees an older schema.

CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log (created_at, id);
CREATE INDEX IF NOT EXISTS idx_audit_action_created ON admin_audit_log (action, created_at);

CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_update
BEFORE UPDATE ON admin_audit_log
BEGIN
  SELECT RAISE(ABORT, 'append-only');
END;

CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_delete
BEFORE DELETE ON admin_audit_log
BEGIN
  SELECT RAISE(ABORT, 'append-only');
END;

INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.2') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
