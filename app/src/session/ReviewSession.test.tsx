import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import { compileProgram } from "../../domain/monitor/program.js";
import { buildDraft, DRAFT_KEY } from "./draft";
import { advance, buildFreeRowRun, buildRun } from "./engine";
import { buildLogSeed } from "./logDraft";
import { MONITOR_RUN_KEY, type MonitorRun } from "../monitor/monitorRun";
import { RUN_KEY } from "./run";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { PlanState } from "../api/usePlan";
import { reviewLocation } from "./reviewSelector";

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };
const seed = LIBRARY_WORKOUTS.find((w) => w.title === "Stationary Front")!;
const workout: LibraryWorkout = {
  ...seed,
  id: "retained-workout",
  isGlobal: true,
  lastDoneDaysAgo: null,
};
function monitor(over: Partial<MonitorRun> = {}): MonitorRun {
  const run = buildRun(
    buildDraft(workout),
    BASELINES,
    new Date("2026-09-04T12:00:00.000Z"),
  );
  const program = compileProgram(run.phases);
  if ("code" in program) throw new Error(program.message);
  return {
    v: 2,
    workoutId: workout.id,
    title: workout.title,
    program,
    logSeed: buildLogSeed(run.phases, BASELINES),
    actuals: [
      {
        index: 0,
        elapsedSeconds: 120,
        distanceMeters: 450,
        avgSplit: 133.3,
        avgSpm: 24,
        avgHeartRateBpm: null,
        restDistanceMeters: 0,
      },
    ],
    startedAt: "2026-09-04T12:00:00.000Z",
    completedAt: "2026-09-04T12:30:00.000Z",
    deviceName: "PM5 123",
    terminated: false,
    endedBy: "finished",
    ...over,
  };
}
function timerFreeRow() {
  return advance(
    {
      ...buildFreeRowRun(new Date("2026-09-04T13:00:00.000Z")),
      actuals: {
        0: { actualSource: "stopwatch-elapsed", elapsedSeconds: 754 },
      },
    },
    new Date("2026-09-04T13:12:34.000Z"),
  );
}
function timerWorkout() {
  const draft = buildDraft(workout);
  let run = buildRun(draft, BASELINES, new Date("2026-09-04T13:00:00.000Z"));
  while (run.completedAt === null)
    run = advance(run, new Date("2026-09-04T13:15:00.000Z"));
  return { run, draft };
}
function designatedTest(source: "timer" | "monitor") {
  const testWorkout: LibraryWorkout = {
    ...ONBOARDING_LIBRARY_WORKOUTS.find((w) => w.title === "2K Test")!,
    id: "retained-2k-test",
    isGlobal: true,
    lastDoneDaysAgo: null,
  };
  const built = buildRun(
    buildDraft(testWorkout),
    null,
    new Date("2026-09-04T12:00:00.000Z"),
  );
  const timer = advance(
    {
      ...built,
      actuals: {
        0: {
          elapsedSeconds: 473.6,
          splitSeconds: 118.4,
          actualSource: "stopwatch",
        },
      },
    },
    new Date("2026-09-04T12:07:53.600Z"),
  );
  const program = compileProgram(built.phases);
  if ("code" in program) throw new Error(program.message);
  const pm5 = monitor({
    workoutId: testWorkout.id,
    title: testWorkout.title,
    program,
    logSeed: buildLogSeed(built.phases, null),
    actuals: [
      {
        index: 0,
        elapsedSeconds: 473.6,
        distanceMeters: 2000,
        avgSplit: 118.4,
        avgSpm: 30,
        avgHeartRateBpm: 168,
        restDistanceMeters: 0,
      },
    ],
  });
  const run = source === "timer" ? timer : pm5;
  localStorage.setItem(
    source === "timer" ? RUN_KEY : MONITOR_RUN_KEY,
    JSON.stringify(run),
  );
  return { testWorkout, run };
}
let library:
  | { state: "ready"; workouts: LibraryWorkout[] }
  | { state: "loading" }
  | { state: "error"; retry: () => void };
