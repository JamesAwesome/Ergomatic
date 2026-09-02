# A Just Row stands in for a plan session — design

**Status: spec rev 1, 2026-09-02; Gate 0 presented (same day), awaiting
James; antagonist full pass owed (TRIAD — a number's meaning).** Phase JR
follow-on item 5. Handoff: `docs/design/handoffs/2026-09-02-just-row-substitution/`.

## What and why

A rower who does a Just Row on a plan day can say "this stood in for
today's session": the plan advances, and the row records what it stood in
for. James's ruling (2026-09-01): *advances the record, records the
stand-in* — SUBSTITUTION, not a volume count (the PM's other reading was
rejected: "isn't even something we support"). Checkpoint days are included
(2026-09-02): the mark says `INSTEAD OF 2K TEST` and the rower's data is
the rower's.

Today `SESSION n OF 84` means "n prescribed sessions done"; after this it
means "n plan sessions closed", where a closed session is either the
prescribed workout, a swapped workout (already possible, marked
`INSTEAD OF`), or a free row (new, marked the same way). That is a change
to what a number means → TRIAD, though no column is added.

## Research (RF18: read before designing)

- **The mechanism already exists for workouts.** `server/stores/logs.ts:776-786`
  advances `plan_state.done_n` when `advancesPlan && !isFreeRow(...)` and
  the row receives `plan_key`/`plan_index` (the LINK). `src/plan/Plan.tsx:116-140`
  `swapMark` compares the rowed type (or, on a checkpoint day, the
  prescription's title) with what the plan asked for and prints
  `INSTEAD OF <it>` (`Plan.tsx:461-462`, Variant B: its own line, design
  gate 2026-08-30). Item 5 removes one refusal and teaches two readers
  about a null type.
- **The refusal is the only enforcement** (`logs.ts:768-769`, its own
  words). The PM close gate (2026-09-01) required that removing it not
  downgrade plan integrity to a client promise: the replacement rule is
  explicit opt-in (below), enforced at the same store.
- **A free row linked to the plan renders WRONG today:** `rowedType(link)`
  is undefined for a null type, so `Plan.tsx:428-434` prints the
  "type unknown" box (`plan-badge-unknown.png`) and `swapMark` returns
  undefined — no mark. The chip (#268, `FreeRowChip`) is the fix for the
  slot; the mark needs one clause.
- **JustRowLog already has the plan door's machinery:** it uses
  `useLogForm` with an `advancesPlan` option (`JustRowLog.tsx:187,246`);
  `usePlan()` (`src/api/usePlan.ts:43`) gives it the `plan` the pair's
  label needs.

## Rulings

1. Substitution, not volume (James, 2026-09-01).
2. Checkpoint days included (James, 2026-09-02).
3. Copy is mechanical: the door borrows `PostWorkoutSummary`'s pair and
   no-plan rule verbatim; the Plan tab prints the existing mark.

## Mechanism

**No new stored shape.** The stand-in record is the link the row already
gets (`plan_key`, `plan_index`) plus the row's own free pair
(`workout_id` null, `workout_type` null): "a linked free row" IS "a Just
Row stood in for session `plan_index`". No column, no migration.

1. **Server (`server/stores/logs.ts` create):** the advance condition
   becomes `input.advancesPlan === true` for a free row and stays
   `input.advancesPlan` (default `true`) for every other row. The route
   (`data.ts:1728`) keeps `?? true` for workouts and resolves a free row's
   ABSENT `advancesPlan` to `false` — so an old JustRowLog (posts `false`
   explicitly) and any client that omits the field both leave the plan
   alone, and only an explicit `true` from the new door advances it.
   **Invariant, stated:** a free row advances the plan iff its body says
   `advancesPlan: true`; a workout row advances unless its body says
   `false`. One integration test per arm, plus the parent spec's exit
   criterion 1 amended: `done_n` unchanged across a Just Row save
   *that does not opt in*.
2. **The Just Row log door (`JustRowLog.tsx`), both entry kinds:** reads
   `usePlan()`; with a plan, renders the pair with the shipped classes and
   the shipped label (`Log against plan · SESSION ${doneN + 1} OF ${N}`)
   leading, `Save without logging` under it; with no plan, `Save without
   logging` alone. `Log against plan` posts `advancesPlan: true`; the other
   posts `false`. "Save this row" is retired (it existed because a free row
   could never count). The onboarding demotion rule in `PostWorkoutSummary`
   does not apply (no onboarding title on a free row).
3. **Plan tab (`Plan.tsx`):** `rowedType` stays as is; the badge slot
   renders `FreeRowChip` when `isFreeRow(link.workoutId, link.workoutType)`
   (the PAIR; the unknown-type box remains for a linked row whose type is
   a string the build does not know); `swapMark` treats a free row as
   "rowed something else": the mark is the prescription's title on a
   checkpoint day, else the planned type — the same two branches it has,
   with the free pair entering the "not as prescribed" arm. `PlanLink`
   must carry `workoutId` (check `usePlanLinks.ts`; add it to the
   projection if absent — it is already on the wire for History).
4. **Today:** no change; `SESSION n OF N` reads `doneN`.
5. **Notes:** the release that ships this retires v0.32.0's "A Just Row
   never advances your plan" (ROADMAP row exists from the close gate).

## What does NOT change

History, the detail, the connected surface, the Timer, `isFreeRow`'s
three other jobs (the empty-steps allowance, the chip, the `source`
consistency rule).

## Exit criteria (frozen at spec approval)

1. Server: a free row with `advancesPlan: true` advances `done_n` by one
   and receives `plan_key`/`plan_index`; with `advancesPlan: false` or
   ABSENT it does neither (three integration cases at the HTTP boundary,
   asserting `GET /api/plan`'s `doneN` and the row's link). A workout row
   with `advancesPlan` absent still advances (the existing behaviour,
   re-pinned beside the new arm).
2. Door: with a plan, the pair renders with the shipped label text and
   classes and `Log against plan` posts `advancesPlan: true` while
   `Save without logging` posts `false`; with no plan only `Save without
   logging` renders; "Save this row" appears nowhere (grep).
3. Plan tab: a linked free row renders `.free-row-chip`, no `.type-badge`,
   no `.plan-row-badge-unknown`, the name `Just Row`, and `INSTEAD OF AT`
   on a type day / `INSTEAD OF 2K TEST` on a checkpoint day; a linked row
   with an UNKNOWN type string still renders the unknown box (the two
   cases are distinct and both pinned).
4. RF24 seam: one e2e starts at the Just Row door with a plan active,
   presses `Log against plan · SESSION 1 OF 84`, and asserts `SESSION 2 OF
   84` on Today and the marked row on the Plan tab.
5. Every string on the boards appears verbatim.

## PR shape

One PR, TRIAD (the meaning of `SESSION n OF N`): antagonist full pass on
this spec, Gate 0 approval, plan, implementation, PM final gate. Roughly
four product files (`logs.ts`, `data.ts`, `JustRowLog.tsx`, `Plan.tsx`,
possibly `usePlanLinks.ts`).
