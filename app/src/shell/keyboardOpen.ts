import { useSyncExternalStore } from "react";

/**
 * How much of the layout viewport has to be occluded before we call the
 * software keyboard open. Measured on an iPhone 17 Pro simulator running
 * the real shell (Gate 0, 2026-09-06): 0 with no keyboard, 376 with one.
 * 150 sits clear of both, and of the small deltas a pinch-zoom or a
 * desktop browser's own chrome can produce.
 */
const KEYBOARD_MIN_OCCLUSION = 150;

/**
 * Whether the software keyboard is covering part of the page.
 *
 * THE LAYOUT VIEWPORT DOES NOT MOVE when iOS raises the keyboard —
 * `window.innerHeight` is unchanged — so the only thing that reports the
 * occlusion is `visualViewport.height`, and the difference between them IS
 * the covered height. Measured on device (Gate 0): `innerHeight` 874 with
 * `visualViewport.height` 498.
 *
 * WHY THE TAB BAR READS THIS AT ALL. `position: fixed; bottom: 0` is
 * already correct — WebKit anchors it to the VISUAL viewport, and its
 * measured `rect.bottom` (498) is exactly that viewport's bottom. The
 * trouble is that iOS's floating input-accessory bar (the ‹ › ✓ pill) is
 * excluded from `visualViewport.height` while the page still PAINTS behind
 * it, so ~66px of list shows through beneath the tab bar and above the
 * keyboard. Repositioning cannot close that: the bar is already where the
 * only API that reports a bottom says the bottom is, and the accessory
 * bar's height is not exposed to the page. The bar can only get out of the
 * way, which is what iOS's own apps do while typing.
 *
 * `useSyncExternalStore`, not `useState` + an effect: the snapshot is read
 * during render, so a screen mounted while the keyboard is ALREADY up is
 * correct on its first frame rather than after a paint, and there is no
 * state write in an effect for `react-hooks/set-state-in-effect` to catch.
 *
 * An engine without `visualViewport` answers `false` — the same answer it
 * gives with no keyboard, which is the honest one: without the API there is
 * no occlusion we can see, and every such engine is a desktop browser where
 * this defect does not occur.
 */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(onChange: () => void): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  viewport.addEventListener("resize", onChange);
  return () => viewport.removeEventListener("resize", onChange);
}

function getSnapshot(): boolean {
  const viewport = window.visualViewport;
  if (!viewport) return false;
  return window.innerHeight - viewport.height > KEYBOARD_MIN_OCCLUSION;
}

const getServerSnapshot = (): boolean => false;
