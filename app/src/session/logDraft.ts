import { fmtDuration } from "../../domain/duration.js";
import { liveSteps } from "../../domain/expand.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import {
  effortFromWord,
  isEffortRef,
  refLabel,
  resolveSplit,
} from "../../domain/pace.js";
import type { Baselines, PaceRef, SplitRef, Step } from "../../domain/types.js";
import type { EnginePhase } from "./engine";
import type { SessionDraft } from "./draft";
import type { SessionRun } from "./run";
import type { MonitorRun } from "../monitor/monitorRun.js";

/** The two "log a session" doors (Phase 6C spec, "Doors" decision): a
 *  completed timer session (`buildLogSteps`, from the frozen `SessionRun`)
 *  and an off-app row logged after the fact from a workout's own authored
 *  steps (`buildManualLogSteps`, resolved fresh at CURRENT baselines — "that
 *  IS the lock moment for an off-app row," per the spec). Both are pure:
 *  no clock reads, no storage access, same input in -> same output out.
 *
 *  PINNED READING — work steps only, PLUS a bare-label entry for a test
 *  step (spec's own Design section: "walks `run.phases`: work phases ->
 *  {...}"; `docs/design/README.md` §7: "listing each work step"). Warm-up
 *  and rest phases never become a `LogStep` — §7 never mentions either, and
 *  neither carries anything a rower would recognize as a step of their own
 *  workout. An open-ended "test" phase (`type: "test"`, e.g. a 2k/6k test
 *  piece) is DIFFERENT (whole-branch review, IMP-1 — this module's own
 *  header used to say it was skipped identically to wu/rest, on the theory
 *  that §7 never mentions one and a "test" `Phase`, `domain/expand.ts`'s
 *  `case "test"`, carries no `targetSplit`/`seconds`/`meters` to build a
 *  fuller `LogStep` out of): a workout can be AUTHORED with a test step as
 *  its ONLY qualifying step (nothing stops one — `validate.ts` never
 *  requires at least one `"w"` step), and skipping it left that workout
 *  producing `steps: []`, a hard 400 at POST time
 *  (`server/routes/data.ts`'s own "steps must be a non-empty array" rule)
 *  with no recovery on the session door but its destructive Discard. A
 *  test-only session still deserves a log — the honest fix is a `LogStep`
 *  carrying ONLY its `label`, every numeric field absent (nothing to hold a
 *  target or actual against, unlike a work step): `validateLogStepEntry`
 *  requires just `label`, so this shape posts cleanly with no server
 *  change needed. The label itself prefers the ORIGINAL authored text
 *  (`domain/bulk.ts`'s test-step parser: `test 2k test` -> `label: "2k
 *  test"`) over the phase's own frozen "All out" (`domain/expand.ts`'s
 *  `case "test"` always overwrites the label with that generic word, since
 *  that's what §6's live-timer target slot needs to show, not what a log
 *  entry should call the step) whenever a matching draft can recover it —
 *  the same "prefer the real draft, fall back to the frozen phase" idiom
 *  the work-step branch below already uses for its own label.
 *
 *  LABEL IDIOM (Task 1 F1 -> F1b review): a step's LABEL is its identity and
 *  must match every other step-text surface — the chip idiom (`refLabel`'s
 *  "MAX"/"MIN"/"6k +16"), not a target-display word or a resolved split
 *  value. F1's first pass fixed only the EFFORT case (`effortFromWord`,
 *  below) because it assumed `EnginePhase`'s missing raw `PaceRef` was
 *  unrecoverable for a split-ref phase — James's F1b correction: it IS
 *  recoverable, because the `SessionDraft` a run was built from is still on
 *  disk at log time (6B's own protections keep the pair together until a
 *  successful save clears both) and every `EnginePhase.originalIndex` is a
 *  position in that draft's ORIGINAL `steps` array (`engine.ts`'s own doc on
 *  `originalIndex`; `draft.ts`'s `effectiveSteps` never mutates `d.steps`
 *  itself — removals/nudges/spmOverrides only change what a DERIVED view
 *  shows, so plain indexing by `originalIndex` always finds the untouched
 *  authored step, unaffected by a removed sibling or an applied nudge/spm
 *  override). So `buildLogSteps` now takes an optional `draft:
 *  SessionDraft | null` and, when present, looks up
 *  `draft.steps[phase.originalIndex]` for each work phase and composes its
 *  label from that REAL `ref` via the shared `refPaceLabel` helper below —
 *  the exact same function `buildManualLogSteps` uses — so the two doors
 *  literally cannot diverge on a shared workout's label, split-ref or
 *  effort alike. Pinned by a both-doors equality test (`Mixed Kinds`, a
 *  synthetic draft combining split + effort + distance steps from three
 *  real library workouts — no single library entry carries all three) in
 *  the test file, plus a removed-step fixture proving the lookup survives a
 *  mid-workout removal.
 *
 *  NUDGE FOLD (F2, whole-branch review, Task 2 fix round): the draft's raw
 *  ref's own `off` is NOT what the label uses verbatim when a confirm-time
 *  nudge was applied — `withEffectiveOff` folds `draft.nudges[originalIndex]`
 *  into it first, so the label always names the prescription this step was
 *  ACTUALLY rowed against (matching `phase.targetSplit`'s own nudge-inclusive
 *  math), never the pre-nudge authored value alone. The manual door never
 *  has nudges (no draft, no confirm step for an off-app row), so this is
 *  inert there by construction, not a special case.
 *
 *  FALLBACK (draft `null`, or a mismatched/stale draft whose
 *  `originalIndex` doesn't resolve to a real `"w"` step): 6B's own
 *  protections mean this shouldn't happen for a real session — the draft
 *  and run records are cleared together, only ever by a successful save —
 *  but a defensive path costs little against a half-cleared storage state
 *  and must not crash logging. Falls back to composing from the phase's own
 *  frozen fields: for an EFFORT phase, `domain/pace.ts`'s `effortFromWord`
 *  (F1's original fix, still load-bearing here) inverts `effortWord`'s
 *  frozen "ALL OUT"/"EASY" back to the chip ("MAX"/"MIN") — bijective over
 *  the two-element `Effort` type, so this is a lookup, not a guess. For a
 *  SPLIT-ref phase (ui-fix round Task 2 fix round, F1b amendment):
 *  `EnginePhase` now carries the same EFFECTIVE `ref` `targetSplit` was
 *  resolved from (`domain/expand.ts`'s own `case "w"`, added the same round
 *  the display-side band was retired), so the fallback reconstructs the
 *  chip through the SAME `refPaceLabel` helper the preferred path uses —
 *  byte-identical output for a split-ref phase, not a second format
 *  (pinned by a dedicated equality test in the test file). The one
 *  remaining degradation is a LEGACY `v:1` `SessionRun` persisted before
 *  that field existed at all — `ref` genuinely absent (`isSessionRun`'s own
 *  loose load-time validation admits it, same as any other additive field
 *  a stored record predates) — where there is nothing to reconstruct from:
 *  the fallback keeps that phase's own frozen `label` VERBATIM, whatever
 *  string it happened to be frozen with (a pre-this-round record still
 *  carries its old "lo–hi" tolerance-band text). This is the one remaining
 *  case a fallback-path label can differ from the manual door's, and only
 *  for a run old enough to predate the `ref` field.
 *
 *  SERVER CONTRACT (Task 1.5 amendment, 2026-08-02 — supersedes what this
 *  paragraph used to say): `server/stores/logs.ts`'s `LogStep` and
 *  `server/routes/data.ts`'s `validateLogStepEntry` were amended the same
 *  day this module shipped, specifically because this module proved the old
 *  validation predated effort refs. `targetSplit` is now OPTIONAL there too
 *  (previously required unconditionally), and `actualSplit`/`actualSource`
 *  are now a PAIRED unit — both present or both absent, enforced by the
 *  route, never one without the other. This module's own `LogStep` below
 *  was ALREADY shaped this way (the 5G rule, implemented here before the
 *  server caught up) — the two are now the same shape, not two different
 *  ones needing a bridge at POST time. An effort work step's `LogStep` from
 *  either builder here posts to `/api/logs` cleanly. */

