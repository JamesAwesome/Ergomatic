-- Series capture spec (2026-08-19), §3 "Server home": one additive,
-- nullable jsonb column on session_logs, no default, no backfill — every
-- existing row reads this back as null (spec §6 exit criterion 6, never-
-- migrate contract). A column, not a table: one lifecycle (the log's
-- own), DELETE cascades free, and nothing streams or paginates samples
-- this phase (YAGNI, recorded).
ALTER TABLE "session_logs" ADD COLUMN "series" jsonb;
