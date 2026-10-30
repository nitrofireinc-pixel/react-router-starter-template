-- Plan 2.26 News (17a). ADDITIVE ONLY: one new table + indexes. Nothing existing is altered.
CREATE TABLE IF NOT EXISTS news_items (
  id INTEGER PRIMARY KEY,
  headline TEXT NOT NULL,
  teaser TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  news_date TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  show_on_home INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_public ON news_items(published, pinned DESC, news_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_home ON news_items(show_on_home, news_date DESC) WHERE published = 1;
