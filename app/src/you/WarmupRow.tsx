import { useState } from "react";
import { fmtDuration, parseClock } from "../../domain/duration.js";
import {
  usePreferences,
  type PreferencesData,
  type WarmupSetting,
} from "../api/usePreferences";
import ClockInput from "../builder/ClockInput";
import DurationInput from "../builder/DurationInput";

// Mirrors server/routes/data.ts's own named constants (WARMUP_MINUTES_MIN/
// MAX, WARMUP_METERS_MIN/MAX, WARMUP_REST_SECONDS_MIN/MAX) — the server is
// the one authority for these bounds (2026-08-09 warmup-setting spec §2);
// this client copy exists only so an out-of-range value never has to make a
// round trip just to be told no. Same "hand-mirrored, not shared" reasoning
// usePreferences.ts's own `WarmupSetting` MIRROR NOTE gives for the shape
// itself — the client cannot import `server/routes/data.ts`.
const WARMUP_MINUTES_MIN = 1;
const WARMUP_MINUTES_MAX = 30;
const WARMUP_METERS_MIN = 100;
const WARMUP_METERS_MAX = 10000;
const WARMUP_REST_SECONDS_MIN = 5;
const WARMUP_REST_SECONDS_MAX = 595;

// A brand-new draft (the OFF -> editor transition) has to seed SOMETHING —
// 10 minutes is the spec's own worked example (§3: "WARM-UP · 10:00").
const SEED_MINUTES = 10;

type Unit = "min" | "m";

interface Draft {
  unit: Unit;
  // DurationInput's own value convention: a clock string ("10:00") for
  // "min", raw digits ("2000") for "m".
  durValue: string;
  // ClockInput's own clock string; "" means no rest (REST AFTER is blank =
  // none, spec §3).
  restValue: string;
}

function draftFromWarmup(current: WarmupSetting | null): Draft {
  const restValue =
    current?.restSeconds !== undefined
      ? fmtDuration(current.restSeconds / 60)
      : "";
  if (current === null) {
    return { unit: "min", durValue: fmtDuration(SEED_MINUTES), restValue };
  }
  return current.kind === "time"
    ? { unit: "min", durValue: fmtDuration(current.minutes), restValue }
    : { unit: "m", durValue: String(current.meters), restValue };
}

type DurationResult =
  { ok: true; value: WarmupSetting } | { ok: false; error: string };

// Exported for direct testing, same "pure helper testable without the
// widget" convention as ClockInput.tsx's own `digitsToClock`: the
// `minutes`/`meters` "not a number" guards below are unreachable through
// DurationInput/ClockInput's own typing UI — both only ever hand back an
// empty string or one already shaped like a valid clock/digit string — so a
// UI-only test suite could never kill those two branches.
// eslint-disable-next-line react-refresh/only-export-components
export function parseWarmupDuration(unit: Unit, value: string): DurationResult {
  const trimmed = value.trim();
  if (unit === "min") {
    if (trimmed === "") return { ok: false, error: "Enter a warm-up time." };
    const minutes = parseClock(trimmed);
    if (minutes === null) return { ok: false, error: "Enter a valid time." };
    if (!Number.isInteger(minutes)) {
      return {
        ok: false,
        error: "Warm-up time must be a whole number of minutes.",
      };
    }
    if (minutes < WARMUP_MINUTES_MIN || minutes > WARMUP_MINUTES_MAX) {
      return {
        ok: false,
        error: `Warm-up time must be ${WARMUP_MINUTES_MIN} to ${WARMUP_MINUTES_MAX} minutes.`,
      };
    }
    return { ok: true, value: { kind: "time", minutes } };
  }
  if (trimmed === "") return { ok: false, error: "Enter a warm-up distance." };
  const meters = Number(trimmed);
  if (!Number.isInteger(meters))
    return { ok: false, error: "Enter a valid distance." };
  if (meters < WARMUP_METERS_MIN || meters > WARMUP_METERS_MAX) {
    return {
      ok: false,
      error: `Warm-up distance must be ${WARMUP_METERS_MIN} to ${WARMUP_METERS_MAX} meters.`,
    };
  }
  return { ok: true, value: { kind: "distance", meters } };
}

type RestResult =
  { ok: true; value: number | undefined } | { ok: false; error: string };

// eslint-disable-next-line react-refresh/only-export-components
export function parseWarmupRest(value: string): RestResult {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  const minutes = parseClock(trimmed);
  if (minutes === null) return { ok: false, error: "Enter a valid rest time." };
  // Whole-second rounding (same reason domain/validate.ts's own
  // `wholeSecond` comment gives): `minutes * 60` can land a hair off an
  // integer for values built from a fractional minutes term (`31/60*60`
  // is not exactly `31`), even though the clock field itself only ever
  // produces whole seconds.
  const seconds = Math.round(minutes * 60);
  if (seconds < WARMUP_REST_SECONDS_MIN || seconds > WARMUP_REST_SECONDS_MAX) {
    return {
      ok: false,
      error: `Rest after must be ${fmtDuration(WARMUP_REST_SECONDS_MIN / 60)} to ${fmtDuration(WARMUP_REST_SECONDS_MAX / 60)}.`,
    };
  }
  return { ok: true, value: seconds };
}

