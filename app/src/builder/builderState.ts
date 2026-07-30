import { resolveSplit } from "../../domain/pace.js";
import type {
  Baselines,
  Difficulty,
  PaceBase,
  PaceRef,
  Step,
  WorkDuration,
  WorkoutType,
} from "../../domain/types.js";

export type RowKind = "wu" | "w" | "r";

export interface BuilderRow {
  id: string;
  kind: RowKind;
  durValue: string;
  durUnit: "min" | "m";
  refBase: PaceBase;
  refOff: number;
  spm: string;
  rest: string;
}

export interface BuilderForm {
  title: string;
  type: WorkoutType;
  difficulty: Difficulty;
  pain: number | null;
  rows: BuilderRow[];
  reps: number;
}

// Row kinds that sit OUTSIDE the derived repeat span (see `spanStartIndex`).
// The 35 starter workouts all open with a stored `wu` step, so opening one
// in the builder must not start repeating its warm-up. Adding a cooldown
// later is one entry here plus a domain kind — nothing else about the span
// logic needs to change.
export const BOOKEND_ROW_KINDS: readonly RowKind[] = ["wu"];

// Deterministic, reproducible row ids. No Math.random()/Date.now() — this
// module-local counter never resets, so ids stay unique across the whole
// session even as forms are copied and edited.
let rowCounter = 0;
function nextRowId(): string {
  rowCounter += 1;
  return `r${rowCounter}`;
}

export function newRow(kind: RowKind): BuilderRow {
  return {
    id: nextRowId(),
    kind,
    durValue: "",
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    spm: "",
    rest: "",
  };
}

/** Builds a fresh, independent blank form. Prefer this over `EMPTY_FORM`
 *  whenever a caller needs a form it may go on to edit in place (e.g. a
 *  future field-editor screen) — `newForm()` never shares row objects with
 *  any other form, including previous calls to `newForm()` itself. */
export function newForm(): BuilderForm {
  return {
    title: "",
    type: "O2",
    difficulty: "easy",
    pain: null,
    rows: [newRow("w")],
    reps: 1,
  };
}

// EMPTY_FORM is a shared module-level constant, so it's deep-frozen: without
// this, `addRow`/`removeRow`'s shallow copies leave every form derived from
// EMPTY_FORM pointing at the very same row object, and a future in-place
// edit (`row.durValue = …`) would silently corrupt that shared row for every
// other form in the session. Freezing turns that into a loud TypeError
// instead of silent corruption. Callers that need a form they intend to
// mutate should use `newForm()` instead.
function deepFreezeForm(f: BuilderForm): BuilderForm {
  f.rows.forEach((r) => Object.freeze(r));
  Object.freeze(f.rows);
  return Object.freeze(f);
}

export const EMPTY_FORM: BuilderForm = deepFreezeForm(newForm());

export function addRow(f: BuilderForm, kind: RowKind): BuilderForm {
  return { ...f, rows: [...f.rows, newRow(kind)] };
}

export function removeRow(f: BuilderForm, id: string): BuilderForm {
  return { ...f, rows: f.rows.filter((r) => r.id !== id) };
}

/** Index of the first row NOT in `BOOKEND_ROW_KINDS` — where the derived
 *  repeat span begins. Everything before this index (a run of bookend rows,
 *  e.g. a leading `wu`) sits outside the repeat; everything from here to the
 *  end of `f.rows` repeats. Returns `f.rows.length` when every row is a
 *  bookend (or there are no rows), meaning there's nothing to repeat. */
export function spanStartIndex(f: BuilderForm): number {
  const index = f.rows.findIndex((r) => !BOOKEND_ROW_KINDS.includes(r.kind));
  return index === -1 ? f.rows.length : index;
}

/** Deep-copies every field of the row named `id` and inserts the copy
 *  immediately after the original, with a fresh id. Returns `f` unchanged
 *  if `id` isn't found (defensive — every real caller passes an id it just
 *  read off `f.rows`). */
export function cloneRow(f: BuilderForm, id: string): BuilderForm {
  const index = f.rows.findIndex((r) => r.id === id);
  if (index === -1) return f;

  const clone: BuilderRow = { ...f.rows[index]!, id: nextRowId() };
  const rows = [...f.rows];
  rows.splice(index + 1, 0, clone);
  return { ...f, rows };
}

