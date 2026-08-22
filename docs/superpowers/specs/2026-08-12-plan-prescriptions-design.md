# Plan prescriptions: a plan day can pre-suggest a specific workout

> **STATUS (2026-08-22).** UNPARKED by James ("let's do it") — Phase 8A is
> live work. Landed on main by the phase8-split PR. Still binding before
> execution: a verification refresh of every file/line citation in this
> document against current code (~25 merges since it was written, including
> Phase WU's warm-up removal). `ROADMAP.md` Phase 8A remains the authority on
> scope.

> **SCOPE NOTE (added 2026-08-12, after the PM holistic review).** This
> document is rev 2 plus amendments and describes MORE than phase one ships.
> `ROADMAP.md` Phase 8A is the authority on what phase one contains;
> `2026-08-12-plan-prescriptions-pm-review.md` is the authority on what was cut
> and why. Cut from phase one: §5's ruling to wire `GET /api/today` (the review
> found that route has no product consumer and its stated justification is
> factually wrong), §11b's `suggested_title`/`suggestion_taken` capture task,
> and §3.2's `prescriptionForToday`/`PrescriptionContext` wrapper including the
> `date?` field. §4's precedence ladder stays as recorded prose but is cut from
> the implementation's vocabulary and is re-opened in Phase 8C. Two things the
> spec MISSES entirely, both real: Today's type-swap chips
> (`DEVIATIONS.md:43`), and SHUFFLE being disabled when `poolIds.length <= 1`.
>
> **James's ruling on the chips (2026-08-12), which resolves both:** the lit
> chip is the SUGGESTED workout's own type, and swapping to another chip
> OVERRIDES the prescription, with a visible marker that the suggestion has
> been overridden. The marker says overridden; it does NOT name the displaced
> workout, so §4's no-displaced-note ruling stands unchanged. This also gives
> the empty-or-single-pool case an exit that SHUFFLE cannot provide there, so
> the §3.3 bypass is no longer a one-way door on those days. The marker's
> placement (the plan line's existing `prescribedCode → swapType` arrow at
> `Today.tsx:1050-1053`, or its own element on the card) is 8A's design pass
> to settle, with a DEVIATIONS row.

**Date:** 2026-08-12 (rev 2, after two antagonistic reads)

## Where this came from

James, in order:

1. "Make sure 2k and 6k tests have workouts. They can be classified as the
   appropriate types. AN for 2k test, make me a rec for 6k test."
2. "Ensure that when the plan says 'test' those are always displayed as
   suggested until shuffle is hit."
3. "In the future I may want to allow people to pre-plan and reserve
   specific workouts in advance, or decide plans with opinionated workout
   routines. Whatever we do I want the seam to be prepared for that."
4. "Changing 'test' in our plans to days of the right type and just
   pre-suggesting the appropriate tests for them."
5. "Check the names of the tests. They can break convention and be called
   literally '6K Test' so that it's obvious."

**Rulings on record:** 2k test is AN. 6k test is AT (Claude's
recommendation, §2, accepted). Checkpoints pin by plan (sprint→2K,
head→6K). Plan days become data-carrying so an authoring UI has a field to
write to. The rename migrates titles in place rather than losing log links.

**Rev 2 exists because two antagonistic reviews (a PM lens and an engineer
lens) found nine and twelve findings**, including three compile failures
rev 1's file list missed, a second `suggest()` caller the architecture never
mentioned, a control-flow ordering that could drop the prescription
entirely, and one claim of mine that was simply FALSE. Every one is
resolved or deferred by name below.

## 1. What is wrong today

A plan checkpoint suggests a random TR workout. `domain/suggest.ts:187`
maps `todayCode === "TEST"` to `matchType: "TR"`, and the two designated
test workouts are filtered OUT of the suggestion pool
(`Today.tsx:940-941` and `server/routes/data.ts:943-957` — both callers,
§5). So the three checkpoints, whose whole job is re-measuring the
baselines every other workout resolves against, never surface their own
workout.

`"TEST"` as a plan code is also the wrong shape: it forces every consumer
to answer "what type is a TEST day?" (`suggest.ts` says TR, `Today.tsx`
repeats that mapping, `Plan.tsx` keeps a local colour map and a bespoke
badge, `tokens.css` carries `--type-test`), and none of those answers help
a plan author who wants to pre-suggest a specific O2 workout on an O2 day.

