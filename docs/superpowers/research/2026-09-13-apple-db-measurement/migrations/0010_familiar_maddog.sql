-- From-the-log spec (2026-08-18), §2 "Stored shapes": five additive,
-- nullable columns on session_logs, no defaults, no backfill — every
-- existing row reads every one of these back as null (spec exit
-- criterion 6).
--   * avg_split_seconds / time_seconds are `double precision`, never
--     `real` (float4): a probe against real Postgres shows
--     `'2.7182818284'::real` truncating to `2.7182817` while
--     `::double precision` round-trips exactly (verified directly,
--     2026-08-18 — the antagonist's own B8 finding) — a triad-governed
--     stored number does not get to lose precision the summary itself
--     never lost.
--   * distance_meters is a plain integer — the machine's whole-meter
--     total (work + rest + warm-up).
--   * plan_key/plan_index are the linkage pair: written only when an
--     advancing save's plan_state upsert returns a non-null planKey
--     (server-derived, never client input) — see stores/logs.ts's
--     create().
ALTER TABLE "session_logs" ADD COLUMN "avg_split_seconds" double precision;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "distance_meters" integer;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "time_seconds" double precision;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "plan_key" text;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "plan_index" integer;
