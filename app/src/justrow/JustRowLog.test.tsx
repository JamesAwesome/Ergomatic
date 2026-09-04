import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { api } from "../api";
import type { PlanData } from "../api/usePlan";
import { createMonitorRun, type MonitorRun } from "../monitor/monitorRun";
import { advance, buildFreeRowRun } from "../session/engine";
import { loadRun, saveRun, type SessionRun } from "../session/run";
import {
  commit as commitHandoff,
  resetForTests as resetHandoffStoreForTests,
} from "../monitor/handoffStore";

/** The plan the door reads through `usePlan()` (substitution spec
 *  2026-09-02, §Mechanism 2). `NO_PLAN` is the server's own no-plan body;
 *  `ACTIVE_PLAN` mirrors `LogSession.test.tsx`'s `activePlan()` — doneN 3
 *  of a real-length 84 sequence, so the lead label's arithmetic
 *  (`SESSION 4 OF 84`) is checked against independent literals. */
const NO_PLAN: PlanData = { planKey: null, doneN: 0, sequence: [] };
const ACTIVE_PLAN: PlanData = {
  planKey: "sprint",
  doneN: 3,
  sequence: Array.from({ length: 84 }, (_, i) => ({
    index: i,
    code: "O2",
    status: i < 3 ? "done" : i === 3 ? "today" : "upcoming",
  })),
};

// The same `vi.doMock` + dynamic-import idiom LogSession.test.tsx uses — a
// real `Response`, so `.ok`/`.status`/`.json()` behave like the fetch this
// replaces. `GET /api/plan` is answered HERE, at the wire, rather than by
// mocking `usePlan` at the hook: the door reads the plan through the same
// `api` seam it posts through, so one mock covers both and no test can
// render a pair against a plan the wire never carried.
function mockApi(
  handler: (path: string, init?: RequestInit) => Response | Promise<Response>,
  plan: PlanData = NO_PLAN,
) {
  const fn = vi.fn<typeof api>(async (path, init) =>
    path === "/api/plan"
      ? new Response(JSON.stringify(plan))
      : handler(path, init),
  );
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
    summaryDetail: {
      avgStrokeRate: 22,
      endingHeartRateBpm: null,
      avgHeartRateBpm: null,
      minHeartRateBpm: null,
      maxHeartRateBpm: null,
      dragFactorAverage: 128,
      workoutType: 8,
      recoveryHeartRateBpm: null,
      avgPaceSecondsPer500m: 125,
    },
    verificationBytes: [0x27, 0xd8, 0xf3, 0x6e],
    ...over,
  };
}

/** A FINISHED free-row TIMER run, built through the real assembly
 *  (`buildFreeRowRun` → the Timer's own finish shape: the one
 *  `"stopwatch-elapsed"` actual keyed by position, then `advance`) and
 *  round-tripped through JSON the way storage does — never a hand-rolled
 *  shape (recurring failure 3). 754 s = 12:34, an independent literal. */
