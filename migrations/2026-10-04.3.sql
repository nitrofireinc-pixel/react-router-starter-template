-- Incremental, idempotent migration: 2026-10-04.2 → 2026-10-04.3
-- Staff Email: per-user address book + sent history (no attachment bytes, no R2).
-- Existing admin_audit_log rows are not updated or deleted.
--
-- This file is safe to run twice. CREATE TABLE/INDEX IF NOT EXISTS only.
--
-- DEV (owner will run when deploying this branch — do not run until asked):
--   npx wrangler d1 execute efhsband-dev-db --remote -c wrangler.dev.toml --file migrations/2026-10-04.3.sql
-- Prod (owner sign-off only, after merge to main):
--   Worker initDb → applyIncrementalSchema creates the same tables/indexes.
--
-- Worker initDb applies the same IF NOT EXISTS statements when it sees an older schema.

CREATE TABLE IF NOT EXISTS mail_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'typed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_user_id, email)
);

CREATE TABLE IF NOT EXISTS mail_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  subject TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  resend_id TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mail_contacts_owner ON mail_contacts (owner_user_id, email);
CREATE INDEX IF NOT EXISTS idx_mail_messages_owner_created ON mail_messages (owner_user_id, created_at);

INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.3') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
