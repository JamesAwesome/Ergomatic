import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BackLink from "../shell/BackLink";
import { useBaselines, type BaselinesPatch } from "../api/useBaselines";
import {
  K2_K6_OFFSET_SECONDS,
  deriveK2FromK6,
  deriveK6FromK2,
} from "../../domain/deriveBaseline.js";
import { fmtSplit } from "../../domain/format.js";
import {
  estimateFor,
  type Cardio,
  type Experience,
} from "../../domain/estimateBaseline.js";
import BaselineField from "../you/BaselineField";
import {
  MAX_SPLIT,
  MIN_SPLIT,
  initDraft,
  nudge,
  setDraft,
  type DraftState,
} from "../you/baselineDraft";
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

/** A missing side's offered fill: the table's cell (`estimated`, the
 *  both-missing case) or a derivation from the rower's own stored
 *  counterpart (`derived`, F1's ruling). */
interface Fill {
  value: number;
  source: "estimated" | "derived";
}

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
 *  replaced or rewritten (no canvas artboard draws this partial state;
 *  the ` · YOURS` suffix is the stated design, DEVIATIONS row).
 *  `suffix` labels a derived fill in the DeriveSlot vocabulary
 *  ("FROM YOUR 6K (−7s)") so the rower sees exactly what they are
 *  consenting to write. */
