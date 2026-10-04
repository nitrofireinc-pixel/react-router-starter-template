-- Incremental, idempotent DEV/prod-ready migration: 2026-10-04.1 → 2026-10-04.2
-- Security audit log: append-only triggers, lookup indexes, hash-chain column.
-- Existing admin_audit_log rows are not updated or deleted.
-- Run at deploy time on the target D1 (DEV: efhsband-dev-db):
--   npx wrangler d1 execute efhsband-dev-db --remote -c wrangler.dev.toml --file migrations/2026-10-04.2.sql
-- Safe to re-run. ALTER ADD COLUMN may report "duplicate column name" after the first run; ignore that.
-- Worker initDb applies the same statements when it sees an older schema.

ALTER TABLE admin_audit_log ADD COLUMN prev_sha256 TEXT NOT NULL DEFAULT '';

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
