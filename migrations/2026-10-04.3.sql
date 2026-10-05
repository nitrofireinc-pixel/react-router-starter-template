-- Incremental, idempotent migration: 2026-10-04.2 → 2026-10-04.3
-- Content vs layout page grants + minutes:edit.
-- No new tables. Worker applyIncrementalSchema rewrites users.permissions:
--   "minutes" → "minutes:edit", drop "minutes:view", layout:x implies page:x.
-- Existing page:{slug} grants stay content-only. Nobody receives layout:* automatically.
--
--   npx wrangler d1 execute efhsband-dev-db --remote -c wrangler.dev.toml --file migrations/2026-10-04.3.sql
-- Do NOT run this against production from a laptop or Cloud Agent.

INSERT INTO site_content (key, value) VALUES ('schema_version', '2026-10-04.3') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
