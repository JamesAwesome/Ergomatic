CREATE TABLE "apple_grants" (
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"refresh_token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_grants_pkey" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"binding_hash" text NOT NULL,
	"surface" text NOT NULL,
	"purpose" text NOT NULL,
	"target_provider" text NOT NULL,
	"existing_provider" text,
	"stage" text NOT NULL,
	"version" integer NOT NULL,
	"state" text NOT NULL,
	"nonce" text NOT NULL,
	"original_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reauthenticated_at" timestamp with time zone,
	"verified_subject" text,
	"verified_email" text,
	"verified_name" text,
	"apple_client_id" text,
	"apple_refresh_token" text,
	CONSTRAINT "auth_attempts_state_unique" UNIQUE("state"),
	CONSTRAINT "auth_attempts_surface_check" CHECK ("auth_attempts"."surface" in ('native','web')),
	CONSTRAINT "auth_attempts_purpose_check" CHECK ("auth_attempts"."purpose" in ('signin','link')),
	CONSTRAINT "auth_attempts_provider_check" CHECK ("auth_attempts"."target_provider" in ('apple','google') and ("auth_attempts"."existing_provider" is null or "auth_attempts"."existing_provider" in ('apple','google'))),
	CONSTRAINT "auth_attempts_stage_check" CHECK ("auth_attempts"."stage" in ('authorize','exchanging','confirm','reauth_authorize','reauth_exchanging','target_authorize','target_exchanging','link_ready')),
	CONSTRAINT "auth_attempts_session_check" CHECK (("auth_attempts"."purpose"='signin' and "auth_attempts"."original_session_id" is null and "auth_attempts"."existing_provider" is null) or ("auth_attempts"."purpose"='link' and "auth_attempts"."original_session_id" is not null and "auth_attempts"."existing_provider" is not null and "auth_attempts"."existing_provider"<>"auth_attempts"."target_provider")),
	CONSTRAINT "auth_attempts_expiry_check" CHECK ("auth_attempts"."expires_at">"auth_attempts"."created_at"),
	CONSTRAINT "auth_attempts_version_check" CHECK ("auth_attempts"."version">0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apple_sub" text;--> statement-breakpoint
ALTER TABLE "apple_grants" ADD CONSTRAINT "apple_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_attempts" ADD CONSTRAINT "auth_attempts_original_session_id_sessions_id_fk" FOREIGN KEY ("original_session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_attempts_link_session_unique" ON "auth_attempts" USING btree ("original_session_id") WHERE "auth_attempts"."original_session_id" is not null;--> statement-breakpoint
CREATE INDEX "auth_attempts_expires_at_idx" ON "auth_attempts" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_apple_sub_unique" UNIQUE("apple_sub");