export type ActualSource = "assumed" | "stopwatch" | "pm5";

/** This module's own `LogStep` — now the SAME shape as `server/stores/
 *  logs.ts`'s `LogStep` (Task 1.5 amendment, module header): `targetSplit`
 *  optional, `actualSplit`/`actualSource` a paired unit, both omitted
 *  together for an effort phase with no MEASURED actual to report (5G
 *  rule) — Phase 6I amended this: an effort DISTANCE phase's genuine
 *  stopwatch reading (`actualSource: "stopwatch"`) still carries the
 *  pair, with `targetSplit` the only field that stays omitted (there was
 *  never a target to compare it against). `validateLogStepEntry` already
 *  accepts a paired actual with no `targetSplit` (the 6C amendment).
 *  **PM5 PAIRING EXCEPTION (7C spec §3, adversarial B3):** that pairing is
 *  loosened for a monitor-sourced step only — `buildMonitorLogSteps`
 *  (below) can set `actualSource: "pm5"` with `actualSplit` absent (an
 *  unusable `avgSplit` reading), because the three fields below are still
 *  real measurements even when the split itself wasn't. The phone-timer/
 *  manual builders above never produce this shape; only the monitor door
 *  does. */
export interface LogStep {
  label: string;
  targetSplit?: number;
  actualSplit?: number;
  actualSource?: ActualSource;
  /** THE AUTHORED TARGET stroke rate, on ALL doors (Phase LT spec 1, §2 —
   *  the overload fix). Copied verbatim: from the phase's own `spm` on the
   *  timer door (`buildLogSteps`, below) and the step's own `spm` on the
   *  manual door (`buildManualLogSteps`, below); from `ProgramInterval.
   *  displaySpm` on the monitor door (`buildMonitorLogSteps`, below) — but
   *  on the monitor door ONLY when either (a) the interval is UNMATCHED
   *  (no actual at all), or (b) a matched actual's `avgSpm` is in-band, so
   *  `actualSpm` below is ALSO being written this same call — AMENDED at
   *  Task 1 review: a matched actual whose measurement is dropped writes
   *  neither field, never the target alone masquerading as a reading that
   *  didn't happen (`buildMonitorLogSteps`'s own doc comment carries the
   *  full rationale).
   *
   *  BEFORE THE SPLIT, this field ALSO held the monitor door's MEASURED
   *  average (`actual.avgSpm`, written unconditionally, with no target ever
   *  copied) — that meaning now lives in `actualSpm` below. A row saved
   *  before this split predates that field entirely: `actualSource ===
   *  "pm5" && actualSpm === undefined` means THIS field is the old
   *  measured value, not a target — see `spmIsMeasured` (exported below)
   *  for the one shared discriminant a renderer must use rather than
   *  re-deriving this rule. */
  spm?: number;
  meters?: number;
  seconds?: number;
  /** The interval's measured average heart rate, pm5-only (7C spec §3),
   *  verbatim from `IntervalActual.avgHeartRateBpm`. PM5 PAIRING EXCEPTION
   *  (interface header above): present whenever the interval has a matched
   *  actual, independent of whether `actualSplit`/`actualSource` themselves
   *  are present. Omitted only when the reading itself is `null` OR falls
   *  outside `MONITOR_HR_MIN`..`MONITOR_HR_MAX` (20-254 bpm) — an
   *  out-of-band monitor number drops its own field, it never rejects the
   *  rower's log (adversarial m2). Stored, never rendered on the Log screen
   *  (spec's own "HR stored not shown" product ruling). */
  avgHr?: number;
  /** The interval's measured elapsed time, pm5-only, verbatim from
   *  `IntervalActual.elapsedSeconds` (>= 0) — same PM5 PAIRING EXCEPTION as
   *  `avgHr` above: present whenever a matched actual exists, regardless of
   *  `actualSplit`. **UNIT CAVEAT — SETTLED (RC-5 hero-truth, 2026-08-25,
   *  `pm5-interface-notes.md` §26):** this maps from 0x0037's Split/
   *  Interval Time under `pm5-interface-notes.md` §10's documented scale.
   *  The exit-7 capture's own last boundary (seq 53) decodes
   *  `splitIntervalTimeSeconds` 56.1s in the SAME frame as a separate
   *  `intervalRestTimeSeconds` field reading 60s — if the first field
   *  fused in trailing rest it would read 116.1, not 56.1, and the PM5's
   *  own screen shows 56.1 as that interval's split. WORK time alone,
   *  confirmed by wire evidence, not merely the documented default. */
  actualSeconds?: number;
  /** The interval's measured distance, pm5-only, verbatim from
   *  `IntervalActual.distanceMeters` (>= 0, whole meters) — same PM5
   *  PAIRING EXCEPTION as `actualSeconds` above. */
  actualMeters?: number;
  /** THE MEASURED average stroke rate, monitor door only (Phase LT spec 1,
   *  §2 — the overload fix, new/additive): written ONLY by
   *  `buildMonitorLogSteps`, verbatim from `IntervalActual.avgSpm`,
   *  banded `MONITOR_SPM_MIN..MONITOR_SPM_MAX` — same drop-the-field
   *  treatment as `avgHr`/`actualSplit` above (an out-of-band reading, or
   *  an exact 0 now that the floor is 1 — `MONITOR_SPM_MIN`'s own comment
   *  — omits this field rather than rejecting the save). Present whenever
   *  a matched actual's `avgSpm` is in-band, independent of `actualSplit`
   *  — the one departure from the `avgHr`/`actualSeconds` PM5 PAIRING
   *  EXCEPTION being that `spm` above rides ALONGSIDE this field rather
   *  than being unconditional (AMENDED at Task 1 review — see `spm`'s own
   *  doc comment and `buildMonitorLogSteps`'s). A row saved BEFORE this
   *  split exists with `actualSource === "pm5"` and NO `actualSpm` at
   *  all — its measured value lives in `spm` instead (see that field's
   *  own doc comment, and `spmIsMeasured` below). */
  actualSpm?: number;
  /** Door spec (2026-09-02) §5.1: OUR reading of the interval that was
   *  still in flight when a connected session closed short — the last
   *  rowing frame's own 0x0031 distance, never an `IntervalActual`.
   *  Written ONLY by `buildMonitorLogSteps` below, only on a step with NO
   *  `actualSource`, and only from `MonitorRun.partial`. NEW KEY NAMES on
   *  purpose (§5.1): a partial carried in `actualMeters` would reach an
   *  older server as the number without its marker and enter every sum
   *  forever. Never summed, never paced (§5.2 I-B5). */
  partialMeters?: number;
  /** The same reading's ELAPSED time, not rowing time — the PM5 has no
   *  paused state and its clock runs whether or not the rower pulls
   *  (`domain/monitor/types.ts`). Paired with `partialMeters` above:
   *  `buildMonitorLogSteps` writes both or neither. */
  partialSeconds?: number;
}

