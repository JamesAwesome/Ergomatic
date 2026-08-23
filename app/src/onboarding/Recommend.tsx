import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBaselines, type BaselinesPatch } from "../api/useBaselines";
import { fmtSplit } from "../../domain/format.js";
import {
  estimateFor,
  type BaselineEstimate,
  type Cardio,
  type Experience,
} from "../../domain/estimateBaseline.js";
import { BaselineRow } from "../you/BaselineEditor";
import { initDraft, nudge, type DraftState } from "../you/baselineDraft";
import OptionGroup from "./OptionGroup";

// Canvas Question1 — the four experience options, verbatim. The VALUES are
// domain keys (estimateBaseline.ts); the copy lives here with the screen.
const EXPERIENCE_OPTIONS: readonly { value: Experience; label: string }[] = [
  { value: "never", label: "Never, or once or twice" },
  { value: "a-little", label: "A little. I know the stroke" },
  { value: "regularly", label: "Regularly, on and off" },
  { value: "a-lot", label: "A lot. I have raced or trained" },
];

// Canvas Question2, verbatim.
const CARDIO_OPTIONS: readonly { value: Cardio; label: string }[] = [
  { value: "starting", label: "Just getting started" },
  { value: "1-2-week", label: "Active once or twice a week" },
  { value: "most-days", label: "Active most days" },
  { value: "training-hard", label: "Training hard and often" },
];

// Canvas Recommendation's dashed honesty chip, verbatim.
const HONESTY_CHIP =
  "A COMFORTABLE STARTING POINT. YOUR PLAN'S FIRST TEST WILL MEASURE THE " +
  "REAL THING, AND YOU CAN ADJUST ON THE YOU TAB ANY TIME.";

type Step = "experience" | "cardio" | "offer" | "adjust";

/** The canvas's three mono step dots (Question1/Question2/Recommendation):
 *  filled up to the current step. Decorative — the visually-hidden text
 *  carries the same fact for a screen reader. The adjust step keeps 3/3
 *  (it is the recommendation, being adjusted, not a fourth step). */
function StepDots({ filled }: { filled: 1 | 2 | 3 }) {
  return (
    <>
      <div className="onb-dots" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className="onb-dot" data-filled={n <= filled} />
        ))}
      </div>
      <span className="visually-hidden">Step {filled} of 3</span>
    </>
  );
}

/** One recommendation row (canvas Recommendation): mono eyebrow label,
 *  mono-large split with a /500m suffix. `yours` marks a number that
 *  already exists server-side — M8: it is shown AS the rower's own, never
 *  replaced by the table's cell (no canvas artboard draws this partial
 *  state; the ` · YOURS` suffix is the stated design, DEVIATIONS row). */
function OfferRow({
  label,
  seconds,
  yours,
}: {
  label: "2K BASELINE" | "6K BASELINE";
  seconds: number;
  yours: boolean;
}) {
  return (
    <div className="onb-offer-row">
      <span className="onb-offer-label mono-status">
        {yours ? `${label} · YOURS` : label}
      </span>
      <span className="onb-offer-value">
        {fmtSplit(seconds)}
        <span className="onb-offer-unit"> /500m</span>
      </span>
    </div>
  );
}