The two workouts exist (`server/seed/library/onboarding.ts`) as single
distance work steps at effort refs, so they run with no baselines at all.
Their classification is wrong and their names do not say what they are.

## 2. Why AT for the 6K (recommendation, accepted)

A 6k trial is 22 to 26 minutes at the hardest pace the rower can hold.
Against the app's own definitions (`workoutTypes.tsx`): O2 is
conversational and deliberately unimpressive; TR is short repeats with
rests around three times the work; AN is 30 to 90 second bursts for power.
AT is "find the line where your body stops keeping up, then row just under
that line for longer" — which is what a 6k trial IS and what it is FOR. The
pair then matches how the app consumes each number: **2K → AN measures the
ceiling, 6K → AT measures the threshold**, and every AT and O2 workout
resolves against 6k pace.

## 3. The seam

Three parts. The middle is shared by both callers; the outer two are where
future producers plug in.

### 3.1 Plan days carry their own prescription (`domain/plans.ts`)

```ts
export interface PlanDay {
  type: WorkoutType;
  /** Pre-suggested workout for this day, if any. AUTHORED DATA — the three
   *  checkpoints populate it today; a future authoring UI writes the same
   *  field, and a DB-loaded plan satisfies the same interface. */
  prescribe?: Prescription;
}

export interface PlanPreset {
  key: string; // an opaque preset key today, a plan id tomorrow
  title: string;
  sessions: PlanDay[]; // 84
}
```

`PlanCode` retires: `WorkoutType | "TEST"` becomes plain `WorkoutType` at
every call site and the alias is deleted.

This answers the PM review's first blocking finding. Rev 1 narrowed
`sessions` to `WorkoutType[]` while claiming to prepare for authored
routines — "it just replaced one closed union with another closed shape." A
per-day record with an optional `prescribe` gives an authoring UI a real
field and makes the resolver data-driven instead of a hardcoded index
switch.

### 3.2 Resolving a prescription (`domain/prescription.ts`, new, pure)

```ts
export type PrescribedRef = { kind: "title"; title: string; globalOnly: boolean };

export interface Prescription {
  ref: PrescribedRef;
  /** The suggestion's reason line, authored WITH the prescription so no
   *  consumer branches on where it came from. */
  reason: string;
}

/** THE one resolution point. Both callers (§5) ask this and nothing else,
 *  so when a second producer arrives it is added HERE — inside one function
 *  that already exists — rather than at two call sites that would each have
 *  to invent precedence. Today it consults exactly one producer.
 *
 *  The context is an OBJECT so `date`/`userId` are additive later rather
 *  than a signature change rippling through both callers. */
export interface PrescriptionContext {
  plan: PlanPreset;
  sessionIndex: number;
  /** The ROWER'S local date, for date-keyed producers. Present on the
   *  client, which computes it already (`todayDateString()`); OPTIONAL on
   *  the server, which has no date input today. A producer that needs a
   *  date is skipped when it is absent — deliberately, because using the
   *  server's own UTC clock would be silently wrong for any rower outside
   *  it (James, 2026-08-12: an app-produced date-specific suggestion is a
   *  likely near-term feature, so the field is worth having now; guessing
   *  the date is not). */
  date?: string;
}

export function prescriptionForToday(
  ctx: PrescriptionContext,
): Prescription | null;

/** The plan's own producer: `plan.sessions[i]?.prescribe ?? null`. Exported
 *  for its own tests and for the Plan screen's checkpoint marker (§10). */
export function planPrescription(
  plan: PlanPreset,
  sessionIndex: number,
): Prescription | null;

/** A ref to a real workout, or null. Shared by BOTH suggestion callers
 *  (§5) so this lookup exists exactly once. */
export function resolvePrescribed<
  T extends { title: string; isGlobal: boolean },
>(ref: PrescribedRef, workouts: readonly T[]): T | null;
```

`planPrescription` reduces to `plan.sessions[i]?.prescribe ?? null`, and
`prescriptionForToday` is today just a call to it — both trivial by design,
because the knowledge moved into the DATA and the only thing the resolver
will ever hold is the precedence order (§4).