/** THE ROW-LOCAL DISCRIMINANT for a pre-split monitor row (Phase LT spec 1,
 *  §2, exit criterion 3): `spm`'s own doc comment above explains the
 *  overload this field used to carry. A row saved before this split has
 *  `actualSource === "pm5"` and NO `actualSpm` at all (that field did not
 *  exist yet) — for exactly that shape, `spm` holds the OLD measured
 *  value, not a target, and a renderer must show it as measured with no
 *  target half. `"pm5"` is written unconditionally beside the only
 *  measured-spm write (`buildMonitorLogSteps` below) and by no other
 *  builder — this is an exact, row-local fact, never an age heuristic, and
 *  never rewrites a stored row.
 *
 *  SOUND BY CONSTRUCTION (AMENDED at Task 1 review — the original cost of
 *  this task's own review): new code can no longer reproduce the
 *  pre-split shape at all — `buildMonitorLogSteps` now writes `spm` on a
 *  matched actual ONLY alongside `actualSpm`, so `actualSource === "pm5"
 *  && actualSpm === undefined` is true ONLY for a genuinely old row, never
 *  a new dropped-measurement one. Before the amendment, a matched actual
 *  whose `avgSpm` was dropped (null, 0, or out of band) still copied the
 *  target unconditionally, producing exactly this discriminant's "old
 *  row" shape from BRAND NEW code — a renderer would have printed the
 *  TARGET as MEASURED, the wrong-number class this whole phase exists to
 *  kill.
 *
 *  Exported so every renderer (the summary, from-the-log) imports this
 *  ONE copy rather than re-deriving the condition — the earlier,
 *  now-superseded design (a `deviceName`-based rule) got this wrong for a
 *  NEW row; see §2's own history note. */
export function spmIsMeasured(
  step: Pick<LogStep, "actualSource" | "spm" | "actualSpm">,
): boolean {
  return step.actualSource === "pm5" && step.actualSpm === undefined;
}

// Shared by both builders: the step-text idiom's duration half. A work
// phase/step always has EXACTLY ONE of seconds/meters (domain/expand.ts's
// "case w" sets one or the other, never both, never neither) — the `!`
// reflects that construction guarantee, not a runtime check performed here.
function durationText(phase: { seconds?: number; meters?: number }): string {
  return phase.seconds !== undefined
    ? fmtDuration(phase.seconds / 60)
    : `${phase.meters!} m`;
}

// THE shared label composer (F1b review: "reuse the same internal label
// helper so the two doors CANNOT diverge"). Both builders call this
// whenever they have a real `ref` to hand — `buildManualLogSteps` always
// (it's built from authored `Step[]`), `buildLogSteps` whenever the draft
// lookup below finds one. A single function computing `${duration} @
// ${refLabel(ref)}` means there is no second copy of this idiom anywhere
// in the file left to drift out of sync with it.
function refPaceLabel(duration: string, ref: PaceRef): string {
  return `${duration} @ ${refLabel(ref)}`;
}

// F2 (whole-branch review, Task 2 fix round): the label's own offset must
// be the EFFECTIVE one this step was actually rowed against — base + off +
// nudge — not the raw authored off alone. `phase.targetSplit` already
// bakes the nudge in (`engine.ts`'s `buildRun`, via `effectiveSteps`
// folding a nudge into `ref.off` before resolving), so composing the label
// from the RAW ref left a nudged session with an irreconcilable trio
// forever once logged: label "2k +5", stored `targetSplit` reflecting
// off+nudge (e.g. baselines[2k]=112.3, off=5, nudge=2 -> 119.3) — 112.3+5
// (117.3) never reconciles against the persisted 119.3. Folding the nudge
// into the label's own off ("2k +7") keeps label, the PACES LOCKED
// reconstruction, and the stored split mutually consistent (112.3+7=119.3).
// Effort refs have no offset to nudge (`withNudge` already refuses to
// record one against an effort step — draft.ts's own rule), so this is a
// no-op for them; `nudge === 0` (the manual door's own case — off-app rows
// have no draft, hence no nudges) short-circuits to the identical ref.
function withEffectiveOff(ref: PaceRef, nudge: number): PaceRef {
  if (isEffortRef(ref) || nudge === 0) return ref;
  return { ...ref, off: ref.off + nudge };
}

// Looks up the REAL authored step a work phase came from, in the draft it
// was built from — `phase.originalIndex` is a position in `draft.steps`
// (module header's LABEL IDIOM paragraph: `engine.ts`'s own doc on
// `originalIndex`, `draft.ts`'s `effectiveSteps` never mutates `d.steps`
// itself). Returns `undefined` (triggering the fallback) for a null draft,
// an out-of-range index, or an index that doesn't land on a `"w"` step —
// the last two shouldn't happen for a draft that actually produced this
// run, but this is a lookup a mismatched/stale draft must not crash on.
function draftWorkStep(
  draft: SessionDraft | null,
  originalIndex: number,
): Extract<Step, { k: "w" }> | undefined {
  const step = draft?.steps[originalIndex];
  return step?.k === "w" ? step : undefined;
}

/** Builds the Log screen's step list from a completed session run. Walks
 *  `run.phases` in POSITION order (not `originalIndex`) because that's how
 *  `run.actuals` is keyed (`run.ts`'s own doc on `PhaseActual`) — a repeated
 *  distance step (4x2000m) produces multiple occurrences sharing one
 *  `originalIndex` but each needs its OWN actual lookup.
 *
 *  `draft` is the `SessionDraft` this run was built from (F1b review) —
 *  pass `null` only when it's genuinely unavailable (module header's
 *  FALLBACK paragraph); passing the real draft whenever it's on hand is
 *  what lets this door's labels match `buildManualLogSteps`'s.
 *
 *  A "test" phase (IMP-1, module header) produces a `LogStep` carrying ONLY
 *  `label` — no `targetSplit`/`actualSplit`/`actualSource`/`spm`/`meters`/
 *  `seconds` at all, since a test phase has none of those to report. The
 *  label prefers `draft.steps[phase.originalIndex]`'s own text when that
 *  draft step is genuinely a `"test"` step (the ORIGINAL authored label);
 *  falls back to the phase's own frozen `label` ("All out") otherwise —
 *  same "prefer draft, fall back to phase" shape as the work-step branch
 *  below, just with a much smaller result.
 *
 *  Per work phase (module header: wu/rest never produce one; test is
 *  handled separately, immediately above):
 *  - `label`: `refPaceLabel(duration, draftStep.ref)` when
 *    `draftWorkStep(draft, phase.originalIndex)` finds the real authored
 *    step (module header's LABEL IDIOM paragraph — byte-identical to
 *    `buildManualLogSteps`'s label for the same step); otherwise the
 *    FALLBACK paragraph's rule (effort: `refLabel({effort:
 *    effortFromWord(phase.label)})`; split-ref: `refPaceLabel(duration,
 *    phase.ref)` when `phase.ref` is present — byte-identical to the
 *    preferred path — else, only for a legacy pre-ref `SessionRun`, the
 *    phase's own frozen `label` verbatim).
 *  - `targetSplit`: omitted for an effort phase (5G rule — the frozen number
 *    is `estimationSplit`'s guess, never a real prescription); present
 *    otherwise, straight from the phase (already resolved at `buildRun`
 *    time, frozen against later baseline edits).
 *  - `spm`/`seconds`/`meters`: copied straight through when the phase set
 *    them.
 *  - the actual, joined by phase position (module header's own "subtle
 *    rules", each pinned by a fixture in the test file). Phase 6I amended
 *    this: a MEASURED (stopwatch) actual now survives on an effort phase
 *    too — only an ASSUMED one stays effort-gated (there's no
 *    `targetSplit` to assume held). Checked in this order:
 *      - `run.actuals[i]` present (a KEPT distance actual — the engine's
 *        `nextDistance` is the only place that ever writes to `actuals`,
 *        and it only runs on a phase with `meters`, effort or split-ref
 *        alike) -> passes through as `actualSplit: splitSeconds,
 *        actualSource: "stopwatch"` REGARDLESS of `isEffort`.
 *      - no `actuals[i]` entry, NOT an effort phase, phase has `seconds`
 *        (a TIME phase) -> the engine NEVER records an actual for a time
 *        phase (only `nextDistance` writes one, and it's distance-only) —
 *        a completed time phase is read as "held the target": `actualSplit:
 *        targetSplit, actualSource: "assumed"`.
 *      - an EFFORT phase with no `actuals[i]` entry -> neither key at all,
 *        whether it's a completed effort TIME phase (nothing to assume —
 *        no `targetSplit`) or a distance one with a DISCARDED suspect
 *        split (same next bullet's reasoning, applied to an effort ref).
 *      - a SPLIT-ref DISTANCE phase with no `actuals[i]` entry -> the
 *        rower's split was flagged suspect and DISCARDED (`Timer.tsx`'s
 *        `handleDiscardSplit` calls `advance`, not `nextDistance` —
 *        "Discard records NO actual") -> neither key at all. Absence here
 *        is deliberate, not a logged zero. */
