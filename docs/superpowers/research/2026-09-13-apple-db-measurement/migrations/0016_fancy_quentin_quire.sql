ALTER TABLE "session_logs" ADD COLUMN "machine_work_seconds" double precision;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "machine_work_meters" integer;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "machine_summary" jsonb;