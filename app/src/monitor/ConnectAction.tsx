import { useState } from "react";
import { connectGuardStage, type ConnectGuardStage } from "./monitorRun";

/**
 * The Connect door and the lock in front of it (7B Task 2, spec §3 — "the
 * F5 walk, closed").
 *
 * **Why this exists as its own component, unmounted, in a task that ships
 * no screens.** 7B's plan builds the seam and the guards first (Tasks 1-3,
 * no screens) and the flow second: `onProceed` has nothing to hand off to
 * until `useMonitorSession` (Task 4) and the interstitial (Task 5) exist,
 * and mounting a Connect button that leads nowhere would put a dead control
 * on the app's most-used screen. So Task 2 ships the guard COMPLETE and
 * proven — the predicate, both staged sentences, both confirm paths, both
 * cancel paths — and Task 5's remaining job on this file is presentation:
 * render `<ConnectAction onProceed={…} />` into `WorkoutDetail`'s
 * `.action-stack` (second in the stack, after Start, per the handoff's §1),
 * add the `LAST USED · <name>` caption and the Bluetooth-off dashed
 * treatment around the button below, and gate the whole thing on a
 * transport being present. **The guard logic is not Task 5's to re-derive
 * or to move.**
 *
 * What the lock is for: `onProceed` ends up in `createMonitorRun`
 * (`monitorRun.ts`), whose `clearRun()` is unconditional and undoable. A
 * finished-but-unlogged `SessionRun` sitting in `RUN_KEY` is real, permanent
 * history the moment it is gone — 6B's F5 incident, shipped once already.
 * `connectGuardStage()` reads that record directly rather than through
 * `anyLiveSession()`; its own doc comment quotes ROADMAP M-1 on why, and
 * that choice is what the "route it through `anyLiveSession()`" mutation
 * targets.
 *
 * The staged confirm is `WorkoutDetail`'s own idiom, not a new one: the same
 * `.baseline-confirm` panel replacing the button in place, the same
 * Cancel-beside-a-primary pair, the same two sentences chosen by the same
 * two-value union. No auto-disarm timer — `ARM_TIMEOUT_MS`
 * (`session/useStagedDiscard.ts`) belongs to the OTHER house idiom, the L4
 * control that arms in place (this screen's own Delete workout); a
 * two-button panel that has replaced its trigger cannot be left ambiguously
 * armed and so has never carried one. Cancel is the only way back.
 */
export default function ConnectAction({
  onProceed,
}: {
  onProceed: () => void;
}) {
  // One nullable union, not a boolean plus a reason — `WorkoutDetail`'s own
  // `replaceStage` comment explains the choice: either non-null value both
  // blocks the immediate `onProceed()` AND picks the panel's copy, so the
  // two can never disagree about which case triggered the stage.
  const [stage, setStage] = useState<ConnectGuardStage>(null);

  function handleConnect() {
    const staged = connectGuardStage();
    if (staged !== null) {
      setStage(staged);
      return;
    }
    onProceed();
  }

  if (stage !== null) {
    return (
      <div className="baseline-confirm">
        <p className="baseline-confirm-line">
          {stage === "unlogged"
            ? "You have an unlogged session — connecting discards it."
            : "A session is in progress — replace it?"}
        </p>
        <div className="baseline-actions">
          <button
            type="button"
            className="button-outline"
            onClick={() => setStage(null)}
          >
            Cancel
          </button>
          {/* Straight to `onProceed`, with no clearing of its own: the
              destruction belongs to `createMonitorRun` downstream, exactly
              as Start's own "Replace session" hands off to `startSession`
              rather than reaching into storage from the panel. */}
          <button type="button" className="button-primary" onClick={onProceed}>
            Connect anyway
          </button>
        </div>
      </div>
    );
  }

  // "Connect" — one word, per the handoff's §1 ruling ("it must not compete
  // with Start"), L2 like the rest of the stack's secondary blocks.
  return (
    <button type="button" className="button-l2" onClick={handleConnect}>
      Connect
    </button>
  );
}
