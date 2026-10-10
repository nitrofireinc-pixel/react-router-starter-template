-- Incremental, idempotent migration: 2026-10-04.7 → 2026-10-04.8
-- page_blocks for mixed hero/fundraiser order on Fundraising.
-- Do NOT run this file by hand on D1.

CREATE TABLE IF NOT EXISTS page_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_slug TEXT NOT NULL,
  rev TEXT NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  ref_id INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  corner_tag TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  highlight TEXT NOT NULL DEFAULT '',
  button_text TEXT NOT NULL DEFAULT '',
  button_link TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_page_blocks_page_rev ON page_blocks (page_slug, rev, sort_order, id);

INSERT INTO fundraiser_cards (
  title, description, event_date, location, picture_mode, image_url,
  must_attend, volunteers_needed, primary_button, status, sort_order, approved_at
)
SELECT 'Mattress Sale', 'Fundraiser at Mattress Warehouse', '2026-10-24',
       '820 S Main St, Kernersville, NC 27284', 'image',
       '/uploads/1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6.jpg',
       1, 0, 'view_flyer', 'approved', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM fundraiser_cards LIMIT 1)
UNION ALL
SELECT 'Silent Auction', 'Students and parents help needed', '2026-11-07', '', 'date_tile', '',
       0, 1, 'volunteer', 'approved', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM fundraiser_cards LIMIT 1);
