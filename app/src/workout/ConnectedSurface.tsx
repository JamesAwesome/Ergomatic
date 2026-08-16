// The connected surface (7B Task 6, handoff §§3-4): the pane shell, the
// header segmented control, End, and the two mid-session states. It
// replaces Task 5's one-line phase gate — the interstitial still owns the
// `useMonitorSession` instance and hands its value down, so the radio is
// never torn down and rebuilt at the handoff (this file calls no driver, no
// transport and no `monitorRun` function; the plan's layering rule).
//
// Task 7 filled pane C's slot (`connected/PaneGrid.tsx`) and hung the
// diagnostics sheet off the rail (handoff §5) — the two things this file
// gained are the grid's entry in the render switch and `useTripleTap`
// below. Everything else here is Task 6's and unchanged.
//
// CR2 SPEC 3, TASK 1 (2026-08-16): `PagerRail` and the swipe handler
// (`handleTouchStart`/`handleTouchEnd`, `paneAfterSwipe`,
// `SWIPE_THRESHOLD_PX`) are GONE — design spec Ruling 3/4, the pane slide
// and the swipe were both cut at the design gate. `SegmentedControl`
// (`connected/SegmentedControl.tsx`) is the only way to change panes now,
// and `ConnectionLine` (the mark + device caption + status) moved out of
// the panes into this component's own header row — see the header's own
// comment below for the shape.
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
import { deriveAxes } from "../monitor/connectedAxes";
import type { MonitorSession } from "../monitor/useMonitorSession";
import { ARM_TIMEOUT_MS } from "../session/useStagedDiscard";
import type { EnginePhase } from "../session/engine";
import ConnectionLine from "./connected/ConnectionLine";
import ConnectionLogSheet from "./connected/ConnectionLogSheet";
import PaneGrid from "./connected/PaneGrid";
import PaneLive from "./connected/PaneLive";
import SegmentedControl, {
  PANES,
  type PaneId,
} from "./connected/SegmentedControl";
import {
  buildSurfaceModel,
  type SurfaceStatus,
} from "./connected/surfaceModel";

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

