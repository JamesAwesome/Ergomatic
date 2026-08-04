import { useEffect, useRef, useState } from "react";
import { clearDraft } from "./draft";
import { clearRun } from "./run";

/** How long an armed destructive control stays armed before silently
 *  disarming (DESIGN.md: "Auto-disarms on blur or 4s"). Originally introduced
 *  by WorkoutDetail.tsx's own Delete-workout flow (Task 1 fix round, commit
 *  e7f5e6a); this module is the shared home for that timing logic so
 *  Discard's three surfaces (Task 3) don't each hand-roll their own copy.
 *  WorkoutDetail.tsx imports this same constant rather than keeping its own
 *  — its own arm/disarm state stays local (it also tracks `deleting`, which
 *  this hook has no equivalent for), but the ONE number that has to agree
 *  across every armed control in the app now has exactly one definition. */
export const ARM_TIMEOUT_MS = 4000;

export interface StagedDiscard {
  /** Whether the control is currently armed — i.e. the NEXT `fire()` is the
   *  one that actually discards, not the first tap that merely arms it. */
  armed: boolean;
  /** First tap: arms the control and starts the 4s auto-disarm timer. */
  arm: () => void;
  /** Second tap (only meaningful while `armed`): clears the session's draft
   *  and run records — the shared, no-POST discard the whole app performs
   *  identically at every surface — and disarms. Callers still own whatever
   *  happens AFTER the discard (SessionComplete/LogSession navigate to
   *  `/today`; Today's own row instead just stops rendering itself, no
   *  navigation) — that's surface-specific, not this hook's concern. */
  fire: () => void;
  /** Resets to the unarmed state without discarding anything — wired to
   *  `onBlur` at every call site (DESIGN.md's "blur or 4s"), and called by
   *  the auto-disarm timer itself. Idempotent: calling it while already
   *  unarmed is a no-op past clearing a timer that no longer exists. */
  disarm: () => void;
}

/** The shared staged-discard state machine (Task 3, ui-fix round):
 *  `{armed, arm, fire, disarm}`, auto-disarming on blur or a 4s timeout
 *  (whichever comes first), extracted from WorkoutDetail.tsx's own Delete
 *  flow so SessionComplete/Today/LogSession share one implementation of the
 *  timing instead of three near-identical copies. The timer is cleared on
 *  unmount so a pending auto-disarm can never call `setState` on an
 *  already-unmounted component (e.g. the armed control's surface navigated
 *  away before the 4s elapsed). */
export function useStagedDiscard(): StagedDiscard {
  const [armed, setArmed] = useState(false);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (disarmTimer.current !== null) clearTimeout(disarmTimer.current);
    };
  }, []);

  function disarm() {
    if (disarmTimer.current !== null) {
      clearTimeout(disarmTimer.current);
      disarmTimer.current = null;
    }
    setArmed(false);
  }

  // Defensive: every call site only ever invokes `arm()` from the unarmed
  // branch of its own two-tap handler (WorkoutDetail.tsx's identical
  // `handleClick` shape), so this never actually fires against a live
  // timer today — clearing any prior timer first still means a hypothetical
  // future re-press-while-armed caller gets a full, fresh 4s window rather
  // than inheriting whatever was left of an earlier one.
  function arm() {
    if (disarmTimer.current !== null) clearTimeout(disarmTimer.current);
    setArmed(true);
    disarmTimer.current = setTimeout(disarm, ARM_TIMEOUT_MS);
  }

  // Never POSTs anything (task brief's own words) — `clearDraft`/`clearRun`
  // are both bare `localStorage.removeItem` calls, so this is safe to call
  // even when there's nothing staged to clear (Today's row, e.g., is only
  // ever rendered for a completed run in the first place, but this hook
  // itself has no way to know that, and doesn't need to).
  function fire() {
    disarm();
    clearDraft();
    clearRun();
  }

  return { armed, arm, fire, disarm };
}