let api: ReturnType<typeof vi.fn>;
let plan: PlanState;
beforeEach(() => {
  vi.resetModules();
  vi.doUnmock("./PostWorkoutSummary");
  localStorage.clear();
  library = { state: "ready", workouts: [workout] };
  vi.doMock("../api/useWorkouts", () => ({ useWorkouts: () => library }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines: BASELINES }),
  }));
  plan = {
    state: "ready",
    plan: { planKey: null, doneN: 0, sequence: [] },
    choose: vi.fn(),
    reset: vi.fn(),
  };
  vi.doMock("../api/usePlan", () => ({ usePlan: () => plan }));
  api = vi.fn(
    async () =>
      new Response(JSON.stringify({ id: "saved-log" }), { status: 201 }),
  );
  vi.doMock("../api", () => ({ api }));
});
async function open(
  search = reviewLocation("monitor", "2026-09-04T12:00:00.000Z"),
) {
  const { default: ReviewSession } = await import("./ReviewSession");
  const view = () => (
    <MemoryRouter initialEntries={[search]}>
      <Routes>
        <Route
          path="/session/review"
          element={
            <>
              <ReviewSession />
              <Link to={reviewLocation("timer", "2026-09-04T13:00:00.000Z")}>
                Review timer instead
              </Link>
            </>
          }
        />
        <Route path="/today" element={<h1>Today</h1>} />
        <Route path="/today/log" element={<h1>History</h1>} />
      </Routes>
    </MemoryRouter>
  );
  const result = render(view());
  return { ...result, refresh: () => result.rerender(view()) };
}

