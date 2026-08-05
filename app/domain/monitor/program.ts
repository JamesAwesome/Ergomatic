// The workout -> PM5 program compiler: the intermediate representation
// (`WorkoutProgram`/`ProgramInterval`) plus `compileProgram`, which turns the
// phone timer's own phase list into that IR or a typed, screen-ready
// `CompileError`.
//
// domain/monitor/** imports nothing from src/. The phone timer's real phase
// type, `EnginePhase`, lives in `app/src/session/engine.ts` — src, not
// domain — so this module cannot import it directly (the import-direction
// rule the whole phase is built on). Instead it declares `CompiledPhase`:
// the STRUCTURAL subset of `EnginePhase` this compiler's contract needs
// (`originalIndex` is carried for contract completeness — see its own field
// comment — even though `compileProgram`'s body never reads it). Every
// field below exists on `EnginePhase` with the same type, so an
// `EnginePhase[]` is assignable to `CompiledPhase[]` with no adapter or
// cast — callers in src/ (Task 3+) pass `EnginePhase[]` straight through.
//
// The compatibility contract is enforced at compile time by TWO checks in
// `app/src/monitor/enginePhase.compileCompat.test.ts` (the client project,
// since it needs both src/session/engine.ts's `EnginePhase` and this
// file's `CompiledPhase`), because they catch different drift classes: the
// assignment check (`EnginePhase[]` into a `CompiledPhase[]`-typed binding)
// catches a TYPE change on a field both sides already agree exists, but is
// blind to a field being dropped entirely — every field below except
// `type`/`originalIndex` is optional on `CompiledPhase`, so `EnginePhase`
// entirely missing an optional field (e.g. `targetKind`, the H8
// discriminant) would STILL satisfy the assignment. The second check (a
// `keyof EnginePhase` membership assertion) catches exactly that: it fails
// to typecheck the moment a field this compiler's contract names is no
// longer a key of `EnginePhase` at all, regardless of optionality.
export interface CompiledPhase {
  /** Mirrors `Phase["type"]` (`domain/expand.ts`). "warmup" and "test" carry
   *  no target/spm — see the field comments below for how each type's
   *  absent fields are handled. */
  type: "warmup" | "work" | "rest" | "test";
  /** Time-based duration in seconds — warmup, rest, and a time-duration
   *  work phase. Undefined for a distance-duration work phase and for a
   *  "test" (open-ended, no fixed duration at all — see `compileProgram`'s
   *  own comment on that branch). */
  seconds?: number;
  /** Distance-based duration in meters — a distance-duration work phase
   *  only. */
  meters?: number;
  /** The phase's resolved split target, seconds per 500m — set on every
   *  "split" work phase AND on every "effort" work phase (an "effort" phase
   *  resolves to a real number too, `domain/pace.ts`'s `estimationSplit` —
   *  it is NOT left undefined). `targetKind` is what tells them apart; see
   *  its own comment. */
  targetSplit?: number;
  /** Discriminates a work phase's target: "split" is a real, user-chosen
   *  pace; "effort" is a display estimate for "ALL OUT"/"EASY" — the
   *  compiler must not program the estimate as a hard target (see
   *  `compileProgram`). Undefined for warmup/rest/test. */
  targetKind?: "split" | "effort";
  /** Display-only stroke rate. See `ProgramInterval.displaySpm`'s own
   *  comment for why this never reaches the wire. */
  spm?: number;
  /** The ORIGINAL DRAFT STEP index this phase was expanded from — mirrors
   *  `EnginePhase.originalIndex` (`src/session/engine.ts`) exactly, NOT a
   *  position in the `phases` array passed to `compileProgram`. A reps
   *  block's every repeated phase carries the SAME `originalIndex` (they
   *  came from one authored step); a work step's auto-inserted rest phase
   *  shares its work phase's `originalIndex` too (see `EnginePhase`'s own
   *  header comment) — Tidal Bore's five identical 1'-work-phases-plus-rest
   *  in `domain/monitor/program.test.ts` all trace back to originalIndex 2.
   *  `compileProgram` itself never reads this field — it exists purely to
   *  keep `CompiledPhase` a complete structural match for `EnginePhase`
   *  (see the module header comment and the field-existence check in
   *  `app/src/monitor/enginePhase.compileCompat.test.ts`), for a future
   *  caller (a driver or screen) that needs to correlate a compiled
   *  interval back to the authored step it came from. */
  originalIndex: number;
}

