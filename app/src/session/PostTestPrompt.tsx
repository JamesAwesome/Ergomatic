import { useState } from "react";
import { api } from "../api";
import { fmtSplit } from "../../domain/format.js";
import { K2_K6_OFFSET_SECONDS } from "../../domain/deriveBaseline.js";
import { counterpartOffer, type PostTestOffer } from "./postTestOffer";

/** Phase BL PR B (baseline-onboarding spec 2026-08-22 rev 2, "The
 *  post-test prompt"): the post-save baseline offer.
 *
 *  POST-SAVE ONLY is binding, not a style choice (spec M6): rendering
 *  this above the save stack would flip `accountBaselines` live on
 *  accept and swap the two save buttons under the rower's thumb at the
 *  exact moment the 6I protection applies; mounting only after a
 *  successful save also removes the accept+discard state from the matrix
 *  entirely. The doors (LogSession.tsx) render this INSTEAD of the
 *  summary once the 201 has landed and the records are cleared.
 *
 *  What this screen owns: the baseline write, and only that. RECORDING
 *  already happened — the save flow fired POST /api/test-history before
 *  this mounted (James's ruling: every designated-test session with a
 *  measurable result records, accept or decline) — so "Not now" simply
 *  finishes the navigation the save started; nothing is lost with it.
 *
 *  Two stages, both optional, neither blocking:
 *  1. The measured result as the new baseline: accept PUTs the number
 *     with a `tested` source — the number and its provenance move
 *     together, the wire PR A built.
 *  2. If the OTHER side is missing, or the freshly-accepted number lands
 *     inconsistent with its stored counterpart (postTestOffer.ts's
 *     `counterpartOffer`), the existing ±7s derivation is offered as a
 *     second write carrying `derived`. `stored === null` (the baselines
 *     fetch never resolved) skips stage 2 honestly: without the stored
 *     pair there is no basis for either the missing-side or the
 *     inconsistency claim, and the accept itself needs no such basis.
 *
 *  Version-skew honesty (ROADMAP BL, durable fact 1): `tested` is the
 *  stored origin of this number today, not a permanent badge — an older
 *  client's editor can later legitimately overwrite it. No copy here
 *  promises otherwise. */
export default function PostTestPrompt({
  offer,
  stored,
  onDone,
}: {
  offer: PostTestOffer;
  stored: { k2Seconds: number | null; k6Seconds: number | null } | null;
  onDone: () => void;
}) {
  const [counterpart, setCounterpart] = useState<PostTestOffer | null>(null);
  const [stage, setStage] = useState<"primary" | "counterpart">("primary");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = stage === "primary" ? offer : counterpart!;
  const side = active.distance === "2k" ? "2k" : "6k";

  async function put(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    setSaving(true);
    try {
      const res = await api("/api/baselines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
      return true;
    } catch {
      setError("Couldn't save your baseline. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAcceptTested() {
    const body =
      offer.distance === "2k"
        ? { k2Seconds: offer.splitSeconds, k2Source: "tested" }
        : { k6Seconds: offer.splitSeconds, k6Source: "tested" };
    if (!(await put(body))) return;
    const next = stored !== null ? counterpartOffer(offer, stored) : null;
    if (next === null) {
      onDone();
      return;
    }
    setCounterpart(next);
    setStage("counterpart");
  }

  async function handleAcceptDerived() {
    const cp = counterpart!;
    const body =
      cp.distance === "2k"
        ? { k2Seconds: cp.splitSeconds, k2Source: "derived" }
        : { k6Seconds: cp.splitSeconds, k6Source: "derived" };
    if (!(await put(body))) return;
    onDone();
  }

  // PM final-PR gate C2 (2026-08-22): the counterpart stage has TWO
  // honest shapes, not one. Missing side -> "Also set" (nothing is
  // lost by accepting). Stored-but-inconsistent side -> the accept
  // OVERWRITES a real number (possibly a tested one) with the ±7s
  // estimate, so the copy says REPLACE and shows the number being
  // replaced — render-only branching; the wire body is identical and
  // still touches only the counterpart side.
  const replacingValue =
    stage === "counterpart" && stored !== null
      ? counterpart!.distance === "2k"
        ? stored.k2Seconds
        : stored.k6Seconds
      : null;

  const savedLine =
    stage === "primary"
      ? "SESSION SAVED"
      : `${offer.distance.toUpperCase()} BASELINE SET`;
  const heading =
    stage === "primary"
      ? `Set your ${side} baseline?`
      : replacingValue !== null
        ? `Replace your ${side}?`
        : `Also set your ${side}?`;
  const caption =
    stage === "primary"
      ? "AVG SPLIT · MEASURED THIS SESSION"
      : replacingValue !== null
        ? `CURRENTLY ${fmtSplit(replacingValue)} · THIS ESTIMATE ${fmtSplit(
            active.splitSeconds,
          )}`
        : offer.distance === "2k"
          ? `ESTIMATED FROM YOUR 2K (+${K2_K6_OFFSET_SECONDS}s)`
          : `ESTIMATED FROM YOUR 6K (−${K2_K6_OFFSET_SECONDS}s)`;
  const acceptLabel =
    stage === "primary"
      ? `Set ${side} baseline`
      : replacingValue !== null
        ? `Replace ${side} baseline`
        : `Set ${side} estimate`;
  const declineLabel = stage === "primary" ? "Not now" : "Skip";
  const handleAccept =
    stage === "primary" ? handleAcceptTested : handleAcceptDerived;

  return (
    <main className="screen posttest-screen">
      <p className="mono-status posttest-saved">{savedLine}</p>
      <h1 className="screen-title">{heading}</h1>
      <p className="posttest-value">{fmtSplit(active.splitSeconds)}</p>
      <p className="mono-status posttest-caption">{caption}</p>
      {error && <p className="baseline-error">{error}</p>}
      <div className="posttest-actions">
        <button
          type="button"
          className="button-primary"
          onClick={() => void handleAccept()}
          disabled={saving}
        >
          {acceptLabel}
        </button>
        <button
          type="button"
          className="button-outline"
          onClick={onDone}
          disabled={saving}
        >
          {declineLabel}
        </button>
      </div>
    </main>
  );
}
