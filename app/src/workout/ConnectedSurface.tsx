// The connected surface (7B Task 6, handoff §§3-4): the pane shell, the
// swipe, the labelled pager, End, and the two mid-session states. It
// replaces Task 5's one-line phase gate — the interstitial still owns the
// `useMonitorSession` instance and hands its value down, so the radio is
// never torn down and rebuilt at the handoff (this file calls no driver, no
// transport and no `monitorRun` function; the plan's layering rule).
//
// PANE C IS TASK 7'S. The pager reaches it and the shell renders its slot,
// but what is inside that slot today is a placeholder naming the boundary.
// Nothing else in this file knows the difference — pane C arrives as one
// more entry in `PANE_ORDER`'s render switch.
//
// THE MOUNT QUESTION (inherited from Task 4, decided here): **the surface
// UNMOUNTS at `ended`, and the hook's existing unmount teardown owns the
// hang-up.** No explicit hang-up is added to `useMonitorSession`.
// Reasoning:
//  - `endSession()` already closes the record and terminates the machine;
//    what it deliberately does NOT do is drop the radio, because the
//    teardown path already does exactly that and doing it twice would make
//    "best effort" mean two different things in one flow.
//  - The ended state needs no live radio. Nothing on it reads a frame; the
//    next screen is the log, which reads the closed `MonitorRun` record.
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
import PagerRail, { PANES, type PaneId } from "./connected/PagerRail";
import PaneLive from "./connected/PaneLive";
import PaneTimer from "./connected/PaneTimer";
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

  // Fires once per ending, whichever side ended it. `endedBy` is already
  // whatever the truth was ("machine" when the PM finished or was stopped
  // at the erg, "user" when End was pressed); nothing here needs to tell
  // them apart, because both land on the same log.
  const endedRef = useRef(false);
  useEffect(() => {
    if (session.phase !== "ended" || endedRef.current) return;
    endedRef.current = true;
    onEnded();
  }, [session.phase, onEnded]);

  function choosePane(next: PaneId): void {
    setPane(next);
    saveLastPane(next);
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
      {model.stale && <LostBanner />}
      <div className="connected-surface-body">
        {pane === "timer" && <PaneTimer model={model} />}
        {pane === "live" && <PaneLive model={model} />}
        {pane === "grid" && (
          // TASK 7's. The slot exists so the pager can reach it and so the
          // shell's own layout is the real one; the grid, its row states and
          // the diagnostics sheet arrive in that task.
          <div className="connected-pane connected-pane-grid-placeholder">
            <p className="connected-status-label">GRID</p>
            <p className="connected-body-line">
              The interval grid arrives with the next drop.
            </p>
          </div>
        )}
      </div>
      {/* The paused block and End occupy the SAME 52px slot (handoff §4:
          "Same height, so nothing above shifts"). The height lives on this
          wrapper, not on either child, which is what makes the swap
          structurally exact rather than two numbers kept equal by hand. */}
      <div className="connected-surface-footer">
        {model.status === "paused" ? (
          <PausedBlock armed={end.armed} onEnd={handleEnd} />
        ) : (
          <button
            type="button"
            className={
              end.armed
                ? "button-l2 connected-end connected-end-armed"
                : "button-l2 connected-end"
            }
            onClick={handleEnd}
            onBlur={end.disarm}
          >
            {end.armed ? "Tap again to end" : "End session"}
          </button>
        )}
      </div>
      <PagerRail active={pane} onSelect={choosePane} />
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

/** Handoff §4's paused treatment. The block takes End's 52px EXACTLY — the
 *  phone owns no Pause, so there is no transport row to hide, and nothing
 *  above may shift when the rower stops pulling. `END` stays inside it,
 *  64×44 and accent-outlined, so ending is still possible while stopped,
 *  and it is "staged as everywhere else" (§5's own caption) off the SAME
 *  arm state the full-width End uses — a rower who armed End and then
 *  stopped pulling finds it still armed, not silently reset. */
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
