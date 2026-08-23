import { useState } from "react";
import { api } from "../api";

/** Phase BL PR C — Reset baseline setup (spec rev 2's "Reset onboarding"
 *  ruling, James): a deliberate, staged-confirm action on You that clears
 *  BOTH baseline numbers AND both stored sources (DELETE /api/baselines
 *  deletes the row whole), returning the account to the true no-baseline
 *  state — Today renders the three doors again. This is what makes the
 *  doors re-enterable for ANY account, not just brand-new ones, and it
 *  serves a rower who wants a fresh start.
 *
 *  Staged confirm in the editor's own `.baseline-confirm` vocabulary
 *  (confirm line + Cancel/lead action pair) — destructive, so the copy
 *  says plainly what it does and nothing fires on the first tap.
 *  `onReset` lets You remount the editor so its draft re-seeds from the
 *  now-empty server state instead of showing stale committed numbers. */
export default function ResetBaselineSetup({
  onReset,
}: {
  onReset: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api("/api/baselines", { method: "DELETE" });
      if (!res.ok) throw new Error("failed to clear baselines");
      setArmed(false);
      onReset();
    } catch {
      setError("Couldn't reset your baseline setup. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!armed) {
    return (
      <div className="reset-baselines">
        <button
          type="button"
          className="button-outline"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
        >
          Reset baseline setup
        </button>
      </div>
    );
  }

  return (
    <div className="reset-baselines">
      <div className="baseline-confirm">
        <p className="baseline-confirm-line">
          This clears both baseline splits. Workouts with pace targets lose them
          and can't be started until you set a baseline again. Today offers the
          setup doors.
        </p>
        {error && <p className="baseline-error">{error}</p>}
        <div className="baseline-actions">
          <button
            type="button"
            className="button-outline"
            onClick={() => setArmed(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={() => void handleReset()}
            disabled={busy}
          >
            Reset baseline setup
          </button>
        </div>
      </div>
    </div>
  );
}
