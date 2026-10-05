-- Incremental, idempotent migration: 2026-10-04.4 → 2026-10-04.5
-- Linear-chain enforcement, pending drain table, deleted-user name map.
-- Do NOT UPDATE or DELETE admin_audit_log rows.
--
--   npx wrangler d1 execute efhsband-dev-db --remote -c wrangler.dev.toml --file migrations/2026-10-04.5.sql
-- Do NOT run this against production from a laptop or Cloud Agent.
--
-- Column ALTERs are also applied by Worker applyIncrementalSchema (try/catch).

ALTER TABLE admin_audit_log ADD COLUMN source_pending_id INTEGER;

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_source_pending ON admin_audit_log (source_pending_id) WHERE source_pending_id IS NOT NULL;

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
END;

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