/** The row's own status VALUE — `10:00`, `2000 m`, `10:00 + 0:30 REST` —
 *  read into the shared `.you-settings-row-meta` slot alone, no `WARM-UP ·`
 *  prefix (whole-branch review finding F: the row's own title already says
 *  "Warm-up"; repeating it in the meta duplicated the word, including in
 *  the button's own accessible name, and diverged from the sibling
 *  "Learning the app" row's convention of "title, then a DIFFERENT fact" —
 *  see `WarmupRow()` below). Spec §3's own literal examples write the
 *  prefix in (`WARM-UP · 10:00`), a divergence recorded where the row
 *  itself is rendered. Time uses `fmtDuration` — the same helper
 *  Builder.tsx already uses for this exact quantity (and ConfirmTargets.tsx
 *  did too, before fast-follow Task 4 deleted it), which renders a
 *  sub-minute rest as `0:30`, not the spec prose's elided `:30`: kept
 *  consistent with that existing call site rather than inventing a second
 *  rendering for the identical value (see task-6 report). Distance uses a
 *  lowercase `m` (Builder.tsx's own prose convention), not the uppercase
 *  structured-cell `M` ConfirmTargets used to. */
function warmupValueText(warmup: WarmupSetting): string {
  const duration =
    warmup.kind === "time" ? fmtDuration(warmup.minutes) : `${warmup.meters} m`;
  const rest =
    warmup.restSeconds !== undefined
      ? ` + ${fmtDuration(warmup.restSeconds / 60)} REST`
      : "";
  return `${duration}${rest}`;
}

function WarmupEditor({
  current,
  save,
  onDone,
}: {
  current: WarmupSetting | null;
  save: (patch: Partial<PreferencesData>) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFromWarmup(current));
  const [durationError, setDurationError] = useState<string | null>(null);
  const [restError, setRestError] = useState<string | null>(null);

  function handleSave() {
    const durationResult = parseWarmupDuration(draft.unit, draft.durValue);
    const restResult = parseWarmupRest(draft.restValue);
    setDurationError(durationResult.ok ? null : durationResult.error);
    setRestError(restResult.ok ? null : restResult.error);
    if (!durationResult.ok || !restResult.ok) return;
    const next: WarmupSetting =
      restResult.value !== undefined
        ? { ...durationResult.value, restSeconds: restResult.value }
        : durationResult.value;
    // Optimistic patch, explicit shape — usePreferences.save's own contract
    // (Task 2/4): a partial `PreferencesData` merged into local state
    // immediately, the PUT fired alongside it.
    save({ warmup: next });
    onDone();
  }

  function handleRemove() {
    // The explicit-null patch: `usePreferences.save`'s merge is a plain
    // spread, so `{ warmup: null }` overwrites the field with `null` rather
    // than leaving it untouched the way an absent key would.
    save({ warmup: null });
    onDone();
  }

  return (
    <div className="step-editor warmup-editor">
      <div className="step-editor-header">
        <span className="step-editor-header-label">WARM-UP</span>
      </div>

      <div className="step-editor-row">
        <span className="step-editor-row-label">DUR</span>
        <DurationInput
          value={draft.durValue}
          unit={draft.unit}
          onChange={({ value, unit }) => {
            setDraft((d) => ({ ...d, durValue: value, unit }));
            setDurationError(null);
          }}
          rowLabel="Warm-up"
          invalid={durationError !== null}
          errorId={durationError !== null ? "warmup-duration-error" : undefined}
        />
      </div>
      {durationError && (
        <p id="warmup-duration-error" className="field-error">
          {durationError}
        </p>
      )}

      <div className="step-editor-row">
        <span className="step-editor-row-label warmup-rest-label">
          REST AFTER
        </span>
        <ClockInput
          value={draft.restValue}
          onChange={(next) => {
            setDraft((d) => ({ ...d, restValue: next }));
            setRestError(null);
          }}
          ariaLabel="Warm-up rest after"
          placeholder="NONE"
          invalid={restError !== null}
          errorId={restError !== null ? "warmup-rest-error" : undefined}
        />
      </div>
      {restError && (
        <p id="warmup-rest-error" className="field-error">
          {restError}
        </p>
      )}

      <div className="warmup-editor-actions">
        <button type="button" className="button-outline" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="button-primary warmup-save"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
      {/* Only offered once there is something to remove — editing a fresh
          OFF draft has nothing for this button to do. */}
      {current !== null && (
        <button
          type="button"
          className="button-outline warmup-remove"
          onClick={handleRemove}
        >
          Remove warm-up
        </button>
      )}
    </div>
  );
}

/** The You screen's Warm-up settings row (2026-08-09 warmup-setting spec
 *  §3), beside 6I's "Learning the app" row: same `.you-settings-row` shape
 *  (title left, a DIFFERENT fact in the meta slot on the right — "Learning
 *  the app" pairs with `START HERE · N OF 4`, this pairs with the status
 *  value alone, not the word "warm-up" restated — whole-branch review
 *  finding F), but a `<button>` rather than a `<Link>`, since tapping this
 *  one expands an editor in place instead of navigating. Self-contained
 *  (calls `usePreferences` directly), matching BaselineEditor.tsx's own
 *  pattern for the BASELINES card above it. */
export default function WarmupRow() {
  const preferencesState = usePreferences();
  const [open, setOpen] = useState(false);

  // `usePreferences` never regresses out of "ready" once reached (its own
  // file comment) and nothing here is interactive before the real value is
  // known, so there is no separate loading/error row worth inventing —
  // this simply renders nothing until the preference is loaded.
  if (preferencesState.state !== "ready") return null;

  const { warmup } = preferencesState.preferences;

  if (open) {
    return (
      <WarmupEditor
        current={warmup}
        save={preferencesState.save}
        onDone={() => setOpen(false)}
      />
    );
  }

  return (
    <button
      type="button"
      className="you-settings-row warmup-row-button"
      onClick={() => setOpen(true)}
    >
      <span className="you-settings-row-title">Warm-up</span>
      <span className="you-settings-row-meta mono-status">
        {warmup ? warmupValueText(warmup) : "OFF"}
      </span>
    </button>
  );
}
