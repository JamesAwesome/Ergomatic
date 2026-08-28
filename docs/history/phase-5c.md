> **Archived 2026-08-28** from `ROADMAP.md` (lines 170-184 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 5C — Builder refinements & the number retirement

**Status:** Done (2026-07-30, PR #25)
**Goal:** Close the issues device testing exposed, and settle how workout identity works at scale.

- [x] Structured pace-ref control (2K/6K select + offset stepper) replaces the free-text field that rejected `8k` with an inline error
- [x] Bare minutes accepted everywhere — `5` no longer needs the apostrophe a phone keyboard buries (rows and bulk grammar both)
- [x] On-theme name generator (🎲) for the creatively impaired
- [x] Bulk import moved off the single-entry form onto its own screen
- [x] Save focuses the first invalid field instead of failing silently below the fold
- [x] **Workout `num` retired for `sort_order` + `created_at`** — one table with a nullable `user_id`, not a second table for customs: `session_logs.workout_id` carries an FK with `ON DELETE SET NULL`, and splitting the table would force a polymorphic reference the database cannot enforce (SQL Antipatterns ch. 7). `sortOrder` is server-assigned; the client cannot set it
- [x] Double-seed protection preserved through the unique-index removal via `pg_advisory_xact_lock`

**Exit:** MET. `DROP COLUMN num` is deliberately deferred to Phase 6 as two releases (see below).
