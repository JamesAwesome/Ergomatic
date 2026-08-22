-- Phase LL Task 4 (design spec §4, TRIAD): the honest close reason, mirrored
-- server-side. One additive, nullable enum column on session_logs, no
-- default, no backfill — every existing row reads this back as null (spec
-- exit criterion 5's own "legacy rows read back unchanged").
CREATE TYPE "public"."ended_by" AS ENUM('finished', 'rower', 'link-lost', 'program-failed', 'interrupted');--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "ended_by" "ended_by";