`PrescribedRef` is a union with one member. A reservation of a personal
workout adds `{ kind: "id"; id: string }`; only `resolvePrescribed` grows a
branch.

### 3.3 Pinning it (`domain/suggest.ts`)

`SuggestInput` gains
`prescribed?: { entry: LibraryEntry; reason: string } | null`.

**Ordering is binding:** the prescribed branch is evaluated BEFORE the
`sorted.length === 0` early return at `suggest.ts:204-211`. That return
fires from the type-matched pool alone, so an account whose library holds no
AN workouts would otherwise read "No AN sessions in your library" on the
one day the checkpoint matters most. A test pins that case by name.

With a prescription present and no `todayPickId`: the prescribed entry is
the pick, its reason is the suggestion's reason, and **every preference
filter is bypassed** — difficulty, time cap, pain, last-done, source. The
first four because a prescribed workout is not a suggestion from a pool and
the rower must still meet their checkpoint. Source for a narrower reason:
the ref itself pins ownership via `globalOnly`, so a source preference has
nothing left to decide, and that stays true when `{kind:"id"}` arrives.

`fellBack` keeps its ordinary pool meaning and is NOT forced by a
prescription — it describes the pool, which the escape hatch still uses.
Pinned by a test.

`poolIds` stays the day's own type pool, so SHUFFLE escapes into another
workout of that type. **The prescribed entry is deliberately NOT a pool
member** (both callers exclude onboarding titles), which makes
`Today.tsx:1009-1017`'s "indexOf never actually returns -1" comment FALSE on
the first SHUFFLE of every checkpoint's life. The comment is corrected, and
a test pins that SHUFFLE from a checkpoint lands on `poolIds[0]`
deliberately rather than by accident of the `-1` fallback.

## 4. What "always suggested until shuffle" means mechanically

`todayPickId` is a local override keyed `{date, planKey, doneN}`. A
prescription yields to it, so SHUFFLE is the escape; a reload before any
SHUFFLE shows the checkpoint again, and the next checkpoint re-pins on its
own day.

**That escape is the CHECKPOINT'S semantic, not the seam's.** A rower's own
future reservation must be CANCELLED, not overridden by an ephemeral pick
that lets it silently return on reload. Recorded so the reservation feature
does not inherit the wrong verb.

### The precedence ladder (James, 2026-08-12) — decided now, mostly unbuilt

> "Rower wins all -> a theoretical date -> plan prescription"

1. **What the rower does now wins.** A live pick — SHUFFLE, an explicit
   choice — beats every prescription. Already the mechanism: `todayPickId`
   is checked before any prescription, and it sits OUTSIDE
   `prescriptionForToday` because it is not a prescription at all.
2. **Then a date-keyed prescription** (a reservation the rower made in
   advance, or any future dated producer). Beats the plan because it is
   more specific and more recent than a routine authored months earlier.
3. **Then the plan's own prescription** — today's checkpoints.

Only tier 3 exists today, so this costs nothing to record and settles the
question the PM review flagged as unresolved: when reservations land they
are inserted as a producer ABOVE the plan inside `prescriptionForToday`,
and a displaced plan prescription is simply **dropped — no note, no
carry-forward** (James: "We don't need a displaced note. We just move on.").
That is the honest reading of the ladder: a higher tier does not negotiate
with a lower one, and a checkpoint the rower rowed past is a checkpoint they
declined, not a debt the app should nag about. It also keeps the resolver a
pure pick-the-winner function with no state to accumulate.

The ladder gets its asserting test the day tier 2 exists; today a test pins
tier 1 beating tier 3, the only pair that can be exercised.

## 5. Both suggestion callers, not one

`GET /api/today` (`server/routes/data.ts:910-992`) is a second, live,
independently tested `suggest()` caller: it derives `todayCode` from
`PLANS[key].sessions[doneN]` at `:934`, builds its own entries with the
identical onboarding exclusion at `:943-957`, and calls the shared
`suggest()` at `:968`. Rev 1 put resolution in `Today.tsx` alone, which
would have left a checkpoint request to that route suggesting an ordinary
AN/AT workout forever — this feature's own bug, reproduced on a route that
already ships wired.