export interface ProgramInterval {
  kind: "time" | "distance";
  /** Seconds (kind "time") or meters (kind "distance"). Always the
   *  post-rounding, PM-representable value — see `compileProgram`'s
   *  rounding-rule comments; never a raw, unrounded phase value. */
  value: number;
  /** Frozen at confirm; null = no hard target (an effort phase, or a
   *  warmup/test interval with nothing to aim for). See `compileProgram`'s
   *  `targetKind` handling — this is null for BOTH "no ref at all" (warmup)
   *  AND "targetKind === effort" (a real number the phone estimated for
   *  display, not a pace to program), which is exactly the H8 fix: reading
   *  `targetSplit === undefined` on the input would miss the second case,
   *  since an effort phase's `targetSplit` is a real number.
   */
  targetSplit: number | null;
  /** DISPLAY-ONLY: no wire consumer exists (no per-interval rate command in
   *  CSAFE Communication Definition rev 0.27 — see
   *  `docs/superpowers/specs/2026-08-05-phase-7a-monitor-domain-design.md`
   *  §1 and the adversarial review's H5). The PM5 has no
   *  `CSAFE_PM_SET_TARGETSPM`-style command; the only "Target Stroke Rate"
   *  byte in the whole spec belongs to the GAMES config
   *  (`CSAFE_PM_SET_GAMEPARAMS`), not workout programming. Named
   *  `displaySpm`, not `spm`, so nobody wires this to a wire that isn't
   *  there — a rate-alternation workout (Terral, Steam Fog) looks identical
   *  to the ERG once compiled; the phone's own panes carry the rate story
   *  instead. */
  displaySpm: number | null;
  /** Seconds of rest AFTER this interval, before the next one (or before
   *  WORKOUTEND if this is the last). 0 = none. Folded from one or more
   *  consecutive `type: "rest"` input phases — see `compileProgram`'s
   *  rest-folding comment. */
  restSeconds: number;
}

export interface WorkoutProgram {
  intervals: ProgramInterval[];
}

/** Every branch is a distinct, PM5-specific reason a workout cannot be
 *  programmed as a variable-interval workout, each with a copy-ready
 *  `message` a screen can show verbatim (per the design spec's own
 *  requirement — these are not internal-only strings). */
export type CompileError = {
  code:
    // A rest phase with no preceding work/warmup/test interval to attach
    // to — the PM has no standalone-rest slot (its rest is always a
    // property of the interval before it).
    | "leading-rest"
    // A work/warmup/test interval's duration is below the PM's documented
    // minimum (interface-notes.md §8): :20 for time, 100 m for distance.
    | "interval-too-short"
    // An interval's folded (possibly summed) rest exceeds the PM's
    // documented maximum, 9:55 / 595 s (interface-notes.md §8).
    | "rest-too-long"
    // More than 50 intervals (interface-notes.md §8, PM5's limit; 30 on
    // PM3/PM4 — not this app's concern, only the PM5 is targeted).
    | "too-many-intervals"
    // Zero work/warmup/test intervals survived — nothing to program.
    | "no-work"
    // A phase's value cannot be represented in the PM's wire units after
    // rounding (see `compileProgram`'s per-unit rounding-rule comments), or
    // has no representable value at all (an open-ended "test" phase — see
    // the same comment). Never silently clamped or truncated to the
    // nearest legal value; always this error instead.
    | "unrepresentable-value";
  message: string;
  /** Position in the `phases` ARRAY passed to `compileProgram` — the loop
   *  counter, NOT `CompiledPhase.originalIndex`. The two diverge whenever
   *  more than one phase shares an `originalIndex` (a reps block's
   *  repeated occurrences; a work step's auto-inserted rest phase shares
   *  its work phase's `originalIndex` too — see `CompiledPhase.
   *  originalIndex`'s own comment): the array position of the SPECIFIC
   *  phase that triggered the error is what a screen needs to highlight,
   *  and that is unambiguous only as a position in `phases`, never as
   *  `originalIndex`. `compileProgram` never reads `originalIndex` at all;
   *  every `phaseIndex` below is the loop variable `i`. `null` for a
   *  workout-level violation with no single offending phase ("no-work" has
   *  none by definition; "too-many-intervals" is reported at the phase
   *  that pushed the count over the limit when one exists). */
  phaseIndex: number | null;
};

/** Table 19 "PM5 Workout Configuration Parameter Limits" (CSAFE
 *  Communication Definition rev 0.27, p.49) — see
 *  `docs/monitor/pm5-interface-notes.md` §8. Minimum time-based interval
 *  duration, in seconds. */
