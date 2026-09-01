// The two pure decisions a horizontal drag on the connected surface rests
// on (Phase CS Item A, task-1 brief; verdict:
// docs/monitor/sessions/probe-2026-08-17-swipe/README.md). Neither function
// touches a pointer event — that is the NEXT task's hook, deliberately not
// built here.
//
// `paneAfterSwipe` decides which pane a committed drag lands on.
// `isSwipeBlocked` decides whether a drag starting on a given target should
// be tracked at all — the probe's whole finding was that the OLD version of
// this predicate (a `[role]` wildcard) refused every grid-origin drag,
// because `.connected-grid-rows` carries the purely structural
// `role="group"` a scrollable list needs for keyboard operability
// (`PaneGrid.tsx`'s own TAB ORDER comment), not because anything under it
// is interactive. The grid-row case below is the probe's convicted case,
// rendered from the REAL `PaneGrid` component against a real library
// fixture — a hand-built `<div class="connected-grid-row">` with no real
// `[role="group"]` ancestor would pass against the broken `[role]`
// predicate too, which is a test that cannot fail (docs/TESTING.md §3,
// recurring failure #3).

import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { compileProgram } from "../../../domain/monitor/program.js";
import type { Baselines, WorkoutType } from "../../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import { buildSurfaceModel } from "./surfaceModel";
import { buildDraft } from "../../session/draft";
import { buildRun } from "../../session/engine";
import PaneGrid from "./PaneGrid";
import { PANES, type PaneId } from "./SegmentedControl";
import { isSwipeBlocked, paneAfterSwipe, SWIPE_THRESHOLD_PX } from "./swipe";

// This file stays `.ts`, per the task-1 brief, even though one case renders
// a real component — `createElement` (below) rather than JSX keeps that
// legal: a `.ts` file cannot contain JSX syntax (the parser cannot tell
// `<PaneGrid>` from a type assertion), only `.tsx` can.

describe("SWIPE_THRESHOLD_PX", () => {
  it("is 48, the value every other case in this file assumes", () => {
    expect(SWIPE_THRESHOLD_PX).toBe(48);
  });
});

describe("paneAfterSwipe", () => {
  it("leftward past the threshold advances live -> grid", () => {
    expect(paneAfterSwipe("live", -60, 0)).toBe("grid");
  });

  it("rightward past the threshold retreats grid -> live", () => {
    expect(paneAfterSwipe("grid", 60, 0)).toBe("live");
  });

  it("one pixel under the threshold is a no-op", () => {
    expect(paneAfterSwipe("live", -47, 0)).toBe("live");
  });

  it("exactly the threshold commits — the boundary is inclusive", () => {
    expect(paneAfterSwipe("live", -48, 0)).toBe("grid");
  });

  it("a steeper vertical delta blocks the swipe even past the threshold", () => {
    expect(paneAfterSwipe("live", -60, -80)).toBe("live");
  });

  it("a shallower vertical delta lets the horizontal dominate", () => {
    expect(paneAfterSwipe("live", -60, 59)).toBe("grid");
  });

  it("equal horizontal and vertical deltas do not swipe — dominance is strict", () => {
    expect(paneAfterSwipe("live", -60, 60)).toBe("live");
  });

  it("leftward from the last pane does not wrap", () => {
    expect(paneAfterSwipe("grid", -60, 0)).toBe("grid");
  });

  it("rightward from the first pane does not wrap", () => {
    expect(paneAfterSwipe("live", 60, 0)).toBe("live");
  });

  it("never returns a value outside PANES, for any pane", () => {
    for (const pane of PANES) {
      const result: PaneId = paneAfterSwipe(pane, -60, 0);
      expect(PANES).toContain(result);
    }
  });
});

// ---------------------------------------------------------------------------
// isSwipeBlocked
// ---------------------------------------------------------------------------

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-17T09:00:00.000Z");

/** A real seeded library workout, compiled through the real assembly
 *  (`buildDraft` -> `buildRun` -> `compileProgram`), the same recipe
 *  `surfaceModel.test.ts` uses — the repo's realistic-fixture rule applies
 *  to this file too even though it is testing a predicate, not the model
 *  itself, because the predicate's one convicted case is about DOM shape a
 *  synthetic fixture could get wrong in the same way the bug did. */
function gridRowsElement(): HTMLElement {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "filling-low",
    title: w.title,
    type: w.type as WorkoutType,
    // Phase WU: the 8:00 opener was the rower's warm-up SETTING, passed as
    // `buildRun`'s (now deleted) fourth argument. An authored 8' EASY step
    // compiles to the identical interval, so the grid this test measures
    // has the same rows it always had.
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { effort: "min" },
      },
      ...w.steps,
    ],
  });
  const phases = buildRun(draft, baselines, t0).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  const model = buildSurfaceModel({
    phases,
    program,
    status: "live",
    linkLost: false,
    frame: null,
    deviceName: "PM5 432331249",
    actuals: [],
    freeRow: false,
  });
  const { container } = render(createElement(PaneGrid, { model }));
  const rows = container.querySelector<HTMLElement>(
    '.connected-grid-rows[role="group"]',
  );
  if (!rows) throw new Error("PaneGrid did not render a role=group list");
  return rows;
}

describe("isSwipeBlocked", () => {
  it("does NOT block a pace cell inside the real grid's role=group list — the probe's convicted case", () => {
    const rows = gridRowsElement();
    const pace = rows.querySelector<HTMLElement>(".connected-grid-pace");
    if (!pace) throw new Error("fixture rendered no pace cell");
    expect(pace.closest('[role="group"]')).toBe(rows);
    expect(isSwipeBlocked(pace)).toBe(false);
  });

  it("does NOT block the lost-connection banner's role=status div", () => {
    // `LostBanner` (`ConnectedSurface.tsx`) is not exported; this
    // reproduces its literal markup (`ConnectedSurface.tsx:548-554`) —
    // a plain status div with no interactive descendant, which is the
    // only fact this test needs from it.
    document.body.innerHTML =
      '<div class="connected-lost" role="status"><span class="connected-lost-title">LOST THE MONITOR</span></div>';
    const banner = document.querySelector<HTMLElement>(".connected-lost");
    if (!banner) throw new Error("banner markup missing");
    expect(isSwipeBlocked(banner)).toBe(false);
  });

  it("blocks a button, and a span inside a button", () => {
    document.body.innerHTML =
      '<button id="btn"><span id="child">x</span></button>';
    const btn = document.getElementById("btn");
    const child = document.getElementById("child");
    expect(isSwipeBlocked(btn)).toBe(true);
    expect(isSwipeBlocked(child)).toBe(true);
  });

  it.each([
    ['<a id="t" href="/x">link</a>', true],
    ['<a id="t">no href</a>', false],
    ['<input id="t" />', true],
    ['<select id="t"></select>', true],
    ['<textarea id="t"></textarea>', true],
    ['<div id="t" contenteditable="true"></div>', true],
  ])("%s -> blocked=%s", (markup, expected) => {
    document.body.innerHTML = markup;
    const target = document.getElementById("t");
    expect(isSwipeBlocked(target)).toBe(expected);
  });

  it("blocks an element carrying data-swipe-ignore, and its children", () => {
    document.body.innerHTML =
      '<div id="ignore" data-swipe-ignore><span id="child">x</span></div>';
    const ignore = document.getElementById("ignore");
    const child = document.getElementById("child");
    expect(isSwipeBlocked(ignore)).toBe(true);
    expect(isSwipeBlocked(child)).toBe(true);
  });

  it("does not block a null target", () => {
    expect(isSwipeBlocked(null)).toBe(false);
  });
});
