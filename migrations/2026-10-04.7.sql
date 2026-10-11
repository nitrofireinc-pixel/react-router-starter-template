-- Incremental, idempotent migration: 2026-10-04.6 → 2026-10-04.7
-- Fundraiser cards table. First Worker request imports Mattress Sale and
-- Silent Auction as approved rows when the table is empty.
-- Do NOT run this file by hand on D1.

CREATE TABLE IF NOT EXISTS fundraiser_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  picture_mode TEXT NOT NULL DEFAULT 'date_tile',
  image_url TEXT NOT NULL DEFAULT '',
  must_attend INTEGER NOT NULL DEFAULT 0,
  volunteers_needed INTEGER NOT NULL DEFAULT 0,
  custom_label TEXT NOT NULL DEFAULT '',
  primary_button TEXT NOT NULL DEFAULT 'details',
  primary_url TEXT NOT NULL DEFAULT '',
  show_add_to_calendar INTEGER NOT NULL DEFAULT 1,
  auto_hide_after_date INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  source_event_id INTEGER,
  calendar_changed INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by INTEGER,
  approved_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fundraiser_cards_source_active ON fundraiser_cards (source_event_id) WHERE source_event_id IS NOT NULL AND status != 'rejected';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fundraiser_cards_source_date ON fundraiser_cards (source_event_id, event_date) WHERE source_event_id IS NOT NULL;

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
SELECT 'Silent Auction', '', '2026-11-07', '', 'date_tile', '',
       0, 1, 'volunteer', 'approved', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM fundraiser_cards LIMIT 1);
