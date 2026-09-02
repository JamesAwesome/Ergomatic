# A Just Row stands in for a plan session — design

**Status: spec REV 3, 2026-09-02. Gate 0 PASSED on rev 1d (James, "design
approved"). Two antagonist passes folded: the first (TRIAD anchor) on
rev 1's mechanism ⟨F#⟩, the second on rev 2's own fixes ⟨G#⟩ — the server
mechanism held both; the corrections are to the layout rule, the parser,
the criterion numbering, and the handoff's honesty. Plan next.** Phase JR
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
  label needs. **But `useLogForm` writes `advancesPlan` ONLY when false**
  (`LogSession.tsx:720`, by its own comment at `:680-683`): `true` has
  never crossed the wire, so "the plan door already posts the flag" was
  half true ⟨F2⟩.
- **`swapMark`'s two branches differ for a free row** ⟨F3⟩: the checkpoint
  branch ALREADY marks one (`linkedTitle`/`workoutIsGlobal` null →
  identity falls back to the snapshot title `Just Row` ≠ `ref.title` →
  returns `ref.title`); only the TYPE branch is silent (`rowedType`
  undefined). One clause, in the type branch only.
- **`PlanLink` has no `workoutId`** ⟨F1⟩: `resolveNewestPlanLink`'s select
  (`server/stores/logs.ts:441-459`) does not project it, and `parseLink`
  (`usePlanLinks.ts:73-131`) does not accept it — History's `RecentLog`
  is a different endpoint. The chip's PAIR test needs it on THIS wire: an
  additive projection + route field + parse guard.
- **The shipped mark prints the prescription title in its own case:**
  `INSTEAD OF 2K Test`, not `2K TEST` (`Plan.test.tsx:539`,
  `e2e/log.spec.ts:1266`; `.plan-row-swap` has no `text-transform`). Rev
  1's board and criterion 3 said `2K TEST` ⟨F4⟩; both corrected.

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

1. **Server — the default lives in the STORE, once** ⟨F1 store⟩: rev 1
   put the free-row default at the route while claiming the store
   enforced it; `LogInput.advancesPlan` is a required `boolean`
   (`logs.ts:154`), so a store rule of `=== true` was identical to the
   bare flag — a no-op. Rev 2: `LogInput.advancesPlan` becomes OPTIONAL;
   the store resolves `input.advancesPlan ?? !isFreeRow(workoutId,
   workoutType)` and advances on the resolved value; the route's `?? true`
   at `data.ts:1728` is deleted (it passes the field through). The fake
   store (`fakes.ts:675`) and `storeContracts.ts:603` change in lockstep,
   contract-tested against both. **Invariant, stated:** a free row
   advances the plan iff its body says `advancesPlan: true`; a workout row
   advances unless its body says `false`; the resolution happens in one
   place, the store. One integration test per arm, plus the parent spec's
   exit criterion 1 amended: `done_n` unchanged across a Just Row save
   *that does not opt in*.
1b. **The wire carries `workoutId` on a plan link** ⟨F1, corrected G4⟩:
   `resolveNewestPlanLink` projects `sessionLogs.workoutId` BY NAME (not
   the LEFT JOIN's `workoutRowId`, which is null for a DELETED workout and
   is kept distinct on purpose, `logs.ts:486-489`); no route change —
   `GET /api/logs?plan=` returns `{ links }` straight from the store
   (`data.ts:1207-1216`); `parseLink` accepts `string | null | undefined`,
   because an OLD server omits the key and the same function's
   `workoutIsGlobal` guard already records that rule ("a MISSING key is
   also unknown rather than a rejection"). The chip requires the key
   PRESENT and null, so a new build ahead of the deploy shows the plan
   with no chips rather than no plan. Additive.
2. **The Just Row log door (`JustRowLog.tsx`), both entry kinds:** reads
   `usePlan()`; with a plan, renders the pair with the shipped classes and
   the shipped label (`Log against plan · SESSION ${doneN + 1} OF ${N}`)
   leading, `Save without logging` under it; with no plan, `Save without
   logging` alone. `Log against plan` posts `advancesPlan: true` — which
   means `useLogForm`'s body builder learns to write the key when it is
   `true` as well as when it is `false` ⟨F2⟩ (`LogSession.tsx:720`; the
   comment at `:680-683` and the pin at `LogSession.test.tsx:4574` are
   reconciled: the programmed door's omitted key still means "default",
   and the default is now the store's); the other button posts `false`. "Save this row" is retired (it existed because a free row
   could never count). The onboarding demotion rule in `PostWorkoutSummary`
   does not apply (no onboarding title on a free row).
3. **Plan tab (`Plan.tsx`):** `rowedType` stays as is; the badge slot
   tests the free PAIR FIRST — `isFreeRow(link.workoutId, link.workoutType)`
   with `workoutId` present — renders `FreeRowChip`, and only then the
   unknown-type box (`Plan.tsx:420` fires that box on `rowedType(link) ===
   undefined`, which a free row also satisfies, so order is load-bearing
   ⟨F5⟩; both cases pinned as distinct). **Centred on both axes** (James,
   Gate 0 rev 1b/1c), stated against the CSS that exists ⟨G2, G3⟩:
   `.plan-row` and `.today-log-row` are `display: flex`, so horizontal
   centring is `min-width` equal to `.type-badge`'s rendered box plus
   `text-align: center` on the chip (never `justify-self`, inert in flex);
   `.plan-row-swapped` is already `display: grid; align-items: center`
   with the badge centred WITHIN THE NAME LINE and the mark on its own row
   — the change is `grid-row: 1 / -1` on the badge slot (and the number
   and check), so every chip on a two-line row centres against name +
   mark. **This moves every swapped row's `TypeBadge`, not only the JR
   chip** — stated in the handoff README and ROADMAP so the PM gate sees
   it. The layout assertion lives where layout exists: `e2e/design.spec.ts`
   (`boundingBox`; jsdom returns zero rects, so a jsdom "within 1 px" would
   pass any layout — ⟨G1⟩), with its mutation named: delete `grid-row: 1 /
   -1` and the assertion goes red. `swapMark` gains ONE clause in its TYPE
   branch ⟨F3⟩: a linked free row (the pair) on a type day marks
   `plannedType`; the checkpoint branch already marks it with `ref.title`,
   in the title's own case (`INSTEAD OF 2K Test`).
4. **Today:** no change; `SESSION n OF N` reads `doneN`.
5. **Notes:** the release that ships this retires v0.32.0's "A Just Row
   never advances your plan" (ROADMAP row exists from the close gate).

## What DOES change that rev 1 said would not ⟨F8⟩

A linked free row becomes eligible for every reader of the link:
- the detail's plan footer prints `Logged to Sprint · SESSION n OF 84`
  (`storedSummary.ts:937-945`) — correct, it did stand in;
- deleting it shows the shipped "the checkmark un-ticks" copy
  (`FromTheLog.tsx:567`) and **decrements `done_n`** (`logs.ts:626-704`),
  exactly as deleting any linked row does. **This is the intended
  reading — a stand-in that is deleted stops standing in — stated here as
  a ruling James can overrule at Gate 0; one integration case pins the
  decrement (exit criterion 1's delete half flips with it).**

What does not change: History rows, the connected surface, the Timer,
`isFreeRow`'s three other jobs (the empty-steps allowance, the chip, the
`source` consistency rule).

**Named, not built** ⟨G-debt⟩: `session_logs.workout_id` is
`onDelete: "set null"` (`schema.ts:161-163`), so a linked row that was
saved with a null TYPE and whose workout is later deleted becomes the
pair `(null, null)` and would wear the JR chip. No supported producer
posts a null type with a workout id today (`stores.integration.test.ts:753`
merely tolerates the shape). If one ever does, the chip's predicate needs
the row's `source` or a stored marker; until then this is a known
false-positive class with zero members.

**Prose that staled with the route default** ⟨G-sweep⟩, all reconciled
in the PR: `LogSession.tsx:680-683` ("only when false"),
`LogSession.test.tsx:4574` and `:5231` titles, `logs.ts:145-147`
(`LogInput`'s "the default the route falls back to"),
`data.test.ts:2393`. No `LogSession` call site passes `advancesPlan:
true` today (`:1461`, `:1973`, `:2206` all `handleSave()`), so teaching
the builder to write `true` flips zero existing pins.

## Exit criteria (frozen at spec approval)

1. Server: a free row with `advancesPlan: true` advances `done_n` by one
   and receives `plan_key`/`plan_index`; with `advancesPlan: false` or
   ABSENT it does neither (three integration cases at the HTTP boundary,
   asserting `GET /api/plan`'s `doneN` and the row's link); deleting the
   linked free row decrements `done_n` (the delete half). A workout row
   with `advancesPlan` absent still advances (re-pinned beside the new
   arm). The store contract test covers both stores. Tests that flip:
   `freeRow.integration.test.ts:152` and `:189`,
   `stores.integration.test.ts:701`; `:726`/`:735` stay ⟨F7⟩. **Parent
   criteria, numbered correctly** ⟨G5⟩: the unconnected spec's criterion
   **2** (`done_n` unchanged across a Just Row save) is amended to "unless
   the body opted in"; its criterion **1** pinned `advancesPlan: false`
   and the button `Save this row` — that pin is RETIRED by §Mechanism 2
   (the button no longer exists), and the criterion is rewritten to the
   pair's two bodies.
2. Door: with a plan, the pair renders with the shipped label text and
   classes and `Log against plan` posts `advancesPlan: true` while
   `Save without logging` posts `false`; with no plan only `Save without
   logging` renders; "Save this row" appears nowhere (grep).
3. Plan tab: a linked free row renders `.free-row-chip`, no `.type-badge`,
   no `.plan-row-badge-unknown`, the name `Just Row`, and `INSTEAD OF AT`
   on a type day / `INSTEAD OF 2K Test` on a checkpoint day; a linked row
   with an UNKNOWN type string still renders the unknown box (the two
   cases are distinct and both pinned); on a two-line row the chip's box
   centre is within 1 px of the name+mark block's centre — asserted in
   `e2e/design.spec.ts` with `boundingBox` (not jsdom ⟨G1⟩), mutation:
   delete `grid-row: 1 / -1` → red; and the re-taken `plan-linked`
   capture shows the shipped O2 swap row's badge moved too.
4. RF24 seam: one e2e starts at the Just Row door with a plan active,
   presses `Log against plan · SESSION 1 OF 84`, and asserts `SESSION 2 OF
   84` on Today and the marked row on the Plan tab.
5. Every string on the boards appears verbatim.

## PR shape

One PR, TRIAD (the meaning of `SESSION n OF N`): antagonist full pass
DONE (rev 1 → 2; ledger entry rides this branch), Gate 0 approval, plan,
implementation, PM final gate. Product files: `server/stores/logs.ts`
(+ `fakes.ts`, `storeContracts.ts`), `server/routes/data.ts`,
`usePlanLinks.ts`, `LogSession.tsx` (`useLogForm`), `JustRowLog.tsx`,
`Plan.tsx`, `index.css`.
