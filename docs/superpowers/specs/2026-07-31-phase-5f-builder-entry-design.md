# Phase 5F — Builder entry: time formats, blank steps, warm-up placement

**Date:** 2026-07-31
**Status:** Approved
**Source:** device-use feedback collected at the close of Phase 5E.

## Problem

Four separate reports, one theme — the builder's entry affordances don't match
what a thumb on a phone can actually do.

1. **A user could not enter 30 seconds.** The DUR field asks for minutes, the
   only sub-minute value the domain permits is `0.5`, and nothing on screen says
   half-steps exist. Worse, the field opens a **number pad**
   (`inputMode="decimal"`, `DurationInput.tsx:83`), so a user who guesses `0:30`
   cannot type the `:`.
2. **The warm-up line sits at the bottom.** A user tried to add a warm-up, then
   found `+ 10′ warm-up from your preferences` down by the totals, and read the
   placement as "this happens last".
3. **`+ ADD STEP` produces a copy of the previous step.** Deliberate
   (`addStepLike`, `builderState.ts:249`, citing the design doc), but it makes
   ADD STEP and DUPLICATE do nearly the same thing, and a user who wanted a
   fresh step got a filled-in one.
4. **SPM and REST can only be stepped, not typed.** Phase 5D/5E replaced the
   typable fields with `Stepper`. Reaching rest `3:00` or SPM `27` from empty is
   several taps, and with the typable field gone, 5E shipped an SPM that could
   never return to FREE.

## Non-goals

**MAX/MIN effort references are Phase 5G, not this phase.** They change
`PaceRef` in the domain and ripple through `resolveSplit`, validation, the bulk
grammar, the detail screen, the TARGET strip and the seeded library. Keeping
them out means 5F is client-side plus one widening of a validation predicate,
and the four fixes above don't wait on a domain redesign.

Also out: the pace offset stepper gaining a typable value (revisit after 5G
settles what a pace reference is), and any change to distance entry beyond what
the shared field forces.

## Decisions

| Question | Decision |
|---|---|
| Duration granularity | **Any whole second.** `0:45`, `0:20`, `0:10` all valid. |
| Stepper increment | `:30` — where a stepper exists (REST). Typing overrides. |
| DUR ± buttons | **No.** DUR stays typing-only; SPM and REST keep their steppers. |
| MAX/MIN | Deferred to 5G. |
| New step contents | **Blank** — DUR/SPM/REST empty, PACE `6K +0`, unit MIN. |
| First step of an empty workout | Keeps its `5 MIN / 6k / 22 spm / 1:00` head start. |

## Design

### 1. Domain — durations widen from half-steps to whole seconds

`app/domain/validate.ts` enforces `halfStep(n, lo, hi)` (`Number.isInteger(n * 2)`)
for `w` time durations, `wu`/`r` minutes, and `restMinutes`. Replace it with a
whole-second predicate:

```ts
const wholeSecond = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === "number" &&
  n >= lo &&
  n <= hi &&
  Math.abs(n * 60 - Math.round(n * 60)) < 1e-6;
```

The epsilon is load-bearing: 20 seconds is `1/3` of a minute, which is not exact
in binary — `0.3333333333333333 * 60 === 19.999999999999996`. A bare
`Number.isInteger(n * 60)` would reject two thirds of the values this phase
exists to allow.

Bounds, expressed in the new granularity:

| Field | Before | After |
|---|---|---|
| `w` `{kind:"time"}` minutes | `0.5..180`, half-steps | `1/60..180` (`0:01`–`180:00`), whole seconds |
| `wu` / `r` minutes | `0.5..180`, half-steps | `1/60..180`, whole seconds |
| `restMinutes` | `0.5..60`, half-steps | `1/60..60` (`0:01`–`60:00`), whole seconds |
| `w` `{kind:"distance"}` meters | int `100..42195` | unchanged |
| `spm` | int `10..60`, optional | unchanged |

**Storage stays minutes.** This is a pure widening — every workout that
validates today still validates, no migration, no release sequencing. Storing
seconds instead would change the shape of every stored step for no gain.

`app/src/builder/builderState.ts` mirrors these bounds locally (by design — its
errors are keyed by form row, not step index). Its `isHalfStep` becomes the same
whole-second predicate, and a test asserts the mirror agrees with
`validateSteps` on a shared table of values, including the boundaries.

