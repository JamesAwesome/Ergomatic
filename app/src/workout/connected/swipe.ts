// The two pure decisions a horizontal drag on the connected surface rests
// on (Phase CS Item A, task-1 brief). Both are plain functions with no
// pointer, DOM-event or gesture-lifecycle knowledge — the hook that wires a
// real drag to these is the NEXT task, deliberately not built here (see
// docs/monitor/sessions/probe-2026-08-17-swipe/README.md, "What this buys
// the implementation").

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