export function setReps(f: BuilderForm, reps: number): BuilderForm {
  return { ...f, reps: Math.min(12, Math.max(1, reps)) };
}

/** Same grammar as `domain/bulk.ts`'s (unexported) `parseDuration`: a bare
 *  number is minutes, `10'` is also minutes (decimals allowed on both),
 *  `2500m` is meters (integers only). The bare-number regex is byte-identical
 *  to bulk.ts's — typing a duration in the builder and pasting the same text
 *  into a bulk-import block must never disagree on what it means. Kept in
 *  lockstep by hand since it isn't exported.
 *
 *  Only the `rest` field still uses this grammar (a single free-text field
 *  with an optional apostrophe). A row's own duration is now the structured
 *  `durValue`/`durUnit` pair — see `rowDurationNumber` below — with no
 *  grammar to parse at all. */
export function parseDurationInput(text: string): WorkDuration | null {
  const trimmed = text.trim();
  const bare = /^(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (bare) return { kind: "time", minutes: Number(bare[1]) };
  const time = /^(\d+(?:\.\d+)?)'$/.exec(trimmed);
  if (time) return { kind: "time", minutes: Number(time[1]) };
  const distance = /^(\d+)m$/.exec(trimmed);
  if (distance) return { kind: "distance", meters: Number(distance[1]) };
  return null;
}

// Bounds mirrored exactly from app/domain/validate.ts. Kept local (rather
// than calling validateSteps) because that helper's errors are keyed by
// step index, which can't be mapped back to a form row.
const isHalfStep = (n: number, lo: number, hi: number): boolean =>
  n >= lo && n <= hi && Number.isInteger(n * 2);
const isInt = (n: number, lo: number, hi: number): boolean =>
  Number.isInteger(n) && n >= lo && n <= hi;

/** Parses `row.durValue` as a plain number — no grammar, just
 *  `Number(text.trim())` — or `null` for blank/non-numeric input. Shared by
 *  `toSteps` (which additionally enforces the domain's bounds) and
 *  `rowMinutes` (which is a lenient live preview and doesn't). */
function rowDurationNumber(row: BuilderRow): number | null {
  const trimmed = row.durValue.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function toSteps(
  f: BuilderForm,
): { ok: true; steps: Step[] } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (f.title.length < 1 || f.title.length > 80) {
    errors.title = "title must be 1..80 characters";
  }

  if (f.pain === null || !isInt(f.pain, 1, 5)) {
    errors.pain = "pain rating 1..5 is required";
  }

  const startIndex = spanStartIndex(f);
  // A reps marker is only emitted when there's a repeat span AND more than
  // one rep — mirror that here rather than checking rows.length directly,
  // so the emitted step count (what the server actually bounds) can be one
  // more than the row count without a 100-row form silently emitting 101
  // steps and passing the client check only to be rejected by the server.
  const emitsMarker = f.reps > 1 && startIndex < f.rows.length;
  const emittedStepCount = f.rows.length + (emitsMarker ? 1 : 0);
  if (f.rows.length === 0 || emittedStepCount > 100) {
    errors.steps = "steps must be a non-empty list (max 100)";
  }

  // mirroring validateSteps, which only checks a "reps" step's count when
  // one actually exists.
  if (emitsMarker && !isInt(f.reps, 1, 12)) {
    errors.reps = "reps must be a whole number 1..12";
  }

  const steps: Step[] = [];
  let hasWork = false;

  f.rows.forEach((row, i) => {
    if (emitsMarker && i === startIndex) {
      steps.push({ k: "reps", count: f.reps });
    }

    if (row.kind === "wu" || row.kind === "r") {
      const n = rowDurationNumber(row);
      if (n === null || row.durUnit !== "min") {
        errors[`row:${row.id}:dur`] = "duration must be minutes";
        return;
      }
      if (!isHalfStep(n, 0.5, 180)) {
        errors[`row:${row.id}:dur`] = "minutes must be 0.5..180 in 0.5 steps";
        return;
      }
      steps.push(
        row.kind === "wu" ? { k: "wu", minutes: n } : { k: "r", minutes: n },
      );
      return;
    }

    // row.kind === "w"
    hasWork = true;
    let rowOk = true;

    const n = rowDurationNumber(row);
    let duration: WorkDuration | null = null;
    if (n === null) {
      errors[`row:${row.id}:dur`] = "duration is required, e.g. 5";
      rowOk = false;
    } else if (row.durUnit === "m") {
      if (!isInt(n, 100, 42195)) {
        errors[`row:${row.id}:dur`] = "meters must be 100..42195";
        rowOk = false;
      } else {
        duration = { kind: "distance", meters: n };
      }
    } else if (!isHalfStep(n, 0.5, 180)) {
      errors[`row:${row.id}:dur`] = "minutes must be 0.5..180 in 0.5 steps";
      rowOk = false;
    } else {
      duration = { kind: "time", minutes: n };
    }

    // refBase/refOff always describe a structurally valid PaceRef (the base
    // chip and offset stepper the client control offers can't produce
    // anything else) — the only thing left to check here is the domain's
    // ±60 offset bound, which the control clamps but a hand-built form must
    // still be rejected for.
    const ref: PaceRef = { base: row.refBase, off: row.refOff };
    if (Math.abs(ref.off) > 60) {
      errors[`row:${row.id}:ref`] = "invalid pace reference";
      rowOk = false;
    }

    let spm: number | undefined;
    if (row.spm.trim() !== "") {
      const spmN = Number(row.spm.trim());
      if (!isInt(spmN, 10, 60)) {
        errors[`row:${row.id}:spm`] = "spm must be 10..60";
        rowOk = false;
      } else {
        spm = spmN;
      }
    }

    let restMinutes: number | undefined;
    if (row.rest.trim() !== "") {
      // Same duration grammar as `parseDurationInput` (bare number or `5'`,
      // both minutes) — rest is always time, so a `2500m`-shaped distance is
      // rejected here rather than silently misread as a number.
      const restDuration = parseDurationInput(row.rest.trim());
      if (!restDuration || restDuration.kind !== "time") {
        errors[`row:${row.id}:rest`] = "rest must be minutes, e.g. 5 or 5'";
        rowOk = false;
      } else if (!isHalfStep(restDuration.minutes, 0.5, 60)) {
        errors[`row:${row.id}:rest`] = "rest must be 0.5..60 in 0.5 steps";
        rowOk = false;
      } else {
        restMinutes = restDuration.minutes;
      }
    }

    if (rowOk && duration) {
      steps.push({
        k: "w",
        duration,
        ref,
        ...(spm !== undefined ? { spm } : {}),
        ...(restMinutes !== undefined ? { restMinutes } : {}),
      });
    }
  });

  if (!hasWork && !errors.steps) {
    errors.steps = "workout needs at least one work step";
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, steps };
}

/** Minutes contributed by one row, or null if it's a distance row and
 *  baselines aren't set yet (refBase/refOff are always structurally valid,
 *  so a distance row can only fail to resolve for lack of baselines). An
 *  unparseable duration contributes 0 rather than failing the whole
 *  computation — totals is a live preview, not a validator. */
function rowMinutes(
  row: BuilderRow,
  baselines: Baselines | null,
): number | null {
  const n = rowDurationNumber(row);
  if (n === null) return 0;

  let minutes: number;
  if (row.durUnit === "min") {
    minutes = n;
  } else {
    if (!baselines) return null;
    const ref: PaceRef = { base: row.refBase, off: row.refOff };
    minutes = (resolveSplit(baselines, ref) * n) / 500 / 60;
  }

  // The domain's phases()/estimateMinutes() emit restMinutes as its own
  // phase after a work step, so the builder's total must add it here too or
  // the two disagree on the same workout's length.
  if (row.kind === "w" && row.rest.trim() !== "") {
    const restDuration = parseDurationInput(row.rest.trim());
    if (restDuration && restDuration.kind === "time") {
      minutes += restDuration.minutes;
    }
  }

  return minutes;
}

/** Sums rows before `spanStartIndex(f)` into `loose` (paid once) and every
 *  row from `spanStartIndex(f)` onward into `perSet` (paid `f.reps` times) —
 *  matching exactly what `toSteps`/the domain's `liveSteps` repeat, since
 *  the reps marker is spliced in at that same index. */
export function totals(
  f: BuilderForm,
  baselines: Baselines | null,
): { loose: number; perSet: number; total: number } | null {
  const start = spanStartIndex(f);
  let loose = 0;
  let perSet = 0;

  for (let i = 0; i < f.rows.length; i++) {
    const minutes = rowMinutes(f.rows[i]!, baselines);
    if (minutes === null) return null;
    if (i >= start) perSet += minutes;
    else loose += minutes;
  }

  return { loose, perSet, total: loose + perSet * f.reps };
}

function formatDurationValue(d: WorkDuration): {
  durValue: string;
  durUnit: "min" | "m";
} {
  return d.kind === "time"
    ? { durValue: String(d.minutes), durUnit: "min" }
    : { durValue: String(d.meters), durUnit: "m" };
}

function stepToRow(s: Extract<Step, { k: "wu" | "w" | "r" }>): BuilderRow {
  const row = newRow(s.k);
  if (s.k === "wu" || s.k === "r") {
    row.durValue = String(s.minutes);
    row.durUnit = "min";
  } else {
    const { durValue, durUnit } = formatDurationValue(s.duration);
    row.durValue = durValue;
    row.durUnit = durUnit;
    row.refBase = s.ref.base;
    row.refOff = s.ref.off;
    row.spm = s.spm !== undefined ? String(s.spm) : "";
    // `rest` uses the same duration grammar as before (parseDurationInput),
    // restricted to `kind: "time"`. Writing the bare number form (no
    // apostrophe) here is just this function's choice of round-trip
    // spelling — toSteps accepts either, so this must keep producing
    // something parseDurationInput reads back as the same minutes, or
    // round-tripping a stored workout with restMinutes set produces an
    // unparseable field and the edit can't be saved.
    row.rest = s.restMinutes !== undefined ? String(s.restMinutes) : "";
  }
  return row;
}

// Step kinds the BuilderRow model has no representation for at all (as
// opposed to "reps", which IS representable — it's hoisted into `f.reps`
// rather than becoming a row). Single source of truth for
// `hasUnsupportedSteps` (what to warn a caller about before it opens the
// builder) and `fromWorkout` (what to actually drop when building rows), so
// a future unrepresentable `Step` kind can't be added to one list and
// forgotten in the other.
const UNREPRESENTABLE_STEP_KINDS = new Set<Step["k"]>(["test"]);

// A type guard on the whole Step (rather than a bare `.has()` call on its
// `k`) so TypeScript can narrow: `fromWorkout` relies on
// `s.k === "reps" || isUnrepresentable(s)` to discriminate `s` down to the
// kinds `stepToRow` actually accepts, the same way the old hand-written
// `s.k === "test"` check did — a `.has(s.k)` check alone doesn't narrow the
// containing union.
function isUnrepresentable(s: Step): s is Extract<Step, { k: "test" }> {
  return UNREPRESENTABLE_STEP_KINDS.has(s.k);
}

/** The BuilderRow model has no representation for a `test` step, so
 *  `fromWorkout` must drop it — but doing that silently would destroy the
 *  step the moment the workout is re-saved from the builder, with no
 *  indication to the user that anything was lost. Callers (e.g. the edit
 *  screen) should check this BEFORE calling `fromWorkout` and refuse to open
 *  the builder for a workout that contains any unrepresentable step, rather
 *  than let the edit silently drop it. This is the smallest fix: it doesn't
 *  change `fromWorkout`'s signature or behavior (still a pure form builder),
 *  it just gives callers a way to detect the loss ahead of time. */
export function hasUnsupportedSteps(steps: Step[]): boolean {
  return steps.some((s) => isUnrepresentable(s));
}

export function fromWorkout(w: {
  title: string;
  type: WorkoutType;
  difficulty: Difficulty;
  pain: number;
  steps: Step[];
}): BuilderForm {
  const marker = w.steps.find(
    (s): s is Extract<Step, { k: "reps" }> => s.k === "reps",
  );

  const rows: BuilderRow[] = [];
  w.steps.forEach((s) => {
    if (s.k === "reps" || isUnrepresentable(s)) return;
    rows.push(stepToRow(s));
  });

  return {
    title: w.title,
    type: w.type,
    difficulty: w.difficulty,
    pain: w.pain,
    rows: rows.length > 0 ? rows : [newRow("w")],
    reps: marker ? marker.count : 1,
  };
}
