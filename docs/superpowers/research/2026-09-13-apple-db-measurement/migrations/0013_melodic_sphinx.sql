CREATE TYPE "public"."baseline_source" AS ENUM('manual', 'estimated', 'derived', 'tested');--> statement-breakpoint
ALTER TABLE "baselines" ADD COLUMN "k2_source" "baseline_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "baselines" ADD COLUMN "k6_source" "baseline_source" DEFAULT 'manual' NOT NULL;