**Ruling: wire both.** Each caller does
`prescriptionForToday({ plan, sessionIndex: doneN, date? })` →
`resolvePrescribed(ref, workouts)` → `suggest({ …, prescribed })`, sharing
the two domain helpers — so a future producer reaches both screens by being
added inside the resolver, with neither caller touched. Native-first makes this non-optional: the iOS
client may hit that route directly.

## 6. The plan data change

`buildSessions` stops splicing `"TEST"`. Each checkpoint index becomes a
`PlanDay` carrying its type AND its prescription: **sprint → AN + the 2K
Test ref**, **head → AT + the 6K Test ref**. Numbers computed against the
real presets and independently re-derived by the engineer review:

| | O2 | AT | TR | AN | total |
|---|---|---|---|---|---|
| sprint (was O2 34 / AT 23 / TR 14 / AN 10 / TEST 3) | 34 | 23 | 14 | **13** | 84 |
| head (was O2 41 / AT 21 / TR 11 / AN 8 / TEST 3) | 41 | **24** | 11 | 8 | 84 |

Both keep the O2 > AT > TR > AN pyramid `plans.test.ts` pins by name. Two
existing invariants were checked, not assumed:

- **"never repeats one code more than 3 in a row"** holds; worst case is a
  run of TWO (sprint 62-63 AN, head 34-35 AT). All six checkpoint slots
  held O2 before the overwrite; neighbours are `5:O2 7:O2`, `33:O2 35:AT`,
  `61:O2 63:AN` (sprint) and `61:O2 63:O2` (head).
- **"sprint back half is speed-biased"** holds, and was the real risk: two
  of three checkpoints sit in the front half, so AN+TR goes front 9→11 and
  back 15→16. The margin narrows from 6 to 5. Recorded, because a future
  front-half checkpoint could flip it.

**A new test asserts every `prescribe` ref in `PLANS` resolves against
`GLOBAL_LIBRARY_SEED`**, so an authored ref naming a missing workout fails
CI instead of vanishing silently — quiet degradation is right for a runtime
miss, wrong for authored content.

## 7. Renaming the tests