### 2. Domain — one duration grammar, shared

`domain/bulk.ts`'s `parseDuration` and `builderState.ts`'s `parseDurationInput`
are byte-identical regexes kept in lockstep **by hand**, with comments in both
files saying so. This phase adds a fourth form to that grammar, which is the
moment to stop hand-copying it.

Extract to `app/domain/duration.ts`:

```ts
export function parseDurationToken(token: string): WorkDuration | null;
export function fmtDuration(minutes: number): string;   // 0.75 -> "0:45", 180 -> "180:00"
export function parseClock(text: string): number | null; // "1:30" -> 1.5 minutes
```

`parseDurationToken` accepts, in order: `m:ss` (**new** — `0:45`, `1:30`,
`20:00`), a bare decimal (minutes, unchanged), `N'` (minutes, unchanged), `Nm`
(meters, unchanged). `bulk.ts` and `builderState.ts` both import it; neither
keeps a private copy. A bulk block reading `0:45 6k+2` and a row typed as `0:45`
now provably mean the same thing.

`fmtDuration` renders total seconds as `m:ss` with zero-padded seconds and no
hour rollover (`180:00`, not `3:00:00`) — erg workouts are minutes.

### 3. `ClockInput` — the masked time field

New component, `app/src/builder/ClockInput.tsx`. `inputMode="numeric"` (a
digit-only pad is the constraint, not a preference), and the field supplies the
separator itself. Digits fill right-to-left:

| Typed | Shows |
|---|---|
| `3` | `0:03` |
| `30` | `0:30` |
| `130` | `1:30` |
| `2000` | `20:00` |
| `18000` | `180:00` |

Backspace shifts back out the same way. Empty is a legal state (REST uses it for
"no rest"; DUR shows the save-time "duration required" error already wired
through `fieldError("dur")`).

Digits beyond five are ignored. Seconds above `59` are reachable transiently
(`170` reads as `1:70`) and **normalise on blur** by total seconds — `1:70` →
`130s` → `2:10`. Normalising beats rejecting: a rejected keystroke on a phone
reads as a broken field.

Canonical form in `BuilderRow`: when `durUnit === "min"`, `durValue` holds the
formatted `m:ss` string; when `durUnit === "m"` it stays the plain integer meter
string it is today. `rest` likewise becomes an `m:ss` string. `fromWorkout`
writes both through `fmtDuration`, `toSteps` reads them through `parseClock` —
so the round trip is one pair of functions, tested as a pair.

This retires `restSecondsFromRow`/`withRestSeconds`'s minute-string bridge
(`builderState.ts:141-175`); the stepper's `:30` arithmetic now happens in
seconds against a field that is already seconds.

### 4. Typable SPM and REST

`Stepper`'s value cell stops being a `<span>` and becomes an input. The
component stays dumb — it takes a rendered value and now also an `onValueChange`
— and each caller keeps its own rules, exactly as the component's contract
already says.

- **REST** wraps `ClockInput`; `−`/`+` still move by `:30`, snapping as they do
  today. Empty means no rest.
- **SPM** wraps a two-digit numeric input. `−`/`+` still wake at 20 and floor at
  10. **Clearing the field is how a step returns to FREE** — the affordance 5E
  removed.

The `role="group"` / `${label} down` / `${label} up` naming and the
`invalid`/`errorId`/`registerRef` wiring stay as they are; the input inherits
the group's error association rather than growing a second one.

### 5. Warm-up above the steps

`builder-warmup-line` (`Builder.tsx:465`) moves above the STEPS list. Same copy,
same non-interactive plain-text treatment, rendered only when preferences have
loaded (the existing `preferencesState.state === "ready"` guard stays — a
fabricated warm-up figure is worse than none).

It reads as an implicit step 0, which is what actually happens at session start.

### 6. `+ ADD STEP` comes up blank

`addStepLike` becomes `addBlankStep`: `kind: "w"`, `durValue: ""`,
`durUnit: "min"`, `refBase: "6k"`, `refOff: 0`, `spm: ""`, `rest: ""`. The
empty-form branch keeps its `5 MIN / 6k / 22 spm / 1:00` defaults. The new row
still opens expanded, as it does today. DUPLICATE is unchanged and becomes the
only control that copies.

