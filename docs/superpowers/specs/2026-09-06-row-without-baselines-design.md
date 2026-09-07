# Phase RW — Row without a baseline

**Date:** 2026-09-06. Brainstormed with James the same day; every ruling
below is his unless marked as a controller assumption.
**Status:** spec approved in chat; antagonist anchor pass and PM open gate
owed on this document before any implementation task starts.
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

`paceWordLabel` (today: `"ALL OUT" | "EASY"`) becomes a call into the same
ladder and its return type becomes `IntensityWord`; `paceWordFromLabel`,
its inverse, maps `"STEADY"` back to `min` and keeps its bijection with the
two effort members (the other two words have no pace-word ref and are never
passed to it: its parameter type narrows to the two words that do).
`paceWordSpoken` returns `"at max effort" | "steady"`. The bulk grammar's
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

That is byte-for-byte the shape an effort phase already has under null
baselines (Phase 6I), so every consumer that handles it today handles the
new case with no branch of its own:

- **The PM5 compiler** (`domain/monitor/program.ts`, the H8 path) programs
  the interval with no pace target when `targetKind === "effort"`; it
  checks `targetKind` first and never `targetSplit === undefined`.
- **The Timer / Countdown** (`TimerTargets.tsx`) renders `phase.label` alone
  with no sub-line when there is no split to trace a ref for.
- **The log seed** (`logDraft.ts`) writes `LogStep.label` with no
  `targetSplit`, the effort-step path. **No stored log shape changes**: a
  row logged this way is indistinguishable in storage from an effort-only
  row today.
- **The judge** has no target and produces no verdict, as for effort phases.

`targetKind: "effort"` keeps its name (a rename is churn with no behaviour;
its meaning is now "the target is a word from the ladder", which is what
it always was for `max`/`min`). The doc comments at `program.ts:56-64`,
`expand.ts:38`, and `TimerTargets.tsx:10` that enumerate the label literals
are updated in the same commit.

`needsBaselines(steps)` survives with a new job: it is no longer a gate but
the predicate for "this workout has numbers waiting behind a baseline",
used by the detail caption (§2.1) and the duration marker (§4). Its header
comment, which names every gate site, is rewritten. The three throw sites
(`expand.ts` `phases()` and `estimateMinutes`, `pace.ts`
`estimationSplit`, `logDraft.ts` `buildLogSeed`) and their "callers must
gate on needsBaselines() first" comments are deleted.

### 1.3 The assumed pair

One exported constant beside the ladder:

```ts
export const ASSUMED_BASELINES: Baselines = { k2Seconds: 150, k6Seconds: 157 };
```

2:30 for the 2k is the recommend table's slowest cell
(`domain/estimateBaseline.ts`, the stated conservative bias: a too-slow
estimate is the safe error); 2:37 is that plus `K2_K6_OFFSET_SECONDS`. It
is used for exactly one thing: pricing distance steps for a duration
estimate when baselines are null (§4). **It never resolves a target,
never reaches the wire, never reaches a log.** The anchor pass should try
to find a path by which it does.

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
  and no faster/slower verdict. `surfaceModel.ts:1114-1124`'s curated word
  list gains the two new words and loses `Easy`.
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
  and the durations caption (§4). The card itself is unchanged: type, effort, `~24′`, steps.

### 2.6 Library

Rows show `24′` or `~24′` (§4); the caption rides the header while
`baselines === null`. No other change.

### 2.7 Copy retirements

Every `EASY` becomes `STEADY`; every spoken "easy" becomes "steady". Sites
found by `grep -rn "EASY\|Easy\b" app/src app/domain` on 2026-09-06 and
listed for the implementer: `domain/pace.ts`, `domain/expand.ts:38`,
`domain/monitor/program.ts:61,293,469`, `src/workout/StepRow.tsx:79-83`,
`src/workout/connected/surfaceModel.ts:177,642,1114-1124,1389`,
`src/workout/connected/PaneLive.tsx:133`, `src/session/TimerTargets.tsx:10,59`,
`src/session/Countdown.tsx:417`, `src/today/Today.tsx:689`, plus the e2e
specs and captures that pin the old word. The News article `baselines`
gains one sentence: words stand in for targets until a baseline exists, and
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
| `baselinesSkipped` | The rower taps "Row without one for now" on the doors card (client PATCH `true`) | (a) The rower taps "Set one up" on Today's return row (client PATCH `false`); (b) the server's `DELETE /api/baselines` handler (`data.ts:1010`, the You reset row) sets it to `false` in the same transaction | Reinstall, sign-out, relaunch, a baseline being set (it becomes irrelevant, not false) |

Invariant: **the doors card renders iff `baselines === null && !baselinesSkipped`.** Setting a baseline never touches the flag; it does not need to, because the card's condition is on the pair. Resetting baselines clears it server-side so a rower who resets sees the full card again without a second request and without a window where the client shows the card before the flag lands. The doors have no standalone route (`shell/AppRoutes.tsx:232-234` declares only the three door screens), so "Set one up" reopens the card in place by clearing the flag rather than navigating.

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
  `ASSUMED_BASELINES`. Time steps price exactly. The `null` return and
  `ONBOARDING_DURATION_COPY`'s fixed-copy fallback retire.
- Rendering: `24′` when `!assumed`, `~24′` when `assumed`, on Library rows,
  Today's card and the detail screen. The tilde marks "assumed pace" only;
  a distance workout priced from a real baseline stays `24′` as today
  (`estimated` is already true there and is not marked; this phase does not
  change that).
- The time filter runs against these numbers: `durationsUnknown` and the
  `estMinutes: 0` placeholder in `Today.tsx:244` and `domain/suggest.ts`
  retire.
- Caption, once per screen, not per row: **"Times marked ~ assume
  2:30/500m"** on the Today row and the Library header while
  `baselines === null`.

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
- **Hardware walk: none, said aloud.** A word phase's wire shape is the
  effort phase's, walked in Phase 7C and every walk since with the
  designated onboarding workouts. The PM may disagree at open.
- **Design reference:** `docs/design/` gets the approved Gate 0 captures.
  `DEVIATIONS.md` rows that describe the blocked-start states are
  reconciled (recurring failure 9).

## 6. PR shape

1. **PR 1: words and unblocking.** §1, §2, §4, copy retirements, article
   sentence, e2e and captures. No stored shape.
2. **PR 2: skip.** §3: migration, route, `PreferencesData`, the card line,
   the Today row, the reset-route clear. TRIAD.
3. **Notes PR** and the tag; PR 1 alone is tester-visible and could ship
   first if PR 2 waits on its gate.

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
  workout returns `assumed: false` and the exact minutes; on a distance
  workout returns `assumed: true` and the minutes at 2:30/500m; mutation:
  price at `k2Seconds` instead of the assumed pair and the literal minutes
  must change.
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
- Any change to the doors, the recommend table, or the post-test offer.
- Auto-capturing a baseline from a logged row (register item, its own
  trigger).