function completedTimerRun(
  startedAt = "2026-09-02T21:40:00.000Z",
  completedAt = "2026-09-02T21:52:34.000Z",
  elapsedSeconds = 754,
): SessionRun {
  const run = buildFreeRowRun(new Date(startedAt));
  const finished = advance(
    {
      ...run,
      actuals: { 0: { actualSource: "stopwatch-elapsed", elapsedSeconds } },
    },
    new Date(completedAt),
  );
  return JSON.parse(JSON.stringify(finished)) as SessionRun;
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
    // Absence, not an empty widget (exit criterion 3's shape). The
    // `.type-badge` null check that used to sit beside it was vacuous —
    // this door never renders `TypeBadge` for any row — and is pinned
    // where a badge can exist instead (`TypeBadge.test.tsx`, the history
    // list in `e2e/justrow.spec.ts`).
    expect(screen.queryByText(/INTERVALS/)).not.toBeInTheDocument();
  });

  it("saves a free row without a plan: advancesPlan false, both ids null, steps empty, AVG derived", async () => {
    const fn = mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    commitHandoff(closedFreeRow().startedAt, null, closedFreeRow());
    await renderDoor();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const body = savedBody(fn);
      expect(body.advancesPlan).toBe(false);
      expect(body.workoutId).toBeNull();
      expect(body.workoutType).toBeNull();
      expect(body.workoutTitle).toBe("Just Row");
      expect(body.steps).toStrictEqual([]);
      // Just Row unconnected spec (2026-09-02), exit criterion 3b: the
      // monitor entry names its door — `pm5`.
      expect(body.source).toBe("pm5");
      expect(body.timeSeconds).toBe(620);
      expect(body.distanceMeters).toBe(2480);
      // The stored derivation, against its own literal — never against the
      // production helper's output (recurring failure 21).
      expect(body.avgSplitSeconds).toBe(125);
      expect(body.endedBy).toBe("rower");
      // THE MACHINE FIELDS (PM final gate, B2 — the seam RF24 priced at
      // zero of sixteen production rows on the programmed path): the PR's
      // headline claim is that MACHINE CONFIRMED reaches free rows, and
      // that claim is only true if THESE keys survive the post. Asserted
      // against the fixture's own literals, machine detail and
      // verification bytes included.
      expect(body.machineWorkSeconds).toBe(620);
      expect(body.machineWorkMeters).toBe(2480);
      expect(
        (body.machineSummary as { verificationBytes?: number[] })
          .verificationBytes,
      ).toStrictEqual([0x27, 0xd8, 0xf3, 0x6e]);
      expect(
        (body.machineSummary as { avgPaceSecondsPer500m?: number })
          .avgPaceSecondsPer500m,
      ).toBe(125);
    });
  });

  it("rounds a fractional-metre summary at the payload boundary — 500.5 posts as 501", async () => {
    // 0x0039 distance is tenths-precision; the server requires whole
    // metres on all three metre fields, and an unrounded 500.5 would 400
    // the save with no recovery (review #1, finding 3).
    const fn = mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    const fractional = closedFreeRow({
      summaryTotals: { workElapsedSeconds: 120.4, workDistanceMeters: 500.5 },
    });
    commitHandoff(fractional.startedAt, null, fractional);
    await renderDoor();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const body = savedBody(fn);
      expect(body.distanceMeters).toBe(501);
      expect(body.workMeters).toBe(501);
      expect(body.machineWorkMeters).toBe(501);
      // The seconds pair stays fractional — only the metre fields are
      // whole wire fields by the server's own validator.
      expect(body.timeSeconds).toBe(120.4);
    });
  });

  it("with no free-row record on the store, offers nothing to log and leaves", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    await renderDoor();

    // Landed elsewhere, not a broken form over nothing.
    expect(await screen.findByText("ELSEWHERE")).toBeInTheDocument();
  });

  it("the Just Row MONITOR door posts the close stamp too, not just the session door's", async () => {
    // The class, not the instance: this is the app's other `source: "pm5"`
    // producer, over the same `MonitorRun` record, behind the same
    // eligibility fence. Fixing only `LogSession.tsx` would leave a free
    // row that ends `finished` uploading with its save clock as C2's date.
    const fn = mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    commitHandoff(closedFreeRow().startedAt, null, closedFreeRow());
    await renderDoor();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const body = savedBody(fn);
      // `closedFreeRow`'s own literal — the MONITOR fixture's close
      // stamp, not `completedTimerRun`'s, which is a different clock on a
      // door that posts neither field. Written out, never read back
      // through the production path.
      expect(body.completedAt).toBe("2026-09-01T09:10:20.000Z");
      expect(body.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
  });
});