const MIN_TIME_SECONDS = 20;
/** Table 19 — minimum distance-based interval duration, in meters. */
const MIN_DISTANCE_METERS = 100;
/** Table 19 — maximum rest duration accepted by `CSAFE_PM_SET_RESTDURATION`,
 *  in seconds. NOT 600 (10:00) — the obvious-looking round number is wrong
 *  by five seconds; the documented max is 9:55, confirmed directly against
 *  the primary CSAFE doc (Table 19, p.49 — interface-notes.md §8). */
const MAX_REST_SECONDS = 9 * 60 + 55;
/** Table 19 — maximum intervals in one PM5 variable-interval workout (30 on
 *  PM3/PM4, not this app's concern). */
const MAX_INTERVALS = 50;

/** Tolerance for "is this raw value already a whole second" — matches
 *  `domain/validate.ts`'s own `wholeSecond` admission check EXACTLY,
 *  including its strict `<` (not `<=`): `wholeSecond` rejects a value
 *  exactly `1e-6` away from an integer, so this must too, or a value
 *  `validate.ts` would refuse to save could still compile here. Exists for
 *  the identical reason `wholeSecond` does: `minutes * 60` does not always
 *  land on an exact integer in floating point (e.g.
 *  `31/60*60 === 31.000000000000004`) even though the authored value IS a
 *  whole second. This is a floating-point-noise tolerance, not a document
 *  fact — the underlying wire fact (the PM's duration fields are
 *  whole-second integers) is Table 19 (interface-notes.md §8). A raw value
 *  `WHOLE_SECOND_EPSILON` or further from an integer is a genuinely
 *  fractional second, not noise, and is rejected as `unrepresentable-value`
 *  rather than rounded away. */
const WHOLE_SECOND_EPSILON = 1e-6;

/** Rounds `raw` seconds to the nearest whole second IF it is strictly
 *  within `WHOLE_SECOND_EPSILON` of one (floating-point noise only, per the
 *  constant's own comment on matching `wholeSecond`'s strict `<`); returns
 *  `null` otherwise so the caller can raise `unrepresentable-value` instead
 *  of silently clamping a genuinely fractional value. This is the ONLY
 *  rounding this module performs — distance values are checked with
 *  `Number.isInteger` directly (see `compileProgram`), never rounded,
 *  because `domain/types.ts`'s `WorkDuration` already requires distance
 *  meters to be an authored integer; a non-integer there would mean a
 *  caller bypassed that contract, not that this compiler should paper over
 *  it. */
function representableSeconds(raw: number): number | null {
  const rounded = Math.round(raw);
  return Math.abs(raw - rounded) < WHOLE_SECOND_EPSILON ? rounded : null;
}

