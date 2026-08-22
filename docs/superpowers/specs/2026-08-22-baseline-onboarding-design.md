# Baselines: three doors in, one measurement out

**Date:** 2026-08-22 (rev 2, same day — after the phase-open gates).
Brainstormed live with James on the "Baseline Onboarding" design canvas.
**Canvas:** the artboard sources are COMMITTED at
`docs/design/baseline-onboarding/` (Main, RowPath, Experienced,
Question1, Question2, Recommendation, plus the not-chosen DoorsIdentity
and the layout manifest); the live, editable copy is the Claude artifact
"Baseline Onboarding"
(https://claude.ai/code/artifact/f297d1d6-3a2d-49d5-a58d-ee04c29417f2).
The committed files are the repo's pixel reference; the artifact is the
editing surface.

**Rev 2 exists because the phase-open gates (antagonist anchor, full
weight — this is TRIAD — and the PM slate gate) found 3 blocking and 11
substantive defects in rev 1's MECHANISM claims while every product
ruling held.** Every finding is resolved by name below; the gate
reports' ledger entries ride this spec's own PR.

## What and why

Some people are more motivated to start rowing than to learn about
baselines. Today the only onboarding path OFFERS "row a First 6k and it
sets your baseline" — **and that is a shipped lie the gates exposed:
nothing in the client writes a baseline except the You editor**
(`you/BaselineEditor.tsx` is the sole writer; the card's own copy,
`START_HERE_STEPS[0]`, and an e2e pin all assert a behavior that does
not exist). This phase replaces the single false door with three real
ones, framed by OUTCOME (James: an experienced rower may also just want
a recommendation):

1. **Recommend my baseline** — two quick questions, then a recommended
   starting pair.
2. **I know my baseline** — enter the splits directly.
3. **Row to find my baseline** — a relaxed 6k OR a raced 2k; the
   measured result is OFFERED, and this time accepting actually writes.

And it closes 8A's open loop: after a test session the app offers the
measurement instead of asking the rower to remember a number.

## Rulings (James, 2026-08-22; rev 2 additions marked)

- **Provenance: stored, never shown — PER NUMBER (rev 2).**
  `k2Source` and `k6Source`, values
  `manual | estimated | derived | tested`. One row holds two numbers
  with independent origins (door 1 estimates both, session 7's 2K test
  measures only k2), so one column would lie to the very consumer the
  ruling exists for. Never surfaced in UI.
- **Doors framed by outcome (canvas Option A).**
- **Door 3 is dual-distance**, and (rev 2) **accepting one measured
  number OFFERS the counterpart via the existing derivation**
  (`domain/deriveBaseline.ts`, `K2_K6_OFFSET_SECONDS = 7`) as a second,
  optional offer writing `derived` — never blocks, never auto-writes;
  declining leaves the pair partial. The same offer answers a `tested`
  write that lands inconsistent with its stored counterpart.
- **Two questions, NO age band, minimal PII** — and (rev 2, PM):
  **the questionnaire answers are TRANSIENT, never stored.** No
  Health-category field exists or is created; the calibration signal
  ("how wrong was the table?") comes free from `estimated` provenance
  plus a later `test_history` row.
- **Declining the prompt still records the test (rev 2).** Every
  designated-test session with a measurable result appends to
  `test_history`; the prompt governs ONLY the baseline write. This
  requires decoupling the wire (below) — today they are one call.
- **Reset onboarding (rev 2, James).** A deliberate, staged-confirm
  "Reset baseline setup" action on You clears both numbers and both
  sources and returns the account to the true no-baseline state — the
  doors render again. This is the product answer to the gate's
  unreachable-doors finding (a baselines-set account previously could
  NEVER re-enter onboarding by any path), and it serves any rower who
  wants a fresh start, not just demos.

## Research pass (corrected, rev 2)

- **The wire fact (antagonist B1, PM finding 2 — rev 1 was WRONG):**
  `isTestResult` rides `PUT /api/baselines` (`data.ts:582-618`; `:606`
  is inside that handler), NOT `POST /api/logs`. Recording a test and
  writing the baseline are today the same call. PR B decouples them
  additively: the test-history append becomes reachable without a
  baseline write (mechanism is the implementer's choice — a
  record-only mode on the same PUT or a sibling endpoint — with the
  binding behavior that decline records and accept records once).
  PRIMARY, repo.
- **The estimate table's grounding (M5/PM cond 4 — rev 1's PRIMARY
  claim withdrawn):** Concept2's rankings are axed by age/weight/sex
  over a self-selecting racing population — orthogonal to
  experience × cardio on both sides, and the wrong population for the
  beginner cells. The table is instead grounded on the SECONDARY
  recreational range (2:15–2:30/500m starting; beginner 2K ~2:00+)
  with a **stated conservative bias: too-slow is self-correcting
  (the rower feels underworked and the first test fixes it); too-fast
  is harmful.** Bounded, testable criteria replace "the numbers are
  right": every cell within the server's 60–240s band; no cell faster
  than the recreational fast end unless the rower answered "a lot" +
  "training hard"; every cell's 2k/6k gap agrees with
  `K2_K6_OFFSET_SECONDS` — or that constant changes with a stated
  reason and `SEED_K2`/`SEED_K6` move with it (see constants
  reconciliation below). Each cell names the population it was derived
  from; INFERENCE tags expected on the low-experience rows. **James is
  the named checker of all 16 cells, printed in PR C's body.**
