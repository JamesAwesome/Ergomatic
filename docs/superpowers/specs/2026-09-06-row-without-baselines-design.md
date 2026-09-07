# Phase RW — Row without a baseline

**Date:** 2026-09-06. Brainstormed with James the same day; every ruling
below is his unless marked as a controller assumption.
**Status:** spec approved in chat 2026-09-06. **PM open gate: PASS WITH
CONDITIONS (2026-09-06), all eight conditions folded below** (C1 the three
consumers that DO branch, C2 the door copy, C3 the caption's number, C4 the
three-PR cut, C5 the walk-skip evidence, C6 checkable exits, C7 the
migration index, C8 the "why now"). **Antagonist anchor pass RUN
2026-09-06 (5 blocking, 7 substantive, 6 held), all folded; the held
claims are §9, the phase's vetted ground. `/harden` lens 2 RUN
2026-09-06 (7 findings: a fourth log consumer, an undefined identifier in
§1.3, a stale 2:30 literal, two untested seams, `off` semantics, an exit
grep exception), all folded; the loop is closed. Gate 0 APPROVED
2026-09-07** on prototype `589c67b2` (`docs/design/rw-gate0/`); the
portrait Timer word renders at 40px (measured), landscape unchanged.
**ROADMAP:** the "Row without a baseline set" register item (James,
2026-08-23) becomes this phase; the section is added in the same commit as
this spec (recurring failure 17).

## What and why

A rower with no baseline cannot row a workout. Today the app derives every
work target from the rower's 2k and 6k splits, and when those are unset it
blocks Start, Connect and Log it after on every workout that carries a split
ref, and replaces Today's suggestion with the three-door baseline card. Only
the two designated onboarding workouts and the effort-only sprints are
rowable. A stranger who installs the build and does not want to think about
baselines yet is stuck at the door; that is the exact shape Wave A's exit
("a stranger rows a row") has to avoid.

This phase makes every workout rowable with no baseline set. Where a split
would appear, the rower reads a word from a four-rung ladder, **STEADY ·
MODERATE · HARD · ALL OUT**, derived from the step's own pace ref. The
word `EASY` is retired everywhere: James's ruling is that easy is what rest
is, never a work instruction. Durations still show, priced off a stated
assumed pace and marked with a tilde. The baseline card gains a skip, stored
so the choice survives a reinstall, and a one-line way back to the doors
stays on Today until a baseline exists. The doors themselves, the recommend
table and the post-test offer are unchanged.

## Decisions (James, 2026-09-06)

| Question | Decision |
|---|---|
| The word ladder | **Four words: STEADY · MODERATE · HARD · ALL OUT.** Never `EASY` for work. (Three-word and Concept2-WOD ladders were offered and declined.) |
| Where a word comes from | **From the step's own pace ref, by threshold**, not from the workout's type, so ladders and pyramids keep their shape. |
| Skip | **A stored, reversible preference.** A "Row without one for now" line on the doors card; skipping hides the card and Today's suggestion returns; a one-line "No baseline set · Set one up" row remains on Today. |
| Durations | **Time workouts price exactly. Distance steps price off an assumed pace and the figure is marked `~24′`.** ("Estimate for distance and signify it somehow"; "~24mins etc".) |
| During a row | **The clock is the number.** The Timer shows the word where the split would be and total elapsed time; the log records total elapsed as it already does. |
| Phase shape | Two PRs (ladder and surfaces; then the skip preference), notes, tag. No hardware walk, said aloud below. |

## 1. Domain

### 1.1 The ladder: `intensityWord(ref)`

A pure function in `app/domain/pace.ts`:

```ts
export type IntensityWord = "STEADY" | "MODERATE" | "HARD" | "ALL OUT";
export function intensityWord(ref: PaceRef): IntensityWord;
```

A split ref is first expressed in **2k-equivalent seconds**: `2k + off` is
`off`; `6k + off` is `off + K2_K6_OFFSET_SECONDS` (the existing derivation
constant, `domain/deriveBaseline.ts`, value 7). Then it is bucketed:

