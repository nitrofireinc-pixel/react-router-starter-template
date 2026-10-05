-- Incremental, idempotent migration: 2026-10-04.3 → 2026-10-04.4
-- Race-proof audit chain: unique prev_id (column is added by Worker ALTER).
-- Actor search indexes for Super Admin user filter before pagination.
-- Do NOT UPDATE or DELETE admin_audit_log rows.
--
--   npx wrangler d1 execute efhsband-dev-db --remote -c wrangler.dev.toml --file migrations/2026-10-04.4.sql
-- Do NOT run this against production from a laptop or Cloud Agent.

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_prev_id ON admin_audit_log (prev_id) WHERE prev_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_actor_username ON admin_audit_log (actor_username);
CREATE INDEX IF NOT EXISTS idx_audit_actor_user_id ON admin_audit_log (actor_user_id);

INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.4') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
