import type { BuilderForm } from "./builderState.js";

/** localStorage key for the builder draft — one slot, same discipline as
 *  session/draft.ts's DRAFT_KEY. Exported so tests never hardcode it. */
export const BUILDER_DRAFT_KEY = "ergomatic.builderDraft";

/** The persisted draft. `baseline` is the pristine form the draft diverged
 *  from (newForm() in new mode, fromWorkout(w) in edit mode), stored so a
 *  restore can detect staleness: if the CURRENT pristine form no longer
 *  fingerprints equal to `baseline`, the workout changed elsewhere and the
 *  draft is dropped, never merged. */
export interface BuilderDraft {
  v: 1;
  mode: { kind: "new" } | { kind: "edit"; workoutId: string };
  form: BuilderForm;
  baseline: BuilderForm;
  savedAt: string;
}

/** Equality for forms MINUS row identity. Row ids come from a module-local
 *  session counter (builderState.ts's nextRowId) and differ between any two
 *  calls of newForm()/fromWorkout(), so raw JSON equality never holds across
 *  mounts — every comparison in this feature goes through this fingerprint.
 *  Field order is fixed by construction here (explicit arrays), so object
 *  key insertion order can never perturb it. The companion test iterates a
 *  real row's own keys, so a future BuilderRow field this list forgets
 *  fails that test the day the field is added. */
export function formFingerprint(f: BuilderForm): string {
  return JSON.stringify([
    f.title,
    f.type,
    f.difficulty,
    f.pain,
    f.reps,
    f.rows.map((r) => [
      r.kind,
      r.durValue,
      r.durUnit,
      r.refBase,
      r.refOff,
      r.refEffort,
      r.spm,
      r.rest,
    ]),
  ]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Loose on purpose, like session/draft.ts's isSessionDraft: enough shape to
// not crash Builder's render, not full domain validation. Every field the
// restore path reads unconditionally is checked.
function isBuilderForm(value: unknown): value is BuilderForm {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.title === "string" &&
    typeof value.type === "string" &&
    typeof value.difficulty === "string" &&
    Array.isArray(value.rows) &&
    value.rows.every(
      (r: unknown) => isPlainRecord(r) && typeof r.id === "string",
    ) &&
    typeof value.reps === "number"
  );
}

function isBuilderDraft(value: unknown): value is BuilderDraft {
  if (!isPlainRecord(value) || value.v !== 1) return false;
  const mode = value.mode;
  if (!isPlainRecord(mode)) return false;
  const modeOk =
    mode.kind === "new" ||
    (mode.kind === "edit" && typeof mode.workoutId === "string");
  return modeOk && isBuilderForm(value.form) && isBuilderForm(value.baseline);
}

/** Persists the draft. localStorage can throw (quota, private-mode Safari);
 *  callers get a boolean, never an exception. */
export function saveBuilderDraft(d: BuilderDraft): boolean {
  try {
    localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function loadBuilderDraft(): BuilderDraft | null {
  try {
    const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isBuilderDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearBuilderDraft(): void {
  try {
    localStorage.removeItem(BUILDER_DRAFT_KEY);
  } catch {
    // removal failing (disabled storage) leaves nothing actionable
  }
}