/**
 * Compiles the phone timer's own phase list into a `WorkoutProgram` the PM5
 * can be programmed with, or a typed `CompileError` naming exactly why it
 * can't.
 *
 * **Rest folding** (design spec §1, adversarial review H7): the PM's
 * variable-interval command gives each interval exactly one rest slot
 * (rest AFTER that interval, before the next). This function has no
 * standalone rest concept in its OUTPUT — every `type: "rest"` input phase
 * either attaches to the interval already emitted immediately before it
 * (summed into that interval's `restSeconds`, so two or more consecutive
 * rest phases merge into one number), or, if no interval has been emitted
 * yet, is rejected as `leading-rest`. This is why `restSeconds` lives on
 * `ProgramInterval` rather than existing as its own interval kind. No
 * special case exists for whether the interval this folds onto is the
 * workout's LAST one — a `[work, rest]` input compiles to one interval
 * whose `restSeconds` is nonzero with nothing after it, and
 * `pm5/commands.ts` programs that interval's `SET_RESTDURATION` exactly
 * like any other, immediately followed by the trailing `SET_SCREENSTATE`.
 * This shape is untested against any CSAFE-doc worked example (every one of
 * them ends on a work interval) despite being common (161 of the 300 seeded
 * library workouts compile this way) — flagged for the laptop session,
 * `docs/monitor/pm5-interface-notes.md` §15 #9/§17 item 10.
 *
 * **Effort vs. split targets** (H8): a "split" work phase's `targetSplit`
 * is a real, user-chosen pace and is programmed as-is. An "effort" work
 * phase's `targetSplit` is ALSO a real number on the input (an ESTIMATE,
 * `domain/pace.ts`'s `estimationSplit`, used for the phone's own display
 * only) — programming that estimate as a hard target would turn every
 * "ALL OUT"/"EASY" step into a fabricated pace target. The discriminant is
 * `targetKind === "effort"`, never `targetSplit === undefined` (the effort
 * phase's `targetSplit` is defined); this function always checks
 * `targetKind` first.
 *
 * **The "test" (open-ended all-out) phase** (verified against
 * `domain/expand.ts`'s `phases()`, case `"test"`, against the design spec's
 * assumption): the spec describes this as compiling to "a single fixed
 * interval", but `phases()` actually emits `{ type: "test", label: "All
 * out", ... }` with NEITHER `seconds` NOR `meters` — a genuinely
 * open-ended phase (the rower rows until they choose to stop; there is
 * nothing to fix a duration or distance to). The PM's variable-interval
 * command requires every interval to declare a duration TYPE and VALUE
 * (interface-notes.md §7's `CSAFE_PM_SET_WORKOUTDURATION`/
 * `CSAFE_PM_SET_SPLITDURATION`); an open-ended interval has no such value
 * to give it. This function therefore treats ANY non-rest phase with
 * neither `seconds` nor `meters` set — which today can only be a "test"
 * phase, since warmup/work always set one — as `unrepresentable-value`,
 * discovered generically from the phase's shape rather than special-cased
 * on `type === "test"`. The seeded 300 contain zero "test" steps (survey
 * confirmed), so this branch is exercised only by a synthetic fixture.
 *
 * **Rounding, never clamping**: every value this function writes into a
 * `ProgramInterval` (`value`, `restSeconds`) has passed either
 * `representableSeconds` (time: whole-second tolerance for float noise,
 * see its own comment) or `Number.isInteger` (distance: meters are already
 * an authored integer). A value that fails either check produces
 * `unrepresentable-value` — it is never rounded to the nearest legal value,
 * floored, or otherwise silently altered.
 *
 * **Check ordering and first-error-wins**: this function returns at most
 * ONE `CompileError` per call — the first phase (left to right) that
 * violates any rule, never an accumulated list of every problem in a
 * workout. Within a single non-rest phase, `unrepresentable-value` and
 * `interval-too-short` are both evaluated BEFORE `too-many-intervals`
 * (the length/representability of phase `i` is checked before `i` is
 * counted toward the 50-interval cap) — a phase that is both too short AND
 * would be the 51st interval reports `interval-too-short`, never
 * `too-many-intervals`. Within a rest phase, `leading-rest` is checked
 * before the rest's own value is even parsed (nothing to round or bound
 * when there is no interval to attach it to), then representability, then
 * the new negative-rest guard, then `rest-too-long` — see the branch's own
 * comments for why each precedes the next. `targetSplit`'s own
 * representability check (M-9) is a DELIBERATE exception to "length/
 * representability before the cap": it runs AFTER `too-many-intervals`,
 * since an unrepresentable pace is a property of an interval whose own
 * length and count are already known to be fine, not a shape question that
 * should preempt the count check.
 */
