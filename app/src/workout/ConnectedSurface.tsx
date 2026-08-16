// The connected surface (7B Task 6, handoff §§3-4): the pane shell, the
// swipe, the labelled pager, End, and the two mid-session states. It
// replaces Task 5's one-line phase gate — the interstitial still owns the
// `useMonitorSession` instance and hands its value down, so the radio is
// never torn down and rebuilt at the handoff (this file calls no driver, no
// transport and no `monitorRun` function; the plan's layering rule).
//
// Task 7 filled pane C's slot (`connected/PaneGrid.tsx`) and hung the
// diagnostics sheet off the pager (handoff §5) — the two things this file
// gained are the grid's entry in the render switch and `useTripleTap`
// below. Everything else here is Task 6's and unchanged.
//
// THE MOUNT QUESTION (inherited from Task 4, decided here): **the surface
// UNMOUNTS at `ended`, and the hook's existing unmount teardown owns the
// hang-up.** No explicit hang-up is added to `useMonitorSession`.
// Reasoning:
//  - `endSession()` already closes the record and terminates the machine;
//    what it deliberately does NOT do is drop the radio, because the
//    teardown path already does exactly that and doing it twice would make
//    "best effort" mean two different things in one flow.
//  - The ended state needs no live radio ONCE THE HAND-OFF RELEASES — and
//    not one moment before (hardware walk day 2, 2026-08-11; the effect
//    below and `useMonitorSession`'s `FINISH_HANDOFF_HOLD_MS` carry the
//    capture). This bullet used to read "the ended state needs no live
//    radio. Nothing on it reads a frame; the next screen is the log, which
//    reads the closed `MonitorRun` record," and that is the exact premise
//    the walk falsified: at a natural finish the PM5 sends the final
//    interval's split pair ~1 ms AFTER the frame that ends the workout, so
//    for that ~1 ms the ended state needs both the radio and the driver
//    subscription, and the record the log screen reads is not finished
//    until the pair lands. Hanging up on the `ended` render cost the rower
//    the measurement ("0 OF 1 INTERVALS MEASURED" over a rowed-out piece).
//    The hang-up is now deferred behind `session.handoffHeld`, below: it is
//    the HAND-OFF that waits, never the rower, who sees this frame the
//    instant the machine finishes.
//  - Staying mounted would mean holding a GATT connection open for as long
//    as the rower takes to write up their session — on iOS, across
//    backgrounding — for no reader at all.
// So `ended` renders one hand-off frame and fires `onEnded`, whose caller
// (the workout detail) navigates away. The navigation unmounts the
// interstitial, which unmounts the hook, which hangs up. If a future caller
// ever wants the surface to persist past `ended`, THAT change is what has
// to add the explicit hang-up — the offer stands, unexercised.

import { useEffect, useRef, useState } from "react";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { MonitorSession } from "../monitor/useMonitorSession";
import { ARM_TIMEOUT_MS } from "../session/useStagedDiscard";
import type { EnginePhase } from "../session/engine";
import ConnectionLogSheet from "./connected/ConnectionLogSheet";
import PagerRail, { PANES, type PaneId } from "./connected/PagerRail";
import PaneGrid from "./connected/PaneGrid";
import PaneLive from "./connected/PaneLive";
import { buildSurfaceModel } from "./connected/surfaceModel";

/** Which pane the rower was last on, PER ROWER — not per workout (handoff
 *  §3: "whichever pane the rower last used (per rower, not per workout)…
 *  a rower who lives in the grid shouldn't re-swipe every session"). Same
 *  best-effort plain-string storage idiom as `LAST_DEVICE_KEY`: nothing
 *  here needs migrating, and a missing or garbage value reads identically
 *  to "never connected before". */
export const LAST_PANE_KEY = "ergomatic.lastConnectedPane";

/** "B on the first connected session" (handoff §3) — B is why you
 *  connected. */
export const DEFAULT_PANE: PaneId = "live";