function OfferRow({
  label,
  seconds,
  yours,
  suffix,
}: {
  label: "2K BASELINE" | "6K BASELINE";
  seconds: number;
  yours: boolean;
  suffix?: string;
}) {
  return (
    <div className="onb-offer-row">
      <span className="onb-offer-label mono-status">
        {yours ? `${label} · YOURS` : suffix ? `${label} · ${suffix}` : label}
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
        {/* Top-left BACK, the app's `.back-link` convention (James's
            2026-08-23 feedback round: the bottom Back broke the house
            idiom). Destinations unchanged: Q1 exits to Today, Q2 returns
            to Q1 with the answer kept (transient STATE, not widget). */}
        {isFirst ? (
          <BackLink fallback="/today" />
        ) : (
          <button
            type="button"
            className="back-link"
            onClick={() => setStep("experience")}
          >
            ← BACK
          </button>
        )}
        <div className="onb-header">
          <span className="mono-status">RECOMMEND MY BASELINE</span>
          <StepDots filled={isFirst ? 1 : 2} />
        </div>
        <h1 className="screen-title onb-title">{question}</h1>
        {/* Confirming an answer (tap, or Enter/Space) advances by itself
            (James's auto-advance feedback, 2026-08-23) — immediately, no
            dwell timer (house style: no animation; the next screen's
            filled step dot is the feedback). Arrow keys only move the
            selection (OptionGroup's contract), so a keyboard user is
            never yanked forward mid-browse; for them the answer enables
            Next, which stays as the explicit path — and as the Back
            re-entry path, where the answer is already selected. */}
        {isFirst ? (
          <OptionGroup
            options={EXPERIENCE_OPTIONS}
            value={experience}
            onChange={setExperience}
            onConfirm={() => setStep("cardio")}
            ariaLabel={question}
          />
        ) : (
          <OptionGroup
            options={CARDIO_OPTIONS}
            value={cardio}
            onChange={setCardio}
            onConfirm={() => setStep("offer")}
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
        </div>
      </main>
    );
  }

  // Both answers exist past the questions (Next is disabled until each is
  // chosen, and Back never clears one).
  const cell = estimateFor(experience!, cardio!);
  // M8, binding: a number that already exists server-side is the rower's
  // own — shown as such, never replaced, and never written by the accept.
  //
  // The missing side's FILL (F1, James's ruling at the triad review,
  // 2026-08-23): beside an existing number, the fill comes FROM THAT
  // NUMBER via the shipped derivation (±K2_K6_OFFSET_SECONDS), written
  // `derived` — the rower's own number is better evidence than two
  // survey answers, and the pair is consistent by construction. Only the
  // both-missing case uses the table (`estimated`, both sides). Should a
  // derivation ever leave the storable band (needs a stored split within
  // 7s of the 60/240 edges — unreachable from this flow's own writes,
  // but the You editor accepts the full band), the fill falls back to
  // the table's cell, honestly re-tagged `estimated`.
  const k2Existing = baselines.k2Seconds !== null;
  const k6Existing = baselines.k6Seconds !== null;
  const inBand = (v: number) => v >= MIN_SPLIT && v <= MAX_SPLIT;
  const fillFor = (which: "k2" | "k6"): Fill => {
    const counterpart =
      which === "k2" ? baselines.k6Seconds : baselines.k2Seconds;
    if (counterpart !== null) {
      const derived =
        which === "k2"
          ? deriveK2FromK6(counterpart)
          : deriveK6FromK2(counterpart);
      if (inBand(derived)) return { value: derived, source: "derived" };
    }
    return {
      value: which === "k2" ? cell.k2Seconds : cell.k6Seconds,
      source: "estimated",
    };
  };
  const fills = { k2: fillFor("k2"), k6: fillFor("k6") };
  const offered = {
    k2: baselines.k2Seconds ?? fills.k2.value,
    k6: baselines.k6Seconds ?? fills.k6.value,
  };
  // The DeriveSlot vocabulary, so what the rower sees and what gets
  // stored agree (the editor's own "ESTIMATE FROM 6K (−7s)" family).
  const derivedSuffix = (which: "k2" | "k6"): string | undefined =>
    fills[which].source === "derived"
      ? which === "k2"
        ? `FROM YOUR 6K (−${K2_K6_OFFSET_SECONDS}s)`
        : `FROM YOUR 2K (+${K2_K6_OFFSET_SECONDS}s)`
      : undefined;

  if (step === "offer") {
    const handleUse = () => {
      // Exactly the fields the rower saw OFFERED, with the source they
      // saw labeled (table -> estimated, derived-from-yours -> derived) —
      // an existing number stays out of the body entirely (M8). Both
      // missing is the doors' normal case; both existing (reachable only
      // by racing another device) degrades to a plain navigate.
      const patch: BaselinesPatch = {};
      if (!k2Existing) {
        patch.k2Seconds = fills.k2.value;
        patch.k2Source = fills.k2.source;
      }
      if (!k6Existing) {
        patch.k6Seconds = fills.k6.value;
        patch.k6Source = fills.k6.source;
      }
      void doSave(patch);
    };
    return (
      <main className="screen onb-screen">
        {/* This screen used to have no Back at all (the only exits were
            accept or adjust); the top-left convention gives it one, back
            to the cardio question with both answers kept. */}
        <button
          type="button"
          className="back-link"
          disabled={saving}
          onClick={() => setStep("cardio")}
        >
          ← BACK
        </button>
        <div className="onb-header">
          <span className="mono-status">RECOMMEND MY BASELINE</span>
          <StepDots filled={3} />
        </div>
        <h1 className="screen-title onb-title">Your starting baseline</h1>
        <OfferRow
          label="2K BASELINE"
          seconds={offered.k2}
          yours={k2Existing}
          suffix={derivedSuffix("k2")}
        />
        <OfferRow
          label="6K BASELINE"
          seconds={offered.k6}
          yours={k6Existing}
          suffix={derivedSuffix("k6")}
        />
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
            className="button-outline onb-secondary"
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
      fills={fills}
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

/** Door 1's "Adjust the numbers first": the editor's own unified fields
 *  (`BaselineField`, the real component) prefilled with the
 *  recommendation. Since the one-control round (2026-08-24) those fields
 *  are TYPABLE as well as nudgeable — reaching 1:58 from a 2:25 prefill
 *  used to cost 54 taps here, because this was the one surface with no
 *  keypad. This step is NEVER empty: a prefilled number is PROPOSED, not
 *  unset, so it renders at full accent strength. Dimming means "not a
 *  value at all" — it is never how this app says "we suggested this", and
 *  the offer step the rower just came from is where the fill's provenance
 *  is named. Save semantics —
 *  THE PREFILL-PROVENANCE ANSWER, walked against the ORIGIN ruling
 *  (provenance describes where the NUMBER came from, never the act):
 *  - a server-null side always rides the body (this flow exists to fill
 *    it); its source is the FILL's own (`estimated` for a table cell,
 *    `derived` for an F1 derivation from the rower's stored counterpart)
 *    while its value still equals that fill — tapping Save is consent to
 *    write, not authorship — and `manual` the moment the rower moved it
 *    somewhere else. The exact analogue of the editor's own DeriveSlot
 *    predicate, including away-and-back landing on the fill value: that
 *    is the fill's number again, so its source stands.
 *  - a server-set side (M8) prefills with the SERVER value and stays out
 *    of the body unless the rower actually moved it — then it is a
 *    deliberate manual replacement. */
function AdjustStep({
  baselines,
  fills,
  prefill,
  saving,
  error,
  onSave,
  onBack,
}: {
  baselines: { k2Seconds: number | null; k6Seconds: number | null };
  fills: { k2: Fill; k6: Fill };
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
    for (const which of ["k2", "k6"] as const) {
      const server = which === "k2" ? baselines.k2Seconds : baselines.k6Seconds;
      // `!`: this step initialises from the prefill, which is always a
      // number (an existing baseline or the fill), and nothing here can
      // clear a field back to unset — so the draft cannot be null. It is
      // the one baseline surface with no empty state at all.
      const draft = state.draft[which]!;
      if (server === null) {
        // Always written: filling this side is what the flow is FOR.
        patch[which === "k2" ? "k2Seconds" : "k6Seconds"] = draft;
        patch[which === "k2" ? "k2Source" : "k6Source"] =
          draft === fills[which].value ? fills[which].source : "manual";
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
      <button
        type="button"
        className="back-link"
        disabled={saving}
        onClick={onBack}
      >
        ← BACK
      </button>
      <div className="onb-header">
        <span className="mono-status">RECOMMEND MY BASELINE</span>
        <StepDots filled={3} />
      </div>
      <h1 className="screen-title onb-title">Adjust your starting baseline</h1>
      <p className="onb-body">
        Tap a value to type it, or nudge with minus and plus.
      </p>
      <div className="baseline-row">
        <span className="baseline-label">2k</span>
        <BaselineField
          label="2k"
          seconds={state.draft.k2}
          seed={prefill.k2}
          onType={(v) => setState((s) => setDraft(s, "k2", v))}
          onNudge={(d) => setState((s) => nudge(s, "k2", d))}
          className="baseline-input"
        />
      </div>
      <div className="baseline-row">
        <span className="baseline-label">6k</span>
        <BaselineField
          label="6k"
          seconds={state.draft.k6}
          seed={prefill.k6}
          onType={(v) => setState((s) => setDraft(s, "k6", v))}
          onNudge={(d) => setState((s) => nudge(s, "k6", d))}
          className="baseline-input"
        />
      </div>
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