`docs/design/builder-redesign/README.md` describes the copy behaviour, and
`docs/design/DEVIATIONS.md` has a row about ADD STEP — **both get reconciled in
the same commit**, per the standing rule that DEVIATIONS documents current state.

### 7. Rendering whole-second durations everywhere

`app/src/workout/StepRow.tsx` prints `{step.minutes}′` raw (lines 41, 52, 71,
78), so a 45-second step would read **`0.75′`** on the detail screen. Every
step-level duration render switches to `fmtDuration`:

- `StepRow.tsx` — `wu`, `r`, work duration, and the `rest` sub-part
- `builderState.ts`'s `stepSummary` (collapsed accordion card, line 208)
- The builder's TARGET/summary lines that echo a duration

Workout **totals** stay in minutes and round for display — `3 × 0:45` must not
render as `2.25 MIN`. That covers the builder's `TOTAL … MIN`, the library row's
`${durationMinutes}′` (`WorkoutRow.tsx:23`), and the duration filter buckets,
which keep bucketing on the unrounded number.

## Testing

Per `docs/TESTING.md`; the items below are the ones this phase's shape demands.

**Domain (heaviest coverage, `app/domain/**` is pinned at 100%)**
- Round trip: for a table spanning `0:01`, `0:20`, `0:45`, `1:00`, `1:30`,
  `59:59`, `180:00`, `fmtDuration(parseClock(x)) === x`.
- The epsilon case explicitly: `parseClock("0:20")` must validate, and a test
  that fails against a naive `Number.isInteger(n * 60)` implementation.
- Boundaries: `0:00` and `180:01` rejected; rest `60:01` rejected.
- Grammar parity: one table asserting `parseDurationToken` handles the bulk
  forms and the builder forms identically — this replaces the hand-kept lockstep
  comment with an executable claim.
- Existing half-step values (`0.5`, `1`, `20`) still validate — the widening
  must not move the floor under stored data.

**Client**
- `ClockInput`: digit fill, backspace, >5 digits ignored, `1:70` normalising to
  `2:10` on blur, empty state, and that `inputMode` is `numeric` (the whole
  point).
- `Stepper`: typing into the value, clearing SPM to FREE, `±` still working
  after a typed value, and the error wiring still announcing.
- `addBlankStep` returns empty fields; the empty-form branch still returns the
  defaults; DUPLICATE still copies.
- Warm-up line precedes the step list in DOM order.
- **Per-file coverage checked for `ClockInput.tsx` and `duration.ts`** — the
  90×4 gate is repo-wide and will not notice an uncovered branch in a new file.

**e2e / design / screenshots**
- Fixture contains a **`0:45` step** and a stored warm-up row. A fixture of
  whole minutes passes no matter how badly the mask works.
- `design.spec.ts`: tap targets and a11y over the builder with the new inputs,
  plus a structural assertion that the warm-up line precedes the steps list.
- `pnpm e2e` and `pnpm screenshots` both run; `docs/screenshots/builder.png`
  refreshed and opened.

## Risks

- **Float epsilon.** Stated as an exact predicate above; the naive version is
  called out in the tests so a later refactor can't quietly reintroduce it.
- **`durValue`'s meaning changes** for `durUnit === "min"` (plain minutes →
  `m:ss`). Every reader — `rowDurationNumber`, `rowMinutes`, `stepSummary`,
  `toSteps`, `fromWorkout` and their tests — must move together. An edit round
  trip on a stored 45-second workout is the test that proves it.
- **`Stepper` is used by four callers** (PACE offset, SPM, REST, REPEAT). Adding
  an input to the value cell must not disturb REPEAT's fixed-width variant or
  PACE's bespoke offset stepper.

## Exit criteria

- A 45-second work step can be typed on a phone with a number pad, saved, seen
  on the detail screen as `0:45`, reopened for edit, and re-saved unchanged.
- SPM can be cleared back to FREE by typing; rest can be typed as `3:00`.
- The warm-up line renders above the step list.
- `+ ADD STEP` yields an empty step; DUPLICATE still copies.
- `pnpm lint`, `typecheck`, `test` (with per-file coverage checked), `e2e` and
  `screenshots` all green; `ROADMAP.md`, the builder-redesign design doc and
  `DEVIATIONS.md` reconciled.
