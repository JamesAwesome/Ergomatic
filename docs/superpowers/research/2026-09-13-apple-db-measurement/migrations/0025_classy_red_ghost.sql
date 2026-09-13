-- Wave E auto-send (spec docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md
-- §3.1; Gate 0 amendment-2026-09-05-autosend.html approved 2026-09-05 — TRIAD:
-- two stored shapes on the link row, and a number leaving for a third party on
-- a trigger nobody tapped). One deploy, three additive columns, no backfill:
--   * ADD `concept2_links.auto_send` (boolean NOT NULL DEFAULT false). The
--     rower's sending mode: false = MANUAL, true = AUTOMATIC. The DEFAULT is
--     ruling 3 (a fresh link lands in MANUAL) and makes every existing link
--     MANUAL without a backfill.
--   * ADD `concept2_links.send_failed_at` (timestamptz NULL) and
--     `send_failed_reason` (text NULL). The sticky "sends are failing" flag —
--     set by the send route only on an eligible send's `no_weight_class`
--     (reason = the route's sub-reason), cleared on every outcome that leaves
--     the row at Concept2 and on every relink.
-- NOT A ROLLBACK FLOOR (docs/RELEASING.md): the previous server ignores these columns
-- (Drizzle selects by name); the new server against a DB without them fails at
-- first link read — so this migration runs ahead of the deploy, as every
-- additive column here has. Rollback-safe in both directions.
-- Generated as 0025: minted as 0024 on 85a0de9c, regenerated at the merge of
-- main after Phase DE PR 2 (#310) landed its own 0024_pain_to_effort first —
-- exactly the case spec §3.1's "Migration numbering" bullet named.
ALTER TABLE "concept2_links" ADD COLUMN "auto_send" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "concept2_links" ADD COLUMN "send_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "concept2_links" ADD COLUMN "send_failed_reason" text;
