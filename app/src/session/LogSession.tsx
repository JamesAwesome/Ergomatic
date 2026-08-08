import { useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useWorkouts, type LibraryWorkout } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { usePlan } from "../api/usePlan";
import type { PlanData } from "../api/usePlan";
import type { HeldResult } from "../api/useRecentLogs";
import { fmtSplit } from "../../domain/format.js";
import { estimateMinutes } from "../../domain/expand.js";
import { isEffortRef } from "../../domain/pace.js";
import type {
  Baselines,
  PaceBase,
  Step,
  WorkoutType,
} from "../../domain/types.js";
import { clearDraft, loadDraft, type SessionDraft } from "./draft";
import { isComplete } from "./engine";
import {
  buildLogSteps,
  buildManualLogSteps,
  formatLogDate,
  logTotals,
  type LogStep,
} from "./logDraft";
import { clearRun, loadRun, type SessionRun } from "./run";
import { useStagedDiscard } from "./useStagedDiscard";
import BackLink from "../shell/BackLink";
import TypeBadge from "../components/TypeBadge";

const HELD_OPTIONS: { value: HeldResult; label: string }[] = [
  { value: "held", label: "HELD" },
  { value: "under", label: "UNDER" },
  { value: "over", label: "OVER" },
];

const PAIN_LEVELS = [1, 2, 3, 4, 5] as const;

// Originally duplicated from ClassificationCard.tsx's own `PAIN_RAMP_VAR`,
// matching this repo's established convention of keeping this tiny 5-entry
// map local to each file that needs it rather than importing it. The
// ui-fix round's Task 1 later moved ClassificationCard.tsx's own selected
// PAIN chip off this ramp onto plain ink (DESIGN.md: "Builder's gold pain
// selection goes" — this screen wasn't touched that round, so its own
// per-level ramp fill is unchanged) — this map and the `.classification-*`
// CSS classes it paints are still shared with (not owned by)
// ClassificationCard.tsx's own `.classification-chip-pain[aria-pressed=
// "true"]` rule, which this screen's inline style always overrides
// regardless of which one is "true" today.
const PAIN_RAMP_VAR: Record<(typeof PAIN_LEVELS)[number], string> = {
  1: "--pain-ramp-1",
  2: "--pain-ramp-2",
  3: "--pain-ramp-3",
  4: "--pain-ramp-4",
  5: "--pain-ramp-5",
};

/** PACES LOCKED panel (README.md §7's own literal example: "PACES LOCKED AT
 *  2K 1:52.0 · 6K 2:02.0"). UNVERIFIED judgment call (Task 2 brief flagged
 *  this as the implementer's to make): the design's own Decisions table
 *  says the session door's paces are "locked at confirm time — survives
 *  baseline edits mid-session by construction," but `SessionRun` itself
 *  never stores the {k2Seconds,k6Seconds} pair it was built with (Task 1's
 *  own report: only each phase's already-RESOLVED `targetSplit` survives).
 *  Two honest options existed: (a) show the rower's CURRENT baselines with
 *  a caveat comment, or (b) reconstruct the value THIS run actually locked,
 *  exactly, from data already on hand. (a) was rejected because it would
 *  make the word "LOCKED" lie in precisely the case it exists to guard
 *  against — a baseline edited mid-session would make the panel disagree
 *  with the per-step splits rendered right below it, which stay genuinely
 *  frozen either way.
 *
 *  (b) is possible, exactly (not approximately), because `engine.ts`'s
 *  `buildRun` computes every split-ref phase's `targetSplit` as
 *  `baselines[base] + (rawOff + nudge)` (domain/expand.ts's `phases()`, fed
 *  the draft's EFFECTIVE steps — nudge already folded into `ref.off` there)
 *  — so for any phase whose authored step referenced `base`,
 *  `baselines[base] = phase.targetSplit - rawOff - nudge` is EXACT, using
 *  the same "recover the raw ref from the draft via `originalIndex`"
 *  technique `logDraft.ts`'s own `buildLogSteps` already established for
 *  step labels. Every phase referencing the same base within one run was
 *  built against the identical (per-run, frozen) baseline value, so the
 *  FIRST match is sufficient.
 *
 *  A workout with no step referencing a given base at all (e.g. built
 *  entirely from "6k" steps, or a Microburst-style all-effort workout with
 *  no split-ref step whatsoever) has nothing to reconstruct — this returns
 *  null, and `pacesLockedText` (below, F1 fix round) OMITS that base's slot
 *  entirely rather than fabricating a number from the rower's current
 *  baseline, which would have nothing to do with what this particular run
 *  actually locked (an earlier version of this panel rendered a literal
 *  "—" for the missing half instead — found, in review, to be what almost
 *  every real session would show, since (post the taste pass, 9b9fde5, which
 *  converted AT's last remaining 2k-base refs to 6k) no seeded library
 *  workout references both bases; see `pacesLockedText`'s own doc comment).
 *  `draft` should be the caller's
 *  match-checked draft (null when missing or foreign — see LogSession's own
 *  `matchedDraft`), never a draft this run wasn't built from: `rawOff`/
 *  `nudge` from the WRONG workout's steps would silently reconstruct a
 *  meaningless number instead of a real one.
 *
 *  Manual-door note (Task 3): this function is session-door-only — the
 *  manual door has no `SessionRun`/`SessionDraft` pair to reconstruct FROM
 *  at all, and doesn't need to: its baselines are read directly (current
 *  baselines ARE the lock for an off-app row, per the task brief), so it
 *  uses the simpler `manualLockedBaseline` below instead. */