| 2k-equivalent offset | Word | Which shipped refs land here |
|---|---|---|
| ≤ −3 | ALL OUT | `2k−4`, `2k−3` (all of AN's split refs), and `{effort:"max"}` |
| −2 .. +4 | HARD | `2k−2` .. `2k+4` (TR's bulk), `6k−4`, `6k−3` |
| +5 .. +12 | MODERATE | `2k+5` .. `2k+8`, `6k−2` .. `6k+5` (AT's bulk) |
| ≥ +13 | STEADY | `6k+6` and slower (O2's bulk), and `{effort:"min"}` |

Evidence for the thresholds is the seeded library's own offset census
(counted 2026-09-06 against main `8986f81d` over `app/server/seed/library/*.ts`
with `grep -oE 'base: "(2k|6k)", off: -?[0-9]+' | sort | uniq -c`; the live gate is
the census test in §7, not this table):

| Type | Split-ref range | Bulk |
|---|---|---|
| AN | `2k−4` (43), `2k−3` (25); every other AN work step is `max` | all ALL OUT |
| TR | `2k−2` (5) .. `2k+8` (1); bulk `2k+0`..`2k+4` (179 of 218) | HARD |
| AT | `6k−4` (1) .. `6k+8` (2); bulk `6k−2`..`6k+4` (172 of 193) | MODERATE |
| O2 | `6k+4` (4) .. `6k+15` (1); bulk `6k+8`..`6k+12` (187 of 206) | STEADY |

**Known and accepted cost:** steps in the overlap read one rung off their
badge. TR's `2k+5..+8` (23 steps) read MODERATE; AT's `6k−4`/`6k−3`
(3 steps) read HARD and AT's `6k+6..+8` (11 steps) read STEADY; O2's
`6k+4` (4 steps) read MODERATE. James chose
per-ref words over per-type words on sight of this table because a type
word would print HARD four times over a TR pyramid and erase the build. The
thresholds are exported constants beside the function so the anchor pass
can attack the numbers, not the code.

**The cost re-aggregated at the unit a rower reads (anchor pass S1,
measured over the 300 seeded workouts with these thresholds; the script
rides PR B as the census test in §7):** 76 workouts have two or more
distinct refs that all collapse to one word (AN 7 of 7, TR 25 of 37, AT
21 of 33, O2 23 of 25), so a `2k+0 → 2k+4` build reads HARD on every
rung (the committed census, `domain/intensityCensus.test.ts`, pins 79
under its own definition, which also counts a workout whose `max`/`min`
steps share the word; the anchor's 76 came from a script that is not
committed, and the pinned figure is the one that guards drift); and 9 workouts read a word that contradicts their type badge on
EVERY step ("Roaring Forties", "Polar Blast", "Grec", "Beam Sea", "Canary
Current": TR at `2K+6`, all MODERATE; "Bora": AT at `6K−3`, all HARD;
"Warm Sector": AT, all STEADY; "Moderate Breeze", "Crepuscular Rays": O2,
all MODERATE). Zero order inversions, structurally (§9). **Ruling (James,
2026-09-06, on the controller's recommendation): the thresholds stand,
and a workout among the nine that looks wrong on the Gate 0 render is a
WORKOUT-authoring fix (its ref or its badge, in the seed), never a ladder
fix.** The ladder is the truth about pace: one scalar, one word, so
`2k+6` and `6k−1` (the same split) read the same word, and no base-aware
or type-aware bolt-on may break that. The alternative was measured and
rejected: widening HARD to `2k+6` fixes the five TR workouts and turns 45
AT steps at `6k−2`/`6k−1` HARD. The 76 collapses are inherent to a
four-word ladder; per-type would collapse all 300. Gate 0 still renders
"Bora" and "Roaring Forties" so the ruling is made on sight.

`paceWordLabel` (today: `"ALL OUT" | "EASY"`) becomes a call into the same
ladder and its return type becomes `IntensityWord`; `paceWordFromLabel`,
its inverse, maps `"STEADY"` back to `min` and keeps its bijection with the
two effort members (the other two words have no pace-word ref and are never
passed to it: its parameter type narrows to the two words that do).
`paceWordSpoken` returns `"at max effort" | "steady"`, and a sibling
`intensityWordSpoken(word)` gives the step row its spoken form over the
whole ladder ("steady", "moderate", "hard", "all out"), since the split
branch of `StepRow.tsx` composes `"${duration} at ${pace}"` and has no
word path today (anchor pass, bookkeeping). The bulk grammar's
tokens are unchanged: `min` and `easy` still parse to `{effort:"min"}`; the
stored step key is untouched; no seed edits (the two `min` steps, "Fog Bow"
and "Fata Morgana" in `o2.ts`, simply render STEADY).

### 1.2 Phases without baselines

`phases(steps, null)` stops throwing. A split-ref work step with null
baselines produces:

```ts
{ type: "work", targetKind: "effort", label: intensityWord(s.ref),
  ref: s.ref, spm: s.spm, set, originalStepIndex, /* no targetSplit */ }
```

The OBJECT is the shape an effort phase already has under null baselines
(Phase 6I) plus a `ref`, and `Phase.ref`'s own doc comment in `expand.ts`
states the invariant this breaks ("set ONLY for that case: an effort
phase's target is words, never a number to trace back to a ref"); that
comment is rewritten in the same commit to say a `ref` on an effort-kind
phase means "a split ref rendered as a word". That does not make every
consumer safe: the PM open
gate grepped the discriminant (`grep -rn targetKind app/src app/domain`)
and read every branch. Three consumers need a change and are in scope;
three were verified to need none.

**Need a branch (in scope, PR B):**

- **The log seed, `src/session/logDraft.ts`.** `buildLogSeed` tests
  `targetKind === "effort"` FIRST and composes the stored label through
  `paceWordFromLabel(phase.label as "ALL OUT" | "EASY")`, which returns
  `min` for any word but `ALL OUT`. A `2k+2` step under null baselines
  would be stored as `5:00 @ MIN`. Both that branch and the draft-absent
  fallback beside it test `phase.ref !== undefined` first and reconstruct
  through `refPaceLabel` with the ref; the effort branch becomes the
  `ref`-less remainder. The fallback's own comment ("the cast is safe:
  this branch only runs when `targetKind === "effort"`, and expand.ts
  sets `label` to exactly `paceWordLabel(ref.effort)` in that case, never
  any other string") is the RF18 tripwire this change steps over and is
  rewritten in the same commit. **The PREFERRED path is also wrong**
  (anchor pass B4): when a matched draft exists, the normal Timer case,
  the label is composed from `draftStep.ref`, the authored split ref, so
  the stored step would read `5:00 @ 2k +2`, a notation the rower never
  saw and cannot resolve. **Decision (James, 2026-09-06): the stored
  label for a split ref rowed with no baseline is the WORD form,
  `5:00 @ MODERATE`, at both doors**,
  because the log records what the rower was asked to do and that is
  what they read; the ref survives in the workout, not the row. Both
  `logDraft.ts` paths branch on "split ref and null baselines" before
  either existing branch. **The stored log shape is unchanged**: a
  `LogStep` is still `{label, no targetSplit}`; only which label is
  composed changes.
- **The manual door's log builder, `buildManualLogSteps` in the same
  file** (lens 2, F1). It labels every step through `refPaceLabel(…,
  step.ref)` unconditionally and then calls `resolveSplit(baselines!,
  step.ref)` for a split ref, under a comment saying the caller "has
  already confirmed `baselines` is non-null". Loosening the Log-it-after
  gates (§2.1) makes that comment false: the door would throw, or store
  `5:00 @ 2K +2`. It branches on "split ref and null baselines" before
  `resolveSplit` and composes the word form, the same decision as the
  other two paths; no `targetSplit`, no `actualSplit`. (The spec's
  earlier citation of a "bare `baselines === null` gate" in
  `LogSession.tsx` was stale: that site already uses the compound
  `needsBaselines` form; the KNOWN GAP it described is historical.)
- **`domain/display/stepDetail.ts`.** `pieceList(steps, baselines:
  Baselines)` takes concrete baselines and drives Today's suggestion card;
  `Today.tsx` carries two `baselines!` assertions on that path. It becomes
  `Baselines | null`, and a split-ref piece under null carries the word
  where `refTextFull` held the split. The assertions go. **The piece
  keeps its `off` (as the 2k-equivalent offset) under null**: `joinsRun`
  and `peakIndex` in the same file compare and rank on `off`, and nulling
  it (as the effort branch does today) rolled a six-rung `2k+3 → 2k−2`
  ladder from six rows to four and removed the pyramid-peak tint from
  every workout (anchor pass S1, measured on "Tehuantepecer", "Humboldt
  Current", "Antarctic Drift"). Rows and peak stay identical to the
  baseline view; only the split text becomes the word. **`off` is the
  RAW `ref.off`, exactly as the baseline branch stores it, never the
  2k-equivalent** (lens 2, F6): converting a 6k ref's offset by +7 would
  make `peakIndex` disagree between the null and baseline renders of the
  same workout, and on "Squall Line" (AT, `6k+2` sharpening to `6k−4`,
  offsets `[2, 0, −2, −4]`) it moves the peak from index 1 to index 3.
  The 2k-equivalent is what `intensityWord` computes internally for the
  word and nothing else.
- **The Builder, `src/builder/Builder.tsx` and `builderState.ts`.** The
  split slot returns `null` with no baselines and the duration estimate
  returns `null`. The slot shows the word; the estimate prices through §4.
  The Builder joins §2 and Gate 0 (§2.7).

**Verified to need none (PM open gate, 2026-09-06):**

- **The PM5 compiler** (`domain/monitor/program.ts`) checks `targetKind`
  first and never `targetSplit === undefined` (its H8 sites), so an
  effort-kind phase programs the interval with no pace target.
- **The Timer / Countdown** (`TimerTargets.tsx`) renders `phase.label`
  alone when there is no split to trace a ref for.
- **The judge** has no target and produces no verdict, as for effort
  phases.

The implementer re-runs the discriminant grep at plan time and accounts
for every hit by name; a hit not in this list is a plan finding, not a
silent fix.

`targetKind: "effort"` keeps its name (a rename is churn with no behaviour;
its meaning is now "the target is a word from the ladder", which is what
it always was for `max`/`min`). The doc comments at `program.ts:56-64`,
`expand.ts:38`, and `TimerTargets.tsx:10` that enumerate the label literals
are updated in the same commit.

`needsBaselines(steps)` survives with a new job: it is no longer a gate but
the predicate for "this workout has numbers waiting behind a baseline",
used by the detail caption (§2.1) and the duration marker (§4). Its header
comment, which names every gate site, is rewritten. The four throw sites
(`expand.ts` `phases()` and `estimateMinutes`, `pace.ts`
`estimationSplit`, `logDraft.ts` `buildLogSeed`; counted by
`grep -rn "must gate on needsBaselines"`) and their "callers must gate on
needsBaselines() first" comments are deleted.

### 1.3 The assumed pair

One exported constant beside the ladder:

```ts
export const ASSUMED_BASELINES: Baselines = MOST_COMMON_ESTIMATE;
// already exported by domain/estimateBaseline.ts; 2:25 / 2:32 on today's
// table (k2 145, k6 152)
```

The recommend table's MOST COMMON cell (`domain/estimateBaseline.ts`
already exports `mostCommonEstimate`, the You editor's own seed family),
not its slowest (James, 2026-09-06). The first draft borrowed the slowest
cell with that file's "conservative bias" argument; the anchor pass (S2)
showed the
argument points the other way here. The table is slow-biased because a
too-fast estimate writes TARGETS a rower cannot hold; a DURATION estimate
has no such asymmetry, and the slowest cell maximises the error for every
rower the table thinks is faster. The mode is the table's own best guess
and the tilde discloses the rest. It is used for exactly one thing:
pricing distance steps for a duration estimate when baselines are null
(§4). **It never resolves a target, never reaches the wire, never reaches
a log.** The anchor pass named the one leak path (§9 item 8) and PR A closes it with
an INVARIANT rather than the loop first written here: `estimateMinutes` may
build phases against `ASSUMED_BASELINES` inside its own body, but no `Phase`
carrying the assumed number is ever returned, stored, or passed on. The
gate is `src/assumedBaselinesCensus.test.ts`, which pins the constant's
importers to `domain/pace.ts`, `domain/expand.ts` and
`src/builder/builderState.ts`; a fourth importer fails the suite. (The
null-phases loop this sentence used to prescribe needs §1.2's
`phases(steps, null)`, which is PR B; PR A ships first.)

## 2. Surfaces

Every item here changes what a rower reads, so the phase carries a
**Gate 0**: rendered captures at real proportions, both orientations, beside
what they replace, with every new colour pairing's contrast ratio stated as
a number, approved by James before an implementation task starts. Copy
below is the proposal for that gate, not the approved text.

### 2.1 Workout detail (`src/workout/WorkoutDetail.tsx`, `StepRow.tsx`)

- Each work step's right slot shows the word where the split would be,
  in the slot pace-word steps already use (`Today.tsx:689` documents the
  shared slot). Spoken form: "5 minutes moderate".
- **The LEFT slot is a Gate 0 decision (anchor pass B5).** Today the
  step row's left label is composed unconditionally as
  `5:00 @ 2k +2` (`StepRow.tsx`), and the Library row's structure line
  (`stepDetail.ts` `structureLine`) is authored-notation, baseline-free
  by design: "Tehuantepecer" reads `2-2-2-2-2-2 @ 2K+3 → −2 · 2′ REST`
  on the Library with or without a baseline. So a no-baseline detail row
  would read `5:00 @ 2k +2 … MODERATE` and be announced "five minutes at
  two k plus two". **James chose (a), 2026-09-06 ("your recommendations
  are good"); Gate 0 captures it as chosen, with (b) beside it only as
  the road not taken.** (a) **keep the notation everywhere**: the notation is the
  workout's identity, identical for every rower, and the `baselines`
  article teaches it; the word is the target. One code path, Library and
  detail agree. (b) **drop `@ ref` from the detail left label while
  baselines are null**, leaving the Library structure line as is: cleaner
  for a stranger, but detail and Library then disagree about whether the
  notation exists, which is the disagreement B5 names. Cost of (b),
  measured: one branch in `StepRow.tsx` and its spoken form; no other
  file.
- Start, Connect and Log it after all enable. `startBlocked`, the Connect
  guard's `"Set your baselines first. Connect needs a target to program."`
  error, and the `no target · Set baselines` line are deleted.
- One quiet caption under the steps, rendered when `baselines === null &&
  needsBaselines(steps)`: **"Targets are words until you set a baseline.
  Set one up"** with the last three words a link to Today, where the card
  reopens (the link clears the flag on tap, §3.3). Effort-only
  workouts show nothing, as today.

### 2.2 Timer and Countdown

- The target line shows the word, no sub-line, the way `ALL OUT` renders
  today. The clock is the number.
- `Countdown.tsx`'s null-baselines redirect (`:30`, `:142`, `:348`) and its
  `buildRun` guard go. `LogSession.tsx:1902`'s block and `ManualDoorLog`'s
  bare `baselines === null` gate (the "KNOWN GAP" the detail screen's own
  comment records) go with them.

### 2.3 Connected panes (`src/workout/connected/`)

- The target cell shows the word; the PM5 is programmed with the interval
  and no pace target, exactly the effort path walked in Phase 7C.
- The live comparison has no target, so it shows the word and the reading
  and no faster/slower verdict. There is no word list to edit:
  `surfaceModel.ts`'s own comment says "the word is whatever the phase
  calls itself, not a vocabulary this file curates", and the surface
  reads `phase.label` through `targetSplitDisplay`. The comment's `Easy`
  is already dead (Phase WU deleted the warm-up phase that produced it)
  and is cleaned up in passing.
- `ConnectedInterstitial.tsx:162`'s comment ("can Connect with no
  baselines set at all") becomes the general case, not the effort-only
  exception.

### 2.4 Log

Steps record the word as `label`, no `targetSplit`. The row reads as an
effort-only row does today. From-the-log and the session summary need no
change; the anchor pass checks that no summary surface divides by a target
that is now absent.

### 2.5 Today (`src/today/Today.tsx`)

- While `baselines === null && !baselinesSkipped`: the doors card, as
  today, plus the new skip line (§3).
- While `baselines === null && baselinesSkipped`: the suggestion apparatus
  returns (header, filters, shuffle, card) with a one-line row above it:
  **"No baseline set · Set one up"** (a button that clears the flag, §3.3)
  and the durations caption (§4). The card's layout is unchanged: type,
  effort, `~24′`, steps; its step rows read words through the null-tolerant
  `pieceList` (§1.2), and that IS a change to the card and is in Gate 0.
  Two more bare `baselines === null` gates inside the apparatus go with
  it (anchor pass S3): the one that skips the daily type ROLL and the one
  that skips minting the drawn PICK. Both become `needsDoors`.

### 2.6 Library

Rows show `24′` or `~24′` (§4); the caption rides the header while
`baselines === null`. No other change.

### 2.7 Builder (`src/builder/`)

The split slot on a split-ref row shows the word when baselines are null
(today: blank). The duration estimate prices through §4 and reads `~`.
Nothing else on the Builder changes. In Gate 0.

### 2.8 Row to find (`src/onboarding/RowToFind.tsx`)

Unchanged, and its fixed duration copy (`ONBOARDING_DURATION_COPY`,
`ABOUT 25 MIN` / `ABOUT 8 MIN`) stays: it is a door, and §8 keeps the
doors out of scope. The assumed pricing would print the 6K Test at `~30′`
and the 2K at `~10′` wherever those workouts appear OUTSIDE the door
(Library, detail), so Gate 0 captures RowToFind beside the 6K Test's
detail screen and James sees the two figures side by side before either
is approved.

### 2.9 Copy retirements

Every `EASY` becomes `STEADY`; every spoken "easy" becomes "steady". The
anchor pass (S6) sorted the grep hits: the RENDER sites are
`domain/pace.ts` (`paceWordLabel`, which `StepRow.tsx` and `Builder.tsx`
call, so both follow automatically) and the one real test pin,
`src/workout/StepRow.test.tsx`; everything else the grep returns
(`expand.ts`, `program.ts`, `surfaceModel.ts`, `PaneLive.tsx`,
`TimerTargets.tsx`, `Countdown.tsx`, `Today.tsx`, `postTestOffer.ts`) is
a comment naming the old word and is corrected in passing. **No e2e
assertion pins `EASY`** (they pin `ALL OUT`, which survives), and PNG
captures cannot be grepped: `pnpm screenshots` regenerates them and Gate 0
and the close gate look at them. **One user-facing sentence this phase
makes false and must change:** `you/ResetBaselineSetup.tsx`'s confirm
line, "Workouts with pace targets lose them and can't be started until
you set a baseline again." Its replacement is Gate 0 copy. **Gate 0 also
notes the collision:** `HARD` was a DIFFICULTY word until Phase DE removed
that axis (the v0.39.0 note announces it) and now returns as an intensity
word meaning something else. **The exit grep's expected survivors**, run
at PR B's head and classified there rather than left to the close gate
(the PM final gate found the first version of this claim false):
`grep -rn "EASY\|Easy\b" app/src app/domain app/e2e` returns 67 hits, and
every one is in one of three classes, none of them a live pace word:
(a) the DIFFERENT AXIS — `builderState.ts`'s `EFFORT_WORDS` carries
`EASY BREATH`, the 1-to-5 whole-workout scale's first word, plus the
difficulty-era chip labels in `Today`/`CellGrid`/`TokenRow` tests;
(b) HISTORY — comments and fixture names recording the warm-up phase
Phase WU deleted (its label was `Easy`) and the v0.39.0 release note;
(c) the bulk grammar's `easy` token, which still parses to
`{effort:"min"}` on purpose (§1.1). A hit outside those three is a
defect; PR B fixed the four that were. The News article `baselines` gains
one sentence: words stand in for targets until a baseline exists, and
what the four words mean. No new article.

## 3. Skip

### 3.1 Stored shape (TRIAD)

A new column on `preferences`: `baselines_skipped boolean NOT NULL DEFAULT
false`, migration `0026`. The server's preferences route accepts and returns
`baselinesSkipped` (additive; the API contract between tags is unchanged for
existing clients, which ignore the field). `PreferencesData` gains it.

The dormant `startHereDismissed` column is **not** reused and not touched:
it records a different choice and its own comment already declines to
queue a drop. Reusing it would make one column mean two things.

### 3.2 Lifetime table (recurring failure 27)

| State | Minted | Cleared | Survives |
|---|---|---|---|
| `baselinesSkipped` | The rower taps "Row without one for now" on the doors card (client PATCH `true`) | (a) The rower taps "Set one up" on Today's return row (client PATCH `false`); (b) the server's `DELETE /api/baselines` handler (`data.ts:1010`, the You reset row) clears it | Reinstall, sign-out, relaunch, a full pair being set (it becomes irrelevant, not false), **and a PARTIAL pair** (see below) |

Invariant: **the doors card renders iff `baselines === null && !baselinesSkipped`.** Setting a baseline never touches the flag; it does not need to, because the card's condition is on the pair.

**The reset route's clear is two store calls, not a transaction** (anchor
pass S4: the handler is `stores.baselines.clear` then `res.json`, and
`preferences` is a separate store; every `db.transaction` in the codebase
lives inside one store). Order: clear the flag FIRST, then the baselines.
If the second call fails the rower has a false flag and intact baselines,
which renders as before the tap; if the first fails the route returns
the error and nothing changed. Neither order can strand a rower behind a
hidden card with no baselines.

**A partial pair is a durable state this phase creates.** Every screen
derives `baselines: Baselines | null` as non-null iff BOTH sides are set.
A skipped rower who rows the 2K Test and accepts the post-test offer
writes `k2` only; `baselines` stays `null`, the flag still decides
doors-vs-suggestion, durations still price off the assumed pair, and the
existing counterpart offer (derive the 6k from the 2k) is the way out. No
new mechanism; the row exists so nobody assumes "one baseline set" ends
the no-baseline state.

**Why the reset shows the card with no flash:** not because the DELETE
response carries the flag (it returns only the two splits); because
`usePreferences` refetches on every Today mount and Today renders nothing
until all its loaders are ready. The doors have no standalone route
(`shell/AppRoutes.tsx:232-234` declares only the three door screens), so
"Set one up" reopens the card in place by clearing the flag rather than
navigating.

### 3.3 Surfaces

- **Doors card:** a fourth, visually quieter line under the three doors,
  **"Row without one for now"**. Tapping it writes the flag; Today re-renders
  with the suggestion. It is a `button`, not a door (`Link`), because it
  writes; failure shows the card's existing error idiom and leaves the card.
- **Return path on Today:** the "No baseline set · Set one up" row (§2.5).
  "Set one up" is a button that clears the flag; the doors card returns in
  place (there is no standalone doors route, §3.2).
- **You › Baselines:** unchanged. The editor writes numbers; the reset row
  clears them and, now, the flag.
- **Post-test offer** (`PostTestPrompt.tsx`): unchanged and still fires for
  a skipped rower who rows a designated test, since that is the capture
  path the doors exist for.

## 4. Durations without a baseline

- `estimateMinutes(steps, null)` returns `{ minutes, estimated, assumed }`
  where `assumed` is true iff any distance work step was priced off
  `ASSUMED_BASELINES`. Time steps price exactly. The `null` return retires.
  `ONBOARDING_DURATION_COPY` stays on its door (§2.8).
- **What the assumed pair actually prices, per ref class** (the pricing
  goes through the existing `estimationSplit`, so it is NOT a flat split;
  figures for the mode cell 2:25 / 2:32): `2k+off` at 2:25+off; `6k+off`
  at 2:32+off; `max` at 2:25; `min` at k6+20 = **2:52**. A 500 m ALL OUT
  step reads `~2.4′` against a plausible real 1:50; the 2K Test prices at
  ~10′ and the 6K Test at ~29′ beside the door's fixed `ABOUT 8 MIN` /
  `ABOUT 25 MIN` (§2.8). Gate 0 shows James these figures on real rows (a
  500 m sprint, a 6k+10 steady piece, a `min` piece, both tests) before
  the caption is approved.
- Rendering: `24′` when `!assumed`, `~24′` when `assumed`, on Library rows,
  Today's card and the detail screen. The tilde marks "assumed pace" only;
  a distance workout priced from a real baseline stays `24′` as today
  (`estimated` is already true there and is not marked; this phase does not
  change that).
- The time filter runs against these numbers: `durationsUnknown` and the
  `estMinutes: 0` placeholder in `Today.tsx:244` and `domain/suggest.ts`
  retire, and so do the two other spellings of the same rule the anchor
  pass found (S3): `library/filters.ts`'s bare `baselines !== null` guard
  on the duration range, and `session/draft.ts`'s `draftMinutes`, which
  returned `null` for any workout with a work step and otherwise priced
  off a THIRD placeholder pair (`{k2Seconds: 0, k6Seconds: 0}`) and had
  no production caller: deleted in PR A (RF29), its nudge-pricing proof
  kept in `draft.test.ts` through `estimateMinutes(draftSteps(d), …)`.
- Caption, once per screen, not per row, on the Today row and the Library
  header while `baselines === null`. **The number is out of the caption**:
  "assume 2:30/500m" was true only for `2k+0` and `max` (PM open gate C3).
  Proposed: **"~ times are estimates until you set a baseline"**. Gate 0
  decides the wording with the per-step figures above on the table.

## 5. Gates, spoken

- **Not fast path.** `domain/` changes, and a split becomes a word.
- **Antagonist:** one anchor pass on this spec. Targets: the thresholds in
  §1.1 (is any shipped workout made incoherent), the assumed pair's reach
  (§1.3), the skip flag's lifetime table (§3.2), and whether any consumer
  of `targetSplit` assumed a split phase always carries one. PR 2 inherits
  unless its plan invents a mechanism the pass did not see; a skip is
  spoken either way.
- **PM:** open gate on this spec; final gate on each PR (PR 1 changes what
  a number means; PR 2 is a stored shape); close gate.
- **Gate 0:** captures of detail, Timer, one connected pane, Today (both
  states) and Library, both orientations, beside today's screens, contrast
  as numbers. Before any implementation task.
- **Hardware walk: none, said aloud; PM ACCEPTED at open (2026-09-06)
  on the compiler's discriminant** (`program.ts` checks `targetKind`
  first, never `targetSplit === undefined`, verified at the gate). The
  spec's earlier sentence "walked in Phase 7C and every walk since" was a
  hardware claim from memory: `docs/monitor/sessions/` was searched
  2026-09-06 for the onboarding titles (`6K Test`, `2K Test`) and for any
  all-effort multi-interval program, and **no committed capture names
  one**; the only committed null-target interval (`walk-2026-08-17`,
  step 3) is one of five in a mixed program. The skip stands on a
  STRUCTURAL argument instead (anchor pass, held): `CompiledPhase` in
  `program.ts` carries no `label` and no `ref`, so the compiler is blind
  by construction to everything this phase changes, and identical
  `type/seconds/meters/spm/targetKind` produce a byte-identical
  `ProgramInterval`. "PM5 accepts an all-effort multi-interval program"
  rides the NEXT walk's runsheet as an added observation, not a session
  of its own.
- **Gate 0 additions from the anchor pass:** `MODERATE` is one character
  wider than any word the Timer's card slot has rendered, that slot is a
  `1fr` grid track that expands rather than clips, and no e2e or design
  assertion measures it; the pass's arithmetic puts `MODERATE` beside a
  `Free` rate at ~369px on a 358px portrait container. **Measure it in
  both orientations at Gate 0 and put the number in this section.** Also
  captured: "Bora" and "Roaring Forties" (§1.1), the ResetBaselineSetup
  confirm line (§2.9), and the left-slot option pair (§2.1).
- **Gate 0 APPROVED 2026-09-07** as rendered; record in
  `docs/design/rw-gate0/README.md`.
- **Design reference:** `docs/design/` gets the approved Gate 0 captures.
  `DEVIATIONS.md` rows that describe the blocked-start states are
  reconciled (recurring failure 9).

## 6. PR shape (PM open gate C4: three slices, one tag)

1. **PR A: durations.** §1.3 and §4: `estimateMinutes` prices null
   baselines off `ASSUMED_BASELINES`, the `~` marker, `durationsUnknown`
   and the `estMinutes: 0` placeholder retire, the time filter runs on real
   numbers. Removes no gate; deployable alone. Outcome: a no-baseline
   rower's Library shows `~24′` and the duration filter works.
2. **PR B: the ladder and unblocking.** §1.1, §1.2 (including the three
   consumers that branch), §2 and its copy retirements, the article
   sentence, e2e and captures. PM final gate (a split becomes a word).
3. **PR C: the skip.** §3: migration, route, `PreferencesData`, the card
   line, the Today row, the reset-route clear. TRIAD.
4. **Notes PR and ONE tag at phase close** (PM ruling): PR B alone unblocks
   Start via Library while the doors card still owns Today for exactly the
   rower the phase serves, and its only tester-visible change would be
   `EASY` → `STEADY`. If PR C slips its gate, PR B may ship alone and the
   note says the doors card still owns Today.

**Migration index (C7):** `app/drizzle/` tops out at `0025`, and Phase DE
PR 3 (scheduled 2026-09-12) drops `preferences.difficulties` and will also
mint `0026` on the same table. Whichever of RW PR C and DE PR 3 merges
second regenerates its migration off the new main before its PR is marked
ready; a duplicate index is skipped silently and the API 500s on the
missing column.

## 7. Testing

- **Ladder:** every boundary pinned with independent literals, never the
  exported constants (RF21): `2k−3` → ALL OUT and `2k−2` → HARD; `2k+4` →
  HARD and `2k+5` → MODERATE; `6k+5` → MODERATE and `6k+6` → STEADY; `max`
  → ALL OUT; `min` → STEADY. Plus a census test over the seeded library
  asserting the overlap counts in §1.1 (23, 3, 4), so a seed change that
  moves them is seen.
- **Phases:** `phases(steps, null)` for a split-ref work step yields
  `targetKind: "effort"`, `label` the word, no `targetSplit`, `ref` kept;
  for every other step kind, identical to today.
- **Compiler:** `compileProgram(phases(splitWorkout, null))` programs no
  pace target. Mutation: make the null branch emit `targetKind: "split"`
  with `targetSplit: 0`; the test must fail on the wire target.
- **Seam test (RF24):** one client test starting from a fresh account with
  null baselines, through the skip tap, Start, the Timer showing the word,
  and a saved log whose step label is the word. Starts before the producer,
  asserts after the reader.
- **Durations:** `estimateMinutes` with null baselines on a time-only
  workout returns `assumed: false` and the exact minutes; it rounds to
  whole minutes, so the pins use 6000 m steps where the mode and the
  slowest cell round apart: `max` 29 (6000/500 × 145 s = 1740 s) vs 30 at
  the slowest cell; `min` 34 (172 s/500 m) vs 35. The Builder's `totals`
  keeps the unrounded 9.67 for a 2000 m `2k+0` row. Literals, never the
  constant; mutation: the slowest cell for the mode and all three change.
- **Log seed (C1, B4):** a `2k+2` step under null baselines seeds a
  `LogStep` labelled `5:00 @ MODERATE` at BOTH doors (matched draft and
  fallback), never `MIN` and never `2k +2`. Mutations: restore the
  `targetKind`-first ordering (fails on the literal `MIN`); restore the
  `draftStep.ref` path (fails on the literal `2k`). A `min` step still
  seeds its chip word.
- **Manual door (F1):** `buildManualLogSteps` on a `2k+2` step with null
  baselines returns `5:00 @ MODERATE`, no `targetSplit`, no
  `actualSplit`, no throw; the e2e no-baseline walk adds a "Log it after"
  leg beside the Timer leg.
- **Rows and peak (S1, F6):** `pieceList("Tehuantepecer", null)` yields
  the same row count and `peakIndex` as with baselines (all 2k-based, so
  raw and 2k-equivalent agree); AND `pieceList("Squall Line", null)`
  yields `peakIndex` 1, the same as with baselines; mutation: convert
  `off` to 2k-equivalent in the null branch and the second must fail with
  3.
- **Reset seam (F4):** a client test starting from a skipped, null-
  baseline account, through the reset row's DELETE, to a re-mounted Today
  showing the doors card and not the suggestion.
- **Library row (F5):** a render test asserting a null-baseline distance
  workout's row shows `~` and a time workout's does not; Library joins
  the `pnpm screenshots` set for this phase.
- **Census, all four plus the workout level:** the test pins 23 / 3 / 11
  / 4 AND the 76 collapsed and 9 badge-contradicting workouts by title,
  so a seed edit that moves a word is seen.
- **The leak (§1.3, as shipped in PR A):** `src/assumedBaselinesCensus.test.ts`
  pins the constant's importers to `domain/expand.ts` and
  `src/builder/builderState.ts` across `domain/`, `src/` and `server/`
  (import statements, non-test files) and its definition to
  `domain/pace.ts`; mutation: add the import to `domain/display/stepDetail.ts`
  and the census names it. PR B adds the second half: `phases(steps, null)`
  carries no `targetSplit` on any phase.
- **`pieceList(steps, null)`** carries the word for a split-ref piece;
  Today's card renders it with no assertion.
- **Builder:** a split-ref row with null baselines shows the word in the
  split slot and a `~` estimate.
- **Skip:** the route round-trips the flag; `DELETE /api/baselines` clears
  it (integration test, mutation: drop the clear and assert the flag
  survives); the card's render condition on both flags.
- **e2e:** the no-baseline walk on web (fresh account → skip → distance
  workout → Timer word → log), design assertions on the new row and
  caption (44px targets, contrast), `EASY` absent from every pinned
  capture, `pnpm screenshots` for detail and Today.

## 8. Out of scope

- Renaming `targetKind: "effort"`.
- Marking baseline-derived distance estimates (`estimated: true`) with any
  symbol.
- Dropping `startHereDismissed`.
- The Row-to-find door and its fixed duration copy (§2.8).
- Any change to the doors, the recommend table, or the post-test offer.
- Auto-capturing a baseline from a logged row (register item, its own
  trigger).

## 9. Vetted ground (anchor pass, 2026-09-06: attacked and held)

Later specs and plans in this phase may lean on these without re-proving
them; a plan that contradicts one is a plan finding.

1. **The ladder cannot invert a build.** Zero order inversions across all
   300 seeded workouts, and structurally: the word is a monotone step
   function of one scalar, so a strictly harder ref never reads a strictly
   easier word.
2. **The census arithmetic and the `+7` conversion.** All four overlap
   counts reproduce; the sign was checked against `deriveK6FromK2` (k2 +
   7), not the constant's name; the seed grep is complete (775 of 775
   refs single-line).
3. **The compiler programs no pace target for an effort-kind phase.**
   `program.ts` sets the wire target null on `targetKind === "effort" ||
   targetSplit === undefined`, discriminant first.
4. **No walk is needed, structurally.** `CompiledPhase` has no `label`
   and no `ref` field; the compiler cannot see what this phase changes.
5. **Timer and connected pane render the word with no sub-line and no
   verdict.** `targetSplitDisplay` returns `{main: label, sub: null}` on
   effort kind first; `paceJudgeTarget` is null off a non-split phase.
6. **Summary surfaces abstain rather than divide by an absent target.**
   Five guarded sites (`summaryModel`, `storedSummary` ×2,
   `PostWorkoutSummary.singleTargetHint`, `LogSession.lockedBaseline`),
   including a `targetSplit!` made unreachable by a `targetKind !==
   "split"` `continue`.
7. **A partial pair cannot produce a NaN target.** Every derivation site
   requires both sides before building a `Baselines`.
8. **`ASSUMED_BASELINES` reaches no target, wire or log** PROVIDED no
   `Phase` built against it ever leaves `estimateMinutes` (which builds
   them internally and returns numbers only, PR A) and nothing else
   imports it; §1.3 states the invariant and the census test in §7 gates
   the importers.
