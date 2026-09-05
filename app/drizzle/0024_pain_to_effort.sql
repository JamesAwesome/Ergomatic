-- Phase DE PR 2 (docs/superpowers/specs/2026-09-05-difficulty-out-effort-in-design.md
-- §4.2, TRIAD — stored shape). HAND-WRITTEN: this repo has never generated a
-- column RENAME, and drizzle-kit 0.31.10 refuses to resolve one without a TTY
-- ("Interactive prompts require a TTY terminal", measured 2026-09-05) — so the
-- SQL, the 0024 snapshot and the journal entry are all authored by hand, and
-- the gate is that `pnpm db:generate` afterwards reports no schema changes.
--
-- Four renames and one UPDATE, no data moved, no row rewritten by the
-- renames themselves:
--   * workouts.pain        → workouts.effort        (+ its CHECK, same rule 1..5)
--   * session_logs.pain    → session_logs.effort    (+ its CHECK, same rule 1..5)
--   * article_reads: the pain-scale article's slug becomes effort-scale, so
--     every rower's read of it survives the rename (otherwise the article
--     reverts to unread and the News tab's next-unread walk changes).
--
-- ROLLBACK: NOT rollback-safe. A pre-0024 image selects a column named `pain`
-- that no longer exists and 500s every workout and log read. deploy.sh's
-- health-gated auto-rollback (scripts/deploy.sh, the ERR trap) fires AFTER
-- the new container has migrated and would restore exactly that image, so
-- the tag carrying this migration is a FORWARD-FIX-ONLY floor row in
-- docs/RELEASING.md § Rollback constraints, added in the same PR.
ALTER TABLE "workouts" RENAME COLUMN "pain" TO "effort";--> statement-breakpoint
ALTER TABLE "workouts" RENAME CONSTRAINT "workouts_pain_check" TO "workouts_effort_check";--> statement-breakpoint
ALTER TABLE "session_logs" RENAME COLUMN "pain" TO "effort";--> statement-breakpoint
ALTER TABLE "session_logs" RENAME CONSTRAINT "session_logs_pain_check" TO "session_logs_effort_check";--> statement-breakpoint
UPDATE "article_reads" SET "slug" = 'effort-scale' WHERE "slug" = 'pain-scale';
