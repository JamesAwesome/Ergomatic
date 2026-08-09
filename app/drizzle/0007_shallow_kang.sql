ALTER TABLE "preferences" ADD COLUMN "warmup" jsonb;--> statement-breakpoint
ALTER TABLE "preferences" DROP COLUMN "warmup_minutes";--> statement-breakpoint
ALTER TABLE "preferences" DROP COLUMN "warmup_override";