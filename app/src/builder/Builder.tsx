import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useBaselines } from "../api/useBaselines";
import { usePreferences } from "../api/usePreferences";
import { useWorkouts } from "../api/useWorkouts";
import { effortWord, resolveSplit, toleranceRange } from "../../domain/pace.js";
import type { Baselines, PaceRef, WorkoutType } from "../../domain/types.js";
import BackLink from "../shell/BackLink";
import ClassificationCard from "./ClassificationCard";
import {
  addBlankStep,
  cloneRow,
  newForm,
  removeRow,
  setReps,
  spanStartIndex,
  toSteps,
  totals,
  type BuilderForm,
  type BuilderRow,
  type RowField,
} from "./builderState";
import { generateName } from "./nameGenerator";
import StepCard from "./StepCard";
import StepEditor from "./StepEditor";
import Stepper from "./Stepper";

// Resolves a work row's live TARGET string, or null when baselines aren't
// set yet — StepEditor.tsx/StepCard.tsx do no pace math of their own, so
// this is the one place Builder computes it.
//
// An effort row (refEffort set) is a DELIBERATE exception to the
// baselines-gate below: MAX/MIN's target is the word itself
// (effortWord), which needs no resolution at all — there's no split to
// look up, so there's nothing for missing baselines to block. This is why
// the check comes first, ahead of `baselines === null`, rather than
// falling through to the same null a split row gets when baselines are
// unset (StepEditor/StepCard's "no target / Set baselines" state stays
// exactly for the split case).
function splitLabelFor(
  row: BuilderRow,
  baselines: Baselines | null,
  tolerance: number,
): string | null {
  if (row.refEffort) return effortWord(row.refEffort);
  if (baselines === null) return null;
  const ref: PaceRef = { base: row.refBase, off: row.refOff };
  const resolved = resolveSplit(baselines, ref);
  return toleranceRange(resolved, tolerance).label;
}

export interface BuilderEditMode {
  kind: "edit";
  id: string;
  initial: BuilderForm;
}

// CSS custom property per workout type — never a raw hex (tokens.css). Kept
// local rather than importing from TypeBadge.tsx, which doesn't export it.
// This is also the accordion's left-marker colour source for whichever row
// is expanded (design doc §4: "left marker: the current TYPE colour").
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

// Duplicated from WorkoutDetail.tsx rather than extracted to a shared
// module — out of scope for this screen. Reads the settings custom
// property once, at mount; a future settings screen changing it at runtime
// wouldn't propagate without a remount, same known limitation as there.
function readPaceTolerance(): number {
  if (typeof window === "undefined") return 1;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--pace-tolerance")
    .trim();
  const parsed = Number(raw);
  return raw !== "" && Number.isFinite(parsed) ? parsed : 1;
}

