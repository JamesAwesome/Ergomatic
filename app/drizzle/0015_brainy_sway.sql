-- Storage-spine design spec §3 (RC-1, TRIAD): work and rest, stored
-- separately from the fused hero columns. Four additive, nullable integer
-- columns, no default, no backfill — every existing row reads all four
-- back as null forever (spec §3's own "old records keep fused-only
-- quantities forever, said above the fold").
ALTER TABLE "session_logs" ADD COLUMN "work_seconds" integer;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "work_meters" integer;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "rest_seconds" integer;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "rest_meters" integer;