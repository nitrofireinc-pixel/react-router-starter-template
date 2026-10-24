-- Event Manager phase 1 (plan §2.20). Additive only; run ONCE per database
-- (SQLite ADD COLUMN fails if the column already exists).
-- Also applied by ensureCaldevSchema() in worker/src/caldev.mjs (errors ignored).
-- Public reads select these columns, so apply before deploying the worker.
ALTER TABLE caldev_events ADD COLUMN series_id INTEGER;
ALTER TABLE caldev_events ADD COLUMN series_rule TEXT;
ALTER TABLE caldev_events ADD COLUMN cancelled_at TEXT;
