import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useWorkouts } from "../api/useWorkouts";
import type { HeldResult } from "../api/useRecentLogs";
import { fmtSplit } from "../../domain/format.js";
import { isEffortRef } from "../../domain/pace.js";
import type { PaceBase, WorkoutType } from "../../domain/types.js";
import { clearDraft, loadDraft, type SessionDraft } from "./draft";
import { isComplete } from "./engine";
import { buildLogSteps, logTotals } from "./logDraft";
import { clearRun, loadRun, type SessionRun } from "./run";
import TypeBadge from "../components/TypeBadge";

const HELD_OPTIONS: { value: HeldResult; label: string }[] = [
  { value: "held", label: "HELD" },
  { value: "under", label: "UNDER" },
  { value: "over", label: "OVER" },
];

const PAIN_LEVELS = [1, 2, 3, 4, 5] as const;

// Duplicated from ClassificationCard.tsx's own `PAIN_RAMP_VAR`, matching
// this repo's established convention of keeping this tiny 5-entry map local
// to each file that needs it rather than importing it (ClassificationCard's
// own header comment on this: "Kept local ... matching the existing
// duplication convention"). The task brief calls for the Log screen's own
// pain picker to follow ClassificationCard's numeral-cell pattern, which
// this reuses down to the exact CSS classes (`.classification-*`) — only
// this color map is re-declared, the same way every other file that paints
// a pain ramp does.
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
 *  technique `logDraft.ts`'s own `buildLogSteps`/F1b review already
 *  established for step labels. Every phase referencing the same base
 *  within one run was built against the identical (per-run, frozen)
 *  baseline value, so the FIRST match is sufficient.
 *
 *  A workout with no step referencing a given base at all (e.g. built
 *  entirely from "6k" steps, or a Microburst-style all-effort workout with
 *  no split-ref step whatsoever) has nothing to reconstruct — this returns
 *  null and the panel renders "—" rather than fabricating a number from the
 *  rower's current baseline, which would have nothing to do with what this
 *  particular run actually locked. `draft` should be the caller's
 *  match-checked draft (null when missing or foreign — see LogSession's own
 *  `matchedDraft`), never a draft this run wasn't built from: `rawOff`/
 *  `nudge` from the WRONG workout's steps would silently reconstruct a
 *  meaningless number instead of a real one. */
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
 *     screen that is the rower's only path to logging this session at all. */
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

/** LogSession: the session door (README.md §7, `/session/log`) — the
 *  timer's hand-off from `/session/complete`, and Today's own unlogged
 *  line. Reads `run`/`draft` once at mount (lazy initializers, same idiom
 *  as every other session screen — Timer.tsx's own comment on this).
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
export default function LogSession() {
  const navigate = useNavigate();
  const [draft] = useState<SessionDraft | null>(() => loadDraft());
  const [run] = useState<SessionRun | null>(() => loadRun());
  const workoutsState = useWorkouts();

  const [held, setHeld] = useState<HeldResult | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

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
  // TS narrowing from the `run === null` guard above doesn't survive into a
  // function DECLARED later in this component (handleSave, below) — a
  // separately-typed `const` alias is the standard fix, not a non-null
  // assertion at each use site.
  const activeRun: SessionRun = run;

  async function postLog(body: Record<string, unknown>): Promise<Response> {
    return api("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function handleSave() {
    // Defensive, not reachable via the UI: the Save button's own
    // `disabled={... || held === null || pain === null}` already keeps a
    // click from firing this at all (same convention as Today.tsx's own
    // `handleShuffle` guard comment).
    if (held === null || pain === null) return;
    setSaving(true);
    setSaveError(null);
    const body: Record<string, unknown> = {
      workoutId: activeRun.workoutId,
      workoutTitle: activeRun.title,
      workoutType,
      held,
      pain,
      notes: notes.trim().length > 0 ? notes : null,
      steps: logSteps,
    };
    try {
      let res = await postLog(body);
      // Retry once with `workoutId: null` ONLY when the 400 is specifically
      // about workoutId (the server's own `field` name on its error body —
      // server/routes/data.ts's `badRequest`) — e.g. the workout was
      // deleted between session start and save. Any other 400 (a real
      // validation bug in this screen's own payload) must surface as a
      // genuine failure, not be silently papered over by stripping
      // workoutId and resubmitting.
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
        // Only ever clears on a genuine 201 — a failed save (network error,
        // a real validation 400, a 500) leaves both records intact so the
        // rower can retry without having to redo the session.
        clearDraft();
        clearRun();
        navigate("/today");
        return;
      }
      setSaveError("Couldn't save this session. Try again.");
    } catch {
      setSaveError("Couldn't save this session. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    clearDraft();
    clearRun();
    navigate("/today");
  }

  return (
    <main className="screen">
      <h1 className="screen-title">Log {run.title}</h1>
      <div className="log-meta">
        <TypeBadge type={workoutType} />
        <span className="mono-status">
          {dateLabel} · {totalMinutes} MIN
        </span>
      </div>

      <div className="log-paces-panel">
        <span className="log-paces-label">PACES LOCKED AT</span>
        <span className="log-paces-value">
          2K {k2 !== null ? fmtSplit(k2) : "—"} · 6K{" "}
          {k6 !== null ? fmtSplit(k6) : "—"}
        </span>
      </div>

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
                  genuinely differ from the target) earns its own line. */}
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
              onClick={() => setHeld(opt.value)}
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
                onClick={() => setPain(level)}
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
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="log-actions">
        {saveError && <p className="field-error">{saveError}</p>}
        <button
          type="button"
          className="button-primary log-save"
          onClick={() => void handleSave()}
          disabled={saving || held === null || pain === null}
        >
          Save session
        </button>
        {!confirmingDiscard ? (
          <button
            type="button"
            className="button-outline"
            onClick={() => setConfirmingDiscard(true)}
          >
            Discard without logging
          </button>
        ) : (
          // Staged-confirm idiom (src/you/BaselineEditor.tsx, also
          // WorkoutDetail.tsx's OwnerActions delete flow): the destructive
          // action never fires on the first press. Reuses `.baseline-*`
          // classes verbatim, same as every other staged confirm in the app.
          <div className="baseline-confirm">
            <p className="baseline-confirm-line">
              Discard this session without logging it? This can&rsquo;t be
              undone.
            </p>
            <div className="baseline-actions">
              <button
                type="button"
                className="button-outline"
                onClick={() => setConfirmingDiscard(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={handleDiscard}
              >
                Discard session
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
