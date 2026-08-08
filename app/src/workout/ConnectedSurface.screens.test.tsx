// The connected surface's screen fixtures — the bridge that lets
// `pnpm screenshots` photograph a surface no browser can reach yet.
//
// WHY THIS FILE EXISTS. The connected panes only render once a monitor is
// programmed and rowing, and there is no way to make that happen in the e2e
// stack today: the plan gives the DEV-gated fake-transport injection seam
// (`src/monitor/transports/index.ts`) to Task 8, the e2e stack serves a
// PRODUCTION bundle where no such seam can fire, and a real
// `requestDevice()` in headless Chromium HANGS rather than rejecting
// (`e2e/screenshots.spec.ts`'s own note on why only the FAILED interstitial
// state is captured for real). Task 5 shipped a screen with 151px of
// landscape overflow precisely because nothing photographed it.
//
// So: this file renders each state through the REAL component tree — the
// real `ConnectedSurface`, the real panes, the real model, on the real
// "Filling Low" library fixture — and writes the resulting markup to
// `e2e/fixtures/`. `e2e/screenshots.spec.ts` loads the real app (so the
// real `index.css` and the real self-hosted fonts are live), swaps that
// markup into the page, and photographs it at 390×844 and 844×390.
//
// The fixtures CANNOT go stale: `toMatchFileSnapshot` writes them when
// absent and FAILS when the component's output no longer matches, so a pane
// change that isn't re-photographed breaks this test first.
//
// What this does and does not prove: it proves LAYOUT — real fonts, real
// cascade, real viewport, which is what catches an off-frame button or an
// overflowing column. It does not prove the wiring from a live monitor to
// these numbers; `ConnectedSurface.test.tsx`'s fake-driven walk does that,
// and Task 8's `connected.spec.ts` does it in a browser once the seam
// exists.

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type {
  ConnectedPhase,
  MonitorSession,
} from "../monitor/useMonitorSession";
import { buildDraft } from "../session/draft";
import { buildRun, type EnginePhase } from "../session/engine";
import ConnectedSurface, { LAST_PANE_KEY } from "./ConnectedSurface";
import type { PaneId } from "./connected/PagerRail";

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE = "PM5 432331249";

function fillingLow(): { program: WorkoutProgram; phases: EnginePhase[] } {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "filling-low",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return { program, phases };
}

const FIXTURE = fillingLow();

/** Mid-way through the first 2000 m rep, going a little too hard: the
 *  handoff's own mockup shows `1:57.8` against a `2:00.0` target so the
 *  ochre "over" state is what the picture actually shows. */
function liveFrame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  return {
    elapsedSeconds: 828,
    distanceMeters: 800,
    currentSplit: 117.8,
    spm: 21,
    heartRateBpm: 164,
    intervalIndex: 1,
    intervalRemaining: { kind: "distance", value: 1200 },
    state: "rowing",
    ...overrides,
  };
}

function capture(
  pane: PaneId,
  phase: ConnectedPhase,
  frameOverrides: Partial<MonitorFrame> = {},
  endedBy: MonitorSession["endedBy"] = null,
): string {
  localStorage.clear();
  localStorage.setItem(LAST_PANE_KEY, pane);
  const session: MonitorSession = {
    phase,
    error: null,
    deviceName: DEVICE,
    frame: liveFrame(frameOverrides),
    actuals: [],
    endedBy,
    connect: vi.fn().mockResolvedValue(undefined),
    program: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  const view = render(
    <ConnectedSurface
      phases={FIXTURE.phases}
      program={FIXTURE.program}
      session={session}
      onEnded={vi.fn()}
    />,
  );
  const html = document.querySelector("main.connected-surface")!.outerHTML;
  view.unmount();
  return html;
}

describe("screen fixtures for pnpm screenshots", () => {
  it("pane A, rowing", async () => {
    await expect(capture("timer", "live")).toMatchFileSnapshot(
      "../../e2e/fixtures/connected-pane-timer.html",
    );
  });

  it("pane B, rowing", async () => {
    await expect(capture("live", "live")).toMatchFileSnapshot(
      "../../e2e/fixtures/connected-pane-live.html",
    );
  });

  it("pane B, no HR monitor", async () => {
    await expect(
      capture("live", "live", { heartRateBpm: null }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-pane-live-nohr.html");
  });

  it("pane A, erg paused", async () => {
    await expect(
      capture("timer", "paused", {
        intervalRemaining: { kind: "time", value: 41 },
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-paused.html");
  });

  it("pane B, connection lost", async () => {
    await expect(capture("live", "disconnected")).toMatchFileSnapshot(
      "../../e2e/fixtures/connected-disconnected.html",
    );
  });

  it("pane C's slot, until Task 7 fills it", async () => {
    await expect(capture("grid", "live")).toMatchFileSnapshot(
      "../../e2e/fixtures/connected-pane-grid.html",
    );
  });

  it("the hand-off frame at ended", async () => {
    await expect(capture("live", "ended", {}, "user")).toMatchFileSnapshot(
      "../../e2e/fixtures/connected-ended.html",
    );
  });
});
