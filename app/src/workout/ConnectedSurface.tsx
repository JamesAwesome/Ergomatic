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
// CR2 SPEC 3, TASK 1 (2026-08-16): `PagerRail` and the OLD swipe handler
// (`handleTouchStart`/`handleTouchEnd`) were removed — design spec Ruling
// 3/4, the pane slide and the swipe were both cut at the design gate.
// `SegmentedControl` (`connected/SegmentedControl.tsx`) became the only way
// to change panes, and `ConnectionLine` (the mark + device caption +
// status) moved out of the panes into this component's own header row —
// see the header's own comment below for the shape.
//
// PHASE CS ITEM A (2026-08-17, task-2 brief) brings the swipe back, as a
// SECOND way to change panes alongside the control (never a replacement):
// `useSurfaceSwipe` (`connected/swipe.ts`), wired below onto the same
// `choosePane` a control press uses. `paneAfterSwipe`/`SWIPE_THRESHOLD_PX`
// are new names in that file, not the old ones resurrected — the old
// handler's own `[role]`-wildcard interactive guard is exactly the bug the
// device probe (docs/monitor/sessions/probe-2026-08-17-swipe/README.md)
// exists to NOT repeat.
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
//    the walk falsified: CORRECTED (Phase LL §5, the finish-line race's
//    measured inputs) — the first draft's "~1 ms after" was never measured
//    and was false. Across the recorded finishes the final interval's split
//    pair lands anywhere from 179.9 ms BEFORE to 90.2 ms AFTER the frame
//    that ends the workout (the sign varies capture to capture), and
//    disconnect itself follows the terminal frame by 21.7-107.3 ms. So the
//    ended state needs both the radio and the driver subscription for that
//    whole window, not a fixed ~1 ms, and the record the log screen reads
//    is not finished until the split lands — which is sometimes before this
//    render and sometimes after it. Hanging up on the `ended` render cost
//    the rower the measurement ("0 OF 1 INTERVALS MEASURED" over a
//    rowed-out piece). (Phase LL §5 cut the "hold the radio past the
//    terminal frame" design that would have used this window — the
//    corpus's zero occurrences of state 12 or 0x0039 killed it — and moved
//    it to Phase RC; this file keeps only the honest comment fix.)
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

import type { ReactNode } from "react";
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
import { useSurfaceSwipe } from "./connected/swipe";
import {
  buildSurfaceModel,
  type SurfaceModel,
  type SurfaceStatus,
} from "./connected/surfaceModel";

/** CR2 spec 3 Task 5 (design spec §2B's composition note, and the known
 *  interim defect Task 5 closes: on GRID the header used to read
 *  `3 OF 12 · WORK` while the pane's OWN headline directly below it read
 *  `3 OF 12 · WORK · 0:47 LEFT` — the same fact, twice, one row apart).
 *  GRID's own header trailing is DIFFERENT from every other pane's: it
 *  joins `intervalOrdinalLabel` with `totalLeftDisplay`
 *  (`3 OF 12 · 38:20 LEFT`) instead of `intervalLabelShort`, which bakes
 *  the phase word in (`3 OF 12 · WORK`) — `intervalOrdinalLabel`'s own doc
 *  comment names the reason the two cannot be the same field. The
 *  countdown half wears `--marker` gold (Ruling 1's own deviation from the
 *  README's accent), which is presentation, not a value — `surfaceModel.ts`
 *  is pure (no React, its own header comment) and cannot hand back a
 *  coloured span itself, so this composition lives at the CALLER, one
 *  level above the pane that used to own it. The return value renders
 *  directly into the header's own `.connected-line-trailing` span (Task 6
 *  fix round: this used to thread through `ConnectionLine`'s own
 *  `trailing` prop; that prop is gone — `ConnectionLine.tsx`'s own comment
 *  has the reason the status caption moved out to a header-level sibling)
 *  rather than the surface passing a second, pane-specific prop through a
 *  component that would then have to reconcile two "what goes here"
 *  inputs — one composed node at the one call site that already knows
 *  which pane is active.
 *
 *  TWO SEPARATE FALLBACKS to `intervalLabelShort`, not one (task-5-review
 *  fix round — the first version of this function conflated them and
 *  shipped a regression). A `null` ordinal (`intervalOrdinalLabel ===
 *  null`) is one: there is no ordinal to join `totalLeftDisplay` onto.
 *  Phase WU (2026-08-21) removed the unnumbered warm-up that used to be
 *  the real case here — `intervalOrdinalLabel`'s own doc comment in
 *  `surfaceModel.ts` now states it plainly: `null` means an EMPTY
 *  program, the only case left that can produce it. `model.status ===
 *  "armed"` is the OTHER fallback, and it is not implied by the first:
 *  at armed, the first interval of an ordinary program already has an
 *  ordinal (`intervalOrdinalLabel` is `"1 OF 4"`, not `null`), so the
 *  ordinal-null guard alone would not stop the countdown composition
 *  from firing before the erg has moved — the same shape of mistake
 *  `.claude/agent-briefing.md` names by name for a DIFFERENT invented
 *  state, one axis over: a RUNNING gold countdown at a rower who has
 *  taken no stroke. `intervalLabelShort` already has its own armed
 *  branch (`surfaceModel.ts`'s `readyLabel`) that reads `1 OF 4 · READY`
 *  for exactly this case — armed is checked FIRST, ahead of the ordinal
 *  check, so GRID never reaches the countdown composition while armed,
 *  numbered interval or not. */
