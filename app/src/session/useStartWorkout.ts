import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Step, WorkoutType } from "../../domain/types.js";
import { buildNudgedDraft, loadDraft, saveDraft, startDraft } from "./draft";
import { clearRun, loadRun } from "./run";
import {
  currentUnretired as currentUnretiredHandoff,
  retire as retireHandoff,
} from "../monitor/handoffStore";

/** The shape `startSession`/`handleStart` actually need from a workout —
 *  structurally compatible with `useWorkouts.ts`'s `LibraryWorkout` (this
 *  screen's own caller) without importing it, so any second caller can
 *  hand this a designated onboarding workout without needing a full
 *  `LibraryWorkout` record. (Phase 6I's BaselineCard was that second
 *  caller until Phase BL PR C replaced it with the pure-navigation doors
 *  card; today WorkoutDetail is the only caller, and the seam stays.) */
export interface StartableWorkout {
  id: string;
  title: string;
  type: WorkoutType;
  steps: Step[];
}

/** Two independent reasons can block an immediate start (WorkoutDetail's own
 *  descending-severity order, preserved here byte-for-byte): a
 *  completed-but-unlogged record (real data loss — nothing else will ever
 *  surface it again once overwritten) outranks a merely-started, not-yet-
 *  finished one (recoverable — the old session was never going to be logged
 *  anyway once abandoned). `null` means no stage; either non-null value both
 *  blocks the immediate `confirmReplace()` call AND picks the panel's copy,
 *  so the two can never disagree about which case triggered it. */
export type StartReplaceStage = "in-progress" | "unlogged" | null;

export interface UseStartWorkoutResult {
  /** `null` while the plain Start control should render; non-null while the
   *  staged replace-confirmation panel has taken over. */
  replaceStage: StartReplaceStage;
  /** Set only when `saveDraft` itself fails (quota, private-mode Safari) —
   *  surfaced inline rather than navigating to the countdown with nothing
   *  behind it. */
  startError: string | null;
  /** Start's own click handler: checks for a stale record (an unlogged or
   *  LIVE `SessionRun`, an unlogged or live `MonitorRun`, or a started-but-
   *  not-finished draft) and stages a replace confirmation instead of
   *  overwriting it outright; otherwise commits immediately. */
  handleStart: () => void;
  /** The "Replace session" press: builds and saves a fresh draft, cross-
   *  clears both the phone-side `SessionRun` and the monitor-side
   *  `MonitorRun` records, and navigates straight to the countdown. Also
   *  what `handleStart` itself calls when there is nothing to stage a
   *  confirmation for. */
  confirmReplace: () => void;
  /** The "Cancel" press: dismisses the staged panel, touching nothing. */
  cancelReplace: () => void;
}

/** WorkoutDetail's own start-guard flow (7B/6B-era `handleStart`/
 *  `startSession`), extracted verbatim so any second caller (Phase 6I's
 *  BaselineCard then; none today — BL PR C's doors card only navigates)
 *  gets the SAME unlogged-run staged confirm, live-MonitorRun confirm,
 *  draft build/save, and cross-clears — a bare navigate-and-start would
 *  reintroduce the F5 data-loss class this flow exists to prevent. Deliberately NOT extended
 *  to cover WorkoutDetail's OWN Connect/nudge paths (`handleConnectProceed`,
 *  `handleRowInstead`) — those stay in WorkoutDetail.tsx, out of this task's
 *  scope.
 *
 *  `nudges` (fast-follow spec §3, entry 1): the caller's own live preview
 *  nudge state, baked into the draft via `buildNudgedDraft` — WorkoutDetail
 *  passes its card's real state; a caller with no preview surface passes
 *  `{}` (BaselineCard did, before BL PR C deleted it). Closing over the
 *  CURRENT `nudges` value on every render
 *  is deliberate, not a bug: a fresh closure captures whatever the caller's
 *  own state holds at the moment Start is actually pressed, the same way
 *  every other per-render event handler in this codebase already works. */
