-- Incremental, idempotent migration: 2026-10-04.3 → 2026-10-04.4
-- Safe to re-run on a database that already has prev_sha256 / prev_id.
-- Do NOT UPDATE or DELETE admin_audit_log rows.
--
-- SQLite/D1 cannot ADD COLUMN IF NOT EXISTS. Bare ALTERs are Worker-only
-- (pragma_table_info in applyIncrementalSchema). This file has no ALTERs.
--
-- Safe deploy: turn maintenance on, deploy the new Worker, let initDb
-- self-migrate on the first request. Do not run this file by hand on D1.

CREATE INDEX IF NOT EXISTS idx_audit_actor_username ON admin_audit_log (actor_username);
CREATE INDEX IF NOT EXISTS idx_audit_actor_user_id ON admin_audit_log (actor_user_id);

INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.4') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
