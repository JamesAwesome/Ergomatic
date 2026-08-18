// The two pure decisions a horizontal drag on the connected surface rests
// on (Phase CS Item A, task-1 brief), plus (below) the hook that wires a
// real drag to them — task-2 brief, this file's own second half. `PANES`
// (imported below) has exactly two members.

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { PANES, type PaneId } from "./SegmentedControl";

/** Inclusive: a drag of exactly this many pixels commits. */
export const SWIPE_THRESHOLD_PX = 48;

/**
 * Which pane a committed drag lands on. `current` is returned unchanged for
 * every no-op case — under threshold, vertical-dominant, or already at the
 * end `PANES` clamps toward (no wraparound) — so callers never need a
 * separate "did anything change" check.
 */
export function paneAfterSwipe(
  current: PaneId,
  dx: number,
  dy: number,
): PaneId {
  if (!(Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy))) {
    return current;
  }
  const index = PANES.indexOf(current);
  // Leftward (dx < 0) steps forward through PANES; rightward steps back.
  const nextIndex = dx < 0 ? index + 1 : index - 1;
  const clamped = Math.max(0, Math.min(PANES.length - 1, nextIndex));
  return PANES[clamped]!;
}

/**
 * Whether a drag starting on `target` should be tracked at all.
 *
 * THE PROBE'S FINDING (docs/monitor/sessions/probe-2026-08-17-swipe/
 * README.md): the previous version of this predicate matched a bare
 * `[role]` wildcard, and `.connected-grid-rows` carries `role="group"` —
 * required for the scrollable row list's own keyboard operability
 * (`PaneGrid.tsx`'s TAB ORDER comment), not because anything under it is
 * interactive. That one structural role silently refused every
 * grid-origin drag, on every row, in every program long enough to need the
 * scroll: the probe's decisive pair showed an 8x-threshold drag starting on
 * a grid row producing no commit at all, while the identical drag one pixel
 * to the side (off the row list) worked. `[role]` MUST NOT be re-added to
 * this predicate — the other structural roles in this surface
 * (`role="status"` on the lost-connection banner, `role="dialog"` on
 * `SheetShell`) are exactly as inert, and a future editor reaching for
 * `[role]` as a quick "is this special?" check reintroduces the same bug
 * the probe was dispatched to find.
 *
 * The selector below matches only elements that are actually operable, plus
 * `[data-swipe-ignore]` as a named escape hatch (`SheetShell`'s dismiss
 * backdrop is a `<div onClick>`, not a real button, and needs one).
 */
export function isSwipeBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      "button, a[href], input, select, textarea, [contenteditable], [data-swipe-ignore]",
    ) !== null
  );
}

interface SwipeState {
  pointerId: number;
  startX: number;
  startY: number;
}

/**
 * Attaches native `pointerdown`/`pointerup`/`pointercancel` listeners to
 * `ref.current`, once, and calls `opts.onChange` when a completed drag
 * commits to a different pane. `pointermove` is NOT listened for — the
 * delta is read once, at `pointerup` (task-2 brief, settled ambiguity: "no
 * per-move React state, no re-render during a drag").
 *
 * LATEST-VALUE REFS, NOT EFFECT DEPS (carried over from the probe's own
 * handler, `git show d1da5f7 -- app/src/workout/ConnectedSurface.tsx`): the
 * surface re-renders 5-11x/s while connected (the frame clock), and
 * `opts.pane`/`opts.blocked`/`opts.onChange` are fresh function/value
 * identities on every one of those renders. Re-subscribing native listeners
 * that often is both wasteful and a timing hazard — a gesture that starts
 * mid-render could attach to a `pointerdown` handler closed over a pane
 * that is already stale by the time `pointerup` fires. The listeners
 * attach exactly ONCE (the effect's deps are `[ref]`, and `ref` is a
 * stable object identity across renders); these refs are how the handlers
 * still always read the CURRENT pane/blocked/onChange without that.
 */
export function useSurfaceSwipe(
  ref: RefObject<HTMLElement | null>,
  opts: { pane: PaneId; blocked: boolean; onChange: (next: PaneId) => void },
): void {
  const gesture = useRef<SwipeState | null>(null);
  const paneRef = useRef(opts.pane);
  const blockedRef = useRef(opts.blocked);
  const onChangeRef = useRef(opts.onChange);
  // Written in an effect, not during render (react-hooks/refs) — still
  // synchronous ahead of any pointer gesture, since a real pointer event
  // only ever arrives after paint, well after this effect has run.
  useEffect(() => {
    paneRef.current = opts.pane;
    blockedRef.current = opts.blocked;
    onChangeRef.current = opts.onChange;
  });

  useEffect(() => {
    const maybeEl = ref.current;
    if (!maybeEl) return;
    // Re-bound as a non-nullable local: TS does not carry the null check
    // above into the nested function declarations below, only into code at
    // the same scope level.
    const el: HTMLElement = maybeEl;

    function onPointerDown(event: PointerEvent): void {
      // Refused, in order: the log sheet is open (spec A7's `blocked`),
      // the pointer landed on something operable (`isSwipeBlocked`), or a
      // gesture is already tracking (single-pointer only — a second
      // concurrent `pointerdown` never starts a second gesture and never
      // disturbs the first).
      if (
        blockedRef.current ||
        isSwipeBlocked(event.target) ||
        gesture.current !== null
      ) {
        return;
      }
      gesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      // Optional-chained, not stubbed away: jsdom has no
      // `setPointerCapture` (verified — see `ConnectedSurface.test.tsx`'s
      // stub and its own comment on what that does and does not prove),
      // and a real browser that lacked it must not throw here either.
      el.setPointerCapture?.(event.pointerId);
    }

    function endGesture(event: PointerEvent, commit: boolean): void {
      const current = gesture.current;
      if (current === null || current.pointerId !== event.pointerId) return;
      gesture.current = null;
      el.releasePointerCapture?.(event.pointerId);
      if (!commit) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      const next = paneAfterSwipe(paneRef.current, dx, dy);
      if (next !== paneRef.current) onChangeRef.current(next);
    }

    function onPointerUp(event: PointerEvent): void {
      endGesture(event, true);
    }
    function onPointerCancel(event: PointerEvent): void {
      endGesture(event, false);
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
    };
    // Deliberately just `[ref]` — see the latest-value-refs comment above.
  }, [ref]);
}
