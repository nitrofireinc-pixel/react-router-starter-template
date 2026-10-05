-- Incremental, idempotent migration: 2026-10-04.3 → 2026-10-04.4
-- Self-contained: add chain columns (Worker ignores "duplicate column" on re-run),
-- then indexes, then the linear-insert trigger.
-- Do NOT UPDATE or DELETE admin_audit_log rows.
--
--   npx wrangler d1 execute efhsband-dev-db --remote -c wrangler.dev.toml --file migrations/2026-10-04.4.sql
-- Do NOT run this against production from a laptop or Cloud Agent.
--
-- SQLite/D1 cannot ADD COLUMN IF NOT EXISTS. Re-running this file after the
-- columns exist reports "duplicate column name"; applyIncrementalSchema treats
-- that as success. Fresh databases that already have admin_audit_log from
-- 2026-10-04.2 need these ALTERs before the unique prev_id index.

ALTER TABLE admin_audit_log ADD COLUMN prev_sha256 TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_audit_log ADD COLUMN prev_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_prev_id ON admin_audit_log (prev_id) WHERE prev_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_actor_username ON admin_audit_log (actor_username);
CREATE INDEX IF NOT EXISTS idx_audit_actor_user_id ON admin_audit_log (actor_user_id);

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

INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.4') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
