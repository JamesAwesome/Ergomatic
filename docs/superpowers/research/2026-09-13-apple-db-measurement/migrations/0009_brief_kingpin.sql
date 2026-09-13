-- Post-workout-summary spec (2026-08-17), §3 "Stored shapes": the
-- redesigned reflection card makes every answer optional (James's ruling,
-- R-A ordering this after the null-tolerant READ side already shipped and
-- tagged v0.10.1). All three changes are additive/loosening:
--   * `held`/`pain` DROP NOT NULL only — no data touched, no type change.
--     The `session_logs_pain_check` CHECK (`pain between 1 and 5`) is
--     LEFT ALONE: Postgres passes a CHECK constraint on NULL by rule (NULL
--     is neither TRUE nor FALSE, and a CHECK only ever REJECTS an explicit
--     FALSE), so an absent pain value satisfies this constraint unchanged —
--     nothing here needs to touch it.
--   * `thumbs` is a brand-new nullable column (new enum `up`/`down`); every
--     existing row reads back null, same as any other additive column this
--     schema has grown before.
CREATE TYPE "public"."thumbs" AS ENUM('up', 'down');--> statement-breakpoint
ALTER TABLE "session_logs" ALTER COLUMN "held" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_logs" ALTER COLUMN "pain" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "thumbs" "thumbs";