export function buildLogSteps(
  run: SessionRun,
  draft: SessionDraft | null,
): LogStep[] {
  const out: LogStep[] = [];
  run.phases.forEach((phase: EnginePhase, i: number) => {
    if (phase.type === "test") {
      // IMP-1 (module header, this function's own doc comment): a bare
      // label, nothing else — the draft's own original text when a
      // matching `"test"` step is on hand, else the phase's frozen "All
      // out".
      const draftStep = draft?.steps[phase.originalIndex];
      out.push({
        label: draftStep?.k === "test" ? draftStep.label : phase.label,
      });
      return;
    }
    if (phase.type !== "work") return;
    const isEffort = phase.targetKind === "effort";
    const draftStep = draftWorkStep(draft, phase.originalIndex);
    // Preferred path (module header's LABEL IDIOM paragraph): the draft's
    // own authored step has the real ref, so this door's label is composed
    // by the SAME helper buildManualLogSteps uses — byte-identical output
    // for the same step, split-ref or effort.
    //
    // Fallback (module header's FALLBACK paragraph, only when `draftStep`
    // is undefined): an effort phase still has a ref to reconstruct — the
    // chip word ("MAX"/"MIN") recovers from the frozen display word via
    // effortFromWord's inverse (the cast is safe: this branch only runs
    // when `targetKind === "effort"`, and domain/expand.ts's "case w" sets
    // `label` to exactly `effortWord(ref.effort)` in that case, never any
    // other string) — so it still goes through `refPaceLabel`. A split-ref
    // phase now ALSO reconstructs through `refPaceLabel` (ui-fix round
    // Task 2 fix round, F1b): `phase.ref` carries the same effective ref
    // `targetSplit` was resolved from, so this composes the identical chip
    // the preferred path would have — byte-identical, pinned below. Only a
    // LEGACY phase (a `v:1` run frozen before `ref` existed on
    // `Phase`/`EnginePhase` at all) has neither a draft nor a `ref` to
    // reconstruct from; that one case keeps the phase's own frozen `label`
    // verbatim.
    let label: string;
    if (draftStep !== undefined) {
      // `draft` is guaranteed non-null here: `draftWorkStep` (above) can
      // only return non-undefined when its own `draft` argument was
      // non-null (it short-circuits via `draft?.steps[...]` otherwise).
      const nudge = draft!.nudges[phase.originalIndex] ?? 0;
      label = refPaceLabel(
        durationText(phase),
        withEffectiveOff(draftStep.ref, nudge),
      );
    } else if (isEffort) {
      label = refPaceLabel(durationText(phase), {
        effort: effortFromWord(phase.label as "ALL OUT" | "EASY"),
      });
    } else if (phase.ref !== undefined) {
      // Ui-fix round Task 2 fix round, F1b: reconstructs the SAME chip the
      // preferred path would have, since `phase.ref` is already the
      // EFFECTIVE (nudge-folded) ref — `domain/expand.ts`'s own `case "w"`
      // sets it from `effectiveSteps`'s output when built via `buildRun`,
      // the identical value `withEffectiveOff(draftStep.ref, nudge)` above
      // would compute from the draft side of the same step.
      label = refPaceLabel(durationText(phase), phase.ref);
    } else {
      // LEGACY: a `v:1` SessionRun persisted before this field existed on
      // Phase/EnginePhase at all (`isSessionRun`'s own loose validation
      // admits it, same as any other additive field an old record
      // predates). No ref to reconstruct — keeps the phase's own frozen
      // label verbatim, whatever string it happened to be frozen with (a
      // pre-this-round record still carries its old tolerance-band text).
      label = `${durationText(phase)} @ ${phase.label}`;
    }
    const step: LogStep = { label };
    if (!isEffort) {
      // Both branches of domain/expand.ts's "case w" set targetSplit for
      // every work phase; the `!` documents that guarantee.
      step.targetSplit = phase.targetSplit!;
    }
    if (phase.spm !== undefined) step.spm = phase.spm;
    if (phase.seconds !== undefined) step.seconds = phase.seconds;
    if (phase.meters !== undefined) step.meters = phase.meters;
    // Phase 6I amendment to the 5G drop rule (module header): a MEASURED
    // (stopwatch) actual survives regardless of `isEffort` — `run.actuals`
    // is only ever written by `nextDistance` (engine.ts), which records a
    // real elapsed/split pair off the rower's own stopwatch with no
    // reference to `targetSplit` at all, so an effort DISTANCE phase's
    // measured actual is exactly as real as a split-ref phase's.
    // `validateLogStepEntry` already accepts a paired
    // `actualSplit`/`actualSource` with no `targetSplit` (the 6C
    // amendment, module header's SERVER CONTRACT paragraph) — this is that
    // exact shape. An ASSUMED actual ("held the target") stays effort-gated
    // below it: an effort phase has no `targetSplit` to assume held (the
    // 5G rule, unchanged) — a completed effort TIME phase (the only way to
    // finish one with no recorded actual: `nextDistance` never touches a
    // time phase) logs nothing at all, same as before this task.
    const actual = run.actuals[i];
    if (actual !== undefined) {
      // Stored shape (b): only the `"stopwatch"` member HAS a split. A
      // `"stopwatch-elapsed"` actual belongs to a metre-less phase (the
      // free-row timer's single `test` phase, which returned above before
      // reaching here) — on a work phase it could only be a record no
      // writer produces, and it logs no split rather than a fabricated one.
      if (actual.actualSource === "stopwatch") {
        step.actualSplit = actual.splitSeconds;
        step.actualSource = "stopwatch";
      }
    } else if (!isEffort && phase.seconds !== undefined) {
      step.actualSplit = phase.targetSplit!;
      step.actualSource = "assumed";
    }
    // else: a distance phase with no recorded actual is a discarded
    // suspect split (split-ref) — neither key, per the module header. An
    // effort TIME phase with no actual falls here too now, and logs
    // nothing, which is the SAME outcome the old `if (!isEffort)` wrapper
    // produced for it (this branch was always unreachable for a completed
    // effort time phase either way — `nextDistance` never runs on one).
    out.push(step);
  });
  return out;
}

