// Phase RC spec 1 Task 3 — the dev-only "HOLD-OPEN ARMED" chip
// (`ConnectionLine.tsx`'s own header has the full contract). This
// component's PRE-existing behaviour (the mark + device caption) has no
// test of its own anywhere in the repo — it is exercised only indirectly
// through `ConnectedSurface.test.tsx`/`PaneLive.test.tsx` rendering the
// whole shell — so this file is the first to mount it directly, using the
// same realistic "Filling Low" library fixture every other connected-pane
// test file builds (repo rule: never a hand-built minimum).

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../../domain/monitor/program.js";
import type { Baselines, WorkoutType } from "../../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import type { HoldOpenControls } from "../../monitor/transports/holdOpen";
import { buildDraft } from "../../session/draft";
import { buildRun, type EnginePhase } from "../../session/engine";
import ConnectionLine from "./ConnectionLine";
import { buildSurfaceModel } from "./surfaceModel";

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

const MODEL = buildSurfaceModel({
  phases: FIXTURE.phases,
  program: FIXTURE.program,
  status: "live",
  linkLost: false,
  frame: null,
  deviceName: DEVICE,
  actuals: [],
  freeRow: false,
});

/** A minimal `HoldOpenControls` stub — this file is about the CHIP's own
 *  render logic (poll `status()`, show only on `"armed"`), never about
 *  `holdOpen.ts`'s decorator behaviour (that module's own test file's
 *  job), so `arm`/`release`/`ring` are never called here. */
function stubHoldOpenControls(state: "disarmed" | "armed"): HoldOpenControls {
  return {
    arm: () => undefined,
    release: () => Promise.resolve(),
    status: () => ({ state, msRemaining: null }),
    ring: () => [],
  };
}

describe("ConnectionLine — the dev-only HOLD-OPEN ARMED chip", () => {
  afterEach(() => {
    delete window.__pm5HoldOpen__;
    vi.useRealTimers();
  });

  it('renders the chip once window.__pm5HoldOpen__.status() reports "armed"', async () => {
    vi.useFakeTimers();
    window.__pm5HoldOpen__ = stubHoldOpenControls("armed");

    render(<ConnectionLine model={MODEL} />);
    // Nothing yet — the poll fires on mount synchronously via the effect,
    // but React Testing Library's render already flushes effects, so the
    // very first poll should already have found "armed".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("HOLD-OPEN ARMED")).toBeInTheDocument();
  });

  it('renders no chip when window.__pm5HoldOpen__.status() reports "disarmed"', async () => {
    vi.useFakeTimers();
    window.__pm5HoldOpen__ = stubHoldOpenControls("disarmed");

    render(<ConnectionLine model={MODEL} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByText("HOLD-OPEN ARMED")).not.toBeInTheDocument();
  });

  it("renders no chip when window.__pm5HoldOpen__ is undefined — the overwhelming common case, every real rower and every unit test that never touches the seam", async () => {
    vi.useFakeTimers();
    expect(window.__pm5HoldOpen__).toBeUndefined();

    render(<ConnectionLine model={MODEL} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByText("HOLD-OPEN ARMED")).not.toBeInTheDocument();
  });

  it("picks up an arm() that happens AFTER mount, on the next 1s poll — the mutation this pin kills: a poll that only ever reads the value captured at mount", async () => {
    vi.useFakeTimers();
    let state: "disarmed" | "armed" = "disarmed";
    window.__pm5HoldOpen__ = {
      arm: () => undefined,
      release: () => Promise.resolve(),
      status: () => ({ state, msRemaining: null }),
      ring: () => [],
    };

    render(<ConnectionLine model={MODEL} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText("HOLD-OPEN ARMED")).not.toBeInTheDocument();

    state = "armed";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("HOLD-OPEN ARMED")).toBeInTheDocument();
  });

  it("still renders the mark and device caption unconditionally — the chip is additive, not a replacement", () => {
    render(<ConnectionLine model={MODEL} />);
    expect(screen.getByText(DEVICE)).toBeInTheDocument();
  });

  // M3 fix (final-review): a real deploy's `window.__pm5HoldOpen__` is
  // ALWAYS undefined — before this fix, every connected session still ran
  // a 1s `setInterval` for its entire life polling a value that could
  // never change. `vi.getTimerCount()` proves no timer gets scheduled at
  // all in that case, not just that the rendered output happens to be the
  // same either way.
  it("schedules NO interval timer when window.__pm5HoldOpen__ is absent — the production case", () => {
    vi.useFakeTimers();
    expect(window.__pm5HoldOpen__).toBeUndefined();

    render(<ConnectionLine model={MODEL} />);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("DOES schedule the interval timer when window.__pm5HoldOpen__ is present — the dev/e2e case this early-return must not break", () => {
    vi.useFakeTimers();
    window.__pm5HoldOpen__ = stubHoldOpenControls("disarmed");

    render(<ConnectionLine model={MODEL} />);

    expect(vi.getTimerCount()).toBe(1);
  });
});
