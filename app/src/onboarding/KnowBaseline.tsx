import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBaselines, type BaselinesPatch } from "../api/useBaselines";
import { MOST_COMMON_ESTIMATE } from "../../domain/estimateBaseline.js";
import BackLink from "../shell/BackLink";
import BaselineField from "../you/BaselineField";
import {
  initDraft,
  isDirty,
  nudge,
  setDraft,
  type DraftState,
} from "../you/baselineDraft";

/** Door 2 — "I know my baseline" (canvas Experienced, Option T since
 *  James's 2026-08-23 feedback): typed split entry — tap a field, the
 *  numeric keypad opens, digits fill right to left (152 -> 1:52) — in
 *  place of the steppers that took 27 taps to reach 1:58 from the 2:25
 *  seed. Since the one-control round (2026-08-24) the same field ALSO
 *  nudges: the unified `BaselineField` owns this screen's chrome, so a
 *  rower who learned minus/plus on door 1 finds them here too.
 *  Same draft machinery and the same send discipline as the You
 *  editor: a field rides the body iff the rower TOUCHED it and its value
 *  differs from the server's — an untouched side's displayed seed is
 *  display scaffolding, never a saved claim (Finding 1's rule), and a
 *  retyped identical value keeps its stored source (the ORIGIN ruling:
 *  provenance describes where the NUMBER came from, so an unchanged value
 *  keeps its stamp). Save is therefore disabled until something is
 *  actually typed. Every write here is `manual`: this door's whole
 *  meaning is "the rower knows the number".
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
  // Raw nulls (honest-empty round): an unset side reaches the field as
  // unset and renders EMPTY, with the estimate table's modal cell as its
  // dim placeholder rather than as a value it never earned.
  const [state, setState] = useState<DraftState>(() =>
    initDraft(baselines.k2Seconds, baselines.k6Seconds),
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
      // `!`: the draft's touched-implies-a-number invariant
      // (baselineDraft.ts's header).
      if (state.touched.k2 && changed("k2")) {
        patch.k2Seconds = state.draft.k2!;
        patch.k2Source = "manual";
      }
      if (state.touched.k6 && changed("k6")) {
        patch.k6Seconds = state.draft.k6!;
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
      <BackLink fallback="/today" disabled={saving} />
      <span className="mono-status">I KNOW MY BASELINE</span>
      <h1 className="screen-title onb-title">Enter your splits</h1>
      <p className="onb-body">
        Tap a field and type the digits. 152 becomes 1:52. Or nudge with minus
        and plus.
      </p>
      <div className="onb-field">
        <span className="onb-field-label mono-status">2K BASELINE</span>
        <BaselineField
          label="2k"
          seconds={state.draft.k2}
          seed={MOST_COMMON_ESTIMATE.k2Seconds}
          onType={(v) => setState((s) => setDraft(s, "k2", v))}
          onNudge={(d) => setState((s) => nudge(s, "k2", d))}
          className="onb-field-input"
        >
          <span className="onb-field-unit" aria-hidden="true">
            /500m
          </span>
        </BaselineField>
      </div>
      <div className="onb-field">
        <span className="onb-field-label mono-status">6K BASELINE</span>
        <BaselineField
          label="6k"
          seconds={state.draft.k6}
          seed={MOST_COMMON_ESTIMATE.k6Seconds}
          onType={(v) => setState((s) => setDraft(s, "k6", v))}
          onNudge={(d) => setState((s) => nudge(s, "k6", d))}
          className="onb-field-input"
        >
          <span className="onb-field-unit" aria-hidden="true">
            /500m
          </span>
        </BaselineField>
      </div>
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
