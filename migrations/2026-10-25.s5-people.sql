-- People & Access (plan 2.24 / 2.24a). ADDITIVE ONLY: no DROP, no DELETE, no edits to admin_audit_log.
-- Old staff_members / booster_members are untouched; public pages keep reading them (people_source = legacy).
ALTER TABLE users ADD COLUMN person_group TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN group_role TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN can_login INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN card_title TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN card_bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN card_photo_id TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN card_show INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN card_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN committee_label TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN legacy_source TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_group ON users(person_group, card_show, card_order);
CREATE TRIGGER IF NOT EXISTS users_group_chk_ins BEFORE INSERT ON users
  WHEN NEW.person_group NOT IN ('', 'staff', 'boosters')
  BEGIN SELECT RAISE(ABORT, 'bad group'); END;
CREATE TRIGGER IF NOT EXISTS users_group_chk_upd BEFORE UPDATE OF person_group ON users
  WHEN NEW.person_group NOT IN ('', 'staff', 'boosters')
  BEGIN SELECT RAISE(ABORT, 'bad group'); END;
CREATE TABLE IF NOT EXISTS role_presets (role TEXT PRIMARY KEY, permissions TEXT NOT NULL DEFAULT '[]', login_default INTEGER NOT NULL DEFAULT 1, updated_by INTEGER, updated_at TEXT);
CREATE TABLE IF NOT EXISTS user_invites (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_by INTEGER);
CREATE TABLE IF NOT EXISTS people_migration_review (id INTEGER PRIMARY KEY, name TEXT, staff_id INTEGER, booster_id INTEGER, user_id INTEGER, resolved TEXT);