// Substitution spec (2026-09-02) §Mechanism 2, exit criterion 2: the door
// borrows `PostWorkoutSummary`'s pair and its no-plan rule verbatim. With a
// plan, `Log against plan · SESSION n OF N` leads (`.summary-save-lead`)
// and posts `advancesPlan: true` — the opt-in the store now honours for a
// free row — while `Save without logging` sits under it
// (`.summary-save-secondary`) and posts `false`. With no plan, `Save
// without logging` leads alone. "Save this row" is retired: it existed
// because a free row could never count. Both entry kinds, both plan
// states — the MONITOR entry and the TIMER entry render the same stack.
describe("JustRowLog: the plan pair (a Just Row stands in for a session)", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });
  afterEach(() => {
    vi.doUnmock("../api");
    vi.resetModules();
  });

  const entries = [
    {
      kind: "monitor",
      seed: () =>
        commitHandoff(closedFreeRow().startedAt, null, closedFreeRow()),
    },
    { kind: "timer", seed: () => saveRun(completedTimerRun()) },
  ] as const;

  describe.each(entries)("$kind entry", ({ seed }) => {
    it("with a plan: the shipped pair, exact label and classes, lead first", async () => {
      mockApi(() => new Response(JSON.stringify({ id: "log-1" })), ACTIVE_PLAN);
      seed();
      await renderDoor();

      // The label is the shipped formula against independent literals:
      // doneN 3 + 1, of 84.
      const lead = await screen.findByRole("button", {
        name: "Log against plan · SESSION 4 OF 84",
      });
      const secondary = screen.getByRole("button", {
        name: "Save without logging",
      });
      expect(lead).toHaveClass("summary-save-lead");
      expect(secondary).toHaveClass("summary-save-secondary");
      // Lead ABOVE secondary in document order — the pair's own order.
      expect(
        lead.compareDocumentPosition(secondary) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.queryByText("Save this row")).toBeNull();
    });

    it("with a plan: Log against plan posts advancesPlan: true", async () => {
      const fn = mockApi(
        () => new Response(JSON.stringify({ id: "log-1" })),
        ACTIVE_PLAN,
      );
      seed();
      await renderDoor();

      await userEvent.click(
        await screen.findByRole("button", {
          name: "Log against plan · SESSION 4 OF 84",
        }),
      );

      await waitFor(() => {
        const body = savedBody(fn);
        expect(body.advancesPlan).toBe(true);
        expect(body.workoutId).toBeNull();
        expect(body.workoutType).toBeNull();
        expect(body.workoutTitle).toBe("Just Row");
      });
    });

    it("with a plan: Save without logging posts advancesPlan: false", async () => {
      const fn = mockApi(
        () => new Response(JSON.stringify({ id: "log-1" })),
        ACTIVE_PLAN,
      );
      seed();
      await renderDoor();

      // Wait for the pair to resolve first, so the click below is on the
      // secondary of a rendered pair, not on a no-plan lead that happens
      // to share the label.
      await screen.findByRole("button", {
        name: "Log against plan · SESSION 4 OF 84",
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Save without logging" }),
      );

      await waitFor(() => {
        expect(savedBody(fn).advancesPlan).toBe(false);
      });
    });

    // Timer-mode spec (2026-09-02, ruling 5): the no-plan button reads
    // `Save` on this door too — `Save without logging` survives only
    // beneath `Log against plan` (the pair tests above).
    it("with no plan: Save leads alone — no Log against plan, no Save without logging, no Save this row", async () => {
      mockApi(() => new Response(JSON.stringify({ id: "log-1" })), NO_PLAN);
      seed();
      await renderDoor();

      const only = await screen.findByRole("button", { name: "Save" });
      expect(only).toHaveClass("summary-save-lead");
      expect(screen.queryByText(/Log against plan/)).toBeNull();
      expect(screen.queryByText("Save without logging")).toBeNull();
      expect(screen.queryByText("Save this row")).toBeNull();
      expect(
        screen
          .getAllByRole("button")
          .filter((b) => /Save|Log/.test(b.textContent ?? "")),
      ).toHaveLength(1);
    });
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

  it("a record with no numbers disables the save and says why", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    // No summaryTotals and no series: the burst never landed and the trace
    // is empty — the interrupted-recovery worst case (a flaky link drop).
    const bare = closedFreeRow({ summaryTotals: undefined });
    commitHandoff(bare.startedAt, null, bare);
    await renderDoor();

    expect(
      screen.getByText(
        "The monitor's numbers did not reach the phone for this row, so there is nothing to save.",
      ),
    ).toBeInTheDocument();
    // DISABLED, not merely present (the PM gate's B5, and recurring
    // failure 4's shape): the first cut asserted `toBeInTheDocument()` on a
    // button whose handler silently returned — a dead control enshrined by
    // its own test. A numberless save is undesigned work against the
    // stored shape PR 1 froze, and the honest state until then is a
    // disabled button over a line that says why.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const body = savedBody(fn);
      expect(body.pain).toBe(2);
      expect(body.notes).toBe("Steady pull.");
    });
  });
});