// eslint-disable-next-line react-refresh/only-export-components
export function loadLastPane(): PaneId {
  try {
    const stored = localStorage.getItem(LAST_PANE_KEY);
    return PANES.includes(stored as PaneId) ? (stored as PaneId) : DEFAULT_PANE;
  } catch {
    return DEFAULT_PANE;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function saveLastPane(pane: PaneId): void {
  try {
    localStorage.setItem(LAST_PANE_KEY, pane);
  } catch {
    // best-effort: a failed persist never interrupts a rowing session
  }
}

/** Handoff §3: "Swipe anywhere on the surface, 60px threshold, is the real
 *  navigation; the rail is confirmation and a fallback." */
export const SWIPE_THRESHOLD_PX = 60;

/** Clamped step through `PANES`: the ends do not wrap. A wrap would send a
 *  rower who swiped past the grid back to the timer, which reads as the
 *  surface having lost its place. */
// eslint-disable-next-line react-refresh/only-export-components
export function paneAfterSwipe(current: PaneId, deltaX: number): PaneId {
  if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return current;
  const index = PANES.indexOf(current);
  // Swiping LEFT (negative delta) moves forward through the panes, the way
  // a horizontal pager always has.
  const next = deltaX < 0 ? index + 1 : index - 1;
  // `!`, not `?? current`: the index is clamped into range on the line
  // above, so the fallback was a branch no test could ever reach.
  return PANES[Math.min(Math.max(next, 0), PANES.length - 1)]!;
}

/** End's two-tap staging (handoff §3: "staged: `Tap again to end` for 4 s").
 *  Local state, the shared 4 s constant — the same split `WorkoutDetail`'s
 *  own delete flow uses, and for the same reason: the timing is the thing
 *  that must agree app-wide, not the state shape. `useStagedDiscard` itself
 *  is not reusable here because its `fire()` clears the phone timer's draft
 *  and run records, which a monitor session does not own. */
function useStagedEnd(): {
  armed: boolean;
  arm: () => void;
  disarm: () => void;
} {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  function disarm(): void {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setArmed(false);
  }

  function arm(): void {
    // Unconditional rather than guarded (`useStagedDiscard`'s equivalent
    // guard is documented there as defensive and is unreachable for the
    // same reason: the only caller checks `armed` first). `clearTimeout`
    // ignores `undefined`, so this keeps the "a re-arm gets a full fresh
    // window" property with no branch nothing can exercise.
    clearTimeout(timer.current ?? undefined);
    setArmed(true);
    timer.current = setTimeout(disarm, ARM_TIMEOUT_MS);
  }

  return { armed, arm, disarm };
}

/** How long a tap stays "part of the same gesture" (handoff §5's "three
 *  deliberate taps"). Not a long-press timer — there is nothing to hold and
 *  nothing to trip while steadying the phone; this is the gap BETWEEN taps,
 *  and it only ever cancels an accidental double, never fires anything on
 *  its own. 600ms is the same order as a platform double-click threshold,
 *  slow enough for a gloved thumb and far too fast to reach by tapping
 *  through panes. */
export const TRIPLE_TAP_WINDOW_MS = 600;

/** Handoff §5's diagnostics gesture: three taps on the SAME pager target,
 *  each within `TRIPLE_TAP_WINDOW_MS` of the last. Two taps do nothing (the
 *  pin the mutation round exists for) — and tapping a DIFFERENT target
 *  restarts the count at one, because that is a rower navigating, not a
 *  rower asking for the log. */
function useTripleTap(onTriple: () => void): (pane: PaneId) => void {
  const count = useRef(0);
  const lastPane = useRef<PaneId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  return function tap(pane: PaneId): void {
    clearTimeout(timer.current ?? undefined);
    count.current = lastPane.current === pane ? count.current + 1 : 1;
    lastPane.current = pane;
    if (count.current >= 3) {
      count.current = 0;
      lastPane.current = null;
      timer.current = null;
      onTriple();
      return;
    }
    timer.current = setTimeout(() => {
      count.current = 0;
      lastPane.current = null;
      timer.current = null;
    }, TRIPLE_TAP_WINDOW_MS);
  };
}

export interface ConnectedSurfaceProps {
  /** The workout's own frozen phases (`buildRun`'s output) — the phone's
   *  half of the story: what each target MEANS and where this interval sits
   *  in the session. The machine supplies every raw number. */
  phases: EnginePhase[];
  /** What was actually programmed — the denominator of `INTERVAL n OF m`. */
  program: WorkoutProgram;
  /** The live hook value, owned by the interstitial above. */
  session: MonitorSession;
  /** The session is over (End, or the machine got there first): route to
   *  the post-session flow. See this file's header on the mount decision —
   *  this callback is expected to navigate, and that navigation is what
   *  hangs up the radio. */
  onEnded: () => void;
}

export default function ConnectedSurface({
  phases,
  program,
  session,
  onEnded,
}: ConnectedSurfaceProps) {
  const [pane, setPane] = useState<PaneId>(() => loadLastPane());
  const touchStartX = useRef<number | null>(null);
  const end = useStagedEnd();
  const [logOpen, setLogOpen] = useState(false);
  /** The pager target the third tap landed on — SheetShell restores focus
   *  to whatever opened it, and for this sheet that is a button the rail
   *  owns, not one this component renders. */
  const logOpener = useRef<HTMLElement | null>(null);
  const registerTap = useTripleTap(() => setLogOpen(true));

  // Fires once per ending, whichever side ended it. `endedBy` is already
  // whatever the truth was ("machine" when the PM finished or was stopped
  // at the erg, "user" when End was pressed); nothing here needs to tell
  // them apart, because both land on the same log.
  //
  // ...but never while the hand-off is HELD (walk day 2, 2026-08-11 —
  // `useMonitorSession`'s `FINISH_HANDOFF_HOLD_MS` carries the capture). The
  // caller's `onEnded` navigates, navigating unmounts the interstitial, and
  // unmounting tears down the driver subscription the final interval's split
  // is still ~1 ms away from arriving on. So the ended FRAME renders
  // immediately (the rower is told at once) and the hand-off waits behind it
  // — for the boundary, the machine's next tick, a disconnect, or that
  // hold's own bounded backstop, whichever comes first. `handoffHeld` is
  // `false` at every other moment in a session's life, including every
  // ending that has nothing to wait for, so this reads as "fire on ended"
  // exactly as it always did in all of them.
  const endedRef = useRef(false);
  useEffect(() => {
    if (session.phase !== "ended" || session.handoffHeld || endedRef.current) {
      return;
    }
    endedRef.current = true;
    onEnded();
  }, [session.phase, session.handoffHeld, onEnded]);

  function choosePane(next: PaneId): void {
    setPane(next);
    saveLastPane(next);
  }

  /** A rail press does BOTH things, always: it selects the pane (the rail
   *  is "confirmation and a fallback" for the swipe) and it counts towards
   *  the diagnostics gesture. Three presses on the grid target therefore
   *  land on the grid AND open the log — the sheet is a modal over
   *  whichever pane the rower was heading for. */
  function handleRailPress(next: PaneId, target: HTMLElement): void {
    logOpener.current = target;
    choosePane(next);
    registerTap(next);
  }

  function handleTouchStart(event: React.TouchEvent<HTMLElement>): void {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLElement>): void {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) return;
    const next = paneAfterSwipe(pane, endX - start);
    // A swipe is NOT a tap: the gesture that opens diagnostics is three
    // deliberate presses on one 56px target, and a rower flicking between
    // panes must never fall into it.
    if (next !== pane) choosePane(next);
  }

  function handleEnd(): void {
    if (!end.armed) {
      end.arm();
      return;
    }
    end.disarm();
    void session.endSession();
  }

  const model = buildSurfaceModel({
    phases,
    program,
    phase: session.phase,
    frame: session.frame,
    deviceName: session.deviceName,
    actuals: session.actuals,
  });

  if (session.phase === "ended") {
    // One frame, then gone (see the header's mount decision). Not a dead
    // end: `onEnded` has already fired above, and its caller navigates.
    return (
      <main className="screen connected-surface connected-surface-ended">
        <p className="connected-status-label">SESSION ENDED</p>
        <p className="connected-serif-line">That is the session</p>
        <p className="connected-body-line">
          {session.endedBy === "machine"
            ? "The monitor finished it. Your numbers are kept."
            : "Your numbers are kept."}
        </p>
      </main>
    );
  }

  return (
    <main
      className="screen connected-surface"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* THE SAFETY FIX (connected-revamp Task 6, James 2026-08-12 reading
          the captures): the old full-width footer button "could easily be
          touched accidentally if somebody tries to change views mid-row" —
          every point along the bottom edge WAS End's hit box, so a short
          stumble that never travels the 60px swipe threshold landed as a
          tap on it. End now lives in this small header instead: a 44pt
          outlined control (revision §2) that does not span the surface's
          width and sits at the TOP edge, clear of the vertical middle a
          real swipe gesture crosses. Rendered UNCONDITIONALLY — paused or
          not — so its own row never changes height and nothing below it
          (the pane body) ever shifts; the paused block gets its own,
          additional END/AGAIN affordance in the slot End vacated (below),
          off the SAME armed state, but this header control keeps working
          too. Staging is unchanged: first tap arms `TAP AGAIN` for
          `ARM_TIMEOUT_MS`, exactly as before — the size and position
          changed, not the confirm.

          THE LABEL IS THE MOCKUP'S (`Ergomatic connected mode.dc.html`
          :297/:379/:510/:559 — `END`, and `TAP AGAIN` armed, revision §2's
          own staging wording), not the old bar's sentence. It is why the
          box measures ~50px instead of the 109px the sentence cost, on the
          one control this task exists to shrink. The ACCESSIBLE name keeps
          the sentence (`aria-label`): a dozen selectors across unit and e2e
          key on "End session", the visible word alone would collide with
          the paused block's own `END`, and "END" is a prefix of "End
          session" so WCAG 2.5.3's label-in-name still holds. */}
      <div className="connected-header">
        <button
          type="button"
          className={
            end.armed ? "connected-end connected-end-armed" : "connected-end"
          }
          aria-label={end.armed ? "Tap again to end" : "End session"}
          onClick={handleEnd}
          onBlur={end.disarm}
        >
          {end.armed ? "TAP AGAIN" : "END"}
        </button>
      </div>
      {model.stale && <LostBanner />}
      <div className="connected-surface-body">
        {pane === "live" && <PaneLive model={model} />}
        {pane === "grid" && <PaneGrid model={model} />}
      </div>
      {/* End's old footer slot survives as the paused block's home (handoff
          §4: "Same height, so nothing above shifts"), but it no longer
          RESERVES anything — JAMES RULING 2026-08-12, fix round: the 52px
          this wrapper used to hold open stood empty for the whole session
          and the rower only ever saw it as dead space between the pane and
          the pager. It is now a zero-height anchor (`index.css`'s
          `.connected-surface-footer { height: 0; position: relative }`) and
          the paused block is absolutely positioned out of flow inside it,
          painting UP from the pane's bottom edge when the erg stops. Both
          halves of handoff §4's promise still hold, and more literally than
          the reserved-slot version did: nothing above shifts (the block
          costs the layout nothing in EITHER state, so there is no height to
          change), and the space the reservation was spending goes back to
          the pane — a whole extra grid row in each orientation. What the
          rower sees while paused is the ink band OVER the bottom 52px of
          the pane, not the pane rearranging itself underneath it. */}
      <div className="connected-surface-footer">
        {model.status === "paused" && (
          <PausedBlock armed={end.armed} onEnd={handleEnd} />
        )}
      </div>
      <PagerRail active={pane} onSelect={handleRailPress} />
      {logOpen && (
        <ConnectionLogSheet
          deviceCaption={model.deviceCaption}
          elapsedDisplay={model.elapsedDisplay}
          readLog={session.exportLog}
          program={program}
          opener={logOpener}
          onClose={() => setLogOpen(false)}
        />
      )}
    </main>
  );
}