export function useStartWorkout(
  workout: StartableWorkout,
  nudges: Record<number, number>,
): UseStartWorkoutResult {
  const [startError, setStartError] = useState<string | null>(null);
  const [replaceStage, setReplaceStage] = useState<StartReplaceStage>(null);
  const navigate = useNavigate();

  // Builds and saves the session draft, then hands off straight to the
  // countdown — ConfirmTargets (the old intermediate stop) is gone
  // (fast-follow spec §3). `startDraft` stamps `startedAt` at this exact
  // moment (adversarial B1: the field's real readers — this hook's own
  // live-session guard below, `Today.tsx`'s stale-draft janitor, and the
  // `/session/confirm` redirect shim's "started" arm — all need it stamped
  // from here on, now that no later screen stamps it for them). `saveDraft`
  // can fail (quota, private-mode Safari) without throwing; that's
  // surfaced inline rather than navigating to a countdown screen with
  // nothing behind it. `clearRun`/the MonitorRun retire below run only
  // AFTER a successful `saveDraft` — never before — so a save failure never
  // destroys a prior run record for nothing (the reviewer's F5 finding,
  // Phase 6B Task 4 fix round, and its Phase 7B Task 2 mirror for
  // `MonitorRun`).
  //
  // Hand-off store design spec section 5, plan Task 5: the legacy
  // clearMonitorRun() is gone here. A fresh, non-render read of
  // currentUnretired() (never the earlier existingMonitorEntry handleStart
  // read below -- that value can be stale by the time this later press
  // lands) finds whatever the store currently holds and retires it,
  // key-bound. This is what closes the "proven interim asymmetry" ROADMAP's
  // AUD-016 item named against this exact door: the legacy clearMonitorRun()
  // call removed the record from storage but left the store's own
  // current/tombstones untouched, so a late producer burst (the dead
  // hook's own linger window) could commit the record straight back --
  // retire() tombstones the key, which is what makes that late commit
  // refused instead.
  function confirmReplace() {
    const draft = startDraft(buildNudgedDraft(workout, nudges));
    if (saveDraft(draft)) {
      clearRun();
      const stale = currentUnretiredHandoff();
      if (stale !== null) {
        retireHandoff(
          [{ sessionKey: stale.sessionKey, revision: stale.revision }],
          "start-replace",
        );
      }
      navigate("/session/countdown");
    } else {
      setStartError("Couldn't start this session. Try again.");
    }
  }

  // Checked in order of severity: a completed-but-unlogged `SessionRun`
  // (real data loss) outranks a live-or-unlogged `MonitorRun`, which
  // outranks a merely-started `SessionDraft`. Checking the run first also
  // resolves the one case where both could be true at once (the SAME
  // workout's own detail page, revisited after finishing it): that reads as
  // "unlogged," the accurate description, not "in progress."
  //
  // ROADMAP M-1's "two exceptions untouched" rule: this reads `loadRun`
  // DIRECTLY, never rerouted through `anyLiveSession()`, which deliberately
  // collapses to "none" and would silently downgrade "unlogged" to "none"
  // — reintroducing the F5 data-loss class in the other direction.
  //
  // Hand-off store design spec §5, plan Task 5: the MonitorRun half now
  // reads `currentUnretired()` instead of `loadMonitorRun()` — the P1-1
  // hole at this second door, closed the same way Connect's own guard
  // closed it: `loadMonitorRun()` only ever saw the DURABLE tier, so a
  // record whose durable write failed (memory-only — Today's own store
  // read, Task 4, already renders a row for exactly this case) was
  // invisible here.
  function handleStart() {
    const existingRun = loadRun();
    if (existingRun !== null && existingRun.completedAt !== null) {
      setReplaceStage("unlogged");
      return;
    }
    const existingMonitorEntry = currentUnretiredHandoff();
    if (existingMonitorEntry !== null) {
      // Always "unlogged", never "in-progress" (queue item 3, mirroring
      // `connectGuardStage`'s own F6 spec 2b fix): a MonitorRun visible at
      // THIS door is dead the same way it is at Connect's — the connected
      // session lives on WorkoutDetail's own surface, and a reload or a
      // navigation away tears `useMonitorSession` down without ever
      // touching the record. There is no honest "in progress" left to
      // assert about it, live-looking `completedAt` or not.
      setReplaceStage("unlogged");
      return;
    }
    // A LIVE `SessionRun` (past the first check, `existingRun !== null`
    // means `completedAt === null`) stages "in-progress" on its own, not
    // only through its draft (Just Row without the monitor, spec
    // 2026-09-02, lifetime table ⟨F8⟩; exit criterion 6): a free-row run
    // (`mode: "justrow"`) has NO draft, so the started-draft check alone
    // let Start reach `confirmReplace()`'s `clearRun()` mid-row — the 6B
    // F5 data-loss shape, closed here at the guard rather than at one
    // caller. A workout's live run always has its started draft too, so
    // for it this clause changes nothing; it is checked at THIS rank (below
    // both "unlogged" arms) so the severity order above stays byte-for-byte.
    const existingDraft = loadDraft();
    if (
      existingRun !== null ||
      (existingDraft !== null && existingDraft.startedAt !== null)
    ) {
      setReplaceStage("in-progress");
      return;
    }
    confirmReplace();
  }

  function cancelReplace() {
    setReplaceStage(null);
  }

  return {
    replaceStage,
    startError,
    handleStart,
    confirmReplace,
    cancelReplace,
  };
}
