-- Incremental, idempotent migration: 2026-10-04.4 → 2026-10-04.5
-- Pending drain table and deleted-user name map.
-- Do NOT UPDATE or DELETE admin_audit_log rows.
-- No bare ALTERs — Worker adds source_pending_id via pragma_table_info.
--
-- Safe deploy: turn maintenance on, deploy the new Worker, let initDb
-- self-migrate on the first request. Do not run this file by hand on D1.

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
);

CREATE TABLE IF NOT EXISTS admin_audit_actor_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_actor_names_user ON admin_audit_actor_names (user_id, id);

CREATE TRIGGER IF NOT EXISTS admin_audit_pending_no_update
BEFORE UPDATE ON admin_audit_pending
BEGIN
  SELECT RAISE(ABORT, 'append-only');
END;

CREATE TRIGGER IF NOT EXISTS admin_audit_pending_no_delete
BEFORE DELETE ON admin_audit_pending
BEGIN
  SELECT RAISE(ABORT, 'append-only');
END;

INSERT INTO site_content (key, value)
SELECT 'audit_chain_cutover_id', CAST(COALESCE((SELECT MAX(id) FROM admin_audit_log), 0) AS TEXT)
WHERE NOT EXISTS (SELECT 1 FROM site_content WHERE key = 'audit_chain_cutover_id');

INSERT INTO admin_audit_actor_names (user_id, username, display_name)
SELECT id, username, display_name FROM users
WHERE id NOT IN (SELECT user_id FROM admin_audit_actor_names);

INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.5') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