/**
 * The TIMER entry (Just Row without the monitor, spec 2026-09-02, §Mechanism
 * piece 4; exit criteria 1 and 3): a finished `SessionRun` with
 * `mode: "justrow"` on `RUN_KEY`, no monitor record anywhere.
 */
describe("JustRowLog: the timer entry", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });
  afterEach(() => {
    vi.doUnmock("../api");
    vi.resetModules();
  });

  it("renders TIME alone under a SEP 2 · TIMER meta line — no DISTANCE, no AVG SPLIT, no dash", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    saveRun(completedTimerRun());
    await renderDoor();

    expect(
      screen.getByRole("heading", { name: "Just Row" }),
    ).toBeInTheDocument();
    // The device slot reads TIMER (handoff `LogDoor.dc.html`).
    expect(screen.getByText("SEP 2 · TIMER")).toBeInTheDocument();
    expect(screen.getByText("TIME")).toBeInTheDocument();
    expect(screen.getByText("12:34")).toBeInTheDocument();
    // Absence only (Global Constraints: never a `0 m` or a `—` for a
    // timer row) — no cell, no label, no placeholder.
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();
    expect(screen.queryByText("AVG SPLIT")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d m$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/INTERVALS/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("Save posts the time-only body with source timer and NO distance, split, device or machine keys; success clears the run", async () => {
    const fn = mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    saveRun(completedTimerRun());
    await renderDoor();

    await userEvent.click(screen.getByRole("button", { name: "Pain 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const body = savedBody(fn);
      expect(body.workoutId).toBeNull();
      expect(body.workoutType).toBeNull();
      expect(body.workoutTitle).toBe("Just Row");
      expect(body.steps).toStrictEqual([]);
      expect(body.timeSeconds).toBe(754);
      expect(body.advancesPlan).toBe(false);
      // Exit criterion 3b: the timer entry names its door.
      expect(body.source).toBe("timer");
      expect(body.pain).toBe(2);
      // KEY ABSENCE, not `undefined`: `"k" in body` is false only when the
      // key never went on the wire — a `distanceMeters: undefined` would
      // be dropped by JSON either way, but a `distanceMeters: 0` would not,
      // and the server would store a wrong number.
      expect("distanceMeters" in body).toBe(false);
      expect("avgSplitSeconds" in body).toBe(false);
      expect("deviceName" in body).toBe(false);
      expect("workSeconds" in body).toBe(false);
      expect("workMeters" in body).toBe(false);
      expect("machineWorkSeconds" in body).toBe(false);
      expect("machineSummary" in body).toBe(false);
      expect("series" in body).toBe(false);
      // Wave E PR2 Task 6, fix round 1 (F1). The close-stamp pair is the
      // app's SECOND `source: "timer"` door, and the negative invariant has
      // to be asserted at both or it is an instance fix wearing a class
      // fix's reasoning. `eligibilityFailure`'s first gate refuses a
      // `timer` row before a Concept2 payload is ever built, so a zone
      // stored here has no reader — one more attribute about the rower's
      // device for nothing, against the standing "ask as little as we can"
      // ruling. Until this round, adding `...completionStamp(door.run)` to
      // this door's own submit left all 4,822 client tests green.
      expect("completedAt" in body).toBe(false);
      expect("tz" in body).toBe(false);
    });
    // Lifetime table: a successful save is a clear site for the run.
    await waitFor(() => expect(loadRun()).toBeNull());
    expect(await screen.findByText("ELSEWHERE")).toBeInTheDocument();
  });

  it("a failed save shows the error and leaves the run on disk to retry", async () => {
    mockApi(() => new Response("nope", { status: 500 }));
    saveRun(completedTimerRun());
    await renderDoor();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
    // RF25: the record outlives a failed write — nothing was cleared.
    expect(loadRun()?.completedAt).toBe("2026-09-02T21:52:34.000Z");
    expect(screen.queryByText("ELSEWHERE")).not.toBeInTheDocument();
  });

  it("a finished run with no actual disables the save", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    const noActual = { ...completedTimerRun(), actuals: {} };
    saveRun(noActual);
    await renderDoor();

    expect(screen.getByText("SEP 2 · TIMER")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("12:34")).not.toBeInTheDocument();
  });

  it("a LIVE timer run (not finished) is not this door's to log", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    saveRun(buildFreeRowRun(new Date("2026-09-02T21:40:00.000Z")));
    await renderDoor();

    expect(await screen.findByText("ELSEWHERE")).toBeInTheDocument();
    // Falls through UNTOUCHED — the Timer is still driving that record.
    expect(loadRun()?.completedAt).toBeNull();
  });
});

