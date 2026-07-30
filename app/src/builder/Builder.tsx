import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useBaselines } from "../api/useBaselines";
import PainPicker from "../components/PainPicker";
import type { Baselines, Difficulty, WorkoutType } from "../../domain/types.js";
import BulkImport from "./BulkImport";
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
// decorative (aria-hidden), but it'll show in screenshots. PACE REF has no
// single column to sit over any more (PaceRefInput.tsx renders on its own
// full-width line below), but stays in the header as a section label.
function ColumnHeader() {
  return (
    <div className="builder-columns" aria-hidden="true">
      <span className="col-set">SET</span>
      <span className="col-dur">DUR</span>
      <span className="col-ref">PACE REF</span>
      <span className="col-spm">SPM</span>
      <span className="col-rest">REST</span>
      <span className="col-split">SPLIT</span>
      <span className="col-delete" />
    </div>
  );
}

export default function Builder({ mode }: { mode?: BuilderEditMode } = {}) {
  const baselinesState = useBaselines();
  const navigate = useNavigate();

  const [form, setForm] = useState<BuilderForm>(mode?.initial ?? newForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tolerance] = useState(readPaceTolerance);

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

  function updateRow(id: string, patch: Partial<BuilderForm["rows"][number]>) {
    setForm((f) => ({
      ...f,
      rows: f.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  async function handleSave() {
    setSubmitError(null);
    const result = toSteps(form);
    if (!result.ok) {
      setErrors(result.errors);
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
          <input
            id="builder-title"
            className="builder-title-input"
            aria-label="Title"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "builder-title-error" : undefined}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
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
          />
        ))}
      </div>
      {errors.steps && <p className="field-error">{errors.steps}</p>}

      {/* Three kind-specific controls rather than one generic "+ ADD ROW"
          (the handoff's shape): the domain distinguishes wu/w/r steps, and
          without a way to pick a row's kind, StepRowEditor's minutes-only
          branch is unreachable in create mode — every starter workout opens
          with a warm-up, so a builder that can't author one is incomplete.
          See docs/design/DEVIATIONS.md. */}
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
        <button
          type="button"
          className="builder-add-row"
          onClick={() => setForm((f) => addRow(f, "r"))}
        >
          + REST
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

      <BulkImport onImported={() => navigate("/library")} />

      {submitError && (
        <p className="field-error builder-submit-error" role="alert">
          {submitError}
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
}: {
  pain: number | null;
  error: string | undefined;
  onChange: (n: number) => void;
}) {
  return (
    <>
      <PainPicker value={pain} onChange={onChange} />
      {error && <p className="field-error">{error}</p>}
    </>
  );
}