export function compileProgram(
  phases: CompiledPhase[],
): WorkoutProgram | CompileError {
  const intervals: ProgramInterval[] = [];

  for (let i = 0; i < phases.length; i += 1) {
    const phase = phases[i]!;

    if (phase.type === "rest") {
      if (intervals.length === 0) {
        return {
          code: "leading-rest",
          message:
            "This workout starts with rest before any work — the PM5 has no way to program a rest before the first interval.",
          phaseIndex: i,
        };
      }
      if (phase.seconds === undefined) {
        return {
          code: "unrepresentable-value",
          message: "A rest phase has no duration to program.",
          phaseIndex: i,
        };
      }
      const restSeconds = representableSeconds(phase.seconds);
      if (restSeconds === null) {
        return {
          code: "unrepresentable-value",
          message: `A rest of ${phase.seconds}s isn't a whole second — the PM5 can't program it.`,
          phaseIndex: i,
        };
      }
      // Table 19's rest minimum is :00 (interface-notes.md §8) — there is
      // no negative rest on the wire. Unreachable from `validate.ts`-checked
      // data today, but `CompiledPhase` is a public shape any caller can
      // construct, and Task 3 encodes `restSeconds` straight onto the wire
      // — this rejects rather than silently flooring to 0, matching this
      // module's own "never clamp" rule for every other value it checks.
      if (restSeconds < 0) {
        return {
          code: "unrepresentable-value",
          message: `A rest of ${restSeconds}s is negative — the PM5's minimum rest is :00.`,
          phaseIndex: i,
        };
      }
      const previous = intervals[intervals.length - 1]!;
      const combinedRestSeconds = previous.restSeconds + restSeconds;
      if (combinedRestSeconds > MAX_REST_SECONDS) {
        return {
          code: "rest-too-long",
          message: `A rest of ${combinedRestSeconds}s exceeds the PM5's maximum rest of 9:55.`,
          phaseIndex: i,
        };
      }
      previous.restSeconds = combinedRestSeconds;
      continue;
    }

    let kind: "time" | "distance";
    let rawValue: number;
    if (phase.seconds !== undefined) {
      kind = "time";
      rawValue = phase.seconds;
    } else if (phase.meters !== undefined) {
      kind = "distance";
      rawValue = phase.meters;
    } else {
      // No fixed duration or distance at all — today, only a "test" phase
      // (see this function's own doc comment). Nothing to round or clamp:
      // there is no value here in the first place.
      return {
        code: "unrepresentable-value",
        message:
          "An open-ended (all-out/test) interval has no fixed time or distance — the PM5 requires one to program a workout.",
        phaseIndex: i,
      };
    }

    let value: number;
    if (kind === "time") {
      const rounded = representableSeconds(rawValue);
      if (rounded === null) {
        return {
          code: "unrepresentable-value",
          message: `An interval of ${rawValue}s isn't a whole second — the PM5 can't program it.`,
          phaseIndex: i,
        };
      }
      value = rounded;
    } else {
      if (!Number.isInteger(rawValue)) {
        return {
          code: "unrepresentable-value",
          message: `An interval of ${rawValue}m isn't a whole meter — the PM5 can't program it.`,
          phaseIndex: i,
        };
      }
      value = rawValue;
    }

    const minimum = kind === "time" ? MIN_TIME_SECONDS : MIN_DISTANCE_METERS;
    if (value < minimum) {
      return {
        code: "interval-too-short",
        message:
          kind === "time"
            ? `An interval of ${value}s is shorter than the PM5's minimum of :20.`
            : `An interval of ${value}m is shorter than the PM5's minimum of 100 m.`,
        phaseIndex: i,
      };
    }

    if (intervals.length >= MAX_INTERVALS) {
      return {
        code: "too-many-intervals",
        message: `This workout has more than ${MAX_INTERVALS} intervals — the PM5 supports at most ${MAX_INTERVALS}.`,
        phaseIndex: i,
      };
    }

    // H8: the discriminant is targetKind, never targetSplit === undefined
    // — an "effort" phase's targetSplit IS a real number (a display
    // estimate), and programming it as a hard target would turn every
    // "ALL OUT"/"EASY" step into a fabricated pace.
    //
    // M-9 (final-review, whole-branch): a "split" phase's targetSplit gets
    // the SAME whole-second representability contract `value`/`restSeconds`
    // already get (`representableSeconds`) — deliberately checked here,
    // AFTER interval-too-short/too-many-intervals (an unrepresentable pace
    // is a secondary property of an interval whose own length/count is
    // already known to be fine, not a disqualifying shape question the
    // check-ordering comment above governs), but still before this phase is
    // ever pushed. Without this, `commands.ts`'s `SET_TARGETPACETIME`
    // encoder (`paceSeconds * TARGET_PACE_SCALE`, fed straight into `be32`)
    // would receive a non-integer and either throw its own defensive
    // `Pm5EncodeError` or, before that guard existed, silently TRUNCATE via
    // `>>>` — either way breaking the "never silently truncate" rule every
    // other field in this module already holds. Reachable in practice:
    // `domain/pace.ts`'s `resolveSplit` (a baseline + an arbitrary
    // `2k+1.5`-style offset + a session-only preview nudge, none of them
    // integer-constrained on input) can produce a genuinely fractional
    // split, unlike duration/rest, which only ever carry whole seconds by
    // construction upstream.
    let targetSplit: number | null;
    if (phase.targetKind === "effort" || phase.targetSplit === undefined) {
      targetSplit = null;
    } else {
      const roundedSplit = representableSeconds(phase.targetSplit);
      if (roundedSplit === null) {
        return {
          code: "unrepresentable-value",
          message: `A target pace of ${phase.targetSplit}s/500m isn't a whole second — the PM5 can't program it.`,
          phaseIndex: i,
        };
      }
      targetSplit = roundedSplit;
    }
    const displaySpm = phase.spm ?? null;

    intervals.push({ kind, value, targetSplit, displaySpm, restSeconds: 0 });
  }

  if (intervals.length === 0) {
    return {
      code: "no-work",
      message: "This workout has no work intervals to program.",
      phaseIndex: null,
    };
  }

  return { intervals };
}