describe("selected recording recovery", () => {
  it.each(["timer", "monitor"] as const)(
    "selected %s known designated test preserves measured save, offer and history",
    async (source) => {
      const { testWorkout, run } = designatedTest(source);
      library = { state: "ready", workouts: [testWorkout] };
      await open(reviewLocation(source, run.startedAt));
      await screen.findByRole("heading", { name: "2K Test" });
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        await screen.findByRole("heading", { name: "Set your 2k baseline?" }),
      ).toBeVisible();
      expect(screen.getByText("1:58.4")).toBeVisible();
      const logs = api.mock.calls.filter(([path]) => path === "/api/logs");
      expect(logs).toHaveLength(1);
      expect(JSON.parse(logs[0]![1].body)).toMatchObject({
        workoutId: "retained-2k-test",
        workoutTitle: "2K Test",
        workoutType: "AN",
        source: source === "monitor" ? "pm5" : "timer",
        timeSeconds: 473.6,
        avgSplitSeconds: 118.4,
        advancesPlan: false,
      });
      expect(JSON.parse(logs[0]![1].body).distanceMeters).toBe(
        source === "monitor" ? 2000 : undefined,
      );
      const history = api.mock.calls.filter(
        ([path]) => path === "/api/test-history",
      );
      expect(history).toHaveLength(1);
      expect(JSON.parse(history[0]![1].body)).toStrictEqual({
        distance: "2k",
        splitSeconds: 118.4,
        logId: "saved-log",
      });
      expect(
        localStorage.getItem(source === "timer" ? RUN_KEY : MONITOR_RUN_KEY),
      ).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Not now" }));
      expect(
        await screen.findByRole("heading", { name: "Today" }),
      ).toBeVisible();
      expect(
        api.mock.calls.filter(([path]) => path === "/api/baselines"),
      ).toHaveLength(0);
    },
  );
  it.each(["timer", "monitor"] as const)(
    "selected %s unknown designated title saves without awarding an offer or test history",
    async (source) => {
      const { run } = designatedTest(source);
      library = { state: "ready", workouts: [] };
      await open(reviewLocation(source, run.startedAt));
      await screen.findByRole("heading", { name: "2K Test" });
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: "Workout type" }),
        "TR",
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        await screen.findByRole("heading", { name: "Today" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "Set your 2k baseline?" }),
      ).not.toBeInTheDocument();
      const logs = api.mock.calls.filter(([path]) => path === "/api/logs");
      expect(logs).toHaveLength(1);
      expect(JSON.parse(logs[0]![1].body)).toMatchObject({
        workoutId: "retained-2k-test",
        workoutTitle: "2K Test",
        workoutType: "TR",
        source: source === "monitor" ? "pm5" : "timer",
        timeSeconds: 473.6,
        avgSplitSeconds: 118.4,
      });
      expect(JSON.parse(logs[0]![1].body).distanceMeters).toBe(
        source === "monitor" ? 2000 : undefined,
      );
      expect(
        api.mock.calls.filter(
          ([path]) => path === "/api/test-history" || path === "/api/baselines",
        ),
      ).toHaveLength(0);
      expect(
        localStorage.getItem(source === "timer" ? RUN_KEY : MONITOR_RUN_KEY),
      ).toBeNull();
    },
  );
  it.each(["timer", "monitor"] as const)(
    "selected %s rejects a global linked row whose title disagrees with the retained test title",
    async (source) => {
      const { testWorkout, run } = designatedTest(source);
      library = {
        state: "ready",
        workouts: [
          { ...testWorkout, title: "Stationary Front", isGlobal: true },
        ],
      };
      await open(reviewLocation(source, run.startedAt));
      await screen.findByRole("heading", { name: "2K Test" });
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByRole("heading", { name: "Today" });
      expect(
        screen.queryByRole("heading", { name: "Set your 2k baseline?" }),
      ).not.toBeInTheDocument();
      const log = api.mock.calls.find(([path]) => path === "/api/logs")!;
      expect(JSON.parse(log[1].body).workoutTitle).toBe("2K Test");
      expect(
        api.mock.calls.filter(([path]) => path === "/api/test-history"),
      ).toHaveLength(0);
    },
  );
  it.each(["timer", "monitor"] as const)(
    "selected %s rejects a designated linked row when the retained title disagrees",
    async (source) => {
      const { testWorkout, run } = designatedTest(source);
      const retained = { ...run, title: "Stationary Front" };
      localStorage.setItem(
        source === "timer" ? RUN_KEY : MONITOR_RUN_KEY,
        JSON.stringify(retained),
      );
      library = { state: "ready", workouts: [testWorkout] };
      await open(reviewLocation(source, retained.startedAt));
      await screen.findByRole("heading", { name: "Stationary Front" });
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByRole("heading", { name: "Today" });
      const log = api.mock.calls.find(([path]) => path === "/api/logs")!;
      expect(JSON.parse(log[1].body).workoutTitle).toBe("Stationary Front");
      expect(
        api.mock.calls.filter(([path]) => path === "/api/test-history"),
      ).toHaveLength(0);
    },
  );
  it.each([
    ["timer", "loading"],
    ["timer", "error"],
    ["monitor", "loading"],
    ["monitor", "error"],
  ] as const)(
    "selected %s saves while plan is %s without asserting advancesPlan",
    async (source, state) => {
      const run = source === "timer" ? timerWorkout().run : monitor();
      localStorage.setItem(
        source === "timer" ? RUN_KEY : MONITOR_RUN_KEY,
        JSON.stringify(run),
      );
      plan = state === "loading" ? { state } : { state, retry: vi.fn() };
      await open(reviewLocation(source, run.startedAt));
      expect(
        await screen.findByRole("heading", { name: "Stationary Front" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /Log against plan/ }),
      ).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        await screen.findByRole("heading", { name: "Today" }),
      ).toBeVisible();
      expect(api).toHaveBeenCalledTimes(1);
      expect(api.mock.calls[0]![0]).toBe("/api/logs");
      const body = JSON.parse(api.mock.calls[0]![1].body);
      expect(body).not.toHaveProperty("advancesPlan");
      expect(body).toMatchObject({
        workoutId: "retained-workout",
        workoutType: "AT",
        source: source === "monitor" ? "pm5" : "timer",
        timeSeconds: source === "monitor" ? 120 : 900,
      });
      expect(
        localStorage.getItem(source === "timer" ? RUN_KEY : MONITOR_RUN_KEY),
      ).toBeNull();
    },
  );
  it.each([
    ["null totals", null],
    ["empty totals", {}],
    ["missing seconds", { workDistanceMeters: 450 }],
    ["missing meters", { workElapsedSeconds: 120 }],
    ["null seconds", { workElapsedSeconds: null, workDistanceMeters: 450 }],
    ["null meters", { workElapsedSeconds: 120, workDistanceMeters: null }],
    ["string seconds", { workElapsedSeconds: "120", workDistanceMeters: 450 }],
    ["string meters", { workElapsedSeconds: 120, workDistanceMeters: "450" }],
    ["boolean seconds", { workElapsedSeconds: true, workDistanceMeters: 450 }],
    ["boolean meters", { workElapsedSeconds: 120, workDistanceMeters: false }],
  ])(
    "malformed Just Row %s preserves full read-only recording without save",
    async (_label, totals) => {
      const run = monitor({
        mode: "justrow",
        workoutId: null,
        title: "Just Row",
        summaryTotals: totals as never,
      });
      localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
      await open();
      expect(
        screen.getByRole("textbox", { name: "Recording data" }),
      ).toHaveValue(JSON.stringify(run, null, 2));
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("link", { name: "Keep unsaved" }));
      expect(
        await screen.findByRole("heading", { name: "Today" }),
      ).toBeVisible();
      expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe(JSON.stringify(run));
      expect(api).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["empty totals", {}],
    ["missing seconds", { workDistanceMeters: 450 }],
    ["missing meters", { workElapsedSeconds: 120 }],
    ["null seconds", { workElapsedSeconds: null, workDistanceMeters: 450 }],
    ["string meters", { workElapsedSeconds: 120, workDistanceMeters: "450" }],
    ["boolean seconds", { workElapsedSeconds: true, workDistanceMeters: 450 }],
  ])(
    "malformed programmed %s preserves full read-only recording without save",
    async (_label, totals) => {
      const run = monitor({ summaryTotals: totals as never });
      localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
      await open();
      expect(
        screen.getByRole("textbox", { name: "Recording data" }),
      ).toHaveValue(JSON.stringify(run, null, 2));
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
      expect(api).not.toHaveBeenCalled();
    },
  );
  it("a programmed recording without optional machine totals remains saveable", async () => {
    const run = monitor();
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "Today" });
    const body = JSON.parse(api.mock.calls[0]![1].body);
    expect(body).not.toHaveProperty("machineWorkSeconds");
    expect(body).not.toHaveProperty("machineWorkMeters");
    expect(body).not.toHaveProperty("machineSummary");
  });
  it("programmed monitor discard retires the selected key only and returns to Today", async () => {
    const run = monitor();
    const timer = timerFreeRow();
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    localStorage.setItem(RUN_KEY, JSON.stringify(timer));
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    );
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe(JSON.stringify(run));
    act(() =>
      screen.getByRole("button", { name: "Tap again to discard" }).blur(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBe(JSON.stringify(timer));
    expect(api).not.toHaveBeenCalled();
  });
  it.each(["timer", "monitor"] as const)(
    "%s save handler refuses missing type even when the presentation calls it",
    async (source) => {
      const run = source === "timer" ? timerWorkout().run : monitor();
      localStorage.setItem(
        source === "timer" ? RUN_KEY : MONITOR_RUN_KEY,
        JSON.stringify(run),
      );
      library = { state: "ready", workouts: [] };
      // Exercise the handler contract independently of HTML disabled: this
      // presentation-only harness forwards the real summary callback.
      vi.doMock("./PostWorkoutSummary", async (importOriginal) => ({
        ...(await importOriginal<typeof import("./PostWorkoutSummary")>()),
        default: ({
          onSaveWithoutLogging,
        }: {
          onSaveWithoutLogging: () => void;
        }) => (
          <button onClick={onSaveWithoutLogging}>Invoke save callback</button>
        ),
      }));
      await open(reviewLocation(source, run.startedAt));
      await userEvent.click(
        screen.getByRole("button", { name: "Invoke save callback" }),
      );
      expect(api).not.toHaveBeenCalled();
      expect(
        localStorage.getItem(source === "timer" ? RUN_KEY : MONITOR_RUN_KEY),
      ).toBe(JSON.stringify(run));
    },
  );
  it.each(["timer", "monitor"] as const)(
    "numberless %s Just Row keeps its full recording and can discard only that source",
    async (source) => {
      const timer = { ...timerFreeRow(), actuals: {} };
      const pm5 = monitor({
        mode: "justrow",
        workoutId: null,
        title: "Just Row",
      });
      localStorage.setItem(RUN_KEY, JSON.stringify(timer));
      localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(pm5));
      const run = source === "timer" ? timer : pm5;
      await open(reviewLocation(source, run.startedAt));
      expect(
        screen.getByRole("textbox", { name: "Recording data" }),
      ).toHaveValue(JSON.stringify(run, null, 2));
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Discard recording" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Tap again to discard" }),
      );
      expect(
        localStorage.getItem(source === "timer" ? RUN_KEY : MONITOR_RUN_KEY),
      ).toBeNull();
      expect(
        localStorage.getItem(source === "timer" ? MONITOR_RUN_KEY : RUN_KEY),
      ).not.toBeNull();
      expect(api).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "timer discard owns its selected snapshot, including read-only=%s",
    async (damaged) => {
      const { run, draft } = timerWorkout();
      if (damaged) run.phases[0] = null as never;
      localStorage.setItem(RUN_KEY, JSON.stringify(run));
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      await open(reviewLocation("timer", run.startedAt));
      const label = damaged ? "Discard recording" : "DISCARD WITHOUT SAVING";
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(localStorage.getItem(RUN_KEY)).toBe(JSON.stringify(run));
      act(() =>
        screen.getByRole("button", { name: "Tap again to discard" }).blur(),
      );
      expect(screen.getByRole("button", { name: label })).toBeVisible();
      const nextRun = { ...run, startedAt: "newer-key" };
      const nextDraft = { ...draft, title: "Queued next" };
      localStorage.setItem(RUN_KEY, JSON.stringify(nextRun));
      localStorage.setItem(DRAFT_KEY, JSON.stringify(nextDraft));
      await userEvent.click(screen.getByRole("button", { name: label }));
      await userEvent.click(
        screen.getByRole("button", { name: "Tap again to discard" }),
      );
      expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
      expect(localStorage.getItem(RUN_KEY)).toBe(JSON.stringify(nextRun));
      expect(localStorage.getItem(DRAFT_KEY)).toBe(JSON.stringify(nextDraft));
      expect(api).not.toHaveBeenCalled();
    },
  );
  it.each([
    "",
    "?source=",
    "?source=timer&startedAt=",
    "?source=timer&source=monitor&startedAt=key",
    "?source=monitor&startedAt=key&startedAt=other",
    "?source=monitor&startedAt=replaced",
    "?source=timer&startedAt=replaced",
  ])(
    "unavailable selector %s never substitutes either retained source",
    async (search) => {
      const run = monitor();
      const timer = timerFreeRow();
      localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
      localStorage.setItem(RUN_KEY, JSON.stringify(timer));
      await open(`/session/review${search}`);
      expect(
        screen.getByRole("heading", { name: "Recording unavailable" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
      expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe(JSON.stringify(run));
      expect(localStorage.getItem(RUN_KEY)).toBe(JSON.stringify(timer));
      expect(api).not.toHaveBeenCalled();
    },
  );
  it("changing only the query replaces the selected mount snapshot", async () => {
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(monitor()));
    localStorage.setItem(RUN_KEY, JSON.stringify(timerFreeRow()));
    await open();
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("link", { name: "Review timer instead" }),
    );
    expect(screen.getByRole("heading", { name: "Just Row" })).toBeVisible();
    expect(screen.getByText("12:34")).toBeVisible();
    expect(screen.queryByText("450")).not.toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });
  it("a live timer direct link leaves its record open", async () => {
    const run = buildRun(
      buildDraft(workout),
      BASELINES,
      new Date("2026-09-04T13:00:00.000Z"),
    );
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    await open(reviewLocation("timer", run.startedAt));
    expect(
      screen.getByRole("heading", { name: "Recording unavailable" }),
    ).toBeVisible();
    expect(localStorage.getItem(RUN_KEY)).toBe(JSON.stringify(run));
    expect(api).not.toHaveBeenCalled();
  });
  it("memory-only monitor review uses the same retained summary without disk", async () => {
    const store = await import("../monitor/handoffStore");
    const run = monitor();
    const denied = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    store.commit(run.startedAt, null, run);
    denied.mockRestore();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
    await open();
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(screen.getByText("450")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "Today" });
    expect(JSON.parse(api.mock.calls[0]![1].body)).toMatchObject({
      source: "pm5",
      timeSeconds: 120,
      distanceMeters: 450,
    });
    expect(store.read()).toBeNull();
  });
  it("failed save retains its snapshot; retry cannot retire a newer key or the timer", async () => {
    const run = monitor();
    const timer = timerFreeRow();
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    localStorage.setItem(RUN_KEY, JSON.stringify(timer));
    const store = await import("../monitor/handoffStore");
    const receipts: unknown[] = [];
    store.setReceiptChannel((receipt) => receipts.push(receipt));
    api.mockResolvedValueOnce(
      new Response("Server unavailable", { status: 500 }),
    );
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    expect(document.querySelector(".field-error")).toBeVisible();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe(JSON.stringify(run));
    expect(
      receipts.filter((r) => (r as { kind: string }).kind === "retire"),
    ).toHaveLength(0);
    const newer = monitor({ startedAt: "2026-09-04T14:00:00.000Z" });
    store.retire(
      [{ sessionKey: run.startedAt, revision: 0 }],
      "connect-guard-armed",
    );
    store.commit(newer.startedAt, null, newer);
    expect(store.read()?.sessionKey).toBe(newer.startedAt);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "Today" });
    expect(api).toHaveBeenCalledTimes(2);
    expect(JSON.parse(api.mock.calls[1]![1].body)).toMatchObject({
      workoutTitle: "Stationary Front",
      source: "pm5",
      timeSeconds: 120,
      distanceMeters: 450,
    });
    expect(store.read()?.sessionKey).toBe(newer.startedAt);
    expect(localStorage.getItem(RUN_KEY)).toBe(JSON.stringify(timer));
  });
  it("invalid library type still offers an explicit valid type", async () => {
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(monitor()));
    library = {
      state: "ready",
      workouts: [{ ...workout, type: "invalid" as never }],
    };
    await open();
    expect(screen.getByRole("combobox", { name: "Workout type" })).toHaveValue(
      "",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
  it.each(["timer", "monitor"] as const)(
    "Just Row %s review discard is two-tap and source-bound",
    async (source) => {
      const timer = timerFreeRow();
      const pm5 = monitor({
        workoutId: null,
        title: "Just Row",
        mode: "justrow",
        summaryTotals: { workElapsedSeconds: 620, workDistanceMeters: 2480 },
      });
      localStorage.setItem(RUN_KEY, JSON.stringify(timer));
      localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(pm5));
      await open(
        reviewLocation(
          source,
          source === "timer" ? timer.startedAt : pm5.startedAt,
        ),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
      );
      expect(localStorage.getItem(RUN_KEY)).not.toBeNull();
      expect(localStorage.getItem(MONITOR_RUN_KEY)).not.toBeNull();
      const armed = screen.getByRole("button", {
        name: "Tap again to discard",
      });
      expect(armed).toHaveClass("summary-discard-armed");
      act(() => armed.blur());
      await userEvent.click(
        screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Tap again to discard" }),
      );
      expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
      expect(
        localStorage.getItem(source === "timer" ? RUN_KEY : MONITOR_RUN_KEY),
      ).toBeNull();
      expect(
        localStorage.getItem(source === "timer" ? MONITOR_RUN_KEY : RUN_KEY),
      ).not.toBeNull();
      expect(api).not.toHaveBeenCalled();
    },
  );
  it.each(["programmed", "justrow"] as const)(
    "never presents non-finite %s monitor totals as saveable",
    async (mode) => {
      const run = monitor({
        ...(mode === "justrow" ? { mode: "justrow" } : {}),
        summaryTotals: {
          workElapsedSeconds: Infinity,
          workDistanceMeters: 450,
        },
      });
      const store = await import("../monitor/handoffStore");
      const denied = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("quota");
        });
      store.commit(run.startedAt, null, run);
      denied.mockRestore();
      await open();
      expect(
        screen.getByRole("heading", { name: "Can't rebuild this workout." }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
      expect(api).not.toHaveBeenCalled();
      expect(store.read()?.run.summaryTotals?.workElapsedSeconds).toBe(
        Infinity,
      );
    },
  );
  it("an unreadable nested timer phase gets its complete recording instead of a crash", async () => {
    const { run } = timerWorkout();
    run.phases[0] = null as never;
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    await open(reviewLocation("timer", run.startedAt));
    expect(screen.getByRole("textbox", { name: "Recording data" })).toHaveValue(
      JSON.stringify(run, null, 2),
    );
    expect(api).not.toHaveBeenCalled();
  });
  it("reviews a completed workout timer without waiting for library context or guessing its type", async () => {
    const { run } = timerWorkout();
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    library = { state: "loading" };
    await open(reviewLocation("timer", run.startedAt));
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Workout type" }),
      "TR",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "Today" });
    expect(JSON.parse(api.mock.calls[0]![1].body)).toMatchObject({
      workoutId: "retained-workout",
      workoutTitle: "Stationary Front",
      workoutType: "TR",
      source: "timer",
      timeSeconds: 900,
      advancesPlan: false,
    });
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });
  it.each(["unchanged", "replacement-draft", "replacement-run"] as const)(
    "timer save clears only its captured record and %s draft ownership",
    async (replacement) => {
      const { run, draft } = timerWorkout();
      localStorage.setItem(RUN_KEY, JSON.stringify(run));
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      library = { state: "loading" };
      await open(reviewLocation("timer", run.startedAt));
      expect(
        screen.queryByRole("combobox", { name: "Workout type" }),
      ).not.toBeInTheDocument();
      const nextDraft = {
        ...draft,
        createdAt: "2026-09-04T14:00:00.000Z",
        title: "Queued next",
      };
      if (replacement !== "unchanged")
        localStorage.setItem(DRAFT_KEY, JSON.stringify(nextDraft));
      if (replacement === "replacement-run")
        localStorage.setItem(
          RUN_KEY,
          JSON.stringify({ ...run, startedAt: "newer-key" }),
        );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByRole("heading", { name: "Today" });
      expect(JSON.parse(api.mock.calls[0]![1].body)).toMatchObject({
        workoutType: "AT",
        source: "timer",
      });
      expect(localStorage.getItem(DRAFT_KEY)).toBe(
        replacement === "unchanged" ? null : JSON.stringify(nextDraft),
      );
      expect(localStorage.getItem(RUN_KEY)).toBe(
        replacement === "replacement-run"
          ? JSON.stringify({ ...run, startedAt: "newer-key" })
          : null,
      );
    },
  );
  it("Just Row timer save leaves a newer timer snapshot intact", async () => {
    const timer = timerFreeRow();
    localStorage.setItem(RUN_KEY, JSON.stringify(timer));
    await open(reviewLocation("timer", timer.startedAt));
    const newer = { ...timer, startedAt: "newer-key" };
    localStorage.setItem(RUN_KEY, JSON.stringify(newer));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "History" });
    expect(localStorage.getItem(RUN_KEY)).toBe(JSON.stringify(newer));
  });
  it.each(["timer", "monitor"] as const)(
    "opens the selected %s Just Row rather than the newer source",
    async (source) => {
      const timer = timerFreeRow();
      const pm5 = monitor({
        workoutId: null,
        title: "Just Row",
        mode: "justrow",
        summaryTotals: { workElapsedSeconds: 620, workDistanceMeters: 2480 },
      });
      localStorage.setItem(RUN_KEY, JSON.stringify(timer));
      localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(pm5));
      await open(
        reviewLocation(
          source,
          source === "timer" ? timer.startedAt : pm5.startedAt,
        ),
      );
      expect(screen.getByRole("heading", { name: "Just Row" })).toBeVisible();
      expect(
        screen.getByText(source === "timer" ? "12:34" : "10:20"),
      ).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByRole("heading", { name: "History" });
      expect(JSON.parse(api.mock.calls[0]![1].body)).toMatchObject({
        workoutId: null,
        workoutType: null,
        workoutTitle: "Just Row",
        source: source === "timer" ? "timer" : "pm5",
        timeSeconds: source === "timer" ? 754 : 620,
      });
      expect(
        localStorage.getItem(source === "timer" ? MONITOR_RUN_KEY : RUN_KEY),
      ).toBe(JSON.stringify(source === "timer" ? pm5 : timer));
    },
  );
  it.each(["missing", "misaligned", "nested"] as const)(
    "keeps a %s seed recording selectable and copyable without saving or claiming it",
    async (damage) => {
      const run = monitor();
      if (damage === "missing") delete run.logSeed;
      if (damage === "misaligned") run.logSeed!.steps = [];
      if (damage === "nested") run.logSeed!.steps[0] = null as never;
      const bytes = JSON.stringify(run);
      localStorage.setItem(MONITOR_RUN_KEY, bytes);
      const user = userEvent.setup();
      const copied = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue();
      await open();
      expect(
        screen.getByRole("heading", { name: "Can't rebuild this workout." }),
      ).toBeVisible();
      const field = screen.getByRole("textbox", { name: "Recording data" });
      expect(field).toHaveValue(JSON.stringify(run, null, 2));
      expect(field).toHaveAttribute("readonly");
      await user.click(screen.getByRole("button", { name: "Copy recording" }));
      expect(copied).toHaveBeenCalledWith(JSON.stringify(run, null, 2));
      expect(screen.getByRole("status")).toHaveTextContent("Recording copied.");
      copied.mockRejectedValueOnce(new Error("denied"));
      await user.click(screen.getByRole("button", { name: "Copy recording" }));
      expect(screen.getByRole("status")).toHaveTextContent("Couldn't copy");
      expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe(bytes);
      expect(api).not.toHaveBeenCalled();
      await user.click(screen.getByRole("link", { name: "Keep unsaved" }));
      expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
      expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe(bytes);
    },
  );
  it("read-only discard requires two taps and leaves a different-source timer intact", async () => {
    const run = monitor();
    delete run.logSeed;
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    const timer = buildFreeRowRun(new Date("2026-09-04T13:00:00.000Z"));
    localStorage.setItem(RUN_KEY, JSON.stringify(timer));
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Discard recording" }),
    );
    const armed = screen.getByRole("button", { name: "Tap again to discard" });
    expect(localStorage.getItem(MONITOR_RUN_KEY)).not.toBeNull();
    act(() => armed.blur());
    expect(
      screen.getByRole("button", { name: "Discard recording" }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Discard recording" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBe(JSON.stringify(timer));
    expect(api).not.toHaveBeenCalled();
  });
  it.each(["loading", "error", "deleted", "null-id"] as const)(
    "requires a type while library context is %s and preserves retained identity and actuals",
    async (context) => {
      const run = monitor({
        workoutId: context === "null-id" ? null : workout.id,
        title: "Recorded title",
      });
      localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
      library =
        context === "loading"
          ? { state: "loading" }
          : context === "error"
            ? { state: "error", retry: vi.fn() }
            : { state: "ready", workouts: [] };
      const view = await open();
      expect(
        screen.getByRole("heading", { name: "Recorded title" }),
      ).toBeVisible();
      expect(screen.getByText("450")).toBeVisible();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(api).not.toHaveBeenCalled();
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: "Workout type" }),
        "AT",
      );
      library = {
        state: "ready",
        workouts: [{ ...workout, title: "Renamed title", type: "O2" }],
      };
      view.refresh();
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByRole("heading", { name: "Today" });
      expect(JSON.parse(api.mock.calls[0]![1].body)).toMatchObject({
        workoutId: context === "null-id" ? null : "retained-workout",
        workoutTitle: "Recorded title",
        workoutType: "AT",
        source: "pm5",
        timeSeconds: 120,
        distanceMeters: 450,
        avgSplitSeconds: 133.33333333333334,
        endedBy: "finished",
        advancesPlan: false,
      });
      expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
    },
  );
  it.each([undefined, "justrow"] as const)(
    "does not close or claim a directly opened %s monitor",
    async (mode) => {
      const run = monitor({ completedAt: null, ...(mode ? { mode } : {}) });
      const bytes = JSON.stringify(run);
      localStorage.setItem(MONITOR_RUN_KEY, bytes);
      const store = await import("../monitor/handoffStore");
      const receipts: unknown[] = [];
      store.setReceiptChannel((receipt) => receipts.push(receipt));
      await open();
      expect(
        screen.getByRole("heading", { name: "Recording unavailable" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
      expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe(bytes);
      expect(api).not.toHaveBeenCalled();
      expect(
        receipts.filter((r) => (r as { kind: string }).kind === "claim"),
      ).toHaveLength(0);
      const { read } = await import("../monitor/handoffStore");
      expect(read()?.run.completedAt).toBeNull();
      await userEvent.click(
        screen.getByRole("link", { name: "Back to Today" }),
      );
      expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    },
  );
});
