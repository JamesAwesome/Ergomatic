> **Archived 2026-08-28** from `ROADMAP.md` (lines 216-271 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 5F — Builder entry

**Status:** Done (2026-08-01, PR #TBD)
**Goal:** Close four device-use reports about the builder's entry
affordances — none of them domain redesigns, all of them a thumb on a phone
unable to do something it should be able to do.

- [x] `domain/duration.ts`: one duration grammar and one `m:ss` formatter
      (`fmtDuration`/`fmtDurationSpoken`/`parseClock`), replacing the
      byte-identical regexes `domain/bulk.ts` and `builderState.ts` used to
      keep in lockstep by hand
- [x] Duration validation widens from half-steps to any whole second
      (`wholeSecond`, `domain/validate.ts`) — every previously-valid workout
      still validates; bulk import adopts the same shared grammar
- [x] `ClockInput`: a masked numeric-pad field that fills digits right to
      left into `ss`/`mm`/`hh`, so `0:30` (and any other sub-minute value)
      is typable on a phone keypad that has no `:`
- [x] The builder's DUR field speaks clock values end to end — typed,
      stored, and round-tripped through Save as `0:45`/`20:00`/`1:05:00`,
      not a bare decimal number of minutes
- [x] SPM and REST are typable again as well as steppable (`Stepper`'s
      optional `onValueChange`/`valueInput` props) — Phase 5E's bare-stepper
      SPM could walk down to FREE but never type past a few presses to reach
      a value; REST gets the same treatment via `ClockInput`
- [x] `+ ADD STEP` appends a blank work step and opens it for editing;
      `DUPLICATE` is now the only control that copies a row's values
- [x] The warm-up line moved above the step list, reading as an implicit
      step 0 — with honest 18px separation on both sides (Task 9: the
      negative margin Task 7 shipped first read as a caption of the STEPS
      header, not a step of its own)
- [x] Step-level durations render through the same `fmtDuration`/
      `fmtDurationSpoken` helpers outside the builder too (`StepRow`,
      `WorkoutRow`) — a 45 s step now reads `0:45` on the detail and
      library screens instead of `0.75′`
- [x] `.button-outline`'s color/text-decoration/`inline-flex` fix stops the
      workout detail screen's Edit link from falling through to the
      browser's default blue underline — as a side effect, `min-height: 44px`
      finally applies to that control for the first time (a plain inline
      `<a>` had been ignoring it; the tap-target sweep should have caught
      this earlier and didn't)
- [x] Empty, typable SPM/REST cells show a `placeholder` ("FREE"/"NONE")
      instead of reading as broken empty boxes — never the accessible name,
      styled at `--ink-4` (5.29:1 against `--surface`, clears the 4.5:1 AA
      requirement)
- [x] Structural e2e coverage for all of the above (`e2e/design.spec.ts`),
      a sub-minute step and a personal workout's Edit/Delete visible in the
      committed screenshots (`e2e/screenshots.spec.ts`)

**Locked decision:** the house time format (Locked decisions above) is now
the app-wide convention for any duration display, not a builder-only
affordance.

**Exit:** MET — all four device-use reports closed; the phase exit
criterion (a sub-minute duration typable, stored, and displayed as `0:45`
everywhere it appears) holds end to end.