// Minutes (possibly fractional) -> "M:SS", e.g. 7 -> "7:00", 7.4667 -> "7:28".
function fmtMinutes(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

// Section header count (design doc §4: "STEPS" / "2 STEPS", singular
// "1 STEP") and the repeat card's own step count both need the same
// singular/plural grammar — kept as one helper so the two can't drift.
function pluralStep(n: number): string {
  return `${n} step${n === 1 ? "" : "s"}`;
}

// Only a row-scoped error key (`row:<id>:<field>`) needs its owning card
// expanded before a failed Save can focus it — `title`/`pain` are always
// visible regardless of the accordion state. Matched against the same four
// fields `toSteps` ever keys an error under (see `RowField` above).
const ROW_ERROR_KEY = /^row:(.+):(?:dur|ref|spm|rest)$/;

export default function Builder({ mode }: { mode?: BuilderEditMode } = {}) {
  const baselinesState = useBaselines();
  const workoutsState = useWorkouts();
  const preferencesState = usePreferences();
  const navigate = useNavigate();
  // Whatever origin THIS screen (new or edit) was itself entered from —
  // forwarded UNCHANGED onto the edit-mode back link below so a detail ->
  // edit -> back -> detail -> back round trip preserves the ORIGINAL origin
  // (design doc: "Chains preserve the ORIGINAL origin"). Unused in new-mode,
  // where `<BackLink />` reads this same location itself.
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;

  const [form, setForm] = useState<BuilderForm>(mode?.initial ?? newForm());
  // At most one row expanded at a time (design doc's "Interactions &
  // behaviour": `editing = rowId | null`). A brand-new workout opens its one
  // default row immediately — there's nothing to scan yet, only something to
  // fill in, the same reasoning "+ ADD STEP" uses to open what it appends.
  // Opening an existing (edit-mode) workout leaves everything collapsed —
  // reviewing six already-authored steps is exactly the wall-of-inputs
  // problem this accordion exists to fix.
  const [editing, setEditing] = useState<string | null>(() =>
    mode ? null : (form.rows[0]?.id ?? null),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tolerance] = useState(readPaceTolerance);
  // Bumped on every AUTO NAME press so repeated presses cycle through the
  // name pool instead of re-offering the same candidate — generateName is
  // pure, so without this the button would be a no-op after the first click.
  const [nameSeed, setNameSeed] = useState(0);

  // `row:<id>:<field>` / bare form-field name -> the control's DOM element,
  // the exact keys `toSteps` returns in its `errors` object. Lets a failed
  // Save focus the first invalid control even when its card is collapsed
  // (`handleSave` expands the owning row first) or scrolled off-screen.
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  if (baselinesState.state === "loading") {
    return (
      <main className="screen">
        <p className="mono-status">LOADING…</p>
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

  // A partially-set baseline pair (e.g. a brand-new account) is treated the
  // same as "unknown" — same convention as Library/WorkoutDetail.
  const baselines: Baselines | null =
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  const spanStart = spanStartIndex(form);
  const rowsInSet = form.rows.length - spanStart;
  const totalsResult = totals(form, baselines);
  const repeatSubLine = totalsResult
    ? `${pluralStep(rowsInSet)} · ${fmtMinutes(totalsResult.perSet)} per set`
    : pluralStep(rowsInSet);
  // Empty while loading/erroring rather than blocking the screen on it — AUTO
  // NAME is a nicety, not something worth gating the whole builder on. Worst
  // case (loading not yet resolved) is a suggested name that happens to
  // collide with a title already in the library, same as if the user typed
  // it by hand.
  const existingTitles =
    workoutsState.state === "ready"
      ? workoutsState.workouts.map((w) => w.title)
      : [];
  // Recomputed from `errors` rather than tracked separately: `errors` is
  // only ever set from a failed `toSteps` (or cleared to `{}` on success),
  // so its key count and "how many fields need attention" are the same
  // number by construction.
  const invalidFieldCount = Object.keys(errors).length;
  const typeColorVar = TYPE_COLOR_VAR[form.type];

  function updateRow(id: string, patch: Partial<BuilderForm["rows"][number]>) {
    setForm((f) => ({
      ...f,
      rows: f.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function handleExpand(id: string) {
    setEditing(id);
  }

  function handleDone() {
    setEditing(null);
  }

  // "+ ADD STEP": appends an empty work step (or a sensible default when the
  // list is empty — see `addBlankStep`) and opens it, same as any other
  // newly-authored step needs immediate editing rather than a summary
  // nothing has been entered for yet. DUPLICATE (`cloneRow`) is the control
  // that copies a step's values — ADD STEP no longer does.
  function handleAddStep() {
    const { form: next, id } = addBlankStep(form);
    setForm(next);
    setEditing(id);
  }

  // Two duplicate entry points, different intent (design doc "Interactions &
  // behaviour"): the collapsed card's ⧉ is the fast way to build `5×1′` —
  // it inserts a copy directly beneath and leaves everything collapsed,
  // never touching `editing`.
  function handleDuplicateCollapsed(id: string) {
    const { form: next } = cloneRow(form, id);
    setForm(next);
  }

  // The expanded card's DUPLICATE button is duplicate-then-tweak instead —
  // it inserts a copy directly beneath and opens the copy for editing.
  function handleDuplicateExpanded(id: string) {
    const { form: next, id: clonedId } = cloneRow(form, id);
    setForm(next);
    setEditing(clonedId);
  }

  // Available from both collapsed and expanded states; only closes the
  // editor when the row it removes is the one currently open — deleting a
  // collapsed row while a *different* row is expanded must leave that other
  // row open. Recorded departure from the design doc's "Interactions &
  // behaviour" section, which says a delete always sets `editing = null`:
  // that would collapse an unrelated, still-valid open row just because
  // some other collapsed row was deleted, which this behaviour (tested
  // above) avoids without losing anything the doc's version was for.
  function handleDeleteRow(id: string) {
    setForm((f) => removeRow(f, id));
    setEditing((current) => (current === id ? null : current));
  }

  function handleGenerateName() {
    const name = generateName(existingTitles, nameSeed);
    setNameSeed((s) => s + 1);
    setForm((f) => ({ ...f, title: name }));
  }

  async function handleSave() {
    setSubmitError(null);
    const result = toSteps(form);
    if (!result.ok) {
      setErrors(result.errors);
      // `toSteps` only ever returns `ok: false` when `errors` is non-empty
      // (see its own return statement), so there's always a first key here
      // — no "no errors at all" case to fall back from.
      const [firstKey] = Object.keys(result.errors);
      // The trap this task's brief calls out by name: if the first invalid
      // field lives on a row that's currently collapsed, focusing it does
      // nothing visible — the original "Save appears to do nothing" bug,
      // back in a new form. Expand that row's card before focusing.
      const rowMatch = ROW_ERROR_KEY.exec(firstKey!);
      if (rowMatch) {
        setEditing(rowMatch[1]!);
      }
      // Deferred past this render — a just-expanded row's fields (and thus
      // their `fieldRefs` entries) don't exist until StepEditor mounts them.
      // React flushes a discrete event's state update synchronously before
      // this handler returns, so by the time the microtask queue drains, the
      // newly-expanded row is already mounted and registered. `title`/`pain`
      // are always mounted regardless of `editing`, so deferring their focus
      // here too is harmless — same microtask-focus idiom `handleClone` (see
      // `handleDuplicateExpanded`'s sibling in earlier phases) established.
      queueMicrotask(() => {
        const target = fieldRefs.current[firstKey!];
        if (target) {
          target.focus();
          // jsdom doesn't implement scrollIntoView at all (unlike the rest of
          // this guard's namesakes, which are stubbed no-ops there) — guard
          // the call so tests exercising this path don't throw.
          if (typeof target.scrollIntoView === "function") {
            target.scrollIntoView({ block: "center" });
          }
        }
      });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const body = JSON.stringify({
        title: form.title,
        type: form.type,
        difficulty: form.difficulty,
        pain: form.pain,
        steps: result.steps,
      });
      const path = mode ? `/api/workouts/${mode.id}` : "/api/workouts";
      const method = mode ? "PUT" : "POST";
      const res = await api(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        setSubmitError("Couldn't save this workout. Try again.");
        return;
      }
      // The workout is already created server-side once we're past `!res.ok`
      // — a 2xx with a body that fails to parse as JSON (e.g. empty) must
      // still be treated as success, not fall into the catch below and show
      // "Couldn't save" for a save that actually succeeded.
      let savedId: string | undefined;
      try {
        savedId = ((await res.json()) as { id: string }).id;
      } catch {
        savedId = undefined;
      }
      navigate(savedId ? `/library/${savedId}` : "/library");
    } catch {
      setSubmitError("Couldn't save this workout. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="screen builder-screen">
      <div className="builder-header">
        {mode ? (
          // Editing an existing workout always cancels back to the specific
          // workout you were editing — the same fixed-target precedent
          // EditWorkout.tsx's own guard-clause screens already use — rather
          // than chaining through `from` (which would skip the detail
          // screen entirely, since it holds the ORIGIN before detail, e.g.
          // "/today"). `state={{ from }}` forwards that same origin through
          // unchanged so detail's OWN back link still lands on it correctly
          // once you're back there.
          <Link
            to={`/library/${mode.id}`}
            state={{ from }}
            className="back-link"
          >
            ← BACK
          </Link>
        ) : (
          <BackLink />
        )}
        <h1 className="screen-title">
          {mode ? "Edit workout" : "New workout"}
        </h1>
      </div>

      <div>
        <div className="builder-title-row">
          <input
            ref={(el) => {
              fieldRefs.current.title = el;
            }}
            className="builder-title-input"
            placeholder="Title"
            aria-label="Title"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "builder-title-error" : undefined}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <button
            type="button"
            className="builder-auto-name"
            onClick={handleGenerateName}
          >
            ↻ AUTO NAME
          </button>
        </div>
        {errors.title && (
          <p id="builder-title-error" className="field-error">
            {errors.title}
          </p>
        )}
      </div>

      <div>
        <div
          className="builder-classification-wrap"
          tabIndex={-1}
          ref={(el) => {
            fieldRefs.current.pain = el;
          }}
        >
          <ClassificationCard
            type={form.type}
            difficulty={form.difficulty}
            pain={form.pain}
            onTypeChange={(type) => setForm((f) => ({ ...f, type }))}
            onDifficultyChange={(difficulty) =>
              setForm((f) => ({ ...f, difficulty }))
            }
            onPainChange={(pain) => setForm((f) => ({ ...f, pain }))}
          />
        </div>
        {errors.pain && <p className="field-error">{errors.pain}</p>}
      </div>

      {preferencesState.state === "ready" && (
        // Context only, never authored into the workout: `toSteps` never
        // sees this value, so changing the preference later doesn't leave
        // any saved workout stale (Phase 6's session flow prepends the
        // actual warm-up when a workout is started). Rendered only once the
        // preference has actually loaded — while loading or on error this
        // renders nothing rather than a placeholder number, since a wrong
        // warm-up figure is worse than none. Placed above the step list
        // rather than down by the totals: it reads as an implicit step 0,
        // which is what actually happens at session start.
        <p className="builder-warmup-line">
          {`+ ${preferencesState.preferences.warmupMinutes}′ warm-up from your preferences`}
        </p>
      )}

      <div className="builder-steps">
        <div className="builder-steps-header">
          <span>STEPS</span>
          <span>{pluralStep(form.rows.length).toUpperCase()}</span>
        </div>
        <div className="builder-step-list">
          {form.rows.map((row, index) => {
            const splitLabel =
              row.kind === "w"
                ? splitLabelFor(row, baselines, tolerance)
                : null;
            return row.id === editing ? (
              <StepEditor
                key={row.id}
                row={row}
                index={index}
                splitLabel={splitLabel}
                typeColorVar={typeColorVar}
                onChange={(patch) => updateRow(row.id, patch)}
                onDuplicate={() => handleDuplicateExpanded(row.id)}
                onDelete={() => handleDeleteRow(row.id)}
                onDone={handleDone}
                fieldError={(field: RowField) =>
                  errors[`row:${row.id}:${field}`]
                }
                registerRef={(field: RowField, el) => {
                  fieldRefs.current[`row:${row.id}:${field}`] = el;
                }}
              />
            ) : (
              <StepCard
                key={row.id}
                index={index}
                row={row}
                splitLabel={splitLabel}
                typeColorVar={typeColorVar}
                onExpand={() => handleExpand(row.id)}
                onDuplicate={() => handleDuplicateCollapsed(row.id)}
                onDelete={() => handleDeleteRow(row.id)}
              />
            );
          })}
        </div>
        {errors.steps && <p className="field-error">{errors.steps}</p>}
        <button
          type="button"
          className="builder-add-step"
          onClick={handleAddStep}
        >
          + ADD STEP
        </button>
      </div>

      <div className="builder-repeat-card">
        <div className="builder-repeat-row">
          <span className="builder-repeat-label">REPEAT ALL STEPS</span>
          <Stepper
            label="Repeat"
            value={`×${form.reps}`}
            valueWidth={52}
            onDecrement={() => setForm((f) => setReps(f, f.reps - 1))}
            onIncrement={() => setForm((f) => setReps(f, f.reps + 1))}
          />
        </div>
        <p className="builder-repeat-sub">{repeatSubLine}</p>
        {errors.reps && <p className="field-error">{errors.reps}</p>}
      </div>

      <div className="builder-totals">
        <div className="builder-total-row">
          <span className="builder-total-label">TOTAL</span>
          <span className="builder-total-value">
            {totalsResult ? `${Math.round(totalsResult.total)} MIN` : "— MIN"}
          </span>
        </div>
      </div>

      {submitError && (
        <p className="field-error" role="alert">
          {submitError}
        </p>
      )}

      {invalidFieldCount > 0 && (
        <p className="field-error" role="alert">
          {`${invalidFieldCount} field${invalidFieldCount === 1 ? "" : "s"} need${invalidFieldCount === 1 ? "s" : ""} attention`}
        </p>
      )}

      <button
        type="button"
        className="button-l1"
        onClick={handleSave}
        disabled={saving}
      >
        Save to library
      </button>
    </main>
  );
}