/** Builds the manual ("Log it after") door's step list straight from a
 *  workout's authored steps, resolved at CURRENT baselines — the spec's own
 *  "that IS the lock moment for an off-app row." This ALWAYS has the raw
 *  `Step[]` (with each work step's real `ref`), so every label goes through
 *  the shared `refPaceLabel` helper (module header's LABEL IDIOM
 *  paragraph — the same one `buildLogSteps` uses whenever its draft lookup
 *  succeeds), matching the detail screen's exact idiom (`StepRow.tsx`'s
 *  `left = `${duration} @ ${refLabel(ref)}``) and the task brief's own
 *  literal examples (`0:30 @ MAX` is Fork Lightning's real effort step,
 *  pinned in the test file).
 *
 *  `liveSteps` (not `phases()`) does the reps-block expansion: it returns
 *  the flat, repeats-expanded `Step[]` (one entry per physical repetition,
 *  reps marker's own slot dropped) with no need for `Baselines`/tolerance to
 *  do it — reusing the ONE place that decides reps-expansion rather than
 *  hand-rolling it again, the exact drift `engine.ts`'s own header comment
 *  documents as a past defect (originalIndex attribution used to be
 *  reimplemented independently and disagreed with `phases()` on a
 *  `restMinutes: 0` truthiness edge case).
 *
 *  ALL split-ref actuals are `"assumed"` (there is no run, no stopwatch, no
 *  discard concept for an off-app row — the spec's "ALL actuals 'assumed'"),
 *  using the SAME resolved number for both `targetSplit` and `actualSplit`
 *  (an off-app row is recorded as "held the target", identical to
 *  `buildLogSteps`'s completed-time-phase rule). Effort steps omit
 *  `targetSplit`/`actualSplit`/`actualSource` entirely, same 5G rule as
 *  `buildLogSteps` (module header's SERVER CONTRACT paragraph).
 *
 *  A `"test"` step (IMP-1, module header) produces a bare-label `LogStep`
 *  the same way `buildLogSteps` does — here it's simpler still, since this
 *  builder always has the step's own ORIGINAL authored `label` straight
 *  from `Step` with no phase/draft indirection to reach through at all.
 *
 *  Phase 6I close-out fold (Task 2's deferred ledger item): `baselines` is
 *  now `Baselines | null` — `ManualDoorLog` gates its OWN call site on
 *  `needsBaselines(workout.steps)` rather than bare `baselines === null`,
 *  so an effort-only workout (every step `isEffortRef`) can reach here
 *  with null baselines. `resolveSplit` is only ever called from the
 *  `!isEffort` branch below, which `needsBaselines` guarantees never runs
 *  when `baselines` is null (the two predicates are the same condition,
 *  "some work step is a split ref") — the `!` on `baselines` there
 *  documents that invariant, not a runtime check. */
export function buildManualLogSteps(
  workout: { steps: Step[] },
  baselines: Baselines | null,
): LogStep[] {
  const out: LogStep[] = [];
  for (const step of liveSteps(workout.steps)) {
    if (step.k === "test") {
      out.push({ label: step.label });
      continue;
    }
    if (step.k !== "w") continue;
    const isEffort = isEffortRef(step.ref);
    const durationLabel =
      step.duration.kind === "time"
        ? fmtDuration(step.duration.minutes)
        : `${step.duration.meters} m`;
    const logStep: LogStep = {
      label: refPaceLabel(durationLabel, step.ref),
    };
    if (!isEffort) {
      // `needsBaselines(workout.steps)` (ManualDoorLog's own call-site
      // gate) is true whenever any work step reaches this branch — the
      // caller has already confirmed `baselines` is non-null before
      // calling at all in that case (module header's Phase 6I paragraph).
      const split = resolveSplit(baselines!, step.ref);
      logStep.targetSplit = split;
      logStep.actualSplit = split;
      logStep.actualSource = "assumed";
    }
    if (step.spm !== undefined) logStep.spm = step.spm;
    if (step.duration.kind === "time") {
      logStep.seconds = step.duration.minutes * 60;
    } else {
      logStep.meters = step.duration.meters;
    }
    out.push(logStep);
  }
  return out;
}

/** `MonitorRun`'s frozen log identity, captured once at Connect (7C spec
 *  §2, the adversarial review's B1): `buildMonitorLogSteps` (a later task)
 *  cannot derive a LABEL from `MonitorRun` alone — `ProgramInterval`
 *  (`domain/monitor/program.ts`) carries none, and the connect path
 *  persists no
 *  `SessionDraft` for it to recover one from (7B's Connect flow compiles
 *  straight from the library workout, never through a confirm screen that
 *  would leave one behind). So the run learns the one small thing the log
 *  needs, at the moment it still has it. `steps` is built from the SAME
 *  `EnginePhase[]` the `WorkoutProgram` was compiled from (`WorkoutDetail.
 *  tsx`'s `handleConnectProceed`, the seed's one call site), walked in the
 *  same order `compileProgram` walks to build `ProgramInterval[]` — both
 *  skip exactly the "rest" phases (`compileProgram` folds each into the
 *  PRECEDING interval's `restSeconds` rather than emitting an interval of
 *  its own), so `seed.steps[i]` and `program.intervals[i]` name the SAME
 *  interval for every `i` — a later task's whole alignment contract.
 *
 *  `kind` LOST its `"warmup"` MEMBER at door PR A (spec §4 rider 2) — the
 *  union is now the literal `"work"` alone. It stays a LITERAL union rather
 *  than widening to `string`: widening admits typos, erases the
 *  enumeration, and hides a future owed cleanup from the compiler.
 *  `buildLogSeed` below has not been able to PRODUCE `"warmup"` since
 *  Phase WU, so every step it writes is `"work"`.
 *  **The READER in `buildMonitorLogSteps` still honours the legacy value**,
 *  behind an explicit cast rather than a union member: `LogSeed` is
 *  PERSISTED inside a stored `MonitorRun` (`src/monitor/monitorRun.ts`'s
 *  localStorage record), so a run authored before warm-up removal
 *  (PR #150, v0.16.0, 2026-08-22) and still unlogged carries
 *  `kind: "warmup"` on its first step once it comes back out of JSON,
 *  despite the type no longer admitting it. That is the same
 *  "trust the wire, not the type" legacy-population read
 *  `summaryModel.ts`'s `warmupIndex` performs on the SAME records; see
 *  `buildMonitorLogSteps`'s own guard comment below. */
export interface LogSeed {
  steps: { label: string; kind: "work" }[];
  /** The PACES LOCKED panel's values (README.md §7's "PACES LOCKED AT 2K
   *  1:52.0 · 6K 2:02.0"), captured HERE because the monitor door has no
   *  draft to recover them from later the way `LogSession.tsx`'s own
   *  `lockedBaseline` does for a phone-timer session. Same "F1" rule as
   *  that file's `manualLockedBaseline`: a base no step in this workout
   *  references at all is omitted, never fabricated from a baseline this
   *  workout never used. */
  paces: { k2?: number; k6?: number };
}

