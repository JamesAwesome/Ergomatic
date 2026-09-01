import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { api } from "../api";
import { createMonitorRun, type MonitorRun } from "../monitor/monitorRun";
import {
  commit as commitHandoff,
  resetForTests as resetHandoffStoreForTests,
} from "../monitor/handoffStore";

// The same `vi.doMock` + dynamic-import idiom LogSession.test.tsx uses — a
// real `Response`, so `.ok`/`.status`/`.json()` behave like the fetch this
// replaces.
function mockApi(
  handler: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn<typeof api>(async (path, init) => handler(path, init));
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

function savedBody(fn: ReturnType<typeof mockApi>): Record<string, unknown> {
  const call = fn.mock.calls.find(([path]) => path === "/api/logs");
  if (!call) throw new Error("no /api/logs post was made");
  return JSON.parse((call[1] as RequestInit).body as string) as Record<
    string,
    unknown
  >;
}

/** A CLOSED free-row record, built through the real builder and closed the
 *  way the hook closes one — not a hand-rolled shape (recurring failure 3).
 *  620 s over 2,480 m: the independent literals the AVG assertion needs
 *  (500 × 620 ÷ 2480 = 125.0 exactly). */
function closedFreeRow(over: Partial<MonitorRun> = {}): MonitorRun {
  const run = createMonitorRun(
    {
      workoutId: null,
      title: "Just Row",
      program: { intervals: [] },
      deviceName: "PM5 432331249",
      logSeed: { steps: [], paces: {} },
      mode: "justrow",
    },
    new Date("2026-09-01T09:00:00.000Z"),
  );
  return {
    ...run,
    completedAt: "2026-09-01T09:10:20.000Z",
    endedBy: "rower",
    summaryTotals: { workElapsedSeconds: 620, workDistanceMeters: 2480 },
    ...over,
  };
}

async function renderDoor() {
  const { default: JustRowLog } = await import("./JustRowLog");
  return render(
    <MemoryRouter initialEntries={["/justrow/log"]}>
      <Routes>
        <Route path="/justrow/log" element={<JustRowLog />} />
        <Route path="*" element={<p>ELSEWHERE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("JustRowLog (the workout-less log door)", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });
  afterEach(() => {
    vi.doUnmock("../api");
    vi.resetModules();
  });

  it("labels the rating PAIN and asks no targets question", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    commitHandoff(closedFreeRow().startedAt, null, closedFreeRow());
    await renderDoor();

    // PAIN, not ACTUAL PAIN: the word ACTUAL exists to contrast with the
    // workout's own EXPECTED rating beside it, and a free row has no
    // expectation to contrast with (Gate 0, James's own amendment).
    expect(screen.getByText("PAIN")).toBeInTheDocument();
    expect(screen.queryByText(/ACTUAL PAIN/)).not.toBeInTheDocument();
    // Absent outright, never disabled: a free row was never given a target
    // to hold, so the question has no honest answer (exit criterion shape).
    expect(
      screen.queryByText(/DID YOU HOLD THE TARGETS/),
    ).not.toBeInTheDocument();
  });

  it("renders the numbers, no intervals table and no type badge", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    commitHandoff(closedFreeRow().startedAt, null, closedFreeRow());
    await renderDoor();

    expect(
      screen.getByRole("heading", { name: "Just Row" }),
    ).toBeInTheDocument();
    // 620 s → 10:20; 2,480 m; 125.0 s → 2:05.0. Independent literals.
    expect(screen.getByText("10:20")).toBeInTheDocument();
    expect(screen.getByText("2,480 m")).toBeInTheDocument();
    expect(screen.getByText("2:05.0")).toBeInTheDocument();
    // Absences, not empty widgets (exit criteria 2 and 3's shape).
    expect(document.querySelector(".type-badge")).toBeNull();
    expect(screen.queryByText(/INTERVALS/)).not.toBeInTheDocument();
  });

  it("saves a free row: advancesPlan false, both ids null, steps empty, AVG derived", async () => {
    const fn = mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    commitHandoff(closedFreeRow().startedAt, null, closedFreeRow());
    await renderDoor();

    await userEvent.click(
      screen.getByRole("button", { name: "Save this row" }),
    );

    await waitFor(() => {
      const body = savedBody(fn);
      expect(body.advancesPlan).toBe(false);
      expect(body.workoutId).toBeNull();
      expect(body.workoutType).toBeNull();
      expect(body.workoutTitle).toBe("Just Row");
      expect(body.steps).toStrictEqual([]);
      expect(body.timeSeconds).toBe(620);
      expect(body.distanceMeters).toBe(2480);
      // The stored derivation, against its own literal — never against the
      // production helper's output (recurring failure 21).
      expect(body.avgSplitSeconds).toBe(125);
      expect(body.endedBy).toBe("rower");
    });
  });

  it("with no free-row record on the store, offers nothing to log and leaves", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    await renderDoor();

    // Landed elsewhere, not a broken form over nothing.
    expect(await screen.findByText("ELSEWHERE")).toBeInTheDocument();
  });
});

describe("JustRowLog with no numbers", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });
  afterEach(() => {
    vi.doUnmock("../api");
    vi.resetModules();
  });

  it("a record with no numbers at all still offers the save, saying why", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    // No summaryTotals and no series: the burst never landed and the trace
    // is empty — the interrupted-recovery worst case.
    const bare = closedFreeRow({ summaryTotals: undefined });
    commitHandoff(bare.startedAt, null, bare);
    await renderDoor();

    expect(
      screen.getByText(
        "The monitor's numbers did not reach the phone for this row.",
      ),
    ).toBeInTheDocument();
    // The save stays offered — the row's existence is still worth keeping —
    // and pressing it posts NOTHING, because a save with no numbers is not
    // designed yet and a zero would be a wrong number.
    expect(
      screen.getByRole("button", { name: "Save this row" }),
    ).toBeInTheDocument();
  });
});

describe("JustRowLog reflection", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });
  afterEach(() => {
    vi.doUnmock("../api");
    vi.resetModules();
  });

  it("pain and notes travel on the save, and a re-tap clears the pain", async () => {
    const fn = mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    commitHandoff(closedFreeRow().startedAt, null, closedFreeRow());
    await renderDoor();

    await userEvent.click(screen.getByRole("button", { name: "Pain 3" }));
    expect(screen.getByRole("button", { name: "Pain 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The house clearable idiom: the same tap again returns to null.
    await userEvent.click(screen.getByRole("button", { name: "Pain 3" }));
    expect(screen.getByRole("button", { name: "Pain 3" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(screen.getByRole("button", { name: "Pain 2" }));
    await userEvent.type(screen.getByLabelText("NOTES"), "Steady pull.");

    await userEvent.click(
      screen.getByRole("button", { name: "Save this row" }),
    );

    await waitFor(() => {
      const body = savedBody(fn);
      expect(body.pain).toBe(2);
      expect(body.notes).toBe("Steady pull.");
    });
  });
});
