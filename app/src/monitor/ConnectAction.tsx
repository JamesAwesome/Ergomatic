import { useState } from "react";
import { connectGuardStage, type ConnectGuardStage } from "./monitorRun";

/**
 * The Connect door and the lock in front of it (7B Task 2, spec §3 — "the
 * F5 walk, closed").
 *
 * **Why this exists as its own component, unmounted, in a task that ships
 * no screens.** 7B's plan builds the seam and the guards first (Tasks 1-3,
 * no screens) and the flow second: `onProceed` had nothing to hand off to
 * until `useMonitorSession` (Task 4) and the interstitial (Task 5) existed,
 * and mounting a Connect button that led nowhere would have put a dead
 * control on the app's most-used screen. So Task 2 shipped the guard
 * COMPLETE and proven — the predicate, both staged sentences, both confirm
 * paths, both cancel paths — for Task 5 to mount as-is. **Shipped (Task
 * 5):** `<ConnectAction onProceed={…} />` is now mounted in
 * `WorkoutDetail`'s `.action-stack`; the `LAST USED · <name>` caption and
 * the Bluetooth-off dashed treatment live in
 * `ConnectedInterstitial.tsx`/`WorkoutDetail.tsx`, applied from OUTSIDE
 * this component's own markup — **the guard logic below was not
 * re-derived or moved.**
 *
 * **Fast-follow spec §4 amendment (unrelated "Task 5" — the fast-follow
 * plan's own Task 5, not 7B's above):** Connect is now the screen's SINGLE
 * primary, FIRST in the stack, ahead of Start Timer — the handoff's old
 * "second in the stack, after Start" ordering above is superseded. The
 * trigger's own class also moved off `.button-l2` onto `.button-connect`
 * (below): L1 geometry, its own `--action-connect` token, never `--accent`
 * (one red, one blue, never two reds — tokens.css's amended "accent means
 * exactly four things" comment).
 *
 * What the lock is for: `onProceed` (Task 5's `handleConnectProceed`)
 * compiles the workout and mounts the interstitial, which calls
 * `useMonitorSession`'s `connect()`/`program()`. `createMonitorRun`
 * (`monitorRun.ts`), whose `clearRun()` is unconditional and undoable, is
 * NOT called synchronously from here — `useMonitorSession.ts` deliberately
 * opens the record only at the first REAL ROWING FRAME, never at a mere
 * press or a successful pair, so a connect attempt that fails or is
 * abandoned before rowing starts destroys nothing (verified directly:
 * `e2e/session.spec.ts`'s "Connect anyway" test, and
 * `WorkoutDetail.test.tsx`'s real-transport-missing test, both against the
 * REAL hook). The guard's warning is still the honest one: a
 * finished-but-unlogged `SessionRun` sitting in `RUN_KEY` — real, permanent
 * history — WILL be gone once a connected session gets underway, 6B's F5
 * incident's shape, once removed from the trigger by however long pairing
 * and programming take. `connectGuardStage()` reads that record directly
 * rather than through `anyLiveSession()`; its own doc comment quotes
 * ROADMAP M-1 on why, and that choice is what the "route it through
 * `anyLiveSession()`" mutation targets.
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
            ? "You have an unlogged session. Connecting discards it."
            : "A session is in progress. Replace it?"}
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
              as Start's own "Replace session" hands off to
              `useStartWorkout.ts`'s `confirmReplace` (Phase 6I Task 4:
              extracted from WorkoutDetail's own former `startSession`)
              rather than reaching into storage from the panel. */}
          <button type="button" className="button-primary" onClick={onProceed}>
            Connect anyway
          </button>
        </div>
      </div>
    );
  }

  // "Connect" — one word. Fast-follow spec §4: no longer L2 ("it must not
  // compete with Start" is the OLD handoff §1 ruling this supersedes) —
  // Connect is now the screen's single primary, L1 geometry via its own
  // `.button-connect` class and `--action-connect` token.
  return (
    <button type="button" className="button-connect" onClick={handleConnect}>
      Connect
    </button>
  );
}