/** Builds a `MonitorRun`'s `logSeed`. Every non-rest phase produces exactly
 *  one seed step, in phase order, and since Phase WU every one of them is
 *  `kind: "work"` — no phase can be a warm-up any more, and `LogSeed`'s own
 *  type has named only `"work"` since door PR A (see `LogSeed`).
 *
 *  Labels reuse this module's OWN `durationText`/`refPaceLabel` helpers —
 *  the SAME ones `buildManualLogSteps` composes its labels from — so a work
 *  step's seed label is byte-identical to what the manual door would have
 *  shown for the same authored step (this task's load-bearing requirement:
 *  a later task's builder renders these labels straight through, and a
 *  drifted label would break that alignment silently). There is no
 *  `SessionDraft` on the connect path (unlike the phone-timer door), so
 *  this always takes the FALLBACK shape `buildLogSteps` uses when its own
 *  draft lookup misses: an effort phase's chip recovers through
 *  `effortFromWord`, a split phase's chip composes straight from
 *  `phase.ref`. `phase.ref` is already the EFFECTIVE, nudge-folded ref
 *  (`engine.ts`'s `buildRun` resolves every phase from the draft's
 *  `effectiveSteps`, which folds a preview nudge into `ref.off` before
 *  `domain/expand.ts`'s `phases()` ever runs) — so there is no separate
 *  nudge fold to apply here the way `buildLogSteps`'s preferred (draft
 *  lookup) branch needs one.
 *
 *  A "test" phase (open-ended, no fixed time/distance) cannot actually
 *  reach this function in production — `compileProgram` refuses to compile
 *  one at all (`unrepresentable-value`), and `WorkoutDetail.tsx`'s
 *  `handleConnectProceed` bails out on a `CompileError` before ever calling
 *  this — but is handled defensively (the phase's own frozen label
 *  verbatim, no duration prefix — nothing to format, since a test phase has
 *  neither `seconds` nor `meters`) rather than left to throw if that
 *  compiler rule is ever loosened.
 *
 *  `paces`: walks every split-ref work phase's `phase.ref.base` (an effort
 *  phase has no `ref` at all — the 5G rule, `domain/expand.ts`'s "case w")
 *  and records CURRENT `baselines` under whichever base(s) were actually
 *  referenced — the same F1 rule `manualLockedBaseline` (`LogSession.tsx`)
 *  already established for the manual door. */
/** Rebase seam (6I over 7C, 2026-08-09): 6I loosened the Connect guard so
 *  an effort-only workout can program a monitor with NULL baselines — and
 *  this function (7C) is directly downstream of that guard. Baselines are
 *  read ONLY in the split-ref branch below, which `needsBaselines` gating
 *  at the Connect door guarantees is unreachable when they're null; a
 *  split-ref phase arriving here with null anyway is a programmer error
 *  and throws loudly, the exact convention `phases()`/`estimationSplit`
 *  established (domain/expand.ts). */
export function buildLogSeed(
  phases: EnginePhase[],
  baselines: Baselines | null,
): LogSeed {
  const steps: LogSeed["steps"] = [];
  const paces: LogSeed["paces"] = {};
  for (const phase of phases) {
    if (phase.type === "rest") continue;
    if (phase.type === "test") {
      // Defensive only — see this function's own doc comment: `phase` has
      // no `seconds`/`meters` to run through `durationText`, and there is
      // no real caller today that can reach this branch at all.
      steps.push({ label: phase.label, kind: "work" });
      continue;
    }
    const isEffort = phase.targetKind === "effort";
    let label: string;
    if (isEffort) {
      label = refPaceLabel(durationText(phase), {
        effort: effortFromWord(phase.label as "ALL OUT" | "EASY"),
      });
    } else if (phase.ref !== undefined) {
      label = refPaceLabel(durationText(phase), phase.ref);
      // `phase.ref` is always a SplitRef here, never an EffortRef: an
      // "effort" targetKind phase never sets `ref` at all
      // (`domain/expand.ts`'s "case w" only sets it in the split branch),
      // and the `isEffort` branch above already handled the effort case.
      // The cast documents that construction guarantee rather than
      // re-checking it at runtime — this file's own `!` convention
      // (`durationText`'s header comment) for a fact the domain layer
      // enforces upstream, not a possibility this function needs to guard.
      const splitRef = phase.ref as SplitRef;
      if (baselines === null) {
        throw new Error(
          "buildLogSeed: a split-ref phase needs baselines — callers must gate on needsBaselines() first",
        );
      }
      if (splitRef.base === "2k") {
        paces.k2 = baselines.k2Seconds;
      } else {
        paces.k6 = baselines.k6Seconds;
      }
    } else {
      // LEGACY-shaped defensive fallback, matching `buildLogSteps`' own
      // last resort: no ref to reconstruct a chip from at all. Shouldn't
      // happen for a phase built through `buildRun` (a "split" targetKind
      // phase always carries `ref` — `domain/expand.ts`'s "case w").
      label = `${durationText(phase)} @ ${phase.label}`;
    }
    steps.push({ label, kind: "work" });
  }
  return { steps, paces };
}

/** Thrown by `buildMonitorLogSteps` (below) when a `MonitorRun`'s `logSeed`
 *  is missing or its length doesn't line up with `program.intervals` (7C
 *  spec §3: "a length mismatch or missing seed disqualifies the record
 *  from the monitor mode entirely — fall through to manual, never guess").
 *  A plain `Error` subclass, not a crash: the screen task (Task 4) catches
 *  this as mode disqualification, the same way a malformed record is
 *  handled everywhere else in this file (`buildLogSeed`'s own defensive
 *  branches) — a rower's log door must never brick on a record shape this
 *  module didn't anticipate. */
export class MonitorLogSeedError extends Error {}

/** The valid `avgHr` band (7C spec §3, adversarial m2): a reading outside
 *  this range drops the `avgHr` field, it never rejects the step or the
 *  save. Exported so the Log screen (Task 4) and this module's own tests
 *  read the identical bounds — never a second copy of "20" and "254". */
export const MONITOR_HR_MIN = 20;
export const MONITOR_HR_MAX = 254;

/** The valid `actualSplit` band for a monitor-sourced reading (branch
 *  review Medium-1): mirrors `server/routes/data.ts`'s own pm5
 *  `PM5_MAX_SPLIT_SECONDS`, so this builder can never hand the server a
 *  number its own band would reject (`avgSplit`'s wire range is `0 ..
 *  6553.5`, wider than the server's `<= 6000`). Same drop-the-field
 *  treatment as `MONITOR_HR_MIN`/`MAX` above — a reading outside this
 *  range omits `actualSplit`, it never rejects the step or the save;
 *  `actualSource: "pm5"` is unaffected (the pm5 pairing exception,
 *  `LogStep`'s own doc comment). Zero is excluded separately (§3: `0`
 *  means the wire had no reading), so this constant is only ever checked
 *  as an upper bound. */
export const MONITOR_SPLIT_MAX = 6000;

