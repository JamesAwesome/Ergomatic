-- Storage-spine design spec §3 (RC-1, TRIAD): work and rest, stored
-- separately from the fused hero columns. Four additive, nullable columns,
-- no default, no backfill — every existing row reads all four back as null
-- forever (spec §3's own "old records keep fused-only quantities forever,
-- said above the fold"). `work_seconds`/`rest_seconds` are `double
-- precision`, NOT `integer`: 0x0037's own Split/Interval Time
-- (`elapsedSeconds`, the wire source of `work_seconds`) is TENTHS-of-a-
-- second precision (`domain/monitor/pm5/parse.ts`'s `readU24LE(bytes, 6) /
-- 10`), and a real natural finish's stored `workSeconds` is routinely
-- fractional (session-2's own real capture: 398.4s) — an `integer` column
-- here rejected every such save with a 400 (final whole-branch review,
-- BLOCKER-1). `rest_seconds` reads whole seconds on the wire today but
-- shares the wider type for symmetry with `work_seconds`, the pair it is
-- computed and read alongside. `work_meters`/`rest_meters` stay `integer`:
-- both their own wire sources (`splitIntervalDistanceMeters`,
-- `intervalRestDistanceMeters`) are genuinely whole-metre fields, no scale
-- division on either.
ALTER TABLE "session_logs" ADD COLUMN "work_seconds" double precision;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "work_meters" integer;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "rest_seconds" double precision;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "rest_meters" integer;