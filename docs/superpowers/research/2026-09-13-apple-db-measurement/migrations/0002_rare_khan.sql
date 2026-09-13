DROP INDEX "workouts_user_num_unique";--> statement-breakpoint
DROP INDEX "workouts_global_num_unique";--> statement-breakpoint
ALTER TABLE "workouts" ALTER COLUMN "num" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "sort_order" integer;--> statement-breakpoint
UPDATE "workouts" SET "sort_order" = "num" WHERE "user_id" IS NULL;