function lockedBaseline(
  base: PaceBase,
  run: SessionRun,
  draft: SessionDraft | null,
): number | null {
  if (draft === null) return null;
  for (const phase of run.phases) {
    if (phase.type !== "work" || phase.targetKind !== "split") continue;
    const step = draft.steps[phase.originalIndex];
    if (
      step === undefined ||
      step.k !== "w" ||
      isEffortRef(step.ref) ||
      step.ref.base !== base
    ) {
      continue;
    }
    const nudge = draft.nudges[phase.originalIndex] ?? 0;
    // Every split-ref work phase gets a targetSplit (domain/expand.ts's
    // "case w"); the `!` documents that guarantee, same convention as
    // logDraft.ts's own identical assertion.
    return phase.targetSplit! - step.ref.off - nudge;
  }
  return null;
}

/** F1 (whole-branch review, Task 2 fix round): renders ONLY the bases the
 *  workout's own steps actually reference — never a bare dash. The
 *  original two-slot "2K … · 6K …" layout (matching README.md §7's own
 *  literal mock) was checked against all 35 seeded starters (this repo's
 *  original starter library, later retired at Phase 6E for a generated
 *  300-workout one) and found to be unconditionally wrong in production:
 *  not one referenced both "2k" and "6k" in the same workout (16 were
 *  2k-only, 18 were 6k-only, and Microburst referenced neither at all) — so
 *  the two-slot layout would show a permanent dash for one half of every
 *  real session logged (the generated library keeps to one base per
 *  workout exclusively — the taste pass, 9b9fde5, converted AT's last
 *  remaining 2k-base refs to 6k, so zero of its 300 entries mix both;
 *  before that pass, 3 did), violating the house "never a bare dash" rule
 *  this screen's own per-step list already honors. The two-slot form still
 *  renders correctly when both bases ARE present (see the dedicated test
 *  that pins this — a synthetic fixture, since the generated library no
 *  longer has a real example). `null`
 *  (both bases absent — an all-effort workout,
 *  or a mismatched/missing draft with nothing to reconstruct) means there
 *  is nothing honest to show at all; the caller omits the whole panel
 *  rather than rendering an empty "PACES LOCKED AT" label with no value.
 *  Recorded in docs/design/DEVIATIONS.md as a departure from §7's mock.
 *  Shared by both doors: `lockedBaseline` (session door) and
 *  `manualLockedBaseline` (manual door) both funnel through this one join,
 *  so neither can drift from the other's "never a bare dash" behavior. */
