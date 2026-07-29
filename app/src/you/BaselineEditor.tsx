import { useState } from "react";
import { useBaselines } from "../api/useBaselines";
import { fmtSplit } from "../../domain/format.js";
import {
  commit,
  discard,
  initDraft,
  isDirty,
  nudge,
  type DraftState,
} from "./baselineDraft";

// Handoff reference values (docs/design/README.md §Domain model → Baselines):
// 112.0 s/500m for 2k, 122.0 s/500m for 6k. Used only to seed a brand-new
// rower's draft so the ± buttons and Apply have something sensible to work
// from; Apply still writes real numbers back to the API.
const SEED_K2 = 112;
const SEED_K6 = 122;

function BaselineRow({
  label,
  seconds,
  onFaster,
  onSlower,
}: {
  label: "2k" | "6k";
  seconds: number;
  onFaster: () => void;
  onSlower: () => void;
}) {
  return (
    <div className="baseline-row">
      <span className="baseline-label">{label}</span>
      <span className="baseline-value">{fmtSplit(seconds)}</span>
      <div className="baseline-steppers">
        <button
          type="button"
          className="baseline-stepper"
          aria-label={`${label} faster`}
          onClick={onFaster}
        >
          −
        </button>
        <button
          type="button"
          className="baseline-stepper"
          aria-label={`${label} slower`}
          onClick={onSlower}
        >
          +
        </button>
      </div>
    </div>
  );
}

function ConfirmLine({
  label,
  from,
  to,
}: {
  label: "2k" | "6k";
  from: number;
  to: number;
}) {
  if (from === to) return null;
  return (
    <p className="baseline-confirm-line">
      {label} {fmtSplit(from)} → {fmtSplit(to)}
    </p>
  );
}

function ReadyEditor({
  baselines,
  save,
}: {
  baselines: { k2Seconds: number | null; k6Seconds: number | null };
  save: (next: { k2Seconds: number; k6Seconds: number }) => Promise<void>;
}) {
  const seeded = baselines.k2Seconds === null || baselines.k6Seconds === null;
  const [state, setState] = useState<DraftState>(() =>
    initDraft(baselines.k2Seconds ?? SEED_K2, baselines.k6Seconds ?? SEED_K6),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = isDirty(state);

  const handleDiscard = () => {
    setState((s) => discard(s));
    setError(null);
  };

  const handleApply = async () => {
    setError(null);
    setSaving(true);
    try {
      await save({ k2Seconds: state.draft.k2, k6Seconds: state.draft.k6 });
      setState((s) => commit(s));
    } catch {
      setError("Couldn't save your baselines. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="baselines-card">
      {seeded && (
        <p className="baseline-prompt">
          No baselines yet — these are starting points to adjust with ± below.
        </p>
      )}
      <BaselineRow
        label="2k"
        seconds={state.draft.k2}
        onFaster={() => setState((s) => nudge(s, "k2", -1))}
        onSlower={() => setState((s) => nudge(s, "k2", 1))}
      />
      <BaselineRow
        label="6k"
        seconds={state.draft.k6}
        onFaster={() => setState((s) => nudge(s, "k6", -1))}
        onSlower={() => setState((s) => nudge(s, "k6", 1))}
      />
      {dirty && (
        <div className="baseline-confirm">
          <ConfirmLine
            label="2k"
            from={state.committed.k2}
            to={state.draft.k2}
          />
          <ConfirmLine
            label="6k"
            from={state.committed.k6}
            to={state.draft.k6}
          />
          {error && <p className="baseline-error">{error}</p>}
          <div className="baseline-actions">
            <button
              type="button"
              className="button-outline"
              onClick={handleDiscard}
              disabled={saving}
            >
              Discard
            </button>
            <button
              type="button"
              className="button-primary baseline-apply"
              onClick={handleApply}
              disabled={saving}
            >
              Apply baselines
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BaselineEditor() {
  const state = useBaselines();

  if (state.state === "loading") {
    return (
      <div className="baselines-card">
        <p className="mono-status">LOADING…</p>
      </div>
    );
  }

  if (state.state === "error") {
    return (
      <div className="baselines-card">
        <p className="mono-status">Couldn't load your baselines.</p>
        <button type="button" className="button-outline" onClick={state.retry}>
          Retry
        </button>
      </div>
    );
  }

  return <ReadyEditor baselines={state.baselines} save={state.save} />;
}