function ReadyRecommend({
  baselines,
  save,
}: {
  baselines: { k2Seconds: number | null; k6Seconds: number | null };
  save: (next: BaselinesPatch) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("experience");
  // TRANSIENT, deliberately (the spec's minimal-PII ruling): the answers
  // live in this component's state only — never persisted, never sent.
  // The single network write either path can make is the baseline PUT.
  const [experience, setExperience] = useState<Experience | null>(null);
  const [cardio, setCardio] = useState<Cardio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const doSave = async (patch: BaselinesPatch) => {
    setError(null);
    setSaving(true);
    try {
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

  if (step === "experience" || step === "cardio") {
    const isFirst = step === "experience";
    const question = isFirst
      ? "How much have you rowed?"
      : "How is your cardio right now?";
    const answered = isFirst ? experience !== null : cardio !== null;
    return (
      <main className="screen onb-screen">
        <div className="onb-header">
          <span className="mono-status">RECOMMEND MY BASELINE</span>
          <StepDots filled={isFirst ? 1 : 2} />
        </div>
        <h1 className="screen-title onb-title">{question}</h1>
        {isFirst ? (
          <OptionGroup
            options={EXPERIENCE_OPTIONS}
            value={experience}
            onChange={setExperience}
            ariaLabel={question}
          />
        ) : (
          <OptionGroup
            options={CARDIO_OPTIONS}
            value={cardio}
            onChange={setCardio}
            ariaLabel={question}
          />
        )}
        <div className="onb-foot">
          <button
            type="button"
            className="button-l1"
            disabled={!answered}
            onClick={() => setStep(isFirst ? "cardio" : "offer")}
          >
            Next
          </button>
          <button
            type="button"
            className="button-outline onb-back"
            onClick={() =>
              isFirst ? navigate("/today") : setStep("experience")
            }
          >
            Back
          </button>
        </div>
      </main>
    );
  }

  // Both answers exist past the questions (Next is disabled until each is
  // chosen, and Back never clears one).
  const cell = estimateFor(experience!, cardio!);
  // M8, binding: a number that already exists server-side is the rower's
  // own — shown as such, never replaced by the table's cell, and never
  // written by the accept. The offer per side is the server value where
  // one exists, the estimate where none does.
  const k2Existing = baselines.k2Seconds !== null;
  const k6Existing = baselines.k6Seconds !== null;
  const offered = {
    k2: baselines.k2Seconds ?? cell.k2Seconds,
    k6: baselines.k6Seconds ?? cell.k6Seconds,
  };

  if (step === "offer") {
    const handleUse = () => {
      // Exactly the fields the rower saw OFFERED as estimates — an
      // existing number stays out of the body entirely (M8). Both
      // missing is the doors' normal case; both existing (reachable only
      // by racing another device) degrades to a plain navigate.
      const patch: BaselinesPatch = {};
      if (!k2Existing) {
        patch.k2Seconds = cell.k2Seconds;
        patch.k2Source = "estimated";
      }
      if (!k6Existing) {
        patch.k6Seconds = cell.k6Seconds;
        patch.k6Source = "estimated";
      }
      void doSave(patch);
    };
    return (
      <main className="screen onb-screen">
        <div className="onb-header">
          <span className="mono-status">RECOMMEND MY BASELINE</span>
          <StepDots filled={3} />
        </div>
        <h1 className="screen-title onb-title">Your starting baseline</h1>
        <OfferRow label="2K BASELINE" seconds={offered.k2} yours={k2Existing} />
        <OfferRow label="6K BASELINE" seconds={offered.k6} yours={k6Existing} />
        <span className="onb-chip mono-status">{HONESTY_CHIP}</span>
        {error && <p className="baseline-error">{error}</p>}
        <div className="onb-foot">
          <button
            type="button"
            className="button-l1"
            disabled={saving}
            onClick={handleUse}
          >
            Use this baseline
          </button>
          <button
            type="button"
            className="button-outline onb-back"
            disabled={saving}
            onClick={() => setStep("adjust")}
          >
            Adjust the numbers first
          </button>
        </div>
      </main>
    );
  }

  return (
    <AdjustStep
      key="adjust"
      baselines={baselines}
      cell={cell}
      prefill={offered}
      saving={saving}
      error={error}
      onSave={doSave}
      onBack={() => {
        setError(null);
        setStep("offer");
      }}
    />
  );
}

/** Door 1's "Adjust the numbers first": the editor's fields (BaselineRow,
 *  the real component) prefilled with the recommendation. Save semantics —
 *  THE PREFILL-PROVENANCE ANSWER, walked against the ORIGIN ruling
 *  (provenance describes where the NUMBER came from, never the act):
 *  - a server-null side always rides the body (this flow exists to fill
 *    it); its source is `estimated` while its value IS the table's cell —
 *    tapping Save is consent to write, not authorship — and `manual` the
 *    moment the rower moved it somewhere else. The exact analogue of the
 *    editor's own DeriveSlot predicate (offer-value -> derived,
 *    adjusted -> manual), including away-and-back landing on the cell
 *    value: that is the table's number again, so `estimated` stands.
 *  - a server-set side (M8) prefills with the SERVER value and stays out
 *    of the body unless the rower actually moved it — then it is a
 *    deliberate manual replacement. */
function AdjustStep({
  baselines,
  cell,
  prefill,
  saving,
  error,
  onSave,
  onBack,
}: {
  baselines: { k2Seconds: number | null; k6Seconds: number | null };
  cell: BaselineEstimate;
  prefill: { k2: number; k6: number };
  saving: boolean;
  error: string | null;
  onSave: (patch: BaselinesPatch) => Promise<void>;
  onBack: () => void;
}) {
  const [state, setState] = useState<DraftState>(() =>
    initDraft(prefill.k2, prefill.k6),
  );

  const handleSave = () => {
    const patch: BaselinesPatch = {};
    const estimateValue = { k2: cell.k2Seconds, k6: cell.k6Seconds };
    for (const which of ["k2", "k6"] as const) {
      const server = which === "k2" ? baselines.k2Seconds : baselines.k6Seconds;
      const draft = state.draft[which];
      if (server === null) {
        // Always written: filling this side is what the flow is FOR.
        patch[which === "k2" ? "k2Seconds" : "k6Seconds"] = draft;
        patch[which === "k2" ? "k2Source" : "k6Source"] =
          draft === estimateValue[which] ? "estimated" : "manual";
      } else if (draft !== server) {
        patch[which === "k2" ? "k2Seconds" : "k6Seconds"] = draft;
        patch[which === "k2" ? "k2Source" : "k6Source"] = "manual";
      }
      // server-set and unmoved: out of the body (M8; ORIGIN — the stored
      // number and its stored source both stand).
    }
    void onSave(patch);
  };

  return (
    <main className="screen onb-screen">
      <div className="onb-header">
        <span className="mono-status">RECOMMEND MY BASELINE</span>
        <StepDots filled={3} />
      </div>
      <h1 className="screen-title onb-title">Adjust your starting baseline</h1>
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
          disabled={saving}
          onClick={handleSave}
        >
          Save baseline
        </button>
        <button
          type="button"
          className="button-outline onb-back"
          disabled={saving}
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </main>
  );
}

/** Door 1 — "Recommend my baseline" (canvas Question1 / Question2 /
 *  Recommendation): two transient single-select questions, the 16-cell
 *  table's recommended pair, then either a one-tap accept (writing
 *  `estimated`) or the editor prefilled. */
export default function Recommend() {
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

  return <ReadyRecommend baselines={state.baselines} save={state.save} />;
}
