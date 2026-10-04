-- Incremental, idempotent go-live migration: 2026-10-03.1 → 2026-10-04.1
-- Run at deploy time (owner sign-off only):
--   npx wrangler d1 execute efhsband-db --remote --file migrations/2026-10-04.1.sql
-- Do NOT run this against production from a laptop or Cloud Agent.
-- Safe to re-run. Worker initDb applies the same statements when it sees an older schema.
-- Existing Join visual_pages / visual_page_versions rows are kept (slug='join').
-- This upgrade does not rewrite cms_pages.body_html.

CREATE TABLE IF NOT EXISTS visual_pages ( slug TEXT PRIMARY KEY, draft_html TEXT NOT NULL DEFAULT '', published_html TEXT NOT NULL DEFAULT '', published_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_by INTEGER );
CREATE TABLE IF NOT EXISTS visual_page_versions ( id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'draft', html TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by INTEGER, created_by_name TEXT NOT NULL DEFAULT '' );
CREATE INDEX IF NOT EXISTS idx_visual_page_versions_slug ON visual_page_versions (slug, id);
CREATE INDEX IF NOT EXISTS idx_photos_filename ON photos (filename);
CREATE INDEX IF NOT EXISTS idx_photos_gallery_sort ON photos (sort_order, created_at, id);
CREATE INDEX IF NOT EXISTS idx_sponsors_active_sort ON sponsors (active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_booster_members_active_sort ON booster_members (active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_staff_members_active_sort ON staff_members (active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_caldev_events_track_start ON caldev_events (track, start_date, start_time, id);
CREATE INDEX IF NOT EXISTS idx_events_boosters ON events (show_on_boosters, event_year, id);

INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.1') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
