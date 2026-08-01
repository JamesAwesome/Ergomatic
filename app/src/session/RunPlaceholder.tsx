import { useState } from "react";
import { Navigate } from "react-router-dom";
import { draftSteps, loadDraft, type SessionDraft } from "./draft";

/** 6A's deliberate stand-in for 6B's real timer (spec: "Confirm targets").
 *  Its only job is to prove the session draft survives the confirm ->
 *  START -> reload round trip: it reads the draft fresh on every mount
 *  (never from a prop or router state), so an actual browser reload lands
 *  here exactly as if this were the first render. No draft (never
 *  confirmed, or cleared by Today's stale-draft sweep) redirects to
 *  /today, same rule ConfirmTargets.tsx follows. */
export default function RunPlaceholder() {
  const [draft] = useState<SessionDraft | null>(() => loadDraft());

  if (draft === null) {
    return <Navigate to="/today" replace />;
  }

  // "Effective step count" is draftSteps(draft).length verbatim — draft.ts's
  // own doc comment for draftSteps/effectiveSteps calls its output "the
  // effective steps" (removed indices dropped, SPM overrides and nudges
  // folded in), so this reuses that exact term rather than inventing a
  // second, competing notion of "how many steps" a draft has (e.g. the reps
  // marker's live-expanded count, which 6B's real timer will need but this
  // placeholder does not).
  const stepCount = draftSteps(draft).length;

  return (
    <main className="screen">
      <h1 className="screen-title">{draft.title}</h1>
      <p className="mono-status">
        {stepCount} step{stepCount === 1 ? "" : "s"}
      </p>
      <p className="placeholder-note">6B builds the timer here.</p>
    </main>
  );
}
