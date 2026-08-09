import { useState } from "react";
import { useBaselines } from "../api/useBaselines";
import { fmtSplit } from "../../domain/format.js";
import {
  K2_K6_OFFSET_SECONDS,
  deriveK2FromK6,
  deriveK6FromK2,
} from "../../domain/deriveBaseline.js";
import {
  MAX_SPLIT,
  MIN_SPLIT,
  commit,
  discard,
  initDraft,
  isDirty,
  nudge,
  setDraft,
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

/** ui-notes round, item 2 — the derivation OFFER. Reads the raw, nullable
 *  `baselines` prop (never the DRAFT, which is never actually empty: an
 *  unset side is seeded to SEED_K2/SEED_K6 the instant `initDraft` runs) so
 *  "exactly one side has a value" means exactly one of these API-level
 *  fields is non-null — the only place that fact still exists. Returns
 *  `null` whenever there's nothing to offer, including when the raw
 *  derivation would leave the editor's own MIN_SPLIT/MAX_SPLIT bounds: an
 *  offer that then silently clamped to a different number than its own
 *  "−7s"/"+7s" copy promised would be a small lie, not a convenience. */
function deriveOffer(baselines: {
  k2Seconds: number | null;
  k6Seconds: number | null;
}): { which: "k2" | "k6"; value: number } | null {
  if (baselines.k2Seconds === null && baselines.k6Seconds !== null) {
    const value = deriveK2FromK6(baselines.k6Seconds);
    return value >= MIN_SPLIT && value <= MAX_SPLIT
      ? { which: "k2", value }
      : null;
  }
  if (baselines.k6Seconds === null && baselines.k2Seconds !== null) {
    const value = deriveK6FromK2(baselines.k2Seconds);
    return value >= MIN_SPLIT && value <= MAX_SPLIT
      ? { which: "k6", value }
      : null;
  }
  return null;
}

function ReadyEditor({
  baselines,
  save,
}: {
  baselines: { k2Seconds: number | null; k6Seconds: number | null };
  save: (next: { k2Seconds: number; k6Seconds: number }) => Promise<void>;
}) {
  // "No baselines yet" is only true when NEITHER side has a real, rowed
  // value — with exactly one set (the derivation-offer state, item 2), the
  // OTHER side's number IS a real baseline, so this prompt would falsely
  // deny it (found capturing this round's own screenshot, recurring-
  // failure #7). `initDraft` below still seeds whichever side is null
  // regardless of this flag — only the copy's condition changed.
  const seeded = baselines.k2Seconds === null && baselines.k6Seconds === null;
  const [state, setState] = useState<DraftState>(() =>
    initDraft(baselines.k2Seconds ?? SEED_K2, baselines.k6Seconds ?? SEED_K6),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = isDirty(state);
  const offer = deriveOffer(baselines);

  const handleDiscard = () => {
    setState((s) => discard(s));
    setError(null);
  };

  const handleFillFromOffer = () => {
    if (!offer) return;
    setState((s) => setDraft(s, offer.which, offer.value));
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
          No baselines yet. These are starting points to adjust with ± below.
        </p>
      )}
      <BaselineRow
        label="2k"
        seconds={state.draft.k2}
        onFaster={() => setState((s) => nudge(s, "k2", -1))}
        onSlower={() => setState((s) => nudge(s, "k2", 1))}
      />
      {offer?.which === "k2" && (
        <button
          type="button"
          className="button-l3 baseline-derive"
          onClick={handleFillFromOffer}
        >
          {`ESTIMATE FROM 6K (−${K2_K6_OFFSET_SECONDS}s)`}
        </button>
      )}
      <BaselineRow
        label="6k"
        seconds={state.draft.k6}
        onFaster={() => setState((s) => nudge(s, "k6", -1))}
        onSlower={() => setState((s) => nudge(s, "k6", 1))}
      />
      {offer?.which === "k6" && (
        <button
          type="button"
          className="button-l3 baseline-derive"
          onClick={handleFillFromOffer}
        >
          {`ESTIMATE FROM 2K (+${K2_K6_OFFSET_SECONDS}s)`}
        </button>
      )}
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
