-- Incremental, idempotent migration: 2026-10-04.5 → 2026-10-04.6
-- Linear trigger that allows old-Worker NULL prev_id; export session table.
-- Do NOT UPDATE or DELETE admin_audit_log rows.
-- No bare ALTERs — Worker adds missing columns via pragma_table_info, then
-- creates indexes that depend on those columns.
--
-- Safe deploy: turn maintenance on, deploy the new Worker, let initDb
-- self-migrate on the first request. Do not run this file by hand on D1.

CREATE TABLE IF NOT EXISTS admin_audit_export_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sid TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  format TEXT NOT NULL DEFAULT '',
  filters_json TEXT NOT NULL DEFAULT '{}',
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_export_sid ON admin_audit_export_sessions (sid, id);

CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log (created_at, id);
CREATE INDEX IF NOT EXISTS idx_audit_action_created ON admin_audit_log (action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor_username ON admin_audit_log (actor_username);
CREATE INDEX IF NOT EXISTS idx_audit_actor_user_id ON admin_audit_log (actor_user_id);

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

CREATE TRIGGER IF NOT EXISTS site_content_audit_keys_no_update
BEFORE UPDATE ON site_content
WHEN OLD.key LIKE 'audit_%'
BEGIN
  SELECT RAISE(ABORT, 'audit-settings-write-once');
END;

CREATE TRIGGER IF NOT EXISTS site_content_audit_keys_no_delete
BEFORE DELETE ON site_content
WHEN OLD.key LIKE 'audit_%'
BEGIN
  SELECT RAISE(ABORT, 'audit-settings-write-once');
END;

INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.6') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
