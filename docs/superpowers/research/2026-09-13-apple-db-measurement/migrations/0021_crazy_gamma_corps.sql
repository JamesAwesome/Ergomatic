-- Wave E PR1.75a (docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md
-- §2, TRIAD — stored shape). Three additions, one wipe:
--   * every existing `concept2_auth_attempts` row is DELETED first — they are
--     15-minute disposable rows; an in-flight link at deploy restarts at mint,
--     which is already the retry story. The wipe MUST precede the
--     UNIQUE(user_id) below (a pre-0021 DB can legally hold two rows for one
--     user — the "raceable" state the PR1.5 ruling named).
--   * `surface` (enum link_surface: native | web), NOT NULL DEFAULT 'web'.
--     The default exists for ROLLBACK, not for writes: the PR1.5 image's
--     createAttempt inserts no surface, and a plain NOT NULL would 500 every
--     mint after a rollback. New code always writes surface explicitly.
--   * UNIQUE(user_id) on attempts — one live attempt per user, ENFORCED.
--     Rollback second half: this constraint survives a rollback and turns the
--     old image's concurrent delete-then-insert double-mint into a unique
--     violation (500) instead of two rows — accepted, a rare self-race.
--   * UNIQUE(c2_user_id) on concept2_links (D1, approved 2026-09-02): one
--     Concept2 account per Ergomatic user per database. Fails loudly on any
--     DB already holding two links to one account; prod has zero link rows
--     (the flag has never been on; MEASURED 2026-09-02 by James before the
--     merge — the duplicate-c2_user_id query returned 0 rows), dev volumes
--     reset with `down -v`. It
--     also survives a code rollback: the PR1.5 image's `upsertLink` has no
--     mapping for this constraint, so after rollback a conflict on it
--     answers with an unhandled 500 rather than this PR's 409 —
--     immaterial while the table is empty and the flag is dark.
-- Index 0021: PR #268 merged first (2026-09-02) and took index 0020; this
-- migration was regenerated as 0021 on rebase — the #248 precedent.
DELETE FROM "concept2_auth_attempts";--> statement-breakpoint
CREATE TYPE "public"."link_surface" AS ENUM('native', 'web');--> statement-breakpoint
ALTER TABLE "concept2_auth_attempts" ADD COLUMN "surface" "link_surface" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "concept2_auth_attempts" ADD CONSTRAINT "concept2_auth_attempts_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "concept2_links" ADD CONSTRAINT "concept2_links_c2_user_id_unique" UNIQUE("c2_user_id");