- **Existing producers of the same numbers (PM finding 4 — must be
  reconciled, not multiplied):** the repo already holds THREE answers
  to the 2k↔6k relationship: `K2_K6_OFFSET_SECONDS = 7`
  (`deriveBaseline.ts`), the editor's seeds `SEED_K2 = 112` /
  `SEED_K6 = 122` (a 10s gap, and 1:52 is a club rower's 2k shipping
  today as every new rower's prefill), and now the table. PR C
  reconciles all three: one constant family, agreement asserted by
  test, seeds re-derived from the table's most-common cell.
- **"The domain's invariant" does not exist yet (S1):** nothing
  enforces k2 < k6 anywhere (server validates fields independently;
  the 7s offset is an offer, its own header says "estimate only").
  The 16-cell test ESTABLISHES the rule for the first time and pins
  totality (16 entries present over both key unions). The cost of
  inversion is real: `pace.ts` prices MAX at `k2Seconds` and MIN at
  `k6Seconds + 20`, so an inverted pair makes ALL OUT slower than
  EASY — the two tests are literally those refs.
- **Migration facts (M3/M4):** provenance columns are `pgEnum`
  (matching every closed value set in this schema, incl. PR #160's
  `ended_by` minted today) with `.notNull().default('manual')` — no
  NULL fourth state; existing rows read `manual` truthfully because
  the editor was the only writer that ever existed. **Coordination:**
  the drizzle journal head is 0011 and Phase LL's open PR #160
  (parallel session) already mints 0012 — whichever merges second
  deletes and regenerates its migration index.
- **Does the system have the concept?** Baselines: yes
  (schema.ts:63-73, per-FIELD patch semantics the editor's `touched`
  machinery deliberately relies on — vetted ground: the new columns
  ride the same whitelist/`onConflictDoUpdate` path). Provenance: no —
  the gap this fills. Test recording: half — the server path exists
  with zero client senders (verified again at the gate).

## Design

### The stored shape (TRIAD — PR A, alone)

`baselines` gains `k2Source`, `k6Source` (`pgEnum
baseline_source: manual | estimated | derived | tested`, not null,
default `manual`). Additive PUT: each numeric field may arrive with its
source; an old client's plain write defaults that field's source to
`manual` — exactly what its write is. The route validates sources
against the enum (a plain-text column would store `"banana"`).
**Write-site enumeration, from the code (PM cond 6 — four, not
three):** the You editor writes `manual`; the editor's existing derive
OFFER writes `derived` (rev 1 would have mislabeled it `manual` — the
one case the ruling serves); the questionnaire writes `estimated`; the
post-test prompt writes `tested`; door 3's counterpart offer writes
`derived`. Reset clears numbers and sources together.

### The post-test prompt (PR B, with the shortcut and the decouple)

**Post-save only (M6 — this is binding, not a design choice):** the
offer renders after a successful save. Placing it above the save stack
would flip `accountBaselines` live on accept and swap the two save
buttons under the rower's thumb, disabling the 6I protection at the
exact moment it applies; post-save also removes the accept+discard
state from the matrix entirely.
**Completeness guard (M2, binding):** the prompt offers only a split
measured over the test's full distance — a monitor run must have
completed its programmed distance (an `interrupted` run gets no
offer), a timer session likewise. Nothing in the current stack checks
this; the guard is new and tested.
**Where the number comes from, per session door (M1 — vocabulary:
"doors" in this spec means the three ONBOARDING doors; the app's
monitor/timer/manual session paths are called SESSION SOURCES):**
monitor and timer sessions produce a measured average split
(`monitorAvgSplit` / `timerAvgSplit`); a MANUAL log produces none
(`buildManualModel` returns no heroes) — a manual test session gets
no prompt, and the You editor remains its honest path.
**Recording (decoupled, James's ruling):** every designated-test
session with a measurable result appends to `test_history` exactly
once — accept or decline; idempotent against double-fire (the store
today has no dedupe and computes deltas off the previous row, so a
double-accept writes a delta-0 row — guarded by test).
**Identity:** `ONBOARDING_TITLES`, the same hook every consumer uses
(vetted ground).

### The You-screen re-test shortcut (PR B)

Row the 6k / race the 2k beside the baseline fields. It reuses
`useStartWorkout`'s start guards — **not** `BaselineCard` (M7: the
card refuses to render for a both-set account, and its toggle only
exists in the both-missing state; rev 1's "no new mechanism" claim was
half true — the guard transfers, the card does not). Compact controls
in the You screen's vocabulary; DEVIATIONS row.

### The three doors (PR C — opens only when Phase LL's spec exists, James's sequencing ruling, and only if the table meets its criteria; otherwise the phase closes on A+B)

The doors card replaces the single-offer card in Today's no-baseline
state. Committed canvas is the pixel reference. Door 2 → the editor's
fields brought forward (`manual`). Door 3 → the distance choice; both
cards render regardless of which single baseline might exist (the
doors card shows whenever the pair is incomplete, a superset of
BaselineCard's states — the RowPath screen is NEW UI in the card's
anatomy, not a reuse); completing a test lands in PR B's prompt, whose
accept then offers the derived counterpart.
**Door 1 never overwrites silently (M8):** if a number already exists
(typed but partial), the recommendation screen shows the existing
number as the rower's own and offers to fill ONLY the missing side;
the accept writes exactly the fields the rower saw offered.
**Reset onboarding** lands here too (it is what makes the doors
re-enterable): You gains the staged-confirm reset; the API learns to
clear the pair (today `PUT /api/baselines` rejects null — the clear is
a deliberate new operation, not a relaxed validator).
**Teaching-flow reconciliation (S3):** `START_HERE_STEPS[0]` ("Row 6k
once. That is your baseline."), the your-first-row article, and the
e2e pin at `flows.spec.ts:52` all assert the pre-BL single door — all
reconciled in PR C, and the card copy finally becomes true.

### The questionnaire (PR C)

Two single-select screens (roving-tabindex radiogroup, PaceRefInput's
pattern and its keyboard tests copied), then the recommendation
screen. Answers live in component state only — never persisted, never
sent beyond the resulting baseline write. The 16-cell table lives in
`domain/`, pure, each row commented with its population and source
tag, structurally total, k2 < k6 in every cell.

## Out of scope, stated

- Any consumer of provenance beyond writing it.
- Age, sex, weight, or any attribute question (standing PII ruling).
- Changing how targets resolve.
- The calendar (spec merged, waits behind this phase).
- The test-history LIST on You — stays Phase 8B's (this phase creates
  the producer; 8B builds the consumer; the notes must not imply the
  history is visible yet).

## Testing

docs/TESTING.md governs; TDD throughout. Highlights beyond rev 1:
migration integration tests (existing rows read `manual`/`manual`; an
old-client PUT leaves the untouched field's source untouched); the
completeness guard red-provable (an interrupted run must NOT prompt);
test_history idempotency; the derive-offer writes `derived` not
`manual`; reset returns a seeded account to the doors end to end; the
16-cell totality + inversion test; per-file coverage; e2e per door;
screenshots opened and checked.

## Exit criteria (draft — refined at each PR's gate)

PR A: every baseline write anywhere lands with a truthful per-number
source, proven by integration tests; nothing user-visible changes.
PR B: after a completed monitor/timer test from ANY entry point, the
rower is offered the measurement post-save; declining still records
the test; the You shortcut reaches both tests one tap from the fields.
PR C: a brand-new account reaches a fully working app through each
door (door 3 via the derive offer); Reset returns any account to the
doors; James has signed off the 16 printed cells; the StartHere step,
article, and card copy tell the truth. The phase may close honestly on
A+B alone (the stop-point) — then door 1's table becomes its own item.

## Release

v0.17.0, MINOR, its own tag (PM: this one ships things James can
falsify on his own account). Notes owe: the v0.16.0-promised loop is
closed; the You shortcut; "the doors appear for brand-new accounts
only — use Reset baseline setup on You to see them"; provenance is
stored and deliberately never shown.
