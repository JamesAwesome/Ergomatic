import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBaselines, type BaselinesPatch } from "../api/useBaselines";
import { MOST_COMMON_ESTIMATE } from "../../domain/estimateBaseline.js";
import { BaselineRow } from "../you/BaselineEditor";
import {
  initDraft,
  isDirty,
  nudge,
  type DraftState,
} from "../you/baselineDraft";

/** Door 2 — "I know my baseline" (canvas Experienced): the editor's
 *  fields brought forward as an onboarding screen. Same components
 *  (BaselineRow, the draft machinery) and the same send discipline as
 *  the You editor: a field rides the body iff the rower TOUCHED it and
 *  its value differs from the server's — an untouched side's displayed
 *  seed is display scaffolding, never a saved claim (Finding 1's rule;
 *  writing the seeds because the rower tapped Save would fabricate a
 *  baseline for a distance they never entered). Save is therefore
 *  disabled until something is actually entered — the one deliberate
 *  divergence from the static canvas, which cannot draw disabled
 *  states (DEVIATIONS row). Every write here is `manual`: this door's
 *  whole meaning is "the rower knows the number".
 *
 *  A partial pair prefills the known side with the SERVER value (shown
 *  as-is; untouched it stays out of the body, so the doors' superset
 *  render can never cost a stored number its source). */
function ReadyKnow({
  baselines,
  save,
}: {
  baselines: { k2Seconds: number | null; k6Seconds: number | null };
  save: (next: BaselinesPatch) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<DraftState>(() =>
    initDraft(
      baselines.k2Seconds ?? MOST_COMMON_ESTIMATE.k2Seconds,
      baselines.k6Seconds ?? MOST_COMMON_ESTIMATE.k6Seconds,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const patch: BaselinesPatch = {};
      const changed = (which: "k2" | "k6"): boolean => {
        const server =
          which === "k2" ? baselines.k2Seconds : baselines.k6Seconds;
        return server === null || state.draft[which] !== server;
      };
      if (state.touched.k2 && changed("k2")) {
        patch.k2Seconds = state.draft.k2;
        patch.k2Source = "manual";
      }
      if (state.touched.k6 && changed("k6")) {
        patch.k6Seconds = state.draft.k6;
        patch.k6Source = "manual";
      }
      if (Object.keys(patch).length > 0) {
        await save(patch);
      }
      navigate("/today");
    } catch {
      setError("Couldn't save your baselines. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="screen onb-screen">
      <span className="mono-status">I KNOW MY BASELINE</span>
      <h1 className="screen-title onb-title">Enter your splits</h1>
      <p className="onb-body">
        Average 500m splits from a recent 2k and 6k. Close enough is fine.
      </p>
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
      {error && <p className="baseline-error">{error}</p>}
      <div className="onb-foot">
        <button
          type="button"
          className="button-l1"
          disabled={saving || !isDirty(state)}
          onClick={() => void handleSave()}
        >
          Save baseline
        </button>
        <button
          type="button"
          className="button-outline onb-back"
          disabled={saving}
          onClick={() => navigate("/today")}
        >
          Back
        </button>
      </div>
    </main>
  );
}

export default function KnowBaseline() {
  const state = useBaselines();

  if (state.state === "loading") {
    return (
      <main className="screen onb-screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (state.state === "error") {
    return (
      <main className="screen onb-screen">
        <p className="mono-status">Couldn't load your baselines.</p>
        <button type="button" className="button-outline" onClick={state.retry}>
          Retry
        </button>
      </main>
    );
  }

  return <ReadyKnow baselines={state.baselines} save={state.save} />;
}