/** Handoff §4, with the spec's descope framing. The handoff's own banner
 *  reads `LOST THE MONITOR · RECONNECTING` over "Keep rowing. The erg is
 *  still counting." and puts three sign-of-life squares at its right —
 *  every one of those promises a reconnect attempt. There is none: design
 *  spec C5 descopes auto-reconnect to a named follow-on ("7B ships
 *  lose-and-degrade"), because no transport this app ships can reconnect
 *  mid-piece. So the banner states the fact and what still works, and
 *  nothing on it moves. The `RECONNECTED · CAUGHT UP` banner and the grid
 *  backfill go with the same descope. */
function LostBanner() {
  return (
    <div className="connected-lost" role="status">
      <span className="connected-lost-title">LOST THE MONITOR</span>
      <span className="connected-lost-body">
        Row on. The erg is still counting and End keeps what we saw.
      </span>
    </div>
  );
}

/** Handoff §4's paused treatment. CONNECTED-REVAMP TASK 6: this used to
 *  take End's OWN 52px slot (the two were mutually exclusive occupants of
 *  one footer); End now lives in the header instead (always on screen,
 *  never hidden by pause), and this block owns that slot ALONE — as an
 *  OVERLAY, out of flow, so the slot costs nothing while rowing (see the
 *  footer's own comment above). The phone owns no Pause, so there is no
 *  transport row to hide, and nothing above may shift when the rower stops
 *  pulling — nothing MOVES at all now, in either direction. `END`
 *  stays inside it, 64×44 and accent-outlined, so ending is still possible
 *  without reaching for the header, and it is "staged as everywhere else"
 *  (§5's own caption) off the SAME arm state the header's End control uses
 *  — a rower who armed either one and then stopped (or started) pulling
 *  finds the other in the same armed state, not silently reset. */
function PausedBlock({ armed, onEnd }: { armed: boolean; onEnd: () => void }) {
  return (
    <div className="connected-paused">
      <span className="connected-paused-label">PAUSED · PULL TO RESUME</span>
      <button
        type="button"
        className={
          armed
            ? "connected-paused-end connected-paused-end-armed"
            : "connected-paused-end"
        }
        onClick={onEnd}
      >
        {armed ? "AGAIN" : "END"}
      </button>
    </div>
  );
}
