> **Archived 2026-08-28** from `ROADMAP.md` (lines 364-429 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 6A — Today, Plan, and Confirm targets

**Status:** Done (2026-08-01, PR #TBD)
**Goal:** The app replaces paper up through the moment a rower sits down —
suggestion, plan management, and a per-run overlay — with the live timer and
logging deferred to 6B/6C.
**Design authority:** `docs/superpowers/specs/2026-08-01-phase-6a-today-confirm-design.md`.

- [x] **`num` column retirement, two separate releases, shipped ahead of the
      rest of this phase**: (a) PR #33 removed `num` from
      `app/server/db/schema.ts` with no migration, deployed green; only then
      (b) PR #34 ran the `DROP COLUMN num` migration. Both merged and
      deployed 2026-08-01. Reason it had to split: Drizzle expands a schema
      into an explicit column list for every projection-less `db.select()`,
      so as long as `schema.ts` declared `num`, every plain workout query
      put it on the wire — a single release doing both would have left an
      unhealthy deploy's rollback selecting a column that no longer exists,
      turning a recoverable deploy into a dead site
- [x] Session draft contract (`app/src/session/draft.ts`): builds from a
      library workout or the day's suggestion, mutates via nudges/SPM
      overrides/step removal/reps count, round-trips through localStorage
      (`v:1`; an unknown version discards and clears rather than throwing);
      `suggestFreestyle` extends the suggestion engine to the whole library
      when no plan is active
- [x] Today (`/today`): plan-driven suggestion (today's plan code) or
      freestyle (no plan active); SHUFFLE cycles the filtered pool and
      persists the day's pick (`todayPick`); LAST THREE renders the three
      most recent logs as a date, the HELD/UNDER/OVER word, and the pain
      figure (`docs/design/README.md`'s own row format, at Ergomatic's 1–5
      pain scale — see `docs/design/DEVIATIONS.md`)
- [x] Plan (`/plan`): choose a preset (sprint/head — a single tap when no
      plan is active) or manage an active one; Reset and Switch are both
      staged-confirm (same idiom as the baseline editor / workout delete)
      and name the exact consequence; the full 84-session sequence renders
      with done/today/upcoming status, scrolling in its own keyboard-
      focusable region rather than growing the page. This is the "TRAINING
      PLAN" management slice of the handoff's **You** screen (§10) and the
      preset-selection half of Phase 8B's own "Plan management" line,
      delivered here instead because Today needed it; Phase 8B still owns
      the month-calendar view and the ALL/TO DO/DONE filters
- [x] Confirm targets (`/session/confirm`): duration/rest steppers (30 s
      grid; a distance step's own duration steps by 100 m instead), an SPM
      stepper per work step (18–32, wakes at 20 — new relative to the
      handoff, which has no per-step SPM control here at all), a rep-count
      stepper, per-step remove/restore (deliberately **not** offered on the
      reps marker itself — removing it would silently reshape a repeated
      workout with no visible cause, so the marker's own rep stepper is the
      only way to change its effect), pace nudges (skipped for an
      effort-ref step), and a live minute recount; START stamps `startedAt`
      and hands off to the 6B placeholder
- [x] `/session/run` placeholder proves the draft round-trips through
      localStorage across a real reload; 6B replaces it with the live timer
- [x] Structural design coverage (`e2e/design.spec.ts`) for all three
      screens against real data (a plan active, logs present, an effort
      step and a struck row on Confirm) caught and fixed two real
      accessibility defects the phase's own client tests never rendered:
      the active Plan's 84-row scroll region had no keyboard focus stop
      (axe `scrollable-region-focusable`), and a struck Confirm row's
      DUR/SPM/REPS label dropped to 4.48:1 against the removed-row
      background (just under WCAG AA's 4.5:1)

**Exit:** MET — the confirm round trip (Start → adjust duration/SPM/nudge/
remove → START → reload) shows the same draft; a plan-less rower still gets
a suggestion and can start a plan from the same screen the timer will
eventually launch from.