/** Handoff §5's diagnostics gesture: three taps on the SAME control half,
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
  const end = useStagedEnd();
  const [logOpen, setLogOpen] = useState(false);
  /** The control half the third tap landed on — SheetShell restores focus
   *  to whatever opened it, and for this sheet that is a button
   *  `SegmentedControl` owns, not one this component renders. */
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

  /** A control press does BOTH things, always: it selects the pane and it
   *  counts towards the diagnostics gesture. Three presses on the grid
   *  target therefore land on the grid AND open the log — the sheet is a
   *  modal over whichever pane the rower was heading for. (Swipe used to be
   *  the primary navigation and this the fallback; the swipe handler is
   *  gone — design spec 2026-08-16 Ruling 4 — so this is now the only way
   *  to change panes.) */
  function handleControlPress(next: PaneId, target: HTMLElement): void {
    logOpener.current = target;
    choosePane(next);
    registerTap(next);
  }

  function handleEnd(): void {
    if (!end.armed) {
      end.arm();
      return;
    }
    end.disarm();
    void session.endSession();
  }

  if (session.phase === "ended") {
    // One frame, then gone (see the header's mount decision). Not a dead
    // end: `onEnded` has already fired above, and its caller navigates.
    // No `SurfaceStatus` describes "ended" any more (connected-axes design
    // spec §1, task 2: the type dropped it outright) — `buildSurfaceModel`
    // is never called for this frame, which is drawn straight off `session`
    // instead.
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

  // THE STATUS PRECEDENCE, REALIZED (connected-axes design spec §1;
  // `connectedAxes.ts`'s own header comment names the order this collapses
  // to: `ended > disconnected > (armed | mirror | live)`). `ended` is
  // handled above, before axes are even derived, so this is the one
  // decision left: `stale` (the link is lost) beats `armed` (a program sits
  // on the machine with no session open yet — `"ready"`, once the rower has
  // asked for the numbers) beats `paused` (the freeze predicate fired)
  // beats `live` (everything else).
  //
  // `failureLeavesLinkUp: null` — the conservative "no evidence of a
  // surviving link" reading (`AxesInput`'s own doc comment) — is not a
  // guess this component is dodging: `"failed"` never reaches here at all.
  // `ConnectedInterstitial.tsx`'s own phase gate renders its OWN screen for
  // `phase === "failed"` and never hands this component a session in that
  // phase, so the one axis this argument feeds (`deriveLink`'s `"failed"`
  // case) is provably never consulted by this call. This is the SECOND of
  // the two production call sites `AxesInput.failureLeavesLinkUp`'s own
  // doc comment names as dead-third-fact evidence (M-1, final whole-branch
  // review): both hardcode `null`, neither call reaches `deriveAxes` with
  // `phase === "failed"`.
  const axes = deriveAxes({
    phase: session.phase,
    frozen: session.frozen,
    runOpen: session.runOpen,
    failureLeavesLinkUp: null,
  });
  const status: SurfaceStatus =
    axes.link === "lost"
      ? "stale"
      : axes.program === "armed" && axes.session === "none"
        ? "armed"
        : axes.activity === "frozen"
          ? "paused"
          : "live";

  const model = buildSurfaceModel({
    phases,
    program,
    status,
    frame: session.frame,
    deviceName: session.deviceName,
    actuals: session.actuals,
  });

  return (
    <main className="screen connected-surface">
      {/* THE HEADER (connected-revamp Task 6's safety fix, restructured by
          CR2 spec 3 task 1 — design spec §3 "Structure"). Two children now,
          not one: `ConnectionLine` (the mark, device caption and status —
          moved here from inside the panes, `model.intervalLabelShort`
          threaded as the trailing status exactly as `PaneLive` used to) and
          End. `ConnectionLine` carries `flex: 1` (index.css) so it fills
          whatever width End does not need, which is what keeps End pinned
          to the row's own right edge without the two ever sitting adjacent
          — spec §2A: "Control and END never adjacent."

          `SegmentedControl` is NOT rendered inside this `<div>` (spec §3:
          "own grid item of `.connected-surface`... NOT a DOM child of
          `.connected-header`" — a header child cannot become a portrait
          bottom bar by CSS alone). It renders after the footer, below,
          positioned into this same visual row by landscape's own grid
          placement.

          THE SAFETY FIX ITSELF (James 2026-08-12, unchanged by this
          restructure): the old full-width footer button "could easily be
          touched accidentally if somebody tries to change views mid-row" —
          every point along the bottom edge was End's hit box. End lives in
          this small header instead: a 44pt outlined control (revision §2)
          that does not span the surface's width. Rendered
          UNCONDITIONALLY — paused or not — so its own row never changes
          height and nothing below it (the pane body) ever shifts; the
          paused block gets its own, additional END/AGAIN affordance in the
          slot End vacated (below), off the SAME armed state, but this
          header control keeps working too. Staging is unchanged: first tap
          arms `TAP AGAIN` for `ARM_TIMEOUT_MS`.

          THE LABEL IS THE MOCKUP'S (`Ergomatic connected mode.dc.html`
          :297/:379/:510/:559 — `END`, and `TAP AGAIN` armed, revision §2's
          own staging wording), not the old bar's sentence. The ACCESSIBLE
          name keeps the sentence (`aria-label`): a dozen selectors across
          unit and e2e key on "End session", the visible word alone would
          collide with the paused block's own `END`, and "END" is a prefix
          of "End session" so WCAG 2.5.3's label-in-name still holds. */}
      <div className="connected-header">
        <ConnectionLine model={model} trailing={model.intervalLabelShort} />
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
      {/* End's old footer slot survives as the frozen block's home, but its
          MECHANISM changed under connected-axes 2a (task 5) — this comment
          replaces the task-6 fix round's own version, which is no longer
          true. That round made this slot a zero-height, `position:
          relative` anchor and painted the block OVER the pane's bottom 52px
          as an absolutely-positioned overlay: free while rowing, but at the
          one moment it actually rendered it covered TOTAL LEFT — the single
          number that would have told the rower the erg's own clock never
          stopped (spec 2a's own trigger for this task: "the block we drew
          covers the one number that would have told the rower so"). Task 5
          puts the block back IN FLOW instead: still nothing while rowing
          (no child renders, so the row still costs zero — `index.css`'s own
          comment on `.connected-surface-footer` carries the mechanism), but
          while frozen the slot takes its own real height out of the pane's
          `1fr` track rather than painting over it, so TOTAL LEFT and its bar
          stay fully on screen every frame the block is up. */}
      <div className="connected-surface-footer">
        {model.status === "paused" && (
          <PausedBlock armed={end.armed} onEnd={handleEnd} />
        )}
      </div>
      {/* Last in DOM on purpose (matches where `PagerRail` used to sit): in
          portrait (a flex column) that makes it the bottom bar for free,
          with no CSS placement needed. Landscape's own grid moves it into
          row 1 beside the header instead (`index.css`'s own
          `.connected-control` comment) — CSS Grid placement is independent
          of DOM/paint order, so this does not disturb the tab order below
          (`ConnectedSurface.test.tsx`/`e2e/screenshots.spec.ts` pin
          `End → scroller → control halves` in both orientations). */}
      <SegmentedControl active={pane} onSelect={handleControlPress} />
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

/** Handoff §4's frozen treatment, restyled by connected-axes 2a (task 5) to
 *  drop the "paused" noun entirely (never rendered here in caps again — see
 *  this file's own source-sweep test). The PM5 has no paused state — its
 *  own clock runs the whole time a rower is stopped — and a block whose own
 *  copy claimed one, while sitting over the very number (TOTAL LEFT) that
 *  would have shown the clock still moving, is exactly the "does the
 *  underlying system have this concept" mistake `.claude/agent-briefing.md`
 *  names by name (a paused state the PM5 does not have, on a monitor whose
 *  clock keeps running). `PULL TO RESUME` is an instruction, not a status
 *  word: it says what to do, not what mode the machine is supposedly in.
 *  The internal `SurfaceStatus` member this component renders FOR stays
 *  named `"paused"` — that is CODE, not copy (`surfaceModel.ts`'s own doc
 *  comment on `SurfaceStatus`) — and this component's own name is kept for
 *  the same reason. Everything else about the CONTROL is untouched
 *  (connected-revamp Task 6's own reasoning still holds): End lives in the
 *  header (always on screen, never hidden by a freeze), and this block owns
 *  the footer slot alone. What DID change is the slot's own layout
 *  participation — see the caller's comment on `.connected-surface-footer`
 *  for the no-occlusion mechanism this task exists for. `END`/`AGAIN`
 *  stays 64×44 and accent-outlined, staged off the SAME arm state the
 *  header's End control uses — a rower who armed either one and then
 *  stopped (or started) pulling finds the other in the same armed state,
 *  not silently reset. */
function PausedBlock({ armed, onEnd }: { armed: boolean; onEnd: () => void }) {
  return (
    <div className="connected-paused">
      <span className="connected-paused-label">PULL TO RESUME</span>
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
