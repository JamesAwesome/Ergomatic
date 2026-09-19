# Handoff — number-provenance PR 4 (M4 + M5)

Written 2026-09-19. **Read this, then `M4` and `M5` in
`docs/superpowers/specs/2026-09-14-number-provenance-design.md`, then
`docs/design/number-provenance/gate0b/board3/BOARD3.md`.** The spec is the
authority; this file only says where the work stands and what not to
relitigate.

## Where the pass stands

| piece | state |
| --- | --- |
| Gate 0A (You → Stats) | APPROVED 2026-09-14, shipped as **#445** |
| Gate 0B board 1 (M1, M1b, M2) | APPROVED, shipped as **#454**, copy revised by **#461** |
| Gate 0B board 2 (M3, M6) | APPROVED, shipped as **#478** (main `792ba8e8`) |
| M7 | **CLOSED as a gate, not a fix** — shipped as **#482** (main `54c43827`) |
| **Gate 0B board 3 (M4, M5)** | **APPROVED 2026-09-19 — treatment C** |
| **PR 4 — M4 + M5** | **SCOPED AND UNBLOCKED. This is the next job.** |
| PR 5 — M9 | SPLIT OUT 2026-09-19. ROADMAP row, `dies 2026-10-22` |
| M2 (AVG HR) | WITHDRAWN 2026-09-07. Do not reopen (RF18) |

**A release is owed and not cut.** #478 is tester-visible (the trace
chart's axis) and nothing since has been tagged.

## What PR 4 ships

**Treatment C.** The saved row keeps its three heroes exactly as they are,
and the quiet prose line

> `4:04 total · plus 242 m coasting in rest`

becomes the logbook's own named figures:

> `REST 242 m · 2:00`   `OVERALL 742 m · 4:04`

**On BOTH doors.** `SummaryHeroesBlock` (`src/session/PostWorkoutSummary.tsx`)
is shared: the post-workout summary and the stored log detail render the
same `heroes.totalLine`. The board's frames only show the stored one. A
rower who saves a piece and reopens it an hour later meeting two shapes of
one record is the member's own complaint.

**M5, on the same shape.** An interrupted row renders each figure as this
codebase's own dash — `MachineTier`'s rule, "each field is `undefined`
where the machine did not say — the screen renders a dash there, and `0`
as `0`", which the six machine tiles on the same screen already follow.

> `REST —`   `OVERALL —`

## Decided. Do not reopen without James

1. **Treatment B was rejected**, though the board recommended it. B labels
   the headline `WORK`; Concept2's logbook never does — it prints `Meters`
   and lets `Overall Distance` beside it do the explaining. James found
   this by asking "is the hero itself the work number?". The `DISTANCE`
   hero stays unlabelled and stays the work figure.
2. **The live connected pane is NOT touched.** It keeps its own total,
   which stays a lossy estimate (an interval producing zero frames is lost
   from it). Once the saved row shows OVERALL the two agree in the normal
   case; the estimate is not captioned.
3. **Summing per-interval rest readbacks to give an interrupted row a real
   number is REJECTED.** It under-counts whenever the abandoned interval
   had rest of its own, and an understated figure shown as whole is the
   misattribution the all-or-nothing rule exists to prevent. If ever
   revisited it must be marked partial.
4. **A free row shows OVERALL and no REST figure at all** — not a dash. A
   dash means "should have a value and we do not"; a free row's rest is
   genuinely absent, not unknown. **This one is MY default, not James's
   ruling** (stated to him 2026-09-19, not contradicted) — it is the
   cheapest thing on this list to change.

## What the implementation touches

- `src/session/summaryModel.ts` — `SummaryHeroes.totalLine` is a STRING
  today. The figures have to reach the component as numbers; `monitorRest`
  is the live door's source.
- `src/log/storedSummary.ts` — `buildStoredRest` is the stored door's
  source, and the place M5's absence is decided.
- `src/session/PostWorkoutSummary.tsx` — `SummaryHeroesBlock` renders it,
  for both doors.
- `buildTotalLine` is EXPORTED and used by both doors on purpose ("built
  in one place, not twice", RC-5 §2's own requirement). Whatever replaces
  it keeps that property.
- `src/index.css` — the prototype's own CSS is a starting point, not the
  answer.

## Traps

1. **`totalLine` has tests on both doors** and at least one capture. Grep
   before deleting: `grep -rn "totalLine\|summary-total-line" app/src app/e2e`.
2. **The dash is not zero.** `MachineTier`'s rule is explicit that `0`
   renders as `0`. A genuine r0 piece has rest 0, not unknown.
3. **RF7 applies to the captures**: the new figures are arithmetic a reader
   can check by eye (500 + 242 = 742). If a capture's three numbers do not
   add up, the fixture is wrong, not the reader.
4. **`e2e` and `screenshots` both `up -d --build --wait` unconditionally
   and leave the stack UP** (`E2E_KEEP` defaults to 1). Tear the stack down
   with `docker compose -p <ergomatic-NNNNN> down -v` at teardown; `E2E_KEEP=0`
   is not equivalent.
5. **The local-work controller refuses at memory pressure "warning"**, and
   Docker's VM holds ~1.3 GB for a minute or two after Docker Desktop
   quits. Retry rather than bypass; never `--no-verify`.

## Gates owed

- **Antagonist — FULL pass on the spec.** PR 4 is TRIAD (a stored figure
  renders differently). §8 already owes a delta pass; board 3 changed the
  member, so treat it as full.
- **`/harden` on the plan**, two lenses, capped at two passes.
- **PM — final gate on the PR.** TRIAD.
- **DBA — SKIPS, say it aloud.** No `app/server/db`, no store, no bulk
  read. (PR 5 is the one that needs the DBA.)
- **e2e + scoped captures.** This is a layout change on two surfaces, so
  `pnpm screenshots -g "<names>"` and commit only what changed.
- **The ROADMAP hand-back** on PR 4's own opening: proposed rows and the
  overdue sweep, with the `tr`-joined grep, not a bare one.

## Not done, and deliberately

- No implementation plan exists yet. Writing it is the next step
  (`superpowers:writing-plans`).
- No code has been written. The board's prototype is a throwaway behind
  `?board3=`, kept as `board3-variants.patch` and NOT in product code.