function headerTrailing(model: SurfaceModel, pane: PaneId): ReactNode {
  if (
    pane !== "grid" ||
    model.status === "armed" ||
    model.intervalOrdinalLabel === null ||
    // THE UNPRICED-PHASE GUARD, SECOND SITE (EST LEFT fix round). This is
    // the same `model.hasRemainingEstimate` `PaneLive.tsx` uses to hide its
    // bar and its EST LEFT cell: when every phase from here to the end of
    // the session is unpriced there is no estimate to show, and this header
    // rendered `0:00 LEFT` in confident gold for exactly that case. LIVE
    // and GRID render the SAME `totalLeftDisplay`; they must not disagree
    // about whether it means anything. See DEVIATIONS' unpriced-phase row
    // and design spec §4.
    !model.hasRemainingEstimate
  ) {
    return model.intervalLabelShort;
  }
  return (
    <>
      {model.intervalOrdinalLabel} ·{" "}
      <span className="connected-header-countdown">
        {model.totalLeftDisplay} LEFT
      </span>
    </>
  );
}

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
  /** The surface element itself — `useSurfaceSwipe` (below) attaches its
   *  native listeners here, once. Ref'd on the SECOND `<main>` only (the
   *  live/armed/paused render, further down); the `ended` frame's own
   *  `<main>` never carries it, matching the probe's own placement. */
  const surfaceRef = useRef<HTMLElement | null>(null);

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
  // EST LEFT (Phase LL design spec §3): `buildSurfaceModel` is pure and
  // has no memory of the frame before this one — the monotonic clamp on
  // its own estimate (`SurfaceModelInput.previousElapsedSeconds`'s own doc
  // comment) needs one, and this is it. A REF would be the obvious
  // choice, but this repo's own lint config (`react-hooks/refs`) forbids
  // reading or writing `ref.current` during render — correctly: React may
  // discard or replay a render pass, and a ref write has no such
  // safety net. `useState` instead, using React's own sanctioned
  // "adjusting state during rendering" pattern (calling `setState`
  // directly in the render body, guarded by a comparison, rather than in
  // an effect) — an effect would lag the clamp behind by one commit,
  // which a monotonic guarantee cannot afford.
  const [previousElapsedSeconds, setPreviousElapsedSeconds] = useState(0);
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

  /** Phase CS Item A, task-2 brief: swipe is back, wired to the same
   *  `choosePane` a control press uses below (persistence and the rail
   *  stay exactly as they are — a swipe is just a second way to call it).
   *  `blocked: logOpen` is spec A7: while the diagnostics sheet is up, a
   *  drag starting anywhere never changes panes underneath it. This calls
   *  `choosePane` directly, never `handleControlPress` — a swipe must
   *  never count towards the triple-tap gesture (the old handler's own
   *  note, carried over: `registerTap` is a control-press-only concern). */
  useSurfaceSwipe(surfaceRef, { pane, blocked: logOpen, onChange: choosePane });

  /** A control press does BOTH things, always: it selects the pane and it
   *  counts towards the diagnostics gesture. Three presses on the grid
   *  target therefore land on the grid AND open the log — the sheet is a
   *  modal over whichever pane the rower was heading for. Swipe (above,
   *  `useSurfaceSwipe`) is back as of Phase CS Item A and is the OTHER way
   *  to change panes — it never counts towards this gesture, so no number
   *  of swipes ever opens the log on their own. */
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

  // TWO INDEPENDENT FACTS, NOT ONE RANKED LIST (Phase LM PR 1 Task 2 —
  // this replaces the single four-way ternary that used to live here).
  //
  // The old version resolved `stale` (the link is lost) AHEAD of `armed` (a
  // program sits on the machine with no session open yet) into one
  // `SurfaceStatus`, which made them mutually exclusive. A rower who locked
  // their phone before their first pull met exactly that combination: the
  // phase never left `"ready"`, the frames went quiet, `stale` won, and
  // every display keyed on `armedMirror` flipped together into describing a
  // piece that had never begun — `1 OF 4 · WORK`, `LAST 0:00.0`, `LAST 0`,
  // and an `EST LEFT` counting down. It cost them the workout and it took
  // two days to find, because the screen looked like a session in progress.
  //
  // THE FIX IS NOT A REORDER. Putting `armed` first in the same ternary
  // would have traded one wrong screen for another: the surface would have
  // said READY and stopped saying it had lost the erg. `linkLost` is passed
  // ALONGSIDE the status instead, so both are told at once — the header
  // reads `1 OF 4 · READY` and the device caption reads `· LOST` on the
  // same frame.
  //
  // `status` is now activity only, in the surviving precedence: `armed`
  // beats `paused` (the freeze predicate fired) beats `live` (everything
  // else). `ended` is handled above, before axes are even derived.
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
    // Phase LL Task 2 (§2a): the one live consumer of this axis —
    // `deriveLink` routes it onto the EXISTING `"lost"` member, which is
    // what `linkLost` below reads.
    frameSilence: session.frameSilence,
  });
  // THE LINK, ON ITS OWN. One axis answers it — a real `disconnected`
  // phase or frame silence past the watchdog both land on `"lost"`
  // (`deriveLink`) — and it travels to the model beside `status`, never
  // through it.
  const linkLost = axes.link === "lost";
  const status: SurfaceStatus =
    axes.program === "armed" && axes.session === "none"
      ? "armed"
      : axes.activity === "frozen"
        ? "paused"
        : "live";

  const model = buildSurfaceModel({
    phases,
    program,
    status,
    linkLost,
    frame: session.frame,
    deviceName: session.deviceName,
    actuals: session.actuals,
    previousElapsedSeconds,
  });
  // The comparison guard is what makes this SAFE to call during render
  // (React docs, "Adjusting state during rendering"): `setState` bails out
  // of the update when the new value is unchanged, so this does not loop.
  if (model.elapsedSeconds !== previousElapsedSeconds) {
    setPreviousElapsedSeconds(model.elapsedSeconds);
  }

  return (
    <main className="screen connected-surface" ref={surfaceRef}>
      {/* THE HEADER (connected-revamp Task 6's safety fix, restructured by
          CR2 spec 3 task 1 — design spec §3 "Structure"; the status caption
          split out to its own child by Task 6's FIX ROUND, CRITICAL 1 —
          see below). THREE children now: `ConnectionLine` (the mark and
          device caption only, since the fix round), the composed status
          span, and End. The status is `headerTrailing(model, pane)` (above,
          CR2 spec 3 Task 5) — GRID gets its own composed `N OF M ·
          <countdown> LEFT` node, every other pane keeps
          `model.intervalLabelShort` exactly as `PaneLive` used to thread
          it. `ConnectionLine` carries `flex: 1` (index.css) so it fills
          whatever width End does not need, which is what keeps End pinned
          to the row's own right edge without the two ever sitting adjacent
          — spec §2A: "Control and END never adjacent."

          THE FIX ROUND'S OWN RESTRUCTURE (CRITICAL 1: three committed
          portrait captures — `connected-pane-grid.png`,
          `connected-pane-grid-long.png`, `connected-disconnected.png` —
          showed this status text overprinting the device id and/or END).
          §2C's own table draws the status on ITS OWN LINE below the header
          row ("Header: PM5 id + END … Status line mono 21"), not sharing
          it — the status span used to render nested INSIDE
          `ConnectionLine`'s own `.connected-line` box (a second, separate
          flex context from this header's), so no amount of CSS on
          `.connected-header` alone could ever push it onto a new LINE of
          THIS row; a nested flex item cannot escape its own container's
          box by any `flex-wrap`/`order` declared on an ancestor two levels
          up. Promoting the status to a direct sibling here — of
          `ConnectionLine` and End both — is what makes it a real flex ITEM
          of `.connected-header` itself, which is the only way `index.css`
          can wrap JUST this child onto its own line in portrait
          (`.connected-line-trailing`'s own `order: 2; flex-basis: 100%`
          rule, landscape resets both) while leaving every other child, and
          landscape's single-row layout, untouched. Chosen over the other
          candidate mechanism (a CSS-only reflow via `display: contents` on
          `.connected-line` to unwrap its children into this row) because
          that path would have also unwrapped `.connected-line`'s own 8px
          mark-device gap into the header's 12px gap — a real, if small,
          unrequested visual change to the landscape row this fix must
          leave alone — where moving three lines of JSX changes nothing
          about what paints in landscape at all (same three items, same
          order, same computed layout, `design.spec.ts`'s own 2A header-row
          test is unchanged and still green). Triple-tap and focus order
          are untouched by this move: the gesture lives on
          `SegmentedControl`'s own halves (spec §3), never on the header.

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
        <ConnectionLine model={model} />
        <span className="connected-line-trailing">
          {headerTrailing(model, pane)}
        </span>
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
      {model.stale && <LostBanner kept={model.measuredIntervals} />}
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
        {/* A LOST LINK BEATS A FROZEN ERG, said out loud (Phase LM PR 1
            Task 2). This precedence is not new: `"stale"` used to be a
            `SurfaceStatus` member the ternary above resolved AHEAD of
            `"paused"`, so a lost link never reached this line wearing the
            paused word. Now that the link rides its own field the two can
            be true at once, and the order has to be written rather than
            inherited. It stays as it was for a reason — `PULL TO RESUME`
            over a dead feed instructs the rower to fix something the pull
            cannot fix, and the lost banner above is the message that
            actually applies. */}
        {model.status === "paused" && !model.stale && (
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
 *  backfill go with the same descope.
 *
 *  IT NOW BRANCHES, AND IT IS SHORT (Phase LM PR 1 Task 3).
 *
 *  The old body — "Row on. The erg is still counting and End keeps what we
 *  saw." — was twelve words that promised a rower something we had no way
 *  to deliver in exactly the case that costs them a workout. It is true
 *  whenever we saw something. A tester who locked their phone before their
 *  first pull read it, rowed, and lost the piece: nothing had been
 *  measured, so End kept nothing. James on the wording, 2026-08-25: "Too
 *  much prose. Holy fuck why is everything a whole sentence. This is a
 *  workout app people aren't going to read a fucking novel of warnings."
 *  A rower reads this mid-stroke or not at all, so the whole banner is a
 *  title plus at most four words (Gate 0).
 *
 *  `kept` is `SurfaceModel.measuredIntervals`, which is
 *  `summaryModel.ts`'s own rule (`measuredIntervalCount`) rather than a
 *  count this screen invented — the summary screen judges the SAME run
 *  minutes later, and a banner saying two intervals were kept over a
 *  summary reading TARGETS ONLY · NOTHING MEASURED is the disagreement
 *  that rule exists to prevent.
 *
 *  IT NAMES NO CAUSE, in either branch, and must not learn to. Three
 *  producers of the silence are undistinguished here — the design spec's
 *  own "What we do NOT know" — so the banner says what was observed and
 *  stops. It also promises no recovery: nothing the rower does to their
 *  phone brings back a reading that was never taken.
 *
 *  The title is the SAME in both branches on purpose. It is what the rower
 *  has already learned to recognise, it is what the shipped v0.17.0
 *  release note tells them to expect, and the fact it states — we have
 *  lost the monitor — is equally true either way. Only the promise
 *  underneath it changes. */
function LostBanner({ kept }: { kept: number }) {
  return (
    <div className="connected-lost" role="status">
      <span className="connected-lost-title">LOST THE MONITOR</span>
      <span className="connected-lost-body">
        {kept === 0
          ? "Nothing kept."
          : `${kept} ${kept === 1 ? "interval" : "intervals"} kept.`}
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
