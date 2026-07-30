import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useBaselines } from "../api/useBaselines";
import { useWorkouts } from "../api/useWorkouts";
import PainPicker from "../components/PainPicker";
import type { Baselines, Difficulty, WorkoutType } from "../../domain/types.js";
import {
  addRow,
  newForm,
  removeRow,
  setBlockStart,
  setReps,
  setRowIds,
  toSteps,
  totals,
  type BuilderForm,
} from "./builderState";
import { generateName } from "./nameGenerator";
import StepRowEditor from "./StepRowEditor";

export interface BuilderEditMode {
  kind: "edit";
  id: string;
  initial: BuilderForm;
}

// Chip order per docs/design/README.md §Screens → "2. Library" (AN before
// O2 — not alphabetical), matching src/library/FilterChips.tsx.
const TYPE_CHIPS: { type: WorkoutType; label: string }[] = [
  { type: "AN", label: "AN" },
  { type: "O2", label: "O2" },
  { type: "AT", label: "AT" },
  { type: "TR", label: "TR" },
];

// CSS custom property per workout type — never a raw hex (tokens.css). Kept
// local rather than importing from TypeBadge.tsx, which doesn't export it.
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

// Difficulty reads EASY/MEDIUM/HARD (docs/design/DEVIATIONS.md), not the
// handoff's Introductory/Moderate/Advanced.
const DIFFICULTY_CHIPS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "EASY" },
  { value: "medium", label: "MEDIUM" },
  { value: "hard", label: "HARD" },
];

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

// Widths mirror the actual row fields below (StepRowEditor's .set-toggle /
// .field-dur / .field-spm / .field-rest, plus a spacer the width of
// .row-delete) so each label sits over its column — see docs/design/Erg
// Log.dc.html:765 for the handoff's equivalent fixed widths. Purely
// decorative (aria-hidden), but it'll show in screenshots. There is no
// PACE REF slot any more: PaceRefInput.tsx renders on its own full-width
// line below the row rather than in a column, so a header slot for it would
// just be dead space that pushes every column after it out of alignment.
function ColumnHeader() {
  return (
    <div className="builder-columns" aria-hidden="true">
      <span className="col-set">SET</span>
      <span className="col-dur">DUR</span>
      <span className="col-spm">SPM</span>
      <span className="col-rest">REST (OPT)</span>
      <span className="col-split">SPLIT</span>
      <span className="col-delete" />
    </div>
  );
}

