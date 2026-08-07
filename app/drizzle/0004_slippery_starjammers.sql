CREATE TABLE "article_reads" (
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_reads_user_id_slug_pk" PRIMARY KEY("user_id","slug")
);
--> statement-breakpoint
ALTER TABLE "article_reads" ADD CONSTRAINT "article_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;