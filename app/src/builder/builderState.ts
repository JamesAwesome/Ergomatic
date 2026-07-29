import { parsePaceRef, resolveSplit } from "../../domain/pace.js";
import type {
  Baselines,
  Difficulty,
  PaceRef,
  Step,
  WorkDuration,
  WorkoutType,
} from "../../domain/types.js";

export type RowKind = "wu" | "w" | "r";

export interface BuilderRow {
  id: string;
  kind: RowKind;
  marked: boolean;
  dur: string;
  ref: string;
  spm: string;
  rest: string;
}

export interface BuilderForm {
  num: string;
  title: string;
  type: WorkoutType;
  difficulty: Difficulty;
  pain: number | null;
  rows: BuilderRow[];
  reps: number;
}

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
    marked: false,
    dur: "",
    ref: "",
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
    num: "",
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
// edit (`row.dur = …`) would silently corrupt that shared row for every
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

// Positional semantics, not per-row: the domain has no way to express a
// non-contiguous repeat. `toSteps` emits the single reps marker immediately
// before the FIRST marked row, and the domain's `liveSteps` then repeats
// EVERYTHING positioned after that marker — including rows the user never
// marked, if they happen to sit after a marked one. So marking row N puts
// every row from N onward into the repeated set, regardless of those rows'
// own `marked` flags. `totals` and `setRowIds` both bucket by the position
// of the first marked row for exactly this reason — don't reintroduce
// per-row bucketing here or in any consumer of `marked`.
export function toggleMarked(f: BuilderForm, id: string): BuilderForm {
  return {
    ...f,
    rows: f.rows.map((r) => (r.id === id ? { ...r, marked: !r.marked } : r)),
  };
}

export function setReps(f: BuilderForm, reps: number): BuilderForm {
  return { ...f, reps: Math.min(12, Math.max(1, reps)) };
}

/** Same grammar as `domain/bulk.ts`'s (unexported) `parseDuration`: `10'` is
 *  minutes (decimals allowed), `2500m` is meters (integers only), a bare
 *  number is invalid. Kept in lockstep by hand since it isn't exported. */
export function parseDurationInput(text: string): WorkDuration | null {
  const trimmed = text.trim();
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

export function toSteps(
  f: BuilderForm,
): { ok: true; steps: Step[] } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  // Plain digits only — Number()'s coercion would otherwise accept exponent
  // notation ("1e3") as workout #1000, which isn't what a user typing that
  // string means, even though it's domain-valid.
  const numText = f.num.trim();
  const num = /^\d+$/.test(numText) ? Number(numText) : NaN;
  if (!isInt(num, 1, 9999)) errors.num = "num must be a whole number 1..9999";

  if (f.title.length < 1 || f.title.length > 80) {
    errors.title = "title must be 1..80 characters";
  }

  if (f.pain === null || !isInt(f.pain, 1, 5)) {
    errors.pain = "pain rating 1..5 is required";
  }

  // A reps marker is only emitted when a row is marked, so the emitted step
  // count (what the server actually bounds) can be one more than the row
  // count — mirror that here rather than checking rows.length directly, or
  // 100 marked rows would emit 101 steps and pass the client check only to
  // be rejected by the server.
  const hasMarker = f.rows.some((r) => r.marked);
  const emittedStepCount = f.rows.length + (hasMarker ? 1 : 0);
  if (f.rows.length === 0 || emittedStepCount > 100) {
    errors.steps = "steps must be a non-empty list (max 100)";
  }

  // mirroring validateSteps, which only checks a "reps" step's count when
  // one actually exists.
  if (hasMarker && !isInt(f.reps, 1, 12)) {
    errors.reps = "reps must be a whole number 1..12";
  }

  const steps: Step[] = [];
  let hasWork = false;
  let markerEmitted = false;

  for (const row of f.rows) {
    if (row.marked && !markerEmitted) {
      steps.push({ k: "reps", count: f.reps });
      markerEmitted = true;
    }

    if (row.kind === "wu" || row.kind === "r") {
      const duration = parseDurationInput(row.dur);
      if (!duration || duration.kind !== "time") {
        errors[`row:${row.id}:dur`] = "duration must be minutes, e.g. 10'";
        continue;
      }
      if (!isHalfStep(duration.minutes, 0.5, 180)) {
        errors[`row:${row.id}:dur`] = "minutes must be 0.5..180 in 0.5 steps";
        continue;
      }
      steps.push(
        row.kind === "wu"
          ? { k: "wu", minutes: duration.minutes }
          : { k: "r", minutes: duration.minutes },
      );
      continue;
    }

    // row.kind === "w"
    hasWork = true;
    let rowOk = true;

    const duration = parseDurationInput(row.dur);
    if (!duration) {
      errors[`row:${row.id}:dur`] = "duration is required, e.g. 5' or 2500m";
      rowOk = false;
    } else if (
      duration.kind === "time" &&
      !isHalfStep(duration.minutes, 0.5, 180)
    ) {
      errors[`row:${row.id}:dur`] = "minutes must be 0.5..180 in 0.5 steps";
      rowOk = false;
    } else if (
      duration.kind === "distance" &&
      !isInt(duration.meters, 100, 42195)
    ) {
      errors[`row:${row.id}:dur`] = "meters must be 100..42195";
      rowOk = false;
    }

    const ref = parsePaceRef(row.ref);
    if (!ref || Math.abs(ref.off) > 60) {
      errors[`row:${row.id}:ref`] = "invalid pace reference";
      rowOk = false;
    }

    let spm: number | undefined;
    if (row.spm.trim() !== "") {
      const n = Number(row.spm.trim());
      if (!isInt(n, 10, 60)) {
        errors[`row:${row.id}:spm`] = "spm must be 10..60";
        rowOk = false;
      } else {
        spm = n;
      }
    }

    let restMinutes: number | undefined;
    if (row.rest.trim() !== "") {
      const n = Number(row.rest.trim());
      if (!isHalfStep(n, 0.5, 60)) {
        errors[`row:${row.id}:rest`] = "rest must be 0.5..60 in 0.5 steps";
        rowOk = false;
      } else {
        restMinutes = n;
      }
    }

    if (rowOk && duration && ref) {
      steps.push({
        k: "w",
        duration,
        ref,
        ...(spm !== undefined ? { spm } : {}),
        ...(restMinutes !== undefined ? { restMinutes } : {}),
      });
    }
  }

  if (!hasWork && !errors.steps) {
    errors.steps = "workout needs at least one work step";
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, steps };
}