/** The valid `actualSpm` band for a monitor-sourced reading (branch review
 *  Medium-1, floor amended Phase LT spec 1 §2): mirrors `server/routes/
 *  data.ts`'s pm5 actualSpm bound (min 1, max `PM5_SPM_MAX`) — `avgSpm`'s
 *  wire range is `0 .. 255`, wider than the server's `1..99`. Same
 *  drop-the-field treatment as the split/HR bands above.
 *
 *  THE FLOOR (Phase LT spec 1, §2 — carried debt closed): `MONITOR_SPM_MIN`
 *  moved from 0 to 1, justified by the FIELD'S TYPE, not device folklore —
 *  no committed capture has ever shown `avgSpm` 0 (every boundary record
 *  reads 23-29). `avgSpm` is a u8 at 1 spm/lsb, so a sub-1 average is
 *  UNREPRESENTABLE — the floor can only ever drop an EXACT 0, which means
 *  "no strokes", not a stroke-rate measurement. Existing stored zeros
 *  (from before this change, saved under the old 0 floor) still read back
 *  as `spm: 0` or `actualSpm: 0` verbatim — this module only stops the
 *  floor from admitting a NEW zero, it never rewrites or reinterprets a
 *  stored one. The `> 0` read guard that renders such a stored zero as
 *  absent lives in `buildSpmCell` (`session/summaryModel.ts`, final-review
 *  fix round) — the ONE place both renderers (live summary, from-the-log)
 *  resolve this field, so it is written there once rather than
 *  re-implemented per renderer. Same "drop the field on read, never
 *  migrate" treatment the split/HR bands already use. */
export const MONITOR_SPM_MIN = 1;
export const MONITOR_SPM_MAX = 99;

/** Builds the Log screen's monitor-mode step list straight from a completed
 *  `MonitorRun` — the PM5-driven twin of `buildLogSteps` above, and the
 *  builder the 7C spec's §3 table describes field-by-field. Cannot derive a
 *  LABEL from `MonitorRun` alone (`ProgramInterval` carries none) — that is
 *  what `run.logSeed` (`buildLogSeed`'s own output, frozen at Connect)
 *  exists to supply; see this file's `LogSeed` doc comment for the
 *  alignment contract between `logSeed.steps` and `program.intervals`, and
 *  for the legacy `"warmup"` string this reader still honours behind a cast
 *  after door PR A narrowed the seed's own `kind` union.
 *
 *  **Alignment / disqualification** (§3): `logSeed` missing, or
 *  `logSeed.steps.length !== program.intervals.length`, throws
 *  `MonitorLogSeedError` rather than guessing a partial mapping — the
 *  screen's job, not this function's, is to fall through to the manual
 *  door when that happens.
 *
 *  **A LEGACY warmup seed step produces NO step** (§3, adversarial B2):
 *  shape parity with the manual door, which has never emitted a warmup row.
 *  Nothing has written `kind: "warmup"` since Phase WU, and since door PR A
 *  (spec §4 rider 2) the type does not admit it either — but a `MonitorRun`
 *  stored before warm-up removal still carries the string at RUNTIME, so
 *  the guard stays, as an explicit legacy-population read behind a cast
 *  (the same shape `summaryModel.ts`'s `warmupIndex` uses). Such a step's
 *  own program-interval position is still consumed while walking the two
 *  parallel arrays (so later intervals keep their correct position), but no
 *  `LogStep` is pushed for it, and any actual matched to that position
 *  (§3's matching rule, next) never surfaces. Rest never gets its own
 *  interval at all — `compileProgram` folds every rest phase into the
 *  interval before it (`domain/monitor/program.ts`'s own rest-folding
 *  comment) — so there is no separate rest case here to skip.
 *
 *  **Matching** (§3): by `IntervalActual.index` (already OUR normalized
 *  0-based program index) against the program interval's position — a
 *  `Map` built once from `run.actuals`, skipping every actual whose
 *  `index` is `null` (§3: "unattributable; unsyncable" — a consumer must
 *  never read `null` as interval 0, `domain/monitor/types.ts`'s own
 *  `IntervalActual.index` doc comment). An interval with no matching actual
 *  in the map — never reached (partials ruling), a lost boundary whose
 *  pair never both arrived, or simply not yet rowed — gets NO actual and
 *  NO source at all, never `"assumed"`: unlike the phone-timer builder
 *  above, there is no "held the target" inference for a monitor session,
 *  because the PM5, not this app's clock, is the only witness to whether
 *  the interval ran.
 *
 *  **Per work interval** (§3's table): `label` from `logSeed.steps[i]`
 *  verbatim; `targetSplit` from `ProgramInterval.targetSplit` (`null` for
 *  an effort interval or a target-less one — omitted, never a fabricated
 *  number; **effort intervals still get every measured field below**, a
 *  deliberate departure from the 5G rule the phone-timer builders follow,
 *  §3's own "no target" note); `meters`/`seconds` from
 *  `ProgramInterval.value` by `kind`. **`spm` — the AUTHORED target,
 *  Phase LT spec 1 §2, AMENDED at Task 1 review** — copied from
 *  `ProgramInterval.displaySpm`, but NOT unconditionally: on an UNMATCHED
 *  interval (no actual at all — never reached, or a lost boundary pair)
 *  it is copied straight through, since a programmed-then-abandoned
 *  interval's target is still real; on a MATCHED actual it is written
 *  ONLY ALONGSIDE `actualSpm` (see that field below) — a dropped
 *  measurement writes neither, never the target alone standing in for a
 *  measurement that didn't happen. When a matched actual exists:
 *  `actualSource: "pm5"` unconditionally (the **pm5 pairing exception**,
 *  `LogStep`'s own doc comment above) — `actualSplit` only when `avgSplit`
 *  is a number `> 0` AND `<= MONITOR_SPLIT_MAX` (`0` means the wire had no
 *  reading, §3; the upper band drops the field rather than posting a
 *  number the server's own `PM5_MAX_SPLIT_SECONDS` band would reject —
 *  branch review Medium-1, same drop-the-field rule `avgHr` already
 *  follows); `actualSpm` — the MEASURED average, Phase LT spec 1 §2 (this
 *  field, not `spm`, now holds it) — only when it is within
 *  `MONITOR_SPM_MIN..MONITOR_SPM_MAX` (branch review Medium-1, floor
 *  amended by the spec — see `MONITOR_SPM_MIN`'s own comment); `spm` rides
 *  alongside it (previous paragraph) precisely because this is the ONE
 *  gate a dropped measurement must also fail; `avgHr`/`actualSeconds`/
 *  `actualMeters` straight from the actual (`avgHr` additionally banded to
 *  `MONITOR_HR_MIN..MONITOR_HR_MAX`, `LogStep.avgHr`'s own doc comment). */