`ONBOARDING_TITLES` becomes `k6: "6K Test"`, `k2: "2K Test"`, deliberately
breaking the library's poetic-name convention: these two are instruments,
not sessions, and the name should say so. Uppercase `6K`/`2K` matches how
the app already writes distances (`6K+12` in structure lines, the baseline
editor's own `2K`/`6K` labels).

**The rename needs a migration.** `seedGlobalLibrary`
(`server/seed/seed.ts:73-91`) converges by TITLE: content changed →
`updateGlobal` in place (which is why §8 self-heals for existing accounts),
title missing from code → **DELETE**, and `session_logs.workout_id` nulls
via `ON DELETE SET NULL`. A bare rename would delete the old rows and break
the workout link on any log already recorded against them (the log's own
snapshot survives; navigation does not).

So the seed gains a one-time legacy map:

```ts
const LEGACY_TITLE_RENAMES: Record<string, string> = {
  "First 6k": "6K Test",
  "First 2k": "2K Test",
};
```

applied BEFORE the delete pass: a DB row whose title is a legacy key, and
whose new title is absent, has its title updated in place. Tests pin both
directions (a legacy row renames and keeps its id; a genuinely removed
title is still deleted) plus idempotency.

## 8. Classification

| Workout | Type | Difficulty | Pain | Was |
|---|---|---|---|---|
| `2K Test` | AN | hard | 5 | AN / easy / 2 |
| `6K Test` | AT | hard | 4 | O2 / easy / 2 |

Both are maximal efforts; the old values said otherwise. Verified safe:
`onboarding.test.ts` pins neither field today, and `library.test.ts`'s
300-row quota grid never sees these rows (they live outside
`LIBRARY_WORKOUTS`). §3.3's filter bypass is what stops an honest `hard`
from letting a rower's own preferences hide their checkpoint.

## 9. Two states a prescription must not fight

**No baselines yet.** `Today.tsx`'s `needsBaselineCard` already replaces the
whole suggestion region with `BaselineCard`, which prescribes these same two
workouts by title. A checkpoint in that state keeps showing the
BaselineCard: same instruction, better framed. The prescription path lives
strictly inside the has-baselines branch.

**No plan active.** Freestyle has no plan day, so no prescription. A
reservation feature would want freestyle too, which is why the resolver
sits outside `suggest()`.

## 10. What the retirement deletes

- `suggest.ts`: the `matchType` translation line.
- `Today.tsx`: `effectivePrescribed`'s `"TEST" → "TR"` mapping.
- `Plan.tsx`: `CODE_COLOR_VAR` and the local `CodeBadge`, which exist only
  because `TypeBadge` cannot render `"TEST"`; the screen uses `TypeBadge`. A
  checkpoint stays marked, derived from
  `prescriptionFor(plan, i) !== null` — covering every PLAN-NATIVE
  prescription, present and future. It does NOT cover a future date-keyed
  reservation, which has no field on `PlanSequenceItem` (§12).
- `tokens.css`: `--type-test` loses its last consumer and is removed.
- `docs/design/DEVIATIONS.md:56` cites `--type-test` while justifying a
  still-live claim about `--type-tr`; reword to cite the on-color pairing
  directly.

**Unrelated same-named union, explicitly untouched:** `Step`'s
`{k: "test"}` kind (`domain/types.ts:35`) and `Timer.tsx:67-68`'s `"TEST"`
phase label are a different vocabulary. Nothing here touches them.

## 11. Files this touches

Rev 1's list caused three confirmed compile failures. Complete list:

**Domain:** `plans.ts`, `prescription.ts` (new), `suggest.ts`,
`onboarding.ts`, and each one's test.
**Server:** `routes/data.ts` (the `PlanCode` import at `:6`/`:934` AND §5's
wiring), `seed/seed.ts` (rename migration),
`seed/library/onboarding.ts`.
**Client:** `src/api/usePlan.ts` (`PlanCode` at `:3`/`:9`),
`src/today/Today.tsx`, `src/plan/Plan.tsx`, `src/theme/tokens.css`.

**Tests that WILL FAIL and must be updated deliberately**, enumerated so
they are not discovered mid-build: `domain/suggest.test.ts`'s "treats TEST
as TR" (delete — the behaviour is gone); `src/today/Today.test.tsx`'s
`PLAN_TEST` fixture (`:147-150`) and its three consumers (`:1426-1445`,
`:1448-1460`, `:1540-1544`, asserting `"SESSION 21 OF 84 · TEST"`,
`"TEST → AN"`, and TR's descriptor); `src/session/LogSession.test.tsx:14`
and `:231` (`PlanCode` cast); `domain/onboarding.test.ts:12-13`; and every
literal title in `e2e/onboarding.spec.ts:28-29`,
`e2e/library.spec.ts:460-461`,
`src/today/BaselineCard.test.tsx:28-29,93,106`, plus the comments at
`server/routes/data.ts:947`, `server/routes/data.test.ts:1955,1980`, and
the test name at `server/seed/library/onboarding.test.ts:41`.

**e2e cost, budgeted:** reaching checkpoint index 6 takes SIX real
log-and-advance cycles — `PUT /api/plan` accepts only `{planKey}` or
`{reset}`, so `doneN` moves only via `POST /api/logs`. Six posts, not the
single-advance idiom existing tests use.

## 11b. Capturing "did you take the suggestion?" (James, 2026-08-12)

> "A user will be interested in knowing which days they suggested over and
> what the other suggestion would be."

**The seam does not cover this, and the missing piece is DATA, not
architecture.** `session_logs` (`server/db/schema.ts:90-125`) records the
workout, its title and type, steps, baselines, held, pain, notes and device
— no `planKey`, no `doneN`, nothing about what was suggested. So the
question cannot be answered retrospectively: a log does not say which plan
day it belonged to, `doneN` is zeroed by a plan switch or reset, and an
outside-plan log never advances it.

The asymmetry that decides the timing: **the screen can be built whenever,
but the data cannot be backfilled.** Every day shipped without capture is
permanently absent from that history.

So each log gains, nullable and additive:

- `suggested_title` — what the app put in front of the rower (a
  prescription, or the ordinary suggestion; James's framing covers both:
  "days they suggested over" includes shuffling away from a plain
  suggestion, which is arguably the more telling signal).
- `suggestion_taken` — whether the logged workout is the one suggested.

Both nullable: existing rows read back null and nothing backfills, the same
convention `device_name` already set (`schema.ts:112-121`). One migration,
no backfill, no UI.

**This does NOT reopen the displaced-note ruling.** James: "We don't need a
displaced note. We just move on." That governs the MOMENT — nothing is
surfaced on the day, no nag, no carry-forward. This is the retrospective
record only, written silently at save time and read by some future history
screen. The spec forbids surfacing it as a prompt on the day.

## 12. Deferred, deliberately and by name

Rev 1 oversold the seam. These are the parts it does NOT solve:

- **Date-keyed prescriptions.** `doneN` advances per LOGGED SESSION, not per
  calendar day (`logs.ts` increments on save; `data.ts:934` reads
  `sequence[min(doneN, …)]` with no calendar awareness), and a plan
  switch/reset zeroes it. **Rev 1's claim that index-keying serves "a rower
  reserving next Tuesday" was FALSE and is struck.** Reservations need a
  second, user-scoped, date-keyed producer; §3.2's `resolvePrescribed` and
  §3.3's pinning serve it unchanged, but `prescriptionFor` cannot.
- **A date-keyed producer itself.** Precedence is DECIDED (§4) and the
  context now CARRIES the date (§3.2), so a producer is a pure drop-in.
  What is not built: any producer, and the optional `?date=` param on
  `/api/today`. The route consults only date-independent producers until
  that param exists — stated rather than faked with the server clock.
- **A `kind` discriminant on `Prescription`** (`"plan" | "reservation"`).
  Something must eventually branch on producer, because the escape verb
  differs (shuffle-away vs cancel, §4) — but it is held until it has a
  consumer, since `reason` already covers everything a display needs today.
- **Plan-screen rendering of non-plan prescriptions** (`PlanSequenceItem`
  has no field for them).
- **Multiple options per day** — `Prescription | null` cannot express "A or
  B".
- **Global title uniqueness.** No DB constraint exists
  (`server/db/schema.ts`); today's two titles are unique by test, not by
  schema. A multi-author future should move to `{kind:"id"}` rather than
  trust titles.
- Trend/history treatment of checkpoint results; how baselines are written
  after a test (the existing log flow already does it).

## 13. Testing

- **`prescription.test.ts`** (100% pinned): `prescriptionFor` returns the
  right ref at each plan's three checkpoints and null everywhere else;
  `resolvePrescribed` honours `globalOnly`, returns null for a missing
  title, and — the case that matters most here — does NOT return a rower's
  custom workout that happens to share a designated title.
- **`plans.test.ts`**: updated tallies; the retired-`"TEST"` assertions
  replaced by checkpoint-day assertions (type AND prescription at each of
  the three indices); adjacency and half-bias invariants retained; and
  every `prescribe` ref resolving against `GLOBAL_LIBRARY_SEED`.
- **`suggest.test.ts`**: prescribed becomes the pick with its reason;
  survives each bypassed filter as its own case; **survives an empty
  type-matched pool**; `todayPickId` beats it; `fellBack` unaffected;
  `poolIds` still the day's type pool; a null prescription leaves today's
  behaviour byte-identical.
- **Seed tests**: the legacy rename in place (same id), a real removal still
  deleted, an idempotent second boot, and a content-only change still
  updating in place.
- **Server (`data.test.ts`)**: `/api/today` on a checkpoint day returns the
  test workout with its reason, and does not on other days.
- **Client (`Today.test.tsx`)**: a checkpoint shows the plan's own test from
  real fixtures; SHUFFLE lands on `poolIds[0]` and escapes; a reload before
  SHUFFLE shows it again; head shows 6K where sprint shows 2K; a library
  missing the seed degrades to an ordinary suggestion.
- **e2e**: a plan advanced six sessions shows the test and can START it;
  SHUFFLE escapes.
- Self-mutation for every behavioural test; per-file coverage reported;
  `pnpm e2e` and `pnpm screenshots` both run, with a new checkpoint capture
  opened and described.