/** Minutes contributed by one row, or null if it's a distance row that
 *  can't be resolved (unparseable pace ref, or no baselines yet). An
 *  unparseable duration contributes 0 rather than failing the whole
 *  computation — totals is a live preview, not a validator. */
function rowMinutes(
  row: BuilderRow,
  baselines: Baselines | null,
): number | null {
  const duration = parseDurationInput(row.dur);
  if (!duration) return 0;

  let minutes: number;
  if (duration.kind === "time") {
    minutes = duration.minutes;
  } else {
    const ref = parsePaceRef(row.ref);
    if (!ref || !baselines) return null;
    minutes = (resolveSplit(baselines, ref) * duration.meters) / 500 / 60;
  }

  // The domain's phases()/estimateMinutes() emit restMinutes as its own
  // phase after a work step, so the builder's total must add it here too or
  // the two disagree on the same workout's length.
  if (row.kind === "w" && row.rest.trim() !== "") {
    const rest = Number(row.rest.trim());
    if (Number.isFinite(rest)) minutes += rest;
  }

  return minutes;
}

/** Positional, to match `toSteps`/`liveSteps` (see the comment on
 *  `toggleMarked`): every row from the FIRST marked row onward is bucketed
 *  into `perSet`, even if that particular row's own `marked` flag is false.
 *  Bucketing per-row instead — as this used to do — would let `totals`
 *  disagree with `estimateMinutes(toSteps(f).steps, baselines)` for any form
 *  with a non-contiguous marked set, since the domain always repeats the
 *  full tail after the marker regardless of which rows in it were clicked. */
export function totals(
  f: BuilderForm,
  baselines: Baselines | null,
): { loose: number; perSet: number; total: number } | null {
  const firstMarkedIndex = f.rows.findIndex((r) => r.marked);
  let loose = 0;
  let perSet = 0;

  for (let i = 0; i < f.rows.length; i++) {
    const minutes = rowMinutes(f.rows[i], baselines);
    if (minutes === null) return null;
    if (firstMarkedIndex !== -1 && i >= firstMarkedIndex) perSet += minutes;
    else loose += minutes;
  }

  return { loose, perSet, total: loose + perSet * f.reps };
}

/** Ids of every row inside the repeated set, in form order: the first
 *  marked row and every row after it (positionally — see `toggleMarked`),
 *  or `[]` when nothing is marked. Lets a rendering screen show the whole
 *  repeated block as "in the set" — including rows the user didn't
 *  personally click — rather than only the ones with `marked: true`, which
 *  would misrepresent what `toSteps`/`liveSteps` actually repeat. */
export function setRowIds(f: BuilderForm): string[] {
  const firstMarkedIndex = f.rows.findIndex((r) => r.marked);
  if (firstMarkedIndex === -1) return [];
  return f.rows.slice(firstMarkedIndex).map((r) => r.id);
}

function formatDuration(d: WorkDuration): string {
  return d.kind === "time" ? `${d.minutes}'` : `${d.meters}m`;
}

function formatPaceRef(ref: PaceRef): string {
  if (ref.off === 0) return ref.base;
  return `${ref.base}${ref.off > 0 ? "+" : ""}${ref.off}`;
}

function stepToRow(
  s: Extract<Step, { k: "wu" | "w" | "r" }>,
  marked: boolean,
): BuilderRow {
  const row = newRow(s.k);
  row.marked = marked;
  if (s.k === "wu" || s.k === "r") {
    row.dur = `${s.minutes}'`;
  } else {
    row.dur = formatDuration(s.duration);
    row.ref = formatPaceRef(s.ref);
    row.spm = s.spm !== undefined ? String(s.spm) : "";
    // Unlike `dur` (which uses the `10'`/`2500m` duration grammar), `rest`
    // is parsed in toSteps as a bare number of minutes — no apostrophe.
    // This must produce exactly what toSteps' `Number(row.rest.trim())`
    // expects, or round-tripping a stored workout with restMinutes set
    // produces an unparseable field and the edit can't be saved.
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
  num: number;
  title: string;
  type: WorkoutType;
  difficulty: Difficulty;
  pain: number;
  steps: Step[];
}): BuilderForm {
  const markerIndex = w.steps.findIndex((s) => s.k === "reps");
  const marker =
    markerIndex === -1
      ? null
      : (w.steps[markerIndex] as Extract<Step, { k: "reps" }>);

  const rows: BuilderRow[] = [];
  w.steps.forEach((s, i) => {
    if (s.k === "reps" || isUnrepresentable(s)) return;
    rows.push(stepToRow(s, marker !== null && i > markerIndex));
  });

  return {
    num: String(w.num),
    title: w.title,
    type: w.type,
    difficulty: w.difficulty,
    pain: w.pain,
    rows: rows.length > 0 ? rows : [newRow("w")],
    reps: marker ? marker.count : 1,
  };
}