export function buildMonitorLogSteps(run: MonitorRun): LogStep[] {
  const seed = run.logSeed;
  if (
    seed === undefined ||
    seed.steps.length !== run.program.intervals.length
  ) {
    throw new MonitorLogSeedError(
      "This monitor run has no log seed matching its program; it cannot be logged as a monitor session.",
    );
  }
  const actualByIndex = new Map<number, IntervalActual>();
  for (const actual of run.actuals) {
    if (actual.index !== null) actualByIndex.set(actual.index, actual);
  }
  const out: LogStep[] = [];
  run.program.intervals.forEach((interval, i) => {
    const seedStep = seed.steps[i]!;
    // KEEP — RESTORED at door PR A's whole-branch review (Important 1).
    // The earlier fix-round ruling that ACCEPTED removing this guard is
    // REVERSED; no number moves. `LogSeed` is PERSISTED on a stored
    // `MonitorRun`, so a record authored before warm-up removal (PR #150,
    // v0.16.0, 2026-08-22) and still unlogged carries `kind: "warmup"` at
    // runtime once it comes back out of JSON — that population, and only
    // that one, is what this guard reads for. The TYPE no longer admits the
    // value (spec §4 rider 2 narrowed `LogSeed.steps[].kind` to the literal
    // `"work"`, and that narrowing stands), so the read is an explicit
    // legacy-population cast — the identical shape `summaryModel.ts`'s
    // `warmupIndex` uses over the SAME records. Deleting it would push a
    // phantom warm-up row into what such a record SAVES, and the saved
    // row's AVG SPLIT would then read back through the Log door as a
    // DIFFERENT number from the live summary `warmupIndex` keeps frozen.
    // Nothing produces the value any more (`buildLogSeed` above cannot).
    if ((seedStep.kind as string) === "warmup") return;
    const step: LogStep = { label: seedStep.label };
    if (interval.targetSplit !== null) step.targetSplit = interval.targetSplit;
    if (interval.kind === "time") {
      step.seconds = interval.value;
    } else {
      step.meters = interval.value;
    }
    const actual = actualByIndex.get(i);
    if (actual !== undefined) {
      step.actualSource = "pm5";
      if (
        actual.avgSplit !== null &&
        actual.avgSplit > 0 &&
        actual.avgSplit <= MONITOR_SPLIT_MAX
      ) {
        step.actualSplit = actual.avgSplit;
      }
      if (
        actual.avgSpm !== null &&
        actual.avgSpm >= MONITOR_SPM_MIN &&
        actual.avgSpm <= MONITOR_SPM_MAX
      ) {
        // Phase LT spec 1, §2, AMENDED at Task 1 review (the discriminant
        // was unsound for a new dropped-measurement row — a matched
        // actual whose avgSpm is dropped used to still copy the target
        // unconditionally, producing a shape byte-identical to a
        // pre-split row: actualSource "pm5", no actualSpm, spm holding a
        // number — except that number was now the TARGET, and a
        // renderer keying on `spmIsMeasured` would print it as MEASURED.
        // Fix: `spm` is written ONLY alongside `actualSpm` on a matched
        // actual — a dropped measurement writes NEITHER field, so new
        // code can never reproduce the pre-split shape and the row-local
        // discriminant (`spmIsMeasured`) is sound by construction. Cost,
        // accepted: a new matched-but-dropped row shows no SPM cell at
        // all (absence over invention).
        step.actualSpm = actual.avgSpm;
        if (interval.displaySpm !== null) step.spm = interval.displaySpm;
      }
      if (
        actual.avgHeartRateBpm !== null &&
        actual.avgHeartRateBpm >= MONITOR_HR_MIN &&
        actual.avgHeartRateBpm <= MONITOR_HR_MAX
      ) {
        step.avgHr = actual.avgHeartRateBpm;
      }
      step.actualSeconds = actual.elapsedSeconds;
      step.actualMeters = actual.distanceMeters;
    } else {
      // UNMATCHED interval (no actualSource at all): the authored target
      // is still real regardless — an interval that was never reached,
      // or whose boundary pair never both arrived, was still PROGRAMMED
      // with this rate. Unambiguous against the row-local discriminant,
      // which requires `actualSource === "pm5"` first.
      if (interval.displaySpm !== null) step.spm = interval.displaySpm;
    }
    // Door spec (2026-09-02) §5.1: the in-flight interval's own reading,
    // copied onto the step it belongs to and NEVER into
    // `actualMeters`/`actualSeconds`. Keyed on the PROGRAM index `i` (the
    // index `MonitorRun.partial` carries), not on `out.length` — a legacy
    // warm-up seed step returns above without pushing, so the two diverge.
    // `actual === undefined` restates I-B6 on the read side: the writer
    // (`withPartial`) already refuses an interval that carries an actual,
    // and a step can never show both.
    //
    // A `run.partial` whose index matches NO emitted step is dropped
    // SILENTLY, and that is deliberate (harden lens 2, finding 3, which
    // otherwise puts a ring entry on every refusal). This function runs
    // OUTSIDE the hook — there is no `sessionRef` here, and giving a
    // pure builder that `summaryModel.ts` and `LogSession.tsx` call on
    // every render a diagnostics dependency would be the wrong trade.
    // It is also unreachable under Task 2's `program()` placement: the
    // index is minted from `frame.intervalIndex`, which `toProgramIndex`
    // derives from the SAME `run.program` this loop iterates, and the
    // ref clears at every re-arm — so a partial can only carry an index
    // this program has.
    const partial = run.partial;
    if (
      partial !== undefined &&
      partial.intervalIndex === i &&
      actual === undefined
    ) {
      step.partialMeters = partial.meters;
      step.partialSeconds = partial.seconds;
    }
    out.push(step);
  });
  return out;
}

// Mirrors Today.tsx's own (private, unexported) `formatLogDate` byte for
// byte — the house day format `docs/design/README.md`:185 established
// ("JUL 25"). Still NOT imported BY Today.tsx: that file is a screen
// component (react-router-dom, hooks, JSX) and this module is a pure,
// framework-free session builder with no reason to depend on a screen —
// pulling in Today.tsx's whole import chain to reuse six lines would be
// backwards (screens depend on session/, not the other way around). A future
// DRY pass could hoist this into `domain/format.js` — flagged, not fixed, in
// Task 1's own report. Corrected count (whole-branch review; this comment
// used to say "two independent copies"): THREE independent copies exist —
// this one, Today.tsx's, and `e2e/session.spec.ts`'s own browser-context
// copy (Task 4, `todayDateLabel`) — though only the first two are the DRY
// pass's actual candidates. The e2e copy is a different, unavoidable kind of
// duplication (an e2e spec can't `import` a client module into the page it
// evaluates code inside of), not a third instance of the same oversight a
// hoist would fix.
//
// EXPORTED (Task 3, the manual door): `LogSession.tsx` already sits
// downstream of this module (imports `buildLogSteps`/`logTotals`/
// `buildManualLogSteps`), so this is the SANCTIONED direction the paragraph
// above describes — not the screen-depends-on-session violation that keeps
// Today.tsx's own copy separate. The manual door's header needs today's
// date (there is no `SessionRun.completedAt` to read it from, unlike
// `logTotals` below), so it composes it directly from this same function
// rather than growing a third copy of `MONTH_ABBREV`.
const MONTH_ABBREV = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export function formatLogDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_ABBREV[d.getMonth()]} ${d.getDate()}`;
}

/** The Log screen's header line: `JUL 27 · 50 MIN`. `dateLabel` reads
 *  `completedAt` (falling back to `startedAt` only if somehow null — this
 *  function takes no `now` and must stay pure, so there is no clock to fall
 *  back on). `totalMinutes` is the session's REAL wall-clock length
 *  (`completedAt - startedAt`, floored at 0, rounded to the nearest minute)
 *  — the same quantity `SessionComplete.tsx`'s own `totalElapsedSeconds`
 *  computes for its TOTAL, recomputed independently here rather than
 *  imported (same reasoning as `formatLogDate` above: that's a screen
 *  file's export, and this module has no reason to pull in its import
 *  chain) rather than the domain's *estimated* length — the Log screen is
 *  recording what actually happened, and showing a different total here
 *  than the one the rower just saw on the Complete screen moments earlier
 *  would read as a discrepancy, not two honestly-different numbers. */
export function logTotals(run: SessionRun): {
  dateLabel: string;
  totalMinutes: number;
} {
  const completedAt = run.completedAt;
  const totalMinutes =
    completedAt === null
      ? 0
      : Math.round(
          Math.max(
            0,
            new Date(completedAt).getTime() - new Date(run.startedAt).getTime(),
          ) / 60000,
        );
  return {
    dateLabel: formatLogDate(completedAt ?? run.startedAt),
    totalMinutes,
  };
}