function pacesLockedText(k2: number | null, k6: number | null): string | null {
  const parts: string[] = [];
  if (k2 !== null) parts.push(`2K ${fmtSplit(k2)}`);
  if (k6 !== null) parts.push(`6K ${fmtSplit(k6)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Manual door's PACES LOCKED reconstruction (Task 3 brief: "the lock
 *  moment IS save time — current baselines are the truth"). Unlike the
 *  session door's `lockedBaseline`, there is no run/draft pair to
 *  back-calculate a frozen value FROM — the rower's CURRENT `baselines` are
 *  simply read as-is. The only work left is the SAME "referenced bases
 *  only" filter `pacesLockedText`'s caller applies for the session door
 *  (F1, above): a base no step in this workout ever references has nothing
 *  honest to show, so it's omitted rather than showing a value that has
 *  nothing to do with this workout.
 *
 *  Must-fix minor (whole-branch review): this used to run the referenced-
 *  base check over `liveSteps(steps)` rather than the raw `steps` array,
 *  with a comment claiming the reps-block EXPANSION was needed because "a
 *  reference buried inside a repeated block is still a real reference even
 *  though the raw array only lists it once" — that reasoning doesn't hold
 *  for a plain existence check: a step authored inside a reps block is
 *  already present, once, in the RAW `steps` array (`liveSteps` only
 *  changes how many times it appears, repeating it `count` times), and
 *  `.some()` only cares whether at least one match exists, not how many.
 *  Expanding first was a no-op that happened to read as thorough. Reading
 *  `steps` directly is both simpler and correct. */
function manualLockedBaseline(
  base: PaceBase,
  steps: Step[],
  baselines: Baselines,
): number | null {
  const referenced = steps.some(
    (step) =>
      step.k === "w" && !isEffortRef(step.ref) && step.ref.base === base,
  );
  return referenced
    ? base === "2k"
      ? baselines.k2Seconds
      : baselines.k6Seconds
    : null;
}

/** Resolves the POST body's `workoutType` — `SessionRun` itself doesn't
 *  carry one (confirmed against run.ts's own shape, per the task brief's
 *  "UNVERIFIED — check before use"). Priority order:
 *  1. `matchedDraft.type` — the draft this run was actually built from
 *     carries `type` (draft.ts's own `SessionDraft` shape) and survives a
 *     LATER deletion of the workout from the library untouched (deleting a
 *     workout never touches localStorage), so this alone already covers
 *     "the workout may be deleted" honestly for the realistic case: a
 *     session run against a workout that still existed at start time.
 *  2. A `useWorkouts()` library lookup by `run.workoutId` — only reachable
 *     when `matchedDraft` is null (missing or foreign; see LogSession's own
 *     residual check) AND the workout is still findable. This is a genuine
 *     fallback, not the common path.
 *  3. "O2" — builderState.ts's own new-workout default, reused here as the
 *     same kind of placeholder, not a meaningful guess. Reachable only when
 *     BOTH of the above fail: no usable draft AND the workout gone from the
 *     library too (a corrupted/partial localStorage state, or a foreign
 *     draft for a since-deleted workout) — 6B's own guarantee (the draft is
 *     cleared only alongside a successful save, WorkoutDetail.tsx's own
 *     `clearRun` comment) means this shouldn't happen for a real session,
 *     but a real `WorkoutType` has to render either way (`TypeBadge`/
 *     `RecentLog.workoutType` both assume one) instead of crashing the
 *     screen that is the rower's only path to logging this session at all.
 *
 *  Session-door-only: the manual door reads `workout.type` straight off the
 *  `LibraryWorkout` it was fetched by id from (`ManualDoorLog` below) —
 *  there is no run/draft pair, and no fallback chain needed, since a
 *  missing workout is caught by ManualDoorLog's own "not in your library"
 *  guard before any of this would matter. */
function resolveWorkoutType(
  run: SessionRun,
  matchedDraft: SessionDraft | null,
  library: { id: string; type: WorkoutType }[],
): WorkoutType {
  if (matchedDraft !== null) return matchedDraft.type;
  const found =
    run.workoutId !== null
      ? library.find((w) => w.id === run.workoutId)
      : undefined;
  return found?.type ?? "O2";
}

// Shared by both doors — no closed-over state, so hoisted to module scope
// rather than redefined inside each door's own component (SessionDoorLog's
// pre-Task-3 version defined this as a local function; ManualDoorLog would
// otherwise need a byte-identical second copy).
async function postLog(body: Record<string, unknown>): Promise<Response> {
  return api("/api/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The part of the POST body that genuinely differs per door — where the
// workout identity/steps come FROM (a frozen `SessionRun` vs a fetched
// `LibraryWorkout`). `held`/`pain`/`notes` are NOT here: those are the
// shared form state `useLogForm` itself owns and merges in below.
interface LogFormFields {
  workoutId: string | null;
  workoutTitle: string;
  workoutType: WorkoutType;
  steps: LogStep[];
}

/** Fix round 1 (whole-branch review, I1): the two doors' `handleSave` were
 *  ~45 lines of verbatim-duplicated behaviour (the held/pain/notes state
 *  quintet, body assembly, and — the part that actually carries the app's
 *  rules — the `field === "workoutId"` 400-retry policy and the error
 *  string). `LogScreen` already made the two doors' MARKUP structurally
 *  unable to diverge; this hook does the same for their BEHAVIOUR: there is
 *  now exactly one copy of the retry policy, not two that a future fix to
 *  one door could silently leave the other behind.
 *
 *  Each door supplies only what genuinely differs: `submit`'s own
 *  `LogFormFields` argument (workoutId/title/type/steps — where the
 *  workout identity comes from), and `onSaved` (what happens after a
 *  genuine 201 — the session door clears the draft/run records before
 *  navigating; the manual door never touched either in the first place, so
 *  it just navigates). Both still navigate to `/today` (README.md §7:
 *  "Save session ... returns to Today", true of the Log screen as a whole,
 *  not just the session door) — that call lives in each door's own
 *  `onSaved`, not here, since navigation itself isn't part of the shared
 *  save behaviour (a future third door could plausibly want to land
 *  somewhere else).
 *
 *  Task 3 (outside-plan logging): `outsidePlan`/`setOutsidePlan` join the
 *  quintet above rather than living per-door — the toggle is door-
 *  INDEPENDENT (its copy/behaviour never differs between the session and
 *  manual doors, unlike `LogFormFields`), so hoisting it here makes it
 *  structurally impossible for the two doors' toggle behaviour to drift,
 *  the same reasoning this hook's own header comment gives for the retry
 *  policy. It must survive a failed save (a rower who toggled OFF, hit
 *  Save, and got a network error shouldn't have to re-toggle) — living
 *  alongside `held`/`pain`/`notes` (none of which reset on error either)
 *  gets that for free, with no extra code. `submit` includes `advancesPlan:
 *  false` in the POST body ONLY when the toggle is on; the default
 *  (counting toward the plan) leaves the key OFF the wire entirely, proving
 *  the common path still exercises the server's own `?? true` default
 *  rather than the client silently re-asserting it. */
function useLogForm(onSaved: () => void) {
  const [held, setHeld] = useState<HeldResult | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [outsidePlan, setOutsidePlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function submit(fields: LogFormFields) {
    // Defensive, not reachable via the UI: the Save button's own
    // `disabled={... || held === null || pain === null}` already keeps a
    // click from firing this at all (same convention as Today.tsx's own
    // `handleShuffle` guard comment).
    if (held === null || pain === null) return;
    setSaving(true);
    setSaveError(null);
    const body: Record<string, unknown> = {
      ...fields,
      held,
      pain,
      notes: notes.trim().length > 0 ? notes : null,
    };
    if (outsidePlan) body.advancesPlan = false;
    try {
      let res = await postLog(body);
      // Retry once with `workoutId: null` ONLY when the 400 is specifically
      // about workoutId (the server's own `field` name on its error body —
      // server/routes/data.ts's `badRequest`) — e.g. the workout was
      // deleted between this door's mount and the Save click. Any other
      // 400 (a real validation bug in this screen's own payload) must
      // surface as a genuine failure, not be silently papered over by
      // stripping workoutId and resubmitting. The ONE place this policy
      // lives now, for both doors.
      if (res.status === 400 && body.workoutId !== null) {
        let field: unknown;
        try {
          field = ((await res.json()) as { field?: unknown }).field;
        } catch {
          field = undefined;
        }
        if (field === "workoutId") {
          res = await postLog({ ...body, workoutId: null });
        }
      }
      if (res.ok) {
        // Only ever fires on a genuine 201 — a failed save (network error,
        // a real validation 400, a 500) leaves the caller's own records
        // intact so the rower can retry without redoing anything.
        onSaved();
        return;
      }
      setSaveError("Couldn't save this session. Try again.");
    } catch {
      setSaveError("Couldn't save this session. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return {
    held,
    setHeld,
    pain,
    setPain,
    notes,
    setNotes,
    outsidePlan,
    setOutsidePlan,
    saving,
    saveError,
    submit,
  };
}

/** LogSession: the Log screen's TWO doors (Phase 6C spec, "Doors" decision;
 *  Task 3 brief) — `/session/log` (the session door: a just-completed timer
 *  run) and `/library/:id/log` (the manual door: an off-app row logged
 *  straight from a workout's detail screen). Distinguished purely by
 *  whether a route `:id` param is present — react-router only ever matches
 *  one of these two routes for a given URL (AppRoutes.tsx), so `id`'s
 *  presence IS the door, not a heuristic. Each door is its own component
 *  below (`SessionDoorLog`/`ManualDoorLog`) rather than one component
 *  branching internally: the two read entirely different hooks
 *  (draft/run's `useState(loadX)` lazy-init pair vs `useWorkouts`/
 *  `useBaselines`), and conditionally skipping hooks inside one function
 *  body would violate their fixed call order — same reason
 *  `WorkoutDetail.tsx` splits into `WorkoutDetail`/`WorkoutDetailView`. */
export default function LogSession() {
  const { id } = useParams();
  return id !== undefined ? (
    <ManualDoorLog workoutId={id} />
  ) : (
    <SessionDoorLog />
  );
}

/** The session door's screen chrome, shared verbatim by both doors — the
 *  ONLY difference between them once their data is resolved is whether
 *  there's a Discard button at all (the manual door has nothing staged to
 *  discard — brief: "no Discard button (nothing to discard)"), passed in as
 *  `discardSlot` rather than branched on internally. Keeping this single
 *  copy is what makes it structurally impossible for the two doors to
 *  silently diverge on layout, the same reasoning `logDraft.ts`'s own
 *  `refPaceLabel` helper documents for why both doors' step labels share
 *  one function.
 *
 *  `backFallback` (whole-branch review, IMP-2 fix): a `BackLink`, the same
 *  idiom every other full-screen destination in the app uses
 *  (`WorkoutDetail.tsx`/`Builder.tsx`/`EditWorkout.tsx`), leading. Before
 *  this fix neither door had a non-destructive way to leave this screen at
 *  all whenever the tab bar is hidden (the session door: Save or a
 *  destructive staged Discard were the ONLY two exits; the manual door's
 *  other early-return states already had one, but not this — its main,
 *  ready-to-save state) — a rower who opened this screen and changed their
 *  mind about logging anything had no honest way back. `BackLink` costs
 *  nothing destructive: it navigates away without touching the draft/run
 *  records or posting anything, same as simply not pressing Save ever did,
 *  it just gives that inaction a real affordance. Each door passes its own
 *  fallback (`BackLink`'s own default, `/library`, makes no sense for the
 *  session door — nothing session-related lives there): the manual door
 *  passes none (its `from` state, now forwarded by `WorkoutDetail.tsx`'s
 *  "Log it after" link, resolves to the workout it came from; `/library` is
 *  still the right fallback for a from-less deep link); the session door
 *  passes `/today`, since neither of ITS own entry points
 *  (`SessionComplete.tsx`'s "Log this session", `Today.tsx`'s own "Log it"
 *  unlogged-session line) carries a `from` today, and `/today` is where a
 *  rower abandoning this screen without logging or discarding actually
 *  wants to land. */
function LogScreen({
  title,
  workoutType,
  dateLabel,
  totalMinutes,
  pacesText,
  logSteps,
  expectedPain,
  held,
  onHeld,
  pain,
  onPain,
  notes,
  onNotes,
  plan,
  outsidePlan,
  onToggleOutsidePlan,
  saving,
  saveError,
  onSave,
  discardSlot,
  backFallback,
}: {
  title: string;
  workoutType: WorkoutType;
  dateLabel: string;
  totalMinutes: number;
  pacesText: string | null;
  logSteps: LogStep[];
  expectedPain: number | null;
  held: HeldResult | null;
  onHeld: (value: HeldResult) => void;
  pain: number | null;
  onPain: (value: number) => void;
  notes: string;
  onNotes: (value: string) => void;
  // Task 3: null means "nothing to render" — either there's no active plan
  // (`plan.planKey === null`) or the plan hook itself errored (logging must
  // never be hostage to the plan fetch — see each door's own comment on
  // this). A non-null value means the toggle row renders.
  plan: PlanData | null;
  outsidePlan: boolean;
  onToggleOutsidePlan: () => void;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  discardSlot: ReactNode;
  backFallback?: string;
}) {
  return (
    <main className="screen">
      <BackLink fallback={backFallback} />
      <h1 className="screen-title">Log {title}</h1>
      <div className="log-meta">
        <TypeBadge type={workoutType} />
        <span className="mono-status">
          {dateLabel} · {totalMinutes} MIN
        </span>
      </div>

      {pacesText !== null && (
        <div className="log-paces-panel">
          <span className="log-paces-label">PACES LOCKED AT</span>
          <span className="log-paces-value">{pacesText}</span>
        </div>
      )}

      <ul className="log-step-list">
        {logSteps.map((step, i) => (
          <li key={i} className="log-step-row">
            <span className="log-step-label">{step.label}</span>
            <span className="log-step-values">
              <span className="log-step-target">
                {step.targetSplit !== undefined
                  ? fmtSplit(step.targetSplit)
                  : "—"}
              </span>
              {/* An "assumed" actual is definitionally identical to the
                  target (logDraft.ts's own rule: a completed time phase is
                  read as "held the target") — showing it a second time here
                  would just repeat the number above with no new
                  information. Only a REAL stopwatch reading (which can
                  genuinely differ from the target) earns its own line. The
                  manual door's actuals are ALWAYS "assumed" (buildManualLog
                  Steps' own rule), so this line never renders there. */}
              {step.actualSource === "stopwatch" &&
                step.actualSplit !== undefined && (
                  <span className="log-step-actual">
                    ACTUAL {fmtSplit(step.actualSplit)}
                  </span>
                )}
            </span>
          </li>
        ))}
      </ul>

      <div className="classification-group">
        <p className="classification-group-label">DID YOU HOLD THE TARGETS?</p>
        <div className="classification-chip-row">
          {HELD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="log-held-chip"
              aria-pressed={held === opt.value}
              onClick={() => onHeld(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="classification-group">
        <div className="classification-pain-label-row">
          <p className="classification-group-label">PAIN RATING</p>
          {expectedPain !== null && (
            <p className="classification-pain-word">
              EXPECTED {expectedPain}/5
            </p>
          )}
        </div>
        <div className="classification-chip-row">
          {PAIN_LEVELS.map((level) => {
            const selected = pain === level;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={selected}
                aria-label={`Pain ${level}`}
                className="classification-chip classification-chip-pain"
                style={
                  selected
                    ? {
                        background: `var(${PAIN_RAMP_VAR[level]})`,
                        borderColor: `var(${PAIN_RAMP_VAR[level]})`,
                        color: "var(--on-color)",
                      }
                    : undefined
                }
                onClick={() => onPain(level)}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      <label className="classification-group-label" htmlFor="log-notes">
        NOTES
      </label>
      <textarea
        id="log-notes"
        className="log-notes-textarea"
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
      />

      {plan !== null && (
        <button
          type="button"
          className="log-plan-toggle"
          aria-pressed={outsidePlan}
          onClick={onToggleOutsidePlan}
        >
          {outsidePlan
            ? "OUTSIDE THE PLAN · won't advance"
            : `COUNTS TOWARD PLAN · SESSION ${plan.doneN + 1} OF ${plan.sequence.length}`}
        </button>
      )}

      <div className="log-actions">
        {saveError && <p className="field-error">{saveError}</p>}
        <button
          type="button"
          className="button-primary log-save"
          onClick={() => void onSave()}
          disabled={saving || held === null || pain === null}
        >
          Save session
        </button>
        {discardSlot}
      </div>
      <MonitorLogRow />
    </main>
  );
}

/** The wire log's one UI door (7B iteration, 2026-08-08 — James: "1 but I
 *  want it to not disrupt the product experience"). A connected session's
 *  teardown stashes its full trace in sessionStorage
 *  (`useMonitorSession.ts`); the ended hand-off frame navigates HERE
 *  before the diagnostics sheet can be reached, so this screen is where
 *  the operator has always wanted the log and never had it. Deliberately
 *  whisper-quiet: absent entirely unless a rowed stash exists in this
 *  tab, one mono caption line below the actions, no layout the manual
 *  path ever sees. */
function MonitorLogRow() {
  const [stash] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("ergomatic:last-rowed-log");
    } catch {
      return null;
    }
  });
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  if (stash === null) return null;
  return (
    <button
      type="button"
      className="log-monitor-diag"
      onClick={() => {
        void navigator.clipboard
          .writeText(stash)
          .then(() => setCopied("copied"))
          .catch(() => setCopied("failed"));
      }}
    >
      {copied === "idle"
        ? "MONITOR LOG · COPY"
        : copied === "copied"
          ? "MONITOR LOG · COPIED"
          : "MONITOR LOG · COPY FAILED"}
    </button>
  );
}

/** The session door (README.md §7, `/session/log`) — the timer's hand-off
 *  from `/session/complete`, and Today's own unlogged line. Reads
 *  `run`/`draft` once at mount (lazy initializers, same idiom as every
 *  other session screen — Timer.tsx's own comment on this).
 *
 *  Ledger residual (Task 1's own progress.md, routed here): `buildLogSteps`'
 *  mismatch detection only catches a wrong-KIND step at a given
 *  `originalIndex`, not a same-shape draft for an entirely different
 *  workout — belt-and-braces, this compares `run.workoutId ===
 *  draft.workoutId` before trusting the draft for ANYTHING (step labels,
 *  the PACES LOCKED reconstruction, AND the workoutType fallback all share
 *  this one `matchedDraft` value): a foreign draft's `ref`/`nudges`/`type`
 *  would silently mislabel every one of those otherwise. A mismatch passes
 *  `null` through, engaging each function's own documented fallback. */
function SessionDoorLog() {
  const navigate = useNavigate();
  const [draft] = useState<SessionDraft | null>(() => loadDraft());
  const [run] = useState<SessionRun | null>(() => loadRun());
  const workoutsState = useWorkouts();
  const planState = usePlan();

  // Only ever clears the draft/run records on a genuine 201 (`onSaved`
  // fires after that, never on a failed save) — a network error, a real
  // validation 400, or a 500 leaves both intact so the rower can retry
  // without having to redo the session.
  const {
    held,
    setHeld,
    pain,
    setPain,
    notes,
    setNotes,
    outsidePlan,
    setOutsidePlan,
    saving,
    saveError,
    submit,
  } = useLogForm(() => {
    clearDraft();
    clearRun();
    navigate("/today");
  });
  // Task 3 (ui-fix round): the two-button `.baseline-confirm` side panel
  // this discard used to open is gone — replaced by the shared
  // `useStagedDiscard` machine and the level system's own in-place L4/
  // L4-armed idiom (WorkoutDetail.tsx's Delete workout, SessionComplete.tsx's
  // own new Discard), so all three of the app's staged-discard controls now
  // share one look AND one implementation. Behaviour is unchanged: still a
  // two-tap confirm, still clears both records with no POST, still lands on
  // /today.
  const discard = useStagedDiscard();

  // No run record, or a run that isn't actually complete yet (a direct/deep
  // nav here mid-session) — same guard SessionComplete.tsx's own screen
  // uses (`isComplete`, not a bare `completedAt` check). Deliberately does
  // NOT also require `draft !== null`: a missing/foreign draft degrades
  // (fallback labels, a dashed PACES LOCKED panel) rather than blocking the
  // rower's only path to logging a real, completed session.
  if (run === null || !isComplete(run)) {
    return <Navigate to="/today" replace />;
  }

  const matchedDraft =
    draft !== null && draft.workoutId === run.workoutId ? draft : null;

  // Must-fix minor (whole-branch review): `resolveWorkoutType`'s fallback
  // chain only needs a library lookup when there's no matched draft to read
  // `type` from directly (see its own doc comment's numbered priority
  // list) — while `useWorkouts()` is still loading, `library` below reads
  // as `[]` regardless of what's actually in it, so a Save pressed in that
  // window would silently post the "O2" placeholder as this session's real
  // type. Gated ONLY on that combination (no matched draft AND still
  // loading): a matched draft already has an authoritative type with
  // nothing to wait for, so this never flashes a loading screen in the
  // common case where nothing is actually unresolved.
  //
  // Fix round 2 (whole-branch review, M1/M2): `planState` no longer joins
  // this gate at all — a STALLED (not merely slow) `/api/plan` request (`
  // api()` is a bare `fetch` with no `AbortSignal.timeout`, and `usePlan`
  // only ever leaves `loading` on resolve or reject) used to park this
  // door at LOADING… forever: no Retry, no BackLink, no tab bar — the
  // exact "logging held hostage to the plan fetch" failure this door's own
  // comments elsewhere claim can't happen. `plan` (below) already reads as
  // null while `planState` is loading, the identical value it takes for a
  // genuine no-plan or plan-error state, so the toggle simply appears once
  // (and only once) the fetch resolves with an active plan — the form
  // itself never waits on it.
  if (matchedDraft === null && workoutsState.state === "loading") {
    return (
      <main className="screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  // Task 3 (fix round 2, M1/M2): null means "render the form with no
  // toggle at all" — no active plan (`planKey === null`, the ordinary
  // freestyle case), the plan hook errored, OR the plan fetch simply
  // hasn't resolved yet. All three are deliberate: a rower whose plan
  // fetch failed, or hasn't returned yet, can still log their session
  // normally, just without the option to opt it out of a plan whose own
  // state this screen couldn't yet confirm.
  const plan: PlanData | null =
    planState.state === "ready" && planState.plan.planKey !== null
      ? planState.plan
      : null;

  const library = workoutsState.state === "ready" ? workoutsState.workouts : [];
  const libraryWorkout =
    run.workoutId !== null
      ? library.find((w) => w.id === run.workoutId)
      : undefined;

  const workoutType = resolveWorkoutType(run, matchedDraft, library);
  const expectedPain = libraryWorkout?.pain ?? null;
  const logSteps = buildLogSteps(run, matchedDraft);
  const { dateLabel, totalMinutes } = logTotals(run);
  const k2 = lockedBaseline("2k", run, matchedDraft);
  const k6 = lockedBaseline("6k", run, matchedDraft);
  const pacesText = pacesLockedText(k2, k6);
  // TS narrowing from the `run === null` guard above doesn't survive into a
  // function DECLARED later in this component (the arrow function passed
  // to `submit`, below) — a separately-typed `const` alias is the standard
  // fix, not a non-null assertion at each use site.
  const activeRun: SessionRun = run;

  // Fix round 1 (I1): the body-assembly and 400-retry logic that used to
  // live in this door's own `handleSave` now lives once, in `useLogForm`'s
  // `submit` above — this is only what genuinely differs for this door:
  // WHERE the workout identity/steps come from (the frozen `SessionRun`).
  function handleSave() {
    return submit({
      workoutId: activeRun.workoutId,
      workoutTitle: activeRun.title,
      workoutType,
      steps: logSteps,
    });
  }

  // Same two-tap shape as WorkoutDetail.tsx's OwnerActions `handleClick` and
  // SessionComplete.tsx's own new `handleDiscardClick`: the first press
  // arms, the second (only reachable while `armed`) fires the shared
  // discard and navigates.
  function handleDiscardClick() {
    if (discard.armed) {
      discard.fire();
      navigate("/today");
    } else {
      discard.arm();
    }
  }

  return (
    <LogScreen
      title={run.title}
      workoutType={workoutType}
      dateLabel={dateLabel}
      totalMinutes={totalMinutes}
      pacesText={pacesText}
      logSteps={logSteps}
      expectedPain={expectedPain}
      held={held}
      onHeld={setHeld}
      pain={pain}
      onPain={setPain}
      notes={notes}
      onNotes={setNotes}
      plan={plan}
      outsidePlan={outsidePlan}
      onToggleOutsidePlan={() => setOutsidePlan((v) => !v)}
      saving={saving}
      saveError={saveError}
      onSave={handleSave}
      backFallback="/today"
      discardSlot={
        <button
          type="button"
          className={discard.armed ? "button-l4-armed" : "button-l4"}
          onClick={handleDiscardClick}
          onBlur={discard.disarm}
        >
          {discard.armed ? "Tap again to discard" : "Discard without logging"}
        </button>
      }
    />
  );
}

/** The manual door (Task 3 brief, `/library/:id/log`) — logging an off-app
 *  row straight from a workout's own detail screen ("Log it after"). Reads
 *  the workout fresh by `workoutId` (the route's own `:id` param) via
 *  `useWorkouts`/`useBaselines`, the SAME two hooks `WorkoutDetail.tsx`
 *  itself reads to decide whether to even show this door's link — a
 *  baselines-missing deep link (bookmarked, or reached before the gating
 *  link would have blocked it) still can't be resolved into real splits, so
 *  it degrades to the same "no target / Set baselines" recovery idiom
 *  rather than crashing on `buildManualLogSteps`' non-nullable `Baselines`
 *  contract.
 *
 *  Hard constraint (the brief's own words): "must NOT touch the draft/run
 *  records — an in-progress session elsewhere survives logging an off-app
 *  row." This component never imports `./draft` or `./run` at all — there
 *  is nothing here that COULD touch either, by construction, not by
 *  discipline. */
function ManualDoorLog({ workoutId }: { workoutId: string }) {
  const navigate = useNavigate();
  const workoutsState = useWorkouts();
  const baselinesState = useBaselines();
  const planState = usePlan();

  // This door never read the draft/run records in the first place (the
  // hard constraint below), so `onSaved` here is just the navigation —
  // unlike the session door's `onSaved`, there is nothing to clear.
  //
  // Must-fix minor (whole-branch review): a browser BACK press after a
  // successful save used to leave this exact route mounted fresh again
  // (React Router simply re-renders whatever route a popped history entry
  // points at), with an untouched, still-fillable form — a second Save
  // click would POST a genuine duplicate log and advance `doneN` a second
  // time for one real session. The session door doesn't need a guard of
  // its own: a successful save clears the draft/run records, so revisiting
  // `/session/log` afterward hits the `run === null` redirect above instead
  // of a re-fillable form. This door has no records to clear (the hard
  // constraint above), so it needs its OWN guard — `replace: true` swaps
  // OUT this history entry for `/today` instead of pushing a new one on
  // top, so a subsequent BACK skips straight past this route entirely
  // (landing on whatever came before it, e.g. the workout's detail screen)
  // rather than re-mounting this form.
  const {
    held,
    setHeld,
    pain,
    setPain,
    notes,
    setNotes,
    outsidePlan,
    setOutsidePlan,
    saving,
    saveError,
    submit,
  } = useLogForm(() => navigate("/today", { replace: true }));

  // Fix round 2 (whole-branch review, M1/M2): `planState` no longer joins
  // this gate either. It used to run BEFORE the workouts/baselines error
  // branches just below, so a merely-slow plan fetch hid a genuine
  // library/baselines load failure behind LOADING…; a STALLED plan fetch
  // (no `AbortSignal.timeout` on `api()`) hid it forever, with no Retry
  // reachable at all. `plan` (below) reads as null while `planState` is
  // loading — same value as a genuine no-plan or plan-error state — so the
  // toggle just appears once the plan resolves with an active plan.
  if (workoutsState.state === "loading" || baselinesState.state === "loading") {
    return (
      <main className="screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (workoutsState.state === "error") {
    return (
      <main className="screen">
        <p className="mono-status">Couldn't load your library.</p>
        <button
          type="button"
          className="button-outline"
          onClick={workoutsState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  if (baselinesState.state === "error") {
    return (
      <main className="screen">
        <p className="mono-status">Couldn't load your baselines.</p>
        <button
          type="button"
          className="button-outline"
          onClick={baselinesState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  // Task 3 (fix round 2, M1/M2): same derivation as the session door's own
  // `plan` — null means "no toggle" for a no-active-plan state, a
  // plan-hook error, OR the plan fetch still being in flight, none of
  // which gate this door's form (logging must never be hostage to the
  // plan fetch).
  const plan: PlanData | null =
    planState.state === "ready" && planState.plan.planKey !== null
      ? planState.plan
      : null;

  const workout = workoutsState.workouts.find((w) => w.id === workoutId);
  if (!workout) {
    return (
      <main className="screen">
        <p className="mono-status">That workout isn't in your library.</p>
        <BackLink />
      </main>
    );
  }

  // Same "partial baseline pair reads as unset" convention as
  // WorkoutDetail.tsx/Library.tsx. WorkoutDetail's own gating link means a
  // real rower can't normally reach this state, but a stale bookmark or a
  // baseline cleared in another tab between load and click still can — a
  // concrete `Baselines` is required from here on (`buildManualLogSteps`'
  // own non-nullable contract), so this degrades honestly instead of
  // crashing or fabricating a number.
  const baselines: Baselines | null =
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  if (baselines === null) {
    return (
      <main className="screen">
        <BackLink />
        <h1 className="screen-title">Log {workout.title}</h1>
        <span className="step-row-no-target">
          <em>no target</em> <Link to="/you">Set baselines</Link>
        </span>
      </main>
    );
  }

  const logSteps = buildManualLogSteps(workout, baselines);
  // Header date = today (the brief's own words) — there's no `SessionRun.
  // completedAt` to read it from, unlike the session door's `logTotals`;
  // `estimateMinutes` (the same helper WorkoutDetail.tsx's own preview
  // already calls) stands in for the session door's real wall-clock total,
  // since an off-app row was never timed by this app at all.
  const dateLabel = formatLogDate(new Date().toISOString());
  const totalMinutes = estimateMinutes(workout.steps, baselines).minutes;
  const k2 = manualLockedBaseline("2k", workout.steps, baselines);
  const k6 = manualLockedBaseline("6k", workout.steps, baselines);
  const pacesText = pacesLockedText(k2, k6);
  // TS narrowing from the `!workout` guard above doesn't survive into a
  // function DECLARED later in this component (the arrow function passed
  // to `submit`, below) — the same separately-typed `const` alias fix the
  // session door's own `activeRun` uses, not a non-null assertion at each
  // use site.
  const activeWorkout: LibraryWorkout = workout;

  // Fix round 1 (I1): same shared `submit` the session door now calls —
  // this is only what genuinely differs for this door: `workoutId` is
  // OWNED here (a real route param, not a possibly-stale run record), and
  // there is no `clearDraft`/`clearRun` in this door's own `onSaved` at all
  // (wired above), since this door never touched either to begin with.
  function handleSave() {
    return submit({
      workoutId: activeWorkout.id,
      workoutTitle: activeWorkout.title,
      workoutType: activeWorkout.type,
      steps: logSteps,
    });
  }

  return (
    <LogScreen
      title={workout.title}
      workoutType={workout.type}
      dateLabel={dateLabel}
      totalMinutes={totalMinutes}
      pacesText={pacesText}
      logSteps={logSteps}
      expectedPain={workout.pain}
      held={held}
      onHeld={setHeld}
      pain={pain}
      onPain={setPain}
      notes={notes}
      onNotes={setNotes}
      plan={plan}
      outsidePlan={outsidePlan}
      onToggleOutsidePlan={() => setOutsidePlan((v) => !v)}
      saving={saving}
      saveError={saveError}
      onSave={() => void handleSave()}
      // Nothing to discard (the brief's own words) — there's no staged
      // Discard slot at all for this door, unlike the session door's.
      discardSlot={null}
    />
  );
}