/**
 * EXIT CRITERION 7c — precedence, stated: the monitor hand-off first, then
 * the timer run; BOTH present is the invariant the coexistence guards exist
 * to prevent, and when it is violated anyway the door renders the NEWER
 * `completedAt` and files a ring entry naming the other — never a silent
 * pick. Both orderings are pinned so a swapped precedence goes red.
 */
describe("JustRowLog: precedence when both records exist", () => {
  const RING_KEY = "ergomatic:log-door-misses";

  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });
  afterEach(() => {
    vi.doUnmock("../api");
    vi.resetModules();
  });

  function ringEntries(): { kind: string; detail: string }[] {
    return JSON.parse(localStorage.getItem(RING_KEY) ?? "[]") as {
      kind: string;
      detail: string;
    }[];
  }

  it("the newer TIMER run wins over an older monitor hand-off, and the ring names the monitor record", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    // Monitor closed 2026-09-01T09:10:20Z (closedFreeRow's own literal);
    // timer finished a day later.
    commitHandoff(closedFreeRow().startedAt, null, closedFreeRow());
    saveRun(completedTimerRun());
    await renderDoor();

    expect(screen.getByText("SEP 2 · TIMER")).toBeInTheDocument();
    expect(screen.getByText("12:34")).toBeInTheDocument();
    expect(screen.queryByText(/PM5 432331249/)).not.toBeInTheDocument();
    expect(screen.queryByText("2,480 m")).not.toBeInTheDocument();

    const conflict = ringEntries().filter(
      (e) => e.kind === "justrow-log-door-conflict",
    );
    expect(conflict).toHaveLength(1);
    expect(conflict[0]!.detail).toContain("rendered=timer");
    expect(conflict[0]!.detail).toContain("other=monitor");
    // Names the other record: its session key and its close.
    expect(conflict[0]!.detail).toContain("2026-09-01T09:00:00.000Z");
    expect(conflict[0]!.detail).toContain("2026-09-01T09:10:20.000Z");
  });

  it("the newer MONITOR hand-off wins over an older timer run, and the ring names the timer record", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    commitHandoff(closedFreeRow().startedAt, null, closedFreeRow());
    // Timer finished the day BEFORE the monitor row closed.
    saveRun(
      completedTimerRun("2026-08-31T09:00:00.000Z", "2026-08-31T09:12:34.000Z"),
    );
    await renderDoor();

    expect(screen.getByText("SEP 1 · PM5 432331249")).toBeInTheDocument();
    expect(screen.getByText("2,480 m")).toBeInTheDocument();
    expect(screen.queryByText("TIMER")).not.toBeInTheDocument();
    expect(screen.queryByText("12:34")).not.toBeInTheDocument();

    const conflict = ringEntries().filter(
      (e) => e.kind === "justrow-log-door-conflict",
    );
    expect(conflict).toHaveLength(1);
    expect(conflict[0]!.detail).toContain("rendered=monitor");
    expect(conflict[0]!.detail).toContain("other=timer");
    expect(conflict[0]!.detail).toContain("2026-08-31T09:12:34.000Z");
  });

  it("with only one record, the ring stays silent", async () => {
    mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    saveRun(completedTimerRun());
    await renderDoor();

    expect(screen.getByText("SEP 2 · TIMER")).toBeInTheDocument();
    expect(
      ringEntries().filter((e) => e.kind === "justrow-log-door-conflict"),
    ).toHaveLength(0);
  });
});