export default function Builder({ mode }: { mode?: BuilderEditMode } = {}) {
  const baselinesState = useBaselines();
  const workoutsState = useWorkouts();
  const navigate = useNavigate();

  const [form, setForm] = useState<BuilderForm>(mode?.initial ?? newForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tolerance] = useState(readPaceTolerance);
  // Bumped on every 🎲 press so repeated presses cycle through the name
  // pool instead of re-offering the same candidate — generateName is pure,
  // so without this the button would be a no-op after the first click.
  const [nameSeed, setNameSeed] = useState(0);

  // `row:<id>:<field>` / bare form-field name -> the control's DOM element,
  // the exact keys `toSteps` returns in its `errors` object. Lets a failed
  // Save focus the first invalid control even when it's scrolled off-screen
  // (the reported bug: pressing Save did nothing visible when the invalid
  // field wasn't in view). `pain` registers its `tabIndex={-1}` wrapper div
  // (PainPicker itself has no single focusable root — it's a radiogroup of
  // five cells), same trick `PainPickerField` below borrows from
  // StepRowEditor's `.step-row-editor-pace` wrapper around PaceRefInput.
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

  const markedIds = setRowIds(form);
  const totalsResult = totals(form, baselines);
  // Empty while loading/erroring rather than blocking the screen on it — the
  // 🎲 is a nicety, not something worth gating the whole builder on. Worst
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

  function updateRow(id: string, patch: Partial<BuilderForm["rows"][number]>) {
    setForm((f) => ({
      ...f,
      rows: f.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
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
    <main className="screen">
      <Link to="/library" className="back-link">
        ← BACK
      </Link>
      <h1 className="screen-title">{mode ? "Edit Workout" : "New Workout"}</h1>

      <div className="builder-header-fields">
        <div className="field field-title-wrap">
          <label htmlFor="builder-title">Title</label>
          <div className="builder-title-row">
            <input
              ref={(el) => {
                fieldRefs.current.title = el;
              }}
              id="builder-title"
              className="builder-title-input"
              aria-label="Title"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={
                errors.title ? "builder-title-error" : undefined
              }
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
            />
            <button
              type="button"
              className="builder-dice"
              aria-label="Suggest a name"
              onClick={handleGenerateName}
            >
              🎲
            </button>
          </div>
          {errors.title && (
            <p id="builder-title-error" className="field-error">
              {errors.title}
            </p>
          )}
        </div>
      </div>

      <p className="section-heading">TYPE</p>
      <div className="chip-wrap">
        {TYPE_CHIPS.map(({ type, label }) => {
          const active = form.type === type;
          return (
            <button
              key={type}
              type="button"
              className="chip"
              aria-pressed={active}
              style={
                active
                  ? {
                      background: `var(${TYPE_COLOR_VAR[type]})`,
                      color: "var(--on-color)",
                      border: "none",
                    }
                  : undefined
              }
              onClick={() => setForm((f) => ({ ...f, type }))}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className="section-heading">DIFFICULTY</p>
      <div className="chip-wrap">
        {DIFFICULTY_CHIPS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={form.difficulty === value}
            onClick={() => setForm((f) => ({ ...f, difficulty: value }))}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="section-heading">EXPECTED PAIN</p>
      <PainPickerField
        pain={form.pain}
        error={errors.pain}
        onChange={(pain) => setForm((f) => ({ ...f, pain }))}
        registerRef={(el) => {
          fieldRefs.current.pain = el;
        }}
      />

      <ColumnHeader />
      <div className="builder-rows">
        {form.rows.map((row, index) => (
          <StepRowEditor
            key={row.id}
            row={row}
            index={index}
            inSet={markedIds.includes(row.id)}
            isBlockStart={markedIds[0] === row.id}
            baselines={baselines}
            tolerance={tolerance}
            fieldError={(field) => errors[`row:${row.id}:${field}`]}
            onChange={(patch) => updateRow(row.id, patch)}
            onSetBlockStart={() => setForm((f) => setBlockStart(f, row.id))}
            onRemove={() => setForm((f) => removeRow(f, row.id))}
            registerRef={(field, el) => {
              fieldRefs.current[`row:${row.id}:${field}`] = el;
            }}
          />
        ))}
      </div>
      {errors.steps && <p className="field-error">{errors.steps}</p>}

      {/* Two kind-specific controls rather than one generic "+ ADD ROW" (the
          handoff's shape): the domain distinguishes wu/w/r steps, and
          without a way to pick a row's kind, StepRowEditor's minutes-only
          branch is unreachable in create mode — every starter workout opens
          with a warm-up, so a builder that can't author one is incomplete.
          See docs/design/DEVIATIONS.md. There is no "+ REST" any more: rest
          is authored via a work row's own REST (OPT) field. `addRow(f, "r")`
          and StepRowEditor's `kind === "r"` render branch both stay, though
          — bulk import and edit-mode `fromWorkout` can still produce a
          standalone rest step, and a pasted workout has to stay editable. */}
      <div className="builder-add-row-group">
        <button
          type="button"
          className="builder-add-row"
          onClick={() => setForm((f) => addRow(f, "wu"))}
        >
          + WARM-UP
        </button>
        <button
          type="button"
          className="builder-add-row"
          onClick={() => setForm((f) => addRow(f, "w"))}
        >
          + ADD ROW
        </button>
      </div>

      <p className="section-heading">REPEAT (OPTIONAL)</p>
      <div className="builder-repeat">
        <button
          type="button"
          className="baseline-stepper"
          aria-label="Fewer reps"
          onClick={() => setForm((f) => setReps(f, f.reps - 1))}
        >
          −
        </button>
        <span className="builder-reps-count">×{form.reps}</span>
        <button
          type="button"
          className="baseline-stepper"
          aria-label="More reps"
          onClick={() => setForm((f) => setReps(f, f.reps + 1))}
        >
          +
        </button>
      </div>
      {errors.reps && <p className="field-error">{errors.reps}</p>}
      {markedIds.length > 0 && (
        <p className="mono-status builder-repeat-readout">
          {markedIds.length} row{markedIds.length === 1 ? "" : "s"} marked
          {totalsResult ? ` · ${fmtMinutes(totalsResult.perSet)} per set` : ""}
        </p>
      )}

      <p className="section-heading builder-total">
        TOTAL {totalsResult ? `${Math.round(totalsResult.total)} MIN` : "— MIN"}
      </p>

      {submitError && (
        <p className="field-error builder-submit-error" role="alert">
          {submitError}
        </p>
      )}

      {invalidFieldCount > 0 && (
        <p className="field-error builder-save-status" role="alert">
          {`${invalidFieldCount} field${invalidFieldCount === 1 ? "" : "s"} need${invalidFieldCount === 1 ? "s" : ""} attention`}
        </p>
      )}

      <button
        type="button"
        className="button-primary builder-save"
        onClick={handleSave}
        disabled={saving}
      >
        Save to library
      </button>
    </main>
  );
}

// Local rather than a top-level import from PainPicker.tsx's own module,
// since the field also needs to render an inline validation message beneath
// it — kept as one unit so a future reader sees the picker and its error
// together instead of hunting for where `errors.pain` is rendered.
function PainPickerField({
  pain,
  error,
  onChange,
  registerRef,
}: {
  pain: number | null;
  error: string | undefined;
  onChange: (n: number) => void;
  // Registers the wrapper div below (not a PainPicker cell) as the `pain`
  // save-focus target — see the `fieldRefs` comment in Builder(). A plain
  // wrapper div isn't natively focusable, hence that div's own
  // `tabIndex={-1}`: enough to accept `.focus()` without adding a stop to
  // the page's tab order (PainPicker's five radio cells already form their
  // own roving-tabindex group).
  registerRef: (el: HTMLElement | null) => void;
}) {
  return (
    <>
      <div className="pain-picker-field" tabIndex={-1} ref={registerRef}>
        <PainPicker value={pain} onChange={onChange} />
      </div>
      {error && <p className="field-error">{error}</p>}
    </>
  );
}
