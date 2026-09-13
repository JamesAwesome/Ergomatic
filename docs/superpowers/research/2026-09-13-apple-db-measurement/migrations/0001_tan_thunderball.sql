CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."held_result" AS ENUM('held', 'under', 'over');--> statement-breakpoint
CREATE TYPE "public"."test_distance" AS ENUM('2k', '6k');--> statement-breakpoint
CREATE TYPE "public"."workout_source" AS ENUM('starter', 'user');--> statement-breakpoint
CREATE TYPE "public"."workout_type" AS ENUM('AN', 'O2', 'AT', 'TR');--> statement-breakpoint
CREATE TABLE "baselines" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"k2_seconds" real,
	"k6_seconds" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan_key" text,
	"done_n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "plan_state_plan_key_check" CHECK ("plan_state"."plan_key" is null or "plan_state"."plan_key" in ('sprint', 'head'))
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"difficulties" jsonb DEFAULT '["easy","medium","hard"]'::jsonb NOT NULL,
	"time_cap_minutes" integer DEFAULT 60 NOT NULL,
	"warmup_minutes" real DEFAULT 10 NOT NULL,
	"warmup_override" boolean DEFAULT false NOT NULL,
	"countdown_seconds" integer DEFAULT 10 NOT NULL,
	"pace_tolerance_seconds" real DEFAULT 1 NOT NULL,
	"accent_color" text DEFAULT '#b5341f' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid,
	"workout_title" text NOT NULL,
	"workout_type" text NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"baseline_k2" real,
	"baseline_k6" real,
	"held" "held_result" NOT NULL,
	"pain" integer NOT NULL,
	"notes" text,
	"steps" jsonb NOT NULL,
	CONSTRAINT "session_logs_pain_check" CHECK ("session_logs"."pain" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "test_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"distance" "test_distance" NOT NULL,
	"split_seconds" real NOT NULL,
	"delta_seconds" real,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"num" integer NOT NULL,
	"title" text NOT NULL,
	"type" "workout_type" NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"pain" integer NOT NULL,
	"source" "workout_source" NOT NULL,
	"steps" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_pain_check" CHECK ("workouts"."pain" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_state" ADD CONSTRAINT "plan_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_history" ADD CONSTRAINT "test_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_logs_user_id_idx" ON "session_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "test_history_user_id_idx" ON "test_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workouts_user_id_idx" ON "workouts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_user_num_unique" ON "workouts" USING btree ("user_id","num") WHERE "workouts"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_global_num_unique" ON "workouts" USING btree ("num") WHERE "workouts"."user_id" is null;