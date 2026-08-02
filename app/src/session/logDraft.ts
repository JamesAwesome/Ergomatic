import { fmtDuration } from "../../domain/duration.js";
import { liveSteps } from "../../domain/expand.js";
import {
  effortFromWord,
  isEffortRef,
  refLabel,
  resolveSplit,
} from "../../domain/pace.js";
import type { Baselines, PaceRef, Step } from "../../domain/types.js";
import type { EnginePhase } from "./engine";
import type { SessionDraft } from "./draft";
import type { SessionRun } from "./run";

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
 *  effort alike. Pinned by a same-workout, both-doors equality test
 *  (Microburst: split + effort + distance steps) in the test file, plus a
 *  removed-step fixture proving the lookup survives a mid-workout removal.
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
 *  frozen `label`: for an EFFORT phase, `domain/pace.ts`'s `effortFromWord`
 *  (F1's original fix, still load-bearing here) inverts `effortWord`'s
 *  frozen "ALL OUT"/"EASY" back to the chip ("MAX"/"MIN") — bijective over
 *  the two-element `Effort` type, so this is a lookup, not a guess. For a
 *  SPLIT-ref phase there's no equivalent inverse (a resolved split number
 *  doesn't uniquely determine which `(base, off)` pair produced it), so the
 *  fallback keeps the phase's own resolved split text (e.g. "2:16.0") —
 *  the one remaining case where a fallback-path label can still differ from
 *  the manual door's, and only when there is no draft to consult at all.
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
 *  together for an effort phase (5G rule). */
export interface LogStep {
  label: string;
  targetSplit?: number;
  actualSplit?: number;
  actualSource?: ActualSource;
  spm?: number;
  meters?: number;
  seconds?: number;
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
 *    effortFromWord(phase.label)})`; split-ref: the phase's own frozen,
 *    already-resolved `phase.label`).
 *  - `targetSplit`: omitted for an effort phase (5G rule — the frozen number
 *    is `estimationSplit`'s guess, never a real prescription); present
 *    otherwise, straight from the phase (already resolved at `buildRun`
 *    time, frozen against later baseline edits).
 *  - `spm`/`seconds`/`meters`: copied straight through when the phase set
 *    them.
 *  - the actual, joined by phase position (module header's own "subtle
 *    rules", each pinned by a fixture in the test file):
 *      - effort phase -> neither `actualSplit` nor `actualSource` (no
 *        actual is ever attributed to an estimate that was never a target).
 *      - `run.actuals[i]` present -> it can only be a KEPT distance actual
 *        (the engine's `nextDistance` is the only place that ever writes to
 *        `actuals`, and it only runs on a phase with `meters`) -> passes
 *        through as `actualSplit: splitSeconds, actualSource: "stopwatch"`.
 *      - no `actuals[i]` entry, phase has `seconds` (a TIME phase) -> the
 *        engine NEVER records an actual for a time phase (only
 *        `nextDistance` writes one, and it's distance-only) — a completed
 *        time phase is read as "held the target": `actualSplit:
 *        targetSplit, actualSource: "assumed"`.
 *      - no `actuals[i]` entry, phase has `meters` (a DISTANCE phase) -> the
 *        rower's split was flagged suspect and DISCARDED
 *        (`Timer.tsx`'s `handleDiscardSplit` calls `advance`, not
 *        `nextDistance` — "Discard records NO actual") -> neither key at
 *        all. Absence here is deliberate, not a logged zero. */
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
    // phase has no ref to reconstruct at all in the fallback, so it keeps
    // the phase's own resolved label verbatim instead.
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
    } else {
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
    if (!isEffort) {
      const actual = run.actuals[i];
      if (actual !== undefined) {
        step.actualSplit = actual.splitSeconds;
        step.actualSource = "stopwatch";
      } else if (phase.seconds !== undefined) {
        step.actualSplit = phase.targetSplit!;
        step.actualSource = "assumed";
      }
      // else: a distance phase with no recorded actual is a discarded
      // suspect split — neither key, per the module header.
    }
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
 *  literal examples (`0:30 @ MAX` is Microburst's real effort step, pinned
 *  in the test file).
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
 *  from `Step` with no phase/draft indirection to reach through at all. */
export function buildManualLogSteps(
  workout: { steps: Step[] },
  baselines: Baselines,
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
      const split = resolveSplit(baselines, step.ref);
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
