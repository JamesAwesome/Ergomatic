CREATE TYPE "public"."weight_class" AS ENUM('H', 'L');--> statement-breakpoint
CREATE TABLE "concept2_auth_attempts" (
	"nonce" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"weight_class" "weight_class" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept2_links" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"c2_user_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"weight_class" "weight_class" NOT NULL,
	"needs_reauth_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "c2_result_id" integer;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "c2_user_id" integer;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "tz" text;--> statement-breakpoint
ALTER TABLE "concept2_auth_attempts" ADD CONSTRAINT "concept2_auth_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2_links" ADD CONSTRAINT "concept2_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;